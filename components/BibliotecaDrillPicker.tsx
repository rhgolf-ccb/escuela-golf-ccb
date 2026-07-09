"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface LibraryDrillOption {
  id: string;
  titulo: string;
  descripcion: string;
  rating: number | null;
  veces_usado: number | null;
}

interface Props {
  categoriaDrills: string; // valor ya mapeado a la columna drills.categoria
  yaSeleccionados: string[]; // títulos ya elegidos en la estación, para no repetirlos
  onAdd: (drill: { titulo: string; descripcion: string }) => void;
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

// Componente compartido: lista de drills reales de la biblioteca (tabla `drills`)
// filtrados por categoría, para agregar uno manualmente a una estación — usado
// tanto por JuvenileClassModal (Día específico) como por PacoPlanningModal
// (vista previa de la semana con Paco).
export default function BibliotecaDrillPicker({ categoriaDrills, yaSeleccionados, onAdd, onClose }: Props) {
  const [drills, setDrills] = useState<LibraryDrillOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("drills")
        .select("id, titulo, descripcion, rating, veces_usado")
        .eq("categoria", categoriaDrills)
        .eq("aprobado", true)
        .order("rating", { ascending: false })
        .limit(20);
      if (!cancelled) {
        setDrills((data as LibraryDrillOption[]) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categoriaDrills]);

  const disponibles = drills.filter((d) => !yaSeleccionados.includes(d.titulo));

  function handlePick(d: LibraryDrillOption) {
    supabase.from("drills").update({ veces_usado: (d.veces_usado ?? 0) + 1 }).eq("id", d.id).then(() => {});
    onAdd({ titulo: d.titulo, descripcion: d.descripcion });
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
            <p className="text-xs text-gray-400 italic text-center py-4">No hay más drills disponibles en esta categoría.</p>
          ) : (
            disponibles.map((d) => (
              <button
                key={d.id}
                onClick={() => handlePick(d)}
                className="w-full text-left rounded-xl border-2 border-gray-200 hover:border-green-400 hover:bg-green-50 p-3 transition-all"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900">{d.titulo}</p>
                  <StarRating rating={d.rating} />
                </div>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{d.descripcion}</p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
