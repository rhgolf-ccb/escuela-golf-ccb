"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isStaff, type Rol } from "@/lib/roles";

interface EventoCalendario {
  id: string;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  descripcion: string | null;
  tipo: "institucional" | "especial";
}

type EventoForm = {
  nombre: string;
  tipo: "institucional" | "especial";
  fecha_inicio: string;
  fecha_fin: string;
  descripcion: string;
};

const FORM_VACIO: EventoForm = { nombre: "", tipo: "institucional", fecha_inicio: "", fecha_fin: "", descripcion: "" };

function formatFecha(fecha: string) {
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

function formatRango(inicio: string, fin: string | null) {
  if (!fin || fin === inicio) return formatFecha(inicio);
  return `${formatFecha(inicio)} — ${formatFecha(fin)}`;
}

export default function EventosTab({ currentRol }: { currentRol: Rol | null }) {
  const staff = !!currentRol && isStaff(currentRol);

  const [eventos, setEventos] = useState<EventoCalendario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<EventoForm | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function fetchEventos() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("eventos_calendario")
      .select("id, nombre, fecha_inicio, fecha_fin, descripcion, tipo")
      .order("fecha_inicio", { ascending: true });
    if (err) setError(err.message);
    else setEventos((data ?? []) as EventoCalendario[]);
    setLoading(false);
  }

  useEffect(() => { fetchEventos(); }, []);

  function openCrear() {
    setEditId(null);
    setForm({ ...FORM_VACIO });
    setFormError(null);
  }

  function openEditar(ev: EventoCalendario) {
    setEditId(ev.id);
    setForm({
      nombre: ev.nombre, tipo: ev.tipo,
      fecha_inicio: ev.fecha_inicio, fecha_fin: ev.fecha_fin ?? "",
      descripcion: ev.descripcion ?? "",
    });
    setFormError(null);
  }

  async function handleGuardar() {
    if (!form) return;
    if (!form.nombre.trim()) { setFormError("Ponle un nombre al evento."); return; }
    if (!form.fecha_inicio) { setFormError("Selecciona una fecha."); return; }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        nombre: form.nombre.trim(), tipo: form.tipo,
        fecha_inicio: form.fecha_inicio, fecha_fin: form.fecha_fin || null,
        descripcion: form.descripcion.trim() || null,
      };
      const res = editId
        ? await fetch(`/api/calendario-evento/${editId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
          })
        : await fetch("/api/calendario-evento", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "evento", ...payload }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      setForm(null);
      setEditId(null);
      await fetchEventos();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleBorrar() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/calendario-evento/${confirmDeleteId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al borrar");
      setConfirmDeleteId(null);
      await fetchEventos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al borrar");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-(--ui-text-3)">
          Torneos, medallas mensuales, festivales y demás eventos institucionales — se marcan automáticamente en el calendario de padres.
        </p>
        {staff && (
          <button
            onClick={openCrear}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-(--g-on-accent) shadow-sm hover:brightness-110 transition-all shrink-0 ml-4"
            style={{ background: "var(--ui-gold)" }}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            Nuevo evento
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-(--ui-text-3) py-10 justify-center">
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Cargando eventos...
        </div>
      ) : error ? (
        <div className="bg-(--ui-bad-bg) border border-(--ui-bad) rounded-lg px-4 py-3 text-sm text-(--ui-bad)">{error}</div>
      ) : eventos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-(--ui-text-3) text-center">
          <p className="text-sm">Aún no hay eventos agendados.</p>
          {staff && <p className="text-xs text-(--ui-text-3) mt-1">Usa &quot;Nuevo evento&quot; para agregar el primero.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {eventos.map((ev) => (
            <div key={ev.id} className="flex items-center gap-3 border border-(--ui-border-soft) rounded-xl px-4 py-3 bg-(--ui-card)">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-(--ui-text)">{ev.nombre}</p>
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                    style={ev.tipo === "especial" ? { background: "var(--ui-warn-bg)", color: "var(--ui-warn)" } : { background: "var(--g-birdies-bg)", color: "var(--g-birdies-fg)" }}
                  >
                    {ev.tipo === "especial" ? "Especial" : "Institucional"}
                  </span>
                </div>
                <p className="text-xs text-(--ui-text-3) mt-0.5">{formatRango(ev.fecha_inicio, ev.fecha_fin)}</p>
                {ev.descripcion && <p className="text-xs text-(--ui-text-3) mt-1">{ev.descripcion}</p>}
              </div>
              {staff && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEditar(ev)} className="p-1.5 text-(--ui-text-3) hover:text-(--ui-text-2) rounded-lg hover:bg-(--ui-card-alt)">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </button>
                  <button onClick={() => setConfirmDeleteId(ev.id)} className="p-1.5 text-(--ui-text-3) hover:text-(--ui-bad) rounded-lg hover:bg-(--ui-bad-bg)">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6" /></svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Crear / editar evento ── */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target === e.currentTarget && !saving) setForm(null); }}>
          <div className="bg-(--ui-card) rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
            <h3 className="font-bold text-(--ui-text)">{editId ? "Editar evento" : "Nuevo evento"}</h3>

            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Nombre del evento (ej: Torneo interno juvenil)"
              className="w-full text-sm px-3 py-2 rounded-lg border border-(--ui-border)"
            />

            <div className="flex gap-2">
              <button onClick={() => setForm({ ...form, tipo: "institucional" })} className="flex-1 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={form.tipo === "institucional" ? { backgroundColor: "color-mix(in srgb, var(--g-birdies-fg) 9%, transparent)", color: "var(--g-birdies-fg)" } : { color: "var(--ui-text-3)", backgroundColor: "var(--ui-card-alt)" }}>
                Institucional
              </button>
              <button onClick={() => setForm({ ...form, tipo: "especial" })} className="flex-1 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={form.tipo === "especial" ? { backgroundColor: "color-mix(in srgb, var(--ui-warn) 9%, transparent)", color: "var(--ui-warn)" } : { color: "var(--ui-text-3)", backgroundColor: "var(--ui-card-alt)" }}>
                Especial
              </button>
            </div>

            <div className="flex gap-2">
              <input type="date" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} className="flex-1 text-sm px-3 py-2 rounded-lg border border-(--ui-border)" />
              <input type="date" value={form.fecha_fin} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} placeholder="Fecha fin (opcional)" className="flex-1 text-sm px-3 py-2 rounded-lg border border-(--ui-border)" />
            </div>

            <textarea
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              rows={2}
              placeholder="Descripción (opcional)"
              className="w-full text-sm px-3 py-2 rounded-lg border border-(--ui-border) resize-none"
            />

            {formError && <p className="text-xs text-(--ui-bad)">{formError}</p>}

            <div className="flex gap-2 pt-2">
              <button onClick={() => setForm(null)} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-medium border border-(--ui-border) text-(--ui-text-2) hover:bg-(--ui-card-alt)">
                Cancelar
              </button>
              <button onClick={handleGuardar} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-semibold text-(--ui-bg) disabled:opacity-50" style={{ backgroundColor: "var(--ui-gold)" }}>
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmar borrar ── */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target === e.currentTarget && !deleting) setConfirmDeleteId(null); }}>
          <div className="bg-(--ui-card) rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-3">
            <h3 className="font-bold text-(--ui-text)">¿Borrar este evento?</h3>
            <p className="text-sm text-(--ui-text-3)">Esta acción no se puede deshacer. El evento desaparecerá del calendario de padres.</p>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setConfirmDeleteId(null)} disabled={deleting} className="flex-1 py-2 rounded-xl text-sm font-medium border border-(--ui-border) text-(--ui-text-2) hover:bg-(--ui-card-alt)">
                Cancelar
              </button>
              <button onClick={handleBorrar} disabled={deleting} className="flex-1 py-2 rounded-xl text-sm font-semibold text-(--ui-bg) disabled:opacity-50 bg-(--ui-bad) hover:brightness-110">
                {deleting ? "Borrando..." : "Borrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
