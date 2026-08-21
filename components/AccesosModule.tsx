"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Shield, Users, KeyRound, ScrollText, UserPlus, Trash2, X } from "lucide-react";
import {
  Badge, BotonPrimario, BotonSecundario, CAMPO, CLASE_CAMPO, Campo, EmptyState,
  Encabezado, Loading, Modal, ModalHeader, Pagina, Panel, Tabs, Toast,
} from "@/components/ui/tema";
import { supabase } from "@/lib/supabase";
import { ROLE_ALLOW, STAFF_ROLES, type Rol } from "@/lib/roles";

type Tab = "usuarios" | "roles" | "registro";

const ROL_LABEL: Record<Rol, string> = {
  coordinador: "Coordinador",
  director: "Director de Golf",
  profesor: "Profesor",
  administrativo: "Administrativo",
  padre_competencia: "Padre (Competencia)",
  padre_otros: "Padre (Otros grupos)",
  alumno_competencia: "Alumno (Competencia)",
};

const ROLES: Rol[] = ["coordinador", "director", "profesor", "administrativo", "padre_competencia", "padre_otros", "alumno_competencia"];

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

  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    showToast(body.emailWarning ? `${inviteEmail} creado, pero el email falló: ${body.emailWarning}` : `${inviteEmail} invitado ✓`);
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

  async function handleDeleteUser() {
    if (!deleteTarget) return;
    setDeleteSaving(true); setDeleteError(null);
    const res = await fetch("/api/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: deleteTarget.id }),
    });
    const body = await res.json();
    if (!res.ok) { setDeleteError(body.error ?? "Error"); setDeleteSaving(false); return; }
    showToast("Usuario eliminado");
    setDeleteSaving(false); setDeleteTarget(null);
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

  // El listado mezclaba staff y familias en una sola lista plana, y son dos
  // cosas distintas: el staff entra a los módulos, las familias solo ven a su
  // alumno. Se separan y cada grupo dice cuántos hay.
  const { staff, familias } = useMemo(() => ({
    staff: users.filter((u) => STAFF_ROLES.includes(u.rol)),
    familias: users.filter((u) => !STAFF_ROLES.includes(u.rol)),
  }), [users]);

  function FilaUsuario({ u }: { u: AppUser }) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap"
        style={{ borderTop: "1px solid var(--ui-border-soft)" }}>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--ui-text)" }}>{u.nombre || u.email}</p>
          <p className="text-xs" style={{ color: "var(--ui-text-3)" }}>{u.email} · {ROL_LABEL[u.rol]}</p>
          {vinculos[u.id]?.length > 0 && (
            <p className="text-xs mt-0.5" style={{ color: "var(--ui-text-2)" }}>Alumnos: {vinculos[u.id].join(", ")}</p>
          )}
          <p className="text-[11px] mt-0.5" style={{ color: "var(--ui-text-3)" }}>
            {u.last_sign_in ? `Último ingreso: ${formatFecha(u.last_sign_in)}` : "Nunca ha entrado"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Badge label={u.activo ? "Activo" : "Suspendido"} tono={u.activo ? "ok" : "bad"} />
          {STAFF_ROLES.includes(u.rol) && (
            <button
              onClick={() => { setPwdTarget(u); setPwdValue(""); setPwdError(null); }}
              className="text-xs font-semibold rounded-lg px-2.5 py-1 transition-colors hover:bg-(--ui-card-alt)"
              style={{ color: "var(--ui-text-2)", border: "1px solid var(--ui-border)" }}>
              Fijar contraseña
            </button>
          )}
          {u.id !== currentUserId && (
            <button
              onClick={() => handleToggleActivo(u)}
              className="text-xs font-semibold rounded-lg px-2.5 py-1 transition-opacity hover:opacity-80"
              style={u.activo
                ? { color: "var(--ui-warn)", border: "1px solid var(--ui-warn)" }
                : { color: "var(--ui-ok)", border: "1px solid var(--ui-ok)" }}>
              {u.activo ? "Suspender" : "Reactivar"}
            </button>
          )}
          {u.id !== currentUserId && (
            <button
              onClick={() => { setDeleteTarget(u); setDeleteError(null); }}
              title="Eliminar usuario"
              className="p-1.5 rounded-lg transition-colors hover:bg-(--ui-bad-bg)"
              style={{ color: "var(--ui-text-3)" }}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Pagina>
      <Toast msg={toast} />

      <Encabezado icono={Shield} titulo="Accesos" bajada="Usuarios, roles y registro de actividad">
        <BotonPrimario onClick={() => setShowInvite(true)}>
          <UserPlus size={16} />
          Invitar usuario
        </BotonPrimario>
      </Encabezado>

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { id: "usuarios" as Tab, label: "Usuarios", icono: Users, count: users.length, hint: "Quién puede entrar y con qué alcance" },
          { id: "roles" as Tab, label: "Roles y permisos", icono: KeyRound, hint: "Qué módulos abre cada rol" },
          { id: "registro" as Tab, label: "Registro", icono: ScrollText, hint: "Últimos 100 movimientos de acceso" },
        ]}
      />

      {tab === "usuarios" && (
        <div className="space-y-4">
          {/* La duración de sesión aplica a todos y no es parte de ningún
              usuario: va en su propia franja y no perdida entre los botones. */}
          <div className="rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap"
            style={{ background: "var(--ui-card)", border: "1px solid var(--ui-border)" }}>
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--ui-text)" }}>Duración de sesión</p>
              <p className="text-xs" style={{ color: "var(--ui-text-3)" }}>Días antes de volver a pedir contraseña. Vacío = sin límite.</p>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="number"
                value={sessionDays}
                onChange={(e) => setSessionDays(e.target.value)}
                placeholder="sin límite"
                className="w-28 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2"
                style={CAMPO}
              />
              <BotonSecundario onClick={handleSaveConfig} disabled={savingConfig}>
                {savingConfig ? "…" : "Guardar"}
              </BotonSecundario>
            </div>
          </div>

          {loadingUsers ? <Loading /> : users.length === 0 ? (
            <Panel><EmptyState msg="Sin usuarios todavía" sub="Invita al primero desde el botón de arriba" /></Panel>
          ) : (
            <>
              <Panel title="Staff" sub={`${staff.length} ${staff.length === 1 ? "cuenta" : "cuentas"}`}>
                {staff.length === 0
                  ? <EmptyState msg="Ninguna cuenta de staff" />
                  : staff.map((u) => <FilaUsuario key={u.id} u={u} />)}
              </Panel>
              <Panel title="Familias y alumnos" sub={`${familias.length} ${familias.length === 1 ? "cuenta" : "cuentas"}`}>
                {familias.length === 0
                  ? <EmptyState msg="Ninguna cuenta de familia" />
                  : familias.map((u) => <FilaUsuario key={u.id} u={u} />)}
              </Panel>
            </>
          )}
        </div>
      )}

      {tab === "roles" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => {
            const allow = ROLE_ALLOW[r];
            const esStaff = STAFF_ROLES.includes(r);
            const conAccesos = r === "coordinador" || r === "director" || r === "administrativo";
            return (
              <div key={r} className="rounded-xl px-4 py-3"
                style={{ background: "var(--ui-card)", border: "1px solid var(--ui-border-soft)" }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="text-sm font-bold" style={{ color: "var(--ui-text)" }}>{ROL_LABEL[r]}</p>
                  <Badge label={esStaff ? "Staff" : "Familia"} tono={esStaff ? "ok" : "neutro"} />
                </div>
                {allow === "all" ? (
                  <p className="text-xs" style={{ color: "var(--ui-text-2)" }}>Acceso completo a todos los módulos</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {allow.map((m) => (
                      <span key={m} className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
                        style={{ background: "var(--ui-card-alt)", color: "var(--ui-text-2)" }}>
                        {m}
                      </span>
                    ))}
                    {conAccesos && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: "var(--g-juvenil-bg)", color: "var(--g-juvenil-fg)" }}>
                        accesos
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "registro" && (
        loadingLogs ? <Loading /> : (
          <Panel>
            {logs.length === 0 ? <EmptyState msg="Sin actividad registrada" /> : logs.map((log, i) => {
              const au = Array.isArray(log.app_users) ? log.app_users[0] : log.app_users;
              return (
                <div key={log.id} className="px-4 py-2.5 flex items-center justify-between gap-3"
                  style={{ borderTop: i === 0 ? undefined : "1px solid var(--ui-border-soft)" }}>
                  <div className="min-w-0">
                    <p className="text-sm" style={{ color: "var(--ui-text-2)" }}>
                      {au?.email ?? "—"} · <span className="font-bold" style={{ color: "var(--ui-text)" }}>{log.accion}</span>
                    </p>
                    {log.detalle && <p className="text-xs truncate" style={{ color: "var(--ui-text-3)" }}>{log.detalle}</p>}
                  </div>
                  <p className="text-xs shrink-0" style={{ color: "var(--ui-text-3)" }}>{formatFecha(log.created_at)}</p>
                </div>
              );
            })}
          </Panel>
        )
      )}

      {showInvite && (
        <Modal onClose={() => { if (!inviteSaving) { setShowInvite(false); resetInvite(); } }} ancho="sm">
          <ModalHeader titulo="Invitar usuario" sub="Recibe un correo para fijar su contraseña"
            onClose={() => { if (!inviteSaving) { setShowInvite(false); resetInvite(); } }} />
          <div className="p-5 space-y-3">
            <Campo label="Email">
              <input type="email" placeholder="nombre@ejemplo.com" value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)} className={CLASE_CAMPO} style={CAMPO} />
            </Campo>
            <Campo label="Nombre" hint="Opcional">
              <input type="text" placeholder="Nombre y apellido" value={inviteNombre}
                onChange={(e) => setInviteNombre(e.target.value)} className={CLASE_CAMPO} style={CAMPO} />
            </Campo>
            <Campo label="Rol">
              <select value={inviteRol} onChange={(e) => setInviteRol(e.target.value as Rol)}
                className={CLASE_CAMPO} style={CAMPO}>
                {ROLES.map((r) => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
              </select>
            </Campo>

            {isParentRole(inviteRol) && (
              <Campo label="Alumno(s) vinculado(s)" hint="Solo verá a los alumnos que vincules aquí">
                <div className="space-y-1 mb-1">
                  {inviteEstudiantes.map((st) => (
                    <div key={st.id} className="flex items-center justify-between px-3 py-1.5 rounded-lg"
                      style={{ background: "var(--g-juvenil-bg)" }}>
                      <span className="text-xs font-semibold" style={{ color: "var(--g-juvenil-fg)" }}>{st.full_name}</span>
                      <button onClick={() => setInviteEstudiantes((prev) => prev.filter((x) => x.id !== st.id))}
                        title="Quitar" style={{ color: "var(--g-juvenil-fg)" }}>
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="relative">
                  <input type="text" placeholder="Buscar alumno por nombre…" value={inviteSearch}
                    onChange={(e) => setInviteSearch(e.target.value)} className={CLASE_CAMPO} style={CAMPO} />
                  {inviteResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-10 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto"
                      style={{ background: "var(--ui-card)", border: "1px solid var(--ui-border)" }}>
                      {inviteResults.filter((r) => !inviteEstudiantes.some((st) => st.id === r.id)).map((st) => (
                        <button key={st.id}
                          onClick={() => { setInviteEstudiantes((prev) => [...prev, st]); setInviteSearch(""); setInviteResults([]); }}
                          className="w-full text-left px-3 py-2 text-sm transition-colors hover:bg-(--ui-card-alt)"
                          style={{ color: "var(--ui-text)", borderBottom: "1px solid var(--ui-border-soft)" }}>
                          {st.full_name} <span className="text-xs" style={{ color: "var(--ui-text-3)" }}>{st.grupo_activo}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Campo>
            )}

            {inviteError && <p className="text-xs font-semibold" style={{ color: "var(--ui-bad)" }}>{inviteError}</p>}

            <div className="flex gap-2 pt-1">
              <BotonPrimario onClick={handleInvite} disabled={inviteSaving || !inviteEmail.trim()}>
                {inviteSaving ? "Invitando…" : "Invitar"}
              </BotonPrimario>
              <BotonSecundario onClick={() => { setShowInvite(false); resetInvite(); }} disabled={inviteSaving}>
                Cancelar
              </BotonSecundario>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal onClose={() => { if (!deleteSaving) setDeleteTarget(null); }} ancho="sm">
          <ModalHeader titulo="Eliminar usuario" sub={deleteTarget.email} onClose={() => setDeleteTarget(null)} />
          <div className="p-5">
            <div className="rounded-lg px-3 py-2.5 mb-4"
              style={{ background: "var(--ui-bad-bg)", border: "1px solid var(--ui-border-soft)" }}>
              <p className="text-xs" style={{ color: "var(--ui-text-2)" }}>
                Esta acción es irreversible. Se elimina{" "}
                <span className="font-bold" style={{ color: "var(--ui-bad)" }}>{deleteTarget.email}</span>,
                su registro de accesos y sus vínculos con alumnos.
              </p>
            </div>
            {deleteError && <p className="text-xs font-semibold mb-2" style={{ color: "var(--ui-bad)" }}>{deleteError}</p>}
            <div className="flex gap-2">
              <button onClick={handleDeleteUser} disabled={deleteSaving}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ background: "var(--ui-bad)", color: "var(--ui-bg)" }}>
                {deleteSaving ? "Eliminando…" : "Eliminar definitivamente"}
              </button>
              <BotonSecundario onClick={() => setDeleteTarget(null)} disabled={deleteSaving}>Cancelar</BotonSecundario>
            </div>
          </div>
        </Modal>
      )}

      {pwdTarget && (
        <Modal onClose={() => { if (!pwdSaving) setPwdTarget(null); }} ancho="sm">
          <ModalHeader titulo="Fijar contraseña" sub={pwdTarget.email} onClose={() => setPwdTarget(null)} />
          <div className="p-5 space-y-3">
            <Campo label="Nueva contraseña" hint="Mínimo 8 caracteres">
              <input type="password" placeholder="••••••••" value={pwdValue}
                onChange={(e) => setPwdValue(e.target.value)} className={CLASE_CAMPO} style={CAMPO} />
            </Campo>
            {pwdError && <p className="text-xs font-semibold" style={{ color: "var(--ui-bad)" }}>{pwdError}</p>}
            <div className="flex gap-2">
              <BotonPrimario onClick={handleSetPassword} disabled={pwdSaving || pwdValue.length < 8}>
                {pwdSaving ? "Guardando…" : "Guardar"}
              </BotonPrimario>
              <BotonSecundario onClick={() => setPwdTarget(null)} disabled={pwdSaving}>Cancelar</BotonSecundario>
            </div>
          </div>
        </Modal>
      )}
    </Pagina>
  );
}
