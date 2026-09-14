-- Los dos putting greens del CCB dejan de ser uno solo.
--
-- Hasta hoy el vocabulario de sitios tenía un único "putting_green", heredado
-- de cuando la escuela solo usaba el de los Fundadores. En la cancha son dos
-- greens distintos, a diez minutos de camino uno del otro: el de los Fundadores
-- y el de Pacos y Fabios. Un padre que lee "Putting Green" en el PDF no sabe a
-- cuál llevar al niño, y el profesor que arma la semana tampoco podía decirlo.
--
-- Todo lo que hoy dice "putting_green" a secas pasa a Fundadores: es el que la
-- biblioteca de drills ya usaba por defecto (drills.lugar nació directamente
-- como 'putting_green_fundadores') y el que la escuela venía usando cuando se
-- escribió ese valor.

-- El check de vocabulario, si existe, bloquearía el UPDATE. Se busca por
-- definición y no por nombre porque el de esta base se creó desde el panel de
-- Supabase y no hay migración que fije cómo se llama.
do $$
declare c record;
begin
  for c in
    select conrelid::regclass as tabla, conname
      from pg_constraint
     where contype = 'c'
       and conrelid in ('sesiones_semana'::regclass, 'drills'::regclass)
       and pg_get_constraintdef(oid) ilike '%putting_green%'
  loop
    execute format('alter table %s drop constraint %I', c.tabla, c.conname);
  end loop;
end $$;

-- ── Columna plana de la sesión ──────────────────────────────────────────────
update sesiones_semana
   set lugar = 'putting_green_fundadores'
 where lugar = 'putting_green';

-- ── Lugares dentro de los JSONB de estaciones ───────────────────────────────
-- El lugar vive por estación (cada estación de un día puede estar en un sitio
-- distinto), así que la columna plana no alcanza: hay que entrar al arreglo.
-- `with ordinality` mantiene el orden de las estaciones al rearmar el arreglo.

-- Juvenil / Birdies — sesion_juvenil.estaciones[]
update sesiones_semana s
   set sesion_juvenil = jsonb_set(
         s.sesion_juvenil,
         '{estaciones}',
         (select jsonb_agg(
                   case when e->>'lugar' = 'putting_green'
                        then jsonb_set(e, '{lugar}', '"putting_green_fundadores"')
                        else e end
                   order by ord)
            from jsonb_array_elements(s.sesion_juvenil->'estaciones') with ordinality as t(e, ord)))
 where s.sesion_juvenil->>'tipo' = 'estaciones'
   and s.sesion_juvenil->'estaciones' @> '[{"lugar":"putting_green"}]';

-- Competencia — estaciones_competencia[]
update sesiones_semana s
   set estaciones_competencia = (
         select jsonb_agg(
                  case when e->>'lugar' = 'putting_green'
                       then jsonb_set(e, '{lugar}', '"putting_green_fundadores"')
                       else e end
                  order by ord)
           from jsonb_array_elements(s.estaciones_competencia) with ordinality as t(e, ord))
 where s.estaciones_competencia @> '[{"lugar":"putting_green"}]';

-- Damas — estaciones_damas[] guarda el LABEL legible, no el value crudo.
update sesiones_semana s
   set estaciones_damas = (
         select jsonb_agg(
                  case when e->>'lugar' = 'Putting Green'
                       then jsonb_set(e, '{lugar}', '"Putting Green Fundadores"')
                       else e end
                  order by ord)
           from jsonb_array_elements(s.estaciones_damas) with ordinality as t(e, ord))
 where s.estaciones_damas @> '[{"lugar":"Putting Green"}]';

-- ── Vocabulario nuevo ───────────────────────────────────────────────────────
-- `not valid` a propósito: valida lo que se escriba de ahora en adelante sin
-- exigir que cada fila vieja de la base encaje. 'putting_green' sigue aceptado
-- porque puede quedar dentro de JSONB de formatos legacy que no se recorren
-- acá; la lista de la interfaz ya no lo ofrece.
alter table sesiones_semana
  add constraint sesiones_semana_lugar_check
  check (lugar in (
    'campo_practica', 'putting_green_fundadores', 'putting_green_pacos_fabios',
    'campo_infantil', 'campo_pacos_fabios', 'campo_completo', 'putting_green'
  )) not valid;

alter table drills
  add constraint drills_lugar_check
  check (lugar in (
    'campo_practica', 'putting_green_fundadores', 'putting_green_pacos_fabios',
    'campo_infantil', 'campo_pacos_fabios', 'campo_completo', 'putting_green'
  )) not valid;
