import React, { useRef, useState } from "react";
import { Upload, Clipboard, Trash2, ImageIcon, Loader2 } from "lucide-react";
import { compressImageToBase64 } from "../../utils/compressImage";

interface Props {
  evidence?: string;
  onSave: (base64: string) => void;
  onClear: () => void;
}

/**
 * Componente de upload/paste de evidência.
 * Aceita: clique para selecionar arquivo, Ctrl+V para colar da área de transferência.
 * Comprime a imagem antes de salvar no estado.
 */
export const EvidenceUploader: React.FC<Props> = ({
  evidence,
  onSave,
  onClear,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");

  const processBlob = async (blob: Blob) => {
    if (!blob.type.startsWith("image/")) {
      setError("O arquivo deve ser uma imagem.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const b64 = await compressImageToBase64(blob);
      onSave(b64);
    } catch {
      setError("Falha ao processar a imagem. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleFile = (file: File) => processBlob(file);

  const handlePaste = async (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) =>
      i.type.startsWith("image/"),
    );
    if (!item) return;
    const blob = item.getAsFile();
    if (blob) processBlob(blob);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processBlob(file);
  };

  /* Se já há evidência, mostra preview */
  if (evidence) {
    return (
      <div className="mt-2 flex items-start gap-3">
        <div className="relative group">
          <img
            src={evidence}
            alt="Evidência do bug"
            className="max-h-40 max-w-xs rounded-lg border border-red-200 shadow-sm object-contain bg-slate-50"
          />
          {/* Overlay de remoção no hover */}
          <button
            onClick={onClear}
            title="Remover evidência"
            className="absolute top-1.5 right-1.5 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow"
          >
            <Trash2 size={13} />
          </button>
        </div>
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors mt-1"
        >
          <Trash2 size={13} /> Remover
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2">
      {/* Área clicável / paste / drop */}
      <div
        ref={areaRef}
        tabIndex={0}
        onPaste={handlePaste}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef_workaround(fileRef)}
        className={`flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-all select-none outline-none
          focus:ring-2 focus:ring-red-300/40
          ${
            dragOver
              ? "border-red-400 bg-red-50"
              : "border-red-200 bg-red-50/30 hover:border-red-400 hover:bg-red-50"
          }`}
      >
        {loading ? (
          <Loader2 size={18} className="text-red-400 animate-spin shrink-0" />
        ) : (
          <ImageIcon size={18} className="text-red-300 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-xs text-red-600 font-medium">
            {loading ? "Comprimindo imagem..." : "Adicionar Evidência (print)"}
          </p>
          <p className="text-xs text-red-300 mt-0.5">
            Clique para selecionar · Arraste · ou{" "}
            <kbd className="font-mono bg-white border border-red-200 px-1 py-0.5 rounded text-[10px]">
              Ctrl+V
            </kbd>{" "}
            para colar
          </p>
        </div>

        <div className="flex gap-1.5 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileRef.current?.click();
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-white border border-red-200 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Upload size={12} /> Upload
          </button>
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                  const imageType = item.types.find((t) =>
                    t.startsWith("image/"),
                  );
                  if (imageType) {
                    const blob = await item.getType(imageType);
                    processBlob(blob);
                    break;
                  }
                }
              } catch {
                setError(
                  "Sem permissão para ler a área de transferência. Use Ctrl+V no campo acima.",
                );
              }
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-white border border-red-200 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Clipboard size={12} /> Colar
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) handleFile(e.target.files[0]);
        }}
      />

      {error && <p className="text-xs text-red-500 mt-1.5 ml-1">{error}</p>}
    </div>
  );
};

// Tiny helper pois onClick direto em input hidden pode ter bloqueio em alguns browsers
function fileInputRef_workaround(
  ref: React.RefObject<HTMLInputElement | null>,
) {
  ref.current?.click();
}
