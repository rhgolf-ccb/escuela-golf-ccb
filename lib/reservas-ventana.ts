// Fuente única de "cuándo se puede reservar y cuándo se puede cancelar".
//
// La regla la fija la escuela de Competencia y la usan tres capas: la vista del
// padre (para pintar el botón), el módulo de staff (para explicar por qué un
// padre no pudo) y el trigger de Postgres sobre `reservas` (para que la regla
// no dependa del navegador). Si cambia algo acá, tiene que cambiar también en
// supabase/migrations/20260822_reservas_ventana.sql — están escritas a la par.
//
// Todo se calcula en hora de Bogotá. Colombia no tiene horario de verano desde
// 1993, así que el desfase es -05:00 fijo y se puede clavar en el string ISO:
// eso evita que el reloj del navegador (un padre de viaje, un celular en otra
// zona) mueva la hora de apertura.

const TZ = "America/Bogota";
const OFFSET = "-05:00";

// Días con programación reservable en línea. Viernes y domingo no se reservan
// aunque el plan traiga sesión ese día.
const DIAS_RESERVABLES = new Set(["martes", "miercoles", "jueves", "sabado"]);

export const CUPO_MAXIMO = 12;

// Entre semana el cupo se cierra 2 h antes de que empiece la sesión.
export const HORAS_CIERRE_SEMANA = 2;
// El sábado se cierra el miércoles 17:00: el jueves a primera hora se abre la
// agenda de profesores y hay que bloquearlos con el número de niños ya cerrado.
export const DIA_CIERRE_SABADO = 2; // lunes + 2 = miércoles
export const HORA_CIERRE_SABADO = 17;
// Apertura: lunes 11:00 de la misma semana de la sesión.
export const HORA_APERTURA = 11;
// Cancelar exige 12 h de anticipación; dentro de ese margen la reserva queda en
// pie y se cobra.
export const HORAS_MINIMAS_CANCELACION = 12;

export type SesionReservable = {
  fecha: string;              // YYYY-MM-DD
  dia_semana: string;
  hora_inicio: string | null; // HH:MM:SS
};

// ── Fechas ────────────────────────────────────────────────────────────────
// El día se maneja como string YYYY-MM-DD y la aritmética se hace en UTC, para
// que no dependa de la zona del cliente. Solo al construir un instante con hora
// se le pega el offset de Bogotá.

function instante(fecha: string, hora: string): Date {
  return new Date(`${fecha}T${hora}${OFFSET}`);
}

function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function lunesDe(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 = domingo
  return sumarDias(fecha, dow === 0 ? -6 : 1 - dow);
}

export function inicioSesion(s: SesionReservable): Date | null {
  if (!s.hora_inicio) return null;
  // Postgres devuelve "16:00:00", pero un input <time> manda "16:00".
  const hora = s.hora_inicio.length === 5 ? `${s.hora_inicio}:00` : s.hora_inicio.slice(0, 8);
  return instante(s.fecha, hora);
}

export function formatearMomento(d: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(d);
}

export function formatearHora(d: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(d);
}

// ── Ventana de reserva ────────────────────────────────────────────────────

export type EstadoVentana =
  | "no_reservable"  // día sin reserva en línea, o sesión sin hora cargada
  | "aun_no_abre"    // todavía no llega el lunes 11:00
  | "abierta"
  | "cerrada";

export type Ventana = {
  estado: EstadoVentana;
  abre: Date | null;
  cierra: Date | null;
  puedeReservar: boolean;
  mensaje: string;
};

export function ventanaReserva(s: SesionReservable, ahora: Date = new Date()): Ventana {
  const inicio = inicioSesion(s);
  if (!DIAS_RESERVABLES.has(s.dia_semana) || !inicio) {
    return {
      estado: "no_reservable", abre: null, cierra: null, puedeReservar: false,
      mensaje: "Esta sesión no se reserva en línea.",
    };
  }

  const lunes = lunesDe(s.fecha);
  const abre = instante(lunes, `${String(HORA_APERTURA).padStart(2, "0")}:00:00`);
  const cierra = s.dia_semana === "sabado"
    ? instante(sumarDias(lunes, DIA_CIERRE_SABADO), `${HORA_CIERRE_SABADO}:00:00`)
    : new Date(inicio.getTime() - HORAS_CIERRE_SEMANA * 3600_000);

  if (ahora < abre) {
    return {
      estado: "aun_no_abre", abre, cierra, puedeReservar: false,
      mensaje: `Abre el ${formatearMomento(abre)}`,
    };
  }
  if (ahora > cierra) {
    return {
      estado: "cerrada", abre, cierra, puedeReservar: false,
      mensaje: s.dia_semana === "sabado"
        ? `Cerrado — el sábado se cierra el ${formatearMomento(cierra)}`
        : `Cerrado — se cierra ${HORAS_CIERRE_SEMANA} h antes (${formatearMomento(cierra)})`,
    };
  }
  return {
    estado: "abierta", abre, cierra, puedeReservar: true,
    mensaje: s.dia_semana === "sabado"
      ? `Puedes reservar hasta el ${formatearMomento(cierra)}`
      : `Puedes reservar hasta las ${formatearHora(cierra)}`,
  };
}

// ── Ventana de cancelación ────────────────────────────────────────────────

export type Cancelacion = {
  puedeCancelar: boolean;
  limite: Date | null;
  mensaje: string;
};

export function ventanaCancelacion(s: SesionReservable, ahora: Date = new Date()): Cancelacion {
  const inicio = inicioSesion(s);
  if (!inicio) return { puedeCancelar: true, limite: null, mensaje: "" };

  const limite = new Date(inicio.getTime() - HORAS_MINIMAS_CANCELACION * 3600_000);
  if (ahora > limite) {
    return {
      puedeCancelar: false, limite,
      mensaje: `Ya no se puede cancelar: faltan menos de ${HORAS_MINIMAS_CANCELACION} horas y la sesión se cobra.`,
    };
  }
  return {
    puedeCancelar: true, limite,
    mensaje: `Puedes cancelar sin costo hasta el ${formatearMomento(limite)}`,
  };
}
