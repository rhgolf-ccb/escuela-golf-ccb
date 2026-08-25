-- Corrección de 20260824_lectura_acotada_familias.sql: el padrón siguió abierto.
--
-- Aquella migración creaba la policy de lectura de `students` pero solo borraba
-- las viejas por nombre (students_lectura / students_open_access). Las policies
-- permisivas se suman entre sí: bastaba con que la anterior se llamara de otra
-- forma para que siguiera dejando pasar todo. Verificado después de aplicarla —
-- una cuenta de padre seguía leyendo las 1.019 fichas.
--
-- Aquí se borran todas las que tenga la tabla, sin importar cómo se llamen, y
-- se activa RLS explícitamente: si la tabla la tuviera desactivada, las
-- policies no se evalúan siquiera y el resultado sería el mismo.
alter table public.students enable row level security;

do $$
declare pol text;
begin
  for pol in
    select polname from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'students'
  loop
    execute format('drop policy %I on public.students', pol);
  end loop;
end;
$$;

-- staff: todo. Familia de Competencia: sus hijos + el padrón de su grupo, que
-- es lo que /alumnos les muestra. padre_otros: solo sus hijos.
create policy students_lectura on public.students
  for select using (
    es_staff()
    or es_mi_alumno(id)
    or (es_familia_competencia() and grupo_activo = 'Competencia')
  );

create policy students_escritura_staff on public.students
  for all using (es_staff()) with check (es_staff());
