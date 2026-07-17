"use client";

import { useEffect, useState } from "react";
import { Sun, CloudSun, Cloud, CloudFog, CloudRain, CloudLightning, type LucideIcon } from "lucide-react";

const LAT = 4.7110;
const LON = -74.0721;
const WEATHER_URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=America/Bogota&forecast_days=3`;

interface Current {
  temperature: number;
  code: number;
}

interface DailyForecast {
  code: number;
  max: number;
  min: number;
  label: string;
}

function weatherInfo(code: number): { Icon: LucideIcon; label: string } {
  if (code === 0) return { Icon: Sun, label: "Despejado" };
  if (code === 1 || code === 2) return { Icon: CloudSun, label: "Parcial" };
  if (code === 3) return { Icon: Cloud, label: "Nublado" };
  if (code === 45 || code === 48) return { Icon: CloudFog, label: "Niebla" };
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return { Icon: CloudRain, label: "Lluvia" };
  if ([95, 96, 99].includes(code)) return { Icon: CloudLightning, label: "Tormenta" };
  return { Icon: Cloud, label: "—" };
}

function diaLabel(index: number, fecha: string): string {
  if (index === 0) return "Hoy";
  if (index === 1) return "Mañana";
  const d = new Date(`${fecha}T12:00:00`);
  const label = new Intl.DateTimeFormat("es-CO", { weekday: "short" }).format(d);
  return label.charAt(0).toUpperCase() + label.slice(1).replace(".", "");
}

export default function WeatherChip() {
  const [current, setCurrent] = useState<Current | null>(null);
  const [forecast, setForecast] = useState<DailyForecast[] | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(WEATHER_URL)
      .then((res) => {
        if (!res.ok) throw new Error("weather fetch failed");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setCurrent({
          temperature: data.current.temperature_2m,
          code: data.current.weather_code,
        });
        const dias: DailyForecast[] = data.daily.time.map((fecha: string, i: number) => ({
          code: data.daily.weather_code[i],
          max: data.daily.temperature_2m_max[i],
          min: data.daily.temperature_2m_min[i],
          label: diaLabel(i, fecha),
        }));
        setForecast(dias);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error || !current) return null;

  const { Icon, label } = weatherInfo(current.code);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-[10px] bg-white/20 backdrop-blur px-2.5 py-1.5 text-white cursor-pointer hover:bg-white/30 transition-colors"
        aria-label={`Clima en Bogotá: ${label}, ${Math.round(current.temperature)} grados`}
      >
        <Icon size={16} />
        <span className="text-sm font-semibold">{Math.round(current.temperature)}°</span>
      </button>

      {open && forecast && (
        <div className="absolute right-0 top-full mt-2 w-52 rounded-xl bg-white shadow-lg p-3 z-50">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Bogotá · 3 días</p>
          <div className="space-y-2">
            {forecast.map((dia, i) => {
              const info = weatherInfo(dia.code);
              const DiaIcon = info.Icon;
              return (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <DiaIcon size={16} className="text-ccb-green shrink-0" />
                    <span className="text-xs font-medium text-gray-700">{dia.label}</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {Math.round(dia.max)}° / {Math.round(dia.min)}°
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
