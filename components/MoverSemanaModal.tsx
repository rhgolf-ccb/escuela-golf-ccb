"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DiaSinEscuela, PlanSemanal, SesionSemana } from "./ProgramacionModule";
import {
  TIPO_PLAN_LABEL, addDays, descripcionDiaSinEscuela, fechaEnRango, fechaLocal, formatDiaFecha,
  getMonday, toISODate,
} from "./ProgramacionModule";

interface PlanDestino { id: string; tema_semanal: string; sesiones: number; reservas: number }
interface Omitida { id: string; fecha_actual: string; fecha_destino: string; dia_semana: string; motivo: string | null }

interface Props {
  plan: PlanSemanal;
  sesiones: SesionSemana[];
  diasSinEscuela: DiaSinEscuela[];
  onClose: () => void;
  // Recibe el lunes destino para que la vista salte a la semana movida.
  onMoved: (nuevaSemana: Date) => void;
}

// Rango legible de los días con sesión ("19 ago — 23 ago"), no de la semana
// entera: es lo que el profesor reconoce como "su" programación.
function rangoSesiones(fechas: string[], deltaDias = 0): string {
  if (fechas.length === 0) return "—";
  const ordenadas = [...fechas].sort();
  const ini = toISODate(addDays(fechaLocal(ordenadas[0]), deltaDias));
  const fin = toISODate(addDays(fechaLocal(ordenadas[ordenadas.length - 1]), deltaDias));
  return ini === fin ? formatDiaFecha(ini) : `${formatDiaFecha(ini)} — ${formatDiaFecha(fin)}`;
}

export default function MoverSemanaModal({ plan, sesiones, diasSinEscuela, onClose, onMoved }: Props) {
  const [destino, setDestino] = useState<string>(() => toISODate(addDays(fechaLocal(plan.semana_inicio), 7)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicto, setConflicto] = useState<PlanDestino | null>(null);
  const [omitidas, setOmitidas] = useState<Omitida[] | null>(null);
  const [reservas, setReservas] = useState<number | null>(null);
  // Mover una clase ya dictada casi siempre es un error: se pide un paso extra.
  const [asumeDictadas, setAsumeDictadas] = useState(false);

  const dictadas = sesiones.filter((s) => s.asistencia_registrada).length;
  const fechas = sesiones.map((s) => s.fecha);
  const deltaDias = Math.round((fechaLocal(destino).getTime() - fechaLocal(plan.semana_inicio).getTime()) / 86400000);

  // Las que caerían en día sin escuela: el servidor las omite, pero se avisa
  // antes de mover para que no sea una sorpresa.
  const chocanConSinEscuela = sesiones
    .map((s) => {
      const fechaDestino = toISODate(addDays(fechaLocal(s.fecha), deltaDias));
      const info = diasSinEscuela.find((d) => fechaEnRango(fechaDestino, d.fecha_inicio, d.fecha_fin));
      return info ? { fecha: fechaDestino, motivo: info.motivo } : null;
    })
    .filter((x): x is { fecha: string; motivo: string | null } => !!x);

  useEffect(() => {
    const ids = sesiones.map((s) => s.id);
    // Sin sesiones no hay nada que contar: se deja en null y el aviso no se
    // muestra (0 reservas tampoco tendría nada que avisar).
    if (ids.length === 0) return;
    supabase.from("reservas").select("id", { count: "exact", head: true }).in("sesion_id", ids)
      .then(({ count, error: e }) => { if (!e) setReservas(count ?? 0); });
  }, [sesiones]);

  async function mover(conflictoOpt?: "reemplazar") {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/mover-programacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "semana", plan_id: plan.id, nueva_semana_inicio: destino, conflicto: conflictoOpt }),
      });
      const data = await res.json();
      if (res.status === 409 && data.needs_confirm) { setConflicto(data.plan_destino as PlanDestino); return; }
      if (!res.ok) throw new Error(data.error || "No se pudo mover la programación");
      const lista = (data.omitidas ?? []) as Omitida[];
      if (lista.length > 0) { setOmitidas(lista); setConflicto(null); return; }
      onMoved(fechaLocal(destino));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo mover la programación");
    } finally {
      setSaving(false);
    }
  }

  const destinoInvalido = deltaDias === 0;
  const bloqueadoPorDictadas = dictadas > 0 && !asumeDictadas;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
        <div>
          <h3 className="font-bold text-gray-900">Mover a otra semana</h3>
          <p className="text-xs text-gray-500 mt-0.5">{TIPO_PLAN_LABEL[plan.tipo_plan]} · {plan.tema_semanal}</p>
        </div>

        {omitidas ? (
          <>
            <div className="rounded-lg px-3 py-2 text-xs space-y-1" style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
              <p className="font-semibold">La programación se movió, pero {omitidas.length} sesión{omitidas.length > 1 ? "es" : ""} se quedó en su fecha original:</p>
              {omitidas.map((o) => (
                <p key={o.id}>· {formatDiaFecha(o.fecha_destino)} — {descripcionDiaSinEscuela(o.motivo)}</p>
              ))}
              <p>Quedaron sin mover para que decidas qué hacer con ellas.</p>
            </div>
            <button onClick={() => onMoved(fechaLocal(destino))} className="w-full py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: "#1a3a2a" }}>
              Entendido
            </button>
          </>
        ) : conflicto ? (
          <>
            <div className="rounded-lg px-3 py-2 text-xs space-y-1" style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b" }}>
              <p className="font-semibold">Esa semana ya tiene un plan de {TIPO_PLAN_LABEL[plan.tipo_plan]}: “{conflicto.tema_semanal}”.</p>
              <p>Reemplazarlo borra {conflicto.sesiones} sesión{conflicto.sesiones === 1 ? "" : "es"}{conflicto.reservas > 0 ? ` y ${conflicto.reservas} reserva${conflicto.reservas === 1 ? "" : "s"} de alumnos` : ""}. No se puede deshacer.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConflicto(null)} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={() => mover("reemplazar")} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "#b91c1c" }}>
                {saving ? "Moviendo..." : "Reemplazar"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Nueva semana</label>
              <input
                type="date"
                value={destino}
                onChange={(e) => { if (e.target.value) setDestino(toISODate(getMonday(fechaLocal(e.target.value)))); }}
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200"
              />
              <p className="text-[11px] text-gray-400 mt-1">Cualquier día que elijas se ajusta al lunes de esa semana.</p>
            </div>

            <div className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", color: "#374151" }}>
              {destinoInvalido ? (
                <p>La programación ya está en esa semana.</p>
              ) : (
                <p>
                  <span className="font-semibold">{sesiones.length} sesión{sesiones.length === 1 ? "" : "es"}</span> se {sesiones.length === 1 ? "moverá" : "moverán"} del{" "}
                  {rangoSesiones(fechas)} al {rangoSesiones(fechas, deltaDias)}.
                </p>
              )}
              {reservas !== null && reservas > 0 && (
                <p className="mt-1" style={{ color: "#92400e" }}>
                  {reservas} reserva{reservas === 1 ? "" : "s"} de alumnos {reservas === 1 ? "sigue" : "siguen"} apuntando a estas sesiones: cambian de fecha, hay que avisarles.
                </p>
              )}
              {chocanConSinEscuela.length > 0 && (
                <div className="mt-1" style={{ color: "#92400e" }}>
                  {chocanConSinEscuela.map((c, i) => (
                    <p key={i}>{formatDiaFecha(c.fecha)} no tiene escuela ({descripcionDiaSinEscuela(c.motivo)}): esa sesión no se moverá.</p>
                  ))}
                </div>
              )}
            </div>

            {dictadas > 0 && (
              <label className="flex items-start gap-2 text-xs rounded-lg px-3 py-2" style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
                <input type="checkbox" checked={asumeDictadas} onChange={(e) => setAsumeDictadas(e.target.checked)} className="mt-0.5" />
                <span>{dictadas} sesión{dictadas === 1 ? " ya tiene" : "es ya tienen"} asistencia registrada. Mover una clase ya dictada casi siempre es un error — confirmo que quiero moverla.</span>
              </label>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button onClick={onClose} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={() => mover()} disabled={saving || destinoInvalido || bloqueadoPorDictadas} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "#1a3a2a" }}>
                {saving ? "Moviendo..." : "Mover"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
