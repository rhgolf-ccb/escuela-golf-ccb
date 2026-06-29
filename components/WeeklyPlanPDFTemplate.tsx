"use client";

// ── Tipos mínimos necesarios (espeja los de ProgramacionModule) ───────────────
interface Drill {
  titulo: string;
  descripcion: string;
}
interface EstacionDamas { nombre: string; lugar: string; duracion_min: number; descripcion: string; }
interface SesionSemana {
  id: string; plan_id: string; dia_semana: string; fecha: string;
  tipo_sesion: string; lugar: string;
  hora_inicio: string | null; hora_fin: string | null;
  objetivo: string; drills: Drill[];
  juego_competitivo: string | null; estaciones_damas: EstacionDamas[] | null;
  notas: string | null; asistencia_registrada: boolean;
}
interface PlanSemanal {
  id: string; semana_inicio: string; tipo_plan: string;
  tema_semanal: string; descripcion_tema: string;
  objetivo_mensual: string | null; foco_mes: string | null; created_at: string;
}

const DIA_LABEL: Record<string, string> = {
  martes: "Martes", miercoles: "Miércoles", jueves: "Jueves",
  viernes: "Viernes", sabado: "Sábado", domingo: "Domingo",
};
const LUGAR_LABEL: Record<string, string> = {
  driving_range: "Driving Range / Campo de Práctica",
  putting_green: "Putting Green",
  campo_infantil: "Campo Infantil",
  campo_pacos_fabios: "Campo Pacos & Fabios",
  campo_completo: "Campo Completo",
};
const DIA_OFFSET: Record<string, number> = {
  martes: 1, miercoles: 2, jueves: 3, viernes: 4, sabado: 5, domingo: 6,
};

function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function formatFechaCorta(fecha: string): string {
  const d = new Date(fecha + "T00:00:00");
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}
function formatHora(t: string | null): string { return t ? t.slice(0, 5) : ""; }
function formatWeekRange(monday: Date): string {
  const dom = addDays(monday, 6);
  const start = monday.toLocaleDateString("es-CO", { day: "numeric", month: "long" });
  const end   = dom.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  return `${start} al ${end}`;
}

// ── Íconos SVG inline ─────────────────────────────────────────────────────────
const IconClock = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1a3a2a" strokeWidth={2.2} style={{ display: "inline", verticalAlign: "middle", marginRight: 5 }}>
    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
  </svg>
);
const IconFlag = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1a3a2a" strokeWidth={2.2} style={{ display: "inline", verticalAlign: "middle", marginRight: 5 }}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
  </svg>
);
const IconTarget = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1a3a2a" strokeWidth={2.2} style={{ display: "inline", verticalAlign: "middle", marginRight: 5 }}>
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
  </svg>
);
const IconBulb = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1a3a2a" strokeWidth={2.2} style={{ display: "inline", verticalAlign: "middle", marginRight: 5 }}>
    <path d="M9 21h6m-6-3h6M12 3a7 7 0 0 1 4 12.7V18H8v-2.3A7 7 0 0 1 12 3z"/>
  </svg>
);
const IconCalendar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a3a2a" strokeWidth={2} style={{ display: "block", marginBottom: 6 }}>
    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
  </svg>
);

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  plan: PlanSemanal;
  sesiones: SesionSemana[];
  tipoPlan: string;
  semana: Date;
}

// ── Columna de un día ─────────────────────────────────────────────────────────
function DayColumn({ sesion }: { sesion: SesionSemana }) {
  const drillsToShow = (sesion.drills ?? []).slice(0, 3);
  const lugarLabel = LUGAR_LABEL[sesion.lugar] ?? sesion.lugar ?? "—";

  return (
    <div style={{
      flex: 1, minWidth: 0,
      border: "1px solid #d0d0d0",
      borderRadius: 10,
      overflow: "hidden",
      display: "flex", flexDirection: "column",
    }}>
      {/* Cabecera del día */}
      <div style={{ background: "#1a3a2a", padding: "10px 14px" }}>
        <p style={{ margin: 0, color: "#ffffff", fontWeight: 800, fontSize: 15, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {DIA_LABEL[sesion.dia_semana] ?? sesion.dia_semana}
        </p>
        <p style={{ margin: "3px 0 0", color: "rgba(255,255,255,0.65)", fontSize: 10 }}>
          {formatFechaCorta(sesion.fecha)}
        </p>
      </div>

      {/* Cuerpo */}
      <div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 0 }}>
        {/* Horario */}
        {sesion.hora_inicio && (
          <p style={{ margin: "0 0 7px", fontSize: 11, color: "#222", display: "flex", alignItems: "center" }}>
            <IconClock />
            <span>{formatHora(sesion.hora_inicio)} – {formatHora(sesion.hora_fin)} p.m.</span>
          </p>
        )}

        {/* Lugar */}
        <p style={{ margin: "0 0 5px", fontSize: 10.5, color: "#222", display: "flex", alignItems: "flex-start" }}>
          <IconFlag />
          <span>
            <span style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 10, color: "#1a3a2a" }}>Lugar: </span>
            <span style={{ textTransform: "uppercase", fontSize: 10 }}>{lugarLabel}</span>
          </span>
        </p>

        {/* Foco */}
        {sesion.objetivo && (
          <p style={{ margin: "0 0 10px", fontSize: 10.5, color: "#222", display: "flex", alignItems: "flex-start" }}>
            <IconTarget />
            <span>
              <span style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 10, color: "#1a3a2a" }}>Foco de clase: </span>
              <span style={{ textTransform: "uppercase", fontSize: 10, color: "#1a3a2a", fontWeight: 600 }}>
                {sesion.objetivo.slice(0, 80)}{sesion.objetivo.length > 80 ? "…" : ""}
              </span>
            </span>
          </p>
        )}

        {/* Separador */}
        <div style={{ height: 1, background: "#e0e0e0", margin: "2px 0 9px" }} />

        {/* Drills */}
        {drillsToShow.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <p style={{ margin: "0 0 7px", color: "#c8a84b", fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Drills:
            </p>
            {drillsToShow.map((drill, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 7, alignItems: "flex-start" }}>
                <div style={{
                  width: 18, height: 18, background: "#1a3a2a", borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, marginTop: 1,
                }}>
                  <span style={{ color: "#ffffff", fontSize: 9, fontWeight: 800, lineHeight: 1 }}>{idx + 1}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: "0 0 1px", fontWeight: 700, fontSize: 10.5, color: "#1a1a1a", lineHeight: 1.3 }}>
                    {drill.titulo}
                  </p>
                  {drill.descripcion && (
                    <p style={{ margin: 0, fontSize: 9.5, color: "#555555", lineHeight: 1.35 }}>
                      {drill.descripcion.slice(0, 90)}{drill.descripcion.length > 90 ? "…" : ""}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Estaciones Damas */}
        {sesion.estaciones_damas && sesion.estaciones_damas.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <p style={{ margin: "0 0 7px", color: "#c8a84b", fontWeight: 800, fontSize: 11, textTransform: "uppercase" }}>
              Estaciones:
            </p>
            {sesion.estaciones_damas.slice(0, 3).map((est, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 5, alignItems: "flex-start" }}>
                <div style={{
                  width: 18, height: 18, background: "#1a3a2a", borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
                }}>
                  <span style={{ color: "#ffffff", fontSize: 9, fontWeight: 800, lineHeight: 1 }}>{idx + 1}</span>
                </div>
                <div>
                  <p style={{ margin: "0 0 1px", fontWeight: 700, fontSize: 10.5, color: "#1a1a1a" }}>
                    {est.nombre} <span style={{ fontWeight: 400, color: "#666" }}>· {est.duracion_min} min</span>
                  </p>
                  {est.descripcion && (
                    <p style={{ margin: 0, fontSize: 9.5, color: "#555" }}>{est.descripcion.slice(0, 90)}{est.descripcion.length > 90 ? "…" : ""}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Objetivo box */}
        {sesion.objetivo && (
          <div style={{
            background: "#f5f5f5", border: "1px solid #e0e0e0",
            borderRadius: 7, padding: "8px 10px", marginTop: "auto",
          }}>
            <p style={{ margin: "0 0 3px", display: "flex", alignItems: "center", fontWeight: 700, fontSize: 10, color: "#1a3a2a" }}>
              <IconBulb />OBJETIVO:
            </p>
            <p style={{ margin: 0, fontSize: 10, color: "#333333", lineHeight: 1.4 }}>
              {sesion.objetivo.slice(0, 120)}{sesion.objetivo.length > 120 ? "…" : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function WeeklyPlanPDFTemplate({ plan, sesiones, tipoPlan, semana }: Props) {
  const TIPO_LABEL: Record<string, string> = { juvenil: "Juvenil", competencia: "Competencia", damas: "Damas" };

  // Ordenar sesiones por día
  const sesionesOrdenadas = [...sesiones].sort((a, b) => {
    const oa = DIA_OFFSET[a.dia_semana] ?? 9;
    const ob = DIA_OFFSET[b.dia_semana] ?? 9;
    return oa - ob;
  });

  // Una sesión por día (la primera) para el PDF padres
  const sesionesPorDia = sesionesOrdenadas.reduce<SesionSemana[]>((acc, s) => {
    if (!acc.some((x) => x.dia_semana === s.dia_semana)) acc.push(s);
    return acc;
  }, []);

  const weekRange = formatWeekRange(semana);
  const numCols = sesionesPorDia.length || 1;

  return (
    <div style={{
      width: 1122,
      minHeight: 794,
      background: "#ffffff",
      fontFamily: "'Arial', 'Helvetica', sans-serif",
      padding: "40px 57px",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* ── ENCABEZADO ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 14 }}>
        {/* Logo izquierda */}
        <div style={{ width: 170, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Paco_transparente.png"
            alt="Logo Escuela de Golf CCB"
            style={{ height: 72, objectFit: "contain" }}
          />
          <p style={{
            margin: "6px 0 0", fontSize: 7.5, color: "#1a3a2a", fontWeight: 800,
            textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "center",
            lineHeight: 1.4,
          }}>
            FORMAMOS JUGADORES<br />PARA LA VIDA
          </p>
        </div>

        {/* Divider */}
        <div style={{ width: 1.5, background: "#1a3a2a", alignSelf: "stretch", margin: "0 22px" }} />

        {/* Centro */}
        <div style={{ flex: 1, textAlign: "center" }}>
          <p style={{
            margin: 0, fontSize: 30, fontWeight: 800, color: "#1a3a2a",
            textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.1,
          }}>
            PROGRAMACIÓN SEMANAL
          </p>
          <p style={{
            margin: "5px 0 0", fontSize: 13, color: "#c8a84b", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.25em",
          }}>
            ESCUELA DE GOLF · {TIPO_LABEL[tipoPlan] ?? tipoPlan}
          </p>
        </div>

        {/* Divider */}
        <div style={{ width: 1.5, background: "#1a3a2a", alignSelf: "stretch", margin: "0 22px" }} />

        {/* Derecha — fecha */}
        <div style={{ width: 170, flexShrink: 0, textAlign: "right" }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <IconCalendar />
          </div>
          <p style={{ margin: "0 0 2px", fontSize: 10, color: "#888888" }}>Semana del</p>
          <p style={{ margin: 0, fontSize: 12, color: "#111111", fontWeight: 700, lineHeight: 1.4 }}>
            {weekRange}
          </p>
          {plan.foco_mes && (
            <p style={{ margin: "6px 0 0", fontSize: 9.5, color: "#c8a84b", fontWeight: 600, textTransform: "uppercase" }}>
              {plan.foco_mes}
            </p>
          )}
        </div>
      </div>

      {/* ── SUBTÍTULO ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 12 }}>
        <p style={{ margin: "0 0 2px", fontSize: 11, color: "#444444" }}>
          Conoce los temas y objetivos que trabajaremos esta semana.
        </p>
        <p style={{ margin: 0, fontSize: 11, color: "#111111", fontWeight: 700 }}>
          ¡Gracias por ser parte de nuestra escuela!
        </p>
      </div>

      {/* ── LÍNEA SEPARADORA ───────────────────────────────────────────── */}
      <div style={{ height: 3, background: "#1a3a2a", borderRadius: 2, marginBottom: 16 }} />

      {/* ── TEMA DE LA SEMANA (si hay descripción) ─────────────────────── */}
      {plan.descripcion_tema && (
        <div style={{
          background: "#f0f7f3", border: "1px solid #c2ddd0", borderRadius: 8,
          padding: "10px 14px", marginBottom: 14,
        }}>
          <p style={{ margin: "0 0 3px", fontSize: 10, fontWeight: 700, color: "#1a3a2a", textTransform: "uppercase" }}>
            Tema: {plan.tema_semanal}
          </p>
          <p style={{ margin: 0, fontSize: 10, color: "#333", lineHeight: 1.5 }}>
            {plan.descripcion_tema}
          </p>
        </div>
      )}

      {/* ── GRID DE DÍAS ───────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        gap: numCols <= 4 ? 12 : 8,
        flex: 1,
        alignItems: "stretch",
      }}>
        {sesionesPorDia.map((sesion) => (
          <DayColumn key={sesion.id} sesion={sesion} />
        ))}
        {sesionesPorDia.length === 0 && (
          <p style={{ color: "#888", fontSize: 12 }}>Sin sesiones registradas</p>
        )}
      </div>

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <p style={{
        margin: "14px 0 0", textAlign: "center",
        color: "#aaaaaa", fontSize: 9,
      }}>
        Escuela de Golf CCB · Para consultas, contacte a su instructor
      </p>
    </div>
  );
}
