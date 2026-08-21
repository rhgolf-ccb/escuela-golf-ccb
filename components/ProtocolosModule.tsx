"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ClipboardList, ChevronLeft, ImageOff, Pencil, Plus, X } from "lucide-react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { acentoGrupo, colorGrupo } from "@/lib/grupos";
import {
  BotonPrimario, BotonSecundario, CAMPO, EmptyState, Encabezado, Loading, Pagina,
  Panel, TH, thStyle, TONO,
} from "@/components/ui/tema";

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

// El módulo metía los cinco grupos en tres colores propios: Birdies, Águilas y
// Albatros compartían el mismo verde y la lista lateral no distinguía en cuál
// estabas. Ahora cada entrada toma el color real de su grupo, el mismo con el
// que ese grupo se pinta en Alumnos, en Reservas y en Reportes.
function acentoNav(item: NavItem): string {
  return acentoGrupo(item.grupos[0]);
}

function sanitizePath(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function emptyBenchmark(orden: number): Benchmark {
  return { id: null, criterio: "", descripcion_ok: null, descripcion_progreso: null, descripcion_no: null, edad_min: null, edad_max: null, valor_minimo: null, valor_optimo: null, unidad: null, orden };
}

// Genera un Blob recortado respetando las dimensiones reales del recorte (no fuerza cuadrado), con tope de 1200px en el lado mayor
async function getCroppedImg(imageSrc: string, cropPixels: { x: number; y: number; width: number; height: number }): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = imageSrc;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });

  const canvas = document.createElement("canvas");
  const MAX = 1200;
  let w = cropPixels.width;
  let h = cropPixels.height;
  if (Math.max(w, h) > MAX) {
    const scale = MAX / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");

  ctx.drawImage(image, cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height, 0, 0, w, h);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => { if (blob) resolve(blob); else reject(new Error("No se pudo generar la imagen recortada")); },
      "image/jpeg",
      0.9
    );
  });
}

export default function ProtocolosModule() {
  const [activeNav, setActiveNav] = useState<NavItem>(NAV_TECNICO[0]);
  const [mobileNavOpen, setMobileNavOpen] = useState(true);
  const [testsByGrupo, setTestsByGrupo] = useState<Record<string, TestFull[]>>({});
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<TestFull[] | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  // Los fallos de subida salían por alert(), que bloquea la pestaña y tapa el
  // recortador que los provocó.
  const [fotoError, setFotoError] = useState<string | null>(null);

  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropTargetCodigo, setCropTargetCodigo] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropAspect, setCropAspect] = useState<number | undefined>(16 / 9);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

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
      setFotoError(err instanceof Error ? err.message : "Error al subir la foto");
    } finally {
      setUploadingFor(null);
    }
  }

  // Intercepta la selección de archivo: abre el cropper en vez de subir directo
  function handleFileSelected(codigo: string, file: File) {
    setFotoError(null);
    const url = URL.createObjectURL(file);
    setCropTargetCodigo(codigo);
    setCropSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCropAspect(16 / 9);
  }

  async function handleCropConfirm() {
    if (!cropSrc || !croppedAreaPixels || !cropTargetCodigo) return;
    try {
      const blob = await getCroppedImg(cropSrc, croppedAreaPixels);
      const croppedFile = new File([blob], "foto.jpg", { type: "image/jpeg" });
      await uploadFoto(cropTargetCodigo, croppedFile);
    } catch (err) {
      setFotoError(err instanceof Error ? err.message : "Error al recortar la foto");
    } finally {
      URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
      setCropTargetCodigo(null);
    }
  }

  function handleCropCancel() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    setCropTargetCodigo(null);
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

  const acento = acentoNav(activeNav);
  const tonoGrupo = colorGrupo(activeNav.grupos[0]);
  const totalTests = tests.length;
  const showEdad = activeNav.grupos.includes("Competencia");

  function ItemNav({ item }: { item: NavItem }) {
    const active = activeNav.key === item.key;
    const a = acentoNav(item);
    return (
      <button onClick={() => { setActiveNav(item); setMobileNavOpen(false); }}
        className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
        style={active
          ? { background: `color-mix(in srgb, ${a} 16%, transparent)`, color: a, borderLeft: `3px solid ${a}` }
          : { color: "var(--ui-text-2)", borderLeft: "3px solid transparent" }}>
        {item.label}
      </button>
    );
  }

  return (
    <Pagina>
      <Encabezado icono={ClipboardList} titulo="Protocolos" bajada="Tests técnicos y físicos por grupo" />

      <div className="flex flex-col md:flex-row gap-6">
        <nav className={`${mobileNavOpen ? "block" : "hidden md:block"} w-full md:w-[240px] md:shrink-0`}>
          <div className="rounded-xl p-2" style={{ background: "var(--ui-card)", border: "1px solid var(--ui-border-soft)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5 px-2" style={{ color: "var(--ui-text-3)" }}>Técnico</p>
            <div className="space-y-0.5 mb-4">
              {NAV_TECNICO.map((item) => <ItemNav key={item.key} item={item} />)}
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5 px-2" style={{ color: "var(--ui-text-3)" }}>Físico</p>
            <div className="space-y-0.5">
              {NAV_FISICO.map((item) => <ItemNav key={item.key} item={item} />)}
            </div>
          </div>
        </nav>

        <div className={`${mobileNavOpen ? "hidden md:block" : "block"} flex-1 min-w-0`}>
          <button
            onClick={() => setMobileNavOpen(true)}
            className="md:hidden flex items-center gap-1.5 text-sm font-semibold mb-4"
            style={{ color: "var(--ui-text-2)" }}
          >
            <ChevronLeft size={14} />
            Volver a categorías
          </button>

          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-bold" style={{ color: "var(--ui-text)" }}>{activeNav.label}</h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: tonoGrupo.background, color: tonoGrupo.color }}>
                {activeNav.tipo === "tecnico" ? "Técnico" : "Físico"}
              </span>
              <span className="text-xs" style={{ color: "var(--ui-text-3)" }}>
                {totalTests} test{totalTests === 1 ? "" : "s"}
              </span>
              {editing && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "var(--ui-warn-bg)", color: "var(--ui-warn)" }}>
                  Editando — sin guardar
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {editing ? (
                <>
                  <BotonSecundario onClick={cancelEdit} disabled={saving}>Cancelar</BotonSecundario>
                  <BotonPrimario onClick={handleSave} disabled={saving}>
                    {saving ? "Guardando…" : "Guardar"}
                  </BotonPrimario>
                </>
              ) : (
                <BotonSecundario onClick={startEdit}><Pencil size={14} />Editar</BotonSecundario>
              )}
            </div>
          </div>

          {/* Los grupos hermanos comparten contenido y eso no se veía en ningún
              lado: se guardaba y "mágicamente" cambiaba el otro. */}
          {editing && activeNav.grupos.length > 1 && (
            <p className="text-xs mb-3 px-3 py-2 rounded-lg"
              style={{ background: "var(--ui-card-alt)", color: "var(--ui-text-2)" }}>
              Lo que guardes aquí se replica en {activeNav.grupos.join(" y ")}: comparten el mismo protocolo.
            </p>
          )}

          {fotoError && (
            <p className="text-xs font-semibold mb-3 px-3 py-2 rounded-lg"
              style={{ background: "var(--ui-bad-bg)", color: "var(--ui-bad)" }}>{fotoError}</p>
          )}

          {loading ? <Loading /> : totalTests === 0 ? (
            <Panel><EmptyState msg="Sin tests definidos para este grupo" /></Panel>
          ) : (
            <div className="space-y-6">
              {categorias.map((cat) => (
                <div key={cat.label ?? "_"}>
                  {cat.label && (
                    <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: "var(--ui-text-3)" }}>{cat.label}</p>
                  )}
                  <div className="space-y-3">
                    {cat.tests.map((t) => (
                      <TestCard key={t.codigo} test={t} editing={editing} showEdad={showEdad} tipo={activeNav.tipo} acento={acento}
                        uploading={uploadingFor === t.codigo}
                        onChange={(patch) => updateTest(t.codigo, patch)}
                        onBenchmarkChange={(idx, patch) => updateBenchmark(t.codigo, idx, patch)}
                        onAddBenchmark={() => addBenchmark(t.codigo)}
                        onRemoveBenchmark={(idx) => removeBenchmark(t.codigo, idx)}
                        onUploadFoto={(file) => handleFileSelected(t.codigo, file)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {cropSrc && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="tema-oscuro rounded-2xl w-full max-w-lg overflow-hidden"
            style={{ background: "var(--ui-card)", border: "1px solid var(--ui-border)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--ui-border-soft)" }}>
              <h3 className="text-lg font-bold" style={{ color: "var(--ui-text)" }}>Ajustar foto de referencia</h3>
            </div>

            <div className="p-5">
              <div className="flex gap-1.5 mb-3">
                {([
                  { label: "Libre", value: undefined },
                  { label: "Horizontal", value: 16 / 9 },
                  { label: "Cuadrado", value: 1 },
                  { label: "Vertical", value: 3 / 4 },
                ] as { label: string; value: number | undefined }[]).map((opt) => {
                  const active = cropAspect === opt.value;
                  return (
                    <button
                      key={opt.label}
                      onClick={() => setCropAspect(opt.value)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                      style={active
                        ? { background: "var(--ui-gold)", color: "var(--ui-bg)", border: "1px solid var(--ui-gold)" }
                        : { color: "var(--ui-text-2)", border: "1px solid var(--ui-border)" }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <div className="relative w-full rounded-lg overflow-hidden" style={{ height: 320, background: "var(--ui-bg)" }}>
                <Cropper
                  image={cropSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={cropAspect}
                  cropShape="rect"
                  showGrid={true}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>

              <div className="flex items-center gap-3 mt-4">
                <span className="text-xs shrink-0" style={{ color: "var(--ui-text-3)" }}>Zoom</span>
                <input type="range" min={1} max={3} step={0.05} value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full" style={{ accentColor: "var(--ui-gold)" }} />
              </div>

              <div className="flex justify-end gap-2 mt-5">
                <BotonSecundario onClick={handleCropCancel} disabled={uploadingFor !== null}>Cancelar</BotonSecundario>
                <BotonPrimario onClick={handleCropConfirm} disabled={uploadingFor !== null}>
                  {uploadingFor !== null ? "Subiendo…" : "Aplicar"}
                </BotonPrimario>
              </div>
            </div>
          </div>
        </div>
      )}
    </Pagina>
  );
}

// Las tres celdas de criterio (correcto / progreso / incorrecto) tenían cada
// una su verde, su ámbar y su rojo escritos a mano. Son el mismo semáforo del
// resto de la app.
const TONO_CRITERIO = [
  { key: "descripcion_ok" as const,        label: "Correcto",    tono: TONO.ok },
  { key: "descripcion_progreso" as const,  label: "En progreso", tono: TONO.warn },
  { key: "descripcion_no" as const,        label: "Incorrecto",  tono: TONO.bad },
];

const CELDA_EDIT = "w-full rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1";

function TestCard({ test, editing, showEdad, tipo, acento, uploading, onChange, onBenchmarkChange, onAddBenchmark, onRemoveBenchmark, onUploadFoto }: {
  test: TestFull; editing: boolean; showEdad: boolean; tipo: "tecnico" | "fisico"; acento: string; uploading: boolean;
  onChange: (patch: Partial<TestFull>) => void;
  onBenchmarkChange: (idx: number, patch: Partial<Benchmark>) => void;
  onAddBenchmark: () => void;
  onRemoveBenchmark: (idx: number) => void;
  onUploadFoto: (file: File) => void;
}) {
  const showValores = tipo === "fisico";
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: "var(--ui-card)", border: "1px solid var(--ui-border-soft)" }}>
      <div className="px-4 py-3" style={{ background: "var(--ui-card-alt)" }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
            style={{ background: acento, color: "var(--g-on-accent)" }}>{test.codigo}</span>
          {editing ? (
            <input value={test.nombre} onChange={(e) => onChange({ nombre: e.target.value })}
              className="text-sm font-semibold rounded px-2 py-1 flex-1 focus:outline-none focus:ring-1" style={CAMPO} />
          ) : (
            <span className="text-base font-bold" style={{ color: "var(--ui-text)" }}>{test.nombre}</span>
          )}
        </div>
        {editing ? (
          <textarea value={test.descripcion ?? ""} onChange={(e) => onChange({ descripcion: e.target.value || null })}
            rows={2} placeholder="¿Qué evalúa este test?"
            className="w-full text-xs rounded px-2 py-1 mt-1 resize-none focus:outline-none focus:ring-1" style={CAMPO} />
        ) : test.descripcion ? (
          <p className="text-xs mt-1" style={{ color: "var(--ui-text-2)" }}>{test.descripcion}</p>
        ) : null}
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="space-y-2">
          <div className="w-full h-[180px] sm:h-[200px] rounded-lg overflow-hidden flex items-center justify-center"
            style={{ background: "var(--ui-card-alt)" }}>
            {test.foto_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={test.foto_url} alt={test.nombre} loading="lazy" className="w-full h-full object-contain" />
            ) : (
              <ImageOff size={26} style={{ color: "var(--ui-text-3)" }} />
            )}
          </div>
          {editing && (
            <label className="text-xs font-semibold hover:underline cursor-pointer" style={{ color: "var(--ui-gold)" }}>
              {uploading ? "Subiendo…" : test.foto_url ? "Cambiar foto de referencia" : "Subir foto de referencia"}
              <input type="file" accept="image/*" className="hidden" disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadFoto(f); e.target.value = ""; }} />
            </label>
          )}
        </div>

        {editing ? (
          <textarea value={test.instrucciones ?? ""} onChange={(e) => onChange({ instrucciones: e.target.value || null })}
            rows={2} placeholder="Instrucciones de ejecución"
            className="w-full text-xs rounded px-2 py-1 resize-none focus:outline-none focus:ring-1" style={CAMPO} />
        ) : test.instrucciones ? (
          <p className="text-xs italic" style={{ color: "var(--ui-text-2)" }}>{test.instrucciones}</p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={`${TH} text-left py-1.5 px-2`} style={thStyle}>Criterio</th>
                {TONO_CRITERIO.map((c) => (
                  <th key={c.key} className={`${TH} text-left py-1.5 px-2`} style={{ ...thStyle, color: c.tono.fg }}>{c.label}</th>
                ))}
                {showEdad && <th className={`${TH} text-left py-1.5 px-2`} style={thStyle}>Edad</th>}
                {showValores && <th className={`${TH} text-left py-1.5 px-2`} style={thStyle}>Mínimo</th>}
                {showValores && <th className={`${TH} text-left py-1.5 px-2`} style={thStyle}>Óptimo</th>}
                {showValores && <th className={`${TH} text-left py-1.5 px-2`} style={thStyle}>Unidad</th>}
                {editing && <th className="w-6" style={thStyle} />}
              </tr>
            </thead>
            <tbody>
              {test.protocolo_benchmarks.length === 0 && !editing ? (
                <tr>
                  <td colSpan={4 + (showEdad ? 1 : 0) + (showValores ? 3 : 0)}
                    className="py-3 italic text-center" style={{ color: "var(--ui-text-3)" }}>
                    Sin criterios definidos
                  </td>
                </tr>
              ) : test.protocolo_benchmarks.map((b, idx) => (
                <tr key={idx} className="align-top" style={{ borderBottom: "1px solid var(--ui-border-soft)" }}>
                  <td className="py-1.5 px-2">
                    {editing
                      ? <input value={b.criterio} onChange={(e) => onBenchmarkChange(idx, { criterio: e.target.value })} className={CELDA_EDIT} style={CAMPO} />
                      : <span className="font-semibold" style={{ color: "var(--ui-text)" }}>{b.criterio}</span>}
                  </td>
                  {TONO_CRITERIO.map((c) => (
                    <td key={c.key} className="py-1.5 px-2">
                      {editing ? (
                        <input value={b[c.key] ?? ""} onChange={(e) => onBenchmarkChange(idx, { [c.key]: e.target.value || null })}
                          className={CELDA_EDIT} style={CAMPO} />
                      ) : (
                        <div className="rounded px-2 py-1" style={{ background: c.tono.bg, borderLeft: `3px solid ${c.tono.fg}` }}>
                          <span style={{ color: c.tono.fg, fontWeight: 600 }}>{b[c.key] ?? "—"}</span>
                        </div>
                      )}
                    </td>
                  ))}
                  {showEdad && (
                    <td className="py-1.5 px-2">
                      {editing ? (
                        <div className="flex gap-1 items-center">
                          <input type="number" value={b.edad_min ?? ""} onChange={(e) => onBenchmarkChange(idx, { edad_min: e.target.value ? Number(e.target.value) : null })}
                            className="w-12 rounded px-1 py-1 focus:outline-none focus:ring-1" style={CAMPO} placeholder="min" />
                          <span style={{ color: "var(--ui-text-3)" }}>–</span>
                          <input type="number" value={b.edad_max ?? ""} onChange={(e) => onBenchmarkChange(idx, { edad_max: e.target.value ? Number(e.target.value) : null })}
                            className="w-12 rounded px-1 py-1 focus:outline-none focus:ring-1" style={CAMPO} placeholder="max" />
                        </div>
                      ) : (b.edad_min !== null || b.edad_max !== null)
                        ? <span style={{ color: "var(--ui-text-2)" }}>{b.edad_min ?? "—"}–{b.edad_max ?? "—"}</span>
                        : <span style={{ color: "var(--ui-text-3)" }}>—</span>}
                    </td>
                  )}
                  {showValores && (
                    <>
                      <td className="py-1.5 px-2">{editing
                        ? <input value={b.valor_minimo ?? ""} onChange={(e) => onBenchmarkChange(idx, { valor_minimo: e.target.value || null })} className="w-16 rounded px-1.5 py-1 focus:outline-none focus:ring-1" style={CAMPO} />
                        : <span style={{ color: "var(--ui-text-2)" }}>{b.valor_minimo ?? "—"}</span>}</td>
                      <td className="py-1.5 px-2">{editing
                        ? <input value={b.valor_optimo ?? ""} onChange={(e) => onBenchmarkChange(idx, { valor_optimo: e.target.value || null })} className="w-16 rounded px-1.5 py-1 focus:outline-none focus:ring-1" style={CAMPO} />
                        : <span style={{ color: "var(--ui-text-2)" }}>{b.valor_optimo ?? "—"}</span>}</td>
                      <td className="py-1.5 px-2">{editing
                        ? <input value={b.unidad ?? ""} onChange={(e) => onBenchmarkChange(idx, { unidad: e.target.value || null })} className="w-14 rounded px-1.5 py-1 focus:outline-none focus:ring-1" style={CAMPO} />
                        : <span style={{ color: "var(--ui-text-2)" }}>{b.unidad ?? "—"}</span>}</td>
                    </>
                  )}
                  {editing && (
                    <td className="py-1.5">
                      <button onClick={() => onRemoveBenchmark(idx)} title="Eliminar criterio"
                        className="p-1 rounded transition-colors hover:bg-(--ui-bad-bg)" style={{ color: "var(--ui-text-3)" }}>
                        <X size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {editing && (
            <button onClick={onAddBenchmark}
              className="flex items-center gap-1 text-xs font-semibold mt-2 hover:underline"
              style={{ color: "var(--ui-gold)" }}>
              <Plus size={12} />Agregar criterio
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
