"use client";

// Piezas del tema oscuro compartidas por los módulos de staff.
//
// Nacieron sueltas dentro de Alumnos, se copiaron a Programación y a Reservas
// con variantes, y en Reportes ya eran una docena. Cada copia inventaba su
// propio padding y su propio gris, así que dos pantallas del mismo producto no
// se parecían. Aquí viven una sola vez.
//
// Ninguna lleva un hex: los valores están en globals.css bajo .tema-oscuro, y
// el color por grupo sale de lib/grupos. Un componente de este archivo se pinta
// bien sin saber en qué superficie está.
//
// El contenedor del módulo (`<Pagina>`) es quien activa .tema-oscuro; todo lo
// demás asume que ya está activo.

import { type ReactNode, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { colorGrupo, acentoGrupo, TEXTO_SOBRE_ACENTO } from "@/lib/grupos";

// ── Semáforo ─────────────────────────────────────────────────────────────────
// Los cuatro tonos con los que se pinta un estado. `neutro` es el "sin dato",
// que no es lo mismo que "malo".

export type Tono = "ok" | "warn" | "bad" | "neutro";

export const TONO: Record<Tono, { fg: string; bg: string }> = {
  ok:     { fg: "var(--ui-ok)",     bg: "var(--ui-ok-bg)" },
  warn:   { fg: "var(--ui-warn)",   bg: "var(--ui-warn-bg)" },
  bad:    { fg: "var(--ui-bad)",    bg: "var(--ui-bad-bg)" },
  neutro: { fg: "var(--ui-text-3)", bg: "var(--ui-card-alt)" },
};

/** Umbral compartido de porcentajes: 85 y 60. */
export function tonoDePct(value: number): Tono {
  return value >= 85 ? "ok" : value >= 60 ? "warn" : "bad";
}

// ── Contenedor y encabezado ──────────────────────────────────────────────────

/** Envoltura de un módulo: activa el tema y fija el ancho de la columna. */
export function Pagina({ children, ancho = "7xl" }: { children: ReactNode; ancho?: "7xl" | "full" }) {
  return (
    <div className="tema-oscuro min-h-screen w-full">
      <div className={`${ancho === "full" ? "w-full" : "max-w-7xl mx-auto"} px-4 sm:px-6 lg:px-8 py-8`}>
        {children}
      </div>
    </div>
  );
}

/**
 * Encabezado de módulo: baldosa con el icono, título, bajada y acciones.
 *
 * La baldosa va en verde con el icono dorado en todos los módulos a propósito.
 * Se probó darle a cada uno su color y el resultado fue que la app parecía
 * siete productos distintos; el color se reserva para lo que sí significa algo,
 * que es el grupo del alumno.
 */
export function Encabezado({ icono: Icono, titulo, bajada, children }: {
  icono: LucideIcon;
  titulo: string;
  bajada?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "var(--g-juvenil-bg)", border: "1px solid var(--ui-border)" }}>
          <Icono size={22} style={{ color: "var(--ui-gold)" }} />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate" style={{ color: "var(--ui-text)" }}>{titulo}</h1>
          {bajada && <p className="text-sm mt-0.5" style={{ color: "var(--ui-text-3)" }}>{bajada}</p>}
        </div>
      </div>
      {children && <div className="flex items-center gap-3 flex-wrap">{children}</div>}
    </div>
  );
}

// ── Botones ──────────────────────────────────────────────────────────────────

/** Acción principal de la pantalla. Dorado sobre el fondo, uno por módulo. */
export function BotonPrimario({ onClick, children, disabled, title, type = "button" }: {
  onClick?: () => void; children: ReactNode; disabled?: boolean; title?: string;
  type?: "button" | "submit";
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
      style={{ background: "var(--ui-gold)", color: "var(--ui-bg)" }}>
      {children}
    </button>
  );
}

/** Acción secundaria: solo contorno. */
export function BotonSecundario({ onClick, children, disabled, title, type = "button" }: {
  onClick?: () => void; children: ReactNode; disabled?: boolean; title?: string;
  type?: "button" | "submit";
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors hover:bg-(--ui-card-alt) disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
      style={{ color: "var(--ui-text-2)", border: "1px solid var(--ui-border)" }}>
      {children}
    </button>
  );
}

/** Botón de solo icono, para navegación y cerrar. */
export function BotonIcono({ onClick, children, title, disabled }: {
  onClick: () => void; children: ReactNode; title?: string; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} title={title} disabled={disabled}
      className="p-1.5 rounded-lg transition-colors hover:bg-(--ui-card-alt) disabled:opacity-40"
      style={{ color: "var(--ui-text-3)" }}>
      {children}
    </button>
  );
}

// ── Etiquetas ────────────────────────────────────────────────────────────────

export function Badge({ label, tono }: { label: string; tono: Tono }) {
  const t = TONO[tono];
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize whitespace-nowrap"
      style={{ background: t.bg, color: t.fg }}>
      {label}
    </span>
  );
}

export function PctBadge({ value }: { value: number }) {
  return <Badge label={`${value}%`} tono={tonoDePct(value)} />;
}

/** Chip con el nombre del grupo, en el color único del grupo. */
export function GrupoBadge({ grupo }: { grupo: string | null | undefined }) {
  if (!grupo) return null;
  const c = colorGrupo(grupo);
  return (
    <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap"
      style={{ background: c.background, color: c.color }}>
      {grupo}
    </span>
  );
}

/** Chip de filtro pintado con el acento del grupo. `grupo` null = opción neutra. */
export function ChipGrupo({ label, grupo, active, onClick, count, icono: Icono }: {
  label: string; grupo: string | null; active: boolean; onClick: () => void;
  count?: number; icono?: LucideIcon;
}) {
  const acento = grupo ? acentoGrupo(grupo) : "var(--ui-gold)";
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap shrink-0"
      style={active
        ? { background: acento, color: TEXTO_SOBRE_ACENTO, border: `1px solid ${acento}` }
        : { background: "transparent", color: "var(--ui-text-2)", border: "1px solid var(--ui-border)" }}>
      {Icono && <Icono size={13} />}
      {label}
      {count !== undefined && (
        <span className="text-[10px] rounded-full px-1.5 font-bold tabular-nums"
          style={{ background: "var(--ui-bg)", color: active ? acento : "var(--ui-text-3)" }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Métricas ─────────────────────────────────────────────────────────────────

/**
 * La cifra manda: el número va grande y la etiqueta pequeña encima. La franja
 * de color a la izquierda es lo único que distingue una tarjeta de otra de un
 * vistazo, así que se pinta con el tono de la métrica cuando lo tiene.
 */
export function MetricCard({ label, value, sub, tono }: {
  label: string; value: string | number; sub?: string; tono?: Tono;
}) {
  const acento = tono ? TONO[tono].fg : "var(--ui-gold)";
  return (
    <div className="relative rounded-xl px-4 py-3 min-w-0 overflow-hidden"
      style={{ background: "var(--ui-card)", border: "1px solid var(--ui-border-soft)" }}>
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: acento }} />
      <p className="text-[10px] font-bold uppercase tracking-wide mb-1 truncate" style={{ color: "var(--ui-text-3)" }}>{label}</p>
      <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--ui-text)" }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--ui-text-3)" }}>{sub}</p>}
    </div>
  );
}

/** Barra de porcentaje con la cifra al lado. */
export function BarraPct({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 rounded-full h-1.5 min-w-[60px] overflow-hidden" style={{ background: "var(--ui-card-alt)" }}>
        <div className="h-1.5 rounded-full" style={{ width: `${value}%`, background: TONO[tonoDePct(value)].fg }} />
      </div>
      <span className="text-xs tabular-nums w-9 text-right" style={{ color: "var(--ui-text-2)" }}>{value}%</span>
    </div>
  );
}

// ── Superficies ──────────────────────────────────────────────────────────────

/** Contenedor de tablas y bloques de contenido. */
export function Panel({ children, title, sub, acciones }: {
  children: ReactNode; title?: string; sub?: string; acciones?: ReactNode;
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--ui-card)", border: "1px solid var(--ui-border-soft)" }}>
      {(title || acciones) && (
        <div className="px-4 py-2.5 flex items-baseline gap-2 flex-wrap" style={{ borderBottom: "1px solid var(--ui-border-soft)" }}>
          {title && <h3 className="text-sm font-bold" style={{ color: "var(--ui-text)" }}>{title}</h3>}
          {sub && <span className="text-xs" style={{ color: "var(--ui-text-3)" }}>{sub}</span>}
          {acciones && <div className="ml-auto flex items-center gap-2">{acciones}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/** Barra de controles: filtros a la izquierda, acciones a la derecha. */
export function Toolbar({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="rounded-xl px-3 py-2.5 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2"
      style={{ background: "var(--ui-card)", border: "1px solid var(--ui-border)" }}>
      {children}
      {right && <div className="ml-auto flex items-center gap-3">{right}</div>}
    </div>
  );
}

/** Etiqueta de sección dentro de una barra de controles. */
export function CampoLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-wide shrink-0" style={{ color: "var(--ui-text-3)" }}>
      {children}
    </span>
  );
}

// ── Campos de formulario ─────────────────────────────────────────────────────

// colorScheme: sin esto el calendario del input date, el caret y las opciones
// del select salen en claro sobre el campo oscuro. Va en el campo y no en una
// regla global porque todavía quedan vistas claras (las de padres) que comparten
// componentes con estas pantallas.
export const CAMPO: CSSProperties = {
  background: "var(--ui-card-alt)",
  border: "1px solid var(--ui-border)",
  color: "var(--ui-text)",
  colorScheme: "dark",
};

export const CLASE_CAMPO = "w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2";

/** Campo etiquetado para formularios y modales. */
export function Campo({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--ui-text-3)" }}>{label}</span>
      {children}
      {hint && <span className="block text-[11px] mt-1" style={{ color: "var(--ui-text-3)" }}>{hint}</span>}
    </label>
  );
}

/**
 * Barra de pestañas de un módulo. Cada módulo tenía la suya: unos con subrayado
 * gris, otros con píldora verde, otros con fondo blanco. Esta es la única.
 *
 * `hint` sale debajo de la barra y dice qué contesta la pestaña abierta; con
 * cuatro o más pestañas el nombre solo no alcanza.
 */
export function Tabs<T extends string>({ value, options, onChange }: {
  value: T;
  options: { id: T; label: string; icono?: LucideIcon; count?: number; hint?: string }[];
  onChange: (v: T) => void;
}) {
  const activa = options.find((o) => o.id === value);
  return (
    <>
      <nav className="rounded-xl p-1.5 mb-2 flex items-center gap-1 overflow-x-auto"
        style={{ background: "var(--ui-card)", border: "1px solid var(--ui-border)" }}>
        {options.map((o) => {
          const on = value === o.id;
          const Icono = o.icono;
          return (
            <button key={o.id} onClick={() => onChange(o.id)} title={o.hint}
              className="px-3 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5 shrink-0"
              style={on
                ? { background: "var(--g-juvenil-bg)", color: "var(--g-juvenil-fg)" }
                : { color: "var(--ui-text-2)" }}>
              {Icono && <Icono size={15} />}
              {o.label}
              {o.count !== undefined && (
                <span className="text-[10px] rounded-full px-1.5 font-bold tabular-nums"
                  style={{ background: "var(--ui-bg)", color: on ? "var(--g-juvenil-fg)" : "var(--ui-text-3)" }}>
                  {o.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      {activa?.hint && <p className="text-xs mb-5 px-1" style={{ color: "var(--ui-text-3)" }}>{activa.hint}</p>}
      {!activa?.hint && <div className="mb-5" />}
    </>
  );
}

/** Grupo de botones tipo segmented control (un solo seleccionado). */
export function Segmented<T extends string | number>({ value, options, onChange }: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg p-1 shrink-0" style={{ background: "var(--ui-card-alt)" }}>
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className="px-3 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap"
          style={value === o.id
            ? { background: "var(--ui-gold)", color: "var(--ui-bg)" }
            : { color: "var(--ui-text-3)" }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Tablas ───────────────────────────────────────────────────────────────────
// Las tablas del proyecto repetían las mismas clases de cabecera y de fila con
// pequeñas variantes. Estas tres piezas fijan el rayado, el borde y el tamaño
// de letra en un solo sitio.

export const TH = "text-[11px] font-bold uppercase tracking-wide whitespace-nowrap";
export const thStyle: CSSProperties = { background: "var(--ui-card-alt)", color: "var(--ui-text-3)" };

/**
 * Fondo alterno de fila. Se aplica en style y no con una clase para que una
 * columna pegajosa pueda repetir exactamente el mismo valor.
 *
 * Los dos valores son opacos a propósito: la fila par coincide con el fondo del
 * panel, pero si fuera `transparent` la columna pegajosa dejaría pasar por
 * debajo las celdas que se desplazan.
 */
export function fondoFila(i: number): string {
  return i % 2 === 0 ? "var(--ui-card)" : "var(--ui-card-alt)";
}

/** Leyenda de puntos al pie de una tabla. */
export function Leyenda({ items }: { items: { color: string; borde?: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-[11px]"
      style={{ borderTop: "1px solid var(--ui-border-soft)", color: "var(--ui-text-3)" }}>
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block"
            style={{ background: it.color, border: it.borde ? `1px solid ${it.borde}` : undefined }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// ── Estados ──────────────────────────────────────────────────────────────────

export function Loading({ msg }: { msg?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="animate-spin rounded-full h-7 w-7 border-2"
        style={{ borderColor: "var(--ui-gold)", borderTopColor: "transparent" }} />
      {msg && <p className="text-xs" style={{ color: "var(--ui-text-3)" }}>{msg}</p>}
    </div>
  );
}

export function EmptyState({ msg, sub, accion }: { msg: string; sub?: string; accion?: ReactNode }) {
  return (
    <div className="py-16 px-4 text-center">
      <p className="text-sm" style={{ color: "var(--ui-text-2)" }}>{msg}</p>
      {sub && <p className="text-xs mt-1" style={{ color: "var(--ui-text-3)" }}>{sub}</p>}
      {accion && <div className="mt-4 flex justify-center">{accion}</div>}
    </div>
  );
}

/**
 * Una lista incompleta se ve igual que una completa, así que cuando la carga
 * falla hay que decirlo en pantalla en vez de pintar lo que alcanzó a llegar.
 */
export function ErrorState({ msg, titulo = "No se pudo cargar la información", nota }: {
  msg: string; titulo?: string; nota?: string;
}) {
  return (
    <div className="py-12 px-4 text-center rounded-xl"
      style={{ background: "var(--ui-bad-bg)", border: "1px solid var(--ui-border-soft)" }}>
      <p className="text-sm font-bold" style={{ color: "var(--ui-bad)" }}>{titulo}</p>
      <p className="text-xs mt-1" style={{ color: "var(--ui-text-2)" }}>{msg}</p>
      {nota && <p className="text-xs mt-2" style={{ color: "var(--ui-text-3)" }}>{nota}</p>}
    </div>
  );
}

/** Aviso flotante de confirmación. Cada módulo tenía el suyo con otro gris. */
export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="tema-oscuro fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 text-sm font-semibold px-5 py-3 rounded-xl shadow-lg pointer-events-none"
      style={{ background: "var(--ui-card-alt)", color: "var(--ui-text)", border: "1px solid var(--ui-border)" }}>
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--ui-ok)" strokeWidth={2.5}><path d="M3 10l4 4 9-9" /></svg>
      {msg}
    </div>
  );
}

// ── Modales ──────────────────────────────────────────────────────────────────

/**
 * Caja de modal sobre el velo. Lleva su propio .tema-oscuro porque se monta en
 * un portal implícito (al final del árbol del módulo) y no siempre queda dentro
 * del contenedor que activa el tema.
 */
export function Modal({ children, onClose, ancho = "lg" }: {
  children: ReactNode; onClose: () => void; ancho?: "sm" | "lg" | "xl" | "2xl";
}) {
  const max = { sm: "max-w-md", lg: "max-w-lg", xl: "max-w-xl", "2xl": "max-w-3xl" }[ancho];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}>
      <div className={`tema-oscuro rounded-2xl shadow-xl w-full ${max} max-h-full overflow-y-auto`}
        style={{ background: "var(--ui-card)", border: "1px solid var(--ui-border)" }}
        onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/**
 * Confirmación de una acción destructiva.
 *
 * Reemplaza al `confirm()` del navegador, que bloquea la pestaña entera, sale
 * con el estilo del sistema operativo y solo puede decir "Aceptar / Cancelar"
 * —nunca qué se va a borrar exactamente—.
 */
export function ModalConfirmar({ titulo, mensaje, textoConfirmar = "Eliminar", trabajando, onConfirmar, onCancelar }: {
  titulo: string;
  mensaje: ReactNode;
  textoConfirmar?: string;
  trabajando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <Modal onClose={() => { if (!trabajando) onCancelar(); }} ancho="sm">
      <ModalHeader titulo={titulo} onClose={onCancelar} />
      <div className="p-5">
        <div className="rounded-lg px-3 py-2.5 mb-4"
          style={{ background: "var(--ui-bad-bg)", border: "1px solid var(--ui-border-soft)" }}>
          <p className="text-xs" style={{ color: "var(--ui-text-2)" }}>{mensaje}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onConfirmar} disabled={trabajando}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: "var(--ui-bad)", color: "var(--ui-bg)" }}>
            {trabajando ? "Eliminando…" : textoConfirmar}
          </button>
          <BotonSecundario onClick={onCancelar} disabled={trabajando}>Cancelar</BotonSecundario>
        </div>
      </div>
    </Modal>
  );
}

export function ModalHeader({ titulo, sub, onClose }: { titulo: string; sub?: string; onClose: () => void }) {
  return (
    <div className="px-5 py-4 flex items-start justify-between gap-3 sticky top-0 z-10"
      style={{ background: "var(--ui-card)", borderBottom: "1px solid var(--ui-border-soft)" }}>
      <div className="min-w-0">
        <h2 className="text-lg font-bold" style={{ color: "var(--ui-text)" }}>{titulo}</h2>
        {sub && <p className="text-xs mt-0.5" style={{ color: "var(--ui-text-3)" }}>{sub}</p>}
      </div>
      <BotonIcono onClick={onClose} title="Cerrar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </BotonIcono>
    </div>
  );
}

// ── Navegación por semana ────────────────────────────────────────────────────

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function masDias(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

function lunesDe(d: Date): Date {
  const day = d.getDay();
  const m = new Date(d);
  m.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  m.setHours(0, 0, 0, 0);
  return m;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Flechas + rango de la semana, con atajo de vuelta a la semana en curso. */
export function WeekNav({ monday, onChange }: { monday: Date; onChange: (d: Date) => void }) {
  const sunday = masDias(monday, 6);
  const label = monday.getMonth() === sunday.getMonth()
    ? `${monday.getDate()}–${sunday.getDate()} ${MESES[monday.getMonth()]} ${monday.getFullYear()}`
    : `${monday.getDate()} ${MESES[monday.getMonth()].slice(0,3)} – ${sunday.getDate()} ${MESES[sunday.getMonth()].slice(0,3)} ${monday.getFullYear()}`;
  const esEstaSemana = iso(monday) === iso(lunesDe(new Date()));
  return (
    <div className="flex items-center gap-1 rounded-lg px-1 py-0.5" style={{ background: "var(--ui-card-alt)" }}>
      <BotonIcono onClick={() => onChange(masDias(monday, -7))} title="Semana anterior"><ChevronLeft size={16} /></BotonIcono>
      <div className="min-w-[190px] text-center leading-tight">
        <span className="block text-sm font-semibold" style={{ color: "var(--ui-text-2)" }}>{label}</span>
        {!esEstaSemana && (
          <button onClick={() => onChange(lunesDe(new Date()))}
            className="text-[10px] transition-colors hover:opacity-80" style={{ color: "var(--ui-gold)" }}>
            volver a esta semana
          </button>
        )}
      </div>
      <BotonIcono onClick={() => onChange(masDias(monday, 7))} title="Semana siguiente"><ChevronRight size={16} /></BotonIcono>
    </div>
  );
}
