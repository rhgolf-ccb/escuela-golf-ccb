"use client";

import { useState } from "react";

type Kind = "evento" | "sin_escuela";

export type EventoEdit = { id: string; nombre: string; fecha_inicio: string; fecha_fin: string | null; descripcion: string | null; tipo: "especial" | "institucional" };
export type SinEscuelaEdit = { id: string; fecha_inicio: string; fecha_fin: string; motivo: string | null };

export default function EventoDiaSinEscuelaModal({
  fechaSugerida, editEvento, editSinEscuela, onClose, onCreated,
}: {
  fechaSugerida: string;
  editEvento?: EventoEdit | null;
  editSinEscuela?: SinEscuelaEdit | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const editing = editEvento ?? editSinEscuela ?? null;
  const editId = editing?.id ?? null;

  const [kind, setKind] = useState<Kind>(editSinEscuela ? "sin_escuela" : "evento");

  const [nombre, setNombre] = useState(editEvento?.nombre ?? "");
  const [tipo, setTipo] = useState<"especial" | "institucional">(editEvento?.tipo ?? "institucional");
  const [descripcion, setDescripcion] = useState(editEvento?.descripcion ?? "");
  const [fechaInicio, setFechaInicio] = useState(editEvento?.fecha_inicio ?? editSinEscuela?.fecha_inicio ?? fechaSugerida);
  const [fechaFin, setFechaFin] = useState(editEvento?.fecha_fin ?? editSinEscuela?.fecha_fin ?? "");
  const [motivo, setMotivo] = useState(editSinEscuela?.motivo ?? "");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGuardar() {
    setError(null);
    if (kind === "evento" && !nombre.trim()) { setError("Ponle un nombre al evento."); return; }
    if (!fechaInicio) { setError("Selecciona una fecha."); return; }
    if (kind === "sin_escuela" && !fechaFin) { setError("Selecciona la fecha final del rango."); return; }

    setSaving(true);
    try {
      const base = kind === "evento"
        ? { kind, nombre: nombre.trim(), fecha_inicio: fechaInicio, fecha_fin: fechaFin || null, descripcion: descripcion.trim() || null, tipo }
        : { kind, fecha_inicio: fechaInicio, fecha_fin: fechaFin, motivo: motivo.trim() || null };
      const body = editId ? { ...base, id: editId } : base;
      const res = await fetch("/api/calendario-evento", {
        method: editId ? "PATCH" : "POST",
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

  async function handleBorrar() {
    if (!editId) return;
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch("/api/calendario-evento", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: editEvento ? "evento" : "sin_escuela", id: editId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al borrar");
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al borrar");
    }
    setDeleting(false);
  }

  const titulo = editId ? (editEvento ? "Editar evento" : "Editar día sin escuela") : "Marcar evento o día sin escuela";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
        <h3 className="font-bold text-gray-900">{titulo}</h3>

        {!editId && (
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
        )}

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
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo / mensaje a los padres (ej: Festivo — Batalla de Boyacá)" className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200" />
            <p className="text-[11px] text-gray-400">Este texto es lo que ven los padres en su calendario.</p>
          </>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        {confirmDelete ? (
          <div className="flex gap-2 pt-2">
            <button onClick={() => setConfirmDelete(false)} disabled={deleting} className="flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button onClick={handleBorrar} disabled={deleting} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "#b91c1c" }}>
              {deleting ? "Borrando..." : "Sí, borrar"}
            </button>
          </div>
        ) : (
          <div className="flex gap-2 pt-2">
            {editId ? (
              <button onClick={() => setConfirmDelete(true)} disabled={saving} className="py-2 px-3 rounded-xl text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50">Borrar</button>
            ) : (
              <button onClick={onClose} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
            )}
            <button onClick={handleGuardar} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "#1a3a2a" }}>
              {saving ? "Guardando..." : editId ? "Guardar cambios" : "Guardar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
