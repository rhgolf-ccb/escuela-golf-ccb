"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ROLE_ALLOW, STAFF_ROLES, type Rol } from "@/lib/roles";

type Tab = "usuarios" | "roles" | "registro";

const ROL_LABEL: Record<Rol, string> = {
  coordinador: "Coordinador",
  profesor: "Profesor",
  administrativo: "Administrativo",
  padre_competencia: "Padre (Competencia)",
  padre_otros: "Padre (Otros grupos)",
  alumno_competencia: "Alumno (Competencia)",
};

const ROLES: Rol[] = ["coordinador", "profesor", "administrativo", "padre_competencia", "padre_otros", "alumno_competencia"];

type AppUser = {
  id: string;
  email: string;
  nombre: string | null;
  rol: Rol;
  activo: boolean;
  last_sign_in: string | null;
  created_at: string;
};

type StudentSearch = { id: string; full_name: string; grupo_activo: string | null };

type AccessLog = {
  id: string;
  accion: string;
  detalle: string | null;
  created_at: string;
  app_users: { email: string } | { email: string }[] | null;
};

function formatFecha(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isParentRole(rol: Rol): boolean {
  return rol === "padre_competencia" || rol === "padre_otros" || rol === "alumno_competencia";
}

export default function AccesosModule({ currentUserId, initialSessionDays }: { currentUserId: string; initialSessionDays: number | null }) {
  const [tab, setTab] = useState<Tab>("usuarios");
  const [users, setUsers] = useState<AppUser[]>([]);
  const [vinculos, setVinculos] = useState<Record<string, string[]>>({});
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [sessionDays, setSessionDays] = useState<string>(initialSessionDays?.toString() ?? "");
  const [savingConfig, setSavingConfig] = useState(false);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteNombre, setInviteNombre] = useState("");
  const [inviteRol, setInviteRol] = useState<Rol>("padre_otros");
  const [inviteEstudiantes, setInviteEstudiantes] = useState<StudentSearch[]>([]);
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteResults, setInviteResults] = useState<StudentSearch[]>([]);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pwdTarget, setPwdTarget] = useState<AppUser | null>(null);
  const [pwdValue, setPwdValue] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500); }

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    const { data } = await supabase.from("app_users").select("*").order("created_at", { ascending: false });
    setUsers((data as AppUser[]) ?? []);
    const { data: links } = await supabase.from("user_estudiantes").select("user_id, students(full_name)");
    const map: Record<string, string[]> = {};
    (links ?? []).forEach((l) => {
      const st = Array.isArray(l.students) ? l.students[0] : l.students;
      if (!st) return;
      (map[l.user_id] ??= []).push(st.full_name);
    });
    setVinculos(map);
    setLoadingUsers(false);
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    const { data } = await supabase
      .from("access_logs")
      .select("id, accion, detalle, created_at, app_users(email)")
      .order("created_at", { ascending: false })
      .limit(100);
    setLogs((data as unknown as AccessLog[]) ?? []);
    setLoadingLogs(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { if (tab === "registro") fetchLogs(); }, [tab, fetchLogs]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (inviteSearch.length < 2) { setInviteResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("students")
        .select("id, full_name, grupo_activo")
        .ilike("full_name", `%${inviteSearch}%`)
        .eq("status", "activo")
        .order("full_name")
        .limit(10);
      setInviteResults((data as StudentSearch[]) ?? []);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [inviteSearch]);

  function resetInvite() {
    setInviteEmail(""); setInviteNombre(""); setInviteRol("padre_otros");
    setInviteEstudiantes([]); setInviteSearch(""); setInviteResults([]); setInviteError(null);
  }

  async function handleInvite() {
    setInviteSaving(true); setInviteError(null);
    const res = await fetch("/api/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: inviteEmail.trim(),
        nombre: inviteNombre.trim() || null,
        rol: inviteRol,
        estudianteIds: inviteEstudiantes.map((s) => s.id),
      }),
    });
    const body = await res.json();
    if (!res.ok) { setInviteError(body.error ?? "Error al invitar"); setInviteSaving(false); return; }
    showToast(`${inviteEmail} invitado ✓`);
    setInviteSaving(false); setShowInvite(false); resetInvite();
    await fetchUsers();
  }

  async function handleToggleActivo(u: AppUser) {
    const action = u.activo ? "suspend" : "reactivate";
    const res = await fetch("/api/revoke-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.id, action }),
    });
    const body = await res.json();
    if (!res.ok) { showToast(body.error ?? "Error"); return; }
    showToast(u.activo ? "Usuario suspendido" : "Usuario reactivado");
    await fetchUsers();
  }

  async function handleSetPassword() {
    if (!pwdTarget) return;
    setPwdSaving(true); setPwdError(null);
    const res = await fetch("/api/set-staff-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pwdTarget.email, password: pwdValue }),
    });
    const body = await res.json();
    if (!res.ok) { setPwdError(body.error ?? "Error"); setPwdSaving(false); return; }
    showToast("Contraseña actualizada");
    setPwdSaving(false); setPwdTarget(null); setPwdValue("");
  }

  async function handleSaveConfig() {
    setSavingConfig(true);
    const value = sessionDays.trim() === "" ? null : sessionDays.trim();
    await supabase.from("app_config").upsert({ key: "session_days", value });
    showToast("Configuración guardada");
    setSavingConfig(false);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Accesos</h1>
      <p className="text-sm text-gray-400 mb-6">Gestión de usuarios, roles y registro de actividad</p>

      <div className="flex gap-1 mb-6 border-b border-gray-100">
        {([
          { id: "usuarios", label: "Usuarios" },
          { id: "roles", label: "Roles y Permisos" },
          { id: "registro", label: "Registro de accesos" },
        ] as { id: Tab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2 text-sm font-semibold border-b-2 transition-colors"
            style={tab === t.id ? { borderColor: "#1a3a2a", color: "#1a3a2a" } : { borderColor: "transparent", color: "#9ca3af" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "usuarios" && (
        <div>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Duración de sesión (días)</label>
              <input
                type="number"
                value={sessionDays}
                onChange={(e) => setSessionDays(e.target.value)}
                placeholder="sin límite"
                className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
              />
              <button
                onClick={handleSaveConfig}
                disabled={savingConfig}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
              >
                {savingConfig ? "..." : "Guardar"}
              </button>
            </div>
            <button
              onClick={() => setShowInvite(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: "#1a3a2a" }}
            >
              + Invitar usuario
            </button>
          </div>

          {loadingUsers ? (
            <p className="text-sm text-gray-400 text-center py-10">Cargando...</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="divide-y divide-gray-50">
                {users.map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{u.nombre || u.email}</p>
                      <p className="text-xs text-gray-400">{u.email} · {ROL_LABEL[u.rol]}</p>
                      {vinculos[u.id]?.length > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">Alumnos: {vinculos[u.id].join(", ")}</p>
                      )}
                      <p className="text-[11px] text-gray-300 mt-0.5">Último ingreso: {formatFecha(u.last_sign_in)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="text-xs font-semibold px-2 py-1 rounded-full"
                        style={u.activo ? { background: "#dcfce7", color: "#166534" } : { background: "#fee2e2", color: "#991b1b" }}
                      >
                        {u.activo ? "Activo" : "Suspendido"}
                      </span>
                      {STAFF_ROLES.includes(u.rol) && (
                        <button
                          onClick={() => { setPwdTarget(u); setPwdValue(""); setPwdError(null); }}
                          className="text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1"
                        >
                          Fijar contraseña
                        </button>
                      )}
                      {u.id !== currentUserId && (
                        <button
                          onClick={() => handleToggleActivo(u)}
                          className="text-xs font-semibold rounded-lg px-2.5 py-1 border"
                          style={u.activo ? { color: "#991b1b", borderColor: "#fecaca" } : { color: "#166534", borderColor: "#bbf7d0" }}
                        >
                          {u.activo ? "Suspender" : "Reactivar"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {users.length === 0 && <p className="text-sm text-gray-400 text-center py-10">Sin usuarios todavía.</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "roles" && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {ROLES.map((r) => {
              const allow = ROLE_ALLOW[r];
              return (
                <div key={r} className="px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900">{ROL_LABEL[r]}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {allow === "all" ? "Acceso completo a todos los módulos" : `Acceso a: ${allow.join(", ")}`}
                    {r === "coordinador" || r === "administrativo" ? " + Accesos" : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "registro" && (
        loadingLogs ? (
          <p className="text-sm text-gray-400 text-center py-10">Cargando...</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-50">
              {logs.map((log) => {
                const au = Array.isArray(log.app_users) ? log.app_users[0] : log.app_users;
                return (
                  <div key={log.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-gray-900">{au?.email ?? "—"} · <span className="font-semibold">{log.accion}</span></p>
                      {log.detalle && <p className="text-xs text-gray-400">{log.detalle}</p>}
                    </div>
                    <p className="text-xs text-gray-400 shrink-0">{formatFecha(log.created_at)}</p>
                  </div>
                );
              })}
              {logs.length === 0 && <p className="text-sm text-gray-400 text-center py-10">Sin actividad registrada.</p>}
            </div>
          </div>
        )
      )}

      {showInvite && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { if (!inviteSaving) { setShowInvite(false); resetInvite(); } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-4">Invitar usuario</h3>
            <div className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="Nombre (opcional)"
                value={inviteNombre}
                onChange={(e) => setInviteNombre(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              <select
                value={inviteRol}
                onChange={(e) => setInviteRol(e.target.value as Rol)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                {ROLES.map((r) => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
              </select>

              {isParentRole(inviteRol) && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Alumno(s) vinculado(s)</p>
                  {inviteEstudiantes.map((s) => (
                    <div key={s.id} className="flex items-center justify-between px-3 py-1.5 mb-1 bg-green-50 border border-green-200 rounded-lg">
                      <span className="text-xs font-medium text-green-800">{s.full_name}</span>
                      <button onClick={() => setInviteEstudiantes((prev) => prev.filter((x) => x.id !== s.id))} className="text-green-500 hover:text-green-700 text-xs">✕</button>
                    </div>
                  ))}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Buscar alumno por nombre..."
                      value={inviteSearch}
                      onChange={(e) => setInviteSearch(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                    {inviteResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                        {inviteResults.filter((r) => !inviteEstudiantes.some((s) => s.id === r.id)).map((s) => (
                          <button
                            key={s.id}
                            onClick={() => { setInviteEstudiantes((prev) => [...prev, s]); setInviteSearch(""); setInviteResults([]); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                          >
                            {s.full_name} <span className="text-xs text-gray-400">{s.grupo_activo}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {inviteError && <p className="text-xs text-red-600">{inviteError}</p>}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={handleInvite}
                disabled={inviteSaving || !inviteEmail.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "#1a3a2a" }}
              >
                {inviteSaving ? "Invitando..." : "Invitar"}
              </button>
              <button
                onClick={() => { setShowInvite(false); resetInvite(); }}
                disabled={inviteSaving}
                className="px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {pwdTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { if (!pwdSaving) setPwdTarget(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-1">Fijar contraseña</h3>
            <p className="text-xs text-gray-500 mb-4">{pwdTarget.email}</p>
            <input
              type="password"
              placeholder="Nueva contraseña (mín. 8 caracteres)"
              value={pwdValue}
              onChange={(e) => setPwdValue(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            {pwdError && <p className="text-xs text-red-600 mt-2">{pwdError}</p>}
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSetPassword}
                disabled={pwdSaving || pwdValue.length < 8}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "#1a3a2a" }}
              >
                {pwdSaving ? "Guardando..." : "Guardar"}
              </button>
              <button
                onClick={() => setPwdTarget(null)}
                disabled={pwdSaving}
                className="px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
