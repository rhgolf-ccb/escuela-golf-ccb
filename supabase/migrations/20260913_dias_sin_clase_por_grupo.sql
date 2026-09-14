-- Un día sin clase puede ser de un grupo, no siempre de toda la escuela.
--
-- El caso real: un martes Competencia no tiene clase, pero Juvenil y Damas sí.
-- Hasta hoy `dias_sin_escuela` era global — marcarlo apagaba la semana entera
-- para todos —, así que el director no lo marcaba y el día simplemente
-- aparecía vacío en el calendario de las familias. Un día vacío no dice "hoy
-- no hay clase": dice "todavía no han programado", y el lunes siguiente
-- entraban las llamadas preguntando si el niño se perdió algo.
--
-- Lo mismo con los eventos: el sábado de torneo hay actividad y no hay clase,
-- pero solo para el grupo que compite.
--
-- `null` (o arreglo vacío) = toda la escuela, que es como se comportaba antes y
-- es lo que siguen significando las filas que ya existen. No hay backfill: un
-- festivo cargado el año pasado sigue siendo de todos, que es lo correcto.

alter table dias_sin_escuela  add column if not exists grupos text[];
alter table eventos_calendario add column if not exists grupos text[];

comment on column dias_sin_escuela.grupos is
  'Tipos de plan a los que aplica (birdies/juvenil/competencia/damas). NULL o vacío = toda la escuela.';
comment on column eventos_calendario.grupos is
  'Tipos de plan a los que aplica el evento. NULL o vacío = toda la escuela.';

-- Solo se aceptan tipos de plan reales: un typo en el arreglo dejaría el día
-- marcado para un grupo que no existe, y en pantalla se vería como un día sin
-- clase que no le aplica a nadie.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dias_sin_escuela_grupos_check') then
    alter table dias_sin_escuela
      add constraint dias_sin_escuela_grupos_check
      check (grupos is null or grupos <@ array['birdies','juvenil','competencia','damas']::text[]);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'eventos_calendario_grupos_check') then
    alter table eventos_calendario
      add constraint eventos_calendario_grupos_check
      check (grupos is null or grupos <@ array['birdies','juvenil','competencia','damas']::text[]);
  end if;
end $$;
