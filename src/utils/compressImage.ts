/**
 * Converte uma imagem (File | Blob) para PNG sem perdas (lossless).
 *
 * - Sem redimensionamento: o canvas é criado com as dimensões naturais da
 *   imagem, preservando 100% da resolução original (incluindo telas Retina/4K).
 * - PNG não possui compressão destrutiva, garantindo nitidez perfeita em textos.
 *
 * @param source File ou Blob da imagem
 */
export async function compressImageToBase64(
  source: File | Blob,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Usa as dimensões naturais — sem nenhum downscaling
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Não foi possível criar contexto 2D"));
        return;
      }

      ctx.drawImage(img, 0, 0);

      // PNG lossless — sem parâmetro de qualidade
      resolve(canvas.toDataURL("image/png"));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Falha ao carregar imagem"));
    };

    img.src = url;
  });
}
