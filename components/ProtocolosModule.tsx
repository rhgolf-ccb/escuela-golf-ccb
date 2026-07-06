"use client";

import { useCallback, useEffect, useState } from "react";
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

type NavItem = { key: string; label: string; grupos: string[]; tipo: "tecnico" | "fisico" };

const NAV_TECNICO: NavItem[] = [
  { key: "t-birdies", label: "Birdies", grupos: ["Birdies"], tipo: "tecnico" },
  { key: "t-aguilas", label: "Águilas", grupos: ["Águilas"], tipo: "tecnico" },
  { key: "t-albatros14", label: "Albatros · +14", grupos: ["Albatros", "+14"], tipo: "tecnico" },
  { key: "t-competencia", label: "Competencia", grupos: ["Competencia"], tipo: "tecnico" },
  { key: "t-damas", label: "Damas", grupos: ["Damas"], tipo: "tecnico" },
];

const NAV_FISICO: NavItem[] = [
  { key: "f-birdies", label: "Birdies", grupos: ["Birdies"], tipo: "fisico" },
  { key: "f-aguilas", label: "Águilas", grupos: ["Águilas"], tipo: "fisico" },
  { key: "f-albatros14", label: "Albatros · +14", grupos: ["Albatros", "+14"], tipo: "fisico" },
  { key: "f-competencia", label: "Competencia", grupos: ["Competencia"], tipo: "fisico" },
  { key: "f-damas", label: "Damas", grupos: ["Damas"], tipo: "fisico" },
];

const GROUP_COLOR: Record<"juvenil" | "competencia" | "damas", { bg: string; text: string }> = {
  juvenil: { bg: "#1a3a2a18", text: "#1a3a2a" },
  competencia: { bg: "#7d5a0018", text: "#7d5a00" },
  damas: { bg: "#4a107018", text: "#4a1070" },
};

function navTipoColor(item: NavItem): "juvenil" | "competencia" | "damas" {
  if (item.grupos.includes("Competencia")) return "competencia";
  if (item.grupos.some((g) => g.startsWith("Damas"))) return "damas";
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
  const [activeNav, setActiveNav] = useState<NavItem>(NAV_TECNICO[0]);
  const [testsByGrupo, setTestsByGrupo] = useState<Record<string, TestFull[]>>({});
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<TestFull[] | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setEditing(false);
    setDraft(null);
    const { data } = await supabase.from("protocolo_tests")
      .select("*, protocolo_benchmarks(*)")
      .in("grupo", activeNav.grupos).eq("tipo", activeNav.tipo).eq("activo", true).order("orden");
    const rows = (data ?? []) as unknown as TestFull[];
    const byGrupo: Record<string, TestFull[]> = {};
    rows.forEach((row) => {
      const benchmarks = (row.protocolo_benchmarks ?? []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
      (byGrupo[row.grupo] ??= []).push({ ...row, protocolo_benchmarks: benchmarks });
    });
    Object.values(byGrupo).forEach((arr) => arr.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)));
    setTestsByGrupo(byGrupo);
    setLoading(false);
  }, [activeNav]);

  useEffect(() => { load(); }, [load]);

  const primaryGrupo = activeNav.grupos[0];
  const tests = draft ?? testsByGrupo[primaryGrupo] ?? [];

  const categorias: { label: string | null; tests: TestFull[] }[] = (() => {
    if (activeNav.tipo === "tecnico") return [{ label: null, tests }];
    const order: string[] = [];
    const map = new Map<string, TestFull[]>();
    tests.forEach((t) => {
      const label = t.categoria ?? "General";
      if (!map.has(label)) { map.set(label, []); order.push(label); }
      map.get(label)!.push(t);
    });
    return order.map((label) => ({ label, tests: map.get(label)! }));
  })();

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
      const path = `${activeNav.tipo}/${sanitizePath(primaryGrupo)}/${codigo}.${ext}`;
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
        for (const mirrorGrupo of activeNav.grupos.slice(1)) {
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

  const color = GROUP_COLOR[navTipoColor(activeNav)];
  const totalTests = tests.length;
  const showEdad = activeNav.grupos.includes("Competencia");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex gap-6">
        <nav className="w-[260px] shrink-0">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-2">Técnico</p>
          <div className="space-y-1 mb-6">
            {NAV_TECNICO.map((item) => {
              const active = activeNav.key === item.key;
              const c = GROUP_COLOR[navTipoColor(item)];
              return (
                <button key={item.key} onClick={() => setActiveNav(item)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={active ? { backgroundColor: c.bg, color: c.text, borderLeft: `3px solid ${c.text}` } : { color: "#6b7280", borderLeft: "3px solid transparent" }}>
                  {item.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-2">Físico</p>
          <div className="space-y-1">
            {NAV_FISICO.map((item) => {
              const active = activeNav.key === item.key;
              const c = GROUP_COLOR[navTipoColor(item)];
              return (
                <button key={item.key} onClick={() => setActiveNav(item)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={active ? { backgroundColor: c.bg, color: c.text, borderLeft: `3px solid ${c.text}` } : { color: "#6b7280", borderLeft: "3px solid transparent" }}>
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-gray-900">{activeNav.label}</h1>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: color.bg, color: color.text }}>
                {activeNav.tipo === "tecnico" ? "Técnico" : "Físico"}
              </span>
              <span className="text-xs text-gray-400">{totalTests} tests</span>
            </div>
            <div className="flex gap-2">
              {editing ? (
                <>
                  <button onClick={cancelEdit} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">Cancelar</button>
                  <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1B4D2E" }}>
                    {saving ? "Guardando..." : "Guardar"}
                  </button>
                </>
              ) : (
                <button onClick={startEdit} className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Editar</button>
              )}
            </div>
          </div>

          {loading ? <Loading /> : totalTests === 0 ? <EmptyState msg="Sin tests definidos para este grupo." /> : (
            <div className="space-y-6">
              {categorias.map((cat) => (
                <div key={cat.label ?? "_"}>
                  {cat.label && <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">{cat.label}</p>}
                  <div className="space-y-3">
                    {cat.tests.map((t) => (
                      <TestCard key={t.codigo} test={t} editing={editing} showEdad={showEdad} tipo={activeNav.tipo} color={color}
                        uploading={uploadingFor === t.codigo}
                        onChange={(patch) => updateTest(t.codigo, patch)}
                        onBenchmarkChange={(idx, patch) => updateBenchmark(t.codigo, idx, patch)}
                        onAddBenchmark={() => addBenchmark(t.codigo)}
                        onRemoveBenchmark={(idx) => removeBenchmark(t.codigo, idx)}
                        onUploadFoto={(file) => uploadFoto(t.codigo, file)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TestCard({ test, editing, showEdad, tipo, color, uploading, onChange, onBenchmarkChange, onAddBenchmark, onRemoveBenchmark, onUploadFoto }: {
  test: TestFull; editing: boolean; showEdad: boolean; tipo: "tecnico" | "fisico"; color: { bg: string; text: string }; uploading: boolean;
  onChange: (patch: Partial<TestFull>) => void;
  onBenchmarkChange: (idx: number, patch: Partial<Benchmark>) => void;
  onAddBenchmark: () => void;
  onRemoveBenchmark: (idx: number) => void;
  onUploadFoto: (file: File) => void;
}) {
  const showValores = tipo === "fisico";
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden bg-white">
      <div className="px-4 py-3 bg-gray-50">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 text-white" style={{ backgroundColor: color.text }}>{test.codigo}</span>
          {editing ? (
            <input value={test.nombre} onChange={(e) => onChange({ nombre: e.target.value })} className="text-sm font-medium text-gray-800 border border-gray-200 rounded px-2 py-1 flex-1" />
          ) : (
            <span className="text-base font-semibold text-gray-800">{test.nombre}</span>
          )}
        </div>
        {editing ? (
          <textarea value={test.descripcion ?? ""} onChange={(e) => onChange({ descripcion: e.target.value || null })} rows={2} placeholder="¿Qué evalúa este test?" className="w-full text-xs border border-gray-200 rounded px-2 py-1 mt-1 resize-none bg-white" />
        ) : test.descripcion ? (
          <p className="text-xs text-gray-500 mt-1">{test.descripcion}</p>
        ) : null}
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="flex gap-3 items-start">
          <div className="w-20 h-20 rounded-lg bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
            {test.foto_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={test.foto_url} alt={test.nombre} loading="lazy" className="w-full h-full object-cover" />
            ) : (
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-gray-300"><path d="M4 16l4.586-4.586a2 2 0 0 1 2.828 0L16 16m-2-2 1.586-1.586a2 2 0 0 1 2.828 0L20 14M4 4h16v16H4V4z" /></svg>
            )}
          </div>
          {editing && (
            <label className="text-xs text-blue-600 hover:underline cursor-pointer mt-2">
              {uploading ? "Subiendo..." : "Subir foto de referencia"}
              <input type="file" accept="image/*" className="hidden" disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadFoto(f); e.target.value = ""; }} />
            </label>
          )}
        </div>

        {editing ? (
          <textarea value={test.instrucciones ?? ""} onChange={(e) => onChange({ instrucciones: e.target.value || null })} rows={2} placeholder="Instrucciones de ejecución" className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-none" />
        ) : test.instrucciones ? (
          <p className="text-xs text-gray-500 italic">{test.instrucciones}</p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="py-1 pr-2 font-medium">Criterio</th>
                <th className="py-1 pr-2 font-medium">✓ Correcto</th>
                <th className="py-1 pr-2 font-medium">Progreso</th>
                <th className="py-1 pr-2 font-medium">✗ Incorrecto</th>
                {showEdad && <th className="py-1 pr-2 font-medium">Edad</th>}
                {showValores && <th className="py-1 pr-2 font-medium">Mínimo</th>}
                {showValores && <th className="py-1 pr-2 font-medium">Óptimo</th>}
                {showValores && <th className="py-1 pr-2 font-medium">Unidad</th>}
                {editing && <th className="py-1 w-6" />}
              </tr>
            </thead>
            <tbody>
              {test.protocolo_benchmarks.length === 0 && !editing ? (
                <tr><td colSpan={4 + (showEdad ? 1 : 0) + (showValores ? 3 : 0)} className="py-2 text-gray-300 italic">Sin criterios definidos</td></tr>
              ) : test.protocolo_benchmarks.map((b, idx) => (
                <tr key={idx} className="border-b border-gray-50 last:border-0 align-top">
                  <td className="py-1.5 pr-2">
                    {editing ? <input value={b.criterio} onChange={(e) => onBenchmarkChange(idx, { criterio: e.target.value })} className="w-full border border-gray-200 rounded px-1.5 py-1" /> : <span className="text-gray-700">{b.criterio}</span>}
                  </td>
                  <td className="py-1.5 pr-2">
                    {editing ? <input value={b.descripcion_ok ?? ""} onChange={(e) => onBenchmarkChange(idx, { descripcion_ok: e.target.value || null })} className="w-full border border-gray-200 rounded px-1.5 py-1" /> : (
                      <div className="rounded px-2 py-1" style={{ backgroundColor: "#f1f8e9", borderLeft: "3px solid #2e7d32" }}>
                        <span style={{ color: "#2e7d32", fontWeight: 600 }}>{b.descripcion_ok ?? "—"}</span>
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    {editing ? <input value={b.descripcion_progreso ?? ""} onChange={(e) => onBenchmarkChange(idx, { descripcion_progreso: e.target.value || null })} className="w-full border border-gray-200 rounded px-1.5 py-1" /> : (
                      <div className="rounded px-2 py-1" style={{ backgroundColor: "#fff8e1", borderLeft: "3px solid #f57f17" }}>
                        <span style={{ color: "#f57f17", fontWeight: 600 }}>{b.descripcion_progreso ?? "—"}</span>
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    {editing ? <input value={b.descripcion_no ?? ""} onChange={(e) => onBenchmarkChange(idx, { descripcion_no: e.target.value || null })} className="w-full border border-gray-200 rounded px-1.5 py-1" /> : (
                      <div className="rounded px-2 py-1" style={{ backgroundColor: "#ffebee", borderLeft: "3px solid #c62828" }}>
                        <span style={{ color: "#c62828", fontWeight: 600 }}>{b.descripcion_no ?? "—"}</span>
                      </div>
                    )}
                  </td>
                  {showEdad && (
                    <td className="py-1.5 pr-2">
                      {editing ? (
                        <div className="flex gap-1 items-center">
                          <input type="number" value={b.edad_min ?? ""} onChange={(e) => onBenchmarkChange(idx, { edad_min: e.target.value ? Number(e.target.value) : null })} className="w-12 border border-gray-200 rounded px-1 py-1" placeholder="min" />
                          <span className="text-gray-300">–</span>
                          <input type="number" value={b.edad_max ?? ""} onChange={(e) => onBenchmarkChange(idx, { edad_max: e.target.value ? Number(e.target.value) : null })} className="w-12 border border-gray-200 rounded px-1 py-1" placeholder="max" />
                        </div>
                      ) : (b.edad_min !== null || b.edad_max !== null) ? <span className="text-gray-600">{b.edad_min ?? "—"}–{b.edad_max ?? "—"}</span> : <span className="text-gray-300">—</span>}
                    </td>
                  )}
                  {showValores && (
                    <>
                      <td className="py-1.5 pr-2">{editing ? <input value={b.valor_minimo ?? ""} onChange={(e) => onBenchmarkChange(idx, { valor_minimo: e.target.value || null })} className="w-16 border border-gray-200 rounded px-1.5 py-1" /> : <span className="text-gray-600">{b.valor_minimo ?? "—"}</span>}</td>
                      <td className="py-1.5 pr-2">{editing ? <input value={b.valor_optimo ?? ""} onChange={(e) => onBenchmarkChange(idx, { valor_optimo: e.target.value || null })} className="w-16 border border-gray-200 rounded px-1.5 py-1" /> : <span className="text-gray-600">{b.valor_optimo ?? "—"}</span>}</td>
                      <td className="py-1.5 pr-2">{editing ? <input value={b.unidad ?? ""} onChange={(e) => onBenchmarkChange(idx, { unidad: e.target.value || null })} className="w-14 border border-gray-200 rounded px-1.5 py-1" /> : <span className="text-gray-600">{b.unidad ?? "—"}</span>}</td>
                    </>
                  )}
                  {editing && (
                    <td className="py-1.5">
                      <button onClick={() => onRemoveBenchmark(idx)} className="text-gray-300 hover:text-red-500" title="Eliminar criterio">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {editing && (
            <button onClick={onAddBenchmark} className="text-xs text-blue-600 hover:underline mt-2">+ Agregar criterio</button>
          )}
        </div>
      </div>
    </div>
  );
}
