"use client";

// Torneos — la tercera fuente de puntos del reconocimiento anual.
//
// La pantalla no registra resultados de golf. Registra dos cosas por alumno:
// que compitió y, si aplica, que subió al podio. El score, los hoyos y el
// handicap viven en el sistema del club y no son lo que se premia aquí.
//
// No hay tabla de participantes: la participación ES un punto en
// `puntos_alumno`, igual que la sesión extra o el reto de casa. Marcar a un
// alumno inserta la fila; desmarcarlo la borra. Así el acta del torneo y el
// ranking no pueden contradecirse, porque son la misma fila.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Trophy, Plus, ArrowLeft, Search, Trash2, Pencil, MapPin, Users, Medal,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AMBITO_LABEL, PUNTOS_TORNEO, totalPodio, type AmbitoTorneo } from "@/lib/puntos";
import { calcularGrupo } from "@/lib/grupos";
import AvatarAlumno from "@/components/ui/AvatarAlumno";
import {
  Pagina, Encabezado, Panel, Toolbar, ChipGrupo, GrupoBadge, MetricCard,
  BotonPrimario, BotonSecundario, BotonIcono, Campo, CAMPO, CLASE_CAMPO,
  Loading, EmptyState, ErrorState, Toast, Modal, ModalHeader, ModalConfirmar,
  TH, thStyle, fondoFila,
} from "@/components/ui/tema";

type Torneo = {
  id: string;
  nombre: string;
  fecha: string;
  ambito: AmbitoTorneo;
  lugar: string | null;
  notas: string | null;
};

// Un punto de torneo. `categoria` solo puede ser una de las dos aquí: las de
// clase (sesión extra, reto de casa, disciplina) no llevan torneo_id.
type PuntoTorneo = {
  id: string;
  torneo_id: string;
  estudiante_id: string;
  categoria: "torneo" | "podio";
  puntos: number;
};

type Alumno = {
  id: string;
  full_name: string;
  birth_date: string | null;
  gender: string | null;
  grupo_activo: string | null;
  foto_url: string | null;
};

const CAMPOS_ALUMNO = "id, full_name, birth_date, gender, grupo_activo, foto_url";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** La fecha viene como 'YYYY-MM-DD'; `new Date` sobre eso la corre un día. */
function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${a}`;
}

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TorneosModule() {
  const [torneos, setTorneos] = useState<Torneo[]>([]);
  // Todos los puntos de torneo de la historia. Son pocos —una o dos filas por
  // alumno y torneo— y traerlos de una vez evita una consulta por tarjeta.
  const [puntos, setPuntos] = useState<PuntoTorneo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [filtro, setFiltro] = useState<"todos" | AmbitoTorneo>("todos");
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [editando, setEditando] = useState<Torneo | "nuevo" | null>(null);
  const [borrando, setBorrando] = useState<Torneo | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  // Nombres y fotos de los alumnos ya premiados. Se llena al abrir un torneo y
  // se conserva entre torneos: el mismo niño suele estar en varios.
  const [alumnos, setAlumnos] = useState<Record<string, Alumno>>({});

  const avisar = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [{ data: tData, error: tErr }, { data: pData, error: pErr }] = await Promise.all([
      supabase.from("torneos").select("id, nombre, fecha, ambito, lugar, notas").order("fecha", { ascending: false }),
      supabase.from("puntos_alumno").select("id, torneo_id, estudiante_id, categoria, puntos").not("torneo_id", "is", null),
    ]);
    if (tErr || pErr) {
      const msg = (tErr ?? pErr)!.message;
      setError(msg.includes("torneos") ? "No se pudo leer la lista de torneos. ¿Ya se creó la tabla?" : msg);
      setLoading(false);
      return;
    }
    setTorneos((tData ?? []) as Torneo[]);
    setPuntos((pData ?? []) as PuntoTorneo[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derivados ──────────────────────────────────────────────────────────────

  const porTorneo = useMemo(() => {
    const m: Record<string, PuntoTorneo[]> = {};
    puntos.forEach((p) => { (m[p.torneo_id] ??= []).push(p); });
    return m;
  }, [puntos]);

  function resumen(torneoId: string) {
    const filas = porTorneo[torneoId] ?? [];
    return {
      participantes: filas.filter((f) => f.categoria === "torneo").length,
      podios: filas.filter((f) => f.categoria === "podio").length,
      puntos: filas.reduce((a, f) => a + f.puntos, 0),
    };
  }

  const visibles = filtro === "todos" ? torneos : torneos.filter((t) => t.ambito === filtro);
  const abierto = torneos.find((t) => t.id === abiertoId) ?? null;

  const totales = useMemo(() => ({
    torneos: torneos.length,
    externos: torneos.filter((t) => t.ambito === "externo").length,
    // Un alumno que jugó tres torneos cuenta una vez: la cifra responde a
    // "cuántos niños están compitiendo", no a cuántas inscripciones hubo.
    alumnos: new Set(puntos.filter((p) => p.categoria === "torneo").map((p) => p.estudiante_id)).size,
    puntos: puntos.reduce((a, p) => a + p.puntos, 0),
  }), [torneos, puntos]);

  // ── Alta y edición del torneo ──────────────────────────────────────────────

  async function guardarTorneo(datos: Omit<Torneo, "id">, id?: string) {
    setTrabajando(true);
    const { data, error: err } = id
      ? await supabase.from("torneos").update(datos).eq("id", id).select("id, nombre, fecha, ambito, lugar, notas").single()
      : await supabase.from("torneos").insert(datos).select("id, nombre, fecha, ambito, lugar, notas").single();
    setTrabajando(false);
    if (err) { avisar(err.message); return; }
    const t = data as Torneo;
    setTorneos((prev) => {
      const otros = prev.filter((x) => x.id !== t.id);
      return [...otros, t].sort((a, b) => b.fecha.localeCompare(a.fecha));
    });
    setEditando(null);
    if (!id) setAbiertoId(t.id);
    avisar(id ? "Torneo actualizado" : "Torneo creado");
  }

  async function eliminarTorneo(t: Torneo) {
    setTrabajando(true);
    const { error: err } = await supabase.from("torneos").delete().eq("id", t.id);
    setTrabajando(false);
    if (err) { avisar(err.message); return; }
    setTorneos((prev) => prev.filter((x) => x.id !== t.id));
    setPuntos((prev) => prev.filter((p) => p.torneo_id !== t.id));
    setBorrando(null);
    if (abiertoId === t.id) setAbiertoId(null);
    avisar("Torneo eliminado");
  }

  // ── Puntos ─────────────────────────────────────────────────────────────────

  // Se graban al pulsar, no al cerrar la pantalla: el coordinador va cargando
  // la lista mientras lee el acta del torneo, y cerrar por error no puede
  // costarle el trabajo hecho.
  async function otorgar(torneo: Torneo, alumno: Alumno, categoria: "torneo" | "podio") {
    const pts = categoria === "torneo"
      ? PUNTOS_TORNEO[torneo.ambito].participar
      : PUNTOS_TORNEO[torneo.ambito].podio;
    const { data, error: err } = await supabase
      .from("puntos_alumno")
      .insert({
        estudiante_id: alumno.id,
        categoria,
        puntos: pts,
        torneo_id: torneo.id,
        motivo: `${torneo.nombre} (${AMBITO_LABEL[torneo.ambito].toLowerCase()})`,
        fecha: torneo.fecha,
      })
      .select("id, torneo_id, estudiante_id, categoria, puntos")
      .single();
    if (err) { avisar(err.message); return; }
    setAlumnos((prev) => ({ ...prev, [alumno.id]: alumno }));
    setPuntos((prev) => [...prev, data as PuntoTorneo]);
  }

  async function quitar(ids: string[]) {
    if (!ids.length) return;
    const { error: err } = await supabase.from("puntos_alumno").delete().in("id", ids);
    if (err) { avisar(err.message); return; }
    setPuntos((prev) => prev.filter((p) => !ids.includes(p.id)));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <Pagina><Loading msg="Cargando torneos…" /></Pagina>;

  if (error) {
    return (
      <Pagina>
        <Encabezado icono={Trophy} titulo="Torneos" />
        <ErrorState msg={error} nota="Si la tabla todavía no existe, corre la migración 20260826_torneos.sql en Supabase." />
      </Pagina>
    );
  }

  if (abierto) {
    return (
      <>
        <DetalleTorneo
          torneo={abierto}
          filas={porTorneo[abierto.id] ?? []}
          alumnos={alumnos}
          setAlumnos={setAlumnos}
          onVolver={() => setAbiertoId(null)}
          onEditar={() => setEditando(abierto)}
          onEliminar={() => setBorrando(abierto)}
          onOtorgar={otorgar}
          onQuitar={quitar}
          onError={avisar}
        />
        {editando && editando !== "nuevo" && (
          <ModalTorneo
            torneo={editando}
            tienePuntos={(porTorneo[editando.id] ?? []).length > 0}
            trabajando={trabajando}
            onGuardar={(datos) => guardarTorneo(datos, editando.id)}
            onCerrar={() => setEditando(null)}
          />
        )}
        {borrando && (
          <ModalConfirmar
            titulo="Eliminar torneo"
            mensaje={`Se elimina "${borrando.nombre}" y los ${resumen(borrando.id).puntos} puntos que repartió. Los alumnos los pierden del ranking.`}
            trabajando={trabajando}
            onConfirmar={() => eliminarTorneo(borrando)}
            onCancelar={() => setBorrando(null)}
          />
        )}
        <Toast msg={toast} />
      </>
    );
  }

  return (
    <Pagina>
      <Encabezado
        icono={Trophy}
        titulo="Torneos"
        bajada="Puntos por competir. Cargas el torneo una vez y marcas quién jugó y quién hizo podio."
      >
        <BotonPrimario onClick={() => setEditando("nuevo")}>
          <Plus size={16} /> Nuevo torneo
        </BotonPrimario>
      </Encabezado>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Torneos" value={totales.torneos} sub={`${totales.externos} fuera del club`} />
        <MetricCard label="Alumnos compitiendo" value={totales.alumnos} sub="sin repetir" />
        <MetricCard label="Puntos repartidos" value={totales.puntos} />
        <MetricCard label="Baremo" value={`${PUNTOS_TORNEO.externo.participar}/${totalPodio("externo")}`}
          sub={`externo · interno ${PUNTOS_TORNEO.interno.participar}/${totalPodio("interno")}`} />
      </div>

      <Toolbar>
        <ChipGrupo label="Todos" grupo={null} active={filtro === "todos"} onClick={() => setFiltro("todos")} count={torneos.length} />
        <ChipGrupo label="Internos" grupo="juvenil" active={filtro === "interno"} onClick={() => setFiltro("interno")}
          count={torneos.filter((t) => t.ambito === "interno").length} />
        <ChipGrupo label="Externos" grupo="competencia" active={filtro === "externo"} onClick={() => setFiltro("externo")}
          count={torneos.filter((t) => t.ambito === "externo").length} />
      </Toolbar>

      <Panel>
        {visibles.length === 0 ? (
          <EmptyState
            msg={torneos.length === 0 ? "Todavía no hay torneos cargados" : "Ningún torneo de este tipo"}
            sub={torneos.length === 0 ? "Carga el primero y marca quiénes jugaron: los puntos se reparten solos." : undefined}
            accion={torneos.length === 0 ? <BotonPrimario onClick={() => setEditando("nuevo")}><Plus size={16} /> Nuevo torneo</BotonPrimario> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={`${TH} text-left px-4 py-2.5`} style={thStyle}>Torneo</th>
                  <th className={`${TH} text-left px-3 py-2.5`} style={thStyle}>Fecha</th>
                  <th className={`${TH} text-left px-3 py-2.5`} style={thStyle}>Tipo</th>
                  <th className={`${TH} text-right px-3 py-2.5`} style={thStyle}>Jugaron</th>
                  <th className={`${TH} text-right px-3 py-2.5`} style={thStyle}>Podios</th>
                  <th className={`${TH} text-right px-4 py-2.5`} style={thStyle}>Puntos</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((t, i) => {
                  const r = resumen(t.id);
                  return (
                    <tr key={t.id} onClick={() => setAbiertoId(t.id)}
                      className="cursor-pointer transition-opacity hover:opacity-80"
                      style={{ background: fondoFila(i) }}>
                      <td className="px-4 py-2.5">
                        <p className="font-semibold" style={{ color: "var(--ui-text)" }}>{t.nombre}</p>
                        {t.lugar && (
                          <p className="text-[11px] flex items-center gap-1" style={{ color: "var(--ui-text-3)" }}>
                            <MapPin size={11} /> {t.lugar}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--ui-text-2)" }}>{fechaLarga(t.fecha)}</td>
                      <td className="px-3 py-2.5"><AmbitoBadge ambito={t.ambito} /></td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "var(--ui-text-2)" }}>{r.participantes}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: r.podios ? "var(--ui-gold)" : "var(--ui-text-3)" }}>{r.podios}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold" style={{ color: "var(--ui-text)" }}>{r.puntos}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {editando === "nuevo" && (
        <ModalTorneo
          trabajando={trabajando}
          onGuardar={(datos) => guardarTorneo(datos)}
          onCerrar={() => setEditando(null)}
        />
      )}
      <Toast msg={toast} />
    </Pagina>
  );
}

// ── Piezas ───────────────────────────────────────────────────────────────────

function AmbitoBadge({ ambito }: { ambito: AmbitoTorneo }) {
  const externo = ambito === "externo";
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={externo
        ? { background: "var(--g-competencia-bg)", color: "var(--g-competencia-fg)" }
        : { background: "var(--ui-card-alt)", color: "var(--ui-text-3)" }}>
      {AMBITO_LABEL[ambito]}
    </span>
  );
}

/** Alta y edición. El ámbito se bloquea en cuanto el torneo repartió puntos. */
function ModalTorneo({ torneo, tienePuntos, trabajando, onGuardar, onCerrar }: {
  torneo?: Torneo;
  tienePuntos?: boolean;
  trabajando: boolean;
  onGuardar: (datos: Omit<Torneo, "id">) => void;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(torneo?.nombre ?? "");
  const [fecha, setFecha] = useState(torneo?.fecha ?? hoyISO());
  const [ambito, setAmbito] = useState<AmbitoTorneo>(torneo?.ambito ?? "interno");
  const [lugar, setLugar] = useState(torneo?.lugar ?? "");
  const [notas, setNotas] = useState(torneo?.notas ?? "");

  const puedeGuardar = nombre.trim().length > 1 && !!fecha && !trabajando;

  return (
    <Modal onClose={onCerrar} ancho="lg">
      <ModalHeader
        titulo={torneo ? "Editar torneo" : "Nuevo torneo"}
        sub={torneo ? undefined : "Después marcas quiénes jugaron"}
        onClose={onCerrar}
      />
      <div className="p-5 space-y-4">
        <Campo label="Nombre">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus
            placeholder="Copa Escuela CCB" className={CLASE_CAMPO} style={CAMPO} />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Fecha">
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={CLASE_CAMPO} style={CAMPO} />
          </Campo>
          <Campo label="Lugar" hint="Opcional">
            <input value={lugar} onChange={(e) => setLugar(e.target.value)}
              placeholder="Country Club de Bogotá" className={CLASE_CAMPO} style={CAMPO} />
          </Campo>
        </div>

        {/* El ámbito define el puntaje, así que cambiarlo con puntos ya dados
            dejaría filas con el baremo del otro tipo. Se bloquea en vez de
            reescribirlas: si de verdad se cargó mal, se borra y se rehace. */}
        <Campo
          label="Tipo de torneo"
          hint={tienePuntos
            ? "No se puede cambiar: ya repartió puntos con este baremo."
            : `Interno: ${PUNTOS_TORNEO.interno.participar} por jugar, ${totalPodio("interno")} con podio · Externo: ${PUNTOS_TORNEO.externo.participar} por jugar, ${totalPodio("externo")} con podio`}
        >
          <div className="flex gap-2">
            {(["interno", "externo"] as AmbitoTorneo[]).map((a) => (
              <button key={a} onClick={() => !tienePuntos && setAmbito(a)} disabled={tienePuntos}
                className="flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
                style={ambito === a
                  ? { background: "var(--g-competencia-bg)", color: "var(--g-competencia-fg)", border: "1px solid var(--ui-gold)" }
                  : { background: "var(--ui-card-alt)", color: "var(--ui-text-2)", border: "1px solid var(--ui-border)" }}>
                <span className="block">{AMBITO_LABEL[a]}</span>
                <span className="block text-[11px] font-normal opacity-80">
                  {a === "interno" ? "Organizado por el club" : "Fuera del club"} · {PUNTOS_TORNEO[a].participar} pts
                </span>
              </button>
            ))}
          </div>
        </Campo>

        <Campo label="Notas" hint="Opcional — categoría, formato, lo que sirva de contexto">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2}
            className={CLASE_CAMPO} style={CAMPO} />
        </Campo>

        <div className="flex gap-2 pt-1">
          <BotonPrimario
            disabled={!puedeGuardar}
            onClick={() => onGuardar({
              nombre: nombre.trim(),
              fecha,
              ambito,
              lugar: lugar.trim() || null,
              notas: notas.trim() || null,
            })}
          >
            {trabajando ? "Guardando…" : torneo ? "Guardar cambios" : "Crear torneo"}
          </BotonPrimario>
          <BotonSecundario onClick={onCerrar} disabled={trabajando}>Cancelar</BotonSecundario>
        </div>
      </div>
    </Modal>
  );
}

/** La pantalla donde se carga el acta: quién jugó y quién subió al podio. */
function DetalleTorneo({
  torneo, filas, alumnos, setAlumnos, onVolver, onEditar, onEliminar, onOtorgar, onQuitar, onError,
}: {
  torneo: Torneo;
  filas: PuntoTorneo[];
  alumnos: Record<string, Alumno>;
  setAlumnos: React.Dispatch<React.SetStateAction<Record<string, Alumno>>>;
  onVolver: () => void;
  onEditar: () => void;
  onEliminar: () => void;
  onOtorgar: (torneo: Torneo, alumno: Alumno, categoria: "torneo" | "podio") => Promise<void>;
  onQuitar: (ids: string[]) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  // La búsqueda guarda con qué texto se resolvió. Comparándolo con lo que hay
  // escrito ahora se sabe si lo que se ve corresponde a la palabra actual o es
  // el resultado de la anterior, sin un booleano aparte que se desincronice.
  const [resultado, setResultado] = useState<{ q: string; alumnos: Alumno[] } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const participantes = useMemo(() => filas.filter((f) => f.categoria === "torneo"), [filas]);
  const podioDe = useMemo(() => {
    const m: Record<string, PuntoTorneo> = {};
    filas.filter((f) => f.categoria === "podio").forEach((f) => { m[f.estudiante_id] = f; });
    return m;
  }, [filas]);

  const faltanNombres = participantes.some((p) => !alumnos[p.estudiante_id]);

  // Los nombres de quienes ya están cargados. Se piden solo los que faltan: al
  // volver a abrir el mismo torneo la caché ya los tiene.
  useEffect(() => {
    if (!faltanNombres) return;
    const ids = participantes.map((p) => p.estudiante_id).filter((id) => !alumnos[id]);
    if (!ids.length) return;
    let vivo = true;
    (async () => {
      const { data, error } = await supabase.from("students").select(CAMPOS_ALUMNO).in("id", ids);
      if (!vivo) return;
      if (error) { onError(error.message); return; }
      setAlumnos((prev) => {
        const n = { ...prev };
        (data as Alumno[] ?? []).forEach((a) => { n[a.id] = a; });
        return n;
      });
    })();
    return () => { vivo = false; };
  }, [faltanNombres, participantes, alumnos, setAlumnos, onError]);

  // Buscador contra la base y no contra el padrón entero: son ~950 alumnos
  // activos y bajarlos completos para escribir tres letras cuesta ~190 KB.
  const q = busqueda.trim();
  useEffect(() => {
    const texto = busqueda.trim();
    if (texto.length < 2) return;
    const id = setTimeout(async () => {
      const { data, error } = await supabase
        .from("students")
        .select(CAMPOS_ALUMNO)
        .eq("status", "activo")
        .ilike("full_name", `%${texto}%`)
        .order("full_name")
        .limit(15);
      if (error) { onError(error.message); return; }
      setResultado({ q: texto, alumnos: (data as Alumno[]) ?? [] });
    }, 250);
    return () => clearTimeout(id);
  }, [busqueda, onError]);

  const resultados = resultado?.q === q ? resultado.alumnos : null;
  const buscando = q.length >= 2 && resultados === null;

  const yaEstan = new Set(participantes.map((p) => p.estudiante_id));
  const sugerencias = (resultados ?? []).filter((a) => !yaEstan.has(a.id));

  const ordenados = [...participantes].sort((a, b) => {
    // Podio arriba: es lo primero que alguien quiere ver del acta.
    const pa = podioDe[a.estudiante_id] ? 0 : 1;
    const pb = podioDe[b.estudiante_id] ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return (alumnos[a.estudiante_id]?.full_name ?? "").localeCompare(alumnos[b.estudiante_id]?.full_name ?? "", "es");
  });

  const puntosRepartidos = filas.reduce((a, f) => a + f.puntos, 0);

  async function agregar(a: Alumno) {
    setOcupado(a.id);
    await onOtorgar(torneo, a, "torneo");
    setOcupado(null);
    setBusqueda("");
    setResultado(null);
  }

  async function alternarPodio(estudianteId: string) {
    const alumno = alumnos[estudianteId];
    if (!alumno) return;
    setOcupado(estudianteId);
    const ya = podioDe[estudianteId];
    if (ya) await onQuitar([ya.id]);
    else await onOtorgar(torneo, alumno, "podio");
    setOcupado(null);
  }

  async function sacar(estudianteId: string) {
    setOcupado(estudianteId);
    // Se va con el punto de podio si lo tenía: dejarlo suelto sería un alumno
    // con podio en un torneo que no jugó.
    await onQuitar(filas.filter((f) => f.estudiante_id === estudianteId).map((f) => f.id));
    setOcupado(null);
  }

  return (
    <Pagina>
      <div className="mb-4">
        <button onClick={onVolver}
          className="flex items-center gap-1.5 text-xs font-semibold mb-3 transition-opacity hover:opacity-70"
          style={{ color: "var(--ui-text-3)" }}>
          <ArrowLeft size={14} /> Todos los torneos
        </button>
        <Encabezado
          icono={Trophy}
          titulo={torneo.nombre}
          bajada={`${fechaLarga(torneo.fecha)}${torneo.lugar ? ` · ${torneo.lugar}` : ""}`}
        >
          <AmbitoBadge ambito={torneo.ambito} />
          <BotonSecundario onClick={onEditar}><Pencil size={14} /> Editar</BotonSecundario>
          <BotonIcono onClick={onEliminar} title="Eliminar torneo"><Trash2 size={16} /></BotonIcono>
        </Encabezado>
      </div>

      {torneo.notas && (
        <p className="text-xs mb-4 px-1" style={{ color: "var(--ui-text-3)" }}>{torneo.notas}</p>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <MetricCard label="Jugaron" value={participantes.length} sub={`${PUNTOS_TORNEO[torneo.ambito].participar} pts c/u`} />
        <MetricCard label="Podio" value={Object.keys(podioDe).length} sub={`+${PUNTOS_TORNEO[torneo.ambito].podio} pts c/u`} />
        <MetricCard label="Puntos" value={puntosRepartidos} sub="repartidos en este torneo" />
      </div>

      <Panel title="Agregar alumnos" sub="Escribe dos letras del nombre">
        <div className="p-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--ui-text-3)" }} />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar alumno por nombre…"
              className={`${CLASE_CAMPO} pl-9`}
              style={CAMPO}
            />
          </div>

          {busqueda.trim().length >= 2 && (
            <div className="mt-2 rounded-lg overflow-hidden" style={{ border: "1px solid var(--ui-border-soft)" }}>
              {buscando ? (
                <p className="px-3 py-3 text-xs" style={{ color: "var(--ui-text-3)" }}>Buscando…</p>
              ) : sugerencias.length === 0 ? (
                <p className="px-3 py-3 text-xs" style={{ color: "var(--ui-text-3)" }}>
                  {(resultados ?? []).length > 0 ? "Todos los que coinciden ya están cargados." : "Ningún alumno activo con ese nombre."}
                </p>
              ) : (
                sugerencias.map((a, i) => (
                  <button key={a.id} onClick={() => agregar(a)} disabled={ocupado === a.id}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-opacity hover:opacity-75 disabled:opacity-40"
                    style={{ background: fondoFila(i) }}>
                    <AvatarAlumno name={a.full_name} fotoUrl={a.foto_url} size={26}
                      fallbackClassName="text-[10px] font-bold bg-(--ui-card-alt) text-(--ui-text-3)" />
                    <span className="text-sm flex-1 min-w-0 truncate" style={{ color: "var(--ui-text)" }}>{a.full_name}</span>
                    <GrupoBadge grupo={calcularGrupo(a.birth_date, a.gender, a.grupo_activo)} />
                    <Plus size={15} style={{ color: "var(--ui-gold)" }} />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </Panel>

      <div className="h-4" />

      <Panel title="Jugaron este torneo" sub={`${participantes.length} alumnos`}>
        {participantes.length === 0 ? (
          <EmptyState msg="Nadie cargado todavía" sub="Busca a los alumnos arriba: al agregarlos reciben el punto de participación." />
        ) : (
          <div>
            {ordenados.map((p, i) => {
              const a = alumnos[p.estudiante_id];
              const enPodio = !!podioDe[p.estudiante_id];
              const total = p.puntos + (podioDe[p.estudiante_id]?.puntos ?? 0);
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5" style={{ background: fondoFila(i) }}>
                  <AvatarAlumno name={a?.full_name ?? "?"} fotoUrl={a?.foto_url} size={32}
                    fallbackClassName="text-[11px] font-bold bg-(--ui-card-alt) text-(--ui-text-3)" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--ui-text)" }}>
                      {a?.full_name ?? "Cargando…"}
                    </p>
                    <div className="flex items-center gap-1.5">
                      {a && <GrupoBadge grupo={calcularGrupo(a.birth_date, a.gender, a.grupo_activo)} />}
                      <span className="text-[11px] font-semibold tabular-nums" style={{ color: enPodio ? "var(--ui-gold)" : "var(--ui-text-3)" }}>
                        +{total} pts
                      </span>
                    </div>
                  </div>

                  <button onClick={() => alternarPodio(p.estudiante_id)} disabled={ocupado === p.estudiante_id || !a}
                    title={enPodio ? "Quitar el podio" : `Marcar podio (+${PUNTOS_TORNEO[torneo.ambito].podio})`}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 shrink-0"
                    style={enPodio
                      ? { background: "var(--ui-gold)", color: "var(--ui-bg)" }
                      : { color: "var(--ui-text-3)", border: "1px solid var(--ui-border)" }}>
                    <Medal size={14} /> Podio
                  </button>

                  <BotonIcono onClick={() => sacar(p.estudiante_id)} title="Sacar del torneo" disabled={ocupado === p.estudiante_id}>
                    <Trash2 size={15} />
                  </BotonIcono>
                </div>
              );
            })}
            <div className="px-4 py-2.5 text-[11px] flex items-center gap-1.5"
              style={{ borderTop: "1px solid var(--ui-border-soft)", color: "var(--ui-text-3)" }}>
              <Users size={12} />
              El podio suma sobre la participación: {PUNTOS_TORNEO[torneo.ambito].participar} + {PUNTOS_TORNEO[torneo.ambito].podio} = {totalPodio(torneo.ambito)} puntos.
            </div>
          </div>
        )}
      </Panel>
    </Pagina>
  );
}
