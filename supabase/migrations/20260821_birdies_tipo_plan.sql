-- Birdies pasa a ser su propio tipo de plan, separado de Juvenil.
--
-- Los niños de 4-5 años se programaban dentro de Juvenil, compartiendo el
-- horario de fin de semana de 09:15. A partir de ahora tienen programación
-- propia. Entre semana Birdies y Juvenil coinciden a las 16:30 a propósito:
-- son grupos distintos, con otro profesor y otra estación.
--
--   birdies  martes/miercoles/jueves  16:30-17:15
--   birdies  sabado/domingo           09:15-10:00
--   juvenil  martes/miercoles/jueves  16:30-17:30  (sin cambios)
--   juvenil  sabado/domingo           10:00-11:00  (queda UNA sola fila por día)

alter table planes_semanales drop constraint planes_semanales_tipo_plan_check;
alter table planes_semanales add constraint planes_semanales_tipo_plan_check
  check (tipo_plan = any (array['birdies', 'juvenil', 'competencia', 'damas']));

alter table horarios_defecto drop constraint horarios_defecto_tipo_plan_check;
alter table horarios_defecto add constraint horarios_defecto_tipo_plan_check
  check (tipo_plan = any (array['birdies', 'juvenil', 'competencia', 'damas']));

-- Juvenil tenía DOS filas por día de fin de semana (09:15 y 10:00) con el mismo
-- contenido: el turno de 09:15 era en realidad el de los Birdies. Al quedarse
-- una sola fila por grupo desaparece la duplicación que el código venía
-- disimulando con casos especiales.
delete from horarios_defecto
where tipo_plan = 'juvenil'
  and dia_semana in ('sabado', 'domingo')
  and hora_inicio = '09:15:00';

insert into horarios_defecto (tipo_plan, dia_semana, hora_inicio, hora_fin) values
  ('birdies', 'martes',    '16:30', '17:15'),
  ('birdies', 'miercoles', '16:30', '17:15'),
  ('birdies', 'jueves',    '16:30', '17:15'),
  ('birdies', 'sabado',    '09:15', '10:00'),
  ('birdies', 'domingo',   '09:15', '10:00');
