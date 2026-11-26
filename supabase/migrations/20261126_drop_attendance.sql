-- Borra la tabla `attendance`, que quedó muerta.
--
-- La asistencia real vive en `reservas.asistio` (true = presente, false =
-- ausente, null = sin marcar), escrita desde Pasar asistencia y Reportes. Desde
-- ago-2026 el dashboard tampoco lee `attendance`.
--
-- Revisado el 2026-11-26 antes de escribir esto:
--   · Ningún archivo de app/, components/ ni lib/ consulta la tabla (solo la
--     nombra un comentario del dashboard).
--   · Ninguna vista, función, trigger ni llave foránea de la base depende de
--     ella.
--   · RLS activo sin ninguna política: ni la app podía leerla.
--   · 227 filas, la última del 2026-06-02, con student_id que no cruza con
--     students.id: datos de la carga inicial que nunca se conectaron.
--
-- Sin cascade a propósito: si algo nuevo hubiera empezado a depender de la
-- tabla, la migración falla en vez de llevárselo por delante.

drop table if exists public.attendance;
