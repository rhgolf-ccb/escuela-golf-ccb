"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { TIPO_PLAN_LABEL, acentoGrupo, acentoGrupoSuave, tipoPlanDeAlumno, type TipoPlan } from "@/lib/grupos";
import AvatarAlumno from "@/components/ui/AvatarAlumno";

export type EstudianteVinculado = {
  id: string; full_name: string; grupo_activo: string | null;
  birth_date: string | null; gender: string | null;
  foto_url: string | null;
};
export type DiaPrograma = {
  grupo: TipoPlan; dia_semana: string; fecha: string; tipo_sesion: string; lugar: string;
  hora_inicio: string | null; hora_fin: string | null; objetivo: string; estaciones: string[];
  suspendida?: boolean; motivo_suspension?: string | null;
};
export type ActividadEspecialPadre = { id: string; nombre: string; grupos: TipoPlan[]; fecha: string; hora_inicio: string | null; hora_fin: string | null };
export type EventoCalPadre = { id: string; nombre: string; fecha_inicio: string; fecha_fin: string | null; descripcion: string | null; tipo: "especial" | "institucional" };
export type DiaSinEscuelaPadre = { id: string; fecha_inicio: string; fecha_fin: string; motivo: string | null };

const DIA_LABEL: Record<string, string> = {
  martes: "Martes", miercoles: "Miércoles", jueves: "Jueves",
  viernes: "Viernes", sabado: "Sábado", domingo: "Domingo",
};
const TIPO_SESION_LABEL: Record<string, string> = {
  tiro_largo: "Tiro Largo", juego_corto: "Juego Corto", putt: "Putt",
  campo: "Campo", test_tecnico: "Test Técnico", test_fisico: "Test Físico",
  competencia: "Competencia", damas_estaciones: "Estaciones", juvenil_estaciones: "3 Estaciones",
};
const LUGAR_LABEL: Record<string, string> = {
  campo_practica: "Campo de práctica", putting_green: "Putting Green",
  campo_infantil: "Campo Infantil", campo_pacos_fabios: "Pacos/Fabios", campo_completo: "Campo Completo",
};

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  date.setHours(0, 0, 0, 0);
  return date;
}
function toISODate(d: Date): string { return d.toISOString().split("T")[0]; }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function formatWeekRange(monday: Date): string {
  const dom = addDays(monday, 6);
  return `${monday.toLocaleDateString("es-CO", { day: "numeric", month: "long" })} — ${dom.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}`;
}
function formatFechaCorta(fecha: string): string {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}
function formatHora(t: string | null): string { return t ? t.slice(0, 5) : ""; }
function fechaEnRango(fecha: string, inicio: string, fin: string | null): boolean {
  return fecha >= inicio && fecha <= (fin ?? inicio);
}
const DIA_KEYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
function diaKeyDeFecha(fecha: string): string {
  return DIA_KEYS[new Date(`${fecha}T00:00:00`).getDay()] ?? "";
}
// Festivo/compensatorio ya implican que no hay escuela — se muestran tal cual.
// Otros motivos (torneo, campo cerrado) muestran "Sin escuela".
function etiquetaTipoSinEscuela(motivo: string | null | undefined): string {
  const m = motivo ?? "";
  if (/^festivo/i.test(m)) return "Festivo";
  if (/^compensatorio/i.test(m)) return "Compensatorio";
  return "Sin escuela";
}
// Detalle = el motivo sin el prefijo "Festivo — " / "Compensatorio — " para no repetir.
function detalleSinEscuela(motivo: string | null | undefined): string {
  return (motivo ?? "").trim().replace(/^(festivo|compensatorio|sin escuela)\s*[—:-]?\s*/i, "").trim();
}

export default function CalendarioPadresModule({
  estudiantes, dias, actividades, eventos, diasSinEscuela,
}: {
  estudiantes: EstudianteVinculado[];
  dias: DiaPrograma[];
  actividades: ActividadEspecialPadre[];
  eventos: EventoCalPadre[];
  diasSinEscuela: DiaSinEscuelaPadre[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(estudiantes[0]?.id ?? null);
  const [semana, setSemana] = useState<Date>(() => getMonday(new Date()));

  const selected = estudiantes.find((e) => e.id === selectedId) ?? null;
  const tipoPlan = selected ? tipoPlanDeAlumno(selected) : null;

  if (estudiantes.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">Todavía no tienes ningún alumno asociado a tu cuenta.</p>
        <p className="text-sm text-gray-400 mt-1">Contacta al coordinador de la escuela.</p>
      </div>
    );
  }

  const inicio = toISODate(semana);
  const fin = toISODate(addDays(semana, 6));

  const diasSemana = tipoPlan ? dias.filter((d) => d.grupo === tipoPlan && d.fecha >= inicio && d.fecha <= fin) : [];
  const actividadesSemana = tipoPlan
    ? actividades.filter((a) => a.grupos.includes(tipoPlan) && a.fecha >= inicio && a.fecha <= fin)
    : [];
  const eventosSemana = eventos.filter((e) => fechaEnRango(inicio, e.fecha_inicio, e.fecha_fin) || fechaEnRango(fin, e.fecha_inicio, e.fecha_fin) || (e.fecha_inicio >= inicio && e.fecha_inicio <= fin));
  const diasSinEscuelaSemana = diasSinEscuela.filter((d) => d.fecha_inicio <= fin && d.fecha_fin >= inicio);

  // Sesiones y días sin escuela se muestran juntos, en orden de fecha, para que
  // un festivo aparezca en el lugar del día (ej: "Viernes 7 · Festivo") y no como
  // una tira suelta arriba.
  type FilaDia =
    | { kind: "sesion"; fecha: string; dia: DiaPrograma }
    | { kind: "sin"; fecha: string; sin: DiaSinEscuelaPadre };
  const filasDias: FilaDia[] = [
    ...diasSemana.map((d) => ({ kind: "sesion" as const, fecha: d.fecha, dia: d })),
    ...diasSinEscuelaSemana.map((s) => ({ kind: "sin" as const, fecha: s.fecha_inicio, sin: s })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-5 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-ccb-green flex items-center justify-center shrink-0">
          <CalendarDays size={22} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ccb-green">Calendario</h1>
          <p className="text-sm text-(--text-muted)">Programación y eventos de la escuela</p>
        </div>
      </div>

      {estudiantes.length > 1 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {estudiantes.map((e) => (
            <button
              key={e.id}
              onClick={() => setSelectedId(e.id)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors"
              style={selectedId === e.id ? { background: "#1B4D2E", color: "#fff", borderColor: "#1B4D2E" } : { background: "#fff", color: "#374151", borderColor: "#e5e7eb" }}
            >
              <AvatarAlumno name={e.full_name} fotoUrl={e.foto_url} size={24} fallbackClassName="bg-white/20 text-[10px] font-bold" />
              <span className="text-sm font-medium">{e.full_name}</span>
            </button>
          ))}
        </div>
      )}

      {!tipoPlan ? (
        <p className="text-sm text-gray-400 text-center py-10">
          {selected?.full_name} no tiene un grupo asignado — contacta al coordinador.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-1 mb-4 bg-white rounded-xl border border-gray-100 shadow-sm p-2">
            <button onClick={() => setSemana((s) => addDays(s, -7))} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <div className="flex-1 text-center">
              <p className="text-xs font-semibold text-gray-700">{formatWeekRange(semana)}</p>
              <button onClick={() => setSemana(getMonday(new Date()))} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">esta semana</button>
            </div>
            <button onClick={() => setSemana((s) => addDays(s, 7))} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>

          <div className="space-y-2">
            {eventosSemana.map((e) => (
              <div key={e.id} className="rounded-xl border px-4 py-3" style={{ borderColor: e.tipo === "especial" ? "#b4530930" : "#1565c030", background: e.tipo === "especial" ? "#b4530910" : "#1565c010" }}>
                <p className="text-sm font-bold" style={{ color: e.tipo === "especial" ? "#b45309" : "#1565c0" }}>
                  {e.tipo === "especial" ? "🌟" : "📌"} {e.nombre}
                </p>
                <p className="text-xs text-gray-400">{formatFechaCorta(e.fecha_inicio)}{e.fecha_fin && e.fecha_fin !== e.fecha_inicio ? ` – ${formatFechaCorta(e.fecha_fin)}` : ""}</p>
                {e.descripcion && <p className="text-xs text-gray-500 mt-1">{e.descripcion}</p>}
              </div>
            ))}

            {actividadesSemana.map((a) => (
              <div key={a.id} className="rounded-xl border px-4 py-3" style={{ borderColor: "#b4530930", background: "#b4530910" }}>
                <p className="text-sm font-bold" style={{ color: "#b45309" }}>🌟 {a.nombre}</p>
                <p className="text-xs text-gray-400">
                  {formatFechaCorta(a.fecha)}{a.hora_inicio && ` · ${formatHora(a.hora_inicio)}${a.hora_fin ? `–${formatHora(a.hora_fin)}` : ""}`}
                </p>
              </div>
            ))}

            {filasDias.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">Sin sesiones programadas esta semana.</p>
            ) : (
              filasDias.map((f, i) => {
                if (f.kind === "sin") {
                  const s = f.sin;
                  const detalle = detalleSinEscuela(s.motivo);
                  const rango = s.fecha_fin !== s.fecha_inicio ? ` – ${formatFechaCorta(s.fecha_fin)}` : "";
                  return (
                    <div key={`sin-${s.id}`} className="rounded-xl border border-gray-200 bg-gray-100 px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-bold text-gray-500 capitalize">
                          {DIA_LABEL[diaKeyDeFecha(s.fecha_inicio)] ?? ""} · {formatFechaCorta(s.fecha_inicio)}{rango}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-gray-700">🚫 {etiquetaTipoSinEscuela(s.motivo)}</p>
                      {detalle && <p className="text-xs text-gray-500 mt-1">{detalle}</p>}
                    </div>
                  );
                }
                const d = f.dia;
                return (
                  <div key={`ses-${i}`} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-bold" style={{ color: acentoGrupo(d.grupo) }}>{TIPO_PLAN_LABEL[d.grupo]}</span>
                      <span className="text-xs font-semibold text-gray-500 capitalize">{DIA_LABEL[d.dia_semana] ?? d.dia_semana} · {formatFechaCorta(d.fecha)}</span>
                      {d.suspendida && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#fef2f2", color: "#991b1b" }}>
                          CANCELADA
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-gray-900" style={d.suspendida ? { textDecoration: "line-through", color: "#9ca3af" } : undefined}>
                      {TIPO_SESION_LABEL[d.tipo_sesion] ?? d.tipo_sesion}
                    </p>
                    {d.suspendida && d.motivo_suspension && (
                      <p className="text-xs font-semibold mt-0.5" style={{ color: "#991b1b" }}>{d.motivo_suspension}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {d.hora_inicio && `${formatHora(d.hora_inicio)}${d.hora_fin ? `–${formatHora(d.hora_fin)}` : ""} · `}{LUGAR_LABEL[d.lugar] ?? d.lugar}
                    </p>
                    {d.objetivo && <p className="text-xs text-gray-600 mt-1.5">{d.objetivo}</p>}
                    {d.estaciones.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {d.estaciones.map((est, ei) => (
                          <span key={ei} className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: acentoGrupoSuave(d.grupo), color: acentoGrupo(d.grupo) }}>
                            {est}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
