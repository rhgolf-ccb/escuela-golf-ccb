-- Suspensión de una sesión a última hora (tormenta, campo cerrado).
--
-- Lo que pasaba hasta hoy: el coordinador escribía el aviso a mano en el grupo
-- de WhatsApp y la app seguía mostrando la clase como si nada — las familias
-- que no leyeran el grupo llegaban al club igual, y la sesión seguía ocupando
-- cupo.
--
-- La sesión no se borra: se marca. Borrarla se llevaría por delante las
-- reservas y la asistencia, y el día que haya que reponer la clase no quedaría
-- ni rastro de que existió.
alter table sesiones_semana
  add column if not exists suspendida        boolean not null default false,
  add column if not exists motivo_suspension text,
  add column if not exists suspendida_at     timestamptz;

comment on column sesiones_semana.suspendida is
  'Clase cancelada a última hora. La sesión se conserva con sus reservas; las familias la ven marcada y no pueden inscribirse.';

-- Nadie se inscribe a una clase suspendida. Va en la base y no solo en la
-- pantalla porque las familias escriben `reservas` con la llave publicable.
create or replace function public.reservas_sesion_suspendida()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (select 1 from sesiones_semana s where s.id = new.sesion_id and s.suspendida) then
    raise exception 'Esta clase está suspendida. Escribe al coordinador.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists reservas_no_suspendida on reservas;
create trigger reservas_no_suspendida
  before insert on reservas
  for each row execute function public.reservas_sesion_suspendida();
