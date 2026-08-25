"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);

      const res = await fetch("/api/confirm-password-set", { method: "POST" });
      if (!res.ok) throw new Error("No se pudo confirmar el cambio.");

      router.push("/");
      router.refresh();
    } catch {
      setError("No pudimos guardar la contraseña. Intenta de nuevo.");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex flex-col items-center text-center mb-6">
          <Image src="/Paco_transparente.png" alt="CCB" width={64} height={64} className="object-contain mb-2" />
          {/* La misma pantalla sirve para crearla la primera vez y para
              cambiarla después desde el menú, así que el texto no da por
              sentado ninguno de los dos casos. */}
          <h1 className="text-lg font-semibold text-gray-900">Tu contraseña</h1>
          <p className="text-sm text-gray-500 mt-1">Elige una nueva. La usarás para ingresar la próxima vez.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            required
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nueva contraseña (mín. 8 caracteres)"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
          />
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirmar contraseña"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#1a3a2a" }}
          >
            {saving ? "Guardando..." : "Guardar y continuar"}
          </button>
        </form>
      </div>
    </div>
  );
}
