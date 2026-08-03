"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DiaSemana, HorarioDefecto, SesionSemana, TipoPlan } from "@/components/ProgramacionModule";
import { DIAS_POR_TIPO, TIPO_PLAN_LABEL, getFechaForDia } from "@/components/ProgramacionModule";
import type { EstacionLibraryPick } from "@/components/EstacionLibraryPicker";
import { GROUP_CONFIGS, gruposParaDrills, gruposParaFisico, categoriaOptionForCanonical, retosSugeridos, CAMPO_GAMES } from "./group-configs";
import type { DiaWizardState } from "./types";
import { nuevaEstacion, diaCompleto, diaFaltantes } from "./types";
import { computeSessionDuration, allocateStationMinutes, defaultStationCount, defaultCategoriasForDia, suggestLugar } from "@/lib/planning-defaults";
import { SUBGRUPO_LABEL, type SubgrupoJuvenil } from "@/lib/estacion-library-constants";
import EstacionEditor from "./EstacionEditor";
import CalentamientoStep from "./CalentamientoStep";
import EspecialDiaPicker from "./EspecialDiaPicker";
import { buildJuvenilRow, buildCompetenciaRow, buildDamasRow } from "./save-builders";
import { parseExistingToDiaState } from "./parse-existing";

interface Props {
  tipoPlan: TipoPlan;
  semana: Date;
  planId: string;
  horariosDefecto: HorarioDefecto[];
  sesionesExistentes: SesionSemana[];
  singleDay?: DiaSemana;
  onClose: () => void;
  onSaved: () => void;
}

function slotsPara(horariosDefecto: HorarioDefecto[], tipoPlan: TipoPlan, dia: DiaSemana) {
  return horariosDefecto
    .filter((h) => h.tipo_plan === tipoPlan && h.dia_semana === dia)
    .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
}

export default function WeekWizardModal({ tipoPlan, semana, planId, horariosDefecto, sesionesExistentes, singleDay, onClose, onSaved }: Props) {
  const config = GROUP_CONFIGS[tipoPlan];
  // Competencia: 1 o 2 estaciones (físico + técnica, o dos técnicas; putt/campo = 1).
  // Juvenil/Damas hasta 4.
  const conteos = tipoPlan === "competencia" ? [1, 2] : [1, 2, 3, 4];
  const dias = useMemo(() => (singleDay ? [singleDay] : DIAS_POR_TIPO[tipoPlan]), [singleDay, tipoPlan]);

  function initDia(dia: DiaSemana, nEstaciones: number): DiaWizardState {
    const slots = slotsPara(horariosDefecto, tipoPlan, dia);
    const horaInicio = slots[0]?.hora_inicio?.slice(0, 5) ?? "";
    const horaFin = slots[0]?.hora_fin?.slice(0, 5) ?? "";
    const canonicos = defaultCategoriasForDia(tipoPlan, dia);
    while (canonicos.length < nEstaciones) canonicos.push("trabajo_fisico");
    const estaciones = canonicos.slice(0, nEstaciones).map((canonico) => {
      const opt = categoriaOptionForCanonical(config, canonico);
      return nuevaEstacion(opt.value, suggestLugar(opt.canonical));
    });
    return { tipo: "normal", calentamiento: null, estaciones, horaInicio, horaFin };
  }

  function sesionExistenteFor(dia: DiaSemana): SesionSemana | undefined {
    return sesionesExistentes.find((s) => s.dia_semana === dia);
  }

  const [estacionesPorDia, setEstacionesPorDia] = useState(defaultStationCount(tipoPlan));
  const [step, setStep] = useState<"count" | "dias">(singleDay ? "dias" : "count");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [diasState, setDiasState] = useState<Record<string, DiaWizardState>>(() => {
    const init: Record<string, DiaWizardState> = {};
    for (const dia of dias) {
      const existente = sesionExistenteFor(dia);
      const parsed = existente ? parseExistingToDiaState(tipoPlan, config, existente) : null;
      init[dia] = parsed ?? initDia(dia, estacionesPorDia);
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [profesores, setProfesores] = useState<string[]>([]);
  // Días ya guardados en la base — para marcarlos con ✓ y poder parar/retomar.
  const [guardados, setGuardados] = useState<Set<string>>(() => new Set(sesionesExistentes.map((s) => s.dia_semana)));

  useEffect(() => {
    supabase
      .from("staff_directorio")
      .select("nombre, categoria, orden")
      .eq("activo", true)
      .then(({ data }) => {
        const rows = (data ?? []) as { nombre: string; categoria: string | null; orden: number | null }[];
        const nombres = rows
          .filter((r) => r.nombre && r.categoria !== "administrativos")
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
          .map((r) => r.nombre);
        setProfesores(nombres);
      });
  }, []);

  const diaActualKey = dias[currentIndex];
  const diaActual = diasState[diaActualKey];

  // Títulos ya usados en cualquier estación/calentamiento de la semana — evita
  // repetir el mismo drill/ejercicio dos veces en los mismos días.
  const titulosUsadosSemana = useMemo(() => {
    const set = new Set<string>();
    for (const dia of Object.values(diasState)) {
      for (const est of dia.estaciones) for (const it of est.items) set.add(it.titulo);
      for (const it of dia.calentamiento?.ejercicios ?? []) set.add(it.titulo);
    }
    return set;
  }, [diasState]);

  function updateDia(next: DiaWizardState) {
    setDiasState((prev) => ({ ...prev, [diaActualKey]: next }));
  }

  function handleChooseCount(n: number) {
    setEstacionesPorDia(n);
    setDiasState((prev) => {
      const next = { ...prev };
      for (const dia of dias) {
        const existente = sesionExistenteFor(dia);
        const parsed = existente ? parseExistingToDiaState(tipoPlan, config, existente) : null;
        next[dia] = parsed ?? initDia(dia, n);
      }
      return next;
    });
    setStep("dias");
  }

  function copiarDiaAnterior() {
    if (currentIndex === 0) return;
    const anterior = diasState[dias[currentIndex - 1]];
    updateDia({ ...anterior, horaInicio: diaActual.horaInicio, horaFin: diaActual.horaFin });
  }

  async function sugerirSemana() {
    setSugiriendo(true);
    const usados = new Set<string>();
    const next: Record<string, DiaWizardState> = {};
    for (const dia of dias) {
      const base = initDia(dia, estacionesPorDia);
      const gFisico = gruposParaFisico(tipoPlan);
      const { data: calData } = await supabase
        .from("ejercicios_fisicos").select("id, nombre, instrucciones, series_repeticiones")
        .eq("categoria", "Calentamiento").overlaps("grupos", gFisico).order("nombre").limit(2);
      const calentamiento = calData && calData.length > 0
        ? { ejercicios: calData.map((e) => ({ id: e.id, titulo: e.nombre, descripcion: e.instrucciones ?? "", series_repeticiones: e.series_repeticiones })), duracionMin: 8 }
        : null;

      const estaciones = [];
      for (const est of base.estaciones) {
        const opt = config.categorias.find((c) => c.value === est.categoria)!;
        let item: EstacionLibraryPick | null = null;
        if (opt.drillsCategoria) {
          const { data } = await supabase.from("drills")
            .select("id, titulo, descripcion, rating")
            .eq("categoria", opt.drillsCategoria).eq("aprobado", true)
            .order("rating", { ascending: false }).limit(10);
          const candidato = (data ?? []).find((d) => !usados.has(d.titulo));
          if (candidato) item = { id: candidato.id, titulo: candidato.titulo, descripcion: candidato.descripcion, series_repeticiones: null };
        } else {
          const { data } = await supabase.from("ejercicios_fisicos")
            .select("id, nombre, instrucciones, series_repeticiones")
            .neq("categoria", "Calentamiento").overlaps("grupos", gFisico)
            .order("nombre").limit(10);
          const candidato = (data ?? []).find((d) => !usados.has(d.nombre));
          if (candidato) item = { id: candidato.id, titulo: candidato.nombre, descripcion: candidato.instrucciones ?? "", series_repeticiones: candidato.series_repeticiones };
        }
        if (item) usados.add(item.titulo);
        estaciones.push({ ...est, items: item ? [item] : [], desafio: item ? "Reto de cierre — a definir" : "" });
      }
      next[dia] = { ...base, calentamiento, estaciones };
    }
    setDiasState(next);
    setSugiriendo(false);
    setStep("dias");
    setCurrentIndex(0);
  }

  function rowsForDia(dia: DiaSemana, diaState: DiaWizardState): Record<string, unknown>[] {
    const slots = slotsPara(horariosDefecto, tipoPlan, dia);
    const fecha = getFechaForDia(semana, dia);
    const slotList = slots.length > 0 ? slots : (diaState.horaInicio && diaState.horaFin ? [{ hora_inicio: diaState.horaInicio, hora_fin: diaState.horaFin }] : []);
    if (slotList.length === 0) throw new Error(`No hay horario por defecto para ${dia}; defínelo en horarios_defecto.`);
    return slotList.map((slot) => {
      const base = { plan_id: planId, dia_semana: dia, fecha, hora_inicio: slot.hora_inicio.slice(0, 5), hora_fin: slot.hora_fin.slice(0, 5) };
      return tipoPlan === "juvenil" ? buildJuvenilRow(base, diaState, config)
        : tipoPlan === "competencia" ? buildCompetenciaRow(base, diaState, config)
        : buildDamasRow(base, diaState, config);
    });
  }

  // Guarda un solo día de inmediato — así "Siguiente día" no deja el trabajo
  // solo en memoria: si el profe cierra el wizard a mitad de semana para
  // terminarla después, los días ya recorridos quedan guardados.
  async function guardarDia(dia: DiaSemana): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const rows = rowsForDia(dia, diasState[dia]);
      const { error: e } = await supabase.from("sesiones_semana").upsert(rows, { onConflict: "plan_id,fecha,hora_inicio" });
      if (e) throw new Error(e.message);
      setGuardados((prev) => new Set(prev).add(dia));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Navegación pura entre días — NO guarda. Así puedes saltar al día que quieras
  // (o revisar la semana sugerida) sin que se programen días que no querías.
  function handleSiguienteDia() { setCurrentIndex((i) => Math.min(i + 1, dias.length - 1)); }
  function handleDiaAnterior() { setCurrentIndex((i) => Math.max(i - 1, 0)); }

  // Guarda SOLO el día actual y se queda ahí — para armar día a día y poder parar.
  async function guardarDiaActual() { await guardarDia(diaActualKey); }

  // Guarda TODOS los días completos (no solo el actual) y cierra. Así, si armaste
  // varios días navegando con las flechas y cierras acá, no se pierde ninguno.
  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const diasAGuardar = dias.filter((d) => diasState[d] && diaCompleto(diasState[d]));
      if (diaActual && diaCompleto(diaActual) && !diasAGuardar.includes(diaActualKey)) diasAGuardar.push(diaActualKey);
      if (diasAGuardar.length === 0) { setError("No hay ningún día completo para guardar."); return; }
      const rows = diasAGuardar.flatMap((d) => rowsForDia(d, diasState[d]));
      const { error: e } = await supabase.from("sesiones_semana").upsert(rows, { onConflict: "plan_id,fecha,hora_inicio" });
      if (e) throw new Error(e.message);
      setGuardados((prev) => { const n = new Set(prev); diasAGuardar.forEach((d) => n.add(d)); return n; });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const duracionTotal = diaActual ? computeSessionDuration(diaActual.horaInicio || "00:00", diaActual.horaFin || "00:00") : 0;
  const minutosPorEstacion = diaActual ? allocateStationMinutes(duracionTotal, diaActual.calentamiento?.duracionMin ?? 0, diaActual.estaciones.length || 1) : 0;
  const esUltimoDia = currentIndex === dias.length - 1;
  const puedeAvanzar = diaActual ? diaCompleto(diaActual) : false;
  const faltantes = diaActual ? diaFaltantes(diaActual) : [];
  const diasCompletos = dias.filter((d) => diasState[d] && diaCompleto(diasState[d])).length;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => { if (!saving) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10" style={{ borderTopColor: config.color }}>
          <div>
            <h2 className="font-bold text-gray-900 text-sm">{TIPO_PLAN_LABEL[tipoPlan]} — Armar programación</h2>
            {step === "dias" && diaActual && (
              <p className="text-xs text-gray-400 mt-0.5">
                Día {currentIndex + 1} de {dias.length} · {diaActualKey} · {diaActual.horaInicio}-{diaActual.horaFin}
                {diaActual.tipo === "normal" && ` · ${duracionTotal} min totales`}
              </p>
            )}
          </div>
          <button onClick={() => { if (!saving) onClose(); }} disabled={saving} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {step === "dias" && diaActual && !singleDay && (
          <div className="px-4 pt-3 pb-3 flex gap-1.5 flex-wrap border-b border-gray-50">
            {dias.map((d, i) => {
              const active = i === currentIndex;
              const saved = guardados.has(d);
              return (
                <button
                  key={d}
                  onClick={() => setCurrentIndex(i)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border capitalize flex items-center gap-1 transition-all"
                  style={active ? { background: config.color, color: "#fff", borderColor: config.color } : { background: "#f9fafb", color: "#374151", borderColor: "#e5e7eb" }}
                >
                  {saved && <span>✓</span>}{d}
                </button>
              );
            })}
          </div>
        )}

        {step === "count" && (
          <div className="p-5 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">¿Cuántas estaciones por día?</p>
            <div className={`grid gap-2 ${conteos.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
              {conteos.map((n) => (
                <button key={n} onClick={() => handleChooseCount(n)}
                  className="flex flex-col items-center justify-center py-4 rounded-xl border-2 border-gray-200 hover:border-green-400 hover:bg-green-50 transition-all font-bold text-lg text-gray-800">
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">Aplica a toda la semana — se puede ajustar por día más adelante.</p>
            <button
              onClick={sugerirSemana}
              disabled={sugiriendo}
              className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: config.color }}
            >
              {sugiriendo ? "Armando semana sugerida..." : "✨ Sugerir semana completa"}
            </button>
          </div>
        )}

        {step === "dias" && diaActual && (
          <>
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {tipoPlan === "juvenil" && (
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Subgrupo (opcional)</label>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => updateDia({ ...diaActual, subgrupo: undefined })}
                      className="px-2.5 py-1 rounded-full text-xs font-semibold border"
                      style={!diaActual.subgrupo ? { background: config.color, color: "#fff", borderColor: config.color } : { background: "#f9fafb", color: "#374151", borderColor: "#e5e7eb" }}>
                      Todas las edades
                    </button>
                    {(["birdies", "aguilas", "albatros", "+14"] as SubgrupoJuvenil[]).map((sg) => (
                      <button key={sg} onClick={() => updateDia({ ...diaActual, subgrupo: sg })}
                        className="px-2.5 py-1 rounded-full text-xs font-semibold border"
                        style={diaActual.subgrupo === sg ? { background: config.color, color: "#fff", borderColor: config.color } : { background: "#f9fafb", color: "#374151", borderColor: "#e5e7eb" }}>
                        {SUBGRUPO_LABEL[sg]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateDia({ ...diaActual, tipo: diaActual.tipo === "normal" ? "especial" : "normal" })}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 underline"
                >
                  {diaActual.tipo === "normal" ? "Convertir en día especial" : "Volver a estaciones normales"}
                </button>
                {currentIndex > 0 && diaActual.tipo === "normal" && (
                  <button onClick={copiarDiaAnterior} className="text-xs font-medium text-blue-700 hover:text-blue-900 ml-auto">
                    Copiar del día anterior
                  </button>
                )}
              </div>

              {diaActual.tipo === "especial" ? (
                <EspecialDiaPicker
                  opciones={config.especiales}
                  valor={diaActual.especial}
                  notas={diaActual.especialNotas}
                  color={config.color}
                  juegosCampo={tipoPlan === "competencia" ? CAMPO_GAMES : undefined}
                  juegosSeleccionados={diaActual.especialJuegos ?? []}
                  onChangeValor={(v) => updateDia({ ...diaActual, especial: v })}
                  onChangeNotas={(n) => updateDia({ ...diaActual, especialNotas: n })}
                  onChangeJuegos={(g) => updateDia({ ...diaActual, especialJuegos: g })}
                />
              ) : (
                <>
                  <CalentamientoStep
                    calentamiento={diaActual.calentamiento}
                    gruposFisico={gruposParaFisico(tipoPlan, diaActual.subgrupo)}
                    usadosEnOtrasPartes={[...titulosUsadosSemana]}
                    onChange={(c) => updateDia({ ...diaActual, calentamiento: c })}
                  />

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Estaciones del día</span>
                    <div className="flex gap-1.5">
                      {conteos.map((n) => {
                        const active = diaActual.estaciones.length === n;
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() => {
                              const cur = diaActual.estaciones;
                              if (n === cur.length) return;
                              if (n < cur.length) {
                                updateDia({ ...diaActual, estaciones: cur.slice(0, n) });
                                return;
                              }
                              const estaciones = [...cur];
                              while (estaciones.length < n) {
                                const opt = config.categorias.find((c) => !estaciones.some((e) => e.categoria === c.value)) ?? config.categorias[0];
                                estaciones.push(nuevaEstacion(opt.value, suggestLugar(opt.canonical)));
                              }
                              updateDia({ ...diaActual, estaciones });
                            }}
                            className="w-8 h-8 rounded-lg text-sm font-bold border transition-all"
                            style={active ? { background: config.color, color: "#fff", borderColor: config.color } : { background: "#f9fafb", color: "#374151", borderColor: "#e5e7eb" }}
                          >
                            {n}
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-[11px] text-gray-400">1 = clase completa de un solo tema</span>
                  </div>

                  {diaActual.estaciones.length > 0 && (
                    <p className="text-xs text-gray-400">~{minutosPorEstacion} min sugeridos por estación</p>
                  )}

                  {diaActual.estaciones.map((est, idx) => {
                    const disponiblesParaEsta = config.categorias.filter(
                      (c) => c.value === est.categoria || !diaActual.estaciones.some((e, i) => i !== idx && e.categoria === c.value)
                    );
                    return (
                      <EstacionEditor
                        key={idx}
                        index={idx}
                        estacion={est}
                        categoriaOptions={disponiblesParaEsta}
                        grupos={gruposParaDrills(tipoPlan, diaActual.subgrupo)}
                        gruposFisico={gruposParaFisico(tipoPlan, diaActual.subgrupo)}
                        usadosEnOtrasPartes={[...titulosUsadosSemana].filter((t) => !est.items.some((i) => i.titulo === t))}
                        retosSugeridos={retosSugeridos(tipoPlan, est.categoria, est.foco)}
                        permiteTransferencia={tipoPlan === "competencia"}
                        profesores={profesores}
                        onChange={(next) => {
                          const estaciones = diaActual.estaciones.map((e, i) => (i === idx ? next : e));
                          updateDia({ ...diaActual, estaciones });
                        }}
                      />
                    );
                  })}

                  <div className="flex items-center gap-2">
                    {diaActual.estaciones.length < conteos[conteos.length - 1] && (
                      <button
                        onClick={() => {
                          const opt = config.categorias.find((c) => !diaActual.estaciones.some((e) => e.categoria === c.value)) ?? config.categorias[0];
                          updateDia({ ...diaActual, estaciones: [...diaActual.estaciones, nuevaEstacion(opt.value, suggestLugar(opt.canonical))] });
                        }}
                        className="text-xs font-medium text-blue-700 hover:text-blue-900"
                      >
                        + Agregar estación
                      </button>
                    )}
                    {diaActual.estaciones.length > 1 && (
                      <button
                        onClick={() => updateDia({ ...diaActual, estaciones: diaActual.estaciones.slice(0, -1) })}
                        className="text-xs font-medium text-gray-400 hover:text-red-500"
                      >
                        Quitar última
                      </button>
                    )}
                  </div>
                </>
              )}

              {error && <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}
            </div>

            {!puedeAvanzar && faltantes.length > 0 && (
              <div className="mx-5 mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 space-y-0.5">
                <p className="font-semibold">Falta para continuar:</p>
                {faltantes.map((f, i) => <p key={i}>· {f}</p>)}
              </div>
            )}

            <div className="px-5 pb-5 pt-3 flex items-center gap-2 border-t border-gray-100">
              {!singleDay && (
                <>
                  <button onClick={handleDiaAnterior} disabled={currentIndex === 0}
                    className="px-3 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30" title="Día anterior">←</button>
                  <button onClick={handleSiguienteDia} disabled={esUltimoDia}
                    className="px-3 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30" title="Siguiente día">→</button>
                  <button onClick={guardarDiaActual} disabled={!puedeAvanzar || saving}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 disabled:opacity-40"
                    style={{ borderColor: config.color, color: config.color }}>
                    {saving ? "Guardando..." : guardados.has(diaActualKey) ? "✓ Guardado — actualizar" : "Guardar día"}
                  </button>
                </>
              )}
              <button onClick={handleSave} disabled={(singleDay ? !puedeAvanzar : diasCompletos === 0) || saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: config.color }}>
                {saving ? "Guardando..." : singleDay ? "✓ Guardar" : `Guardar todo y cerrar${diasCompletos > 1 ? ` (${diasCompletos} días)` : ""}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
