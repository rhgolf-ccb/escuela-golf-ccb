-- El día especial "Día de putt" no cabía en el check de tipo_sesion.
--
-- Se agregó `dia_putt` como tipo de día en el wizard y en la validación de
-- /api/publish-plan-semanal, pero el CHECK de la tabla se creó desde el panel
-- de Supabase hace tiempo y no incluye el valor: guardar el día fallaba con
-- "violates check constraint sesiones_semana_tipo_sesion_check".
--
-- `dia_putt` es un día completo en el green, y es distinto de `putt`, que es
-- una sola estación de putt dentro de un día normal. Se separan a propósito:
-- si compartieran valor, al reabrir el día para editarlo no habría forma de
-- saber cuál de los dos era, y una sesión vieja de una estación se leería
-- como un día especial.
--
-- La lista es la misma de TIPO_SESION_VALUES en app/api/publish-plan-semanal
-- — la fuente de verdad del vocabulario. Los seis valores que hoy existen en
-- la tabla (juvenil_estaciones, competencia, tiro_largo, putt,
-- damas_estaciones, campo) están todos incluidos.

do $$
declare c record;
begin
  -- Por definición y no solo por nombre: el check pudo quedar con otro nombre
  -- si se recreó a mano en algún momento.
  for c in
    select conname
      from pg_constraint
     where contype = 'c'
       and conrelid = 'sesiones_semana'::regclass
       and pg_get_constraintdef(oid) ilike '%juvenil_estaciones%'
  loop
    execute format('alter table sesiones_semana drop constraint %I', c.conname);
  end loop;
end $$;

-- `not valid` por la misma razón que el check de lugar: valida lo que se
-- escriba de ahora en adelante sin exigir que cada fila vieja encaje.
alter table sesiones_semana
  add constraint sesiones_semana_tipo_sesion_check
  check (tipo_sesion in (
    'tiro_largo', 'juego_corto', 'putt', 'dia_putt', 'campo',
    'test_tecnico', 'test_fisico', 'trabajo_fisico',
    'competencia', 'damas_estaciones', 'juvenil_estaciones',
    'especial', 'campo_pacos', 'campo_infantil'
  )) not valid;
