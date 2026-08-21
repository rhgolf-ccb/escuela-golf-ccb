-- Los drills de Birdies dejan de pedir equipo de adulto.
--
-- Cuatro de los siete drills etiquetados "birdies" pedían material que no se
-- usa con niños de 4-5 años: uno decía explícitamente "palo de velocidad
-- junior", otro trabajaba con una banda anclada, y dos estaban marcados con
-- balón medicinal cuando su propia descripción habla de un balón blando.
--
-- Ese material además ya no aparece como filtro en el wizard de Birdies (solo
-- se ofrecen Conos/Escalera y Ninguno), así que estos drills quedaban
-- invisibles al filtrar. Se corrige el material y se reescribe lo que nombraba
-- el equipo dentro del texto.

-- Balón blando, no medicinal: la descripción ya era correcta, la etiqueta no.
update drills
set material = array['ninguno']
where titulo in ('Derriba y pega (Birdies)', 'Lanza y gira: derriba el objetivo')
  and nivel_recomendado && array['birdies'];

-- El palo del niño ya es liviano: no hace falta nombrar el palo de velocidad.
update drills
set descripcion = 'El niño hace un swing con su palo y "aterriza" como un superhéroe: quieto en el pie delantero, pecho al frente, sostener 3 segundos mientras el profe cuenta. Gana quien no se tambalee.',
    material = array['ninguno']
where titulo = 'Superhéroe: aterriza el finish'
  and nivel_recomendado && array['birdies'];

-- La "cuerda mágica" funciona igual con una cuerda o una toalla que sostenga
-- el profesor — sin banda de resistencia ni anclaje.
update drills
set titulo = 'Jala la cuerda mágica',
    descripcion = 'El profesor sostiene el otro extremo de una cuerda o una toalla y el niño juega a "jalarla hacia el bolsillo delantero" usando el cuerpo y las piernas, no solo los brazos. Enseña de forma lúdica que la bajada empieza abajo.',
    material = array['ninguno']
where titulo = 'Jala la cuerda mágica (banda: iniciar la bajada)'
  and nivel_recomendado && array['birdies'];
