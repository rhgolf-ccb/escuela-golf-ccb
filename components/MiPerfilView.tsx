"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Rol } from "@/lib/roles";

type Estudiante = {
  id: string;
  full_name: string;
  grupo_activo: string | null;
  foto_url: string | null;
  birth_date: string | null;
};

type Tab = "tests" | "asistencia" | "progreso" | "notas";

const TABS: { id: Tab; label: string }[] = [
  { id: "tests", label: "Tests" },
  { id: "asistencia", label: "Asistencia" },
  { id: "progreso", label: "Progreso" },
  { id: "notas", label: "Notas" },
];

function initiales(name: string): string {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

function scoreColor(score: number | null) {
  if (score === null) return { text: "#9CA3AF", bg: "#F9FAFB" };
  if (score >= 8) return { text: "#1D4ED8", bg: "#EFF6FF" };
  if (score >= 6) return { text: "#1B4D2E", bg: "#F0FDF4" };
  if (score >= 4) return { text: "#92400E", bg: "#FFFBEB" };
  return { text: "#991B1B", bg: "#FEF2F2" };
}

function scoreLabel(score: number | null): string {
  if (score === null) return "Sin evaluar";
  if (score >= 8) return "Excelente";
  if (score >= 6) return "Cumple";
  if (score >= 4) return "En progreso";
  return "Bajo";
}

function formatFecha(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
}

type SwingEval = { id: string; evaluation_date: string; evaluation_type: string; score_promedio: number | null; professor_comment: string | null };
type PhysicalEval = { id: string; evaluation_date: string; evaluation_type: string; score_promedio: number | null; professor_comment: string | null };
type AsistenciaRow = { id: string; estado: string; asistio: boolean | null; sesion: { fecha: string; tipo_sesion: string } | null };
type Hito = { id: string; titulo: string; descripcion: string | null; fecha: string; foto_url: string | null };
type Nota = { id: string; contenido: string; imagen_url: string | null; profesor_nombre: string | null; fecha: string };

function EvalCard({ label, ev }: { label: string; ev: { evaluation_date: string; evaluation_type: string; score_promedio: number | null; professor_comment: string | null } }) {
  const c = scoreColor(ev.score_promedio);
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{label}</p>
          <p className="text-sm text-gray-600 capitalize">{ev.evaluation_type} · {formatFecha(ev.evaluation_date)}</p>
        </div>
        <div className="text-right px-3 py-1.5 rounded-lg" style={{ background: c.bg }}>
          <p className="text-lg font-bold" style={{ color: c.text }}>{ev.score_promedio?.toFixed(1) ?? "—"}</p>
          <p className="text-[10px] font-semibold" style={{ color: c.text }}>{scoreLabel(ev.score_promedio)}</p>
        </div>
      </div>
      {ev.professor_comment && <p className="text-sm text-gray-600 mt-2 italic">&ldquo;{ev.professor_comment}&rdquo;</p>}
    </div>
  );
}

export default function MiPerfilView({ rol, estudiantes }: { rol: Rol; estudiantes: Estudiante[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(estudiantes[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>("tests");

  const [swingEvals, setSwingEvals] = useState<SwingEval[]>([]);
  const [physicalEvals, setPhysicalEvals] = useState<PhysicalEval[]>([]);
  const [asistencias, setAsistencias] = useState<AsistenciaRow[]>([]);
  const [hitos, setHitos] = useState<Hito[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [loading, setLoading] = useState(false);

  const selected = estudiantes.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    (async () => {
      if (tab === "tests") {
        const [{ data: sw }, { data: ph }] = await Promise.all([
          supabase.from("swing_evaluations").select("id, evaluation_date, evaluation_type, score_promedio, professor_comment").eq("student_id", selected.id).order("evaluation_date", { ascending: false }),
          supabase.from("physical_evaluations").select("id, evaluation_date, evaluation_type, score_promedio, professor_comment").eq("student_id", selected.id).order("evaluation_date", { ascending: false }),
        ]);
        setSwingEvals(sw ?? []);
        setPhysicalEvals(ph ?? []);
      } else if (tab === "asistencia") {
        const { data } = await supabase
          .from("reservas")
          .select("id, estado, asistio, sesiones_semana!reservas_sesion_id_fkey(fecha, tipo_sesion)")
          .eq("estudiante_id", selected.id);
        const rows = (data ?? []).map((r) => ({
          id: r.id,
          estado: r.estado,
          asistio: r.asistio,
          sesion: Array.isArray(r.sesiones_semana) ? r.sesiones_semana[0] : r.sesiones_semana,
        })).sort((a, b) => (b.sesion?.fecha ?? "").localeCompare(a.sesion?.fecha ?? ""));
        setAsistencias(rows);
      } else if (tab === "progreso") {
        const { data } = await supabase.from("hitos").select("*").eq("alumno_id", selected.id).order("fecha", { ascending: false });
        setHitos(data ?? []);
      } else if (tab === "notas") {
        const { data } = await supabase.from("notas_profesor").select("*").eq("alumno_id", selected.id).order("fecha", { ascending: false });
        setNotas((data as Nota[]) ?? []);
      }
      setLoading(false);
    })();
  }, [tab, selected]);

  if (estudiantes.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">Todavía no tienes ningún alumno asociado a tu cuenta.</p>
        <p className="text-sm text-gray-400 mt-1">Contacta al coordinador de la escuela.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        {selected ? `Perfil de ${selected.full_name}` : "Mi Perfil"}
      </h1>
      <p className="text-sm text-gray-400 mb-4">Consulta el progreso y la información de tu(s) alumno(s)</p>

      {(rol === "padre_competencia" || rol === "alumno_competencia") && (
        <Link
          href="/reservas"
          className="flex items-center justify-between gap-3 mb-5 px-4 py-3 rounded-xl border border-green-100 bg-green-50 hover:bg-green-100 transition-colors"
        >
          <span className="text-sm font-medium text-green-900">Reserva tu próxima clase</span>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#166534" strokeWidth={2}><path d="M9 18l6-6-6-6"/></svg>
        </Link>
      )}

      {estudiantes.length > 1 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {estudiantes.map((e) => (
            <button
              key={e.id}
              onClick={() => setSelectedId(e.id)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors"
              style={selectedId === e.id ? { background: "#1a3a2a", color: "#fff", borderColor: "#1a3a2a" } : { background: "#fff", color: "#374151", borderColor: "#e5e7eb" }}
            >
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">{initiales(e.full_name)}</span>
              <span className="text-sm font-medium">{e.full_name}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5 flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 shrink-0">
              {initiales(selected.full_name)}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{selected.full_name}</p>
              {selected.grupo_activo && <p className="text-xs text-gray-400">{selected.grupo_activo}</p>}
            </div>
          </div>

          <div className="flex gap-1 mb-5 border-b border-gray-100">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="px-4 py-2 text-sm font-semibold border-b-2 transition-colors"
                style={tab === t.id ? { borderColor: "#1a3a2a", color: "#1a3a2a" } : { borderColor: "transparent", color: "#9ca3af" }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-10">Cargando...</p>
          ) : (
            <div className="space-y-3">
              {tab === "tests" && (
                swingEvals.length === 0 && physicalEvals.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-10">Sin evaluaciones registradas todavía.</p>
                ) : (
                  <>
                    {swingEvals.map((ev) => <EvalCard key={ev.id} label="Evaluación técnica" ev={ev} />)}
                    {physicalEvals.map((ev) => <EvalCard key={ev.id} label="Evaluación física" ev={ev} />)}
                  </>
                )
              )}

              {tab === "asistencia" && (
                asistencias.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-10">Sin sesiones registradas todavía.</p>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                    {asistencias.map((a) => (
                      <div key={a.id} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900 capitalize">{formatFecha(a.sesion?.fecha ?? null)}</p>
                          <p className="text-xs text-gray-400">{a.sesion?.tipo_sesion ?? ""}</p>
                        </div>
                        <span
                          className="text-xs font-semibold px-2 py-1 rounded-full"
                          style={a.asistio === true ? { background: "#dcfce7", color: "#166534" } : a.asistio === false ? { background: "#fee2e2", color: "#991b1b" } : { background: "#f3f4f6", color: "#6b7280" }}
                        >
                          {a.asistio === true ? "Presente" : a.asistio === false ? "Ausente" : "Pendiente"}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              )}

              {tab === "progreso" && (
                hitos.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-10">Sin hitos registrados todavía.</p>
                ) : (
                  hitos.map((h) => (
                    <div key={h.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                      <p className="text-xs text-gray-400">{formatFecha(h.fecha)}</p>
                      <p className="font-semibold text-gray-900 mt-0.5">{h.titulo}</p>
                      {h.descripcion && <p className="text-sm text-gray-600 mt-1">{h.descripcion}</p>}
                      {h.foto_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={h.foto_url} alt={h.titulo} className="mt-2 rounded-lg max-h-64 object-cover" />
                      )}
                    </div>
                  ))
                )
              )}

              {tab === "notas" && (
                notas.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-10">Sin notas registradas todavía.</p>
                ) : (
                  notas.map((n) => (
                    <div key={n.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-gray-400">{formatFecha(n.fecha)}</p>
                        {n.profesor_nombre && <p className="text-xs text-gray-400">{n.profesor_nombre}</p>}
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{n.contenido}</p>
                      {n.imagen_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={n.imagen_url} alt="" className="mt-2 rounded-lg max-h-64 object-cover" />
                      )}
                    </div>
                  ))
                )
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
