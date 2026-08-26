"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  BookOpen, ChevronDown, ChevronUp, Download, Flag, MapPin, Package, Pencil, Plus,
  RotateCw, Search, Sparkles, Star, Target, Trash2, Upload, X, Clock, Check,
} from "lucide-react";
import { FOCOS, FOCO_LABEL, MATERIALES, MATERIAL_LABEL } from "@/lib/estacion-library-constants";
import { colorGrupo } from "@/lib/grupos";
import {
  BotonPrimario, BotonSecundario, CAMPO, CLASE_CAMPO, Campo, CampoLabel, EmptyState,
  Encabezado, Loading, Modal, ModalConfirmar, ModalHeader, Pagina, Tabs, Toast,
} from "@/components/ui/tema";

// ── Types ─────────────────────────────────────────────────────────────────────
type Categoria = "tecnico" | "juego_corto" | "putting" | "campo";

interface ReglasCampo { texto: string; }

interface Drill {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: Categoria;
  subcategoria: string | null;
  posicion_swing: string[] | null;
  nivel_recomendado: string[] | null;
  material: string[] | null;
  lugar: string;
  duracion_minutos: number | null;
  repeticiones: string | null;
  error_que_corrige: string | null;
  sensacion_buscada: string | null;
  metrica_exito: string | null;
  variante_presion: string | null;
  reglas_campo: ReglasCampo[] | null;
  rating: number;
  veces_usado: number;
  favorito: boolean;
  aprobado: boolean;
  generado_por_ia: boolean;
  notas_instructor: string | null;
  created_at: string;
}

type DrillForm = Omit<Drill, "id" | "created_at" | "veces_usado">;

// ── Constants ─────────────────────────────────────────────────────────────────
const TABS: { id: Categoria; label: string }[] = [
  { id: "tecnico",     label: "Técnico" },
  { id: "juego_corto", label: "Juego corto" },
  { id: "putting",     label: "Putting" },
  { id: "campo",       label: "Juegos de campo" },
];

const TAB_FILTERS: Record<Categoria, string[]> = {
  tecnico:     ["P1","P2","P3","P4","P5","P6","P7","P8","P9","P10","⭐ Favoritos"],
  juego_corto: ["Chipping","Bunker","Approach","50-100yds"],
  putting:     ["Distancia","Dirección","Presión"],
  campo:       ["Skills","Matchplay","Scramble"],
};

const POSICIONES = ["P1","P2","P3","P4","P5","P6","P7","P8","P9","P10"];
const POSICION_LABEL: Record<string,string> = {
  P1:"Setup", P2:"Takeaway", P3:"Media subida", P4:"Top backswing",
  P5:"Inicio downswing", P6:"Impacto", P7:"Follow through", P8:"P8", P9:"P9", P10:"P10",
};
const NIVELES = ["birdies","aguilas","albatros","mas14","competencia","damas"];
const NIVEL_LABEL: Record<string,string> = {
  birdies:"Birdies", aguilas:"Águilas", albatros:"Albatros",
  mas14:"+14", competencia:"Competencia", damas:"Damas",
};

// El nivel de un drill es un grupo del padrón, así que se pinta con el color de
// ese grupo en vez del azul único que llevaban todas las etiquetas de nivel.
function tonoNivel(n: string) {
  return colorGrupo(NIVEL_LABEL[n] ?? n);
}

/** Chip de filtro genérico: apagado con contorno, encendido con su color. */
function Chip({ label, activo, onClick, tono, icono: Icono }: {
  label: string; activo: boolean; onClick: () => void;
  tono?: { background: string; color: string };
  icono?: React.ComponentType<{ size?: number }>;
}) {
  const on = tono ?? { background: "var(--ui-gold)", color: "var(--ui-bg)" };
  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap"
      style={activo
        ? { background: on.background, color: on.color, border: `1px solid ${on.color}` }
        : { background: "transparent", color: "var(--ui-text-2)", border: "1px solid var(--ui-border)" }}>
      {Icono && <Icono size={11} />}
      {label}
    </button>
  );
}

// Foco pedagógico — vocabulario nuevo y universal (aplica a cualquier
// categoría), independiente de las subcategorías específicas por categoría
// (chipping/bunker/P1-P10/etc.) que ya usa el formulario de crear/editar. Un
// drill viejo sin este valor exacto en subcategoria simplemente no aparece al
// filtrar por Foco — no se migran datos existentes.
const LUGARES = [
  { value: "campo_practica",          label: "Campo de práctica" },
  { value: "putting_green_fundadores", label: "Putting Green Fundadores" },
  { value: "campo_pacos_fabios",       label: "Campo Pacos & Fabios" },
  { value: "campo_infantil",           label: "Campo Infantil" },
];
const LUGAR_LABEL: Record<string,string> = Object.fromEntries(LUGARES.map(l => [l.value, l.label]));

// ── Library generation ────────────────────────────────────────────────────────
type BatchKey = "tecnico" | "juego_corto" | "putting" | "campo";
interface BatchState { status: "pending" | "loading" | "done" | "error"; insertados: number; errorMsg: string | null; }
const BATCH_CONFIGS: { key: BatchKey; label: string; step: number }[] = [
  { key: "tecnico",     label: "Drills técnicos P1-P10", step: 1 },
  { key: "juego_corto", label: "Juego corto",            step: 2 },
  { key: "putting",     label: "Putting",                step: 3 },
  { key: "campo",       label: "Juegos de campo",        step: 4 },
];
const initBatches = (): Record<BatchKey, BatchState> => ({
  tecnico:     { status: "pending", insertados: 0, errorMsg: null },
  juego_corto: { status: "pending", insertados: 0, errorMsg: null },
  putting:     { status: "pending", insertados: 0, errorMsg: null },
  campo:       { status: "pending", insertados: 0, errorMsg: null },
});

function emptyForm(): DrillForm {
  return {
    titulo: "", descripcion: "", categoria: "tecnico", subcategoria: null,
    posicion_swing: null, nivel_recomendado: null, material: null,
    lugar: "campo_practica", duracion_minutos: null, repeticiones: null,
    error_que_corrige: null, sensacion_buscada: null, metrica_exito: null,
    variante_presion: null, reglas_campo: null,
    rating: 3, favorito: false, aprobado: false,
    generado_por_ia: false, notas_instructor: null,
  };
}

// ── Star rating ───────────────────────────────────────────────────────────────
function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(n => {
        const lleno = n <= value;
        return (
          <button key={n} type="button" onClick={() => onChange?.(n)}
            title={onChange ? `${n} de 5` : undefined}
            className={`leading-none ${onChange ? "cursor-pointer hover:scale-110 transition-transform" : "cursor-default"}`}>
            <Star size={13}
              style={{ color: lleno ? "var(--ui-gold)" : "var(--ui-border)" }}
              fill={lleno ? "var(--ui-gold)" : "none"} />
          </button>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
// soloLectura: las familias de Competencia entran a consultar los drills. Las
// policies de la base ya bloquean su escritura (ver 20260822_escritura_solo_staff),
// así que aquí lo que se quita es la interfaz que no les sirve.
export default function DrillsModule({ soloLectura = false }: { soloLectura?: boolean }) {
  const [activeTab, setActiveTab]           = useState<Categoria>("tecnico");
  const [drills, setDrills]                 = useState<Drill[]>([]);
  const [loading, setLoading]               = useState(true);
  const [searchText, setSearchText]         = useState("");
  const [activeFilters, setActiveFilters]   = useState<string[]>([]);
  const [collapsed, setCollapsed]           = useState<Set<string>>(new Set());

  // Filtros combinables (independientes de la tab de categoría y entre sí —
  // AND entre facetas, OR dentro de cada faceta). Usados también, en la misma
  // forma, por EstacionLibraryPicker en el flujo de planeación.
  const [filtroGrupo, setFiltroGrupo]       = useState<string[]>([]);
  const [filtroFoco, setFiltroFoco]         = useState<string[]>([]);
  const [filtroMaterial, setFiltroMaterial] = useState<string[]>([]);
  const [filtroPosicion, setFiltroPosicion] = useState<string[]>([]);
  const hayFiltrosAvanzados = filtroGrupo.length > 0 || filtroFoco.length > 0 || filtroMaterial.length > 0 || filtroPosicion.length > 0;
  function toggleFacet(setter: (fn: (prev: string[]) => string[]) => void, val: string) {
    setter(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);
  }
  function limpiarFiltrosAvanzados() {
    setFiltroGrupo([]); setFiltroFoco([]); setFiltroMaterial([]); setFiltroPosicion([]);
  }

  const [showEditModal, setShowEditModal]   = useState(false);
  const [editingId, setEditingId]           = useState<string | null>(null);
  const [form, setForm]                     = useState<DrillForm>(emptyForm());
  const [saving, setSaving]                 = useState(false);
  const [formError, setFormError]           = useState<string | null>(null);

  const [showAIModal, setShowAIModal]       = useState(false);
  const [aiText, setAiText]                 = useState("");
  const [aiLoading, setAiLoading]           = useState(false);
  const [aiPreview, setAiPreview]           = useState<Drill | null>(null);
  const [aiError, setAiError]               = useState<string | null>(null);

  const [libraryProgress, setLibraryProgress] = useState<Record<BatchKey, BatchState> | null>(null);
  const [toast, setToast]                   = useState<string | null>(null);

  // Los dos confirm() del módulo bloqueaban la pestaña y no alcanzaban a decir
  // qué drill se iba ni qué implica generar la biblioteca.
  const [borrarDrill, setBorrarDrill]       = useState<Drill | null>(null);
  const [confirmarBiblioteca, setConfirmarBiblioteca] = useState(false);

  const [importing, setImporting]           = useState(false);
  const [importResult, setImportResult]     = useState<{ insertados: number; omitidos: { fila: number; motivo: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ── Load drills ─────────────────────────────────────────────────────────────
  const fetchDrills = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("drills").select("*").order("created_at", { ascending: false });
    setDrills((data as Drill[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchDrills(); }, [fetchDrills]);
  useEffect(() => { setActiveFilters([]); setSearchText(""); }, [activeTab]);

  // ── Filter logic ─────────────────────────────────────────────────────────────
  const filtered = drills.filter(d => {
    if (d.categoria !== activeTab) return false;

    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      if (![d.titulo, d.descripcion, d.error_que_corrige].some(f => f?.toLowerCase().includes(q))) return false;
    }

    if (activeFilters.length > 0) {
      const isFav = activeFilters.includes("⭐ Favoritos");
      const posFilters = activeFilters.filter(f => f.startsWith("P") && /P\d+/.test(f));
      const otherFilters = activeFilters.filter(f => !f.startsWith("P") && f !== "⭐ Favoritos");

      if (isFav && !d.favorito) return false;
      if (posFilters.length > 0) {
        const hasPos = posFilters.some(p =>
          d.subcategoria === p || d.posicion_swing?.includes(p)
        );
        if (!hasPos) return false;
      }
      if (otherFilters.length > 0) {
        const sub = d.subcategoria?.toLowerCase() ?? "";
        const hasOther = otherFilters.some(f => sub.includes(f.toLowerCase()));
        if (!hasOther) return false;
      }
    }

    if (filtroGrupo.length > 0 && !filtroGrupo.some(g => d.nivel_recomendado?.includes(g))) return false;
    if (filtroFoco.length > 0 && !(d.subcategoria && filtroFoco.includes(d.subcategoria))) return false;
    if (filtroMaterial.length > 0 && !filtroMaterial.some(m => d.material?.includes(m))) return false;
    if (filtroPosicion.length > 0 && !filtroPosicion.some(p => d.posicion_swing?.includes(p))) return false;

    return true;
  });

  // Group técnico by subcategoria
  const groupedTecnico = POSICIONES.reduce<Record<string, Drill[]>>((acc, p) => {
    acc[p] = filtered.filter(d => d.subcategoria === p || d.posicion_swing?.includes(p));
    return acc;
  }, {});

  function toggleFilter(f: string) {
    setActiveFilters(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  }
  function toggleCollapse(key: string) {
    setCollapsed(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  // ── Approve drill ────────────────────────────────────────────────────────────
  async function handleAprobar(id: string) {
    await supabase.from("drills").update({ aprobado: true }).eq("id", id);
    setDrills(prev => prev.map(d => d.id === id ? { ...d, aprobado: true } : d));
    showToast("✓ Drill aprobado");
  }

  // ── Toggle favorito ──────────────────────────────────────────────────────────
  async function handleFavorito(d: Drill) {
    const val = !d.favorito;
    await supabase.from("drills").update({ favorito: val }).eq("id", d.id);
    setDrills(prev => prev.map(x => x.id === d.id ? { ...x, favorito: val } : x));
  }

  // ── Delete drill ─────────────────────────────────────────────────────────────
  async function handleDelete() {
    const d = borrarDrill;
    if (!d) return;
    await supabase.from("drills").delete().eq("id", d.id);
    setDrills(prev => prev.filter(x => x.id !== d.id));
    setBorrarDrill(null);
    showToast("Drill eliminado");
  }

  // ── Open edit modal ──────────────────────────────────────────────────────────
  function openCreate() {
    setForm(emptyForm()); setEditingId(null);
    setFormError(null); setShowEditModal(true);
  }
  function openEdit(d: Drill) {
    setForm({
      titulo: d.titulo, descripcion: d.descripcion,
      categoria: d.categoria, subcategoria: d.subcategoria,
      posicion_swing: d.posicion_swing, nivel_recomendado: d.nivel_recomendado, material: d.material,
      lugar: d.lugar, duracion_minutos: d.duracion_minutos,
      repeticiones: d.repeticiones, error_que_corrige: d.error_que_corrige,
      sensacion_buscada: d.sensacion_buscada, metrica_exito: d.metrica_exito,
      variante_presion: d.variante_presion, reglas_campo: d.reglas_campo,
      rating: d.rating, favorito: d.favorito, aprobado: d.aprobado,
      generado_por_ia: d.generado_por_ia, notas_instructor: d.notas_instructor,
    });
    setEditingId(d.id); setFormError(null); setShowEditModal(true);
  }

  // ── Save drill ───────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.titulo.trim()) { setFormError("El título es requerido."); return; }
    if (!form.descripcion.trim()) { setFormError("La descripción es requerida."); return; }
    setSaving(true); setFormError(null);
    try {
      const payload = {
        ...form,
        subcategoria: form.subcategoria || null,
        posicion_swing: form.posicion_swing?.length ? form.posicion_swing : null,
        nivel_recomendado: form.nivel_recomendado?.length ? form.nivel_recomendado : null,
        material: form.material?.length ? form.material : null,
        reglas_campo: form.reglas_campo?.length ? form.reglas_campo : null,
      };
      if (editingId) {
        await supabase.from("drills").update(payload).eq("id", editingId);
        setDrills(prev => prev.map(d => d.id === editingId ? { ...d, ...payload } : d));
        showToast("✓ Drill actualizado");
      } else {
        const { data } = await supabase.from("drills").insert(payload).select().single();
        if (data) setDrills(prev => [data as Drill, ...prev]);
        showToast("✓ Drill creado");
      }
      setShowEditModal(false);
    } catch { setFormError("Error al guardar. Intenta de nuevo."); }
    finally { setSaving(false); }
  }

  // ── AI organize ──────────────────────────────────────────────────────────────
  async function handleOrganizarIA() {
    if (!aiText.trim()) return;
    setAiLoading(true); setAiError(null); setAiPreview(null);
    try {
      const res = await fetch("/api/organize-drill", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descripcion_libre: aiText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error de IA");
      const saved = data.drill as Drill;
      setDrills(prev => [saved, ...prev]);
      setAiPreview(saved);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Error desconocido");
    } finally { setAiLoading(false); }
  }

  function handleGuardarAI() {
    setShowAIModal(false); setAiText(""); setAiPreview(null);
    showToast("✨ Drill guardado — pendiente de aprobación");
  }

  // ── Generate library by batch ────────────────────────────────────────────────
  async function runBatch(key: BatchKey): Promise<boolean> {
    setLibraryProgress(prev => prev ? { ...prev, [key]: { status: "loading", insertados: 0, errorMsg: null } } : prev);
    try {
      const res = await fetch("/api/generate-drill-library", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error generando lote");
      setLibraryProgress(prev => prev ? { ...prev, [key]: { status: "done", insertados: data.insertados, errorMsg: null } } : prev);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setLibraryProgress(prev => prev ? { ...prev, [key]: { status: "error", insertados: 0, errorMsg: msg } } : prev);
      return false;
    }
  }

  async function runBatchSequence(keys: BatchKey[]) {
    for (const key of keys) {
      const ok = await runBatch(key);
      if (!ok) return;
    }
    await fetchDrills();
    showToast("✨ Biblioteca generada — 52 drills listos");
    setTimeout(() => setLibraryProgress(null), 4000);
  }

  async function handleGenerarBiblioteca() {
    setConfirmarBiblioteca(false);
    setLibraryProgress(initBatches());
    await runBatchSequence(["tecnico", "juego_corto", "putting", "campo"]);
  }

  // ── Importar Excel (Plantilla_Drills_CCB) ─────────────────────────────────────
  const IMPORT_HEADERS = ["titulo", "descripcion", "categoria", "foco", "posicion_swing", "nivel_recomendado", "material", "lugar", "duracion_minutos", "repeticiones"];
  const CATEGORIAS_VALIDAS: Categoria[] = ["tecnico", "juego_corto", "putting", "campo"];

  // La librería de Excel se carga al usarla —plantilla o importación— y no con
  // el módulo: son 137 KB comprimidos que solo hacen falta el día que alguien
  // carga drills en lote.
  async function descargarPlantilla() {
    const XLSX = await import("xlsx");
    const ejemplo = [
      "Drill de rotación de hombros", "Con un palo cruzado en la espalda, girar hasta P3 sin que caiga.",
      "tecnico", "rotacion_giro", "P3", "aguilas,albatros", "banda", "campo_practica", "15", "3 series de 10",
    ];
    const ws = XLSX.utils.aoa_to_sheet([IMPORT_HEADERS, ejemplo]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Drills");
    XLSX.writeFile(wb, "Plantilla_Drills_CCB.xlsx");
  }

  function tokens(raw: unknown): string[] {
    if (raw == null) return [];
    return String(raw).split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    setImportResult(null);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

      const omitidos: { fila: number; motivo: string }[] = [];
      const payload: Omit<Drill, "id" | "created_at" | "veces_usado">[] = [];

      rows.forEach((row, idx) => {
        const numFila = idx + 2; // +1 encabezado, +1 base-1
        const titulo = String(row.titulo ?? "").trim();
        const descripcion = String(row.descripcion ?? "").trim();
        const categoriaRaw = String(row.categoria ?? "").trim().toLowerCase();
        if (!titulo) { omitidos.push({ fila: numFila, motivo: "Falta título" }); return; }
        if (!descripcion) { omitidos.push({ fila: numFila, motivo: "Falta descripción" }); return; }
        if (!CATEGORIAS_VALIDAS.includes(categoriaRaw as Categoria)) {
          omitidos.push({ fila: numFila, motivo: `Categoría inválida "${categoriaRaw}" (debe ser tecnico, juego_corto, putting o campo)` });
          return;
        }
        const lugarRaw = String(row.lugar ?? "").trim();
        const lugar = LUGARES.some(l => l.value === lugarRaw) ? lugarRaw : "campo_practica";
        const duracion = row.duracion_minutos !== "" && row.duracion_minutos != null ? parseInt(String(row.duracion_minutos), 10) : null;

        payload.push({
          titulo: titulo.substring(0, 40),
          descripcion,
          categoria: categoriaRaw as Categoria,
          subcategoria: String(row.foco ?? "").trim().toLowerCase() || null,
          posicion_swing: tokens(row.posicion_swing).map(t => t.toUpperCase()).filter(Boolean).length ? tokens(row.posicion_swing).map(t => t.toUpperCase()) : null,
          nivel_recomendado: tokens(row.nivel_recomendado).length ? tokens(row.nivel_recomendado) : null,
          material: tokens(row.material).length ? tokens(row.material) : null,
          lugar,
          duracion_minutos: Number.isFinite(duracion) ? duracion : null,
          repeticiones: String(row.repeticiones ?? "").trim() || null,
          error_que_corrige: null, sensacion_buscada: null, metrica_exito: null,
          variante_presion: null, reglas_campo: null,
          rating: 3, favorito: false, aprobado: false,
          generado_por_ia: false, notas_instructor: null,
        });
      });

      let insertados = 0;
      if (payload.length > 0) {
        const { data, error } = await supabase.from("drills").insert(payload).select("id");
        if (error) throw new Error(error.message);
        insertados = data?.length ?? payload.length;
      }

      setImportResult({ insertados, omitidos });
      if (insertados > 0) await fetchDrills();
    } catch (err) {
      setImportResult({ insertados: 0, omitidos: [{ fila: 0, motivo: err instanceof Error ? err.message : "Error al leer el archivo" }] });
    } finally {
      setImporting(false);
    }
  }

  // ── Update form helpers ───────────────────────────────────────────────────────
  const setF = (k: keyof DrillForm, v: unknown) => setForm(f => ({ ...f, [k]: v }));
  function toggleChip(field: "posicion_swing" | "nivel_recomendado" | "material", val: string) {
    setForm(f => {
      const cur = (f[field] as string[] | null) ?? [];
      const next = cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val];
      return { ...f, [field]: next.length ? next : null };
    });
  }
  function addRegla() { setF("reglas_campo", [...(form.reglas_campo ?? []), { texto: "" }]); }
  function setRegla(i: number, v: string) {
    const arr = [...(form.reglas_campo ?? [])];
    arr[i] = { texto: v };
    setF("reglas_campo", arr);
  }
  function removeRegla(i: number) {
    const arr = (form.reglas_campo ?? []).filter((_, j) => j !== i);
    setF("reglas_campo", arr.length ? arr : null);
  }

  // ── Drill Card ───────────────────────────────────────────────────────────────
  function DrillCard({ d, compact = false }: { d: Drill; compact?: boolean }) {
    return (
      <div className="rounded-xl overflow-hidden transition-colors"
        style={{
          background: "var(--ui-card)",
          border: `1px solid ${d.aprobado ? "var(--ui-border-soft)" : "var(--ui-warn)"}`,
        }}>
        {!d.aprobado && (
          <div className="flex items-center gap-1.5 px-3 py-1"
            style={{ background: "var(--ui-warn-bg)", borderBottom: "1px solid var(--ui-border-soft)" }}>
            <span className="text-[11px] font-bold" style={{ color: "var(--ui-warn)" }}>Pendiente de aprobación</span>
            {d.generado_por_ia && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: "var(--ui-card-alt)", color: "var(--ui-warn)" }}>IA</span>
            )}
          </div>
        )}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-sm font-bold leading-snug flex-1" style={{ color: "var(--ui-text)" }}>{d.titulo}</h3>
            <Stars value={d.rating} />
          </div>

          {/* Etiquetas */}
          <div className="flex flex-wrap gap-1 mb-2">
            {d.posicion_swing?.map(p => (
              <span key={p} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: "var(--g-juvenil-bg)", color: "var(--g-juvenil-fg)" }}>{p}</span>
            ))}
            {d.subcategoria && !d.posicion_swing?.length && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: "var(--g-juvenil-bg)", color: "var(--g-juvenil-fg)" }}>
                {FOCO_LABEL[d.subcategoria] ?? d.subcategoria}
              </span>
            )}
            {d.nivel_recomendado?.map(n => (
              <span key={n} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={tonoNivel(n)}>
                {NIVEL_LABEL[n] ?? n}
              </span>
            ))}
            {d.material?.filter(m => m !== "ninguno").map(m => (
              <span key={m} className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: "var(--ui-card-alt)", color: "var(--ui-text-2)" }}>
                <Package size={9} />{MATERIAL_LABEL[m] ?? m}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: "var(--ui-card-alt)", color: "var(--ui-text-2)" }}>
              <MapPin size={9} />{LUGAR_LABEL[d.lugar] ?? d.lugar}
            </span>
          </div>

          <p className="text-xs leading-snug mb-3 line-clamp-2" style={{ color: "var(--ui-text-2)" }}>{d.descripcion}</p>

          <div className="flex items-center gap-3 text-[10px] mb-3" style={{ color: "var(--ui-text-3)" }}>
            {d.duracion_minutos && <span className="flex items-center gap-1"><Clock size={10} />{d.duracion_minutos} min</span>}
            {d.repeticiones && <span className="flex items-center gap-1"><RotateCw size={10} />{d.repeticiones}</span>}
            {d.metrica_exito && !compact && (
              <span className="flex items-center gap-1 truncate max-w-[140px]"><Target size={10} />{d.metrica_exito}</span>
            )}
          </div>

          {/* Reglas de campo (para la pestaña de juegos de campo) */}
          {d.reglas_campo && d.reglas_campo.length > 0 && !compact && (
            <div className="rounded-lg p-2.5 mb-3" style={{ background: "var(--g-juvenil-bg)" }}>
              <p className="text-[10px] font-bold mb-1.5 uppercase tracking-wide" style={{ color: "var(--g-juvenil-fg)" }}>Reglas del juego</p>
              <ul className="space-y-1">
                {d.reglas_campo.map((r, i) => (
                  <li key={i} className="flex gap-1.5 text-[10px]" style={{ color: "var(--g-juvenil-fg)" }}>
                    <Flag size={10} className="shrink-0 mt-0.5" /><span>{r.texto}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!soloLectura && (
          <div className="pt-2.5 flex items-center gap-1.5" style={{ borderTop: "1px solid var(--ui-border-soft)" }}>
            <button
              onClick={() => { showToast("Drill copiado al portapapeles del plan"); }}
              className="flex-1 flex items-center justify-center gap-1 text-[11px] font-bold px-2 py-1.5 rounded-lg transition-opacity hover:opacity-90"
              style={{ background: "var(--ui-gold)", color: "var(--ui-bg)" }}
            ><Plus size={11} />Al plan</button>
            <button
              onClick={() => openEdit(d)}
              className="flex items-center gap-1 text-[11px] font-bold px-2 py-1.5 rounded-lg transition-colors hover:bg-(--ui-card-alt)"
              style={{ color: "var(--ui-text-2)", border: "1px solid var(--ui-border)" }}
            ><Pencil size={11} />Editar</button>
            <button
              onClick={() => handleFavorito(d)}
              className="p-1.5 rounded-lg transition-colors hover:bg-(--ui-card-alt)"
              title={d.favorito ? "Quitar de favoritos" : "Marcar favorito"}
            >
              <Star size={13}
                style={{ color: d.favorito ? "var(--ui-gold)" : "var(--ui-text-3)" }}
                fill={d.favorito ? "var(--ui-gold)" : "none"} />
            </button>
            {!d.aprobado && (
              <button
                onClick={() => handleAprobar(d.id)}
                className="flex items-center gap-1 text-[11px] font-bold px-2 py-1.5 rounded-lg transition-opacity hover:opacity-80 whitespace-nowrap"
                style={{ background: "var(--ui-warn-bg)", color: "var(--ui-warn)" }}
              ><Check size={11} />Aprobar</button>
            )}
            <button
              onClick={() => setBorrarDrill(d)}
              className="p-1.5 rounded-lg transition-colors hover:bg-(--ui-bad-bg)"
              style={{ color: "var(--ui-text-3)" }}
              title="Eliminar"
            ><Trash2 size={13} /></button>
          </div>
          )}
        </div>
      </div>
    );
  }

  const total = drills.length;
  const hayFiltros = activeFilters.length > 0 || !!searchText || hayFiltrosAvanzados;

  function limpiarTodo() {
    setActiveFilters([]); setSearchText(""); limpiarFiltrosAvanzados();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <Pagina>
      <Encabezado icono={BookOpen} titulo="Biblioteca de drills" bajada={`${total} drill${total !== 1 ? "s" : ""} en total`}>
        {!soloLectura && <>
        {!loading && drills.length === 0 && !libraryProgress && (
          <BotonSecundario onClick={() => setConfirmarBiblioteca(true)}>
            <Sparkles size={14} />Generar biblioteca base
          </BotonSecundario>
        )}
        <BotonSecundario onClick={openCreate}><Plus size={14} />Agregar drill</BotonSecundario>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ""; }}
        />
        <BotonSecundario onClick={() => fileInputRef.current?.click()} disabled={importing}>
          <Upload size={14} />{importing ? "Importando…" : "Importar Excel"}
        </BotonSecundario>
        <BotonSecundario onClick={descargarPlantilla} title="Plantilla_Drills_CCB.xlsx">
          <Download size={14} />Plantilla
        </BotonSecundario>
        <BotonPrimario onClick={() => { setShowAIModal(true); setAiText(""); setAiPreview(null); setAiError(null); }}>
          <Sparkles size={16} />Generar con IA
        </BotonPrimario>
        </>}
      </Encabezado>

      {/* ── Progreso de generación de biblioteca ── */}
      {libraryProgress && (
        <div className="mb-6 rounded-xl p-4"
          style={{ background: "var(--ui-warn-bg)", border: "1px solid var(--ui-warn)" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold" style={{ color: "var(--ui-warn)" }}>Generando biblioteca base</h3>
            <span className="text-xs font-semibold" style={{ color: "var(--ui-text-2)" }}>
              {Object.values(libraryProgress).filter(b => b.status === "done").length}/4 completados
            </span>
          </div>
          <div className="space-y-2.5">
            {BATCH_CONFIGS.map(({ key, label, step }) => {
              const b = libraryProgress[key];
              const color =
                b.status === "done"    ? "var(--ui-ok)" :
                b.status === "error"   ? "var(--ui-bad)" :
                b.status === "loading" ? "var(--ui-warn)" : "var(--ui-text-3)";
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                    {b.status === "loading" && (
                      <div className="animate-spin rounded-full h-4 w-4 border-2"
                        style={{ borderColor: "var(--ui-warn)", borderTopColor: "transparent" }} />
                    )}
                    {b.status === "done" && <Check size={14} style={{ color: "var(--ui-ok)" }} />}
                    {b.status === "error" && <X size={14} style={{ color: "var(--ui-bad)" }} />}
                    {b.status === "pending" && <span className="w-2 h-2 rounded-full block" style={{ background: "var(--ui-text-3)" }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color }}>
                        {b.status === "loading" ? `Generando ${label.toLowerCase()}…` : label}
                        <span className="text-xs font-normal ml-1 opacity-60">({step}/4)</span>
                      </span>
                      {b.status === "done" && (
                        <span className="text-xs font-bold" style={{ color: "var(--ui-ok)" }}>{b.insertados} drills</span>
                      )}
                    </div>
                    {b.status === "error" && b.errorMsg && (
                      <p className="text-xs mt-0.5 leading-snug" style={{ color: "var(--ui-bad)" }}>{b.errorMsg}</p>
                    )}
                  </div>
                  {b.status === "error" && (
                    <button
                      onClick={() => {
                        const idx = BATCH_CONFIGS.findIndex(x => x.key === key);
                        runBatchSequence(BATCH_CONFIGS.slice(idx).map(x => x.key));
                      }}
                      className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80 whitespace-nowrap shrink-0"
                      style={{ background: "var(--ui-bad-bg)", color: "var(--ui-bad)" }}
                    >
                      <RotateCw size={11} />Reintentar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        options={TABS.map(t => ({
          id: t.id,
          label: t.label,
          count: drills.filter(d => d.categoria === t.id).length,
        }))}
      />

      {/* ── Búsqueda + filtros de la pestaña ── */}
      <div className="rounded-xl px-3 py-2.5 mb-3 flex flex-wrap items-center gap-x-4 gap-y-2"
        style={{ background: "var(--ui-card)", border: "1px solid var(--ui-border)" }}>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--ui-text-3)" }} />
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Buscar drills…"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2"
            style={CAMPO}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TAB_FILTERS[activeTab].map(f => (
            <Chip key={f} label={f} activo={activeFilters.includes(f)} onClick={() => toggleFilter(f)} />
          ))}
        </div>
        {hayFiltros && (
          <button onClick={limpiarTodo}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors hover:opacity-80 ml-auto"
            style={{ color: "var(--ui-bad)", border: "1px solid var(--ui-bad)" }}
          ><X size={12} />Limpiar todo</button>
        )}
      </div>

      {/* ── Filtros combinables ── */}
      <details className="mb-6 rounded-xl overflow-hidden"
        style={{ background: "var(--ui-card)", border: "1px solid var(--ui-border)" }} open={hayFiltrosAvanzados}>
        {/* Cuatro filas de chips ocupaban media pantalla antes de ver un solo
            drill. Plegadas por defecto, se abren solas si hay alguno activo. */}
        <summary className="px-3 py-2.5 cursor-pointer flex items-center gap-2 select-none">
          <CampoLabel>Filtros para asignar rápido</CampoLabel>
          {hayFiltrosAvanzados && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
              style={{ background: "var(--ui-gold)", color: "var(--ui-bg)" }}>
              {filtroGrupo.length + filtroFoco.length + filtroMaterial.length + filtroPosicion.length}
            </span>
          )}
          {hayFiltrosAvanzados && (
            <button onClick={(e) => { e.preventDefault(); limpiarFiltrosAvanzados(); }}
              className="ml-auto text-xs font-semibold hover:underline" style={{ color: "var(--ui-bad)" }}>
              Limpiar
            </button>
          )}
        </summary>

        <div className="px-3 pb-3 space-y-3" style={{ borderTop: "1px solid var(--ui-border-soft)" }}>
          <div className="pt-3">
            <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--ui-text-3)" }}>Grupo</p>
            <div className="flex flex-wrap gap-1.5">
              {NIVELES.map(n => (
                <Chip key={n} label={NIVEL_LABEL[n]} activo={filtroGrupo.includes(n)}
                  onClick={() => toggleFacet(setFiltroGrupo, n)} tono={tonoNivel(n)} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--ui-text-3)" }}>Foco</p>
            <div className="flex flex-wrap gap-1.5">
              {FOCOS.map(f => (
                <Chip key={f} label={FOCO_LABEL[f]} activo={filtroFoco.includes(f)}
                  onClick={() => toggleFacet(setFiltroFoco, f)} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--ui-text-3)" }}>Material</p>
            <div className="flex flex-wrap gap-1.5">
              {MATERIALES.map(m => (
                <Chip key={m} label={MATERIAL_LABEL[m]} activo={filtroMaterial.includes(m)}
                  onClick={() => toggleFacet(setFiltroMaterial, m)} icono={Package} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--ui-text-3)" }}>Posición de swing</p>
            <div className="flex flex-wrap gap-1.5">
              {POSICIONES.map(p => (
                <Chip key={p} label={p} activo={filtroPosicion.includes(p)}
                  onClick={() => toggleFacet(setFiltroPosicion, p)} />
              ))}
            </div>
          </div>
        </div>
      </details>

      {/* ── Contenido ── */}
      {loading ? (
        <Loading msg="Cargando drills…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          msg={`No hay drills${hayFiltros ? " con esos filtros" : " en esta categoría"}`}
          accion={hayFiltros
            ? <BotonSecundario onClick={limpiarTodo}>Limpiar filtros</BotonSecundario>
            : soloLectura ? undefined
            : <BotonPrimario onClick={openCreate}><Plus size={16} />Agregar el primero</BotonPrimario>}
        />
      ) : activeTab === "tecnico" ? (
        // ── Técnico: agrupado por posición ──────────────────────────────────────
        <div className="space-y-3">
          {POSICIONES.map(p => {
            const group = groupedTecnico[p];
            if (!group.length) return null;
            const isOpen = !collapsed.has(p);
            const pendientes = group.filter(d => !d.aprobado).length;
            return (
              <div key={p} className="rounded-xl overflow-hidden"
                style={{ background: "var(--ui-card)", border: "1px solid var(--ui-border-soft)" }}>
                <button
                  onClick={() => toggleCollapse(p)}
                  className="w-full flex items-center justify-between px-5 py-3 transition-colors hover:bg-(--ui-card-alt)"
                  style={{ background: "var(--ui-card-alt)" }}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-bold" style={{ color: "var(--ui-text)" }}>
                      [{p}] {POSICION_LABEL[p]}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: "var(--ui-text-3)" }}>
                      {group.length} drill{group.length !== 1 ? "s" : ""}
                    </span>
                    {pendientes > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: "var(--ui-warn-bg)", color: "var(--ui-warn)" }}>
                        {pendientes} pendiente{pendientes !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  {isOpen
                    ? <ChevronUp size={16} style={{ color: "var(--ui-text-3)" }} />
                    : <ChevronDown size={16} style={{ color: "var(--ui-text-3)" }} />}
                </button>
                {isOpen && (
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {group.map(d => <DrillCard key={d.id} d={d} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : activeTab === "campo" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(d => <DrillCard key={d.id} d={d} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(d => <DrillCard key={d.id} d={d} compact />)}
        </div>
      )}

      {/* ══ MODAL: Crear / Editar drill ════════════════════════════════════════ */}
      {showEditModal && (
        <Modal onClose={() => { if (!saving) setShowEditModal(false); }} ancho="2xl">
          <ModalHeader
            titulo={editingId ? "Editar drill" : "Nuevo drill"}
            sub={TABS.find(t => t.id === form.categoria)?.label}
            onClose={() => { if (!saving) setShowEditModal(false); }}
          />

          <div className="px-5 py-5 space-y-4">
            <Campo label="Título *">
              <input value={form.titulo} onChange={e => setF("titulo", e.target.value)}
                placeholder="Rotación de hombros con palo cruzado" className={CLASE_CAMPO} style={CAMPO} />
            </Campo>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Categoría *">
                <select value={form.categoria}
                  onChange={e => { setF("categoria", e.target.value as Categoria); setF("subcategoria", null); setF("posicion_swing", null); }}
                  className={CLASE_CAMPO} style={CAMPO}>
                  {TABS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </Campo>
              <Campo label="Foco pedagógico">
                <select value={form.subcategoria ?? ""} onChange={e => setF("subcategoria", e.target.value || null)}
                  className={CLASE_CAMPO} style={CAMPO}>
                  <option value="">— Ninguno —</option>
                  {FOCOS.map(f => <option key={f} value={f}>{FOCO_LABEL[f]}</option>)}
                </select>
              </Campo>
            </div>

            {form.categoria === "tecnico" && (
              <Campo label="Posiciones del swing">
                <div className="flex flex-wrap gap-1.5">
                  {POSICIONES.map(p => (
                    <Chip key={p} label={p} activo={form.posicion_swing?.includes(p) ?? false}
                      onClick={() => toggleChip("posicion_swing", p)} />
                  ))}
                </div>
              </Campo>
            )}

            <Campo label="Nivel recomendado">
              <div className="flex flex-wrap gap-1.5">
                {NIVELES.map(n => (
                  <Chip key={n} label={NIVEL_LABEL[n]} activo={form.nivel_recomendado?.includes(n) ?? false}
                    onClick={() => toggleChip("nivel_recomendado", n)} tono={tonoNivel(n)} />
                ))}
              </div>
            </Campo>

            <Campo label="Material">
              <div className="flex flex-wrap gap-1.5">
                {MATERIALES.map(m => (
                  <Chip key={m} label={MATERIAL_LABEL[m]} activo={form.material?.includes(m) ?? false}
                    onClick={() => toggleChip("material", m)} icono={Package} />
                ))}
              </div>
            </Campo>

            <Campo label="Lugar *">
              <select value={form.lugar} onChange={e => setF("lugar", e.target.value)}
                className={CLASE_CAMPO} style={CAMPO}>
                {LUGARES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </Campo>

            <Campo label="Descripción detallada *">
              <textarea value={form.descripcion} onChange={e => setF("descripcion", e.target.value)}
                rows={3} placeholder="Instrucciones claras para el instructor…"
                className={`${CLASE_CAMPO} resize-none`} style={CAMPO} />
            </Campo>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Error que corrige">
                <textarea value={form.error_que_corrige ?? ""} onChange={e => setF("error_que_corrige", e.target.value || null)}
                  rows={2} placeholder="El error técnico que trabaja…"
                  className={`${CLASE_CAMPO} resize-none`} style={CAMPO} />
              </Campo>
              <Campo label="Sensación buscada">
                <textarea value={form.sensacion_buscada ?? ""} onChange={e => setF("sensacion_buscada", e.target.value || null)}
                  rows={2} placeholder="La sensación propioceptiva…"
                  className={`${CLASE_CAMPO} resize-none`} style={CAMPO} />
              </Campo>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Métrica de éxito">
                <input value={form.metrica_exito ?? ""} onChange={e => setF("metrica_exito", e.target.value || null)}
                  placeholder="8/10 impactos en zona" className={CLASE_CAMPO} style={CAMPO} />
              </Campo>
              <Campo label="Variante de presión">
                <input value={form.variante_presion ?? ""} onChange={e => setF("variante_presion", e.target.value || null)}
                  placeholder="Cómo agregar presión…" className={CLASE_CAMPO} style={CAMPO} />
              </Campo>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Duración (min)">
                <input type="number" min={1} max={90} value={form.duracion_minutos ?? ""}
                  onChange={e => setF("duracion_minutos", e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="15" className={CLASE_CAMPO} style={CAMPO} />
              </Campo>
              <Campo label="Repeticiones">
                <input value={form.repeticiones ?? ""} onChange={e => setF("repeticiones", e.target.value || null)}
                  placeholder="3 series de 10" className={CLASE_CAMPO} style={CAMPO} />
              </Campo>
            </div>

            {form.categoria === "campo" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <CampoLabel>Reglas del juego</CampoLabel>
                  <button type="button" onClick={addRegla}
                    className="flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: "var(--ui-gold)" }}>
                    <Plus size={11} />Agregar regla
                  </button>
                </div>
                <div className="space-y-2">
                  {(form.reglas_campo ?? []).map((r, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Flag size={13} className="shrink-0" style={{ color: "var(--ui-text-3)" }} />
                      <input value={r.texto} onChange={e => setRegla(i, e.target.value)}
                        placeholder={`Regla ${i + 1}…`}
                        className="flex-1 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1" style={CAMPO} />
                      <button type="button" onClick={() => removeRegla(i)} title="Quitar regla"
                        className="p-1 rounded transition-colors hover:bg-(--ui-bad-bg)" style={{ color: "var(--ui-text-3)" }}>
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                  {!form.reglas_campo?.length && (
                    <p className="text-xs italic" style={{ color: "var(--ui-text-3)" }}>Sin reglas aún.</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-6 flex-wrap">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--ui-text-3)" }}>Rating</p>
                <Stars value={form.rating} onChange={v => setF("rating", v)} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none mt-4">
                <input type="checkbox" checked={form.aprobado} onChange={e => setF("aprobado", e.target.checked)}
                  className="w-4 h-4 rounded" style={{ accentColor: "var(--ui-gold)" }} />
                <span className="text-sm font-semibold" style={{ color: "var(--ui-text-2)" }}>Aprobado por instructor</span>
              </label>
            </div>

            <Campo label="Notas del instructor">
              <textarea value={form.notas_instructor ?? ""} onChange={e => setF("notas_instructor", e.target.value || null)}
                rows={2} placeholder="Observaciones internas…"
                className={`${CLASE_CAMPO} resize-none`} style={CAMPO} />
            </Campo>

            {formError && (
              <p className="text-xs font-semibold px-3 py-2 rounded-lg"
                style={{ background: "var(--ui-bad-bg)", color: "var(--ui-bad)" }}>{formError}</p>
            )}
          </div>

          <div className="px-5 pb-5 pt-4 flex gap-2 sticky bottom-0"
            style={{ background: "var(--ui-card)", borderTop: "1px solid var(--ui-border-soft)" }}>
            <div className="flex-1">
              <BotonPrimario onClick={handleSave} disabled={saving}>
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear drill"}
              </BotonPrimario>
            </div>
            <BotonSecundario onClick={() => setShowEditModal(false)} disabled={saving}>Cancelar</BotonSecundario>
          </div>
        </Modal>
      )}

      {/* ══ MODAL: Agregar con IA ══════════════════════════════════════════════ */}
      {showAIModal && (
        <Modal onClose={() => { if (!aiLoading && !saving) setShowAIModal(false); }} ancho="lg">
          <ModalHeader
            titulo="Agregar drill rápido con IA"
            sub="Describe el drill y la IA lo organiza automáticamente"
            onClose={() => { if (!aiLoading && !saving) setShowAIModal(false); }}
          />

          <div className="px-5 py-5 space-y-4">
            <textarea
              value={aiText}
              onChange={e => { setAiText(e.target.value); setAiPreview(null); setAiError(null); }}
              rows={5}
              placeholder={"Describe el drill en tus palabras…\n\nEj: «Drill de media subida para Competencia — el alumno pone un palo en la espalda y hace la subida hasta P3 sin que el palo caiga, para trabajar la rotación de hombros. 10 repeticiones.»"}
              className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2"
              style={CAMPO}
            />

            {aiError && (
              <p className="text-xs font-semibold px-3 py-2 rounded-lg"
                style={{ background: "var(--ui-bad-bg)", color: "var(--ui-bad)" }}>{aiError}</p>
            )}

            {!aiPreview && (
              <button
                onClick={handleOrganizarIA}
                disabled={aiLoading || !aiText.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ background: "var(--ui-gold)", color: "var(--ui-bg)" }}>
                {aiLoading
                  ? <><span className="animate-spin rounded-full h-4 w-4 border-2" style={{ borderColor: "var(--ui-bg)", borderTopColor: "transparent" }} />Organizando…</>
                  : <><Sparkles size={15} />Organizar con IA</>}
              </button>
            )}

            {aiPreview && (
              <div className="rounded-xl p-4 space-y-3"
                style={{ background: "var(--ui-card-alt)", border: "1px solid var(--ui-ok)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <Check size={14} style={{ color: "var(--ui-ok)" }} />
                  <span className="text-xs font-bold" style={{ color: "var(--ui-ok)" }}>Vista previa — revisa antes de guardar</span>
                </div>
                <p className="text-sm font-bold" style={{ color: "var(--ui-text)" }}>{aiPreview.titulo}</p>
                <div className="flex flex-wrap gap-1">
                  {aiPreview.categoria && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: "var(--ui-card)", color: "var(--ui-text-2)", border: "1px solid var(--ui-border)" }}>
                      {TABS.find(t => t.id === aiPreview.categoria)?.label ?? aiPreview.categoria}
                    </span>
                  )}
                  {aiPreview.posicion_swing?.map(p => (
                    <span key={p} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: "var(--g-juvenil-bg)", color: "var(--g-juvenil-fg)" }}>{p}</span>
                  ))}
                  {aiPreview.nivel_recomendado?.map(n => (
                    <span key={n} className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={tonoNivel(n)}>
                      {NIVEL_LABEL[n] ?? n}
                    </span>
                  ))}
                  {aiPreview.lugar && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: "var(--ui-card)", color: "var(--ui-text-2)" }}>
                      <MapPin size={9} />{LUGAR_LABEL[aiPreview.lugar] ?? aiPreview.lugar}
                    </span>
                  )}
                </div>
                <p className="text-xs leading-snug" style={{ color: "var(--ui-text-2)" }}>{aiPreview.descripcion}</p>
                {aiPreview.error_que_corrige && (
                  <p className="text-xs" style={{ color: "var(--ui-bad)" }}><strong>Error:</strong> {aiPreview.error_que_corrige}</p>
                )}
                {aiPreview.metrica_exito && (
                  <p className="text-xs" style={{ color: "var(--g-birdies-fg)" }}><strong>Métrica:</strong> {aiPreview.metrica_exito}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <div className="flex-1">
                    <BotonPrimario onClick={handleGuardarAI}>
                      <Check size={15} />Guardar como pendiente
                    </BotonPrimario>
                  </div>
                  <BotonSecundario
                    onClick={() => {
                      if (!aiPreview) return;
                      const cat = aiPreview.categoria;
                      setForm({
                        titulo: aiPreview.titulo ?? "",
                        descripcion: aiPreview.descripcion ?? "",
                        categoria: cat,
                        subcategoria: aiPreview.subcategoria ?? null,
                        posicion_swing: aiPreview.posicion_swing ?? null,
                        material: aiPreview.material ?? null,
                        nivel_recomendado: aiPreview.nivel_recomendado ?? null,
                        lugar: aiPreview.lugar ?? "campo_practica",
                        duracion_minutos: aiPreview.duracion_minutos ?? null,
                        repeticiones: aiPreview.repeticiones ?? null,
                        error_que_corrige: aiPreview.error_que_corrige ?? null,
                        sensacion_buscada: aiPreview.sensacion_buscada ?? null,
                        metrica_exito: aiPreview.metrica_exito ?? null,
                        variante_presion: aiPreview.variante_presion ?? null,
                        reglas_campo: aiPreview.reglas_campo ?? null,
                        rating: aiPreview.rating ?? 3,
                        favorito: false, aprobado: false,
                        generado_por_ia: true, notas_instructor: null,
                      });
                      setEditingId(aiPreview.id); setFormError(null);
                      setShowAIModal(false);
                      setShowEditModal(true);
                    }}>
                    <Pencil size={14} />Editar
                  </BotonSecundario>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ══ MODAL: Resultado de importación Excel ═══════════════════════════════ */}
      {importResult && (
        <Modal onClose={() => setImportResult(null)} ancho="sm">
          <ModalHeader titulo="Resultado de la importación" onClose={() => setImportResult(null)} />
          <div className="px-5 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
            <p className="text-sm" style={{ color: "var(--ui-text-2)" }}>
              <strong style={{ color: "var(--ui-ok)" }}>{importResult.insertados}</strong>
              {" "}drill{importResult.insertados !== 1 ? "s" : ""} importado{importResult.insertados !== 1 ? "s" : ""}
              {importResult.insertados > 0 && " (pendientes de aprobación)"}.
            </p>
            {importResult.omitidos.length > 0 && (
              <div>
                <p className="text-xs font-bold mb-1.5" style={{ color: "var(--ui-warn)" }}>
                  {importResult.omitidos.length} fila{importResult.omitidos.length !== 1 ? "s" : ""} omitida{importResult.omitidos.length !== 1 ? "s" : ""}:
                </p>
                <ul className="space-y-1">
                  {importResult.omitidos.map((o, i) => (
                    <li key={i} className="text-xs rounded-lg px-2.5 py-1.5"
                      style={{ background: "var(--ui-warn-bg)", color: "var(--ui-text-2)" }}>
                      {o.fila > 0 ? `Fila ${o.fila}: ` : ""}{o.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="px-5 pb-5">
            <BotonPrimario onClick={() => setImportResult(null)}>Cerrar</BotonPrimario>
          </div>
        </Modal>
      )}

      {borrarDrill && (
        <ModalConfirmar
          titulo="Eliminar drill"
          mensaje={<>Se elimina <strong style={{ color: "var(--ui-bad)" }}>{borrarDrill.titulo}</strong> de la biblioteca. Esta acción no se puede deshacer.</>}
          onConfirmar={handleDelete}
          onCancelar={() => setBorrarDrill(null)}
        />
      )}

      {confirmarBiblioteca && (
        <ModalConfirmar
          titulo="Generar biblioteca base"
          textoConfirmar="Generar los 52 drills"
          mensaje={<>Se crean 52 drills base con cuatro llamadas a la IA. Tarda entre uno y dos minutos y los drills quedan pendientes de aprobación.</>}
          onConfirmar={handleGenerarBiblioteca}
          onCancelar={() => setConfirmarBiblioteca(false)}
        />
      )}

      <Toast msg={toast} />
    </Pagina>
  );
}
