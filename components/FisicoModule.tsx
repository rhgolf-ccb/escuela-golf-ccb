"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Dumbbell } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Categoria = "Movilidad" | "Fuerza y estabilidad" | "Potencia" | "Calentamiento";

interface Ejercicio {
  id: string;
  nombre: string;
  categoria: Categoria;
  grupo_muscular: string | null;
  grupos: string[] | null;
  materiales: string | null;
  instrucciones: string | null;
  series_repeticiones: string | null;
  progresion: string | null;
  screen_vinculado: string | null;
  duracion_minutos: number | null;
  nota: string | null;
  favorito: boolean;
  created_at: string;
  updated_at: string;
}

type EjercicioForm = Omit<Ejercicio, "id" | "created_at" | "updated_at">;

// ── Constants ─────────────────────────────────────────────────────────────────
const TABS: { id: Categoria; label: string; icon: string }[] = [
  { id: "Movilidad",            label: "Movilidad",            icon: "🧘" },
  { id: "Fuerza y estabilidad", label: "Fuerza y estabilidad",  icon: "💪" },
  { id: "Potencia",             label: "Potencia",              icon: "⚡" },
  { id: "Calentamiento",        label: "Calentamiento",         icon: "🔥" },
];

const CATEGORIA_COLOR: Record<Categoria, { bg: string; fg: string }> = {
  "Movilidad":            { bg: "#e3f2fd", fg: "#1565c0" },
  "Fuerza y estabilidad": { bg: "#e8f5e9", fg: "#2d5a27" },
  "Potencia":             { bg: "#ffe0e0", fg: "#b3261e" },
  "Calentamiento":        { bg: "#fff8e1", fg: "#8d6d00" },
};

const GRUPOS = ["Birdies", "Águilas", "Albatros", "Competencia", "Damas"];

function emptyForm(): EjercicioForm {
  return {
    nombre: "", categoria: "Movilidad", grupo_muscular: null,
    grupos: null, materiales: null, instrucciones: null,
    series_repeticiones: null, progresion: null, screen_vinculado: null,
    duracion_minutos: null, nota: null, favorito: false,
  };
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
export default function FisicoModule() {
  const [activeTab, setActiveTab]         = useState<Categoria>("Movilidad");
  const [ejercicios, setEjercicios]       = useState<Ejercicio[]>([]);
  const [loading, setLoading]             = useState(true);
  const [searchText, setSearchText]       = useState("");
  const [grupoFilters, setGrupoFilters]   = useState<string[]>([]);
  const [screenFilter, setScreenFilter]   = useState("");

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [form, setForm]                   = useState<EjercicioForm>(emptyForm());
  const [saving, setSaving]               = useState(false);
  const [formError, setFormError]         = useState<string | null>(null);

  const [detailEjercicio, setDetailEjercicio] = useState<Ejercicio | null>(null);
  const [toast, setToast]                 = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ── Load ejercicios ───────────────────────────────────────────────────────────
  const fetchEjercicios = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ejercicios_fisicos").select("*").order("nombre", { ascending: true });
    setEjercicios((data as Ejercicio[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchEjercicios(); }, [fetchEjercicios]);
  useEffect(() => { setGrupoFilters([]); setScreenFilter(""); setSearchText(""); }, [activeTab]);

  // ── Filter logic ─────────────────────────────────────────────────────────────
  const inTab = ejercicios.filter(e => e.categoria === activeTab);

  const screensDisponibles = Array.from(
    new Set(inTab.map(e => e.screen_vinculado).filter((s): s is string => !!s))
  ).sort();

  const filtered = inTab.filter(e => {
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      if (!e.nombre.toLowerCase().includes(q)) return false;
    }
    if (grupoFilters.length > 0) {
      const hasGrupo = grupoFilters.some(g => e.grupos?.includes(g));
      if (!hasGrupo) return false;
    }
    if (screenFilter && e.screen_vinculado !== screenFilter) return false;
    return true;
  });

  function toggleGrupoFilter(g: string) {
    setGrupoFilters(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  }

  // ── Toggle favorito ──────────────────────────────────────────────────────────
  async function handleFavorito(e: Ejercicio) {
    const val = !e.favorito;
    await supabase.from("ejercicios_fisicos").update({ favorito: val }).eq("id", e.id);
    setEjercicios(prev => prev.map(x => x.id === e.id ? { ...x, favorito: val } : x));
    setDetailEjercicio(prev => prev && prev.id === e.id ? { ...prev, favorito: val } : prev);
  }

  // ── Delete ejercicio ─────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este ejercicio?")) return;
    await supabase.from("ejercicios_fisicos").delete().eq("id", id);
    setEjercicios(prev => prev.filter(e => e.id !== id));
    setDetailEjercicio(null);
    showToast("Ejercicio eliminado");
  }

  // ── Open edit modal ──────────────────────────────────────────────────────────
  function openCreate() {
    setForm(emptyForm()); setEditingId(null);
    setFormError(null); setShowEditModal(true);
  }
  function openEdit(e: Ejercicio) {
    setForm({
      nombre: e.nombre, categoria: e.categoria, grupo_muscular: e.grupo_muscular,
      grupos: e.grupos, materiales: e.materiales, instrucciones: e.instrucciones,
      series_repeticiones: e.series_repeticiones, progresion: e.progresion,
      screen_vinculado: e.screen_vinculado, duracion_minutos: e.duracion_minutos,
      nota: e.nota, favorito: e.favorito,
    });
    setEditingId(e.id); setFormError(null); setShowEditModal(true);
  }

  // ── Save ejercicio ───────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.nombre.trim()) { setFormError("El nombre es requerido."); return; }
    if (!form.instrucciones?.trim()) { setFormError("Las instrucciones son requeridas."); return; }
    setSaving(true); setFormError(null);
    try {
      const payload = {
        ...form,
        grupo_muscular: form.grupo_muscular || null,
        grupos: form.grupos?.length ? form.grupos : null,
        materiales: form.materiales || null,
        series_repeticiones: form.series_repeticiones || null,
        progresion: form.progresion || null,
        screen_vinculado: form.screen_vinculado || null,
        nota: form.nota || null,
      };
      if (editingId) {
        await supabase.from("ejercicios_fisicos").update(payload).eq("id", editingId);
        setEjercicios(prev => prev.map(e => e.id === editingId ? { ...e, ...payload } : e));
        showToast("✓ Ejercicio actualizado");
      } else {
        const { data } = await supabase.from("ejercicios_fisicos").insert(payload).select().single();
        if (data) setEjercicios(prev => [data as Ejercicio, ...prev]);
        showToast("✓ Ejercicio creado");
      }
      setShowEditModal(false);
    } catch { setFormError("Error al guardar. Intenta de nuevo."); }
    finally { setSaving(false); }
  }

  // ── Form helpers ───────────────────────────────────────────────────────────────
  const setF = (k: keyof EjercicioForm, v: unknown) => setForm(f => ({ ...f, [k]: v }));
  function toggleGrupoChip(val: string) {
    setForm(f => {
      const cur = f.grupos ?? [];
      const next = cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val];
      return { ...f, grupos: next.length ? next : null };
    });
  }

  // ── Ejercicio Card ───────────────────────────────────────────────────────────
  function EjercicioCard({ e }: { e: Ejercicio }) {
    const colors = CATEGORIA_COLOR[e.categoria];
    return (
      <div
        onClick={() => setDetailEjercicio(e)}
        className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden transition-shadow hover:shadow-md cursor-pointer"
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-sm font-bold text-gray-900 leading-snug flex-1">{e.nombre}</h3>
            <button
              onClick={ev => { ev.stopPropagation(); handleFavorito(e); }}
              className="text-sm px-1 py-0.5 rounded-lg hover:bg-yellow-50 transition-colors shrink-0"
              title={e.favorito ? "Quitar favorito" : "Marcar favorito"}
            >{e.favorito ? "⭐" : "☆"}</button>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-1 mb-2">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: colors.bg, color: colors.fg }}>
              {e.categoria}
            </span>
            {e.grupos?.map(g => (
              <span key={g} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#e0f2f1", color: "#00695c" }}>{g}</span>
            ))}
            {e.screen_vinculado && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#fce4ec", color: "#ad1457" }}>
                🎯 {e.screen_vinculado}
              </span>
            )}
          </div>

          {e.materiales && (
            <p className="text-[10px] text-gray-400 mb-1.5">🧰 {e.materiales}</p>
          )}

          <p className="text-xs text-gray-500 leading-snug mb-3 line-clamp-2">{e.instrucciones}</p>

          <div className="flex items-center gap-3 text-[10px] text-gray-400 mb-3">
            {e.duracion_minutos && <span>⏱ {e.duracion_minutos} min</span>}
            {e.series_repeticiones && <span className="truncate">🔄 {e.series_repeticiones}</span>}
          </div>

          <div className="border-t border-gray-100 pt-2.5 flex items-center gap-1.5">
            <button
              onClick={ev => { ev.stopPropagation(); openEdit(e); }}
              className="flex-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
            >Editar</button>
            <button
              onClick={ev => { ev.stopPropagation(); handleDelete(e.id); }}
              className="text-[10px] px-1.5 py-1 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
              title="Eliminar"
            >✕</button>
          </div>
        </div>
      </div>
    );
  }

  const total = ejercicios.length;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-ccb-green flex items-center justify-center shrink-0">
            <Dumbbell size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ccb-green">Biblioteca de ejercicios físicos</h1>
            <p className="text-sm text-(--text-muted) mt-0.5">{total} ejercicio{total !== 1 ? "s" : ""} en total</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
          Agregar ejercicio
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-gray-200 mb-4 flex-wrap">
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
              {ejercicios.filter(e => e.categoria === t.id).length}
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
            placeholder="Buscar ejercicios..."
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {GRUPOS.map(g => (
            <button
              key={g}
              onClick={() => toggleGrupoFilter(g)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
              style={grupoFilters.includes(g)
                ? { background: "#1B4D2E", color: "#fff", borderColor: "#1B4D2E" }
                : { background: "#f9fafb", color: "#374151", borderColor: "#e5e7eb" }}
            >{g}</button>
          ))}
        </div>
        {screensDisponibles.length > 0 && (
          <select
            value={screenFilter}
            onChange={e => setScreenFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-green-600"
          >
            <option value="">Todos los screens</option>
            {screensDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {(grupoFilters.length > 0 || screenFilter || searchText) && (
          <button
            onClick={() => { setGrupoFilters([]); setScreenFilter(""); setSearchText(""); }}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border border-red-200 text-red-500 bg-red-50 hover:bg-red-100 transition-all"
          >✕ Limpiar</button>
        )}
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <svg className="animate-spin h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
          Cargando ejercicios...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <p className="text-lg mb-2">No hay ejercicios{grupoFilters.length > 0 || screenFilter || searchText ? " con esos filtros" : " en esta categoría"}</p>
          <button onClick={openCreate} className="text-sm text-green-700 hover:underline">+ Agregar el primero</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(e => <EjercicioCard key={e.id} e={e} />)}
        </div>
      )}

      {/* ══ MODAL: Detalle del ejercicio ═══════════════════════════════════════ */}
      {detailEjercicio && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setDetailEjercicio(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="font-bold text-gray-900">{detailEjercicio.nombre}</h2>
              <button onClick={() => setDetailEjercicio(null)} className="text-gray-400 hover:text-gray-600">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: CATEGORIA_COLOR[detailEjercicio.categoria].bg, color: CATEGORIA_COLOR[detailEjercicio.categoria].fg }}>
                  {detailEjercicio.categoria}
                </span>
                {detailEjercicio.grupos?.map(g => (
                  <span key={g} className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#e0f2f1", color: "#00695c" }}>{g}</span>
                ))}
                {detailEjercicio.screen_vinculado && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#fce4ec", color: "#ad1457" }}>
                    🎯 Screen {detailEjercicio.screen_vinculado}
                  </span>
                )}
              </div>

              {detailEjercicio.grupo_muscular && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">Grupo muscular</p>
                  <p className="text-sm text-gray-600">{detailEjercicio.grupo_muscular}</p>
                </div>
              )}

              {detailEjercicio.materiales && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">Materiales</p>
                  <p className="text-sm text-gray-600">🧰 {detailEjercicio.materiales}</p>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1">Instrucciones</p>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{detailEjercicio.instrucciones}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {detailEjercicio.series_repeticiones && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">Series / repeticiones</p>
                    <p className="text-sm text-gray-600">{detailEjercicio.series_repeticiones}</p>
                  </div>
                )}
                {detailEjercicio.duracion_minutos && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">Duración</p>
                    <p className="text-sm text-gray-600">⏱ {detailEjercicio.duracion_minutos} min</p>
                  </div>
                )}
              </div>

              {detailEjercicio.progresion && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">Progresión</p>
                  <p className="text-sm text-gray-600">{detailEjercicio.progresion}</p>
                </div>
              )}

              {detailEjercicio.nota && (
                <div className="bg-amber-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-1">Nota</p>
                  <p className="text-sm text-amber-700">{detailEjercicio.nota}</p>
                </div>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-2 sticky bottom-0 bg-white border-t border-gray-100 pt-4">
              <button onClick={() => handleFavorito(detailEjercicio)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                {detailEjercicio.favorito ? "⭐ Favorito" : "☆ Marcar favorito"}
              </button>
              <button onClick={() => { const e = detailEjercicio; setDetailEjercicio(null); openEdit(e); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:brightness-110 transition-all"
                style={{ background: "#1B4D2E" }}>
                Editar
              </button>
              <button onClick={() => handleDelete(detailEjercicio.id)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-red-200 text-red-500 hover:bg-red-50">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Crear / Editar ejercicio ════════════════════════════════════ */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => { if (!saving) setShowEditModal(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6" onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="font-bold text-gray-900">{editingId ? "Editar ejercicio" : "Nuevo ejercicio"}</h2>
              <button onClick={() => setShowEditModal(false)} disabled={saving} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Nombre */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre <span className="text-red-400">*</span></label>
                <input value={form.nombre} onChange={e => setF("nombre", e.target.value)}
                  placeholder="Nombre del ejercicio"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
              </div>

              {/* Categoría + grupo muscular */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Categoría <span className="text-red-400">*</span></label>
                  <select value={form.categoria} onChange={e => setF("categoria", e.target.value as Categoria)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-600">
                    {TABS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Grupo muscular</label>
                  <input value={form.grupo_muscular ?? ""} onChange={e => setF("grupo_muscular", e.target.value || null)}
                    placeholder="ej: Columna torácica"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
                </div>
              </div>

              {/* Grupos */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Grupos</label>
                <div className="flex flex-wrap gap-1.5">
                  {GRUPOS.map(g => {
                    const sel = form.grupos?.includes(g) ?? false;
                    return (
                      <button key={g} type="button" onClick={() => toggleGrupoChip(g)}
                        className="px-2.5 py-1 rounded-full text-xs font-semibold border transition-all"
                        style={sel ? { background: "#00695c", color: "#fff", borderColor: "#00695c" } : { background: "#f9fafb", color: "#374151", borderColor: "#e5e7eb" }}>
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Materiales + screen vinculado */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Materiales</label>
                  <input value={form.materiales ?? ""} onChange={e => setF("materiales", e.target.value || null)}
                    placeholder="ej: Banda elástica"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Screen TPI vinculado</label>
                  <input value={form.screen_vinculado ?? ""} onChange={e => setF("screen_vinculado", e.target.value || null)}
                    placeholder="ej: S5 o PB2"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
                </div>
              </div>

              {/* Instrucciones */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Instrucciones <span className="text-red-400">*</span></label>
                <textarea value={form.instrucciones ?? ""} onChange={e => setF("instrucciones", e.target.value || null)}
                  rows={4} placeholder="Instrucciones claras para el instructor..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-600" />
              </div>

              {/* Series/repeticiones + progresión */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Series / repeticiones</label>
                  <input value={form.series_repeticiones ?? ""} onChange={e => setF("series_repeticiones", e.target.value || null)}
                    placeholder="ej: 3 series x 10 rep"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Duración (min)</label>
                  <input type="number" min={1} max={90} value={form.duracion_minutos ?? ""}
                    onChange={e => setF("duracion_minutos", e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="10"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Progresión</label>
                <textarea value={form.progresion ?? ""} onChange={e => setF("progresion", e.target.value || null)}
                  rows={2} placeholder="Cómo avanzar de nivel..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-600" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Nota</label>
                <textarea value={form.nota ?? ""} onChange={e => setF("nota", e.target.value || null)}
                  rows={2} placeholder="Observaciones adicionales..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-600" />
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={form.favorito} onChange={e => setF("favorito", e.target.checked)}
                  className="w-4 h-4 rounded accent-green-700" />
                <span className="text-sm text-gray-700 font-medium">Marcar como favorito</span>
              </label>

              {formError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>}
            </div>

            <div className="px-6 pb-6 flex gap-2 sticky bottom-0 bg-white border-t border-gray-100 pt-4">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:brightness-110 transition-all"
                style={{ background: "#1B4D2E" }}>
                {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear ejercicio"}
              </button>
              <button onClick={() => setShowEditModal(false)} disabled={saving}
                className="px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast} />}
    </div>
  );
}
