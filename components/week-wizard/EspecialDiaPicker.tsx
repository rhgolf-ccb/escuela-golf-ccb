"use client";

import type { EspecialOption } from "./types";

interface Props {
  opciones: EspecialOption[];
  valor?: string;
  notas?: string;
  color: string;
  onChangeValor: (value: string) => void;
  onChangeNotas: (notas: string) => void;
}

export default function EspecialDiaPicker({ opciones, valor, notas, color, onChangeValor, onChangeNotas }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Tipo de día especial</p>
      {opciones.map((esp) => (
        <button
          key={esp.value}
          onClick={() => onChangeValor(esp.value)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all"
          style={valor === esp.value ? { borderColor: color, background: `${color}0d` } : { borderColor: "#e5e7eb", background: "#f9fafb" }}
        >
          <span className="text-xl">{esp.emoji}</span>
          <div>
            <p className="text-sm font-semibold text-gray-900">{esp.label}</p>
            <p className="text-xs text-gray-500">{esp.desc}</p>
          </div>
          {valor === esp.value && (
            <div className="ml-auto w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: color }}>
              <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={3}><path d="M3 10l4 4 9-9" /></svg>
            </div>
          )}
        </button>
      ))}
      <textarea
        value={notas ?? ""}
        onChange={(e) => onChangeNotas(e.target.value)}
        rows={2}
        placeholder="Notas (opcional)"
        className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 resize-none mt-2"
      />
    </div>
  );
}
