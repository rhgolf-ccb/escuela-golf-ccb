"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────────────
type TipoPlan = "juvenil" | "competencia" | "damas";
type DiaSemana = "martes" | "miercoles" | "jueves" | "viernes" | "sabado" | "domingo";
type FiltroGrupo = "todos" | TipoPlan;

interface SesionConInfo {
  id: string;
  plan_id: string;
  dia_semana: DiaSemana;
  fecha: string;
  tipo_sesion: string;
  lugar: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  objetivo: string;
  cupo_maximo: number;
  tipo_plan: TipoPlan;
  confirmados: number;
  en_espera: number;
}

interface StudentRow {
  id: string;
  full_name: string;
  grupo_activo: string | null;
  foto_url?: string | null;
}

interface ReservaConEstudiante {
  id: string;
  sesion_id: string;
  estudiante_id: string;
  estado: "confirmado" | "en_espera";
  posicion_espera: number | null;
  created_at: string;
  students: StudentRow;
}

interface StudentSearch {
  id: string;
  full_name: string;
  grupo_activo: string | null;
  status: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const DIA_OFFSET: Record<DiaSemana, number> = {
  martes: 1, miercoles: 2, jueves: 3, viernes: 4, sabado: 5, domingo: 6,
};
const DIA_LABEL: Record<DiaSemana, string> = {
  martes: "Martes", miercoles: "Miércoles", jueves: "Jueves",
  viernes: "Viernes", sabado: "Sábado", domingo: "Domingo",
};
const CAL_DIAS: DiaSemana[] = ["martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const TIPO_PLAN_LABEL: Record<TipoPlan, string> = {
  juvenil: "Juvenil", competencia: "Competencia", damas: "Damas",
};
const GROUP_COLOR: Record<TipoPlan, string> = {
  juvenil: "#1a3a2a", competencia: "#7d5a00", damas: "#4a1070",
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  date.setHours(0, 0, 0, 0);
  return date;
}
function toISODate(d: Date): string { return d.toISOString().split("T")[0]; }
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function formatWeekRange(monday: Date): string {
  const dom = addDays(monday, 6);
  return `${monday.toLocaleDateString("es-CO", { day: "numeric", month: "long" })} — ${dom.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}`;
}
function formatHora(t: string | null): string { return t ? t.slice(0, 5) : ""; }
function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}
function cupoBarColor(confirmados: number, cupoMax: number): string {
  const pct = cupoMax > 0 ? confirmados / cupoMax : 0;
  if (pct >= 1) return "#dc2626";
  if (pct >= 0.8) return "#92400e";
  return "#1a3a2a";
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, color, size = 8 }: { name: string; color: string; size?: number }) {
  return (
    <div
      className={`w-${size} h-${size} rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}
      style={{ background: color, width: size * 4, height: size * 4 }}
    >
      {getInitials(name)}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ReservasModule() {
  const searchParams = useSearchParams();

  const [semana, setSemana] = useState<Date>(() => getMonday(new Date()));
  const [filtroGrupo, setFiltroGrupo] = useState<FiltroGrupo>("todos");
  const [sesiones, setSesiones] = useState<SesionConInfo[]>([]);
  const [loadingSesiones, setLoadingSesiones] = useState(false);

  const [sesionSel, setSesionSel] = useState<SesionConInfo | null>(null);
  const [reservas, setReservas] = useState<ReservaConEstudiante[]>([]);
  const [loadingReservas, setLoadingReservas] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StudentSearch[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [alumnoSel, setAlumnoSel] = useState<StudentSearch | null>(null);

  const [inscribiendo, setInscribiendo] = useState(false);
  const [confirmEliminar, setConfirmEliminar] = useState<ReservaConEstudiante | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500); }

  // ── Fetch sessions for the week ───────────────────────────────────────────
  const fetchSesiones = useCallback(async () => {
    setLoadingSesiones(true);
    const semanaStr = toISODate(semana);

    const { data: planes } = await supabase
      .from("planes_semanales")
      .select("id, tipo_plan")
      .eq("semana_inicio", semanaStr);

    if (!planes?.length) { setSesiones([]); setLoadingSesiones(false); return; }

    const planMap: Record<string, TipoPlan> = Object.fromEntries(
      planes.map((p) => [p.id, p.tipo_plan as TipoPlan])
    );

    const { data: sesData } = await supabase
      .from("sesiones_semana")
      .select("id, plan_id, dia_semana, fecha, tipo_sesion, lugar, hora_inicio, hora_fin, objetivo, cupo_maximo")
      .in("plan_id", planes.map((p) => p.id))
      .order("hora_inicio");

    if (!sesData?.length) { setSesiones([]); setLoadingSesiones(false); return; }

    const sesIds = sesData.map((s) => s.id);
    const { data: resData } = await supabase
      .from("reservas")
      .select("sesion_id, estado")
      .in("sesion_id", sesIds);

    const countMap: Record<string, { confirmados: number; en_espera: number }> = {};
    for (const r of resData ?? []) {
      if (!countMap[r.sesion_id]) countMap[r.sesion_id] = { confirmados: 0, en_espera: 0 };
      if (r.estado === "confirmado") countMap[r.sesion_id].confirmados++;
      else countMap[r.sesion_id].en_espera++;
    }

    const result: SesionConInfo[] = (sesData as Array<{
      id: string; plan_id: string; dia_semana: DiaSemana; fecha: string;
      tipo_sesion: string; lugar: string; hora_inicio: string | null;
      hora_fin: string | null; objetivo: string; cupo_maximo: number;
    }>).map((s) => ({
      ...s,
      tipo_plan: planMap[s.plan_id],
      confirmados: countMap[s.id]?.confirmados ?? 0,
      en_espera: countMap[s.id]?.en_espera ?? 0,
    }));

    setSesiones(result);
    setLoadingSesiones(false);

    // Auto-select from URL param
    const paramId = searchParams.get("sesion");
    if (paramId) {
      const found = result.find((s) => s.id === paramId);
      if (found) setSesionSel(found);
    }
  }, [semana, searchParams]);

  useEffect(() => { fetchSesiones(); }, [fetchSesiones]);

  // ── Fetch reservas for selected session ───────────────────────────────────
  const fetchReservas = useCallback(async (sesionId: string) => {
    setLoadingReservas(true);
    const { data, error } = await supabase
      .from("reservas")
      .select("id, sesion_id, estudiante_id, estado, posicion_espera, created_at, students!reservas_estudiante_id_fkey(id, full_name, grupo_activo, foto_url)")
      .eq("sesion_id", sesionId)
      .order("estado")
      .order("posicion_espera", { ascending: true, nullsFirst: false })
      .order("created_at");
    if (error) {
      console.error("[ReservasModule] fetchReservas error:", error);
      setLoadingReservas(false);
      return;
    }
    const normalized = (data ?? []).map((r) => ({
      ...r,
      students: Array.isArray(r.students) ? r.students[0] : r.students,
    }));
    setReservas(normalized as ReservaConEstudiante[]);
    setLoadingReservas(false);
  }, []);

  useEffect(() => {
    if (sesionSel) fetchReservas(sesionSel.id);
    else setReservas([]);
  }, [sesionSel, fetchReservas]);

  // ── Student search with 300ms debounce ───────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchQuery.length < 2 || !sesionSel) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      const tipoPlan = sesionSel.tipo_plan;
      let q = supabase
        .from("students")
        .select("id, full_name, grupo_activo")
        .ilike("full_name", `%${searchQuery}%`)
        .eq("status", "activo")
        .order("full_name")
        .limit(10);
      if (tipoPlan === "competencia") {
        q = q.eq("grupo_activo", "Competencia");
      } else if (tipoPlan === "juvenil") {
        q = q.in("grupo_activo", ["Birdies", "Águilas", "Albatros", "+14"]);
      } else if (tipoPlan === "damas") {
        q = q.in("grupo_activo", ["Damas", "Damas Senior"]);
      }
      const { data } = await q;
      setSearchResults((data as StudentSearch[]) ?? []);
      setShowDropdown(true);
      setSearchLoading(false);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, sesionSel]);

  // ── Inscribir ─────────────────────────────────────────────────────────────
  async function handleInscribir() {
    if (!alumnoSel || !sesionSel) return;
    setInscribiendo(true);

    const confCount = reservas.filter((r) => r.estado === "confirmado").length;
    const espCount  = reservas.filter((r) => r.estado === "en_espera").length;
    const estado    = confCount < sesionSel.cupo_maximo ? "confirmado" : "en_espera";
    const posicion  = estado === "en_espera" ? espCount + 1 : null;

    const { error } = await supabase.from("reservas").insert({
      sesion_id: sesionSel.id,
      estudiante_id: alumnoSel.id,
      estado,
      posicion_espera: posicion,
    }).select("id");

    if (error) {
      showToast(error.code === "23505"
        ? "El alumno ya está inscrito en esta sesión"
        : "Error al inscribir: " + error.message);
    } else {
      showToast(estado === "confirmado"
        ? `${alumnoSel.full_name} inscrito ✓`
        : `${alumnoSel.full_name} en lista de espera (pos. ${posicion})`);
      setAlumnoSel(null);
      setSearchQuery("");
      await fetchReservas(sesionSel.id);
      await fetchSesiones();
    }
    setInscribiendo(false);
  }

  // ── Eliminar reserva ──────────────────────────────────────────────────────
  async function handleEliminar(reserva: ReservaConEstudiante) {
    setEliminando(true);
    const eraConfirmado = reserva.estado === "confirmado";

    await supabase.from("reservas").delete().eq("id", reserva.id);

    const restantes = reservas.filter((r) => r.id !== reserva.id);
    const enEsperaRestantes = restantes
      .filter((r) => r.estado === "en_espera")
      .sort((a, b) => (a.posicion_espera ?? 99) - (b.posicion_espera ?? 99));

    if (eraConfirmado && enEsperaRestantes.length > 0) {
      const primero = enEsperaRestantes[0];
      await supabase.from("reservas")
        .update({ estado: "confirmado", posicion_espera: null })
        .eq("id", primero.id);

      for (let i = 1; i < enEsperaRestantes.length; i++) {
        await supabase.from("reservas")
          .update({ posicion_espera: i })
          .eq("id", enEsperaRestantes[i].id);
      }
    } else if (!eraConfirmado) {
      for (let i = 0; i < enEsperaRestantes.length; i++) {
        await supabase.from("reservas")
          .update({ posicion_espera: i + 1 })
          .eq("id", enEsperaRestantes[i].id);
      }
    }

    showToast("Reserva eliminada");
    setConfirmEliminar(null);
    setEliminando(false);
    await fetchReservas(sesionSel!.id);
    await fetchSesiones();
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const sesionesFiltradas = sesiones.filter(
    (s) => filtroGrupo === "todos" || s.tipo_plan === filtroGrupo
  );
  const confirmados = reservas.filter((r) => r.estado === "confirmado");
  const enEspera    = reservas
    .filter((r) => r.estado === "en_espera")
    .sort((a, b) => (a.posicion_espera ?? 99) - (b.posicion_espera ?? 99));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg pointer-events-none">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#4ade80" strokeWidth={2.5}><path d="M3 10l4 4 9-9"/></svg>
          {toast}
        </div>
      )}

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reservas</h1>
        <p className="text-sm text-gray-400 mt-0.5">Gestión de inscritos por sesión</p>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-5 items-start">

        {/* ── LEFT COLUMN (280px) ────────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 space-y-3">

          {/* Week navigator + group filter */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-3">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSemana((s) => addDays(s, -7))}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <div className="flex-1 text-center">
                <p className="text-xs font-semibold text-gray-700 leading-snug">{formatWeekRange(semana)}</p>
                <button onClick={() => setSemana(getMonday(new Date()))} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">
                  esta semana
                </button>
              </div>
              <button
                onClick={() => setSemana((s) => addDays(s, 7))}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>

            {/* Group filter chips */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setFiltroGrupo("todos")}
                className="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all"
                style={filtroGrupo === "todos"
                  ? { background: "#1f2937", color: "#fff", borderColor: "#1f2937" }
                  : { background: "#f9fafb", color: "#6b7280", borderColor: "#e5e7eb" }}
              >
                Todos
              </button>
              {(["juvenil", "competencia", "damas"] as TipoPlan[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setFiltroGrupo(g)}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all"
                  style={filtroGrupo === g
                    ? { background: GROUP_COLOR[g], color: "#fff", borderColor: GROUP_COLOR[g] }
                    : { background: "#f9fafb", color: "#6b7280", borderColor: "#e5e7eb" }}
                >
                  {TIPO_PLAN_LABEL[g]}
                </button>
              ))}
            </div>
          </div>

          {/* Session list */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {loadingSesiones ? (
              <div className="py-10 text-center">
                <svg className="animate-spin h-5 w-5 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                <p className="text-xs text-gray-400">Cargando...</p>
              </div>
            ) : sesionesFiltradas.length === 0 ? (
              <div className="py-10 text-center px-4">
                <p className="text-sm text-gray-400">Sin sesiones esta semana</p>
                <p className="text-xs text-gray-300 mt-1">Crea un plan en Programación</p>
              </div>
            ) : (
              <div>
                {CAL_DIAS.map((dia) => {
                  const daySes = sesionesFiltradas.filter((s) => s.dia_semana === dia);
                  if (!daySes.length) return null;
                  const fecha = toISODate(addDays(semana, DIA_OFFSET[dia]));
                  return (
                    <div key={dia}>
                      <div className="px-3 py-2 bg-gray-50 border-b border-t border-gray-100">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                          {DIA_LABEL[dia]}{" "}
                          <span className="font-normal text-gray-400">
                            {new Date(fecha + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                          </span>
                        </p>
                      </div>
                      {daySes.map((ses) => {
                        const isSelected = sesionSel?.id === ses.id;
                        const pct = ses.cupo_maximo > 0 ? ses.confirmados / ses.cupo_maximo : 0;
                        const barColor = cupoBarColor(ses.confirmados, ses.cupo_maximo);
                        return (
                          <button
                            key={ses.id}
                            onClick={() => setSesionSel(isSelected ? null : ses)}
                            className="w-full text-left px-3 py-2.5 border-b border-gray-50 transition-colors hover:bg-gray-50"
                            style={isSelected ? { background: GROUP_COLOR[ses.tipo_plan] + "12" } : undefined}
                          >
                            <div className="flex items-start gap-2">
                              <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: GROUP_COLOR[ses.tipo_plan] }} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] font-bold" style={{ color: GROUP_COLOR[ses.tipo_plan] }}>
                                    {TIPO_PLAN_LABEL[ses.tipo_plan]}
                                  </span>
                                  {ses.hora_inicio && (
                                    <span className="text-[10px] text-gray-400">{formatHora(ses.hora_inicio)}</span>
                                  )}
                                </div>
                                {ses.objetivo && (
                                  <p className="text-xs text-gray-600 truncate mt-0.5">{ses.objetivo}</p>
                                )}
                                <div className="mt-1.5 flex items-center gap-2">
                                  <span className="text-[11px] font-bold" style={{ color: barColor }}>
                                    {ses.confirmados}/{ses.cupo_maximo}
                                  </span>
                                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{ width: `${Math.min(pct * 100, 100)}%`, background: barColor }}
                                    />
                                  </div>
                                  {ses.en_espera > 0 && (
                                    <span className="text-[10px] text-amber-600 font-semibold">+{ses.en_espera}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN ──────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {!sesionSel ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-28">
              <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#d1d5db" strokeWidth={1.5}>
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <p className="text-base font-semibold text-gray-600 mb-1">Selecciona una sesión</p>
              <p className="text-sm text-gray-400">para ver los inscritos y gestionar reservas</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

              {/* Session header */}
              <div
                className="px-5 py-4 border-b border-gray-100"
                style={{ borderLeft: `4px solid ${GROUP_COLOR[sesionSel.tipo_plan]}` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-xs font-bold" style={{ color: GROUP_COLOR[sesionSel.tipo_plan] }}>
                        {TIPO_PLAN_LABEL[sesionSel.tipo_plan]}
                      </span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-500 capitalize">
                        {new Date(sesionSel.fecha + "T00:00:00").toLocaleDateString("es-CO", {
                          weekday: "long", day: "numeric", month: "long",
                        })}
                      </span>
                      {sesionSel.hora_inicio && (
                        <>
                          <span className="text-xs text-gray-300">·</span>
                          <span className="text-xs text-gray-500">
                            {formatHora(sesionSel.hora_inicio)}–{formatHora(sesionSel.hora_fin)}
                          </span>
                        </>
                      )}
                    </div>
                    <h2 className="text-base font-bold text-gray-900">
                      {sesionSel.objetivo || "Sesión sin objetivo"}
                    </h2>
                  </div>
                  <button
                    onClick={() => { setSesionSel(null); setReservas([]); }}
                    className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              </div>

              {/* Cupo summary */}
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                <div className="flex items-end gap-6 mb-3">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{confirmados.length}</p>
                    <p className="text-xs text-gray-500">confirmados</p>
                  </div>
                  <div>
                    <p
                      className="text-2xl font-bold"
                      style={{ color: confirmados.length >= sesionSel.cupo_maximo ? "#dc2626" : "#1a3a2a" }}
                    >
                      {Math.max(sesionSel.cupo_maximo - confirmados.length, 0)}
                    </p>
                    <p className="text-xs text-gray-500">disponibles</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-400">{sesionSel.cupo_maximo}</p>
                    <p className="text-xs text-gray-500">cupo máx.</p>
                  </div>
                </div>
                <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min((confirmados.length / sesionSel.cupo_maximo) * 100, 100)}%`,
                      background: cupoBarColor(confirmados.length, sesionSel.cupo_maximo),
                    }}
                  />
                </div>
              </div>

              {/* Student search + inscribir */}
              <div className="px-5 py-4 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Inscribir alumno</p>
                <div className="flex gap-2 items-start">
                  <div className="flex-1 relative">
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        if (alumnoSel) setAlumnoSel(null);
                      }}
                      onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                      onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                      placeholder="Buscar alumno por nombre..."
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 pr-8"
                    />
                    {searchLoading && (
                      <svg className="animate-spin h-4 w-4 absolute right-2.5 top-2.5 text-gray-300" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                      </svg>
                    )}

                    {/* Selected badge */}
                    {alumnoSel && (
                      <div className="flex items-center gap-2 mt-1.5 px-2.5 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                        <Avatar name={alumnoSel.full_name} color={GROUP_COLOR[sesionSel.tipo_plan]} size={6} />
                        <span className="text-xs font-semibold text-green-800 flex-1 truncate">{alumnoSel.full_name}</span>
                        <button
                          onClick={() => { setAlumnoSel(null); setSearchQuery(""); searchInputRef.current?.focus(); }}
                          className="text-green-500 hover:text-green-700"
                        >
                          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                    )}

                    {/* Search dropdown */}
                    {showDropdown && !alumnoSel && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                        {searchResults.length === 0 ? (
                          <p className="px-4 py-3 text-xs text-gray-400 text-center italic">
                            No se encontraron alumnos de este grupo
                          </p>
                        ) : searchResults.map((st) => {
                          const yaInscrito = reservas.some((r) => r.estudiante_id === st.id);
                          return (
                            <button
                              key={st.id}
                              onMouseDown={() => {
                                if (yaInscrito) return;
                                setAlumnoSel(st);
                                setSearchQuery(st.full_name);
                                setShowDropdown(false);
                              }}
                              disabled={yaInscrito}
                              className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                              style={yaInscrito ? { opacity: 0.4 } : undefined}
                            >
                              <Avatar name={st.full_name} color={GROUP_COLOR[sesionSel.tipo_plan]} size={8} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{st.full_name}</p>
                                <p className="text-xs text-gray-400">{st.grupo_activo}</p>
                              </div>
                              {yaInscrito && (
                                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                  Ya inscrito
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleInscribir}
                    disabled={!alumnoSel || inscribiendo}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex-shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: GROUP_COLOR[sesionSel.tipo_plan] }}
                  >
                    {inscribiendo ? "..." : "Inscribir"}
                  </button>
                </div>
              </div>

              {/* Reservas list */}
              <div className="px-5 py-4">
                {loadingReservas ? (
                  <div className="py-8 text-center">
                    <svg className="animate-spin h-5 w-5 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    <p className="text-xs text-gray-400">Cargando inscritos...</p>
                  </div>
                ) : reservas.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-gray-400 italic">Sin inscritos todavía</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Confirmados */}
                    {confirmados.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                          Confirmados ({confirmados.length})
                        </p>
                        <div className="space-y-1">
                          {confirmados.map((r) => (
                            <div
                              key={r.id}
                              className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50 group hover:bg-gray-100 transition-colors"
                            >
                              <Avatar name={r.students.full_name} color={GROUP_COLOR[sesionSel.tipo_plan]} size={8} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{r.students.full_name}</p>
                                <p className="text-xs text-gray-400">{r.students.grupo_activo ?? "Sin grupo"}</p>
                              </div>
                              <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                Confirmado
                              </span>
                              <button
                                onClick={() => setConfirmEliminar(r)}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                                title="Eliminar reserva"
                              >
                                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* En espera */}
                    {enEspera.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                          Lista de espera ({enEspera.length})
                        </p>
                        <div className="space-y-1">
                          {enEspera.map((r) => (
                            <div
                              key={r.id}
                              className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-amber-50 group hover:bg-amber-100 transition-colors"
                            >
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-amber-800 bg-amber-200 flex-shrink-0">
                                {r.posicion_espera}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{r.students.full_name}</p>
                                <p className="text-xs text-gray-400">{r.students.grupo_activo ?? "Sin grupo"}</p>
                              </div>
                              <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                Espera #{r.posicion_espera}
                              </span>
                              <button
                                onClick={() => setConfirmEliminar(r)}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                                title="Eliminar de lista de espera"
                              >
                                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirm delete modal */}
      {confirmEliminar && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => { if (!eliminando) setConfirmEliminar(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#dc2626" strokeWidth={2}>
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Eliminar reserva</h3>
                <p className="text-xs text-gray-500 mt-0.5">{confirmEliminar.students.full_name}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              {confirmEliminar.estado === "confirmado"
                ? "Al eliminar un confirmado, el primero en lista de espera pasará automáticamente a confirmado."
                : "¿Eliminar a este alumno de la lista de espera?"}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleEliminar(confirmEliminar)}
                disabled={eliminando}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {eliminando ? "Eliminando..." : "Sí, eliminar"}
              </button>
              <button
                onClick={() => setConfirmEliminar(null)}
                disabled={eliminando}
                className="px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
