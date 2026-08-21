"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MATERIAL_KEYWORDS, normalizarTexto, type Material } from "@/lib/estacion-library-constants";
import { drillSirveAlGrupo } from "@/components/week-wizard/group-configs";

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
  // Solo fuente "drills": con `estricto`, un drill SIN nivel_recomendado deja
  // de mostrarse en vez de pasar siempre. Lo usa Birdies (4-5 años), donde un
  // drill sin etiquetar es material de 6+ que no sirve tal cual.
  estricto?: boolean;
  // Foco — solo aplica a fuente "drills" (ejercicios_fisicos no tiene esa
  // columna). Elegido como paso previo en el flujo guiado, llega ya decidido.
  foco?: string | null;
  // Material — para drills, overlap exacto contra material (text[]). Para
  // ejercicios_fisicos, match por palabra clave contra materiales (texto
  // libre) — ver MATERIAL_KEYWORDS.
  material?: string[];
  // Solo fuente "ejercicios_fisicos": filtra por categoria exacta (ej.
  // "Calentamiento" para el paso de calentamiento) o la excluye (trabajo
  // físico, que nunca debe mostrar ejercicios de calentamiento).
  categoria?: string;
  categoriaExcluida?: string;
  yaSeleccionados: string[];
  onAdd: (item: EstacionLibraryPick) => void;
  onClose: () => void;
}

function StarRating({ rating }: { rating: number | null }) {
  const stars = Math.round(rating ?? 0);
  return (
    <span className="flex gap-0.5 items-center">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="9" height="9" viewBox="0 0 20 20" fill={i <= stars ? "var(--ui-warn)" : "var(--ui-border)"}>
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
export default function EstacionLibraryPicker({ fuente, categoriaDrills, grupos, estricto, foco, material, categoria, categoriaExcluida, yaSeleccionados, onAdd, onClose }: Props) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (fuente === "drills") {
        let query = supabase
          .from("drills")
          .select("id, titulo, descripcion, rating, veces_usado, nivel_recomendado, material")
          .eq("categoria", categoriaDrills ?? "")
          .eq("aprobado", true)
          .order("rating", { ascending: false })
          .limit(500); // el filtro por grupo/material es cliente: hay que traer
                       // todos los elegibles, no solo el top-N por rating.
        if (foco) query = query.eq("subcategoria", foco);
        const { data } = await query;
        if (cancelled) return;
        type Row = LibraryItem & { nivel_recomendado: string[] | null; material: string[] | null };
        const rows = (data as Row[]) ?? [];
        const filtered = rows.filter((d) => {
          if (!drillSirveAlGrupo(d.nivel_recomendado, grupos, !!estricto)) return false;
          if (material && material.length > 0) {
            // "ninguno" = sin equipo → incluye drills que no requieren material.
            const equipos = material.filter((m) => m !== "ninguno");
            const incluyeNinguno = material.includes("ninguno");
            const matchEquipo = !!(d.material && d.material.some((m) => equipos.includes(m)));
            const sinMaterial = !d.material || d.material.length === 0;
            if (!(matchEquipo || (incluyeNinguno && sinMaterial))) return false;
          }
          return true;
        });
        setItems(filtered);
      } else {
        let query = supabase
          .from("ejercicios_fisicos")
          .select("id, nombre, categoria, materiales, instrucciones, series_repeticiones")
          .order("nombre")
          .limit(30);
        if (grupos.length > 0) query = query.overlaps("grupos", grupos);
        if (categoria) query = query.eq("categoria", categoria);
        if (categoriaExcluida) query = query.neq("categoria", categoriaExcluida);
        const { data } = await query;
        if (cancelled) return;
        type Row = { id: string; nombre: string; categoria: string | null; materiales: string | null; instrucciones: string | null; series_repeticiones: string | null };
        let rows = (data as Row[]) ?? [];
        if (material && material.length > 0) {
          // "ninguno" = sin equipo → incluye ejercicios sin material o de peso corporal.
          const equipos = material.filter((m) => m !== "ninguno");
          const incluyeNinguno = material.includes("ninguno");
          const keywords = equipos.flatMap((m) => MATERIAL_KEYWORDS[m as Material] ?? []);
          rows = rows.filter((r) => {
            const texto = normalizarTexto(r.materiales ?? "");
            const matchEquipo = keywords.some((k) => texto.includes(k));
            const sinMaterial = texto.trim() === "" || texto.includes("ninguno") || texto.includes("ninguna") || texto.includes("sin ") || texto.includes("corporal");
            return matchEquipo || (incluyeNinguno && sinMaterial);
          });
        }
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
  }, [fuente, categoriaDrills, grupos, estricto, foco, material, categoria, categoriaExcluida]);

  const disponibles = items.filter((d) => !yaSeleccionados.includes(d.titulo));

  function handlePick(item: LibraryItem) {
    if (fuente === "drills") {
      supabase.from("drills").update({ veces_usado: (item.veces_usado ?? 0) + 1 }).eq("id", item.id).then(() => {});
    }
    onAdd({ id: item.id, titulo: item.titulo, descripcion: item.descripcion, series_repeticiones: item.series_repeticiones ?? null });
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-(--ui-card) rounded-2xl shadow-2xl w-full max-w-md max-h-[75vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-(--ui-border-soft)">
          <p className="text-sm font-bold text-(--ui-text)">Agregar de la biblioteca</p>
          <button onClick={onClose} className="text-(--ui-text-3) hover:text-(--ui-text-2)">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-(--ui-text-3) py-4 justify-center">
              <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Cargando biblioteca...
            </div>
          ) : disponibles.length === 0 ? (
            <p className="text-xs text-(--ui-text-3) italic text-center py-4">
              {fuente === "drills" ? "No hay más drills disponibles en esta categoría." : "No hay más ejercicios físicos disponibles para este grupo."}
            </p>
          ) : (
            disponibles.map((d) => (
              <button
                key={d.id}
                onClick={() => handlePick(d)}
                className="w-full text-left rounded-xl border-2 border-(--ui-border) hover:border-green-400 hover:bg-(--ui-ok-bg) p-3 transition-all"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-(--ui-text)">{d.titulo}</p>
                  {fuente === "drills" && <StarRating rating={d.rating} />}
                </div>
                {d.descripcion && <p className="text-xs text-(--ui-text-3) mt-0.5 line-clamp-2">{d.descripcion}</p>}
                {d.series_repeticiones && (
                  <span className="inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-(--g-birdies-bg) text-(--g-birdies-fg)">
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
