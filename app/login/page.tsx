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
  return null;
}

export default function LoginPage() {
  const [staffMode, setStaffMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionDays, setSessionDays] = useState<number | null>(30);

  useEffect(() => {
    supabase.from("app_config").select("value").eq("key", "session_days").maybeSingle().then(({ data }) => {
      if (data) setSessionDays(data.value ? Number(data.value) : null);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    try {
      if (staffMode) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(error.message);
        window.location.href = "/auth/callback";
        return;
      }
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw new Error(error.message);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : staffMode ? "Email o contraseña incorrectos." : "No pudimos enviar el link. Intenta de nuevo.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex flex-col items-center text-center mb-6">
          <Image src="/Paco_transparente.png" alt="CCB" width={64} height={64} className="object-contain mb-2" />
          <h1 className="text-lg font-semibold text-gray-900">Escuela de Golf CCB</h1>
          <p className="text-sm text-gray-500 mt-1">Ingresa tu email para acceder</p>
        </div>

        <Suspense fallback={null}>
          <LoginNotice />
        </Suspense>

        {sent ? (
          <div className="text-center py-2">
            <p className="text-sm text-gray-700">
              Te enviamos un link a <span className="font-medium">{email}</span>.
            </p>
            <p className="text-sm text-gray-500 mt-1">Revisa tu bandeja de entrada.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
            />
            {staffMode && (
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
              />
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={sending}
              className="w-full px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#1a3a2a" }}
            >
              {sending ? "Ingresando..." : staffMode ? "Ingresar" : "Enviar link de acceso"}
            </button>
            {!staffMode && <p className="text-[11px] text-gray-400 text-center">{sessionDaysNote(sessionDays)}</p>}
            <button
              type="button"
              onClick={() => { setStaffMode((v) => !v); setError(null); setPassword(""); }}
              className="w-full text-[11px] text-gray-400 text-center underline"
            >
              {staffMode ? "Ingresar con link por email" : "¿Eres staff? Ingresa con contraseña"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
