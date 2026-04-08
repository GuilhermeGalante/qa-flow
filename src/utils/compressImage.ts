/**
 * Converte uma imagem (File | Blob) para PNG Base64 de alta qualidade.
 * O retorno é persistido no IndexedDB junto com o restante do estado da app.
 */
export async function compressImageToBase64(
  source: File | Blob,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(source);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Não foi possível criar contexto 2D."));
        return;
      }

      context.drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Falha ao carregar imagem."));
    };

    image.src = objectUrl;
  });
}