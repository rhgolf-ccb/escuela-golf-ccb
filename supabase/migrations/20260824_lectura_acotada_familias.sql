-- Lectura acotada para las cuentas de familia.
--
-- La migración de escritura (20260822_escritura_solo_staff.sql) cerró el
-- insert/update/delete pero dejó la lectura abierta a propósito: era el
-- contenido que se les estaba dando (drills, físico, staff). El problema es que
-- `students` y las evaluaciones quedaron en la misma bolsa, y ahí sí hay datos
-- de otras familias.
--
-- Verificado con una cuenta de padre real: leía las 1.019 fichas del padrón
-- —con los teléfonos y nombres de acudiente que estén cargados— y la
-- evaluación física de un alumno que no era suyo. Hoy hay una sola evaluación
-- en el sistema; el día que los profesores empiecen a cargarlas, cada familia
-- podría leer las de todos.
--
-- Lo que cada quien puede leer a partir de aquí:
--   · staff                    → todo, como siempre.
--   · familia de Competencia   → sus alumnos vinculados + el padrón de
--                                Competencia, que es justo lo que /alumnos les
--                                muestra (nombre, edad, asistencia, tests).
--   · padre_otros              → solo sus alumnos vinculados.
--
-- Las evaluaciones, notas, hitos y demás quedan siempre restringidas a los
-- alumnos vinculados, sin excepción del padrón: el grupo se ve, la ficha no.

-- Un alumno está "a la vista" de la sesión actual si está vinculado a su
-- cuenta. Se aísla en una función para no repetir el exists() en cada policy y
-- para que RLS no vuelva a consultar user_estudiantes con las reglas del
-- llamante (que también tiene RLS).
create or replace function public.es_mi_alumno(p_estudiante uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from user_estudiantes ue
    where ue.user_id = auth.uid() and ue.estudiante_id = p_estudiante
  );
$$;

comment on function public.es_mi_alumno(uuid) is
  'true si el alumno está vinculado a la cuenta de la petición. Base de las policies de lectura de las familias.';

-- `progreso_checks.student_id` es text, no uuid, mientras que todas las demás
-- tablas guardan el id como uuid. Con una sola versión de la función, la policy
-- de esa tabla no compilaba ("function es_mi_alumno(text) does not exist"). Se
-- compara como texto en vez de convertir a uuid: si alguna fila trae un valor
-- que no es un uuid válido, la conversión reventaría la consulta entera.
create or replace function public.es_mi_alumno(p_estudiante text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from user_estudiantes ue
    where ue.user_id = auth.uid() and ue.estudiante_id::text = p_estudiante
  );
$$;

create or replace function public.es_familia_competencia()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select current_user_rol() = any (array[
    'padre_competencia'::app_rol, 'alumno_competencia'::app_rol
  ]);
$$;

-- ── students ───────────────────────────────────────────────────────────────
-- El padrón de Competencia se conserva para las familias de Competencia porque
-- es una pantalla que ya usan (/alumnos). Lo que se corta es el resto de la
-- escuela: 1.019 fichas pasan a ser ~el grupo propio.
drop policy if exists students_lectura on public.students;
drop policy if exists students_open_access on public.students;
drop policy if exists "students_open_access" on public.students;

create policy students_lectura on public.students
  for select using (
    es_staff()
    or es_mi_alumno(id)
    or (es_familia_competencia() and grupo_activo = 'Competencia')
  );

-- Escritura de alumnos: solo staff (no estaba cubierta por la migración del 22).
drop policy if exists students_escritura_staff on public.students;
create policy students_escritura_staff on public.students
  for all using (es_staff()) with check (es_staff());

-- ── Evaluaciones, notas e historial ────────────────────────────────────────
-- Cada tabla apunta al alumno con un nombre distinto (student_id / alumno_id),
-- así que la lista lleva el nombre de la columna al lado. La escritura ya la
-- dejó en staff la migración del 22; aquí solo se reemplaza la lectura abierta.
do $$
declare
  par record;
  tablas record;
begin
  for tablas in
    select * from (values
      ('swing_evaluations',    'student_id'),
      ('physical_evaluations', 'student_id'),
      ('progreso_checks',      'student_id'),
      ('notas_profesor',       'alumno_id'),
      ('hitos',                'alumno_id'),
      ('trackman_sessions',    'alumno_id')
    ) as t(tabla, columna)
  loop
    execute format('drop policy if exists %I on public.%I', tablas.tabla || '_lectura', tablas.tabla);
    execute format(
      'create policy %I on public.%I for select using (es_staff() or es_mi_alumno(%I))',
      tablas.tabla || '_lectura', tablas.tabla, tablas.columna);
  end loop;
end;
$$;
