"use client";

import type { EspecialOption } from "./types";

interface Props {
  opciones: EspecialOption[];
  valor?: string;
  notas?: string;
  color: string;
  juegosCampo?: string[]; // catálogo de juegos de campo (solo si aplica)
  juegosSeleccionados?: string[];
  onChangeValor: (value: string) => void;
  onChangeNotas: (notas: string) => void;
  onChangeJuegos?: (juegos: string[]) => void;
}

export default function EspecialDiaPicker({ opciones, valor, notas, color, juegosCampo, juegosSeleccionados, onChangeValor, onChangeNotas, onChangeJuegos }: Props) {
  const opcionSel = opciones.find((o) => o.value === valor);
  const esSalidaCampo = opcionSel?.tipoSesion === "campo";
  const seleccion = juegosSeleccionados ?? [];
  function toggleJuego(j: string) {
    if (!onChangeJuegos) return;
    onChangeJuegos(seleccion.includes(j) ? seleccion.filter((x) => x !== j) : [...seleccion, j]);
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-(--ui-text-3) uppercase tracking-wide mb-1">Tipo de día especial</p>
      {opciones.map((esp) => (
        <button
          key={esp.value}
          onClick={() => onChangeValor(esp.value)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all"
          style={valor === esp.value ? { borderColor: color, background: `${color}0d` } : { borderColor: "var(--ui-border)", background: "var(--ui-card-alt)" }}
        >
          <span className="text-xl">{esp.emoji}</span>
          <div>
            <p className="text-sm font-semibold text-(--ui-text)">{esp.label}</p>
            <p className="text-xs text-(--ui-text-3)">{esp.desc}</p>
          </div>
          {valor === esp.value && (
            <div className="ml-auto w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: color }}>
              <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={3}><path d="M3 10l4 4 9-9" /></svg>
            </div>
          )}
        </button>
      ))}
      {esSalidaCampo && juegosCampo && juegosCampo.length > 0 && (
        <div className="pt-1">
          <p className="text-[11px] font-bold text-(--ui-text-3) uppercase tracking-wide mb-1.5">Juegos / retos de campo</p>
          <div className="flex flex-wrap gap-1.5">
            {juegosCampo.map((j) => {
              const on = seleccion.includes(j);
              return (
                <button key={j} type="button" onClick={() => toggleJuego(j)}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all"
                  style={on ? { background: color, color: "var(--g-on-accent)", borderColor: color } : { background: "var(--ui-card-alt)", color: "var(--ui-text-2)", borderColor: "var(--ui-border)" }}>
                  {j}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <textarea
        value={notas ?? ""}
        onChange={(e) => onChangeNotas(e.target.value)}
        rows={2}
        placeholder="Notas (opcional)"
        className="w-full text-xs border border-(--ui-border) rounded-lg px-2.5 py-1.5 resize-none mt-2"
      />
    </div>
  );
}
