"use client";

import { useCallback, useEffect, useState } from "react";

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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg pointer-events-none">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#4ade80" strokeWidth={2.5}><path d="M3 10l4 4 9-9" /></svg>
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Base de conocimiento de Paco</h1>
          <p className="text-sm text-gray-500 mt-0.5">Documentos que Paco usa como contexto adicional en todas sus respuestas.</p>
        </div>
        <button onClick={() => setShowUpload(true)} className="px-4 py-2 rounded-lg text-sm font-medium text-white shrink-0" style={{ backgroundColor: "#1a3a2a" }}>
          Subir documento
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-7 w-7 border-2 border-[#1a3a2a] border-t-transparent" /></div>
      ) : documentos.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">Sin documentos cargados todavía.</div>
      ) : (
        <div className="space-y-2">
          {documentos.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 border border-gray-100 rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.titulo}</p>
                  {doc.tema && <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "#1a3a2a18", color: "#1a3a2a" }}>{doc.tema}</span>}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{formatFecha(doc.created_at)}</p>
              </div>
              {doc.archivo_url && (
                <a href={doc.archivo_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline shrink-0">Ver archivo</a>
              )}
              <button
                onClick={() => handleToggleActivo(doc)}
                className="text-xs font-medium px-3 py-1.5 rounded-full shrink-0"
                style={doc.activo ? { backgroundColor: "#dcfce7", color: "#166534" } : { backgroundColor: "#f3f4f6", color: "#6b7280" }}
              >
                {doc.activo ? "Activo" : "Inactivo"}
              </button>
              <button onClick={() => handleDelete(doc)} className="text-gray-300 hover:text-red-500 shrink-0">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target === e.currentTarget && !uploading) { setShowUpload(false); resetUpload(); } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
            <h3 className="font-bold text-gray-900">Subir documento</h3>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título" className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
            <input value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Tema (ej: Metodología TPI)" className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
            <input type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full text-sm" />
            {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
            <div className="flex gap-2 pt-2">
              <button onClick={() => { setShowUpload(false); resetUpload(); }} disabled={uploading} className="flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={handleUpload} disabled={uploading} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "#1a3a2a" }}>
                {uploading ? "Subiendo..." : "Subir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
