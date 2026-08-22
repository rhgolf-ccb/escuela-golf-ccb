-- Ventana de reservas de las familias de Competencia + cupo de 12.
--
-- La regla está escrita dos veces a propósito: en lib/reservas-ventana.ts, para
-- que la pantalla del padre sepa pintar el botón, y aquí, para que la regla no
-- dependa del navegador. `reservas` tiene RLS abierta (reservas_open_access) y
-- el cliente escribe con la llave publicable: sin este trigger, cualquiera con
-- la consola abierta reserva un sábado un jueves. Si cambia una, cambia la otra.
--
-- Reglas (hora de Bogotá, que es UTC-5 fijo):
--   · Días reservables en línea: martes, miércoles, jueves y sábado.
--   · Abre el lunes de esa misma semana a las 11:00.
--   · Martes/miércoles/jueves cierran 2 h antes de la sesión.
--   · El sábado cierra el miércoles a las 17:00 — el jueves a primera hora se
--     abre la agenda de profesores y hay que bloquearlos con el número cerrado.
--   · Cancelar exige 12 h de anticipación; dentro de ese margen la reserva se
--     queda en pie y se cobra.
--   · Sin lista de espera para las familias: con el cupo lleno no entra nadie
--     más (el staff sí puede seguir metiendo gente en espera desde su módulo).
--
-- El staff no pasa por ninguna de estas reglas: programa y corrige a mano.

-- ── Cupo: 12 niños por sesión ──────────────────────────────────────────────
alter table sesiones_semana alter column cupo_maximo set default 12;

-- Solo las que siguen en el valor por defecto viejo, y nunca por debajo de lo
-- que ya está confirmado: bajarle el cupo a una sesión con 14 inscritos dejaría
-- una sesión sobrevendida en silencio.
update sesiones_semana s
set cupo_maximo = 12
where s.cupo_maximo = 15
  and (select count(*) from reservas r where r.sesion_id = s.id and r.estado = 'confirmado') <= 12;

-- ── Guarda de ventana ──────────────────────────────────────────────────────
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

  -- Una familia solo reserva para los alumnos vinculados a su cuenta.
  if not exists (
    select 1 from user_estudiantes ue
    where ue.user_id = auth.uid() and ue.estudiante_id = v_estudiante
  ) then
    raise exception 'Solo puedes reservar para los alumnos vinculados a tu cuenta.'
      using errcode = 'check_violation';
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
  'Ventana de reservas de las familias: días, apertura del lunes 11:00, cierre (2 h antes entre semana / miércoles 17:00 el sábado), 12 h para cancelar y tope de cupo. El staff no pasa por aquí.';

drop trigger if exists reservas_ventana on reservas;
create trigger reservas_ventana
  before insert or delete on reservas
  for each row execute function public.reservas_ventana_guard();
