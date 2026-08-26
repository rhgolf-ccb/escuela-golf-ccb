-- Torneos: la tercera fuente de puntos del reconocimiento anual.
--
-- El módulo no guarda resultados de golf. No hay score, ni hoyos, ni handicap:
-- eso ya vive en el sistema del club y no es lo que se quiere premiar. Lo que
-- se premia es haber competido, y haber competido fuera del club aún más,
-- porque es el paso que a un niño le cuesta dar.
--
-- Por eso no existe una tabla `torneo_resultados`: la participación ES un punto
-- y vive en `puntos_alumno`, igual que la sesión extra o el reto de casa. Una
-- tabla aparte obligaría a mantener dos verdades sincronizadas —la lista de
-- participantes y los puntos que esa lista generó— y el día que alguien borre
-- una de las dos, el ranking y el acta del torneo dejarían de coincidir.
--
-- Baremo (vive en lib/puntos.ts, no aquí, para ajustarlo sin migración):
--   interno  → participar 3, podio +4  (7 en total)
--   externo  → participar 5, podio +8  (13 en total)
-- Los puntos quedan escritos en la fila, así que un cambio de baremo no
-- reescribe la historia: el punto vale lo que valía el día que se dio.

create table if not exists torneos (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  fecha      date not null,
  -- 'interno' = organizado por el club. 'externo' = cualquier otro, y es el
  -- que más puntos da.
  ambito     text not null check (ambito in ('interno', 'externo')),
  lugar      text,
  notas      text,
  creado_por uuid references app_users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists torneos_fecha_idx on torneos (fecha desc);

comment on table torneos is
  'Torneos internos y externos. Solo sirven para otorgar puntos de participación y podio; los resultados deportivos no se guardan aquí.';

-- El punto sabe de qué torneo salió. `on delete cascade`: si el coordinador
-- borra un torneo cargado por error, se van con él los puntos que repartió —
-- que es justo lo que quiere quien lo borra.
alter table puntos_alumno add column if not exists torneo_id uuid references torneos(id) on delete cascade;

create index if not exists puntos_alumno_torneo_idx on puntos_alumno (torneo_id);

-- Dos clics seguidos en el mismo botón no pueden dar el punto dos veces. El
-- índice es parcial porque los puntos de "Pasar asistencia" no llevan torneo y
-- ahí sí es válido repetir categoría (dos retos de casa en semanas distintas).
create unique index if not exists puntos_alumno_torneo_unico
  on puntos_alumno (torneo_id, estudiante_id, categoria)
  where torneo_id is not null;

alter table torneos enable row level security;

-- Lectura abierta: el nombre y la fecha de un torneo no son dato de nadie, y
-- la familia los necesita para entender de dónde le salieron los puntos al
-- niño. El detalle de quién participó sigue protegido por las policies de
-- puntos_alumno, que solo dejan ver los propios.
drop policy if exists torneos_lectura on torneos;
create policy torneos_lectura on torneos
  for select using (true);

drop policy if exists torneos_escritura_staff on torneos;
create policy torneos_escritura_staff on torneos
  for all using (es_staff()) with check (es_staff());
