"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import EstacionLibraryPicker, { type EstacionLibraryPick } from "@/components/EstacionLibraryPicker";
import type { CalentamientoState } from "./types";

const DURACION_MAX_MIN = 10;

interface Props {
  calentamiento: CalentamientoState | null;
  gruposFisico: string[];
  usadosEnOtrasPartes: string[];
  onChange: (next: CalentamientoState | null) => void;
}

export default function CalentamientoStep({ calentamiento, gruposFisico, usadosEnOtrasPartes, onChange }: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const [loadingEstandar, setLoadingEstandar] = useState(false);

  const activo = calentamiento !== null;

  async function cargarEstandar() {
    setLoadingEstandar(true);
    const { data } = await supabase
      .from("ejercicios_fisicos")
      .select("id, nombre, instrucciones, series_repeticiones")
      .eq("categoria", "Calentamiento")
      .overlaps("grupos", gruposFisico)
      .order("nombre")
      .limit(2);
    setLoadingEstandar(false);
    const ejercicios: EstacionLibraryPick[] = (data ?? []).map((e) => ({
      id: e.id, titulo: e.nombre, descripcion: e.instrucciones ?? "", series_repeticiones: e.series_repeticiones,
    }));
    if (ejercicios.length === 0) { onChange({ ejercicios: [], duracionMin: 8 }); return; }
    onChange({ ejercicios, duracionMin: Math.min(8, DURACION_MAX_MIN) });
  }

  function addItem(item: EstacionLibraryPick) {
    const base = calentamiento ?? { ejercicios: [], duracionMin: 8 };
    onChange({ ...base, ejercicios: [...base.ejercicios, item].slice(0, 3) });
    setShowPicker(false);
  }

  function removeItem(id: string) {
    if (!calentamiento) return;
    const ejercicios = calentamiento.ejercicios.filter((e) => e.id !== id);
    onChange(ejercicios.length > 0 ? { ...calentamiento, ejercicios } : null);
  }

  if (!activo) {
    return (
      <div className="border border-dashed border-(--ui-border) rounded-xl p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-(--ui-text-2)">Calentamiento</p>
          <p className="text-xs text-(--ui-text-3) mt-0.5">Opcional — máx. {DURACION_MAX_MIN} min</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={cargarEstandar}
            disabled={loadingEstandar}
            className="text-xs font-semibold px-3 py-2 rounded-lg text-(--g-on-accent) disabled:opacity-50"
            style={{ background: "var(--ui-gold)" }}
          >
            {loadingEstandar ? "Cargando..." : "Calentamiento estándar"}
          </button>
          <button onClick={() => onChange({ ejercicios: [], duracionMin: 8 })} className="text-xs font-medium text-(--g-birdies-fg) hover:text-blue-900">
            Elegir manualmente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-xl p-3 space-y-3" style={{ borderColor: calentamiento.ejercicios.length > 0 ? "var(--ui-gold)" : "var(--ui-border)" }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-(--ui-text-2)">Calentamiento</p>
        <button onClick={() => onChange(null)} className="text-xs text-(--ui-text-3) hover:text-(--ui-bad)">Saltar</button>
      </div>

      <div className="space-y-2">
        {calentamiento.ejercicios.map((item) => (
          <div key={item.id} className="border border-(--ui-border-soft) rounded-lg p-2.5 bg-(--ui-card-alt) flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-(--ui-text)">{item.titulo}</p>
              {item.descripcion && <p className="text-xs text-(--ui-text-3) mt-0.5 line-clamp-2">{item.descripcion}</p>}
            </div>
            <button onClick={() => removeItem(item.id)} className="text-(--ui-text-3) hover:text-(--ui-bad) shrink-0">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowPicker(true)}
          disabled={calentamiento.ejercicios.length >= 3}
          className="text-xs font-medium text-(--g-birdies-fg) hover:text-blue-900 disabled:opacity-40"
        >
          + Agregar de la biblioteca
        </button>
        <label className="text-xs text-(--ui-text-3) flex items-center gap-1.5 ml-auto">
          Minutos
          <input
            type="number" min={1} max={DURACION_MAX_MIN} value={calentamiento.duracionMin}
            onChange={(e) => onChange({ ...calentamiento, duracionMin: Math.min(DURACION_MAX_MIN, Math.max(1, Number(e.target.value) || 1)) })}
            className="w-14 text-xs border border-(--ui-border) rounded-lg px-2 py-1"
          />
        </label>
      </div>

      {showPicker && (
        <EstacionLibraryPicker
          fuente="ejercicios_fisicos"
          categoria="Calentamiento"
          grupos={gruposFisico}
          yaSeleccionados={[...calentamiento.ejercicios.map((i) => i.titulo), ...usadosEnOtrasPartes]}
          onAdd={addItem}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
