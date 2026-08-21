"use client";

import { useState } from "react";
import { TIPO_PLAN_LABEL, DIAS_POR_TIPO, type TipoPlan, type DiaSemana } from "./ProgramacionModule";
import { TIPOS_PLAN } from "@/lib/grupos";

// "semana" quedó fuera a propósito. La ruta de semana completa publicaba por
// /api/publish-plan-semanal, que antes de insertar hacía DELETE de todas las
// sesiones del plan sin preguntar, y escribía un formato más pobre que el del
// wizard: sin calentamiento, foco, responsable ni estaciones_competencia, y con
// drills de texto libre sin id de la biblioteca. Una semana ya armada se perdía
// y quedaba irrecuperable desde el wizard.
// Se reactiva cuando Paco pase a precargar WeekWizardModal en vez de escribir
// directo en la base.
type Mode = "menu" | "dia" | "especial";

const GRUPOS: TipoPlan[] = TIPOS_PLAN;
const COLOR = "#1a3a2a";

const DOW_TO_DIA: Record<number, DiaSemana> = { 0: "domingo", 2: "martes", 3: "miercoles", 4: "jueves", 5: "viernes", 6: "sabado" };

function diaSemanaFromFecha(fecha: string): DiaSemana | null {
  return DOW_TO_DIA[new Date(`${fecha}T00:00:00`).getDay()] ?? null;
}

export default function PacoPlanWizard({
  fechaSugerida, onClose, onDiaEspecifico, onActividadEspecial, onEventos,
}: {
  fechaSugerida: string;
  onClose: () => void;
  onDiaEspecifico: (grupo: TipoPlan, dia: DiaSemana, fecha: string) => void;
  onActividadEspecial: (grupos: TipoPlan[], fecha: string) => void;
  onEventos: () => void;
}) {
  const [mode, setMode] = useState<Mode>("menu");
  const [grupo, setGrupo] = useState<TipoPlan>("juvenil");
  const [gruposMulti, setGruposMulti] = useState<TipoPlan[]>([]);
  const [fecha, setFecha] = useState(fechaSugerida);
  const [diaError, setDiaError] = useState<string | null>(null);

  function toggleGrupoMulti(g: TipoPlan) {
    setGruposMulti((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  function handleConfirmDia() {
    const dia = diaSemanaFromFecha(fecha);
    if (!dia || !DIAS_POR_TIPO[grupo].includes(dia)) {
      setDiaError(`${TIPO_PLAN_LABEL[grupo]} no tiene sesión ese día de la semana. Elige otra fecha.`);
      return;
    }
    onDiaEspecifico(grupo, dia, fecha);
  }

  const MENU_OPTIONS: { label: string; onClick: () => void }[] = [
    { label: "Un día específico para un grupo", onClick: () => setMode("dia") },
    { label: "Una actividad especial", onClick: () => setMode("especial") },
    { label: "Marcar días sin escuela o eventos", onClick: onEventos },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3.5" style={{ backgroundColor: COLOR }}>
          <p className="text-sm font-semibold text-white">Planificar con Paco 🦅</p>
          <button onClick={onClose} aria-label="Cerrar" className="text-white/70 hover:text-white p-1">
            <i className="ti ti-x" style={{ fontSize: 18 }} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {mode === "menu" && (
            <>
              <p className="text-sm text-gray-500 mb-1">¿Qué quieres planificar?</p>
              {MENU_OPTIONS.map((opt) => (
                <button key={opt.label} onClick={opt.onClick} className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  {opt.label}
                </button>
              ))}
              <p className="text-xs text-gray-400 pt-1 leading-relaxed">
                La semana completa se arma desde <span className="font-medium text-gray-500">Armar programación</span>,
                que guarda calentamiento, foco y responsable por estación con drills de la biblioteca.
              </p>
            </>
          )}

          {mode === "dia" && (
            <>
              <p className="text-sm text-gray-500 mb-1">¿Para qué grupo y qué día?</p>
              <div className="flex flex-wrap gap-2">
                {GRUPOS.map((g) => (
                  <button key={g} onClick={() => { setGrupo(g); setDiaError(null); }} className="text-xs font-semibold px-3 py-1.5 rounded-full border"
                    style={grupo === g ? { backgroundColor: COLOR, color: "#fff", borderColor: COLOR } : { color: "#6b7280", borderColor: "#e5e7eb" }}>
                    {TIPO_PLAN_LABEL[g]}
                  </button>
                ))}
              </div>
              <input type="date" value={fecha} onChange={(e) => { setFecha(e.target.value); setDiaError(null); }} className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200" />
              {diaError && <p className="text-xs text-red-600">{diaError}</p>}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setMode("menu")} className="flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Atrás</button>
                <button onClick={handleConfirmDia} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: COLOR }}>Continuar</button>
              </div>
            </>
          )}

          {mode === "especial" && (
            <>
              <p className="text-sm text-gray-500 mb-1">¿Qué grupos participan?</p>
              <div className="flex flex-wrap gap-2">
                {GRUPOS.map((g) => (
                  <button key={g} onClick={() => toggleGrupoMulti(g)} className="text-xs font-semibold px-3 py-1.5 rounded-full border"
                    style={gruposMulti.includes(g) ? { backgroundColor: "#b45309", color: "#fff", borderColor: "#b45309" } : { color: "#6b7280", borderColor: "#e5e7eb" }}>
                    {TIPO_PLAN_LABEL[g]}
                  </button>
                ))}
                <button onClick={() => setGruposMulti(GRUPOS)} className="text-xs font-semibold px-3 py-1.5 rounded-full border"
                  style={gruposMulti.length === GRUPOS.length ? { backgroundColor: "#b45309", color: "#fff", borderColor: "#b45309" } : { color: "#6b7280", borderColor: "#e5e7eb" }}>
                  Todos
                </button>
              </div>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200" />
              <div className="flex gap-2 pt-2">
                <button onClick={() => setMode("menu")} className="flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Atrás</button>
                <button
                  onClick={() => onActividadEspecial(gruposMulti.length ? gruposMulti : [grupo], fecha)}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold text-white"
                  style={{ backgroundColor: "#b45309" }}
                >
                  Continuar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
