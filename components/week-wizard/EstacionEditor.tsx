"use client";

import { useState } from "react";
import EstacionLibraryPicker, { type EstacionLibraryPick } from "@/components/EstacionLibraryPicker";
import { FOCOS, FOCO_LABEL, MATERIALES, MATERIAL_LABEL, LUGARES_ESTACION } from "@/lib/estacion-library-constants";
import type { CategoriaOption, EstacionWizardState } from "./types";

interface Props {
  estacion: EstacionWizardState;
  index: number;
  categoriaOptions: CategoriaOption[]; // ya filtradas para excluir las usadas por otras estaciones del día
  grupos: string[];
  gruposFisico: string[];
  usadosEnOtrasPartes: string[]; // títulos ya elegidos en otras estaciones/días de la semana
  onChange: (next: EstacionWizardState) => void;
}

export default function EstacionEditor({ estacion, index, categoriaOptions, grupos, gruposFisico, usadosEnOtrasPartes, onChange }: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const opcionActual = categoriaOptions.find((c) => c.value === estacion.categoria) ?? categoriaOptions[0];
  const esFisica = opcionActual.drillsCategoria === null;

  function toggleMaterial(m: string) {
    const next = estacion.material.includes(m) ? estacion.material.filter((x) => x !== m) : [...estacion.material, m];
    onChange({ ...estacion, material: next, items: [] });
  }

  function removeItem(id: string) {
    onChange({ ...estacion, items: estacion.items.filter((i) => i.id !== id) });
  }

  function addItem(item: EstacionLibraryPick) {
    onChange({ ...estacion, items: [...estacion.items, item].slice(0, 3) });
    setShowPicker(false);
  }

  const yaSeleccionados = [...estacion.items.map((i) => i.titulo), ...usadosEnOtrasPartes];
  const completa = estacion.items.length > 0 && estacion.desafio.trim().length > 0;
  const enProgreso = estacion.items.length > 0 && !completa;

  return (
    <div className="border rounded-xl overflow-hidden" style={{ borderColor: completa ? "#1B4D2E" : enProgreso ? "#d97706" : "#e5e7eb" }}>
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: completa ? "#f0faf2" : enProgreso ? "#fffbeb" : "#f9fafb" }}>
        <span className="text-lg shrink-0">{opcionActual.emoji}</span>
        <select
          value={estacion.categoria}
          onChange={(e) => {
            const opt = categoriaOptions.find((c) => c.value === e.target.value)!;
            onChange({ categoria: opt.value, foco: null, material: [], items: [], desafio: "", lugar: estacion.lugar });
          }}
          className="text-xs font-bold uppercase tracking-wide bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-green-300 rounded px-1 py-0.5"
          style={{ color: "#1B4D2E" }}
        >
          {categoriaOptions.map((c) => (
            <option key={c.value} value={c.value}>Estación {index + 1} — {c.label}</option>
          ))}
        </select>
        {estacion.items.length > 0 && (
          <span className="ml-auto text-xs font-semibold text-gray-600">{estacion.items.length} ejercicio{estacion.items.length > 1 ? "s" : ""}</span>
        )}
      </div>

      <div className="p-3 space-y-3">
        {!esFisica && (
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Foco</label>
            <select
              value={estacion.foco ?? ""}
              onChange={(e) => onChange({ ...estacion, foco: e.target.value || null, items: [] })}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white"
            >
              <option value="">Cualquiera</option>
              {FOCOS.map((f) => <option key={f} value={f}>{FOCO_LABEL[f]}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Material</label>
          <div className="flex flex-wrap gap-1.5">
            {MATERIALES.map((m) => (
              <button key={m} type="button" onClick={() => toggleMaterial(m)}
                className="px-2 py-1 rounded-full text-[11px] font-semibold border transition-all"
                style={estacion.material.includes(m) ? { background: "#9a3412", color: "#fff", borderColor: "#9a3412" } : { background: "#f9fafb", color: "#374151", borderColor: "#e5e7eb" }}>
                {MATERIAL_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {estacion.items.map((item) => (
            <div key={item.id} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50 flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">{item.titulo}</p>
                {item.descripcion && <p className="text-xs text-gray-500 mt-0.5">{item.descripcion}</p>}
              </div>
              <button onClick={() => removeItem(item.id)} className="text-gray-300 hover:text-red-500 shrink-0">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={() => setShowPicker(true)}
          disabled={estacion.items.length >= 3}
          className="text-xs font-medium text-blue-700 hover:text-blue-900 disabled:opacity-40"
        >
          + Agregar de la biblioteca
        </button>

        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">
            Desafío / mini-juego de cierre {enProgreso && <span className="text-amber-600 normal-case font-medium">— falta para continuar</span>}
          </label>
          <textarea
            value={estacion.desafio}
            onChange={(e) => onChange({ ...estacion, desafio: e.target.value })}
            rows={2}
            placeholder="Reto o juego competitivo de cierre para esta estación"
            className="w-full text-xs border rounded-lg px-2.5 py-1.5 resize-none"
            style={{ borderColor: enProgreso ? "#d97706" : "#e5e7eb" }}
          />
        </div>

        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Sitio de práctica</label>
          <select
            value={estacion.lugar}
            onChange={(e) => onChange({ ...estacion, lugar: e.target.value })}
            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white"
          >
            {LUGARES_ESTACION.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
      </div>

      {showPicker && (
        esFisica ? (
          <EstacionLibraryPicker
            fuente="ejercicios_fisicos"
            categoriaExcluida="Calentamiento"
            grupos={gruposFisico}
            material={estacion.material}
            yaSeleccionados={yaSeleccionados}
            onAdd={addItem}
            onClose={() => setShowPicker(false)}
          />
        ) : (
          <EstacionLibraryPicker
            fuente="drills"
            categoriaDrills={opcionActual.drillsCategoria!}
            grupos={grupos}
            foco={estacion.foco}
            material={estacion.material}
            yaSeleccionados={yaSeleccionados}
            onAdd={addItem}
            onClose={() => setShowPicker(false)}
          />
        )
      )}
    </div>
  );
}
