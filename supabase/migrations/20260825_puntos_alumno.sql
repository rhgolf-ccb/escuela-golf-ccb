-- Puntos de esfuerzo y disciplina: la materia prima del reconocimiento anual.
--
-- Una fila por punto otorgado, con su motivo y quién lo dio. No se guarda un
-- acumulado por alumno a propósito: el total se suma al vuelo, igual que la
-- asistencia. Un acumulado guardado termina contradiciendo a sus propias filas
-- el día que alguien corrige una.
--
-- Los puntos se registran desde "Pasar asistencia", que es el único momento en
-- que el profesor tiene la app abierta y al niño enfrente. Por eso `sesion_id`:
-- deja saber en qué clase se dio el punto, y permite deshacerlo desde la misma
-- pantalla.
--
-- Baremo inicial (vive en el código, no en la base, para poder ajustarlo sin
-- migración): sesión extra 3, reto de casa 2, disciplina 1. Torneo y podio
-- llegan con el módulo de torneos.

create table if not exists puntos_alumno (
  id            uuid primary key default gen_random_uuid(),
  estudiante_id uuid not null references students(id) on delete cascade,
  categoria     text not null check (categoria in ('sesion_extra', 'reto_casa', 'disciplina', 'torneo', 'podio', 'otro')),
  puntos        int  not null check (puntos between -10 and 50),
  motivo        text,
  -- La fecha del calendario de Bogotá, no la de UTC: después de las 7 p. m.
  -- hora local el servidor ya está en el día siguiente y el punto quedaría
  -- fechado mañana.
  fecha         date not null default (now() at time zone 'America/Bogota')::date,
  sesion_id     uuid references sesiones_semana(id) on delete set null,
  -- Se llena sola con quien hace la petición. Es la única forma de que el
  -- coordinador pueda revisar después quién puso qué.
  otorgado_por  uuid references app_users(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);

create index if not exists puntos_alumno_estudiante_fecha_idx on puntos_alumno (estudiante_id, fecha);
create index if not exists puntos_alumno_sesion_idx on puntos_alumno (sesion_id);

comment on table puntos_alumno is
  'Puntos de esfuerzo y disciplina por alumno, uno por fila con motivo y autor. Se suman al vuelo para el reconocimiento anual; no hay acumulado guardado.';

alter table puntos_alumno enable row level security;

-- La familia puede ver los puntos de sus propios alumnos: es la mitad del
-- incentivo — el niño tiene que poder ver que se le reconoció algo.
drop policy if exists puntos_alumno_lectura on puntos_alumno;
create policy puntos_alumno_lectura on puntos_alumno
  for select using (es_staff() or es_mi_alumno(estudiante_id));

-- Otorgar y quitar es solo del staff. Un padre no puede darle puntos a su hijo.
drop policy if exists puntos_alumno_escritura_staff on puntos_alumno;
create policy puntos_alumno_escritura_staff on puntos_alumno
  for all using (es_staff()) with check (es_staff());
