"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Categoria = "profesores" | "administrativos";

type StaffMember = {
  id: string;
  nombre: string;
  rol: string;
  categoria: Categoria;
  descripcion: string | null;
  foto_url: string | null;
  orden: number;
  activo: boolean;
};

type StaffForm = {
  id: string;
  nombre: string;
  rol: string;
  categoria: Categoria;
  descripcion: string;
  foto_url: string | null;
  orden: number;
};

const DESCRIPCION_MAX = 200;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function avatarColor(member: Pick<StaffMember, "rol" | "categoria">): { bg: string; text: string } {
  if (member.rol === "Coordinador de Escuelas") return { bg: "#e8f5ee", text: "#1a3a2a" };
  if (member.rol === "Director de Golf") return { bg: "#fdf3e0", text: "#7d5a00" };
  if (member.categoria === "profesores") return { bg: "#e8f5ee", text: "#1a3a2a" };
  return { bg: "#f3e8fc", text: "#4a1070" };
}

function badgeColor(member: Pick<StaffMember, "rol" | "categoria">): string | null {
  if (member.rol === "Coordinador de Escuelas") return "#1a3a2a";
  if (member.rol === "Director de Golf") return "#7d5a00";
  if (member.categoria === "administrativos") return "#4a1070";
  return null;
}

function staffRolPrioridad(rol: string): number {
  if (rol === "Director de Golf") return 0;
  if (rol === "Coordinador de Escuelas") return 1;
  return 2;
}

function emptyForm(categoria: Categoria, orden: number): StaffForm {
  return { id: crypto.randomUUID(), nombre: "", rol: "", categoria, descripcion: "", foto_url: null, orden };
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin rounded-full h-7 w-7 border-2 border-[#1a3a2a] border-t-transparent" />
    </div>
  );
}

export default function StaffModule() {
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<StaffForm | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("staff_directorio")
      .select("*")
      .eq("activo", true)
      .order("categoria")
      .order("orden");
    setMembers((data ?? []) as StaffMember[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const profesores = members
    .filter((m) => m.categoria === "profesores")
    .sort((a, b) => staffRolPrioridad(a.rol) - staffRolPrioridad(b.rol));
  const administrativos = members.filter((m) => m.categoria === "administrativos");

  function openAdd(categoria: Categoria) {
    const siblings = members.filter((m) => m.categoria === categoria);
    setForm(emptyForm(categoria, siblings.length + 1));
    setIsNew(true);
    setModalOpen(true);
  }

  function openEdit(member: StaffMember) {
    setForm({
      id: member.id,
      nombre: member.nombre,
      rol: member.rol,
      categoria: member.categoria,
      descripcion: member.descripcion ?? "",
      foto_url: member.foto_url,
      orden: member.orden,
    });
    setIsNew(false);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setForm(null);
  }

  async function uploadFoto(file: File) {
    if (!form) return;
    setUploading(true);
    try {
      const path = `${form.id}.jpg`;
      const { error } = await supabase.storage
        .from("staff-fotos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("staff-fotos").getPublicUrl(path);
      setForm((f) => (f ? { ...f, foto_url: `${data.publicUrl}?t=${Date.now()}` } : f));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al subir la foto");
    } finally {
      setUploading(false);
    }
  }

  async function removeFoto() {
    if (!form) return;
    setUploading(true);
    try {
      const path = `${form.id}.jpg`;
      const { error } = await supabase.storage.from("staff-fotos").remove([path]);
      if (error) throw new Error(error.message);
      setForm((f) => (f ? { ...f, foto_url: null } : f));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al eliminar la foto");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!form) return;
    if (!form.nombre.trim() || !form.rol.trim()) {
      alert("Nombre y rol son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        rol: form.rol.trim(),
        categoria: form.categoria,
        descripcion: form.descripcion.trim() || null,
        foto_url: form.foto_url,
        orden: form.orden,
      };
      if (isNew) {
        await supabase.from("staff_directorio").insert({ id: form.id, ...payload });
      } else {
        await supabase.from("staff_directorio").update(payload).eq("id", form.id);
      }
      await load();
      closeModal();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Staff</h1>
          <p className="text-sm text-gray-500">Equipo de la Escuela de Golf — Country Club de Bogotá</p>
        </div>
        <button
          onClick={() => openAdd("profesores")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: "#1a3a2a" }}
        >
          <i className="ti ti-plus" style={{ fontSize: 16 }} />
          Agregar miembro
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : (
        <div className="space-y-8">
          <StaffSection
            icon="ti-golf"
            iconBg="#e8f5ee"
            iconColor="#1a3a2a"
            title="Profesores"
            members={profesores}
            onEdit={openEdit}
          />
          <div className="border-t border-gray-100" />
          <StaffSection
            icon="ti-building"
            iconBg="#f3e8fc"
            iconColor="#4a1070"
            title="Administrativos"
            members={administrativos}
            onEdit={openEdit}
          />
        </div>
      )}

      {modalOpen && form && (
        <StaffModal
          form={form}
          isNew={isNew}
          saving={saving}
          uploading={uploading}
          onChange={(patch) => setForm((f) => (f ? { ...f, ...patch } : f))}
          onUploadFoto={uploadFoto}
          onRemoveFoto={removeFoto}
          onCancel={closeModal}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function StaffSection({
  icon, iconBg, iconColor, title, members, onEdit,
}: {
  icon: string; iconBg: string; iconColor: string; title: string;
  members: StaffMember[]; onEdit: (m: StaffMember) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: iconBg, color: iconColor }}>
          <i className={`ti ${icon}`} style={{ fontSize: 16 }} />
        </div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
          {members.length} {members.length === 1 ? "miembro" : "miembros"}
        </span>
      </div>
      {members.length === 0 ? (
        <p className="text-sm text-gray-300 italic py-4">Sin miembros en esta categoría.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {members.map((m) => (
            <StaffCard key={m.id} member={m} onEdit={() => onEdit(m)} />
          ))}
        </div>
      )}
    </div>
  );
}

function StaffCard({ member, onEdit }: { member: StaffMember; onEdit: () => void }) {
  const avatar = avatarColor(member);
  const badge = badgeColor(member);

  return (
    <div className="relative group border border-gray-100 rounded-xl p-4 bg-white">
      <button
        onClick={onEdit}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-700 p-1"
        title="Editar"
      >
        <i className="ti ti-pencil" style={{ fontSize: 14 }} />
      </button>
      <div className="flex items-center gap-4">
        <div
          className="w-[80px] h-[80px] md:w-[96px] md:h-[96px] overflow-hidden flex-shrink-0 flex items-center justify-center text-[32px] font-medium"
          style={{ backgroundColor: avatar.bg, color: avatar.text, borderRadius: "50%" }}
        >
          {member.foto_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.foto_url}
              alt={member.nombre}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                objectPosition: "center center",
                borderRadius: "50%",
                display: "block",
              }}
            />
          ) : (
            getInitials(member.nombre)
          )}
        </div>
        <div className="min-w-0">
          <span
            className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full border mb-1"
            style={badge ? { borderColor: badge, color: badge } : { borderColor: "var(--border-strong)", color: "#6b7280" }}
          >
            {member.rol}
          </span>
          <p className="text-[13px] font-medium text-gray-900 leading-tight">{member.nombre}</p>
          {member.descripcion && (
            <p className="text-[11px] text-gray-500 mt-1" style={{ lineHeight: 1.5 }}>{member.descripcion}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StaffModal({
  form, isNew, saving, uploading, onChange, onUploadFoto, onRemoveFoto, onCancel, onSave,
}: {
  form: StaffForm; isNew: boolean; saving: boolean; uploading: boolean;
  onChange: (patch: Partial<StaffForm>) => void;
  onUploadFoto: (file: File) => void;
  onRemoveFoto: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const avatar = avatarColor(form);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          {isNew ? "Agregar miembro" : "Editar miembro"}
        </h3>

        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-14 h-14 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-sm font-bold"
            style={{ backgroundColor: avatar.bg, color: avatar.text }}
          >
            {form.foto_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.foto_url}
                alt={form.nombre}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  objectPosition: "center center",
                  borderRadius: "50%",
                  display: "block",
                }}
              />
            ) : (
              getInitials(form.nombre || "??")
            )}
          </div>
          <div className="flex flex-col items-start gap-1">
            <label className="text-xs text-blue-600 hover:underline cursor-pointer">
              {uploading ? "Subiendo..." : "Subir foto"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadFoto(f);
                  e.target.value = "";
                }}
              />
            </label>
            {form.foto_url && (
              <button
                type="button"
                onClick={onRemoveFoto}
                disabled={uploading}
                className="text-xs text-red-600 hover:underline disabled:opacity-50"
              >
                Quitar foto
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Nombre</label>
            <input
              value={form.nombre}
              onChange={(e) => onChange({ nombre: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Rol</label>
            <input
              value={form.rol}
              onChange={(e) => onChange({ rol: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Categoría</label>
            <select
              value={form.categoria}
              onChange={(e) => onChange({ categoria: e.target.value as Categoria })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
            >
              <option value="profesores">Profesores</option>
              <option value="administrativos">Administrativos</option>
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-600">Descripción</label>
              <span className="text-[10px] text-gray-400">{form.descripcion.length}/{DESCRIPCION_MAX}</span>
            </div>
            <textarea
              value={form.descripcion}
              maxLength={DESCRIPCION_MAX}
              onChange={(e) => onChange({ descripcion: e.target.value })}
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#1a3a2a" }}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
