"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type FuenteLibreria = "drills" | "ejercicios_fisicos";

interface LibraryItem {
  id: string;
  titulo: string;
  descripcion: string;
  rating: number | null;
  veces_usado: number | null;
  series_repeticiones?: string | null;
}

export interface EstacionLibraryPick {
  id: string;
  titulo: string;
  descripcion: string;
  series_repeticiones?: string | null;
}

interface Props {
  fuente: FuenteLibreria;
  // Requerido cuando fuente === "drills" — valor ya mapeado a la columna drills.categoria.
  categoriaDrills?: string;
  // Para drills: si viene no-vacío, un drill CON nivel_recomendado poblado solo se
  // muestra si se solapa con esta lista — un drill SIN nivel_recomendado (la
  // mayoría hoy) se muestra siempre, sin importar `grupos`. Vacío = sin filtro
  // (usado para Juvenil, cuya sesión sirve a varios subgrupos a la vez).
  // Para ejercicios_fisicos: filtro estricto vía .overlaps("grupos", grupos) —
  // siempre debe venir con al menos un valor.
  grupos: string[];
  yaSeleccionados: string[];
  onAdd: (item: EstacionLibraryPick) => void;
  onClose: () => void;
}

function StarRating({ rating }: { rating: number | null }) {
  const stars = Math.round(rating ?? 0);
  return (
    <span className="flex gap-0.5 items-center">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="9" height="9" viewBox="0 0 20 20" fill={i <= stars ? "#f59e0b" : "#e5e7eb"}>
          <path d="M10 1l2.39 4.84L18 7.27l-4 3.9.94 5.49L10 14l-4.94 2.66L6 11.17 2 7.27l5.61-.43z" />
        </svg>
      ))}
    </span>
  );
}

// Componente compartido: lista de ejercicios reales de la biblioteca — drills
// técnicos (tabla `drills`) o ejercicios físicos (tabla `ejercicios_fisicos`)
// según `fuente` — para agregar uno a una estación. Reemplaza a
// BibliotecaDrillPicker (que solo conocía drills técnicos), usado ahora desde
// JuvenileClassModal, CompetenciaClassModal, DamasClassModal y PacoPlanningModal.
export default function EstacionLibraryPicker({ fuente, categoriaDrills, grupos, yaSeleccionados, onAdd, onClose }: Props) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (fuente === "drills") {
        const { data } = await supabase
          .from("drills")
          .select("id, titulo, descripcion, rating, veces_usado, nivel_recomendado")
          .eq("categoria", categoriaDrills ?? "")
          .eq("aprobado", true)
          .order("rating", { ascending: false })
          .limit(30);
        if (cancelled) return;
        type Row = LibraryItem & { nivel_recomendado: string[] | null };
        const rows = (data as Row[]) ?? [];
        const filtered = rows.filter((d) => {
          if (!d.nivel_recomendado || d.nivel_recomendado.length === 0) return true;
          if (grupos.length === 0) return true;
          return d.nivel_recomendado.some((n) => grupos.includes(n));
        });
        setItems(filtered);
      } else {
        let query = supabase
          .from("ejercicios_fisicos")
          .select("id, nombre, instrucciones, series_repeticiones")
          .order("nombre")
          .limit(30);
        if (grupos.length > 0) query = query.overlaps("grupos", grupos);
        const { data } = await query;
        if (cancelled) return;
        type Row = { id: string; nombre: string; instrucciones: string | null; series_repeticiones: string | null };
        const rows = (data as Row[]) ?? [];
        setItems(
          rows.map((e) => ({
            id: e.id,
            titulo: e.nombre,
            descripcion: e.instrucciones ?? "",
            rating: null,
            veces_usado: null,
            series_repeticiones: e.series_repeticiones,
          }))
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fuente, categoriaDrills, grupos]);

  const disponibles = items.filter((d) => !yaSeleccionados.includes(d.titulo));

  function handlePick(item: LibraryItem) {
    if (fuente === "drills") {
      supabase.from("drills").update({ veces_usado: (item.veces_usado ?? 0) + 1 }).eq("id", item.id).then(() => {});
    }
    onAdd({ id: item.id, titulo: item.titulo, descripcion: item.descripcion, series_repeticiones: item.series_repeticiones ?? null });
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[75vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-900">Agregar de la biblioteca</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-4 justify-center">
              <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Cargando biblioteca...
            </div>
          ) : disponibles.length === 0 ? (
            <p className="text-xs text-gray-400 italic text-center py-4">
              {fuente === "drills" ? "No hay más drills disponibles en esta categoría." : "No hay más ejercicios físicos disponibles para este grupo."}
            </p>
          ) : (
            disponibles.map((d) => (
              <button
                key={d.id}
                onClick={() => handlePick(d)}
                className="w-full text-left rounded-xl border-2 border-gray-200 hover:border-green-400 hover:bg-green-50 p-3 transition-all"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900">{d.titulo}</p>
                  {fuente === "drills" && <StarRating rating={d.rating} />}
                </div>
                {d.descripcion && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{d.descripcion}</p>}
                {d.series_repeticiones && (
                  <span className="inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">
                    {d.series_repeticiones}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
