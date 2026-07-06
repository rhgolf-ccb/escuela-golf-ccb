"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Benchmark = {
  id: string | null;
  criterio: string;
  descripcion_ok: string | null;
  descripcion_progreso: string | null;
  descripcion_no: string | null;
  edad_min: number | null;
  edad_max: number | null;
  valor_minimo: string | null;
  valor_optimo: string | null;
  unidad: string | null;
  orden: number;
};

type TestFull = {
  id: string;
  grupo: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  instrucciones: string | null;
  foto_url: string | null;
  categoria: string | null;
  orden: number;
  protocolo_benchmarks: Benchmark[];
};

type Tipo = "tecnico" | "fisico";
type GrupoKey = "birdies" | "aguilas" | "albatros" | "competencia" | "damas";

const GRUPO_OPTIONS: { key: GrupoKey; label: string; grupos: string[] }[] = [
  { key: "birdies", label: "Birdies (4–5 años)", grupos: ["Birdies"] },
  { key: "aguilas", label: "Águilas (6–8 años)", grupos: ["Águilas"] },
  { key: "albatros", label: "Albatros · +14", grupos: ["Albatros", "+14"] },
  { key: "competencia", label: "Competencia", grupos: ["Competencia"] },
  { key: "damas", label: "Damas", grupos: ["Damas"] },
];

const GROUP_COLOR: Record<"juvenil" | "competencia" | "damas", { bg: string; text: string }> = {
  juvenil: { bg: "#1a3a2a18", text: "#1a3a2a" },
  competencia: { bg: "#7d5a0018", text: "#7d5a00" },
  damas: { bg: "#4a107018", text: "#4a1070" },
};

function grupoKeyColor(key: GrupoKey): "juvenil" | "competencia" | "damas" {
  if (key === "competencia") return "competencia";
  if (key === "damas") return "damas";
  return "juvenil";
}

function sanitizePath(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function emptyBenchmark(orden: number): Benchmark {
  return { id: null, criterio: "", descripcion_ok: null, descripcion_progreso: null, descripcion_no: null, edad_min: null, edad_max: null, valor_minimo: null, valor_optimo: null, unidad: null, orden };
}

function Loading() {
  return <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-7 w-7 border-2 border-[#1B4D2E] border-t-transparent" /></div>;
}
function EmptyState({ msg }: { msg: string }) {
  return <div className="py-16 text-center text-sm text-gray-400">{msg}</div>;
}

export default function ProtocolosModule() {
  const [activeTipo, setActiveTipo] = useState<Tipo>("tecnico");
  const [activeGrupoKey, setActiveGrupoKey] = useState<GrupoKey>("birdies");
  const [testsByGrupo, setTestsByGrupo] = useState<Record<string, TestFull[]>>({});
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<TestFull[] | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [selectedCodigo, setSelectedCodigo] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeGrupoOption = GRUPO_OPTIONS.find((g) => g.key === activeGrupoKey)!;
  const grupos = activeGrupoOption.grupos;
  const primaryGrupo = grupos[0];

  const load = useCallback(async () => {
    setLoading(true);
    setEditing(false);
    setDraft(null);
    const { data } = await supabase.from("protocolo_tests")
      .select("*, protocolo_benchmarks(*)")
      .in("grupo", grupos).eq("tipo", activeTipo).eq("activo", true).order("orden");
    const rows = (data ?? []) as unknown as TestFull[];
    const byGrupo: Record<string, TestFull[]> = {};
    rows.forEach((row) => {
      const benchmarks = (row.protocolo_benchmarks ?? []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
      (byGrupo[row.grupo] ??= []).push({ ...row, protocolo_benchmarks: benchmarks });
    });
    Object.values(byGrupo).forEach((arr) => arr.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)));
    setTestsByGrupo(byGrupo);
    setLoading(false);
  }, [activeTipo, grupos]);

  useEffect(() => { load(); }, [load]);

  const tests = draft ?? testsByGrupo[primaryGrupo] ?? [];

  const categorias: { label: string | null; tests: TestFull[] }[] = (() => {
    if (activeTipo === "tecnico") return [{ label: null, tests }];
    const order: string[] = [];
    const map = new Map<string, TestFull[]>();
    tests.forEach((t) => {
      const label = t.categoria ?? "General";
      if (!map.has(label)) { map.set(label, []); order.push(label); }
      map.get(label)!.push(t);
    });
    return order.map((label) => ({ label, tests: map.get(label)! }));
  })();

  // Selección de test — se reinicia al cambiar de grupo/tipo (tras recargar
  // datos), pero se conserva mientras se edita o tras guardar si sigue existiendo.
  useEffect(() => {
    const list = testsByGrupo[primaryGrupo] ?? [];
    if (list.length === 0) { setSelectedCodigo(null); return; }
    setSelectedCodigo((prev) => (prev && list.some((t) => t.codigo === prev)) ? prev : list[0].codigo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTipo, activeGrupoKey, testsByGrupo]);

  function selectTest(codigo: string) {
    setSelectedCodigo(codigo);
    setMobileDetailOpen(true);
  }

  function startEdit() {
    setDraft(JSON.parse(JSON.stringify(testsByGrupo[primaryGrupo] ?? [])));
    setEditing(true);
  }
  function cancelEdit() {
    setDraft(null);
    setEditing(false);
  }

  function updateTest(codigo: string, patch: Partial<TestFull>) {
    setDraft((prev) => prev ? prev.map((t) => t.codigo === codigo ? { ...t, ...patch } : t) : prev);
  }
  function updateBenchmark(codigo: string, idx: number, patch: Partial<Benchmark>) {
    setDraft((prev) => prev ? prev.map((t) => t.codigo !== codigo ? t : { ...t, protocolo_benchmarks: t.protocolo_benchmarks.map((b, i) => i === idx ? { ...b, ...patch } : b) }) : prev);
  }
  function addBenchmark(codigo: string) {
    setDraft((prev) => prev ? prev.map((t) => t.codigo !== codigo ? t : { ...t, protocolo_benchmarks: [...t.protocolo_benchmarks, emptyBenchmark(t.protocolo_benchmarks.length)] }) : prev);
  }
  function removeBenchmark(codigo: string, idx: number) {
    setDraft((prev) => prev ? prev.map((t) => t.codigo !== codigo ? t : { ...t, protocolo_benchmarks: t.protocolo_benchmarks.filter((_, i) => i !== idx) }) : prev);
  }

  async function uploadFoto(codigo: string, file: File) {
    setUploadingFor(codigo);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${activeTipo}/${sanitizePath(primaryGrupo)}/${codigo}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("protocolos-fotos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);
      const { data: urlData } = supabase.storage.from("protocolos-fotos").getPublicUrl(path);
      updateTest(codigo, { foto_url: `${urlData.publicUrl}?v=${Date.now()}` });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al subir la foto");
    } finally {
      setUploadingFor(null);
    }
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      for (const t of draft) {
        const original = (testsByGrupo[primaryGrupo] ?? []).find((o) => o.codigo === t.codigo);
        if (!original) continue;
        await supabase.from("protocolo_tests").update({
          nombre: t.nombre, descripcion: t.descripcion, instrucciones: t.instrucciones, foto_url: t.foto_url,
        }).eq("id", original.id);

        const originalIds = new Set(original.protocolo_benchmarks.map((b) => b.id).filter((v): v is string => !!v));
        const draftIds = new Set(t.protocolo_benchmarks.map((b) => b.id).filter((v): v is string => !!v));
        const toDelete = [...originalIds].filter((id) => !draftIds.has(id));
        if (toDelete.length) await supabase.from("protocolo_benchmarks").delete().in("id", toDelete);

        for (let i = 0; i < t.protocolo_benchmarks.length; i++) {
          const b = t.protocolo_benchmarks[i];
          const payload = {
            protocolo_id: original.id, criterio: b.criterio, descripcion_ok: b.descripcion_ok || null,
            descripcion_progreso: b.descripcion_progreso || null, descripcion_no: b.descripcion_no || null,
            edad_min: b.edad_min, edad_max: b.edad_max, valor_minimo: b.valor_minimo || null,
            valor_optimo: b.valor_optimo || null, unidad: b.unidad || null, orden: i,
          };
          if (b.id) await supabase.from("protocolo_benchmarks").update(payload).eq("id", b.id);
          else await supabase.from("protocolo_benchmarks").insert(payload);
        }

        // Grupos "hermanos" (ej. Albatros · +14) mantienen el mismo contenido — se reflejan los mismos cambios.
        for (const mirrorGrupo of grupos.slice(1)) {
          const mirrorTest = (testsByGrupo[mirrorGrupo] ?? []).find((o) => o.codigo === t.codigo);
          if (!mirrorTest) continue;
          await supabase.from("protocolo_tests").update({
            nombre: t.nombre, descripcion: t.descripcion, instrucciones: t.instrucciones, foto_url: t.foto_url,
          }).eq("id", mirrorTest.id);
          const mirrorIds = mirrorTest.protocolo_benchmarks.map((b) => b.id).filter((v): v is string => !!v);
          if (mirrorIds.length) await supabase.from("protocolo_benchmarks").delete().in("id", mirrorIds);
          if (t.protocolo_benchmarks.length) {
            await supabase.from("protocolo_benchmarks").insert(t.protocolo_benchmarks.map((b, i) => ({
              protocolo_id: mirrorTest.id, criterio: b.criterio, descripcion_ok: b.descripcion_ok || null,
              descripcion_progreso: b.descripcion_progreso || null, descripcion_no: b.descripcion_no || null,
              edad_min: b.edad_min, edad_max: b.edad_max, valor_minimo: b.valor_minimo || null,
              valor_optimo: b.valor_optimo || null, unidad: b.unidad || null, orden: i,
            })));
          }
        }
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  const color = GROUP_COLOR[grupoKeyColor(activeGrupoKey)];
  const showEdad = grupos.includes("Competencia");
  const showValores = activeTipo === "fisico";
  const totalTests = tests.length;
  const selectedTest = tests.find((t) => t.codigo === selectedCodigo) ?? null;
  const selectedIndex = selectedTest ? tests.findIndex((t) => t.codigo === selectedTest.codigo) : -1;

  function goPrev() {
    if (selectedIndex > 0) selectTest(tests[selectedIndex - 1].codigo);
  }
  function goNext() {
    if (selectedIndex >= 0 && selectedIndex < tests.length - 1) selectTest(tests[selectedIndex + 1].codigo);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col" style={{ height: "calc(100vh - 64px)" }}>
      <div className="flex items-center gap-2 mb-4 shrink-0">
        {(["tecnico", "fisico"] as Tipo[]).map((t) => (
          <button key={t} onClick={() => setActiveTipo(t)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={activeTipo === t ? { backgroundColor: "#1B4D2E", color: "white" } : { color: "#6b7280", backgroundColor: "#f3f4f6" }}>
            {t === "tecnico" ? "Técnico" : "Físico"}
          </button>
        ))}
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Columna izquierda: grupo + lista de tests (210px fija en desktop) */}
        <div className={`${mobileDetailOpen ? "hidden md:flex" : "flex"} md:w-[210px] w-full shrink-0 flex-col bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden`}>
          <div className="p-3 border-b border-gray-100 shrink-0 space-y-2">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Grupo</label>
            <select value={activeGrupoKey} onChange={(e) => setActiveGrupoKey(e.target.value as GrupoKey)}
              className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#1B4D2E] bg-white">
              {GRUPO_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: color.bg, color: color.text }}>
              {activeGrupoOption.label}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? <Loading /> : totalTests === 0 ? <EmptyState msg="Sin tests definidos." /> : (
              categorias.map((cat) => (
                <div key={cat.label ?? "_"}>
                  {cat.label && <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-3 pt-3 pb-1">{cat.label}</p>}
                  {cat.tests.map((t) => {
                    const isSelected = selectedCodigo === t.codigo;
                    const hasContent = !!(t.descripcion || t.instrucciones || t.protocolo_benchmarks.length);
                    return (
                      <button key={t.codigo} onClick={() => selectTest(t.codigo)}
                        className="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors hover:bg-gray-50"
                        style={isSelected ? { borderLeft: `3px solid ${color.text}`, backgroundColor: "#f0f5f0" } : { borderLeft: "3px solid transparent" }}>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 text-white" style={{ backgroundColor: color.text }}>{t.codigo}</span>
                        <span className="text-sm text-gray-800 flex-1 min-w-0 truncate">{t.nombre}</span>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${hasContent ? "bg-emerald-500" : "bg-gray-300"}`} />
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Columna derecha: detalle del test seleccionado */}
        <div className={`${mobileDetailOpen ? "flex" : "hidden md:flex"} flex-1 flex-col bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden min-w-0`}>
          {loading ? <Loading /> : !selectedTest ? (
            <EmptyState msg="Selecciona un test de la lista." />
          ) : (
            <>
              <div className="px-5 py-4 border-b border-gray-100 shrink-0">
                <button onClick={() => setMobileDetailOpen(false)} className="md:hidden flex items-center gap-1 text-xs text-gray-500 mb-2">
                  ← Volver
                </button>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold px-2 py-1 rounded shrink-0 text-white" style={{ backgroundColor: color.text }}>{selectedTest.codigo}</span>
                    <div>
                      <h2 className="text-base font-semibold text-gray-900">{selectedTest.nombre}</h2>
                      <p className="text-xs text-gray-400">{activeGrupoOption.label} · {activeTipo === "tecnico" ? "Técnico" : "Físico"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {editing ? (
                      <>
                        <button onClick={cancelEdit} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100">Cancelar</button>
                        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1B4D2E" }}>
                          {saving ? "Guardando..." : "Guardar"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={startEdit} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Editar</button>
                        <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFor === selectedTest.codigo}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                          {uploadingFor === selectedTest.codigo ? "Subiendo..." : "Cambiar foto"}
                        </button>
                      </>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f && selectedTest) uploadFoto(selectedTest.codigo, f); e.target.value = ""; }} />
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="flex gap-5 flex-col md:flex-row">
                  <div className="flex-1 min-w-0 space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">¿Qué evalúa este test?</label>
                      {editing ? (
                        <textarea value={selectedTest.descripcion ?? ""} onChange={(e) => updateTest(selectedTest.codigo, { descripcion: e.target.value || null })} rows={3}
                          className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none" />
                      ) : (
                        <p className="text-sm text-gray-700 mt-1">{selectedTest.descripcion || "—"}</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Instrucciones de ejecución</label>
                      {editing ? (
                        <textarea value={selectedTest.instrucciones ?? ""} onChange={(e) => updateTest(selectedTest.codigo, { instrucciones: e.target.value || null })} rows={4}
                          className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none" />
                      ) : (
                        <p className="text-sm text-gray-700 mt-1 italic">{selectedTest.instrucciones || "—"}</p>
                      )}
                    </div>
                  </div>

                  <div className="w-full md:w-[180px] shrink-0">
                    {editing && (
                      <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFor === selectedTest.codigo} className="text-xs text-blue-600 hover:underline mb-2 block disabled:opacity-50">
                        {uploadingFor === selectedTest.codigo ? "Subiendo..." : "Cambiar foto"}
                      </button>
                    )}
                    <div className="w-full h-[140px] rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center">
                      {selectedTest.foto_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={selectedTest.foto_url} alt={selectedTest.nombre} loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-gray-300"><path d="M4 16l4.586-4.586a2 2 0 0 1 2.828 0L16 16m-2-2 1.586-1.586a2 2 0 0 1 2.828 0L20 14M4 4h16v16H4V4z" /></svg>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">{selectedTest.codigo} · {selectedTest.nombre}</p>
                  </div>
                </div>

                <hr className="my-5 border-gray-100" />

                <div className="space-y-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Criterios de evaluación</p>

                  {selectedTest.protocolo_benchmarks.length === 0 && !editing ? (
                    <p className="text-sm text-gray-300 italic">Sin criterios definidos</p>
                  ) : editing ? (
                    <div className="space-y-4">
                      {selectedTest.protocolo_benchmarks.map((b, idx) => (
                        <div key={idx} className="border border-gray-100 rounded-xl p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <input value={b.criterio} onChange={(e) => updateBenchmark(selectedTest.codigo, idx, { criterio: e.target.value })} placeholder="Criterio"
                              className="flex-1 text-sm font-medium border border-gray-200 rounded-lg px-2 py-1.5" />
                            <button onClick={() => removeBenchmark(selectedTest.codigo, idx)} className="text-gray-300 hover:text-red-500 shrink-0" title="Eliminar criterio">
                              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="text-[11px] font-medium text-emerald-700">✓ Correcto</label>
                              <input value={b.descripcion_ok ?? ""} onChange={(e) => updateBenchmark(selectedTest.codigo, idx, { descripcion_ok: e.target.value || null })}
                                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
                            </div>
                            <div>
                              <label className="text-[11px] font-medium text-amber-700">En progreso</label>
                              <input value={b.descripcion_progreso ?? ""} onChange={(e) => updateBenchmark(selectedTest.codigo, idx, { descripcion_progreso: e.target.value || null })}
                                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
                            </div>
                            <div>
                              <label className="text-[11px] font-medium text-red-700">✗ Incorrecto</label>
                              <input value={b.descripcion_no ?? ""} onChange={(e) => updateBenchmark(selectedTest.codigo, idx, { descripcion_no: e.target.value || null })}
                                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
                            </div>
                          </div>
                          {(showEdad || showValores) && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                              {showEdad && (
                                <div className="col-span-2 sm:col-span-1">
                                  <label className="text-[11px] font-medium text-gray-500">Edad</label>
                                  <div className="flex gap-1 items-center mt-0.5">
                                    <input type="number" value={b.edad_min ?? ""} onChange={(e) => updateBenchmark(selectedTest.codigo, idx, { edad_min: e.target.value ? Number(e.target.value) : null })} placeholder="min" className="w-full border border-gray-200 rounded-lg px-2 py-1.5" />
                                    <span className="text-gray-300">–</span>
                                    <input type="number" value={b.edad_max ?? ""} onChange={(e) => updateBenchmark(selectedTest.codigo, idx, { edad_max: e.target.value ? Number(e.target.value) : null })} placeholder="max" className="w-full border border-gray-200 rounded-lg px-2 py-1.5" />
                                  </div>
                                </div>
                              )}
                              {showValores && (
                                <>
                                  <div>
                                    <label className="text-[11px] font-medium text-gray-500">Mínimo</label>
                                    <input value={b.valor_minimo ?? ""} onChange={(e) => updateBenchmark(selectedTest.codigo, idx, { valor_minimo: e.target.value || null })} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-medium text-gray-500">Óptimo</label>
                                    <input value={b.valor_optimo ?? ""} onChange={(e) => updateBenchmark(selectedTest.codigo, idx, { valor_optimo: e.target.value || null })} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-medium text-gray-500">Unidad</label>
                                    <input value={b.unidad ?? ""} onChange={(e) => updateBenchmark(selectedTest.codigo, idx, { unidad: e.target.value || null })} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      <button onClick={() => addBenchmark(selectedTest.codigo)} className="text-xs text-blue-600 hover:underline">+ Agregar criterio</button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {selectedTest.protocolo_benchmarks.map((b, idx) => (
                        <div key={idx}>
                          {selectedTest.protocolo_benchmarks.length > 1 && <p className="text-sm font-medium text-gray-700 mb-2">{b.criterio}</p>}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <CriteriaCard icon="✓" label="Correcto" text={b.descripcion_ok} bg="#f1f8e9" border="#a5d6a7" color="#33691e" />
                            <CriteriaCard icon="~" label="En progreso" text={b.descripcion_progreso} bg="#fff8e1" border="#ffe082" color="#f57f17" />
                            <CriteriaCard icon="✗" label="Incorrecto" text={b.descripcion_no} bg="#ffebee" border="#ffcdd2" color="#c62828" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-5 py-3 border-t border-gray-100 shrink-0 flex items-center justify-between">
                <button onClick={goPrev} disabled={selectedIndex <= 0}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
                  ← Anterior
                </button>
                <span className="text-xs text-gray-400">{selectedIndex + 1} de {tests.length}</span>
                <button onClick={goNext} disabled={selectedIndex < 0 || selectedIndex >= tests.length - 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
                  Siguiente →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CriteriaCard({ icon, label, text, bg, border, color }: { icon: string; label: string; text: string | null; bg: string; border: string; color: string }) {
  return (
    <div className="rounded-xl p-3" style={{ backgroundColor: bg, border: `1px solid ${border}` }}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm font-bold" style={{ color }}>{icon}</span>
        <span className="text-xs font-semibold" style={{ color }}>{label}</span>
      </div>
      <p className="text-sm" style={{ color }}>{text || "—"}</p>
    </div>
  );
}
