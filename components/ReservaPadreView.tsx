"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type TipoPlan = "juvenil" | "competencia" | "damas";
type DiaSemana = "martes" | "miercoles" | "jueves" | "viernes" | "sabado" | "domingo";

type Estudiante = { id: string; full_name: string; grupo_activo: string | null };

type SesionConInfo = {
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
  confirmados: number;
  en_espera: number;
  miReserva: { id: string; estado: "confirmado" | "en_espera"; posicion_espera: number | null } | null;
};

const DIA_LABEL: Record<DiaSemana, string> = {
  martes: "Martes", miercoles: "Miércoles", jueves: "Jueves",
  viernes: "Viernes", sabado: "Sábado", domingo: "Domingo",
};
const TIPO_SESION_LABEL: Record<string, string> = {
  tiro_largo: "Tiro Largo", juego_corto: "Juego Corto", putt: "Putt",
  campo: "Campo", test_tecnico: "Test Técnico", test_fisico: "Test Físico",
  competencia: "Competencia", damas_estaciones: "Estaciones",
};

function tipoPlanForGrupo(grupo: string | null): TipoPlan | null {
  if (grupo === "Competencia") return "competencia";
  if (grupo === "Damas") return "damas";
  if (grupo && ["Birdies", "Águilas", "Albatros", "+14"].includes(grupo)) return "juvenil";
  return null;
}

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
function formatHora(t: string | null): string { return t ? t.slice(0, 5) : ""; }
function initiales(name: string): string {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}
function cupoBarColor(confirmados: number, cupoMax: number): string {
  const pct = cupoMax > 0 ? confirmados / cupoMax : 0;
  if (pct >= 1) return "#dc2626";
  if (pct >= 0.8) return "#92400e";
  return "#1a3a2a";
}

export default function ReservaPadreView({ estudiantes }: { estudiantes: Estudiante[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(estudiantes[0]?.id ?? null);
  const [semana, setSemana] = useState<Date>(() => getMonday(new Date()));
  const [sesiones, setSesiones] = useState<SesionConInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const selected = estudiantes.find((e) => e.id === selectedId) ?? null;
  const tipoPlan = selected ? tipoPlanForGrupo(selected.grupo_activo) : null;

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500); }

  const fetchSesiones = useCallback(async () => {
    if (!selected || !tipoPlan) { setSesiones([]); return; }
    setLoading(true);
    const semanaStr = toISODate(semana);

    const { data: planes } = await supabase
      .from("planes_semanales")
      .select("id")
      .eq("semana_inicio", semanaStr)
      .eq("tipo_plan", tipoPlan);

    if (!planes?.length) { setSesiones([]); setLoading(false); return; }

    const { data: sesData } = await supabase
      .from("sesiones_semana")
      .select("id, plan_id, dia_semana, fecha, tipo_sesion, lugar, hora_inicio, hora_fin, objetivo, cupo_maximo")
      .in("plan_id", planes.map((p) => p.id))
      .order("hora_inicio");

    if (!sesData?.length) { setSesiones([]); setLoading(false); return; }

    const sesIds = sesData.map((s) => s.id);
    const { data: resData } = await supabase
      .from("reservas")
      .select("id, sesion_id, estado, posicion_espera, estudiante_id")
      .in("sesion_id", sesIds);

    const countMap: Record<string, { confirmados: number; en_espera: number }> = {};
    const misReservas: Record<string, { id: string; estado: "confirmado" | "en_espera"; posicion_espera: number | null }> = {};
    for (const r of resData ?? []) {
      if (!countMap[r.sesion_id]) countMap[r.sesion_id] = { confirmados: 0, en_espera: 0 };
      if (r.estado === "confirmado") countMap[r.sesion_id].confirmados++;
      else countMap[r.sesion_id].en_espera++;
      if (r.estudiante_id === selected.id) {
        misReservas[r.sesion_id] = { id: r.id, estado: r.estado, posicion_espera: r.posicion_espera };
      }
    }

    setSesiones(sesData.map((s) => ({
      ...s,
      confirmados: countMap[s.id]?.confirmados ?? 0,
      en_espera: countMap[s.id]?.en_espera ?? 0,
      miReserva: misReservas[s.id] ?? null,
    })));
    setLoading(false);
  }, [selected, tipoPlan, semana]);

  useEffect(() => { fetchSesiones(); }, [fetchSesiones]);

  async function logAccessEvent(accion: "reserva_creada" | "reserva_cancelada", detalle: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("access_logs").insert({ user_id: user.id, accion, detalle });
  }

  async function handleInscribir(ses: SesionConInfo) {
    if (!selected) return;
    setBusyId(ses.id);
    const estado = ses.confirmados < ses.cupo_maximo ? "confirmado" : "en_espera";
    const posicion = estado === "en_espera" ? ses.en_espera + 1 : null;

    const { error } = await supabase.from("reservas").insert({
      sesion_id: ses.id,
      estudiante_id: selected.id,
      estado,
      posicion_espera: posicion,
    });

    if (error) {
      showToast(error.code === "23505" ? "Ya estás inscrito en esta sesión" : "Error al inscribir: " + error.message);
    } else {
      showToast(estado === "confirmado" ? "Inscripción confirmada ✓" : `En lista de espera (pos. ${posicion})`);
      await logAccessEvent("reserva_creada", `${selected.full_name} · ${ses.fecha} · ${ses.tipo_sesion}`);
      await fetchSesiones();
    }
    setBusyId(null);
  }

  async function handleCancelar(ses: SesionConInfo) {
    if (!selected || !ses.miReserva) return;
    setBusyId(ses.id);
    const eraConfirmado = ses.miReserva.estado === "confirmado";
    await supabase.from("reservas").delete().eq("id", ses.miReserva.id);

    if (eraConfirmado) {
      const { data: enEspera } = await supabase
        .from("reservas")
        .select("id, posicion_espera")
        .eq("sesion_id", ses.id)
        .eq("estado", "en_espera")
        .order("posicion_espera", { ascending: true });
      if (enEspera && enEspera.length > 0) {
        await supabase.from("reservas").update({ estado: "confirmado", posicion_espera: null }).eq("id", enEspera[0].id);
        for (let i = 1; i < enEspera.length; i++) {
          await supabase.from("reservas").update({ posicion_espera: i }).eq("id", enEspera[i].id);
        }
      }
    }

    showToast("Reserva cancelada");
    await logAccessEvent("reserva_cancelada", `${selected.full_name} · ${ses.fecha} · ${ses.tipo_sesion}`);
    await fetchSesiones();
    setBusyId(null);
  }

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
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Reservas</h1>
      <p className="text-sm text-gray-400 mb-5">Inscribe a tu alumno en las próximas sesiones</p>

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

      {!tipoPlan ? (
        <p className="text-sm text-gray-400 text-center py-10">
          {selected?.full_name} no tiene un grupo asignado — contacta al coordinador.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-1 mb-4 bg-white rounded-xl border border-gray-100 shadow-sm p-2">
            <button onClick={() => setSemana((s) => addDays(s, -7))} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <div className="flex-1 text-center">
              <p className="text-xs font-semibold text-gray-700">{formatWeekRange(semana)}</p>
              <button onClick={() => setSemana(getMonday(new Date()))} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">esta semana</button>
            </div>
            <button onClick={() => setSemana((s) => addDays(s, 7))} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-10">Cargando sesiones...</p>
          ) : sesiones.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Sin sesiones programadas esta semana.</p>
          ) : (
            <div className="space-y-2">
              {sesiones.map((ses) => {
                const lleno = ses.confirmados >= ses.cupo_maximo;
                return (
                  <div key={ses.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-gray-500 capitalize">{DIA_LABEL[ses.dia_semana]} · {new Date(ses.fecha + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</p>
                        <p className="text-sm font-bold text-gray-900 mt-0.5">{TIPO_SESION_LABEL[ses.tipo_sesion] ?? ses.tipo_sesion}</p>
                        {ses.hora_inicio && <p className="text-xs text-gray-400">{formatHora(ses.hora_inicio)}–{formatHora(ses.hora_fin)}</p>}
                        {ses.objetivo && <p className="text-xs text-gray-500 mt-1">{ses.objetivo}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold" style={{ color: cupoBarColor(ses.confirmados, ses.cupo_maximo) }}>{ses.confirmados}/{ses.cupo_maximo}</p>
                        {ses.en_espera > 0 && <p className="text-[10px] text-amber-600 font-semibold">+{ses.en_espera} en espera</p>}
                      </div>
                    </div>

                    <div className="mt-3">
                      {ses.miReserva ? (
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="text-xs font-semibold px-2 py-1 rounded-full"
                            style={ses.miReserva.estado === "confirmado" ? { background: "#dcfce7", color: "#166534" } : { background: "#fef3c7", color: "#92400e" }}
                          >
                            {ses.miReserva.estado === "confirmado" ? "Inscrito" : `En espera (#${ses.miReserva.posicion_espera})`}
                          </span>
                          <button
                            onClick={() => handleCancelar(ses)}
                            disabled={busyId === ses.id}
                            className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                          >
                            {busyId === ses.id ? "..." : "Cancelar"}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleInscribir(ses)}
                          disabled={busyId === ses.id}
                          className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                          style={{ background: "#1a3a2a" }}
                        >
                          {busyId === ses.id ? "..." : lleno ? "Unirme a lista de espera" : "Inscribir"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
