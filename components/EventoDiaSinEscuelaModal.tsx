"use client";

import { useState } from "react";

type Kind = "evento" | "sin_escuela";

export default function EventoDiaSinEscuelaModal({
  fechaSugerida, onClose, onCreated,
}: {
  fechaSugerida: string; onClose: () => void; onCreated: () => void;
}) {
  const [kind, setKind] = useState<Kind>("evento");

  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<"especial" | "institucional">("institucional");
  const [descripcion, setDescripcion] = useState("");
  const [fechaInicio, setFechaInicio] = useState(fechaSugerida);
  const [fechaFin, setFechaFin] = useState("");
  const [motivo, setMotivo] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGuardar() {
    setError(null);
    if (kind === "evento" && !nombre.trim()) { setError("Ponle un nombre al evento."); return; }
    if (!fechaInicio) { setError("Selecciona una fecha."); return; }
    if (kind === "sin_escuela" && !fechaFin) { setError("Selecciona la fecha final del rango."); return; }

    setSaving(true);
    try {
      const body = kind === "evento"
        ? { kind, nombre: nombre.trim(), fecha_inicio: fechaInicio, fecha_fin: fechaFin || null, descripcion: descripcion.trim() || null, tipo }
        : { kind, fecha_inicio: fechaInicio, fecha_fin: fechaFin, motivo: motivo.trim() || null };
      const res = await fetch("/api/calendario-evento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
        <h3 className="font-bold text-gray-900">Marcar evento o día sin escuela</h3>

        <div className="flex gap-2">
          <button onClick={() => setKind("evento")} className="flex-1 py-2 rounded-lg text-sm font-semibold"
            style={kind === "evento" ? { backgroundColor: "#1565c0", color: "#fff" } : { backgroundColor: "#f3f4f6", color: "#6b7280" }}>
            📌 Evento
          </button>
          <button onClick={() => setKind("sin_escuela")} className="flex-1 py-2 rounded-lg text-sm font-semibold"
            style={kind === "sin_escuela" ? { backgroundColor: "#4b5563", color: "#fff" } : { backgroundColor: "#f3f4f6", color: "#6b7280" }}>
            Sin escuela
          </button>
        </div>

        {kind === "evento" ? (
          <>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del evento (ej: Torneo interno)" className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200" />
            <div className="flex gap-2">
              <button onClick={() => setTipo("institucional")} className="flex-1 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={tipo === "institucional" ? { backgroundColor: "#1565c018", color: "#1565c0" } : { color: "#9ca3af", backgroundColor: "#f9fafb" }}>
                Institucional
              </button>
              <button onClick={() => setTipo("especial")} className="flex-1 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={tipo === "especial" ? { backgroundColor: "#b4530918", color: "#b45309" } : { color: "#9ca3af", backgroundColor: "#f9fafb" }}>
                Actividad especial
              </button>
            </div>
            <div className="flex gap-2">
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200" />
              <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} placeholder="Fecha fin (opcional)" className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200" />
            </div>
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} placeholder="Descripción (opcional)" className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 resize-none" />
          </>
        ) : (
          <>
            <div className="flex gap-2">
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200" />
              <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200" />
            </div>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (ej: vacaciones, festivo)" className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200" />
          </>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={handleGuardar} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "#1a3a2a" }}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
