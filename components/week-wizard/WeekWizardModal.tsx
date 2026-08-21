"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DiaSemana, DiaSinEscuela, HorarioDefecto, SesionSemana, TipoPlan } from "@/components/ProgramacionModule";
import { DIAS_POR_TIPO, DIA_LABEL, TIPO_PLAN_LABEL, descripcionDiaSinEscuela, fechaEnRango, getFechaForDia, usaSesionJuvenil } from "@/components/ProgramacionModule";
import type { EstacionLibraryPick } from "@/components/EstacionLibraryPicker";
import { GROUP_CONFIGS, gruposParaDrills, gruposParaFisico, drillSirveAlGrupo, filtroDrillsEstricto, materialesPara, categoriaOptionForCanonical, retosSugeridos, CAMPO_GAMES, SUBGRUPOS_JUVENIL } from "./group-configs";
import type { DiaWizardState } from "./types";
import { nuevaEstacion, diaCompleto, diaFaltantes, diaAdvertencias } from "./types";
import { computeSessionDuration, allocateStationMinutes, defaultStationCount, defaultCategoriasForDia, suggestLugar } from "@/lib/planning-defaults";
import { SUBGRUPO_LABEL } from "@/lib/estacion-library-constants";
import EstacionEditor from "./EstacionEditor";
import CalentamientoStep from "./CalentamientoStep";
import EspecialDiaPicker from "./EspecialDiaPicker";
import { buildJuvenilRow, buildCompetenciaRow, buildDamasRow, descartarFilasSinEscuela } from "./save-builders";
import { motivoFechaNoValida } from "@/components/MoverSesionModal";
import { parseExistingToDiaState } from "./parse-existing";

interface Props {
  tipoPlan: TipoPlan;
  semana: Date;
  planId: string;
  horariosDefecto: HorarioDefecto[];
  sesionesExistentes: SesionSemana[];
  // Filas de dias_sin_escuela que puedan tocar esta semana. La regla del club
  // (lunes festivo → martes compensatorio) vive en los datos: festivo y
  // compensatorio son dos filas, así que acá solo se respetan, no se deducen.
  diasSinEscuela: DiaSinEscuela[];
  singleDay?: DiaSemana;
  onClose: () => void;
  // fechaMovida: si el día cambió de fecha, para que la vista salte a esa semana.
  onSaved: (fechaMovida?: string) => void;
}

// Destino efectivo de un día tras un cambio de fecha. Vacío = se guarda donde
// estaba (plan y fecha que ya tenía el wizard).
type Destino = { fecha?: string; planId?: string; diaSemana?: DiaSemana };

function slotsPara(horariosDefecto: HorarioDefecto[], tipoPlan: TipoPlan, dia: DiaSemana) {
  return horariosDefecto
    .filter((h) => h.tipo_plan === tipoPlan && h.dia_semana === dia)
    .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
}

// "martes 18 (Compensatorio — lunes festivo)" — mismo formato en la cabecera y
// en el aviso de guardado.
function etiquetaDiaOmitido(dia: DiaSemana, fecha: string, info: DiaSinEscuela): string {
  return `${DIA_LABEL[dia].toLowerCase()} ${Number(fecha.slice(8, 10))} (${descripcionDiaSinEscuela(info.motivo)})`;
}

function avisoDescartes(descartadas: { fecha: string; dia: string; info: DiaSinEscuela }[]): string {
  const lista = descartadas.map((d) => etiquetaDiaOmitido(d.dia as DiaSemana, d.fecha, d.info)).join(", ");
  return `Se guardó lo demás, pero no se programó ${lista}: está marcado como día sin escuela.`;
}

export default function WeekWizardModal({ tipoPlan, semana, planId, horariosDefecto, sesionesExistentes, diasSinEscuela, singleDay, onClose, onSaved }: Props) {
  const config = GROUP_CONFIGS[tipoPlan];
  // Competencia: 1 o 2 estaciones (físico + técnica, o dos técnicas; putt/campo = 1).
  // Juvenil/Damas hasta 4.
  const conteos = tipoPlan === "competencia" ? [1, 2] : [1, 2, 3, 4];
  // Los días marcados como sin escuela no entran al recorrido: ni se arman, ni
  // se sugieren, ni se guardan.
  const { dias, omitidos } = useMemo(() => {
    const candidatos = singleDay ? [singleDay] : DIAS_POR_TIPO[tipoPlan];
    const programables: DiaSemana[] = [];
    const fuera: { dia: DiaSemana; fecha: string; info: DiaSinEscuela }[] = [];
    for (const dia of candidatos) {
      const fecha = getFechaForDia(semana, dia);
      const info = diasSinEscuela.find((d) => fechaEnRango(fecha, d.fecha_inicio, d.fecha_fin));
      if (info) fuera.push({ dia, fecha, info });
      else programables.push(dia);
    }
    return { dias: programables, omitidos: fuera };
  }, [singleDay, tipoPlan, semana, diasSinEscuela]);

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
  // Aviso no bloqueante del guardado (ej. filas omitidas por día sin escuela).
  const [aviso, setAviso] = useState<string | null>(null);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [profesores, setProfesores] = useState<string[]>([]);
  // Días ya guardados en la base — para marcarlos con ✓ y poder parar/retomar.
  const [guardados, setGuardados] = useState<Set<string>>(() => new Set(sesionesExistentes.map((s) => s.dia_semana)));

  // Cambio de fecha de un día ya guardado. No se aplica al escribirlo: se
  // guarda con el resto en "Guardar día" (primero se mueve, después se sube el
  // contenido a la fecha nueva). `movido` recuerda el resultado para no
  // reintentar el movimiento si se guarda dos veces seguidas.
  const sesionesDelDiaActual = singleDay ? sesionesExistentes.filter((s) => s.dia_semana === singleDay) : [];
  const puedeCambiarFecha = !!singleDay && sesionesDelDiaActual.length > 0;
  const fechaOriginal = singleDay ? getFechaForDia(semana, singleDay) : "";
  const [fechaNueva, setFechaNueva] = useState(fechaOriginal);
  const [movido, setMovido] = useState<{ fecha: string; planId: string; diaSemana: DiaSemana } | null>(null);
  const motivoFechaInvalida = puedeCambiarFecha ? motivoFechaNoValida(fechaNueva, diasSinEscuela) : null;
  const fechaCambiada = puedeCambiarFecha && !!fechaNueva && fechaNueva !== fechaOriginal;

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

  // Los catálogos son chicos y fijos (drills ~148 filas, ejercicios_fisicos ~50)
  // y no dependen ni del día ni de la estación, así que se traen enteros una vez
  // y la selección se hace en memoria. Antes esto eran ~20 consultas
  // secuenciales (una por día para el calentamiento, más una por estación) que
  // el profesor esperaba antes de ver nada.
  async function sugerirSemana() {
    setSugiriendo(true);
    setError(null);
    const gFisico = gruposParaFisico(tipoPlan);

    const [calRes, ejRes, drillsRes] = await Promise.all([
      supabase.from("ejercicios_fisicos").select("id, nombre, instrucciones, series_repeticiones")
        .eq("categoria", "Calentamiento").overlaps("grupos", gFisico).order("nombre"),
      supabase.from("ejercicios_fisicos").select("id, nombre, instrucciones, series_repeticiones")
        .neq("categoria", "Calentamiento").overlaps("grupos", gFisico).order("nombre"),
      supabase.from("drills").select("id, titulo, descripcion, rating, categoria, nivel_recomendado")
        .eq("aprobado", true).order("rating", { ascending: false }),
    ]);

    // Sin esto un fallo de catálogo generaba la semana igual, con las estaciones
    // vacías y sin avisar: parecía que no había material disponible.
    const fallo = calRes.error ?? ejRes.error ?? drillsRes.error;
    if (fallo) {
      setError(`No se pudo cargar la biblioteca de ejercicios: ${fallo.message}. No se generó la semana sugerida.`);
      setSugiriendo(false);
      return;
    }

    const calentamientos = calRes.data ?? [];
    const ejercicios = ejRes.data ?? [];

    // Drills agrupados por categoría una sola vez, conservando el orden por
    // rating que trajo la consulta. Se descarta lo que no sirve al grupo: sin
    // este filtro la semana sugerida de Birdies (4-5 años) se armaba con el
    // drill mejor calificado de cada categoría aunque fuera de Competencia.
    type DrillRow = NonNullable<typeof drillsRes.data>[number];
    const gDrills = gruposParaDrills(tipoPlan);
    const estricto = filtroDrillsEstricto(tipoPlan);
    const drillsPorCategoria = new Map<string, DrillRow[]>();
    for (const d of drillsRes.data ?? []) {
      if (!drillSirveAlGrupo(d.nivel_recomendado, gDrills, estricto)) continue;
      const arr = drillsPorCategoria.get(d.categoria);
      if (arr) arr.push(d); else drillsPorCategoria.set(d.categoria, [d]);
    }

    const usados = new Set<string>();
    const sinMaterial = new Set<string>();
    const next: Record<string, DiaWizardState> = {};
    for (const dia of dias) {
      const base = initDia(dia, estacionesPorDia);
      // Mismos dos primeros calentamientos para todos los días, como antes: no
      // entran al Set `usados`.
      const calDia = calentamientos.slice(0, 2);
      const calentamiento = calDia.length > 0
        ? { ejercicios: calDia.map((e) => ({ id: e.id, titulo: e.nombre, descripcion: e.instrucciones ?? "", series_repeticiones: e.series_repeticiones })), duracionMin: 8 }
        : null;

      const estaciones = [];
      for (const est of base.estaciones) {
        const opt = config.categorias.find((c) => c.value === est.categoria)!;
        let item: EstacionLibraryPick | null = null;
        if (opt.drillsCategoria) {
          const candidato = (drillsPorCategoria.get(opt.drillsCategoria) ?? []).find((d) => !usados.has(d.titulo));
          if (candidato) item = { id: candidato.id, titulo: candidato.titulo, descripcion: candidato.descripcion, series_repeticiones: null };
        } else {
          const candidato = ejercicios.find((d) => !usados.has(d.nombre));
          if (candidato) item = { id: candidato.id, titulo: candidato.nombre, descripcion: candidato.instrucciones ?? "", series_repeticiones: candidato.series_repeticiones };
        }
        if (item) usados.add(item.titulo);
        else sinMaterial.add(opt.label);
        estaciones.push({ ...est, items: item ? [item] : [], desafio: item ? "Reto de cierre — a definir" : "" });
      }
      next[dia] = { ...base, calentamiento, estaciones };
    }
    setDiasState(next);
    if (sinMaterial.size > 0) {
      setAviso(`La biblioteca no tiene material de ${TIPO_PLAN_LABEL[tipoPlan]} para ${[...sinMaterial].join(", ")}. Esas estaciones quedaron vacías: agrégales ejercicios a mano o súbelos a la biblioteca marcados para este grupo.`);
    }
    setSugiriendo(false);
    setStep("dias");
    setCurrentIndex(0);
  }

  // `destino` llega solo cuando el día cambió de fecha: la fila tiene que ir al
  // plan de la semana nueva y con el dia_semana que corresponda a esa fecha, o
  // el upsert pisaría la sesión recién movida con datos incoherentes.
  function rowsForDia(dia: DiaSemana, diaState: DiaWizardState, destino?: Destino): Record<string, unknown>[] {
    const slots = slotsPara(horariosDefecto, tipoPlan, dia);
    const fecha = destino?.fecha ?? getFechaForDia(semana, dia);
    const slotList = slots.length > 0 ? slots : (diaState.horaInicio && diaState.horaFin ? [{ hora_inicio: diaState.horaInicio, hora_fin: diaState.horaFin }] : []);
    if (slotList.length === 0) throw new Error(`No hay horario por defecto para ${dia}; defínelo en horarios_defecto.`);
    return slotList.map((slot) => {
      const base = { plan_id: destino?.planId ?? planId, dia_semana: destino?.diaSemana ?? dia, fecha, hora_inicio: slot.hora_inicio.slice(0, 5), hora_fin: slot.hora_fin.slice(0, 5) };
      // Birdies escribe con el mismo shape que Juvenil (sesion_juvenil).
      return usaSesionJuvenil(tipoPlan) ? buildJuvenilRow(base, diaState, config)
        : tipoPlan === "competencia" ? buildCompetenciaRow(base, diaState, config)
        : buildDamasRow(base, diaState, config);
    });
  }

  // Aplica el cambio de fecha (si lo hay) antes de subir el contenido: mueve las
  // filas existentes con /api/mover-programacion, que conserva los id y con
  // ellos las reservas de los alumnos. Devuelve el destino efectivo, o null si
  // falló — en ese caso ya se mostró el error y no hay que guardar nada.
  async function aplicarCambioDeFecha(dia: DiaSemana): Promise<Destino | null> {
    if (!fechaCambiada || dia !== singleDay) return {};
    if (movido && movido.fecha === fechaNueva) return movido;
    let destino: Destino = {};
    for (const s of sesionesDelDiaActual) {
      const res = await fetch("/api/mover-programacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "dia", sesion_id: s.id, nueva_fecha: fechaNueva }),
      });
      const data = await res.json();
      if (res.status === 409 && data.needs_confirm) {
        const n = data.sesion_destino?.reservas ?? 0;
        setError(`Ya hay otra sesión ese día a las ${s.hora_inicio?.slice(0, 5) ?? "esa hora"}${n > 0 ? ` (con ${n} reserva${n === 1 ? "" : "s"})` : ""}. Para reemplazarla usa "Cambiar de fecha" desde el calendario.`);
        return null;
      }
      if (!res.ok) { setError(data.error || "No se pudo cambiar la fecha de la sesión."); return null; }
      destino = { fecha: data.fecha as string, planId: data.plan_id as string, diaSemana: data.dia_semana as DiaSemana };
    }
    if (destino.fecha) setMovido(destino as { fecha: string; planId: string; diaSemana: DiaSemana });
    return destino;
  }

  // Guarda un solo día de inmediato — así "Siguiente día" no deja el trabajo
  // solo en memoria: si el profe cierra el wizard a mitad de semana para
  // terminarla después, los días ya recorridos quedan guardados.
  async function guardarDia(dia: DiaSemana): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const destino = await aplicarCambioDeFecha(dia);
      if (!destino) return false;
      const { filas, descartadas } = descartarFilasSinEscuela(rowsForDia(dia, diasState[dia], destino), diasSinEscuela);
      if (filas.length === 0) {
        setError(`${DIA_LABEL[dia]} está marcado como día sin escuela (${descripcionDiaSinEscuela(descartadas[0]?.info.motivo)}). No se guardó nada.`);
        return false;
      }
      const { error: e } = await supabase.from("sesiones_semana").upsert(filas, { onConflict: "plan_id,fecha,hora_inicio" });
      if (e) throw new Error(e.message);
      setGuardados((prev) => new Set(prev).add(dia));
      if (descartadas.length > 0) setAviso(avisoDescartes(descartadas));
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
    // Un día suelto que además cambió de fecha se guarda por el mismo camino que
    // "Guardar día" (mover + upsert) y recién ahí se cierra.
    if (singleDay && fechaCambiada) {
      const ok = await guardarDia(singleDay);
      if (ok) onSaved(movido?.fecha ?? fechaNueva);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const diasAGuardar = dias.filter((d) => diasState[d] && diaCompleto(diasState[d]));
      if (diaActual && diaCompleto(diaActual) && !diasAGuardar.includes(diaActualKey)) diasAGuardar.push(diaActualKey);
      if (diasAGuardar.length === 0) { setError("No hay ningún día completo para guardar."); return; }
      const { filas, descartadas } = descartarFilasSinEscuela(
        diasAGuardar.flatMap((d) => rowsForDia(d, diasState[d])), diasSinEscuela
      );
      if (filas.length === 0) { setError(`Todos los días quedaron sin escuela (${descripcionDiaSinEscuela(descartadas[0]?.info.motivo)}). No se guardó nada.`); return; }
      const { error: e } = await supabase.from("sesiones_semana").upsert(filas, { onConflict: "plan_id,fecha,hora_inicio" });
      if (e) throw new Error(e.message);
      const fechasDescartadas = new Set(descartadas.map((d) => d.fecha));
      setGuardados((prev) => {
        const n = new Set(prev);
        diasAGuardar.filter((d) => !fechasDescartadas.has(getFechaForDia(semana, d))).forEach((d) => n.add(d));
        return n;
      });
      // Con descartes no se cierra el modal: el aviso se perdería y el profesor
      // creería que se guardó la semana entera.
      if (descartadas.length > 0) { setAviso(avisoDescartes(descartadas)); return; }
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
  const advertencias = diaActual ? diaAdvertencias(diaActual) : [];
  const diasCompletos = dias.filter((d) => diasState[d] && diaCompleto(diasState[d])).length;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => { if (!saving) onClose(); }}>
      <div className="bg-(--ui-card) rounded-2xl shadow-2xl w-full max-w-2xl my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-(--ui-border-soft) sticky top-0 bg-(--ui-card) rounded-t-2xl z-10" style={{ borderTopColor: config.color }}>
          <div>
            <h2 className="font-bold text-(--ui-text) text-sm">{TIPO_PLAN_LABEL[tipoPlan]} — Armar programación</h2>
            {step === "dias" && diaActual && (
              <p className="text-xs text-(--ui-text-3) mt-0.5">
                Día {currentIndex + 1} de {dias.length} · {diaActualKey} · {diaActual.horaInicio}-{diaActual.horaFin}
                {diaActual.tipo === "normal" && ` · ${duracionTotal} min totales`}
              </p>
            )}
            {omitidos.length > 0 && (
              <p className="text-xs mt-0.5" style={{ color: "var(--ui-warn)" }}>
                No se programan: {omitidos.map((o) => etiquetaDiaOmitido(o.dia, o.fecha, o.info)).join(", ")}
              </p>
            )}
            {puedeCambiarFecha && (
              <div className="mt-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-(--ui-text-3)">Fecha:</span>
                  <input
                    type="date"
                    value={fechaNueva}
                    onChange={(e) => { setFechaNueva(e.target.value); setMovido(null); }}
                    disabled={saving}
                    className="text-xs border border-(--ui-border) rounded-lg px-2 py-1"
                  />
                  {fechaCambiada && !motivoFechaInvalida && (
                    <span className="text-[11px] font-semibold" style={{ color: "var(--ui-warn)" }}>se moverá al guardar</span>
                  )}
                </div>
                {motivoFechaInvalida && <p className="text-[11px] mt-0.5" style={{ color: "var(--ui-bad)" }}>{motivoFechaInvalida}</p>}
              </div>
            )}
          </div>
          <button onClick={() => { if (!saving) onClose(); }} disabled={saving} className="text-(--ui-text-3) hover:text-(--ui-text-2) disabled:opacity-40">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Semana entera sin escuela — ProgramacionModule ya no debería abrir el
            wizard en este caso; queda como red de seguridad. */}
        {dias.length === 0 && (
          <div className="p-5 space-y-3">
            <div className="bg-(--ui-card-alt) border border-(--ui-border) rounded-lg px-4 py-3 text-sm text-(--ui-text-2) space-y-1">
              <p className="font-semibold">No hay días para programar.</p>
              {omitidos.map((o) => <p key={o.dia}>· {etiquetaDiaOmitido(o.dia, o.fecha, o.info)}</p>)}
            </div>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl text-sm font-semibold text-(--g-on-accent)" style={{ background: config.color }}>Cerrar</button>
          </div>
        )}

        {aviso && (
          <div className="mx-5 mt-3 bg-(--ui-warn-bg) border border-(--ui-warn) rounded-lg px-3 py-2 text-xs text-(--ui-warn)">{aviso}</div>
        )}

        {step === "dias" && diaActual && !singleDay && (
          <div className="px-4 pt-3 pb-3 flex gap-1.5 flex-wrap border-b border-(--ui-border-soft)">
            {dias.map((d, i) => {
              const active = i === currentIndex;
              const saved = guardados.has(d);
              // Tres estados: guardado completo (✓), guardado pero con
              // sugerencias sin usar (⚠) y sin guardar (sin marca).
              const conAvisos = saved && !!diasState[d] && diaAdvertencias(diasState[d]).length > 0;
              return (
                <button
                  key={d}
                  onClick={() => setCurrentIndex(i)}
                  title={saved ? (conAvisos ? "Guardado — con sugerencias sin usar" : "Guardado") : "Sin guardar"}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border capitalize flex items-center gap-1 transition-all"
                  style={active ? { background: config.color, color: "var(--g-on-accent)", borderColor: config.color } : { background: "var(--ui-card-alt)", color: "var(--ui-text-2)", borderColor: "var(--ui-border)" }}
                >
                  {saved && (
                    <span style={{ color: active ? "#fff" : conAvisos ? "var(--ui-warn)" : "var(--ui-ok)" }}>{conAvisos ? "⚠" : "✓"}</span>
                  )}{d}
                </button>
              );
            })}
          </div>
        )}

        {step === "count" && dias.length > 0 && (
          <div className="p-5 space-y-3">
            <p className="text-xs font-bold text-(--ui-text-3) uppercase tracking-wide">¿Cuántas estaciones por día?</p>
            <div className={`grid gap-2 ${conteos.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
              {conteos.map((n) => (
                <button key={n} onClick={() => handleChooseCount(n)}
                  className="flex flex-col items-center justify-center py-4 rounded-xl border-2 border-(--ui-border) hover:border-green-400 hover:bg-(--ui-ok-bg) transition-all font-bold text-lg text-(--ui-text)">
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-(--ui-text-3)">Aplica a toda la semana — se puede ajustar por día más adelante.</p>
            <button
              onClick={sugerirSemana}
              disabled={sugiriendo}
              className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold text-(--g-on-accent) disabled:opacity-50"
              style={{ background: config.color }}
            >
              {sugiriendo ? "Armando semana sugerida..." : "✨ Sugerir semana completa"}
            </button>
            {/* El bloque de error del paso "días" no se ve desde acá, y este es
                el único paso donde vive "Sugerir semana completa". */}
            {error && <div className="bg-(--ui-bad-bg) border border-(--ui-bad) rounded-lg px-4 py-3 text-sm text-(--ui-bad)">{error}</div>}
          </div>
        )}

        {step === "dias" && diaActual && (
          <>
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {tipoPlan === "juvenil" && (
                <div>
                  <label className="text-[11px] font-bold text-(--ui-text-3) uppercase tracking-wide block mb-1">Subgrupo (opcional)</label>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => updateDia({ ...diaActual, subgrupo: undefined })}
                      className="px-2.5 py-1 rounded-full text-xs font-semibold border"
                      style={!diaActual.subgrupo ? { background: config.color, color: "var(--g-on-accent)", borderColor: config.color } : { background: "var(--ui-card-alt)", color: "var(--ui-text-2)", borderColor: "var(--ui-border)" }}>
                      Todas las edades
                    </button>
                    {SUBGRUPOS_JUVENIL.map((sg) => (
                      <button key={sg} onClick={() => updateDia({ ...diaActual, subgrupo: sg })}
                        className="px-2.5 py-1 rounded-full text-xs font-semibold border"
                        style={diaActual.subgrupo === sg ? { background: config.color, color: "var(--g-on-accent)", borderColor: config.color } : { background: "var(--ui-card-alt)", color: "var(--ui-text-2)", borderColor: "var(--ui-border)" }}>
                        {SUBGRUPO_LABEL[sg]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateDia({ ...diaActual, tipo: diaActual.tipo === "normal" ? "especial" : "normal" })}
                  className="text-xs font-medium text-(--ui-text-3) hover:text-(--ui-text-2) underline"
                >
                  {diaActual.tipo === "normal" ? "Convertir en día especial" : "Volver a estaciones normales"}
                </button>
                {currentIndex > 0 && diaActual.tipo === "normal" && (
                  <button onClick={copiarDiaAnterior} className="text-xs font-medium text-(--g-birdies-fg) hover:text-blue-900 ml-auto">
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
                    <span className="text-[11px] font-bold text-(--ui-text-3) uppercase tracking-wide">Estaciones del día</span>
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
                            style={active ? { background: config.color, color: "var(--g-on-accent)", borderColor: config.color } : { background: "var(--ui-card-alt)", color: "var(--ui-text-2)", borderColor: "var(--ui-border)" }}
                          >
                            {n}
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-[11px] text-(--ui-text-3)">1 = clase completa de un solo tema</span>
                  </div>

                  {diaActual.estaciones.length > 0 && (
                    <p className="text-xs text-(--ui-text-3)">~{minutosPorEstacion} min sugeridos por estación</p>
                  )}

                  {diaActual.estaciones.map((est, idx) => {
                    const disponiblesParaEsta = config.categorias.filter(
                      (c) => c.value === est.categoria || !diaActual.estaciones.some((e, i) => i !== idx && e.categoria === c.value)
                    );
                    return (
                      <EstacionEditor
                        // el día va en la key: el estado interno del editor
                        // (picker abierto, reto sugerido, foco libre) es del día
                        // que se está viendo, no del índice de estación.
                        key={`${diaActualKey}-${idx}`}
                        index={idx}
                        estacion={est}
                        categoriaOptions={disponiblesParaEsta}
                        grupos={gruposParaDrills(tipoPlan, diaActual.subgrupo)}
                        gruposFisico={gruposParaFisico(tipoPlan, diaActual.subgrupo)}
                        materialesDisponibles={materialesPara(tipoPlan)}
                        estrictoDrills={filtroDrillsEstricto(tipoPlan)}
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
                        className="text-xs font-medium text-(--g-birdies-fg) hover:text-blue-900"
                      >
                        + Agregar estación
                      </button>
                    )}
                    {diaActual.estaciones.length > 1 && (
                      <button
                        onClick={() => updateDia({ ...diaActual, estaciones: diaActual.estaciones.slice(0, -1) })}
                        className="text-xs font-medium text-(--ui-text-3) hover:text-(--ui-bad)"
                      >
                        Quitar última
                      </button>
                    )}
                  </div>
                </>
              )}

              {error && <div className="bg-(--ui-bad-bg) border border-(--ui-bad) rounded-lg px-4 py-3 text-sm text-(--ui-bad)">{error}</div>}
            </div>

            {faltantes.length > 0 && (
              <div className="mx-5 mb-2 bg-(--ui-bad-bg) border border-(--ui-bad) rounded-lg px-3 py-2 text-xs text-(--ui-bad) space-y-0.5">
                <p className="font-semibold">Falta para continuar:</p>
                {faltantes.map((f, i) => <p key={i}>· {f}</p>)}
              </div>
            )}

            {advertencias.length > 0 && (
              <div className="mx-5 mb-2 bg-(--ui-warn-bg) border border-(--ui-warn) rounded-lg px-3 py-2 text-xs text-(--ui-warn) space-y-0.5">
                <p className="font-semibold">Puedes guardar así; son sugerencias:</p>
                {advertencias.map((a, i) => <p key={i}>· {a}</p>)}
              </div>
            )}

            <div className="px-5 pb-5 pt-3 flex items-center gap-2 border-t border-(--ui-border-soft)">
              {!singleDay && (
                <>
                  <button onClick={handleDiaAnterior} disabled={currentIndex === 0}
                    className="px-3 py-2.5 rounded-xl text-sm font-medium border border-(--ui-border) text-(--ui-text-2) hover:bg-(--ui-card-alt) disabled:opacity-30" title="Día anterior">←</button>
                  <button onClick={handleSiguienteDia} disabled={esUltimoDia}
                    className="px-3 py-2.5 rounded-xl text-sm font-medium border border-(--ui-border) text-(--ui-text-2) hover:bg-(--ui-card-alt) disabled:opacity-30" title="Siguiente día">→</button>
                  <button onClick={guardarDiaActual} disabled={!puedeAvanzar || saving || !!motivoFechaInvalida}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 disabled:opacity-40"
                    style={{ borderColor: config.color, color: config.color }}>
                    {saving ? "Guardando..." : guardados.has(diaActualKey) ? "✓ Guardado — actualizar" : "Guardar día"}
                  </button>
                </>
              )}
              <button onClick={handleSave} disabled={(singleDay ? !puedeAvanzar : diasCompletos === 0) || saving || !!motivoFechaInvalida}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-(--g-on-accent) disabled:opacity-40"
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
