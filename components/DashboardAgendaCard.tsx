"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, Calendar } from "lucide-react";
import {
  GLASS_PANEL, GLASS_TITLE, GLASS_SUBTITLE, GLASS_MUTED, GLASS_DIVIDER,
} from "@/lib/dashboard-glass";

type TipoPlan = "juvenil" | "competencia" | "damas";

const TIPO_SESION_LABEL: Record<string, string> = {
  tiro_largo: "Tiro Largo", juego_corto: "Juego Corto", putt: "Putt",
  campo: "Campo", test_tecnico: "Test Técnico", test_fisico: "Test Físico", trabajo_fisico: "Trabajo Físico",
  competencia: "Competencia", damas_estaciones: "Estaciones", juvenil_estaciones: "3 Estaciones",
};
const LUGAR_LABEL: Record<string, string> = {
  campo_practica: "Campo de práctica", putting_green: "Putting Green",
  campo_infantil: "Campo Infantil", campo_pacos_fabios: "Pacos/Fabios",
  campo_completo: "Campo Completo",
};
const TIPO_PLAN_LABEL: Record<TipoPlan, string> = { juvenil: "Juvenil", competencia: "Competencia", damas: "Damas" };
const TIPO_PLAN_COLOR: Record<TipoPlan, string> = { juvenil: "#1B4D2E", competencia: "#1e40af", damas: "#86198f" };

function formatHora(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

function duracionMin(inicio: string | null, fin: string | null): number | null {
  if (!inicio || !fin) return null;
  const [h1, m1] = inicio.split(":").map(Number);
  const [h2, m2] = fin.split(":").map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
}

// Mismo ancla a mediodía que el resto del dashboard para que el día
// calendario no se corra por la zona horaria del proceso que renderiza.
function diaLabelFromFecha(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00`);
  const label = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "short" })
    .format(d)
    .replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export type AgendaSesion = {
  id: string;
  fecha: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  tipo_sesion: string;
  lugar: string;
  objetivo: string | null;
  tipo_plan: TipoPlan | null;
};

function SesionRow({ s }: { s: AgendaSesion }) {
  const color = s.tipo_plan ? TIPO_PLAN_COLOR[s.tipo_plan] : "#9ca3af";
  const dur = duracionMin(s.hora_inicio, s.hora_fin);
  return (
    <div className="flex gap-3">
      <div className="w-14 shrink-0 text-right">
        <p className="text-sm font-bold" style={{ color: GLASS_TITLE }}>{formatHora(s.hora_inicio)}</p>
        {dur !== null && <p className="text-[10px]" style={{ color: GLASS_MUTED }}>{dur} min</p>}
      </div>
      <div className="w-1 rounded-full shrink-0" style={{ background: color }} />
      <div className="flex-1 min-w-0 pb-3 border-b last:border-0 last:pb-0" style={{ borderColor: GLASS_DIVIDER }}>
        <p className="text-sm font-semibold" style={{ color: GLASS_TITLE }}>
          {s.tipo_plan ? `${TIPO_PLAN_LABEL[s.tipo_plan]} — ` : ""}
          {TIPO_SESION_LABEL[s.tipo_sesion] ?? s.tipo_sesion}
        </p>
        <p className="text-xs mt-0.5" style={{ color: GLASS_MUTED }}>
          {LUGAR_LABEL[s.lugar] ?? s.lugar}
          {s.objetivo ? ` · ${s.objetivo}` : ""}
        </p>
      </div>
    </div>
  );
}

export default function DashboardAgendaCard({
  sesionesHoy,
  sesionesSemana,
  fechaLabel,
  hoy,
}: {
  sesionesHoy: AgendaSesion[];
  sesionesSemana: AgendaSesion[];
  fechaLabel: string;
  hoy: string;
}) {
  const [tab, setTab] = useState<"hoy" | "semana">("hoy");

  const porDia = new Map<string, AgendaSesion[]>();
  for (const s of sesionesSemana) {
    const list = porDia.get(s.fecha) ?? [];
    list.push(s);
    porDia.set(s.fecha, list);
  }
  const dias = Array.from(porDia.keys()).sort();

  return (
    <div className={`${GLASS_PANEL} border-t-[3px] p-4 sm:p-6`} style={{ borderTopColor: "#1B4D2E" }}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: GLASS_TITLE }}>
          <Clock size={15} style={{ color: "#1B4D2E" }} />
          Agenda
        </h2>
        <div className="flex items-center gap-0.5 rounded-full p-0.5 bg-white/50 border border-white/60 shrink-0">
          <button
            type="button"
            onClick={() => setTab("hoy")}
            className="text-xs font-medium px-2.5 py-1 rounded-full transition-colors"
            style={tab === "hoy" ? { background: "#1B4D2E", color: "#fff" } : { color: GLASS_SUBTITLE }}
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setTab("semana")}
            className="text-xs font-medium px-2.5 py-1 rounded-full transition-colors"
            style={tab === "semana" ? { background: "#1B4D2E", color: "#fff" } : { color: GLASS_SUBTITLE }}
          >
            Semana
          </button>
        </div>
      </div>

      {tab === "hoy" ? (
        <>
          <p className="text-xs mb-4" style={{ color: GLASS_MUTED }}>{fechaLabel}</p>
          {sesionesHoy.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10" style={{ color: GLASS_MUTED }}>
              <Calendar size={28} className="mb-2 opacity-40" />
              <p className="text-sm">No hay sesiones programadas para hoy</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sesionesHoy.map((s) => (
                <SesionRow key={s.id} s={s} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="mt-3">
          {dias.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10" style={{ color: GLASS_MUTED }}>
              <Calendar size={28} className="mb-2 opacity-40" />
              <p className="text-sm">No hay sesiones programadas esta semana</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
              {dias.map((fecha) => (
                <div key={fecha}>
                  <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: fecha === hoy ? "#1B4D2E" : GLASS_MUTED }}>
                    {diaLabelFromFecha(fecha)}
                    {fecha === hoy ? " · Hoy" : ""}
                  </p>
                  <div className="space-y-3">
                    {(porDia.get(fecha) ?? []).map((s) => (
                      <SesionRow key={s.id} s={s} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Link
        href="/programacion"
        className="mt-4 flex items-center justify-center gap-1 text-sm font-semibold text-ccb-green hover:underline"
      >
        Ver programación completa →
      </Link>
    </div>
  );
}
