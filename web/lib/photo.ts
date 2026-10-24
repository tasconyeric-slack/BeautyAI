/** EXIF-transpose + downscale to 1600 px + JPEG, in the browser. Falls back to the original (e.g. HEIC).
 *  A JPEG that is already small enough is sent as-is: re-encoding it would only add compression artefacts that the
 *  sharpness check then has to see through (the server applies EXIF orientation itself). */
const MAX_LONG_SIDE = 1600;

export async function preparePhoto(file: File): Promise<{ blob: Blob; url: string | null }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_LONG_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.type === "image/jpeg") {
      bmp.close();
      return { blob: file, url: URL.createObjectURL(file) };
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (blob) return { blob, url: URL.createObjectURL(blob) };
  } catch {
    /* fall through: the server converts HEIC */
  }
  return { blob: file, url: null };
}
