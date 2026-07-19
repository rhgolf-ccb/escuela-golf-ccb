"use client";

import { useCallback, useEffect, useState } from "react";
import { Sun, CloudSun, Cloud, CloudFog, CloudRain, CloudLightning, Loader2, RotateCw, type LucideIcon } from "lucide-react";

const FALLBACK = { lat: 4.7040, lon: -74.0420, nombre: "Country Club de Bogotá" };

interface Coords {
  lat: number;
  lon: number;
  esFallback: boolean;
}

interface DailyForecast {
  code: number;
  max: number;
  min: number;
  probLluvia: number;
  label: string;
}

interface Clima {
  temperatura: number;
  sensacion: number;
  humedad: number;
  precipitacion: number;
  code: number;
  viento: number;
  max: number;
  min: number;
  probLluvia: number;
  hora: string;
  fuente: string;
  dias: DailyForecast[];
}

type Estado = "cargando" | "ok" | "error";

function obtenerCoords(): Promise<Coords> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ ...FALLBACK, esFallback: true });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, esFallback: false }),
      () => resolve({ ...FALLBACK, esFallback: true }),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  });
}

function diaLabel(index: number, fecha: string): string {
  if (index === 0) return "Hoy";
  if (index === 1) return "Mañana";
  const d = new Date(`${fecha}T12:00:00`);
  const label = new Intl.DateTimeFormat("es-CO", { weekday: "short" }).format(d);
  return label.charAt(0).toUpperCase() + label.slice(1).replace(".", "");
}

async function fetchOpenMeteo(lat: number, lon: number) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("weather fetch failed");
  const data = await res.json();
  const dias: DailyForecast[] = data.daily.time.map((fecha: string, i: number) => ({
    code: data.daily.weather_code[i],
    max: data.daily.temperature_2m_max[i],
    min: data.daily.temperature_2m_min[i],
    probLluvia: data.daily.precipitation_probability_max[i],
    label: diaLabel(i, fecha),
  }));
  return {
    temperatura: data.current.temperature_2m,
    sensacion: data.current.apparent_temperature,
    humedad: data.current.relative_humidity_2m,
    precipitacion: data.current.precipitation,
    code: data.current.weather_code,
    viento: data.current.wind_speed_10m,
    max: data.daily.temperature_2m_max[0],
    min: data.daily.temperature_2m_min[0],
    probLluvia: data.daily.precipitation_probability_max[0],
    hora: new Date(data.current.time).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
    dias,
  };
}

function weatherInfo(code: number): { Icon: LucideIcon; label: string } {
  if (code === 0) return { Icon: Sun, label: "Despejado" };
  if (code === 1 || code === 2) return { Icon: CloudSun, label: "Parcialmente nublado" };
  if (code === 3) return { Icon: Cloud, label: "Nublado" };
  if (code === 45 || code === 48) return { Icon: CloudFog, label: "Niebla" };
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return { Icon: CloudRain, label: "Lluvia" };
  if ([95, 96, 99].includes(code)) return { Icon: CloudLightning, label: "Tormenta" };
  return { Icon: Cloud, label: "—" };
}

export default function WeatherChip() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [clima, setClima] = useState<Clima | null>(null);
  const [open, setOpen] = useState(false);

  const cargar = useCallback(async () => {
    const coords = await obtenerCoords();
    try {
      const data = await fetchOpenMeteo(coords.lat, coords.lon);
      setClima({ ...data, fuente: coords.esFallback ? FALLBACK.nombre : "Tu ubicación" });
      setEstado("ok");
    } catch {
      setEstado("error");
    }
  }, []);

  const reintentar = useCallback(() => {
    setEstado("cargando");
    cargar();
  }, [cargar]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount pattern
    cargar();
  }, [cargar]);

  if (estado === "cargando") {
    return (
      <div className="flex items-center gap-1.5 rounded-[10px] bg-white/20 backdrop-blur px-2.5 py-1.5 text-white">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  if (estado === "error" || !clima) {
    return (
      <button
        onClick={reintentar}
        className="flex items-center gap-1.5 rounded-[10px] bg-white/20 backdrop-blur px-2.5 py-1.5 text-white cursor-pointer hover:bg-white/30 transition-colors"
        aria-label="No se pudo cargar el clima, reintentar"
      >
        <span className="text-xs">Clima no disponible</span>
        <RotateCw size={14} />
      </button>
    );
  }

  const { Icon, label } = weatherInfo(clima.code);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-[10px] bg-white/20 backdrop-blur px-2.5 py-1.5 text-white cursor-pointer hover:bg-white/30 transition-colors"
        aria-label={`Clima en ${clima.fuente}: ${label}, ${Math.round(clima.temperatura)} grados`}
      >
        <Icon size={16} />
        <span className="text-sm font-semibold">{Math.round(clima.temperatura)}°</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-white shadow-lg p-3 z-50">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            {clima.fuente} · {clima.hora}
          </p>
          <div className="flex items-center gap-2 mb-2">
            <Icon size={22} className="text-ccb-green shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-800">{Math.round(clima.temperatura)}° · {label}</p>
              <p className="text-xs text-gray-500">Sensación {Math.round(clima.sensacion)}°</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-y-1 text-xs text-gray-600 mb-3">
            <span>Máx / mín</span>
            <span className="text-right font-medium text-gray-700">
              {Math.round(clima.max)}° / {Math.round(clima.min)}°
            </span>
            <span>Prob. lluvia</span>
            <span className="text-right font-medium text-gray-700">{Math.round(clima.probLluvia)}%</span>
            <span>Viento</span>
            <span className="text-right font-medium text-gray-700">{Math.round(clima.viento)} km/h</span>
          </div>

          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 pt-2 border-t border-gray-100">
            Pronóstico 3 días
          </p>
          <div className="space-y-2">
            {clima.dias.map((dia, i) => {
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
