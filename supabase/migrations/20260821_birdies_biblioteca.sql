-- Biblioteca acorde a Birdies (4-5 años).
--
-- Al separar Birdies de Juvenil quedó al descubierto que la biblioteca no
-- tiene material para esta edad: los 7 drills etiquetados "birdies" son todos
-- de contacto, y los ejercicios físicos marcados con el grupo "Birdies" venían
-- de cuando Birdies era el grupo de 6-8 años — son de formato gimnasio
-- (Pallof con banda, slam de balón medicinal, planchas 3x12), justo lo que no
-- se le propone a un niño de 4 años.
--
-- Todo lo que se agrega acá es juego de transferencia al golf: cada actividad
-- termina en un golpe o en una acción con palo y bola. Material del juego
-- infantil (conos, aros, cuerdas, tees) — nunca varas de velocidad, balones
-- medicinales ni bandas de resistencia, que son de Competencia y +14.

-- ── 1. Los ejercicios físicos de adulto dejan de ser de Birdies ────────────
-- El calentamiento (movilidad suave, sin carga) se conserva: sirve igual a los
-- 4 años y es lo que carga el paso de calentamiento del wizard.
update ejercicios_fisicos
set grupos = array_remove(grupos, 'Birdies')
where grupos && array['Birdies']
  and categoria <> 'Calentamiento';

-- ── 2. Juegos de coordinación de Birdies (estación "Coordinación y equilibrio")
insert into ejercicios_fisicos (nombre, categoria, grupo_muscular, grupos, materiales, instrucciones, series_repeticiones, progresion, duracion_minutos, nota) values
  ('Flamenco y pega', 'Fuerza y estabilidad', 'Equilibrio', array['Birdies'], 'Palo y bola',
   'El niño se para en una sola pierna y cuenta hasta cinco en voz alta. Apenas termina de contar, pone los dos pies en el piso y le pega a la bola. Termina el golpe quieto, contando hasta tres sin moverse.',
   '2 rondas de 5 golpes', 'Subir a contar hasta ocho en una pierna, o cerrar los ojos mientras cuenta.', 8,
   'Transferencia: el equilibrio de la ronda es el mismo que necesita para terminar el golpe parado.'),

  ('Trompo y freeze', 'Movilidad', 'Rotación', array['Birdies'], 'Palo, bola y un cono como objetivo',
   'El niño gira sobre sí mismo como un trompo. Cuando el profesor grita "¡freeze!" se queda quieto mirando al cono y le pega a la bola hacia él. Gana quien más veces quede mirando al objetivo al frenar.',
   '5 giros y 5 golpes', 'Girar más rápido, o frenar y pegar sin volver a acomodar los pies.', 8,
   'Transferencia: girar y frenar controlado es la base del giro del swing.'),

  ('El robot que se enrolla', 'Movilidad', 'Torácica', array['Birdies'], 'Palo y bola',
   'Con los brazos cruzados sobre el pecho, el niño gira los hombros a un lado y al otro como un robot, cinco veces a cada lado. Después toma el palo y da tres golpes tratando de girar igual de lejos.',
   '5 giros por lado + 3 golpes', 'Sostener el palo sobre los hombros mientras gira.', 6,
   'Transferencia: enseña a girar el tronco antes de pedirle giro en el golpe.'),

  ('Salta y aterriza como estatua', 'Potencia', 'Piernas', array['Birdies'], 'Palo, bola y un aro',
   'El niño salta dentro del aro y tiene que caer quieto como una estatua, contando hasta tres. Si se mueve, repite el salto. Cuando aterriza quieto, sale del aro y le pega a la bola.',
   '3 rondas de 4 saltos', 'Saltar y girar en el aire un cuarto de vuelta antes de aterrizar.', 8,
   'Transferencia: aterrizar firme es la misma sensación del finish en balance.'),

  ('Lanza la bola y después pégale', 'Potencia', 'Rotación', array['Birdies'], 'Bola, palo y un cono o diana',
   'Primero el niño lanza la bola con las dos manos hacia el cono, girando el cuerpo como si tirara un balón. Después toma el palo y le pega a otra bola hacia el mismo cono, buscando el mismo giro.',
   '5 lanzamientos y 5 golpes', 'Alejar el cono un paso cada ronda.', 8,
   'Transferencia: el lanzamiento le da la sensación de girar hacia el objetivo, y el golpe la copia.'),

  ('Camina la cuerda y pega', 'Fuerza y estabilidad', 'Equilibrio', array['Birdies'], 'Cuerda o línea en el piso, palo y bola',
   'El niño camina sobre una cuerda estirada en el piso, un pie delante del otro, sin salirse. Al llegar al final hay una bola esperándolo: le pega y se queda quieto hasta contar tres.',
   '3 recorridos con su golpe', 'Caminar de espaldas, o llevar la bola en la palma de la mano.', 8,
   'Transferencia: control del cuerpo caminando, y el golpe como premio al final del recorrido.'),

  ('El oso llega al tee', 'Movilidad', 'Cuerpo completo', array['Birdies'], 'Tees, palo y bola',
   'El niño avanza en cuatro patas como un oso (manos y pies, rodillas sin tocar el piso) hasta llegar al tee donde está la bola. Se levanta, se acomoda y le pega.',
   '4 recorridos cortos', 'Alargar el recorrido o hacerlo de lado como un cangrejo.', 8,
   'Transferencia: activa el cuerpo entero y termina siempre en un golpe, no en un ejercicio suelto.'),

  ('El espejo del profe', 'Fuerza y estabilidad', 'Postura', array['Birdies'], 'Palo y bola',
   'El profesor hace una pose (pies separados, palo apuntando al frente, terminar el golpe con el pecho al objetivo) y el niño la copia como un espejo. Cada dos poses copiadas, le pega a una bola.',
   '6 poses y 3 golpes', 'El niño inventa la pose y el profesor la copia.', 6,
   'Transferencia: construye postura y finish sin nombrar una sola posición técnica.');

-- ── 3. Drills de Puntería (putting green) y Juego en Campo Infantil ────────
-- Entran sin aprobar (aprobado = false): no aparecen en el wizard hasta que un
-- profesor los revise y los apruebe desde el módulo Drills.
insert into drills (titulo, descripcion, categoria, subcategoria, nivel_recomendado, lugar, duracion_minutos, repeticiones, error_que_corrige, sensacion_buscada, metrica_exito, variante_presion, material, rating, aprobado, generado_por_ia) values
  ('La puerta mágica', 'Se ponen dos conos formando una puerta angosta a un paso del hoyo. El niño hace rodar la bola con el putter y tiene que pasarla por la puerta. Cada bola que pasa vale un punto; si le sale fácil, la puerta se aleja un paso.', 'putting', 'direccion', array['birdies'], 'putting_green_fundadores', 8, '10 bolas', 'La bola sale desviada porque la cara del putter no apunta al objetivo', 'Empujar la bola derecho hacia la puerta, sin girar las manos', '3 bolas seguidas que pasen por la puerta', 'El profesor cuenta en voz alta las tres últimas bolas', array['conos_escalera'], 3, false, true),

  ('Cae en el aro', 'Se pone un aro en el green a dos pasos del niño. Tiene que hacer rodar la bola con el putter y dejarla dentro del aro — no importa la dirección exacta, importa que no se pase ni se quede corta.', 'putting', 'distancia', array['birdies'], 'putting_green_fundadores', 8, '10 bolas', 'Le pega siempre con la misma fuerza sin importar la distancia', 'Medir cuánta fuerza necesita, como cuando lanza una bola con la mano', '3 de 5 bolas dentro del aro', 'Se cuentan las cinco últimas y se compara con la clase pasada', array['ninguno'], 3, false, true),

  ('Semáforo: suave, normal, fuerte', 'Se marcan tres aros a distancias distintas: cerca es verde, medio es amarillo y lejos es rojo. El profesor canta un color y el niño tiene que dejar la bola en ese aro.', 'putting', 'distancia', array['birdies'], 'putting_green_fundadores', 10, '9 bolas (3 por color)', 'No distingue la fuerza que necesita cada distancia', 'Pegarle suave, normal o fuerte a propósito', 'Acierta 3 colores de los 9 intentos', 'El profesor canta los colores en desorden y rápido', array['ninguno'], 3, false, true),

  ('Bolos con el putter', 'Se paran tres conos pequeños como bolos a dos pasos del niño. Con el putter tiene que derribarlos rodando la bola. Cada cono derribado es un punto y se vuelven a parar.', 'putting', 'direccion', array['birdies'], 'putting_green_fundadores', 8, '2 rondas de 5 bolas', 'Levanta la bola en vez de hacerla rodar', 'Que la bola vaya rodando por el piso, sin saltar', 'Derriba 3 conos en una ronda de 5 bolas', 'Por equipos: suman los conos de todos', array['conos_escalera'], 3, false, true),

  ('La escalera de pasos', 'El niño emboca desde un paso del hoyo. Cuando mete una, retrocede a dos pasos, y después a tres. Si falla, vuelve al paso anterior. La idea es subir la escalera completa.', 'putting', 'presion', array['birdies'], 'putting_green_fundadores', 10, 'Hasta subir la escalera', 'Se frustra en distancias largas antes de dominar la corta', 'Meterla desde cerca muchas veces para animarse a alejarse', 'Sube los tres escalones en el turno', 'Todo el grupo cuenta en voz alta el putt de cada niño', array['ninguno'], 3, false, true),

  ('Sigue la cuerda', 'Se estira una cuerda desde la bola hasta el hoyo. El niño tiene que hacer rodar la bola pegadita a la cuerda, como si fuera un tren sobre el riel.', 'putting', 'direccion', array['birdies'], 'putting_green_fundadores', 8, '8 bolas', 'No tiene referencia de por dónde debe salir la bola', 'La bola arranca derecho, siguiendo el riel', '4 bolas que no se despeguen de la cuerda', 'La última bola vale doble', array['ninguno'], 3, false, true),

  ('El circuito de tres paradas', 'Se arman tres paradas en el Campo Infantil: en la primera pega una bola al aire, en la segunda la hace rodar hasta un aro y en la tercera emboca desde un paso. El niño recorre las tres en orden.', 'campo', 'circuito', array['birdies'], 'campo_infantil', 12, '1 vuelta completa por niño', 'Se aburre repitiendo el mismo golpe en el mismo sitio', 'Cambiar de golpe y de sitio manteniendo la rutina de acomodarse', 'Completa las tres paradas sin saltarse ninguna', 'Se toma el tiempo de la vuelta y se intenta mejorar', array['conos_escalera'], 3, false, true),

  ('Relevo de la bola viajera', 'Dos equipos en fila. El primero de cada fila lleva su bola con golpes cortos hasta el cono, la recoge, corre de vuelta y se la entrega al siguiente. Gana el equipo que termine primero.', 'campo', 'relevo', array['birdies'], 'campo_infantil', 12, '2 relevos', 'Pega sin objetivo y se desconecta cuando no es su turno', 'Llevar la bola hacia donde quiere, con golpes cortos y controlados', 'El equipo termina el relevo con todas las bolas', 'El segundo relevo se corre con el marcador en contra', array['conos_escalera'], 3, false, true),

  ('Golf-bolos por equipos', 'Se paran seis conos como bolos al final de la zona. Cada niño tiene dos bolas para derribar los que pueda. Los conos derribados se suman entre todo el equipo.', 'campo', 'punteria', array['birdies'], 'campo_infantil', 10, '2 bolas por niño, 2 rondas', 'Le pega fuerte sin apuntar a nada', 'Elegir un cono antes de pegarle a la bola', 'El equipo derriba la mitad de los conos', 'La segunda ronda cada cono derribado vale doble', array['conos_escalera'], 3, false, true),

  ('El camino de aros', 'Se ponen tres aros en el piso formando un camino. El niño tiene que ir pasando la bola de aro en aro con golpes cortos, sin saltarse ninguno. Si se sale del camino, empieza otra vez desde el aro anterior.', 'campo', 'control', array['birdies'], 'campo_infantil', 10, '2 recorridos', 'Le pega siempre con la misma fuerza y se pasa del objetivo', 'Dosificar el golpe según lo cerca que esté el siguiente aro', 'Recorre el camino completo en menos de seis golpes', 'Se cuenta cuántos golpes usó y se intenta bajar la marca', array['ninguno'], 3, false, true),

  ('Busca el tesoro y emboca', 'El profesor esconde tees de colores por la zona. Cada niño busca uno, vuelve al punto de salida, pone su bola sobre ese tee y le pega hacia la bandera. El color del tee dice cuántos puntos vale.', 'campo', 'juego', array['birdies'], 'campo_infantil', 12, '3 tesoros por niño', 'Pierde la atención en los tiempos de espera', 'Moverse, volver y acomodarse solo para pegar', 'Cada niño trae y juega sus tres tesoros', 'El último tesoro vale el doble de puntos', array['ninguno'], 3, false, true),

  ('Turnos de oro', 'Se juega en parejas por el Campo Infantil. Cada niño gana un punto de oro cuando espera su turno quieto y en silencio, y otro cuando le pega a su bola. Los puntos de comportamiento valen igual que los golpes.', 'campo', 'reglas_etiqueta', array['birdies'], 'campo_infantil', 10, '6 turnos por niño', 'Se atraviesa o pega cuando el compañero está jugando', 'Esperar el turno como parte del juego, no como un castigo', 'Termina la ronda con al menos 5 puntos de oro', 'La pareja con más puntos de oro elige el juego siguiente', array['ninguno'], 3, false, true);

-- Reglas de campo para los juegos del Campo Infantil (solo categoria = campo).
update drills
set reglas_campo = '[{"texto":"Se espera el turno detrás de la línea, nunca al lado de quien pega."},{"texto":"Se cuenta en voz alta: los números los dice el niño, no el profesor."},{"texto":"Si la bola se sale de la zona, se repone donde salió y se sigue jugando."}]'::jsonb
where categoria = 'campo'
  and nivel_recomendado && array['birdies']
  and reglas_campo is null;
