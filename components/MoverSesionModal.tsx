"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DiaSemana, DiaSinEscuela, TipoPlan } from "./ProgramacionModule";
import { DIA_LABEL, TIPO_PLAN_LABEL, descripcionDiaSinEscuela, fechaEnRango, fechaLocal, formatDiaFecha } from "./ProgramacionModule";

export interface SesionMovible {
  id: string;
  fecha: string;
  dia_semana: DiaSemana;
  tipo_plan: TipoPlan;
  asistencia_registrada?: boolean;
}

interface SesionDestino { id: string; objetivo: string; tipo_sesion: string; reservas: number }

interface Props {
  sesion: SesionMovible;
  diasSinEscuela: DiaSinEscuela[];
  onClose: () => void;
  // Recibe la fecha nueva (ISO) para que la vista recargue y salte a esa semana.
  onMoved: (nuevaFecha: string) => void;
}

// El CHECK de sesiones_semana.dia_semana solo admite martes..domingo, y además
// no hay clases los lunes en ningún grupo: se bloquea en el picker.
export function motivoFechaNoValida(fecha: string, diasSinEscuela: DiaSinEscuela[]): string | null {
  if (!fecha) return null;
  if (fechaLocal(fecha).getDay() === 1) return "Los lunes no hay clase en ningún grupo.";
  const sin = diasSinEscuela.find((d) => fechaEnRango(fecha, d.fecha_inicio, d.fecha_fin));
  return sin ? `Sin escuela ese día — ${descripcionDiaSinEscuela(sin.motivo)}` : null;
}

export default function MoverSesionModal({ sesion, diasSinEscuela, onClose, onMoved }: Props) {
  const [fecha, setFecha] = useState(sesion.fecha);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicto, setConflicto] = useState<SesionDestino | null>(null);
  const [reservas, setReservas] = useState<number | null>(null);
  const [asumeDictada, setAsumeDictada] = useState(false);

  useEffect(() => {
    supabase.from("reservas").select("id", { count: "exact", head: true }).eq("sesion_id", sesion.id)
      .then(({ count, error: e }) => { if (!e) setReservas(count ?? 0); });
  }, [sesion.id]);

  const invalida = motivoFechaNoValida(fecha, diasSinEscuela);
  const sinCambio = fecha === sesion.fecha;
  const bloqueadaPorDictada = !!sesion.asistencia_registrada && !asumeDictada;

  async function mover(reemplazar?: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/mover-programacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "dia", sesion_id: sesion.id, nueva_fecha: fecha, reemplazar }),
      });
      const data = await res.json();
      if (res.status === 409 && data.needs_confirm) { setConflicto(data.sesion_destino as SesionDestino); return; }
      if (!res.ok) throw new Error(data.error || "No se pudo mover la sesión");
      onMoved(fecha);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo mover la sesión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
        <div>
          <h3 className="font-bold text-gray-900">Cambiar de fecha</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {TIPO_PLAN_LABEL[sesion.tipo_plan]} · {DIA_LABEL[sesion.dia_semana]} {formatDiaFecha(sesion.fecha)}
          </p>
        </div>

        {conflicto ? (
          <>
            <div className="rounded-lg px-3 py-2 text-xs space-y-1" style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b" }}>
              <p className="font-semibold">Ya hay una sesión a esa fecha y hora.</p>
              {conflicto.objetivo && <p>{conflicto.objetivo}</p>}
              <p>Reemplazarla la borra{conflicto.reservas > 0 ? ` junto con ${conflicto.reservas} reserva${conflicto.reservas === 1 ? "" : "s"} de alumnos` : ""}. No se puede deshacer.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConflicto(null)} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={() => mover(true)} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "#b91c1c" }}>
                {saving ? "Moviendo..." : "Reemplazar"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Nueva fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200" />
              {invalida && <p className="text-xs mt-1" style={{ color: "#b45309" }}>{invalida}</p>}
            </div>

            {reservas !== null && reservas > 0 && (
              <p className="text-xs rounded-lg px-3 py-2" style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
                {reservas} alumno{reservas === 1 ? " tiene" : "s tienen"} reserva en esta sesión. La reserva se conserva, pero cambia de fecha: hay que avisarles.
              </p>
            )}

            {sesion.asistencia_registrada && (
              <label className="flex items-start gap-2 text-xs rounded-lg px-3 py-2" style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
                <input type="checkbox" checked={asumeDictada} onChange={(e) => setAsumeDictada(e.target.checked)} className="mt-0.5" />
                <span>Esta clase ya tiene asistencia registrada. Mover una clase ya dictada casi siempre es un error — confirmo que quiero moverla.</span>
              </label>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button onClick={onClose} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={() => mover()} disabled={saving || !!invalida || sinCambio || bloqueadaPorDictada} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "#1a3a2a" }}>
                {saving ? "Moviendo..." : "Mover"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
