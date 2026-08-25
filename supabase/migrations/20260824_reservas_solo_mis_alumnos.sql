-- Una familia solo toca las reservas de sus propios alumnos.
--
-- El trigger de 20260822_reservas_ventana.sql sí tenía la comprobación de
-- vínculo, pero colocada después del `return old` de la rama DELETE: en un
-- borrado nunca llegaba a ejecutarse. Como `reservas` tiene RLS abierta y el
-- navegador escribe con la llave publicable, desde la consola se podía cancelar
-- la reserva de cualquier niño mientras faltaran más de 12 horas. Y el trigger
-- es `before insert or delete`, así que UPDATE no pasaba por ninguna regla:
-- también se podía reescribir el estado de una reserva ajena. Ambas cosas
-- verificadas contra la base real con una cuenta de padre.
--
-- Se corrigen las tres piezas: el orden en el trigger, las policies de RLS y la
-- única actualización legítima que hacía la familia (ascender la lista de
-- espera al cancelar), que pasa a una función controlada.

-- ── Ascenso de la lista de espera ──────────────────────────────────────────
-- La pantalla del padre ascendía al primero en espera con un update directo
-- sobre una reserva que no es suya. Es una operación legítima, pero no puede
-- depender de que la tabla esté abierta: se encapsula aquí y el navegador solo
-- puede pedir "reordena esta sesión", nunca escribir la fila.
create or replace function public.promover_lista_espera(p_sesion_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cupo        int;
  v_confirmados int;
  r             record;
  i             int := 1;
begin
  select cupo_maximo into v_cupo from sesiones_semana where id = p_sesion_id;
  if not found then return; end if;

  select count(*) into v_confirmados
  from reservas where sesion_id = p_sesion_id and estado = 'confirmado';

  -- Solo asciende si de verdad quedó un puesto libre.
  if v_confirmados < v_cupo then
    update reservas
    set estado = 'confirmado', posicion_espera = null
    where id = (
      select id from reservas
      where sesion_id = p_sesion_id and estado = 'en_espera'
      order by posicion_espera nulls last, created_at
      limit 1
    );
  end if;

  -- Y renumera a los que siguen esperando, para que no queden huecos.
  for r in
    select id from reservas
    where sesion_id = p_sesion_id and estado = 'en_espera'
    order by posicion_espera nulls last, created_at
  loop
    update reservas set posicion_espera = i where id = r.id;
    i := i + 1;
  end loop;
end;
$$;

comment on function public.promover_lista_espera(uuid) is
  'Asciende al primero de la lista de espera de una sesión si quedó cupo y renumera el resto. Lo llama la pantalla de la familia al cancelar.';

revoke all on function public.promover_lista_espera(uuid) from public;
grant execute on function public.promover_lista_espera(uuid) to authenticated;

-- ── Policies ───────────────────────────────────────────────────────────────
do $$
declare pol text;
begin
  for pol in
    select polname from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'reservas'
  loop
    execute format('drop policy %I on public.reservas', pol);
  end loop;
end;
$$;

-- La lectura sigue abierta: la pantalla de la familia necesita contar cuántos
-- confirmados lleva cada sesión para pintar el cupo. Lo que se ve son filas con
-- ids, no nombres — el padrón lo gobierna la policy de `students`.
create policy reservas_lectura on public.reservas
  for select using (true);

create policy reservas_escritura_staff on public.reservas
  for all using (es_staff()) with check (es_staff());

-- La familia inscribe y cancela, y solo a sus propios alumnos. No hay policy de
-- update para ella: la única que necesitaba es promover_lista_espera().
create policy reservas_familia_insert on public.reservas
  for insert with check (es_mi_alumno(estudiante_id));

create policy reservas_familia_delete on public.reservas
  for delete using (es_mi_alumno(estudiante_id));

-- ── Trigger: la comprobación de vínculo pasa a ejecutarse también en DELETE ──
create or replace function public.reservas_ventana_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rol         app_rol := current_user_rol();
  v_sesion_id   uuid;
  v_estudiante  uuid;
  v_ses         record;
  v_ahora       timestamp;
  v_inicio      timestamp;
  v_lunes       date;
  v_abre        timestamp;
  v_cierra      timestamp;
  v_confirmados int;
begin
  -- Sin rol (service role, jobs) o con rol de staff no aplica la ventana.
  if v_rol is null
     or v_rol in ('coordinador', 'director', 'profesor', 'administrativo') then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'DELETE' then
    v_sesion_id  := old.sesion_id;
    v_estudiante := old.estudiante_id;
  else
    v_sesion_id  := new.sesion_id;
    v_estudiante := new.estudiante_id;
  end if;

  -- Una familia solo toca las reservas de los alumnos vinculados a su cuenta.
  -- Va antes que nada: cuando esto vivía después de la rama de DELETE, un
  -- borrado no llegaba nunca a comprobarlo.
  if not es_mi_alumno(v_estudiante) then
    raise exception 'Solo puedes reservar o cancelar para los alumnos vinculados a tu cuenta.'
      using errcode = 'check_violation';
  end if;

  select s.fecha, s.dia_semana, s.hora_inicio, s.cupo_maximo
    into v_ses
  from sesiones_semana s
  where s.id = v_sesion_id;

  -- Sesión borrada a mitad de camino: que lo resuelva la llave foránea.
  if not found then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  v_ahora  := now() at time zone 'America/Bogota';
  v_inicio := v_ses.fecha + v_ses.hora_inicio;

  if tg_op = 'DELETE' then
    if v_ahora > v_inicio - interval '12 hours' then
      raise exception 'Ya no se puede cancelar: faltan menos de 12 horas y la sesión se cobra.'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if v_ses.dia_semana not in ('martes', 'miercoles', 'jueves', 'sabado') then
    raise exception 'Esta sesión no se reserva en línea.'
      using errcode = 'check_violation';
  end if;

  v_lunes := date_trunc('week', v_ses.fecha)::date;
  v_abre  := v_lunes + time '11:00';
  if v_ses.dia_semana = 'sabado' then
    v_cierra := (v_lunes + 2) + time '17:00';
  else
    v_cierra := v_inicio - interval '2 hours';
  end if;

  if v_ahora < v_abre then
    raise exception 'El cupo de esa semana abre el lunes a las 11:00 a. m.'
      using errcode = 'check_violation';
  end if;

  if v_ahora > v_cierra then
    if v_ses.dia_semana = 'sabado' then
      raise exception 'El cupo del sábado se cierra el miércoles a las 5:00 p. m.'
        using errcode = 'check_violation';
    else
      raise exception 'El cupo se cierra 2 horas antes de la sesión.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Dos padres pulsando "Inscribir" a la vez leerían el mismo conteo y ambos
  -- pasarían el tope. El lock por sesión los serializa dentro de la transacción.
  perform pg_advisory_xact_lock(hashtextextended(v_sesion_id::text, 0));

  select count(*) into v_confirmados
  from reservas r
  where r.sesion_id = v_sesion_id and r.estado = 'confirmado';

  if new.estado = 'confirmado' and v_confirmados >= v_ses.cupo_maximo then
    raise exception 'Cupo lleno (% niños). Escribe al coordinador.', v_ses.cupo_maximo
      using errcode = 'check_violation';
  end if;

  -- La lista de espera es una herramienta del staff, no de la familia.
  if new.estado <> 'confirmado' then
    raise exception 'Con el cupo lleno no se puede inscribir. Escribe al coordinador.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.reservas_ventana_guard() is
  'Ventana de reservas de las familias: vínculo con el alumno, días, apertura del lunes 11:00, cierre (2 h antes entre semana / miércoles 17:00 el sábado), 12 h para cancelar y tope de cupo. El staff no pasa por aquí.';

drop trigger if exists reservas_ventana on reservas;
create trigger reservas_ventana
  before insert or delete on reservas
  for each row execute function public.reservas_ventana_guard();
