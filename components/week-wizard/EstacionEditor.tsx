"use client";

import { useState } from "react";
import EstacionLibraryPicker, { type EstacionLibraryPick } from "@/components/EstacionLibraryPicker";
import { FOCOS, FOCO_LABEL, MATERIAL_LABEL, LUGARES_ESTACION, type Material } from "@/lib/estacion-library-constants";
import type { CategoriaOption, EstacionWizardState, TransferBlock } from "./types";
import { TRANSFER_PRESETS } from "./group-configs";

function genBlockId(): string {
  return Math.random().toString(36).slice(2, 9);
}

interface Props {
  estacion: EstacionWizardState;
  index: number;
  categoriaOptions: CategoriaOption[]; // ya filtradas para excluir las usadas por otras estaciones del día
  grupos: string[];
  gruposFisico: string[];
  // Materiales que ofrece el filtro — Birdies no muestra el equipo de los
  // grupos grandes (ver materialesPara en group-configs).
  materialesDisponibles: readonly Material[];
  // Birdies: oculta de la biblioteca los drills sin nivel_recomendado.
  estrictoDrills?: boolean;
  usadosEnOtrasPartes: string[]; // títulos ya elegidos en otras estaciones/días de la semana
  retosSugeridos?: string[]; // sugerencias de reto de cierre (vacío = sin sugerencia)
  permiteTransferencia?: boolean; // Competencia: habilita secuencia de transferencia en tiro largo
  profesores?: string[]; // lista de profesores para asignar responsable
  onChange: (next: EstacionWizardState) => void;
}

const FOCOS_LEGACY = new Set<string>(FOCOS);

export default function EstacionEditor({ estacion, index, categoriaOptions, grupos, gruposFisico, materialesDisponibles, estrictoDrills, usadosEnOtrasPartes, retosSugeridos, permiteTransferencia, profesores, onChange }: Props) {
  const opcionActual = categoriaOptions.find((c) => c.value === estacion.categoria) ?? categoriaOptions[0];
  // Focos del tema (Competencia/Juvenil) o el vocabulario genérico si no define.
  const focoOpciones = opcionActual.focos ?? FOCOS.map((f) => ({ value: f, label: FOCO_LABEL[f] }));
  const [showPicker, setShowPicker] = useState(false);
  const [retoIdx, setRetoIdx] = useState(0);
  // Foco escrito a mano ("Otro…"). Se deriva en vez de depender solo del estado
  // local: si el foco que llega no está en la lista (día ya guardado que se
  // reabre, o copiado del día anterior) el editor arranca directo en modo libre
  // y conserva el texto.
  const [focoLibre, setFocoLibre] = useState(false);
  const enModoLibre = focoLibre || (!!estacion.foco && !focoOpciones.some((f) => f.value === estacion.foco));
  const esFisica = opcionActual.drillsCategoria === null;
  const esTiroLargo = !!permiteTransferencia && opcionActual.canonical === "juego_largo";
  const bloques = estacion.transferencia ?? [];

  function setBloques(next: TransferBlock[]) {
    onChange({ ...estacion, transferencia: next });
  }
  function addBloque(prep = "", bolas = 10) {
    setBloques([...bloques, { id: genBlockId(), prep, bolas }]);
  }
  function updateBloque(idx: number, patch: Partial<TransferBlock>) {
    setBloques(bloques.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  }
  function removeBloque(idx: number) {
    setBloques(bloques.filter((_, i) => i !== idx));
  }
  function moveBloque(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= bloques.length) return;
    const next = [...bloques];
    [next[idx], next[j]] = [next[j], next[idx]];
    setBloques(next);
  }
  // El foco también se muestra en físico cuando el tema define sus propios focos
  // (ej. físico de Juvenil orientado al swing).
  const mostrarFoco = opcionActual.focos != null || !esFisica;
  // El picker filtra por drills.subcategoria: solo pasamos el foco si es del
  // vocabulario legacy con drills etiquetados; los focos nuevos no filtran (aún)
  // para no dejar la biblioteca vacía.
  const focoParaPicker = estacion.foco && FOCOS_LEGACY.has(estacion.foco) ? estacion.foco : null;
  const sugerencias = retosSugeridos ?? [];
  const sugerenciaActual = sugerencias.length ? sugerencias[retoIdx % sugerencias.length] : null;

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
  const completa = estacion.items.length > 0 || bloques.length > 0;

  return (
    <div className="border rounded-xl overflow-hidden" style={{ borderColor: completa ? "#1B4D2E" : "#e5e7eb" }}>
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: completa ? "#f0faf2" : "#f9fafb" }}>
        <span className="text-lg shrink-0">{opcionActual.emoji}</span>
        <select
          value={estacion.categoria}
          onChange={(e) => {
            const opt = categoriaOptions.find((c) => c.value === e.target.value)!;
            setFocoLibre(false); // el foco se resetea con el tema, también si era texto libre
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
        {mostrarFoco && (
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Foco</label>
            <select
              value={enModoLibre ? "__otro__" : estacion.foco ?? ""}
              onChange={(e) => {
                if (e.target.value === "__otro__") {
                  setFocoLibre(true);
                  onChange({ ...estacion, foco: "" });
                  return;
                }
                setFocoLibre(false);
                const v = e.target.value || null;
                // Solo limpiamos los ejercicios si el foco realmente filtra la
                // biblioteca (vocabulario legacy); los focos nuevos no filtran.
                const filtra = v != null && FOCOS_LEGACY.has(v);
                onChange(filtra ? { ...estacion, foco: v, items: [] } : { ...estacion, foco: v });
              }}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white"
            >
              <option value="">Cualquiera</option>
              {focoOpciones.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              <option value="__otro__">Otro…</option>
            </select>
            {enModoLibre && (
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="text"
                  value={estacion.foco ?? ""}
                  onChange={(e) => onChange({ ...estacion, foco: e.target.value })}
                  placeholder="Escribe el foco de esta estación"
                  maxLength={60}
                  className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5"
                />
                <button
                  type="button"
                  onClick={() => { setFocoLibre(false); onChange({ ...estacion, foco: null }); }}
                  className="text-[11px] font-medium text-blue-700 hover:text-blue-900 shrink-0"
                >
                  volver a la lista
                </button>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Material</label>
          <div className="flex flex-wrap gap-1.5">
            {materialesDisponibles.map((m) => (
              <button key={m} type="button" onClick={() => toggleMaterial(m)}
                className="px-2 py-1 rounded-full text-[11px] font-semibold border transition-all"
                style={estacion.material.includes(m) ? { background: "#9a3412", color: "#fff", borderColor: "#9a3412" } : { background: "#f9fafb", color: "#374151", borderColor: "#e5e7eb" }}>
                {MATERIAL_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

        {esTiroLargo && (
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">
              Secuencia de transferencia <span className="text-gray-400 normal-case font-medium">— físico → técnico</span>
            </label>
            <div className="space-y-1.5">
              {bloques.map((b, i) => (
                <div key={b.id} className="flex items-center gap-1.5">
                  <div className="flex flex-col text-[10px] leading-none">
                    <button type="button" onClick={() => moveBloque(i, -1)} disabled={i === 0} className="text-gray-300 hover:text-gray-600 disabled:opacity-20">▲</button>
                    <button type="button" onClick={() => moveBloque(i, 1)} disabled={i === bloques.length - 1} className="text-gray-300 hover:text-gray-600 disabled:opacity-20">▼</button>
                  </div>
                  <input value={b.prep} onChange={(e) => updateBloque(i, { prep: e.target.value })}
                    placeholder="Preparación (ej. bandas + backswing)"
                    className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-2 py-1.5" />
                  <span className="text-gray-400 text-xs shrink-0">→</span>
                  <input type="number" min={0} value={b.bolas}
                    onChange={(e) => updateBloque(i, { bolas: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-12 text-xs border border-gray-200 rounded-lg px-1.5 py-1.5 text-center" />
                  <span className="text-[11px] text-gray-500 shrink-0">bolas</span>
                  <button type="button" onClick={() => removeBloque(i)} className="text-gray-300 hover:text-red-500 shrink-0">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {TRANSFER_PRESETS.map((p) => (
                <button key={p.prep} type="button" onClick={() => addBloque(p.prep, p.bolas)}
                  className="px-2 py-1 rounded-full text-[11px] font-semibold border"
                  style={{ background: "#fff8e1", color: "#7d5a00", borderColor: "#f0d98c" }}>+ {p.prep}</button>
              ))}
              <button type="button" onClick={() => addBloque()}
                className="px-2 py-1 rounded-full text-[11px] font-semibold border border-gray-200 text-gray-600">+ Bloque vacío</button>
            </div>
          </div>
        )}

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
            Reto de cierre <span className="text-gray-400 normal-case font-medium">— sugerido, opcional</span>
          </label>
          {sugerenciaActual && (
            <div className="mb-2 rounded-lg px-2.5 py-2 flex items-start gap-2" style={{ background: "#fff8e1", border: "1px solid #f0d98c" }}>
              <span className="text-sm shrink-0">🏆</span>
              <p className="text-xs flex-1 min-w-0" style={{ color: "#7d5a00" }}>{sugerenciaActual}</p>
              <div className="flex flex-col gap-1 shrink-0">
                <button type="button" onClick={() => onChange({ ...estacion, desafio: sugerenciaActual })}
                  className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: "#7d5a00", color: "#fff" }}>Usar</button>
                {sugerencias.length > 1 && (
                  <button type="button" onClick={() => setRetoIdx((i) => i + 1)}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded border" style={{ color: "#7d5a00", borderColor: "#f0d98c" }}>Otro</button>
                )}
              </div>
            </div>
          )}
          <textarea
            value={estacion.desafio}
            onChange={(e) => onChange({ ...estacion, desafio: e.target.value })}
            rows={2}
            placeholder="Reto o juego competitivo de cierre para esta estación (opcional)"
            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 resize-none"
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

        {profesores && profesores.length > 0 && (() => {
          const partes = (estacion.responsable ?? "").split(" · ");
          const r1 = partes[0] ?? "";
          const r2 = partes[1] ?? "";
          const setResp = (a: string, b: string) => onChange({ ...estacion, responsable: [a, b].filter(Boolean).join(" · ") || undefined });
          return (
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Responsable(s) <span className="text-gray-400 normal-case font-medium">— hasta 2</span></label>
              <div className="flex gap-2">
                <select value={r1} onChange={(e) => setResp(e.target.value, r2)}
                  className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
                  <option value="">Sin asignar</option>
                  {profesores.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={r2} onChange={(e) => setResp(r1, e.target.value)} disabled={!r1}
                  className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white disabled:opacity-40">
                  <option value="">— 2º profe (opcional)</option>
                  {profesores.filter((p) => p !== r1).map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          );
        })()}
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
            estricto={estrictoDrills}
            foco={focoParaPicker}
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
