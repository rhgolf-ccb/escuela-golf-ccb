"use client";

import {
  DIA_LABEL,
  TIPO_PLAN_LABEL,
  prettyFoco,
  sesionesToEstaciones,
  type EstacionView,
  type PlanSemanal,
  type SesionSemana,
  type DiaSemana,
  type TipoPlan,
} from "./ProgramacionModule";

// Plantilla visual del PDF de profesores — misma técnica que
// WeeklyPlanPDFTemplate (snapshot oculto capturado con html2canvas) y el mismo
// lenguaje gráfico, pero con TODO el detalle que el de padres omite:
// número/nombre de estación, responsable, foco, la descripción completa de cada
// drill, el reto de cierre destacado y el calentamiento.
//
// El contenido sale de sesionesToEstaciones(), la misma fuente que la vista de
// pantalla: sesion_juvenil / estaciones_competencia / estaciones_damas, con la
// columna `drills` solo como último fallback.

const VERDE = "#1a3a2a";
const DORADO = "#7d5a00";

const DIA_OFFSET: Record<string, number> = {
  martes: 1, miercoles: 2, jueves: 3, viernes: 4, sabado: 5, domingo: 6,
};

function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function formatFechaCorta(fecha: string): string {
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}
function formatWeekRange(monday: Date): string {
  const dom = addDays(monday, 6);
  const start = monday.toLocaleDateString("es-CO", { day: "numeric", month: "long" });
  const end   = dom.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  return `${start} al ${end}`;
}

const IconCalendar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={VERDE} strokeWidth={2} style={{ display: "block", marginBottom: 6 }}>
    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

interface Props {
  plan: PlanSemanal;
  sesiones: SesionSemana[];
  tipoPlan: TipoPlan;
  semana: Date;
}

interface DiaPlan {
  dia: DiaSemana;
  fecha: string;
  estaciones: EstacionView[];
  calentamiento: SesionSemana["calentamiento"];
}

// Chip de metadato (horario / lugar / responsable / foco).
function Chip({ children, tono }: { children: React.ReactNode; tono: "verde" | "dorado" | "gris" }) {
  const estilos = {
    verde:  { background: "#eaf1ec", color: VERDE },
    dorado: { background: "#f6efdb", color: DORADO },
    gris:   { background: "#f1f1f1", color: "#444444" },
  }[tono];
  return (
    <span style={{
      ...estilos,
      display: "inline-block", borderRadius: 999, padding: "1.5px 7px",
      fontSize: 8.5, fontWeight: 700, lineHeight: 1.4, marginRight: 4, marginBottom: 3,
    }}>
      {children}
    </span>
  );
}

function EstacionBlock({ est, numero }: { est: EstacionView; numero: number }) {
  return (
    <div style={{ marginBottom: 11, border: "1px solid #e2e2e2", borderRadius: 8, overflow: "hidden" }}>
      {/* Título de la estación */}
      <div style={{ background: "#f3f6f3", padding: "6px 8px", borderBottom: "1px solid #e6ebe6" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          <div style={{
            width: 17, height: 17, background: VERDE, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
          }}>
            <span style={{ color: "#ffffff", fontSize: 9, fontWeight: 800, lineHeight: 1 }}>{numero}</span>
          </div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 10.5, color: VERDE, lineHeight: 1.3 }}>
            Estación {numero} — {est.nombre}
          </p>
        </div>
        <div style={{ marginTop: 4 }}>
          {est.horario && <Chip tono="gris">🕘 {est.horario}</Chip>}
          {est.lugar && <Chip tono="gris">📍 {est.lugar}</Chip>}
          {est.responsable && <Chip tono="verde">👤 {est.responsable}</Chip>}
          {est.foco && <Chip tono="dorado">🎯 {prettyFoco(est.foco)}</Chip>}
        </div>
      </div>

      {/* Drills con descripción completa (sin recortar: es el documento de trabajo) */}
      <div style={{ padding: "7px 8px" }}>
        {est.drills.length === 0 && (
          <p style={{ margin: 0, fontSize: 9, color: "#888888", fontStyle: "italic" }}>Sin drills cargados.</p>
        )}
        {est.drills.map((drill, idx) => (
          <div key={idx} style={{ display: "flex", gap: 6, marginBottom: idx === est.drills.length - 1 ? 0 : 7, alignItems: "flex-start" }}>
            <span style={{
              width: 14, height: 14, borderRadius: 3, background: DORADO, color: "#ffffff",
              fontSize: 8, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, marginTop: 1.5, lineHeight: 1,
            }}>
              {idx + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: "0 0 1px", fontWeight: 700, fontSize: 9.5, color: "#111111", lineHeight: 1.3 }}>
                {drill.nombre}
              </p>
              {drill.descripcion && (
                <p style={{ margin: 0, fontSize: 9, color: "#444444", lineHeight: 1.4 }}>
                  {drill.descripcion}
                </p>
              )}
              {(drill.repeticiones || drill.dificultad) && (
                <p style={{ margin: "2px 0 0", fontSize: 8.5, color: "#666666", fontWeight: 600 }}>
                  {[drill.repeticiones, drill.dificultad].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Reto de cierre destacado */}
      {est.reto && (
        <div style={{ background: "#fdf6e3", borderTop: `2px solid ${DORADO}`, padding: "6px 8px" }}>
          <p style={{ margin: "0 0 1px", fontSize: 8.5, fontWeight: 800, color: DORADO, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            🏆 Reto de cierre
          </p>
          <p style={{ margin: 0, fontSize: 9, color: "#3d2f00", lineHeight: 1.4 }}>{est.reto}</p>
        </div>
      )}
    </div>
  );
}

function DayColumn({ dia }: { dia: DiaPlan }) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      border: "1px solid #d0d0d0", borderRadius: 10, overflow: "hidden",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ background: VERDE, padding: "9px 12px" }}>
        <p style={{ margin: 0, color: "#ffffff", fontWeight: 800, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {DIA_LABEL[dia.dia] ?? dia.dia}
        </p>
        <p style={{ margin: "3px 0 0", color: "rgba(255,255,255,0.7)", fontSize: 9.5 }}>
          {formatFechaCorta(dia.fecha)}
        </p>
      </div>

      <div style={{ padding: 10, flex: 1 }}>
        {dia.calentamiento && dia.calentamiento.ejercicios.length > 0 && (
          <div style={{ marginBottom: 11, border: `1px dashed ${DORADO}`, borderRadius: 8, padding: "6px 8px", background: "#fffdf6" }}>
            <p style={{ margin: "0 0 3px", color: DORADO, fontWeight: 800, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Calentamiento ({dia.calentamiento.duracion_min} min)
            </p>
            {dia.calentamiento.ejercicios.map((ej, i) => (
              <p key={i} style={{ margin: 0, fontSize: 9, color: "#444444", lineHeight: 1.4 }}>
                • {ej.nombre}{ej.series_repeticiones ? ` — ${ej.series_repeticiones}` : ""}
              </p>
            ))}
          </div>
        )}

        {dia.estaciones.length === 0 ? (
          <p style={{ margin: 0, fontSize: 9.5, color: "#888888", fontStyle: "italic" }}>Sin programación para este día.</p>
        ) : (
          dia.estaciones.map((est, idx) => (
            <EstacionBlock key={idx} est={est} numero={est.numero ?? idx + 1} />
          ))
        )}
      </div>
    </div>
  );
}

export default function TeacherPlanPDFTemplate({ plan, sesiones, tipoPlan, semana }: Props) {
  // Agrupa TODAS las sesiones de cada día: en Competencia y Damas dos sesiones
  // distintas el mismo día son contenido distinto y ambas deben salir.
  const porDia = new Map<DiaSemana, SesionSemana[]>();
  for (const s of sesiones) {
    const lista = porDia.get(s.dia_semana);
    if (lista) lista.push(s);
    else porDia.set(s.dia_semana, [s]);
  }

  const dias: DiaPlan[] = [...porDia.entries()]
    .sort((a, b) => (DIA_OFFSET[a[0]] ?? 9) - (DIA_OFFSET[b[0]] ?? 9))
    .map(([dia, delDia]) => ({
      dia,
      fecha: delDia[0].fecha,
      estaciones: sesionesToEstaciones(delDia, tipoPlan),
      calentamiento: delDia.find((s) => s.calentamiento && s.calentamiento.ejercicios.length > 0)?.calentamiento ?? null,
    }));

  const numCols = dias.length || 1;

  return (
    <div style={{
      width: 1122,
      minHeight: 794,
      background: "#ffffff",
      fontFamily: "'Arial', 'Helvetica', sans-serif",
      padding: "34px 46px",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* ── ENCABEZADO ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <div style={{ width: 160, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Paco_transparente.png" alt="Logo Escuela de Golf CCB" style={{ height: 66, objectFit: "contain" }} />
          <p style={{
            margin: "6px 0 0", fontSize: 7.5, color: VERDE, fontWeight: 800,
            textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "center", lineHeight: 1.4,
          }}>
            FORMAMOS JUGADORES<br />PARA LA VIDA
          </p>
        </div>

        <div style={{ width: 1.5, background: VERDE, alignSelf: "stretch", margin: "0 20px" }} />

        <div style={{ flex: 1, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 27, fontWeight: 800, color: VERDE, textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.1 }}>
            PLAN DE CLASE — PROFESORES
          </p>
          <p style={{ margin: "5px 0 0", fontSize: 12.5, color: DORADO, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.25em" }}>
            ESCUELA DE GOLF · {TIPO_PLAN_LABEL[tipoPlan] ?? tipoPlan}
          </p>
        </div>

        <div style={{ width: 1.5, background: VERDE, alignSelf: "stretch", margin: "0 20px" }} />

        <div style={{ width: 160, flexShrink: 0, textAlign: "right" }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}><IconCalendar /></div>
          <p style={{ margin: "0 0 2px", fontSize: 10, color: "#888888" }}>Semana del</p>
          <p style={{ margin: 0, fontSize: 11.5, color: "#111111", fontWeight: 700, lineHeight: 1.4 }}>
            {formatWeekRange(semana)}
          </p>
          {plan.foco_mes && (
            <p style={{ margin: "6px 0 0", fontSize: 9.5, color: DORADO, fontWeight: 600, textTransform: "uppercase" }}>
              {plan.foco_mes}
            </p>
          )}
        </div>
      </div>

      <div style={{ height: 3, background: VERDE, borderRadius: 2, marginBottom: 12 }} />

      {/* ── TEMA / OBJETIVO DE LA SEMANA ───────────────────────────────── */}
      {(plan.tema_semanal || plan.descripcion_tema || plan.objetivo_mensual) && (
        <div style={{ background: "#f0f7f3", border: "1px solid #c2ddd0", borderRadius: 8, padding: "9px 13px", marginBottom: 12 }}>
          {plan.tema_semanal && (
            <p style={{ margin: "0 0 3px", fontSize: 10, fontWeight: 800, color: VERDE, textTransform: "uppercase" }}>
              Tema: {plan.tema_semanal}
            </p>
          )}
          {plan.descripcion_tema && (
            <p style={{ margin: 0, fontSize: 9.5, color: "#333333", lineHeight: 1.5 }}>{plan.descripcion_tema}</p>
          )}
          {plan.objetivo_mensual && (
            <p style={{ margin: "3px 0 0", fontSize: 9.5, color: DORADO, fontWeight: 700 }}>
              Objetivo del mes: {plan.objetivo_mensual}
            </p>
          )}
        </div>
      )}

      {/* ── GRID DE DÍAS ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: numCols <= 4 ? 11 : 7, flex: 1, alignItems: "stretch" }}>
        {dias.map((d) => <DayColumn key={`${d.dia}-${d.fecha}`} dia={d} />)}
        {dias.length === 0 && <p style={{ color: "#888888", fontSize: 12 }}>Sin sesiones registradas</p>}
      </div>

      <p style={{ margin: "12px 0 0", textAlign: "center", color: "#aaaaaa", fontSize: 9 }}>
        Escuela de Golf CCB · Documento de trabajo para profesores
      </p>
    </div>
  );
}
