-- La meta de Competencia solo aplica a alumnos activos.
--
-- 20260822_asistencia_meta_competencia.sql calculaba la meta mirando solo
-- grupo_activo, así que un alumno retirado seguía apareciendo con meta 3 por
-- semana y 0 asistencias. En Reportes no se notaba porque esa pantalla parte
-- del padrón activo, pero cualquier consulta directa a la vista veía un grupo
-- de Competencia inflado — 41 alumnos donde hay 25 — y un porcentaje hundido
-- por gente que ya no está en la escuela.
--
-- El filtro va solo en los dos laterales de Competencia, no en la vista entera:
-- presentes/ausentes y tests son historia del alumno y siguen siendo válidos
-- después de que se retira. Lo que no tiene sentido es cobrarle una meta.
--
-- El resto de la definición es idéntica a la migración anterior; se repite
-- entera porque create or replace view no admite parches.

create or replace view student_metrics
with (security_invoker = true) as
with sesiones_comp as (
  select p.semana_inicio, s.id as sesion_id
  from planes_semanales p
  join sesiones_semana s on s.plan_id = p.id
  where p.tipo_plan = 'competencia'
    and p.semana_inicio >= date_trunc('month', current_date)::date
    and s.fecha <= current_date
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
  'Por alumno: asistencia cruda (presentes/ausentes, sin contar reservas sin marcar), tests presentes (0-3) y, solo para alumnos activos de Competencia, asistencia del mes contra la meta de 3 sesiones por semana (presentes_competencia sobre meta_competencia).';
