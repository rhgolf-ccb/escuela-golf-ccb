-- La meta de Competencia se calcula con la fecha de Bogotá, no con la de UTC.
--
-- `current_date` en Postgres es la fecha del servidor, que corre en UTC. Bogotá
-- va cinco horas atrás, así que a partir de las 7:00 p. m. hora local el
-- servidor ya está en el día siguiente. Consecuencia: la clase de mañana
-- entraba en `s.fecha <= current_date` y le sumaba meta a todo el grupo antes
-- de dictarse.
--
-- Verificado el 25 de agosto de 2026 a las 8 p. m. de Bogotá: la vista daba
-- meta 5 para el mes (3 de la semana del 17 + 2 de la del 24) cuando solo se
-- habían dictado 4 sesiones — la cuarta era la del 26, que aún no ocurría. En
-- pantalla, Alumnos mostraba 3/5 = 60 % a alumnos que iban 3 de 4 = 75 %, y no
-- cuadraba con Reportes, que sí calcula con la fecha local del navegador.
--
-- El mismo desfase afecta al corte del mes: el 31 a las 8 p. m. el servidor ya
-- está en el mes siguiente y la ventana se movería un día antes de tiempo.
--
-- Solo cambia el cálculo de la fecha; el resto de la vista queda igual que en
-- 20260822_asistencia_meta_competencia.sql + 20260822_meta_competencia_solo_activos.sql.

create or replace view student_metrics
with (security_invoker = true) as
with hoy as (
  select (now() at time zone 'America/Bogota')::date as dia
),
sesiones_comp as (
  select p.semana_inicio, s.id as sesion_id
  from planes_semanales p
  join sesiones_semana s on s.plan_id = p.id
  cross join hoy
  where p.tipo_plan = 'competencia'
    and p.semana_inicio >= date_trunc('month', hoy.dia)::date
    and s.fecha <= hoy.dia
),
semanas_comp as (
  select semana_inicio, least(3, count(*)) as meta
  from sesiones_comp
  group by semana_inicio
)
select
  s.id as student_id,
  coalesce(a.presentes, 0) as presentes,
  coalesce(a.ausentes, 0) as ausentes,
  (case when se.n > 0 then 1 else 0 end)
  + (case when pe.n > 0 then 1 else 0 end)
  + (case when np.n > 0 then 1 else 0 end) as tests,
  mc.meta as meta_competencia,
  pc.presentes as presentes_competencia
from students s
left join (
  select estudiante_id,
         count(*) filter (where asistio)       as presentes,
         count(*) filter (where not asistio)   as ausentes
  from reservas
  where asistio is not null
  group by estudiante_id
) a on a.estudiante_id = s.id
left join lateral (select count(*) as n from swing_evaluations e    where e.student_id = s.id) se on true
left join lateral (select count(*) as n from physical_evaluations e where e.student_id = s.id) pe on true
left join lateral (select count(*) as n from notas_profesor n2      where n2.alumno_id  = s.id) np on true
left join lateral (
  select coalesce(sum(w.meta), 0)::int as meta
  from semanas_comp w
  where s.grupo_activo = 'Competencia'
    and s.status = 'activo'
    and (s.enrollment_date is null or w.semana_inicio >= s.enrollment_date)
) mc on true
left join lateral (
  select count(*)::int as presentes
  from reservas r
  join sesiones_comp sc on sc.sesion_id = r.sesion_id
  where r.estudiante_id = s.id
    and r.asistio
    and s.grupo_activo = 'Competencia'
    and s.status = 'activo'
    and (s.enrollment_date is null or sc.semana_inicio >= s.enrollment_date)
) pc on true;

comment on view student_metrics is
  'Por alumno: asistencia cruda (presentes/ausentes, sin contar reservas sin marcar), tests presentes (0-3) y, solo para Competencia activa, asistencia del mes contra la meta de 3 sesiones por semana (presentes_competencia sobre meta_competencia). Las fechas se calculan en hora de Bogotá.';
