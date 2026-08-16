-- Mover programación ya guardada sin borrarla y rehacerla.
--
-- Por qué en la base y no en el cliente: borrar el plan arrastra sus sesiones
-- (sesiones_semana.plan_id es ON DELETE CASCADE) y con ellas las reservas
-- (reservas.sesion_id, también CASCADE). Moviendo se conservan los id y las
-- reservas sobreviven. Todo el movimiento tiene que ser atómico: a mitad de
-- camino el plan queda en un estado inconsistente (sesiones en una semana,
-- plan en otra), así que va en una función y se llama con .rpc().
--
-- Constraints que respetan las dos funciones:
--   planes_semanales UNIQUE (semana_inicio, tipo_plan)
--   sesiones_semana  UNIQUE NULLS NOT DISTINCT (plan_id, fecha, hora_inicio)
--   sesiones_semana.dia_semana CHECK: martes..domingo (NO admite lunes)

-- ── A) Mover una semana completa ────────────────────────────────────────────
create or replace function public.mover_plan_semana(
  p_plan_id uuid,
  p_nueva_semana date,
  p_conflicto text default null   -- null = solo consultar, 'cancelar', 'reemplazar'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan       planes_semanales%rowtype;
  v_destino    planes_semanales%rowtype;
  v_delta      int;
  v_omitidas   jsonb;
  v_movidas    int;
  v_ses_dest   int;
  v_res_dest   int;
begin
  select * into v_plan from planes_semanales where id = p_plan_id;
  if not found then
    return jsonb_build_object('error', 'No existe la programación que se quiere mover.');
  end if;

  v_delta := p_nueva_semana - v_plan.semana_inicio;
  if v_delta = 0 then
    return jsonb_build_object('error', 'La programación ya está en esa semana.');
  end if;
  -- semana_inicio siempre es lunes: un desfase que no sea múltiplo de 7 movería
  -- las sesiones a otro día de la semana y rompería dia_semana.
  if v_delta % 7 <> 0 then
    return jsonb_build_object('error', 'Solo se puede mover de lunes a lunes: el desfase debe ser múltiplo de 7 días.');
  end if;

  select * into v_destino
    from planes_semanales
   where semana_inicio = p_nueva_semana and tipo_plan = v_plan.tipo_plan;

  if found then
    if p_conflicto is null then
      -- Todavía no se escribió nada: la UI decide con estos números.
      select count(*) into v_ses_dest from sesiones_semana where plan_id = v_destino.id;
      select count(*) into v_res_dest
        from reservas r join sesiones_semana s on s.id = r.sesion_id
       where s.plan_id = v_destino.id;
      return jsonb_build_object(
        'needs_confirm', true,
        'plan_destino', jsonb_build_object(
          'id', v_destino.id,
          'tema_semanal', v_destino.tema_semanal,
          'sesiones', v_ses_dest,
          'reservas', v_res_dest));
    elsif p_conflicto = 'cancelar' then
      return jsonb_build_object('cancelado', true);
    elsif p_conflicto = 'reemplazar' then
      -- Cascada: se lleva las sesiones del plan destino y sus reservas. La UI ya
      -- mostró cuántas son antes de llegar acá.
      delete from planes_semanales where id = v_destino.id;
    else
      return jsonb_build_object('error', 'El valor de conflicto debe ser "cancelar" o "reemplazar".');
    end if;
  end if;

  -- Las sesiones que caerían en un día sin escuela no se mueven: se informan y
  -- se dejan intactas para que el profesor decida qué hacer con ellas.
  select coalesce(jsonb_agg(o), '[]'::jsonb) into v_omitidas
    from (
      select jsonb_build_object(
               'id', s.id,
               'fecha_actual', s.fecha,
               'fecha_destino', s.fecha + v_delta,
               'dia_semana', s.dia_semana,
               'hora_inicio', s.hora_inicio,
               'motivo', d.motivo) as o
        from sesiones_semana s
        cross join lateral (
          select d.motivo
            from dias_sin_escuela d
           where (s.fecha + v_delta) between d.fecha_inicio and d.fecha_fin
           limit 1) d
       where s.plan_id = p_plan_id
       order by s.fecha, s.hora_inicio
    ) t;

  update sesiones_semana s
     set fecha = s.fecha + v_delta
   where s.plan_id = p_plan_id
     and not exists (
       select 1 from dias_sin_escuela d
        where (s.fecha + v_delta) between d.fecha_inicio and d.fecha_fin);
  get diagnostics v_movidas = row_count;

  update planes_semanales set semana_inicio = p_nueva_semana where id = p_plan_id;

  return jsonb_build_object(
    'ok', true,
    'movidas', v_movidas,
    'omitidas', v_omitidas,
    'delta_dias', v_delta,
    'semana_destino', p_nueva_semana);
end;
$$;

-- ── B) Mover un día suelto ──────────────────────────────────────────────────
create or replace function public.mover_sesion_dia(
  p_sesion_id uuid,
  p_nueva_fecha date,
  p_reemplazar boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ses          sesiones_semana%rowtype;
  v_plan         planes_semanales%rowtype;
  v_choque       sesiones_semana%rowtype;
  v_dow          int;
  v_dia          text;
  v_lunes        date;
  v_plan_destino uuid;
  v_plan_creado  boolean := false;
  v_motivo       text;
  v_res_choque   int;
  v_reservas     int;
  v_origen_vacio boolean;
begin
  select * into v_ses from sesiones_semana where id = p_sesion_id;
  if not found then
    return jsonb_build_object('error', 'No existe la sesión que se quiere mover.');
  end if;
  select * into v_plan from planes_semanales where id = v_ses.plan_id;

  if p_nueva_fecha = v_ses.fecha then
    return jsonb_build_object('error', 'La sesión ya está en esa fecha.');
  end if;

  v_dow := extract(isodow from p_nueva_fecha);
  if v_dow = 1 then
    return jsonb_build_object('error', 'Los lunes no hay clase en ningún grupo: elige otro día.');
  end if;
  v_dia := case v_dow
             when 2 then 'martes' when 3 then 'miercoles' when 4 then 'jueves'
             when 5 then 'viernes' when 6 then 'sabado' else 'domingo' end;

  select d.motivo into v_motivo
    from dias_sin_escuela d
   where p_nueva_fecha between d.fecha_inicio and d.fecha_fin
   limit 1;
  if found then
    return jsonb_build_object(
      'error', coalesce(nullif(btrim(v_motivo), ''), 'Ese día está marcado como sin escuela.'),
      'dia_sin_escuela', true);
  end if;

  v_lunes := p_nueva_fecha - (v_dow - 1);

  -- El plan destino se resuelve sin crearlo todavía: si hay choque hay que poder
  -- devolver el 409 sin dejar un plan vacío escrito.
  if v_lunes = v_plan.semana_inicio then
    v_plan_destino := v_plan.id;
  else
    select id into v_plan_destino
      from planes_semanales
     where semana_inicio = v_lunes and tipo_plan = v_plan.tipo_plan;
  end if;

  if v_plan_destino is not null then
    select * into v_choque
      from sesiones_semana
     where plan_id = v_plan_destino
       and fecha = p_nueva_fecha
       and hora_inicio = v_ses.hora_inicio
       and id <> p_sesion_id;
    if found then
      if not coalesce(p_reemplazar, false) then
        select count(*) into v_res_choque from reservas where sesion_id = v_choque.id;
        return jsonb_build_object(
          'needs_confirm', true,
          'sesion_destino', jsonb_build_object(
            'id', v_choque.id,
            'objetivo', v_choque.objetivo,
            'tipo_sesion', v_choque.tipo_sesion,
            'reservas', v_res_choque));
      end if;
      -- Cascada: borra también las reservas de la sesión reemplazada.
      delete from sesiones_semana where id = v_choque.id;
    end if;
  else
    insert into planes_semanales (semana_inicio, tipo_plan, tema_semanal, descripcion_tema, objetivo_mensual, foco_mes)
    values (v_lunes, v_plan.tipo_plan, v_plan.tema_semanal, v_plan.descripcion_tema, v_plan.objetivo_mensual, v_plan.foco_mes)
    returning id into v_plan_destino;
    v_plan_creado := true;
  end if;

  update sesiones_semana
     set fecha = p_nueva_fecha, dia_semana = v_dia, plan_id = v_plan_destino
   where id = p_sesion_id;

  select count(*) into v_reservas from reservas where sesion_id = p_sesion_id;
  -- El plan origen se deja aunque quede vacío: borrarlo aquí sería una sorpresa.
  v_origen_vacio := not exists (select 1 from sesiones_semana where plan_id = v_plan.id);

  return jsonb_build_object(
    'ok', true,
    'fecha', p_nueva_fecha,
    'dia_semana', v_dia,
    'plan_id', v_plan_destino,
    'plan_creado', v_plan_creado,
    'semana_destino', v_lunes,
    'reservas', v_reservas,
    'plan_origen_id', v_plan.id,
    'plan_origen_vacio', v_origen_vacio);
end;
$$;

-- Solo el service_role las ejecuta: la ruta /api/mover-programacion valida staff
-- antes de llamarlas. Sin esto, cualquier cliente anónimo podría mover la
-- programación con un .rpc() directo, porque SECURITY DEFINER ignora las RLS.
revoke all on function public.mover_plan_semana(uuid, date, text) from public, anon, authenticated;
revoke all on function public.mover_sesion_dia(uuid, date, boolean) from public, anon, authenticated;
grant execute on function public.mover_plan_semana(uuid, date, text) to service_role;
grant execute on function public.mover_sesion_dia(uuid, date, boolean) to service_role;
