"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { colorGrupo } from "@/lib/grupos";
import {
  Dumbbell, Plus, Search, Star, Pencil, Trash2, X, Clock, Repeat, Package, Target,
} from "lucide-react";
import {
  BotonPrimario, BotonSecundario, CAMPO, CLASE_CAMPO, Campo, CampoLabel, EmptyState,
  Encabezado, Loading, Modal, ModalConfirmar, ModalHeader, Pagina, Tabs, Toast,
} from "@/components/ui/tema";

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
const TABS: { id: Categoria; label: string }[] = [
  { id: "Movilidad",            label: "Movilidad" },
  { id: "Fuerza y estabilidad", label: "Fuerza y estabilidad" },
  { id: "Potencia",             label: "Potencia" },
  { id: "Calentamiento",        label: "Calentamiento" },
];

// Las cuatro categorías tenían su propio par de pasteles inventado aquí. Se
// toman prestados los pares de grupo, que es la paleta que ya está validada
// contra el fondo oscuro. La correspondencia es arbitraria y solo busca que
// las cuatro se distingan entre sí.
const CATEGORIA_VAR: Record<Categoria, string> = {
  "Movilidad":            "birdies",
  "Fuerza y estabilidad": "juvenil",
  "Potencia":             "damas",
  "Calentamiento":        "competencia",
};

function colorCategoria(c: Categoria): { background: string; color: string } {
  const v = CATEGORIA_VAR[c];
  return { background: `var(--g-${v}-bg)`, color: `var(--g-${v}-fg)` };
}

const GRUPOS = ["Birdies", "Águilas", "Albatros", "Competencia", "Damas"];

function emptyForm(): EjercicioForm {
  return {
    nombre: "", categoria: "Movilidad", grupo_muscular: null,
    grupos: null, materiales: null, instrucciones: null,
    series_repeticiones: null, progresion: null, screen_vinculado: null,
    duracion_minutos: null, nota: null, favorito: false,
  };
}

// Bloque de "etiqueta + valor" del detalle. Se repetía ocho veces.
function Dato({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--ui-text-3)" }}>{label}</p>
      <div className="text-sm" style={{ color: "var(--ui-text-2)" }}>{children}</div>
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
  // El borrado pedía confirmación con confirm(), que bloquea la pestaña y no
  // alcanza a decir qué ejercicio se va. Ahora se guarda cuál y se pregunta
  // dentro de la app, con el nombre a la vista.
  const [borrarEjercicio, setBorrarEjercicio] = useState<Ejercicio | null>(null);
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
  async function handleDelete() {
    const e = borrarEjercicio;
    if (!e) return;
    await supabase.from("ejercicios_fisicos").delete().eq("id", e.id);
    setEjercicios(prev => prev.filter(x => x.id !== e.id));
    setBorrarEjercicio(null);
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
    const tono = colorCategoria(e.categoria);
    return (
      <div
        onClick={() => setDetailEjercicio(e)}
        className="rounded-xl overflow-hidden cursor-pointer transition-colors hover:border-(--ui-border)"
        style={{ background: "var(--ui-card)", border: "1px solid var(--ui-border-soft)" }}
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-sm font-bold leading-snug flex-1" style={{ color: "var(--ui-text)" }}>{e.nombre}</h3>
            <button
              onClick={ev => { ev.stopPropagation(); handleFavorito(e); }}
              className="p-1 rounded-lg transition-colors hover:bg-(--ui-card-alt) shrink-0"
              title={e.favorito ? "Quitar de favoritos" : "Marcar favorito"}
            >
              <Star size={14}
                style={{ color: e.favorito ? "var(--ui-gold)" : "var(--ui-text-3)" }}
                fill={e.favorito ? "var(--ui-gold)" : "none"} />
            </button>
          </div>

          <div className="flex flex-wrap gap-1 mb-2">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={tono}>
              {e.categoria}
            </span>
            {e.grupos?.map(g => (
              <span key={g} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: "var(--ui-card-alt)", color: "var(--ui-text-2)" }}>{g}</span>
            ))}
            {e.screen_vinculado && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: "var(--ui-warn-bg)", color: "var(--ui-warn)" }}>
                <Target size={9} />{e.screen_vinculado}
              </span>
            )}
          </div>

          {e.materiales && (
            <p className="flex items-center gap-1 text-[10px] mb-1.5" style={{ color: "var(--ui-text-3)" }}>
              <Package size={10} />{e.materiales}
            </p>
          )}

          <p className="text-xs leading-snug mb-3 line-clamp-2" style={{ color: "var(--ui-text-2)" }}>{e.instrucciones}</p>

          <div className="flex items-center gap-3 text-[10px] mb-3" style={{ color: "var(--ui-text-3)" }}>
            {e.duracion_minutos && <span className="flex items-center gap-1"><Clock size={10} />{e.duracion_minutos} min</span>}
            {e.series_repeticiones && <span className="flex items-center gap-1 truncate"><Repeat size={10} />{e.series_repeticiones}</span>}
          </div>

          <div className="pt-2.5 flex items-center gap-1.5" style={{ borderTop: "1px solid var(--ui-border-soft)" }}>
            <button
              onClick={ev => { ev.stopPropagation(); openEdit(e); }}
              className="flex-1 flex items-center justify-center gap-1 text-[11px] font-bold px-2 py-1.5 rounded-lg transition-colors hover:bg-(--ui-card-alt)"
              style={{ color: "var(--ui-text-2)", border: "1px solid var(--ui-border)" }}
            ><Pencil size={11} />Editar</button>
            <button
              onClick={ev => { ev.stopPropagation(); setBorrarEjercicio(e); }}
              className="p-1.5 rounded-lg transition-colors hover:bg-(--ui-bad-bg)"
              style={{ color: "var(--ui-text-3)" }}
              title="Eliminar"
            ><Trash2 size={13} /></button>
          </div>
        </div>
      </div>
    );
  }

  const total = ejercicios.length;
  const hayFiltros = grupoFilters.length > 0 || !!screenFilter || !!searchText;

  return (
    <Pagina>
      <Encabezado
        icono={Dumbbell}
        titulo="Biblioteca de ejercicios físicos"
        bajada={`${total} ejercicio${total !== 1 ? "s" : ""} en total`}
      >
        <BotonPrimario onClick={openCreate}>
          <Plus size={16} />
          Agregar ejercicio
        </BotonPrimario>
      </Encabezado>

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        options={TABS.map(t => ({
          id: t.id,
          label: t.label,
          count: ejercicios.filter(e => e.categoria === t.id).length,
        }))}
      />

      {/* ── Filtros ── */}
      <div className="rounded-xl px-3 py-2.5 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2"
        style={{ background: "var(--ui-card)", border: "1px solid var(--ui-border)" }}>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--ui-text-3)" }} />
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Buscar ejercicios…"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2"
            style={CAMPO}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <CampoLabel>Grupo</CampoLabel>
          <div className="flex flex-wrap gap-1.5">
            {GRUPOS.map(g => {
              const on = grupoFilters.includes(g);
              const c = colorGrupo(g);
              return (
                <button key={g} onClick={() => toggleGrupoFilter(g)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                  style={on
                    ? { background: c.background, color: c.color, border: `1px solid ${c.color}` }
                    : { background: "transparent", color: "var(--ui-text-2)", border: "1px solid var(--ui-border)" }}>
                  {g}
                </button>
              );
            })}
          </div>
        </div>

        {screensDisponibles.length > 0 && (
          <select
            value={screenFilter}
            onChange={e => setScreenFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2"
            style={CAMPO}
          >
            <option value="">Todos los screens</option>
            {screensDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        {hayFiltros && (
          <button
            onClick={() => { setGrupoFilters([]); setScreenFilter(""); setSearchText(""); }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors hover:opacity-80"
            style={{ color: "var(--ui-bad)", border: "1px solid var(--ui-bad)" }}
          ><X size={12} />Limpiar</button>
        )}
      </div>

      {/* ── Contenido ── */}
      {loading ? (
        <Loading msg="Cargando ejercicios…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          msg={`No hay ejercicios${hayFiltros ? " con esos filtros" : " en esta categoría"}`}
          sub={hayFiltros ? "Prueba quitando algún filtro" : undefined}
          accion={hayFiltros
            ? <BotonSecundario onClick={() => { setGrupoFilters([]); setScreenFilter(""); setSearchText(""); }}>Limpiar filtros</BotonSecundario>
            : <BotonPrimario onClick={openCreate}><Plus size={16} />Agregar el primero</BotonPrimario>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(e => <EjercicioCard key={e.id} e={e} />)}
        </div>
      )}

      {/* ══ MODAL: Detalle del ejercicio ═══════════════════════════════════════ */}
      {detailEjercicio && (
        <Modal onClose={() => setDetailEjercicio(null)} ancho="xl">
          <ModalHeader
            titulo={detailEjercicio.nombre}
            sub={detailEjercicio.grupo_muscular ?? undefined}
            onClose={() => setDetailEjercicio(null)}
          />

          <div className="px-5 py-5 space-y-4">
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={colorCategoria(detailEjercicio.categoria)}>
                {detailEjercicio.categoria}
              </span>
              {detailEjercicio.grupos?.map(g => {
                const c = colorGrupo(g);
                return (
                  <span key={g} className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: c.background, color: c.color }}>{g}</span>
                );
              })}
              {detailEjercicio.screen_vinculado && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "var(--ui-warn-bg)", color: "var(--ui-warn)" }}>
                  <Target size={10} />Screen {detailEjercicio.screen_vinculado}
                </span>
              )}
            </div>

            {detailEjercicio.materiales && (
              <Dato label="Materiales">
                <span className="flex items-center gap-1.5"><Package size={13} />{detailEjercicio.materiales}</span>
              </Dato>
            )}

            <Dato label="Instrucciones">
              <p className="leading-relaxed whitespace-pre-line">{detailEjercicio.instrucciones}</p>
            </Dato>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {detailEjercicio.series_repeticiones && (
                <Dato label="Series / repeticiones">{detailEjercicio.series_repeticiones}</Dato>
              )}
              {detailEjercicio.duracion_minutos && (
                <Dato label="Duración">
                  <span className="flex items-center gap-1.5"><Clock size={13} />{detailEjercicio.duracion_minutos} min</span>
                </Dato>
              )}
            </div>

            {detailEjercicio.progresion && <Dato label="Progresión">{detailEjercicio.progresion}</Dato>}

            {detailEjercicio.nota && (
              <div className="rounded-lg p-3" style={{ background: "var(--ui-warn-bg)" }}>
                <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--ui-warn)" }}>Nota</p>
                <p className="text-sm" style={{ color: "var(--ui-text-2)" }}>{detailEjercicio.nota}</p>
              </div>
            )}
          </div>

          <div className="px-5 pb-5 pt-4 flex gap-2 sticky bottom-0"
            style={{ background: "var(--ui-card)", borderTop: "1px solid var(--ui-border-soft)" }}>
            <BotonSecundario onClick={() => handleFavorito(detailEjercicio)}>
              <Star size={14}
                style={{ color: detailEjercicio.favorito ? "var(--ui-gold)" : "var(--ui-text-3)" }}
                fill={detailEjercicio.favorito ? "var(--ui-gold)" : "none"} />
              {detailEjercicio.favorito ? "Favorito" : "Marcar favorito"}
            </BotonSecundario>
            <div className="flex-1">
              <BotonPrimario onClick={() => { const e = detailEjercicio; setDetailEjercicio(null); openEdit(e); }}>
                <Pencil size={14} />Editar
              </BotonPrimario>
            </div>
            <button onClick={() => setBorrarEjercicio(detailEjercicio)}
              className="px-3 py-2 rounded-lg text-sm font-semibold transition-colors hover:bg-(--ui-bad-bg)"
              style={{ color: "var(--ui-bad)", border: "1px solid var(--ui-bad)" }}>
              <Trash2 size={14} />
            </button>
          </div>
        </Modal>
      )}

      {/* ══ MODAL: Crear / Editar ejercicio ════════════════════════════════════ */}
      {showEditModal && (
        <Modal onClose={() => { if (!saving) setShowEditModal(false); }} ancho="2xl">
          <ModalHeader
            titulo={editingId ? "Editar ejercicio" : "Nuevo ejercicio"}
            sub={form.categoria}
            onClose={() => { if (!saving) setShowEditModal(false); }}
          />

          <div className="px-5 py-5 space-y-4">
            <Campo label="Nombre *">
              <input value={form.nombre} onChange={e => setF("nombre", e.target.value)}
                placeholder="Rotación torácica en cuadrupedia" className={CLASE_CAMPO} style={CAMPO} />
            </Campo>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Categoría *">
                <select value={form.categoria} onChange={e => setF("categoria", e.target.value as Categoria)}
                  className={CLASE_CAMPO} style={CAMPO}>
                  {TABS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </Campo>
              <Campo label="Grupo muscular">
                <input value={form.grupo_muscular ?? ""} onChange={e => setF("grupo_muscular", e.target.value || null)}
                  placeholder="Columna torácica" className={CLASE_CAMPO} style={CAMPO} />
              </Campo>
            </div>

            <Campo label="Grupos" hint="Para qué grupos aplica este ejercicio">
              <div className="flex flex-wrap gap-1.5">
                {GRUPOS.map(g => {
                  const sel = form.grupos?.includes(g) ?? false;
                  const c = colorGrupo(g);
                  return (
                    <button key={g} type="button" onClick={() => toggleGrupoChip(g)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                      style={sel
                        ? { background: c.background, color: c.color, border: `1px solid ${c.color}` }
                        : { background: "transparent", color: "var(--ui-text-2)", border: "1px solid var(--ui-border)" }}>
                      {g}
                    </button>
                  );
                })}
              </div>
            </Campo>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Materiales">
                <input value={form.materiales ?? ""} onChange={e => setF("materiales", e.target.value || null)}
                  placeholder="Banda elástica" className={CLASE_CAMPO} style={CAMPO} />
              </Campo>
              <Campo label="Screen TPI vinculado">
                <input value={form.screen_vinculado ?? ""} onChange={e => setF("screen_vinculado", e.target.value || null)}
                  placeholder="S5 o PB2" className={CLASE_CAMPO} style={CAMPO} />
              </Campo>
            </div>

            <Campo label="Instrucciones *">
              <textarea value={form.instrucciones ?? ""} onChange={e => setF("instrucciones", e.target.value || null)}
                rows={4} placeholder="Instrucciones claras para el instructor…"
                className={`${CLASE_CAMPO} resize-none`} style={CAMPO} />
            </Campo>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Series / repeticiones">
                <input value={form.series_repeticiones ?? ""} onChange={e => setF("series_repeticiones", e.target.value || null)}
                  placeholder="3 series x 10 rep" className={CLASE_CAMPO} style={CAMPO} />
              </Campo>
              <Campo label="Duración (min)">
                <input type="number" min={1} max={90} value={form.duracion_minutos ?? ""}
                  onChange={e => setF("duracion_minutos", e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="10" className={CLASE_CAMPO} style={CAMPO} />
              </Campo>
            </div>

            <Campo label="Progresión">
              <textarea value={form.progresion ?? ""} onChange={e => setF("progresion", e.target.value || null)}
                rows={2} placeholder="Cómo avanzar de nivel…"
                className={`${CLASE_CAMPO} resize-none`} style={CAMPO} />
            </Campo>

            <Campo label="Nota">
              <textarea value={form.nota ?? ""} onChange={e => setF("nota", e.target.value || null)}
                rows={2} placeholder="Observaciones adicionales…"
                className={`${CLASE_CAMPO} resize-none`} style={CAMPO} />
            </Campo>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={form.favorito} onChange={e => setF("favorito", e.target.checked)}
                className="w-4 h-4 rounded" style={{ accentColor: "var(--ui-gold)" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--ui-text-2)" }}>Marcar como favorito</span>
            </label>

            {formError && (
              <p className="text-xs font-semibold px-3 py-2 rounded-lg"
                style={{ background: "var(--ui-bad-bg)", color: "var(--ui-bad)" }}>{formError}</p>
            )}
          </div>

          <div className="px-5 pb-5 pt-4 flex gap-2 sticky bottom-0"
            style={{ background: "var(--ui-card)", borderTop: "1px solid var(--ui-border-soft)" }}>
            <div className="flex-1">
              <BotonPrimario onClick={handleSave} disabled={saving}>
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear ejercicio"}
              </BotonPrimario>
            </div>
            <BotonSecundario onClick={() => setShowEditModal(false)} disabled={saving}>Cancelar</BotonSecundario>
          </div>
        </Modal>
      )}

      {borrarEjercicio && (
        <ModalConfirmar
          titulo="Eliminar ejercicio"
          mensaje={<>Se elimina <strong style={{ color: "var(--ui-bad)" }}>{borrarEjercicio.nombre}</strong> de la biblioteca. Esta acción no se puede deshacer.</>}
          onConfirmar={handleDelete}
          onCancelar={() => setBorrarEjercicio(null)}
        />
      )}

      <Toast msg={toast} />
    </Pagina>
  );
}
