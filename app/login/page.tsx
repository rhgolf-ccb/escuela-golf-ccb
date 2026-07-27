"use client";

import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function sessionDaysNote(days: number | null): string {
  if (!days) return "Tu acceso queda activo hasta que el coordinador lo revoque.";
  return `Una vez ingreses, tu acceso será válido por ${days} días.`;
}

function LoginNotice() {
  const params = useSearchParams();
  if (params.get("blocked")) {
    return (
      <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
        Tu cuenta fue suspendida. Contacta al coordinador de la escuela.
      </p>
    );
  }
  if (params.get("expired")) {
    return (
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
        Tu sesión expiró. Ingresa tu email de nuevo para recibir un nuevo link.
      </p>
    );
  }
  if (params.get("error") === "link_invalid") {
    return (
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
        Ese enlace ya no es válido — pudo haberse abierto desde otra app o dispositivo, o ya fue usado.
        Ingresa tu email para recibir uno nuevo. Si acabas de pedir uno, espera un minuto antes de reenviar.
      </p>
    );
  }
  return null;
}

type Step = "email" | "password" | "sent";

export default function LoginPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionDays, setSessionDays] = useState<number | null>(30);

  useEffect(() => {
    supabase.from("app_config").select("value").eq("key", "session_days").maybeSingle().then(({ data }) => {
      if (data) setSessionDays(data.value ? Number(data.value) : null);
    });
  }, []);

  async function sendLoginLink() {
    const res = await fetch("/api/send-login-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    if (!res.ok) throw new Error("No pudimos enviar el link.");
    setStep("sent");
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/check-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.found) {
        setError("Este correo no tiene acceso autorizado.");
        return;
      }

      if (data.passwordSet) {
        setStep("password");
        return;
      }

      await sendLoginLink();
    } catch {
      setError("No pudimos verificar tu correo. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: pwError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (pwError) throw new Error(pwError.message);
      window.location.href = "/auth/callback";
    } catch {
      setError("Email o contraseña incorrectos.");
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setLoading(true);
    setError(null);
    try {
      await sendLoginLink();
    } catch {
      setError("No pudimos enviar el link. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  function backToEmail() {
    setStep("email");
    setPassword("");
    setError(null);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-sm bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex flex-col items-center text-center mb-6">
          <Image src="/Paco_transparente.png" alt="CCB" width={64} height={64} className="object-contain mb-2" />
          <h1 className="text-lg font-semibold text-gray-900">Escuela de Golf CCB</h1>
          <p className="text-sm text-gray-500 mt-1">Ingresa tu email para acceder</p>
        </div>

        <Suspense fallback={null}>
          <LoginNotice />
        </Suspense>

        {step === "sent" ? (
          <div className="text-center py-2">
            <p className="text-sm text-gray-700">
              Te enviamos un link a <span className="font-medium">{email}</span>.
            </p>
            <p className="text-sm text-gray-500 mt-1">Revisa tu bandeja de entrada.</p>
          </div>
        ) : step === "password" ? (
          <form onSubmit={handlePasswordSubmit} className="space-y-3">
            <p className="text-xs text-gray-500 text-center">
              {email} <button type="button" onClick={backToEmail} className="underline">Cambiar</button>
            </p>
            <input
              type="password"
              required
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#1a3a2a" }}
            >
              {loading ? "Ingresando..." : "Ingresar"}
            </button>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={loading}
              className="w-full text-[11px] text-gray-400 text-center underline"
            >
              ¿Olvidaste tu contraseña o nunca la creaste? Ingresa con un link por correo
            </button>
          </form>
        ) : (
          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#1a3a2a" }}
            >
              {loading ? "Verificando..." : "Continuar"}
            </button>
            <p className="text-[11px] text-gray-400 text-center">{sessionDaysNote(sessionDays)}</p>
          </form>
        )}
      </div>

      {/* Powered by RHGOLF */}
      <div className="mt-6 flex flex-col items-center gap-1">
        <Image src="/rh-monograma.png" alt="RH Golf" width={52} height={37} className="object-contain opacity-90" />
        <p className="text-[10px] tracking-[0.22em] text-gray-400 font-medium">
          POWERED BY <span className="font-semibold" style={{ color: "#B8860B" }}>RHGOLF</span>
        </p>
      </div>
    </div>
  );
}
