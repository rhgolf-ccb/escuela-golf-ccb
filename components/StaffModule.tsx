"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, UserPlus, Pencil, Flag, Briefcase } from "lucide-react";
import { supabase } from "@/lib/supabase";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { acentoGrupo } from "@/lib/grupos";
import {
  BotonPrimario, BotonSecundario, CAMPO, CLASE_CAMPO, Campo, Encabezado, Loading,
  Modal, ModalHeader, Pagina,
} from "@/components/ui/tema";

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

// El color de un miembro salía de cuatro hex escritos aquí. Ahora se toma
// prestado de la paleta de grupos, que es la única fuente de color del
// proyecto: verde para la cancha, dorado para la dirección, morado para
// administración. No es que un profesor "sea" Juvenil — es que no hace falta
// una quinta paleta para distinguir tres cosas.
function acentoMiembro(member: Pick<StaffMember, "rol" | "categoria">): string {
  if (member.rol === "Director de Golf") return acentoGrupo("competencia");
  if (member.categoria === "administrativos") return acentoGrupo("damas");
  return acentoGrupo("juvenil");
}

// Solo los roles de mando llevan etiqueta destacada; el resto la lleva neutra.
function rolDestacado(member: Pick<StaffMember, "rol" | "categoria">): boolean {
  return member.rol === "Coordinador de Escuelas"
    || member.rol === "Director de Golf"
    || member.categoria === "administrativos";
}

function staffRolPrioridad(rol: string): number {
  if (rol === "Director de Golf") return 0;
  if (rol === "Coordinador de Escuelas") return 1;
  return 2;
}

function emptyForm(categoria: Categoria, orden: number): StaffForm {
  return { id: crypto.randomUUID(), nombre: "", rol: "", categoria, descripcion: "", foto_url: null, orden };
}

// Genera un Blob recortado (cuadrado) a partir de la imagen y el área de recorte
async function getCroppedImg(imageSrc: string, cropPixels: { x: number; y: number; width: number; height: number }): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = imageSrc;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });

  const canvas = document.createElement("canvas");
  // Tamaño de salida: 400x400 (suficiente para un avatar, mantiene peso bajo)
  const OUTPUT = 400;
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");

  ctx.drawImage(
    image,
    cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height,
    0, 0, OUTPUT, OUTPUT
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("No se pudo generar la imagen recortada"));
      },
      "image/jpeg",
      0.9
    );
  });
}

export default function StaffModule() {
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<StaffForm | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Los errores del modal se muestran dentro del modal. alert() bloquea la
  // pestaña entera y obliga a cerrarlo para leer qué pasó.
  const [formError, setFormError] = useState<string | null>(null);

  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

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
    setFormError(null);
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
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setForm(null);
    setFormError(null);
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
      setFormError(err instanceof Error ? err.message : "Error al subir la foto");
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
      setFormError(err instanceof Error ? err.message : "Error al eliminar la foto");
    } finally {
      setUploading(false);
    }
  }

  // Cuando el usuario selecciona un archivo, en vez de subir directo, abrimos el cropper
  function handleFileSelected(file: File) {
    const url = URL.createObjectURL(file);
    setCropSrc(url);
    setZoom(1);
    setCrop({ x: 0, y: 0 });
  }

  // Cuando confirma el recorte, generamos el blob y lo subimos con la función existente
  async function handleCropConfirm() {
    if (!cropSrc || !croppedAreaPixels) return;
    try {
      const blob = await getCroppedImg(cropSrc, croppedAreaPixels);
      const croppedFile = new File([blob], "foto.jpg", { type: "image/jpeg" });
      await uploadFoto(croppedFile);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al recortar la foto");
    } finally {
      URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
    }
  }

  function handleCropCancel() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function handleSave() {
    if (!form) return;
    if (!form.nombre.trim() || !form.rol.trim()) {
      setFormError("Nombre y rol son obligatorios.");
      return;
    }
    setFormError(null);
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
    <Pagina>
      <Encabezado icono={Users} titulo="Staff" bajada="Equipo de la Escuela de Golf — Country Club de Bogotá">
        <BotonPrimario onClick={() => openAdd("profesores")}>
          <UserPlus size={16} />
          Agregar miembro
        </BotonPrimario>
      </Encabezado>

      {loading ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <StaffSection
            icono={Flag}
            acento={acentoGrupo("juvenil")}
            title="Profesores"
            members={profesores}
            onEdit={openEdit}
            onAdd={() => openAdd("profesores")}
          />
          <StaffSection
            icono={Briefcase}
            acento={acentoGrupo("damas")}
            title="Administrativos"
            members={administrativos}
            onEdit={openEdit}
            onAdd={() => openAdd("administrativos")}
          />
        </div>
      )}

      {modalOpen && form && (
        <StaffModal
          form={form}
          isNew={isNew}
          saving={saving}
          uploading={uploading}
          error={formError}
          onChange={(patch) => setForm((f) => (f ? { ...f, ...patch } : f))}
          onUploadFoto={handleFileSelected}
          onRemoveFoto={removeFoto}
          onCancel={closeModal}
          onSave={handleSave}
        />
      )}

      {cropSrc && (
        // z-[60]: se abre encima del modal del miembro, que ya está en z-50.
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="tema-oscuro rounded-2xl w-full max-w-md overflow-hidden"
            style={{ background: "var(--ui-card)", border: "1px solid var(--ui-border)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--ui-border-soft)" }}>
              <h3 className="text-lg font-bold" style={{ color: "var(--ui-text)" }}>Ajustar foto</h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--ui-text-3)" }}>
                Arrastra para mover y usa el control para acercar. La foto se recorta en círculo.
              </p>
            </div>

            <div className="p-5">
              <div className="relative w-full h-64 rounded-lg overflow-hidden" style={{ background: "var(--ui-bg)" }}>
                <Cropper
                  image={cropSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>

              <div className="flex items-center gap-3 mt-4">
                <span className="text-xs shrink-0" style={{ color: "var(--ui-text-3)" }}>Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full"
                  style={{ accentColor: "var(--ui-gold)" }}
                />
              </div>

              <div className="flex justify-end gap-2 mt-5">
                <BotonSecundario onClick={handleCropCancel} disabled={uploading}>Cancelar</BotonSecundario>
                <BotonPrimario onClick={handleCropConfirm} disabled={uploading}>
                  {uploading ? "Subiendo…" : "Aplicar"}
                </BotonPrimario>
              </div>
            </div>
          </div>
        </div>
      )}
    </Pagina>
  );
}

function StaffSection({
  icono: Icono, acento, title, members, onEdit, onAdd,
}: {
  icono: typeof Flag; acento: string; title: string;
  members: StaffMember[]; onEdit: (m: StaffMember) => void; onAdd: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `color-mix(in srgb, ${acento} 18%, transparent)`, color: acento }}>
          <Icono size={16} />
        </div>
        <h2 className="text-sm font-bold" style={{ color: "var(--ui-text)" }}>{title}</h2>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums"
          style={{ background: "var(--ui-card-alt)", color: "var(--ui-text-3)" }}>
          {members.length}
        </span>
        <button onClick={onAdd}
          className="ml-auto text-xs font-semibold rounded-lg px-2.5 py-1 transition-colors hover:bg-(--ui-card-alt)"
          style={{ color: "var(--ui-text-2)", border: "1px solid var(--ui-border)" }}>
          + Agregar en {title.toLowerCase()}
        </button>
      </div>
      {members.length === 0 ? (
        <p className="text-sm italic py-4" style={{ color: "var(--ui-text-3)" }}>Sin miembros en esta categoría.</p>
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
  const acento = acentoMiembro(member);
  const destacado = rolDestacado(member);

  return (
    <div className="relative group rounded-xl p-4 transition-colors"
      style={{ background: "var(--ui-card)", border: "1px solid var(--ui-border-soft)" }}>
      <button
        onClick={onEdit}
        // El lápiz solo aparecía al pasar el cursor, así que en una tablet —que
        // es donde se usa esto— no había forma de editar. Ahora es visible
        // siempre, apenas atenuado.
        className="absolute top-2 right-2 p-1.5 rounded-lg opacity-60 group-hover:opacity-100 transition-opacity hover:bg-(--ui-card-alt)"
        style={{ color: "var(--ui-text-3)" }}
        title="Editar"
      >
        <Pencil size={14} />
      </button>
      <div className="flex items-center gap-4">
        <div
          className="w-[80px] h-[80px] md:w-[96px] md:h-[96px] overflow-hidden flex-shrink-0 flex items-center justify-center text-[32px] font-semibold"
          style={{
            background: `color-mix(in srgb, ${acento} 20%, transparent)`,
            color: acento,
            borderRadius: "50%",
          }}
        >
          {member.foto_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.foto_url}
              alt={member.nombre}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center center",
                borderRadius: "50%",
                display: "block",
              }}
            />
          ) : (
            getInitials(member.nombre)
          )}
        </div>
        <div className="min-w-0 pr-5">
          <span
            className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full border mb-1"
            style={destacado
              ? { borderColor: acento, color: acento }
              : { borderColor: "var(--ui-border)", color: "var(--ui-text-3)" }}
          >
            {member.rol}
          </span>
          <p className="text-[13px] font-bold leading-tight" style={{ color: "var(--ui-text)" }}>{member.nombre}</p>
          {member.descripcion && (
            <p className="text-[11px] mt-1" style={{ color: "var(--ui-text-2)", lineHeight: 1.5 }}>{member.descripcion}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StaffModal({
  form, isNew, saving, uploading, error, onChange, onUploadFoto, onRemoveFoto, onCancel, onSave,
}: {
  form: StaffForm; isNew: boolean; saving: boolean; uploading: boolean; error: string | null;
  onChange: (patch: Partial<StaffForm>) => void;
  onUploadFoto: (file: File) => void;
  onRemoveFoto: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const acento = acentoMiembro(form);

  return (
    <Modal onClose={() => { if (!saving && !uploading) onCancel(); }} ancho="sm">
      <ModalHeader
        titulo={isNew ? "Agregar miembro" : "Editar miembro"}
        sub={form.categoria === "profesores" ? "Profesores" : "Administrativos"}
        onClose={onCancel}
      />
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-14 h-14 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-sm font-bold"
            style={{ background: `color-mix(in srgb, ${acento} 20%, transparent)`, color: acento }}
          >
            {form.foto_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.foto_url}
                alt={form.nombre}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
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
            <label className="text-xs font-semibold hover:underline cursor-pointer" style={{ color: "var(--ui-gold)" }}>
              {uploading ? "Subiendo…" : form.foto_url ? "Cambiar foto" : "Subir foto"}
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
                className="text-xs hover:underline disabled:opacity-50"
                style={{ color: "var(--ui-bad)" }}
              >
                Quitar foto
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <Campo label="Nombre">
            <input value={form.nombre} onChange={(e) => onChange({ nombre: e.target.value })}
              className={CLASE_CAMPO} style={CAMPO} />
          </Campo>
          <Campo label="Rol">
            <input value={form.rol} onChange={(e) => onChange({ rol: e.target.value })}
              placeholder="Profesor de golf" className={CLASE_CAMPO} style={CAMPO} />
          </Campo>
          <Campo label="Categoría">
            <select value={form.categoria} onChange={(e) => onChange({ categoria: e.target.value as Categoria })}
              className={CLASE_CAMPO} style={CAMPO}>
              <option value="profesores">Profesores</option>
              <option value="administrativos">Administrativos</option>
            </select>
          </Campo>
          <Campo label="Descripción" hint={`${form.descripcion.length}/${DESCRIPCION_MAX} caracteres`}>
            <textarea
              value={form.descripcion}
              maxLength={DESCRIPCION_MAX}
              onChange={(e) => onChange({ descripcion: e.target.value })}
              rows={3}
              className={`${CLASE_CAMPO} resize-none`}
              style={CAMPO}
            />
          </Campo>
        </div>

        {error && <p className="text-xs font-semibold mt-3" style={{ color: "var(--ui-bad)" }}>{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <BotonSecundario onClick={onCancel} disabled={saving}>Cancelar</BotonSecundario>
          <BotonPrimario onClick={onSave} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </BotonPrimario>
        </div>
      </div>
    </Modal>
  );
}
