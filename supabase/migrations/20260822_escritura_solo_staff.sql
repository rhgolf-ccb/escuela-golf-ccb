-- Escritura solo para el staff en el contenido que ahora ven las familias.
--
-- Hasta hoy estas tablas tenían una sola policy "open access" (using true /
-- with check true): cualquier sesión con la llave publicable podía escribir.
-- Mientras el único que entraba era el staff daba igual. Con las cuentas de
-- Competencia dentro de Alumnos, Drills, Físico y Staff, esa misma llave viaja
-- al navegador de un papá: sin esto, un `delete` desde la consola se lleva los
-- 160 drills o las notas de los profesores.
--
-- La lectura sigue abierta — es justamente lo que se les está dando. Lo que se
-- cierra es insertar, actualizar y borrar.
--
-- No rompe nada del staff: los módulos escriben con la sesión del profesor o
-- coordinador (pasan es_staff()), y las rutas de API escriben con la llave de
-- servicio, que se salta RLS por completo.
--
-- `reservas` NO entra aquí: las familias sí escriben ahí, y sus reglas las pone
-- el trigger de 20260822_reservas_ventana.sql.

create or replace function public.es_staff()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select current_user_rol() = any (array[
    'coordinador'::app_rol, 'director'::app_rol,
    'profesor'::app_rol, 'administrativo'::app_rol
  ]);
$$;

comment on function public.es_staff() is
  'true si el usuario de la petición tiene rol de staff. Base de las policies de escritura.';

do $$
declare
  t text;
  tablas text[] := array[
    'drills', 'ejercicios_fisicos', 'staff_directorio',
    'notas_profesor', 'hitos', 'swing_evaluations', 'physical_evaluations',
    'progreso_checks', 'trackman_sessions',
    'planes_semanales', 'sesiones_semana'
  ];
  pol text;
begin
  foreach t in array tablas loop
    -- Fuera las policies viejas de acceso abierto, sean como se llamen.
    for pol in
      select polname from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t
    loop
      execute format('drop policy %I on public.%I', pol, t);
    end loop;

    execute format(
      'create policy %I on public.%I for select using (true)',
      t || '_lectura', t);
    execute format(
      'create policy %I on public.%I for all using (es_staff()) with check (es_staff())',
      t || '_escritura_staff', t);
  end loop;
end;
$$;
