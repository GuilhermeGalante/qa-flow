/**
 * Comprime e redimensiona uma imagem (File | Blob) para uma string Base64.
 * Usa um <canvas> em memória para evitar imagens enormes no estado.
 *
 * @param source  File ou Blob da imagem
 * @param maxW    Largura máxima em pixels (default: 1200)
 * @param maxH    Altura máxima em pixels  (default: 900)
 * @param quality Qualidade JPEG 0-1       (default: 0.75)
 */
export async function compressImageToBase64(
  source: File | Blob,
  maxW = 1200,
  maxH = 900,
  quality = 0.75,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calcula dimensões finais mantendo proporção
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      // Desenha no canvas e exporta como JPEG comprimido
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Não foi possível criar contexto 2D')); return; }

      ctx.drawImage(img, 0, 0, w, h);
      const base64 = canvas.toDataURL('image/jpeg', quality);
      resolve(base64);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Falha ao carregar imagem'));
    };

    img.src = url;
  });
}
