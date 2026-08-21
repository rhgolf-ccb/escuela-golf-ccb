"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, ExternalLink, Trash2, Upload } from "lucide-react";
import {
  BotonPrimario, BotonSecundario, CAMPO, CLASE_CAMPO, Campo, EmptyState, Encabezado,
  Loading, Modal, ModalHeader, Pagina, Toast,
} from "@/components/ui/tema";

type Documento = {
  id: string;
  titulo: string;
  tema: string | null;
  contenido: string;
  archivo_url: string | null;
  activo: boolean;
  created_at: string;
};

function formatFecha(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export default function PacoKnowledgeModule() {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [showUpload, setShowUpload] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [tema, setTema] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/paco-knowledge");
      const data = await res.json();
      if (res.ok) setDocumentos(data.documentos ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function resetUpload() {
    setTitulo(""); setTema(""); setFile(null); setUploadError(null);
  }

  async function handleUpload() {
    if (!titulo.trim() || !file) { setUploadError("Título y archivo son requeridos."); return; }
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("titulo", titulo.trim());
      formData.append("tema", tema.trim());
      formData.append("archivo", file);
      const res = await fetch("/api/paco-knowledge", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al subir el documento");
      setShowUpload(false);
      resetUpload();
      showToast("Documento agregado ✓");
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Error al subir el documento");
    }
    setUploading(false);
  }

  async function handleToggleActivo(doc: Documento) {
    const res = await fetch(`/api/paco-knowledge/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !doc.activo }),
    });
    if (res.ok) {
      setDocumentos((prev) => prev.map((d) => (d.id === doc.id ? { ...d, activo: !d.activo } : d)));
    }
  }

  async function handleDelete(doc: Documento) {
    if (!confirm(`¿Eliminar "${doc.titulo}"?`)) return;
    const res = await fetch(`/api/paco-knowledge/${doc.id}`, { method: "DELETE" });
    if (res.ok) {
      setDocumentos((prev) => prev.filter((d) => d.id !== doc.id));
      showToast("Documento eliminado");
    }
  }

  return (
    <Pagina>
      <Toast msg={toast} />

      <Encabezado
        icono={BookOpen}
        titulo="Base de conocimiento de Paco"
        bajada="Documentos que Paco usa como contexto en todas sus respuestas"
      >
        <BotonPrimario onClick={() => setShowUpload(true)}>
          <Upload size={16} />
          Subir documento
        </BotonPrimario>
      </Encabezado>

      {loading ? (
        <Loading />
      ) : documentos.length === 0 ? (
        <EmptyState
          msg="Sin documentos cargados todavía"
          sub="Lo que subas aquí entra en el contexto de Paco en todas sus respuestas"
          accion={<BotonPrimario onClick={() => setShowUpload(true)}><Upload size={16} />Subir el primero</BotonPrimario>}
        />
      ) : (
        <div className="space-y-2">
          {documentos.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 rounded-xl px-4 py-3"
              style={{
                background: "var(--ui-card)",
                border: "1px solid var(--ui-border-soft)",
                // Un documento inactivo no se borra pero deja de contar: se
                // atenúa entero en vez de cambiar solo la etiqueta, que era el
                // único indicio y se perdía en una lista larga.
                opacity: doc.activo ? 1 : 0.55,
              }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--ui-text)" }}>{doc.titulo}</p>
                  {doc.tema && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: "var(--g-juvenil-bg)", color: "var(--g-juvenil-fg)" }}>
                      {doc.tema}
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: "var(--ui-text-3)" }}>{formatFecha(doc.created_at)}</p>
              </div>

              {doc.archivo_url && (
                <a href={doc.archivo_url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-xs font-semibold hover:underline shrink-0"
                  style={{ color: "var(--ui-gold)" }}>
                  <ExternalLink size={12} />
                  Ver archivo
                </a>
              )}

              <button
                onClick={() => handleToggleActivo(doc)}
                title={doc.activo ? "Dejar de usarlo como contexto" : "Volver a usarlo como contexto"}
                className="text-[11px] font-bold px-3 py-1.5 rounded-full shrink-0 transition-opacity hover:opacity-80"
                style={doc.activo
                  ? { background: "var(--ui-ok-bg)", color: "var(--ui-ok)" }
                  : { background: "var(--ui-card-alt)", color: "var(--ui-text-3)" }}>
                {doc.activo ? "Activo" : "Inactivo"}
              </button>

              <button onClick={() => handleDelete(doc)} title="Eliminar documento"
                className="shrink-0 p-1.5 rounded-lg transition-colors hover:bg-(--ui-bad-bg)"
                style={{ color: "var(--ui-text-3)" }}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showUpload && (
        <Modal onClose={() => { if (!uploading) { setShowUpload(false); resetUpload(); } }} ancho="sm">
          <ModalHeader
            titulo="Subir documento"
            sub="PDF o texto plano"
            onClose={() => { if (!uploading) { setShowUpload(false); resetUpload(); } }}
          />
          <div className="p-5 space-y-3">
            <Campo label="Título">
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)}
                placeholder="Metodología de juego corto" className={CLASE_CAMPO} style={CAMPO} />
            </Campo>
            <Campo label="Tema" hint="Opcional — agrupa el documento en la lista">
              <input value={tema} onChange={(e) => setTema(e.target.value)}
                placeholder="Metodología TPI" className={CLASE_CAMPO} style={CAMPO} />
            </Campo>
            <Campo label="Archivo">
              <input type="file" accept=".pdf,.txt,application/pdf,text/plain"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:text-xs file:font-bold"
                style={{ color: "var(--ui-text-2)" }} />
            </Campo>
            {uploadError && <p className="text-xs font-semibold" style={{ color: "var(--ui-bad)" }}>{uploadError}</p>}
            <div className="flex gap-2 pt-1">
              <BotonSecundario onClick={() => { setShowUpload(false); resetUpload(); }} disabled={uploading}>
                Cancelar
              </BotonSecundario>
              <BotonPrimario onClick={handleUpload} disabled={uploading}>
                {uploading ? "Subiendo…" : "Subir"}
              </BotonPrimario>
            </div>
          </div>
        </Modal>
      )}
    </Pagina>
  );
}
