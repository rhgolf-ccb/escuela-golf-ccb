"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

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
const TABS: { id: Categoria; label: string; icon: string }[] = [
  { id: "tecnico",     label: "Técnico",          icon: "🏌️" },
  { id: "juego_corto", label: "Juego corto",       icon: "⛳" },
  { id: "putting",     label: "Putting",           icon: "🟢" },
  { id: "campo",       label: "Juegos de campo",   icon: "🌿" },
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
const LUGARES = [
  { value: "campo_practica",          label: "Campo de práctica" },
  { value: "putting_green_fundadores", label: "Putting Green Fundadores" },
  { value: "campo_pacos_fabios",       label: "Campo Pacos & Fabios" },
  { value: "campo_infantil",           label: "Campo Infantil" },
];
const LUGAR_LABEL: Record<string,string> = Object.fromEntries(LUGARES.map(l => [l.value, l.label]));

const SUBCATS: Record<Categoria, { value: string; label: string }[]> = {
  tecnico:     POSICIONES.map(p => ({ value: p, label: `${p} — ${POSICION_LABEL[p]}` })),
  juego_corto: [
    { value: "chipping", label: "Chipping" },
    { value: "bunker",   label: "Bunker" },
    { value: "approach", label: "Approach" },
    { value: "50-100yds", label: "50-100 yds" },
  ],
  putting: [
    { value: "distancia",  label: "Distancia" },
    { value: "direccion",  label: "Dirección" },
    { value: "presion",    label: "Presión" },
  ],
  campo: [
    { value: "skills",    label: "Skills" },
    { value: "matchplay", label: "Matchplay" },
    { value: "scramble",  label: "Scramble" },
  ],
};

function emptyForm(): DrillForm {
  return {
    titulo: "", descripcion: "", categoria: "tecnico", subcategoria: null,
    posicion_swing: null, nivel_recomendado: null,
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
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button" onClick={() => onChange?.(n)}
          className={`text-base leading-none ${onChange ? "cursor-pointer hover:scale-110 transition-transform" : "cursor-default"}`}
          style={{ color: n <= value ? "#f59e0b" : "#d1d5db" }}>
          ★
        </button>
      ))}
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg }: { msg: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl">
      {msg}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DrillsModule() {
  const [activeTab, setActiveTab]           = useState<Categoria>("tecnico");
  const [drills, setDrills]                 = useState<Drill[]>([]);
  const [loading, setLoading]               = useState(true);
  const [searchText, setSearchText]         = useState("");
  const [activeFilters, setActiveFilters]   = useState<string[]>([]);
  const [collapsed, setCollapsed]           = useState<Set<string>>(new Set());

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

  const [generatingLibrary, setGeneratingLibrary] = useState(false);
  const [toast, setToast]                   = useState<string | null>(null);

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
  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este drill?")) return;
    await supabase.from("drills").delete().eq("id", id);
    setDrills(prev => prev.filter(d => d.id !== id));
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
      posicion_swing: d.posicion_swing, nivel_recomendado: d.nivel_recomendado,
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

  // ── Generate library ──────────────────────────────────────────────────────────
  async function handleGenerarBiblioteca() {
    if (!confirm("¿Generar los 52 drills base? Este proceso puede tardar 30-60 segundos y no puede deshacerse.")) return;
    setGeneratingLibrary(true);
    try {
      const res = await fetch("/api/generate-drill-library", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error generando biblioteca");
      showToast(`✨ ${data.insertados} drills generados exitosamente`);
      await fetchDrills();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error desconocido");
    } finally { setGeneratingLibrary(false); }
  }

  // ── Update form helpers ───────────────────────────────────────────────────────
  const setF = (k: keyof DrillForm, v: unknown) => setForm(f => ({ ...f, [k]: v }));
  function toggleChip(field: "posicion_swing" | "nivel_recomendado", val: string) {
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
      <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-shadow hover:shadow-md ${!d.aprobado ? "border-amber-200" : "border-gray-100"}`}>
        {!d.aprobado && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border-b border-amber-200">
            <span className="text-xs text-amber-700 font-semibold">⚠️ Pendiente de aprobación</span>
            {d.generado_por_ia && <span className="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">IA</span>}
          </div>
        )}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-sm font-bold text-gray-900 leading-snug flex-1">{d.titulo}</h3>
            <Stars value={d.rating} />
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-1 mb-2">
            {d.posicion_swing?.map(p => (
              <span key={p} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background:"#e8f5e9", color:"#2d5a27" }}>{p}</span>
            ))}
            {d.subcategoria && !d.posicion_swing?.length && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background:"#e8f5e9", color:"#2d5a27" }}>{d.subcategoria}</span>
            )}
            {d.nivel_recomendado?.map(n => (
              <span key={n} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background:"#e3f2fd", color:"#1565c0" }}>{NIVEL_LABEL[n] ?? n}</span>
            ))}
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background:"#f3e5f5", color:"#6a1b9a" }}>
              📍 {LUGAR_LABEL[d.lugar] ?? d.lugar}
            </span>
          </div>

          <p className="text-xs text-gray-500 leading-snug mb-3 line-clamp-2">{d.descripcion}</p>

          <div className="flex items-center gap-3 text-[10px] text-gray-400 mb-3">
            {d.duracion_minutos && <span>⏱ {d.duracion_minutos} min</span>}
            {d.repeticiones && <span>🔄 {d.repeticiones}</span>}
            {d.metrica_exito && !compact && <span className="truncate max-w-[120px]">🎯 {d.metrica_exito}</span>}
          </div>

          {/* Reglas de campo (para tab campo) */}
          {d.reglas_campo && d.reglas_campo.length > 0 && !compact && (
            <div className="bg-green-50 rounded-lg p-2.5 mb-3">
              <p className="text-[10px] font-bold text-green-800 mb-1.5">REGLAS DEL JUEGO</p>
              <ul className="space-y-1">
                {d.reglas_campo.map((r, i) => (
                  <li key={i} className="flex gap-1.5 text-[10px] text-green-700">
                    <span>⛳</span><span>{r.texto}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-gray-100 pt-2.5 flex items-center gap-1.5">
            <button
              onClick={() => { showToast("✓ Drill copiado al portapapeles del plan"); }}
              className="flex-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg bg-green-50 text-green-800 hover:bg-green-100 transition-colors text-center"
            >+ Al plan</button>
            <button
              onClick={() => openEdit(d)}
              className="text-[10px] font-semibold px-2 py-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
            >Editar</button>
            <button
              onClick={() => handleFavorito(d)}
              className="text-sm px-1.5 py-1 rounded-lg hover:bg-yellow-50 transition-colors"
              title={d.favorito ? "Quitar favorito" : "Marcar favorito"}
            >{d.favorito ? "⭐" : "☆"}</button>
            {!d.aprobado && (
              <button
                onClick={() => handleAprobar(d.id)}
                className="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors whitespace-nowrap"
              >✓ Aprobar</button>
            )}
            <button
              onClick={() => handleDelete(d.id)}
              className="text-[10px] px-1.5 py-1 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
              title="Eliminar"
            >✕</button>
          </div>
        </div>
      </div>
    );
  }

  const total = drills.length;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Biblioteca de Drills</h1>
          <p className="text-sm text-gray-400 mt-0.5">{total} drill{total !== 1 ? "s" : ""} en total</p>
        </div>
        <div className="flex gap-2">
          {!loading && drills.length === 0 && (
            <button
              onClick={handleGenerarBiblioteca}
              disabled={generatingLibrary}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 shadow-sm transition-colors disabled:opacity-50"
            >
              {generatingLibrary
                ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Generando 52 drills...</>
                : "📚 Generar biblioteca base"}
            </button>
          )}
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
            Agregar drill
          </button>
          <button
            onClick={() => { setShowAIModal(true); setAiText(""); setAiPreview(null); setAiError(null); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110"
            style={{ background: "#1B4D2E" }}
          >
            ✨ Generar con IA
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
              activeTab === t.id
                ? "border-green-700 text-green-800 font-semibold"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
            <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
              {drills.filter(d => d.categoria === t.id).length}
            </span>
          </button>
        ))}
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Buscar drills..."
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TAB_FILTERS[activeTab].map(f => (
            <button
              key={f}
              onClick={() => toggleFilter(f)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
              style={activeFilters.includes(f)
                ? { background: "#1B4D2E", color: "#fff", borderColor: "#1B4D2E" }
                : { background: "#f9fafb", color: "#374151", borderColor: "#e5e7eb" }}
            >{f}</button>
          ))}
          {(activeFilters.length > 0 || searchText) && (
            <button
              onClick={() => { setActiveFilters([]); setSearchText(""); }}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border border-red-200 text-red-500 bg-red-50 hover:bg-red-100 transition-all"
            >✕ Limpiar</button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <svg className="animate-spin h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
          Cargando drills...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <p className="text-lg mb-2">No hay drills{activeFilters.length > 0 || searchText ? " con esos filtros" : " en esta categoría"}</p>
          <button onClick={openCreate} className="text-sm text-green-700 hover:underline">+ Agregar el primero</button>
        </div>
      ) : activeTab === "tecnico" ? (
        // ── Técnico: agrupado por posición ──────────────────────────────────────
        <div className="space-y-4">
          {POSICIONES.map(p => {
            const group = groupedTecnico[p];
            if (!group.length) return null;
            const isOpen = !collapsed.has(p);
            return (
              <div key={p} className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleCollapse(p)}
                  className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-800">[{p}] {POSICION_LABEL[p]}</span>
                    <span className="text-xs text-gray-400 font-medium">{group.length} drill{group.length !== 1 ? "s" : ""}</span>
                    {group.some(d => !d.aprobado) && (
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                        ⚠️ {group.filter(d => !d.aprobado).length} pendiente{group.filter(d => !d.aprobado).length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <span className="text-gray-400 text-sm">{isOpen ? "▲" : "▼"}</span>
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
        // ── Campo: cards grandes con reglas ─────────────────────────────────────
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(d => <DrillCard key={d.id} d={d} />)}
        </div>
      ) : (
        // ── Juego corto / Putting: grid simple ──────────────────────────────────
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(d => <DrillCard key={d.id} d={d} compact />)}
        </div>
      )}

      {/* ══ MODAL: Crear / Editar drill ════════════════════════════════════════ */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => { if (!saving) setShowEditModal(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="font-bold text-gray-900">{editingId ? "Editar drill" : "Nuevo drill"}</h2>
              <button onClick={() => setShowEditModal(false)} disabled={saving} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Título */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Título <span className="text-red-400">*</span></label>
                <input value={form.titulo} onChange={e => setF("titulo", e.target.value)}
                  placeholder="Nombre del drill"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
              </div>

              {/* Categoría + subcategoría */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Categoría <span className="text-red-400">*</span></label>
                  <select value={form.categoria} onChange={e => { setF("categoria", e.target.value as Categoria); setF("subcategoria", null); setF("posicion_swing", null); }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-600">
                    {TABS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Subcategoría</label>
                  <select value={form.subcategoria ?? ""} onChange={e => setF("subcategoria", e.target.value || null)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-600">
                    <option value="">— Ninguna —</option>
                    {SUBCATS[form.categoria].map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Posiciones swing (solo técnico) */}
              {form.categoria === "tecnico" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Posiciones del swing</label>
                  <div className="flex flex-wrap gap-1.5">
                    {POSICIONES.map(p => {
                      const sel = form.posicion_swing?.includes(p) ?? false;
                      return (
                        <button key={p} type="button" onClick={() => toggleChip("posicion_swing", p)}
                          className="px-2.5 py-1 rounded-full text-xs font-semibold border transition-all"
                          style={sel ? { background:"#1B4D2E", color:"#fff", borderColor:"#1B4D2E" } : { background:"#f9fafb", color:"#374151", borderColor:"#e5e7eb" }}>
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Nivel recomendado */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nivel recomendado</label>
                <div className="flex flex-wrap gap-1.5">
                  {NIVELES.map(n => {
                    const sel = form.nivel_recomendado?.includes(n) ?? false;
                    return (
                      <button key={n} type="button" onClick={() => toggleChip("nivel_recomendado", n)}
                        className="px-2.5 py-1 rounded-full text-xs font-semibold border transition-all"
                        style={sel ? { background:"#1565c0", color:"#fff", borderColor:"#1565c0" } : { background:"#f9fafb", color:"#374151", borderColor:"#e5e7eb" }}>
                        {NIVEL_LABEL[n]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Lugar */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Lugar <span className="text-red-400">*</span></label>
                <select value={form.lugar} onChange={e => setF("lugar", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-600">
                  {LUGARES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Descripción detallada <span className="text-red-400">*</span></label>
                <textarea value={form.descripcion} onChange={e => setF("descripcion", e.target.value)}
                  rows={3} placeholder="Instrucciones claras para el instructor..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-600" />
              </div>

              {/* Error + sensación */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Error que corrige</label>
                  <textarea value={form.error_que_corrige ?? ""} onChange={e => setF("error_que_corrige", e.target.value || null)}
                    rows={2} placeholder="El error técnico que trabaja..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-600" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Sensación buscada</label>
                  <textarea value={form.sensacion_buscada ?? ""} onChange={e => setF("sensacion_buscada", e.target.value || null)}
                    rows={2} placeholder="La sensación propioceptiva..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-600" />
                </div>
              </div>

              {/* Métrica + variante presión */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Métrica de éxito</label>
                  <input value={form.metrica_exito ?? ""} onChange={e => setF("metrica_exito", e.target.value || null)}
                    placeholder="ej: 8/10 impactos en zona"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Variante de presión</label>
                  <input value={form.variante_presion ?? ""} onChange={e => setF("variante_presion", e.target.value || null)}
                    placeholder="Cómo agregar presión..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
                </div>
              </div>

              {/* Duración + repeticiones */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Duración (min)</label>
                  <input type="number" min={1} max={90} value={form.duracion_minutos ?? ""}
                    onChange={e => setF("duracion_minutos", e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="15"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Repeticiones</label>
                  <input value={form.repeticiones ?? ""} onChange={e => setF("repeticiones", e.target.value || null)}
                    placeholder="ej: 3 series de 10"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
                </div>
              </div>

              {/* Reglas de campo */}
              {form.categoria === "campo" && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-gray-700">Reglas del juego</label>
                    <button type="button" onClick={addRegla}
                      className="text-xs text-green-700 font-semibold hover:underline">+ Agregar regla</button>
                  </div>
                  <div className="space-y-2">
                    {(form.reglas_campo ?? []).map((r, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <span className="text-gray-400 text-sm shrink-0">⛳</span>
                        <input value={r.texto} onChange={e => setRegla(i, e.target.value)}
                          placeholder={`Regla ${i + 1}...`}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" />
                        <button type="button" onClick={() => removeRegla(i)}
                          className="text-gray-300 hover:text-red-400 text-sm">✕</button>
                      </div>
                    ))}
                    {!form.reglas_campo?.length && (
                      <p className="text-xs text-gray-400 italic">Sin reglas aún — haz clic en "+ Agregar regla"</p>
                    )}
                  </div>
                </div>
              )}

              {/* Rating + Aprobado */}
              <div className="flex items-center gap-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Rating</label>
                  <Stars value={form.rating} onChange={v => setF("rating", v)} />
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none mt-4">
                  <input type="checkbox" checked={form.aprobado} onChange={e => setF("aprobado", e.target.checked)}
                    className="w-4 h-4 rounded accent-green-700" />
                  <span className="text-sm text-gray-700 font-medium">Aprobado por instructor</span>
                </label>
              </div>

              {/* Notas instructor */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Notas del instructor</label>
                <textarea value={form.notas_instructor ?? ""} onChange={e => setF("notas_instructor", e.target.value || null)}
                  rows={2} placeholder="Observaciones internas..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-600" />
              </div>

              {formError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>}
            </div>

            <div className="px-6 pb-6 flex gap-2 sticky bottom-0 bg-white border-t border-gray-100 pt-4">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:brightness-110 transition-all"
                style={{ background: "#1B4D2E" }}>
                {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear drill"}
              </button>
              <button onClick={() => setShowEditModal(false)} disabled={saving}
                className="px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Agregar con IA ══════════════════════════════════════════════ */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => { if (!aiLoading && !saving) setShowAIModal(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">✨ Agregar drill rápido con IA</h2>
                <p className="text-xs text-gray-400 mt-0.5">Describe el drill y la IA lo organiza automáticamente</p>
              </div>
              <button onClick={() => setShowAIModal(false)} disabled={aiLoading || saving}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <textarea
                value={aiText}
                onChange={e => { setAiText(e.target.value); setAiPreview(null); setAiError(null); }}
                rows={5}
                placeholder="Describe el drill en tus palabras...&#10;&#10;Ej: 'Drill de media subida para Competencia — el alumno pone un palo en la espalda y hace la subida hasta P3 sin que el palo caiga, para trabajar la rotación de hombros. 10 repeticiones.'"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-600"
              />

              {aiError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{aiError}</p>}

              {!aiPreview && (
                <button
                  onClick={handleOrganizarIA}
                  disabled={aiLoading || !aiText.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:brightness-110 transition-all"
                  style={{ background: "#1B4D2E" }}>
                  {aiLoading
                    ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Organizando...</>
                    : "✨ Organizar con IA"}
                </button>
              )}

              {/* Preview IA */}
              {aiPreview && (
                <div className="border border-green-200 rounded-xl bg-green-50 p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#166534" strokeWidth={2.5}><path d="M3 10l4 4 9-9"/></svg>
                    <span className="text-xs font-bold text-green-800">Vista previa — revisa antes de guardar</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900">{aiPreview.titulo}</p>
                  <div className="flex flex-wrap gap-1">
                    {aiPreview.categoria && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-green-200 text-green-800">
                        {TABS.find(t => t.id === aiPreview.categoria)?.label ?? aiPreview.categoria}
                      </span>
                    )}
                    {aiPreview.posicion_swing?.map(p => (
                      <span key={p} className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{background:"#e8f5e9",color:"#2d5a27"}}>{p}</span>
                    ))}
                    {aiPreview.nivel_recomendado?.map(n => (
                      <span key={n} className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{background:"#e3f2fd",color:"#1565c0"}}>{NIVEL_LABEL[n]??n}</span>
                    ))}
                    {aiPreview.lugar && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{background:"#f3e5f5",color:"#6a1b9a"}}>
                        📍 {LUGAR_LABEL[aiPreview.lugar] ?? aiPreview.lugar}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 leading-snug">{aiPreview.descripcion}</p>
                  {aiPreview.error_que_corrige && (
                    <p className="text-xs text-red-600"><strong>Error:</strong> {aiPreview.error_que_corrige}</p>
                  )}
                  {aiPreview.metrica_exito && (
                    <p className="text-xs text-blue-700"><strong>Métrica:</strong> {aiPreview.metrica_exito}</p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={handleGuardarAI}
                      className="flex-1 py-2 rounded-xl text-sm font-semibold text-white hover:brightness-110 transition-all"
                      style={{ background: "#1B4D2E" }}>
                      ✓ Guardado como pendiente
                    </button>
                    <button
                      onClick={() => {
                        if (!aiPreview) return;
                        const cat = aiPreview.categoria;
                        setForm({
                          titulo: aiPreview.titulo ?? "",
                          descripcion: aiPreview.descripcion ?? "",
                          categoria: cat,
                          subcategoria: aiPreview.subcategoria ?? null,
                          posicion_swing: aiPreview.posicion_swing ?? null,
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
                      }}
                      className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                      ✏️ Editar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast} />}
    </div>
  );
}
