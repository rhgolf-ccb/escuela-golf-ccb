-- Métricas por alumno para el listado de Alumnos: asistencia y tests.
--
-- El módulo muestra estos dos indicadores para 1.022 alumnos. Calcularlos con
-- una consulta por alumno serían 1.022 consultas, y traerse las tablas crudas
-- para sumarlas en el navegador tampoco sirve: `reservas` crece con cada clase
-- de cada alumno y PostgREST corta en 1.000 filas sin avisar, así que los
-- porcentajes empezarían a salir mal en silencio a mitad de temporada.
--
-- La vista agrega en Postgres y devuelve una fila por alumno.
--
-- ASISTENCIA: presentes sobre (presentes + ausentes). Las reservas con
-- asistio = null son las que nadie marcó todavía y NO entran al denominador —
-- por eso se devuelven los dos conteos crudos y no un porcentaje: un alumno con
-- 0 y 0 no tiene 0 % de asistencia, no tiene datos, y esa diferencia se decide
-- en la interfaz.
--
-- TESTS: cuántos de los tres existen (evaluación técnica, evaluación física,
-- nota del profesor). Cuenta la existencia, no la cantidad: tres evaluaciones
-- técnicas y ninguna física siguen siendo 1 de 3.
--
-- security_invoker: la vista se consulta con los permisos de quien la llama, no
-- con los del dueño, para que las policies de RLS de las tablas de abajo sigan
-- aplicando igual que si se consultaran directo.

create or replace view student_metrics
with (security_invoker = true) as
select
  s.id as student_id,
  coalesce(a.presentes, 0) as presentes,
  coalesce(a.ausentes, 0) as ausentes,
  (case when se.n > 0 then 1 else 0 end)
  + (case when pe.n > 0 then 1 else 0 end)
  + (case when np.n > 0 then 1 else 0 end) as tests
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
left join lateral (select count(*) as n from notas_profesor n2      where n2.alumno_id  = s.id) np on true;

comment on view student_metrics is
  'Asistencia (presentes/ausentes, sin contar reservas sin marcar) y tests presentes (0-3) por alumno. Una fila por alumno.';
