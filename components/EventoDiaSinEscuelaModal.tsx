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
  // Sesiones ya programadas dentro del rango que se está marcando sin escuela —
  // el servidor las devuelve en un 409 y acá se decide qué hacer con ellas.
  const [conflicto, setConflicto] = useState<{ sesiones: number; fechas: string[] } | null>(null);

  async function handleGuardar(sesionesExistentes?: "borrar" | "conservar") {
    setError(null);
    if (kind === "evento" && !nombre.trim()) { setError("Ponle un nombre al evento."); return; }
    if (!fechaInicio) { setError("Selecciona una fecha."); return; }
    if (kind === "sin_escuela" && !fechaFin) { setError("Selecciona la fecha final del rango."); return; }

    setSaving(true);
    try {
      const base = kind === "evento"
        ? { kind, nombre: nombre.trim(), fecha_inicio: fechaInicio, fecha_fin: fechaFin || null, descripcion: descripcion.trim() || null, tipo }
        : { kind, fecha_inicio: fechaInicio, fecha_fin: fechaFin, motivo: motivo.trim() || null, sesiones_existentes: sesionesExistentes };
      const body = editId ? { ...base, id: editId } : base;
      const res = await fetch("/api/calendario-evento", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 409 && data.needs_confirm) {
        setConflicto({ sesiones: data.sesiones, fechas: data.fechas ?? [] });
        setSaving(false);
        return;
      }
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
      <div className="bg-(--ui-card) rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
        <h3 className="font-bold text-(--ui-text)">{titulo}</h3>

        {!editId && (
          <div className="flex gap-2">
            <button onClick={() => setKind("evento")} className="flex-1 py-2 rounded-lg text-sm font-semibold"
              style={kind === "evento" ? { backgroundColor: "var(--g-birdies-fg)", color: "#fff" } : { backgroundColor: "var(--ui-card-alt)", color: "var(--ui-text-3)" }}>
              📌 Evento
            </button>
            <button onClick={() => setKind("sin_escuela")} className="flex-1 py-2 rounded-lg text-sm font-semibold"
              style={kind === "sin_escuela" ? { backgroundColor: "var(--ui-text-2)", color: "#fff" } : { backgroundColor: "var(--ui-card-alt)", color: "var(--ui-text-3)" }}>
              Sin escuela
            </button>
          </div>
        )}

        {kind === "evento" ? (
          <>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del evento (ej: Torneo interno)" className="w-full text-sm px-3 py-2 rounded-lg border border-(--ui-border)" />
            <div className="flex gap-2">
              <button onClick={() => setTipo("institucional")} className="flex-1 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={tipo === "institucional" ? { backgroundColor: "color-mix(in srgb, var(--g-birdies-fg) 9%, transparent)", color: "var(--g-birdies-fg)" } : { color: "var(--ui-text-3)", backgroundColor: "var(--ui-card-alt)" }}>
                Institucional
              </button>
              <button onClick={() => setTipo("especial")} className="flex-1 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={tipo === "especial" ? { backgroundColor: "color-mix(in srgb, var(--ui-warn) 9%, transparent)", color: "var(--ui-warn)" } : { color: "var(--ui-text-3)", backgroundColor: "var(--ui-card-alt)" }}>
                Actividad especial
              </button>
            </div>
            <div className="flex gap-2">
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="flex-1 text-sm px-3 py-2 rounded-lg border border-(--ui-border)" />
              <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} placeholder="Fecha fin (opcional)" className="flex-1 text-sm px-3 py-2 rounded-lg border border-(--ui-border)" />
            </div>
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} placeholder="Descripción (opcional)" className="w-full text-sm px-3 py-2 rounded-lg border border-(--ui-border) resize-none" />
          </>
        ) : (
          <>
            <div className="flex gap-2">
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="flex-1 text-sm px-3 py-2 rounded-lg border border-(--ui-border)" />
              <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="flex-1 text-sm px-3 py-2 rounded-lg border border-(--ui-border)" />
            </div>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo / mensaje a los padres (ej: Festivo — Batalla de Boyacá)" className="w-full text-sm px-3 py-2 rounded-lg border border-(--ui-border)" />
            <p className="text-[11px] text-(--ui-text-3)">Este texto es lo que ven los padres en su calendario.</p>
          </>
        )}

        {error && <p className="text-xs text-(--ui-bad)">{error}</p>}

        {conflicto ? (
          <div className="space-y-2 pt-1">
            <div className="rounded-lg px-3 py-2 text-xs space-y-1" style={{ backgroundColor: "var(--ui-warn-bg)", border: "1px solid var(--ui-warn)", color: "var(--ui-warn)" }}>
              <p className="font-semibold">
                Ya hay {conflicto.sesiones} sesión{conflicto.sesiones > 1 ? "es" : ""} programada{conflicto.sesiones > 1 ? "s" : ""} en ese rango.
              </p>
              <p>{conflicto.fechas.join(", ")}</p>
              <p>Si las dejas, seguirán saliendo en el PDF de padres aunque el día quede sin escuela.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConflicto(null)} disabled={saving} className="py-2 px-3 rounded-xl text-sm font-medium border border-(--ui-border) text-(--ui-text-2) hover:bg-(--ui-card-alt)">Cancelar</button>
              <button onClick={() => handleGuardar("conservar")} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-medium border border-(--ui-border) text-(--ui-text-2) hover:bg-(--ui-card-alt) disabled:opacity-50">
                Marcar y conservarlas
              </button>
              <button onClick={() => handleGuardar("borrar")} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-semibold text-(--ui-bg) disabled:opacity-50" style={{ backgroundColor: "var(--ui-bad)" }}>
                {saving ? "Guardando..." : "Marcar y borrarlas"}
              </button>
            </div>
          </div>
        ) : confirmDelete ? (
          <div className="flex gap-2 pt-2">
            <button onClick={() => setConfirmDelete(false)} disabled={deleting} className="flex-1 py-2 rounded-xl text-sm font-medium border border-(--ui-border) text-(--ui-text-2) hover:bg-(--ui-card-alt)">Cancelar</button>
            <button onClick={handleBorrar} disabled={deleting} className="flex-1 py-2 rounded-xl text-sm font-semibold text-(--ui-bg) disabled:opacity-50" style={{ backgroundColor: "var(--ui-bad)" }}>
              {deleting ? "Borrando..." : "Sí, borrar"}
            </button>
          </div>
        ) : (
          <div className="flex gap-2 pt-2">
            {editId ? (
              <button onClick={() => setConfirmDelete(true)} disabled={saving} className="py-2 px-3 rounded-xl text-sm font-medium border border-(--ui-bad) text-(--ui-bad) hover:bg-(--ui-bad-bg)">Borrar</button>
            ) : (
              <button onClick={onClose} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-medium border border-(--ui-border) text-(--ui-text-2) hover:bg-(--ui-card-alt)">Cancelar</button>
            )}
            <button onClick={() => handleGuardar()} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-semibold text-(--ui-bg) disabled:opacity-50" style={{ backgroundColor: "var(--ui-gold)" }}>
              {saving ? "Guardando..." : editId ? "Guardar cambios" : "Guardar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
