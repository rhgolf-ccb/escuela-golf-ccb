-- La meta semanal de asistencia deja de ser solo de Competencia.
--
-- Desde nov-2026 el club mide también a los grupos por edad contra una meta:
--   · Birdies y Águilas: 2 clases por semana = 100 %.
--   · Albatros: 3 clases por semana = 100 % (igual que Competencia).
--   · +14 y Damas: sin meta, siguen contra lo reservado.
--
-- Misma regla que lib/asistencia-meta.ts (si cambia una, cambia la otra):
--   · Cuentan las sesiones del plan del alumno en el mes en curso (Birdies →
--     birdies; Águilas y Albatros → juvenil; Competencia → competencia).
--   · Meta de cada semana = sesiones dictadas esa semana, con tope en la meta
--     del grupo. Las que todavía no pasaron (fecha de Bogotá) no cuentan.
--   · Nuevo: una sesión suspendida no se dictó y no suma meta. Antes sí sumaba
--     en Competencia y castigaba a todo el grupo por una tormenta.
--   · Solo semanas desde la fecha de matrícula; solo alumnos activos.
--
-- El grupo por edad se calcula aquí con el mismo corte que lib/grupos.ts
-- (calcularGrupo): ≤5 Birdies, ≤8 Águilas, ≤12 Albatros, resto +14;
-- grupo_activo manda para Competencia y Damas.
--
-- Columnas nuevas al final (meta_semanal, meta_asistencia, presentes_meta) y
-- las viejas (meta_competencia, presentes_competencia) se dejan igual para no
-- romper la versión de la app que esté publicada mientras se despliega la
-- nueva. Se pueden quitar en una migración posterior.

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
),
sesiones_dictadas as (
  select p.tipo_plan, p.semana_inicio, s.id as sesion_id
  from planes_semanales p
  join sesiones_semana s on s.plan_id = p.id
  cross join hoy
  where p.semana_inicio >= date_trunc('month', hoy.dia)::date
    and s.fecha <= hoy.dia
    and not s.suspendida
),
semanas_plan as (
  select tipo_plan, semana_inicio, count(*)::int as dictadas
  from sesiones_dictadas
  group by tipo_plan, semana_inicio
),
grupo_alumno as (
  select s.id as student_id, g.grupo,
    case g.grupo
      when 'Birdies' then 'birdies'
      when 'Águilas' then 'juvenil'
      when 'Albatros' then 'juvenil'
      when 'Competencia' then 'competencia'
    end as tipo_plan,
    case g.grupo
      when 'Birdies' then 2
      when 'Águilas' then 2
      when 'Albatros' then 3
      when 'Competencia' then 3
    end as meta_semanal
  from students s
  cross join hoy
  cross join lateral (
    select case
      when s.grupo_activo = 'Competencia' then 'Competencia'
      when s.grupo_activo = 'Damas' then 'Damas'
      when s.birth_date is null then case when lower(s.gender) = 'femenino' then 'Damas' end
      when date_part('year', age(hoy.dia, s.birth_date)) <= 5 then 'Birdies'
      when date_part('year', age(hoy.dia, s.birth_date)) <= 8 then 'Águilas'
      when date_part('year', age(hoy.dia, s.birth_date)) <= 12 then 'Albatros'
      else '+14'
    end as grupo
  ) g
)
select
  s.id as student_id,
  coalesce(a.presentes, 0) as presentes,
  coalesce(a.ausentes, 0) as ausentes,
  (case when se.n > 0 then 1 else 0 end)
  + (case when pe.n > 0 then 1 else 0 end)
  + (case when np.n > 0 then 1 else 0 end) as tests,
  mc.meta as meta_competencia,
  pc.presentes as presentes_competencia,
  case when s.status = 'activo' then ga.meta_semanal end as meta_semanal,
  coalesce(ma.meta, 0) as meta_asistencia,
  coalesce(pm.presentes, 0) as presentes_meta
from students s
join grupo_alumno ga on ga.student_id = s.id
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
) pc on true
left join lateral (
  select sum(least(ga.meta_semanal, w.dictadas))::int as meta
  from semanas_plan w
  where ga.meta_semanal is not null
    and s.status = 'activo'
    and w.tipo_plan = ga.tipo_plan
    and (s.enrollment_date is null or w.semana_inicio >= s.enrollment_date)
) ma on true
left join lateral (
  select count(*)::int as presentes
  from reservas r
  join sesiones_dictadas sd on sd.sesion_id = r.sesion_id
  where r.estudiante_id = s.id
    and r.asistio
    and ga.meta_semanal is not null
    and s.status = 'activo'
    and sd.tipo_plan = ga.tipo_plan
    and (s.enrollment_date is null or sd.semana_inicio >= s.enrollment_date)
) pm on true;

comment on view student_metrics is
  'Por alumno: asistencia cruda (presentes/ausentes, sin contar reservas sin marcar), tests presentes (0-3) y, para los grupos con meta semanal (Birdies y Águilas 2, Albatros y Competencia 3), asistencia del mes contra esa meta (presentes_meta sobre meta_asistencia; meta_semanal null = grupo sin meta). meta_competencia/presentes_competencia quedan por compatibilidad. Fechas en hora de Bogotá.';
