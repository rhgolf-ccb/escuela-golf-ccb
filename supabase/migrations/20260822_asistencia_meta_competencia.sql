-- Asistencia de Competencia medida contra una meta, no contra lo que reservó.
--
-- El resto de la escuela se mide con presentes / (presentes + ausentes): si el
-- alumno reservó dos clases y fue a las dos, tiene 100 %. En Competencia eso no
-- dice nada, porque ahí lo que se quiere medir es cuánto viene, no si cumple lo
-- que prometió.
--
-- La semana de Competencia tiene 4 sesiones, pero venir a las 4 no lo logra
-- nadie: la meta del club son 3 por semana, o sea 12 en un mes de 4 semanas, y
-- eso es el 100 %. De ahí salen los ajustes:
--   · Semana con festivo o sin clase: la meta de esa semana es el número de
--     sesiones que realmente se dictaron, con tope de 3. Una semana sin
--     programación no suma meta y por lo tanto no castiga a nadie.
--   · Sesiones de esta semana que todavía no han pasado no cuentan todavía
--     (fecha <= current_date): si contaran, el lunes todos estarían en 0 %.
--   · Alumno matriculado a mitad de mes: solo cuentan las semanas cuyo lunes
--     cae en su fecha de matrícula o después.
--
-- Ventana: el mes en curso. Una semana que arranca en el mes anterior y termina
-- en este cuenta para el mes anterior — se reparte por el lunes del plan, que es
-- como está guardada la programación.
--
-- Se devuelven los dos números crudos (presentes y meta), no el porcentaje: con
-- meta = 0 no hay porcentaje que mostrar, y esa diferencia la decide la
-- interfaz igual que con presentes/ausentes.

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
    and (s.enrollment_date is null or w.semana_inicio >= s.enrollment_date)
) mc on true
left join lateral (
  select count(*)::int as presentes
  from reservas r
  join sesiones_comp sc on sc.sesion_id = r.sesion_id
  where r.estudiante_id = s.id
    and r.asistio
    and s.grupo_activo = 'Competencia'
    and (s.enrollment_date is null or sc.semana_inicio >= s.enrollment_date)
) pc on true;

comment on view student_metrics is
  'Por alumno: asistencia cruda (presentes/ausentes, sin contar reservas sin marcar), tests presentes (0-3) y, solo para Competencia, asistencia del mes contra la meta de 3 sesiones por semana (presentes_competencia sobre meta_competencia).';
