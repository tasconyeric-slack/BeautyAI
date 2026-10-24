import { suggestFaceFraming, type CropRect, type Framing } from "@/lib/framing";
import type { PhotoRole } from "@/lib/api";

interface LocalFace {
  boundingBox: CropRect;
  landmarks?: { type: string; locations: { x: number; y: number }[] }[];
}
interface Detector { detect: (image: ImageBitmap) => Promise<LocalFace[]> }

/** Optional OS/browser detector only: no photo upload, model download or analysis call. */
export async function detectFaceSuggestion(bitmap: ImageBitmap, role: PhotoRole): Promise<Framing | null> {
  if (!["front", "noglasses", "smile"].includes(role)) return null;
  const DetectorClass = (globalThis as typeof globalThis & {
    FaceDetector?: new (options: { fastMode: boolean; maxDetectedFaces: number }) => Detector;
  }).FaceDetector;
  if (!DetectorClass) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const faces = await Promise.race([
      new DetectorClass({ fastMode: false, maxDetectedFaces: 2 }).detect(bitmap),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 700); }),
    ]);
    if (!faces || faces.length !== 1) return null;
    const face = faces[0];
    const eyes = face.landmarks?.filter((p) => p.type === "eye").flatMap((p) => p.locations) ?? [];
    const mouth = face.landmarks?.find((p) => p.type === "mouth")?.locations[0];
    // Require approximately level, separated eyes and a centred mouth; boxes alone do not establish front pose.
    if (eyes.length !== 2 || !mouth) return null;
    const [left, right] = [...eyes].sort((a, b) => a.x - b.x);
    const box = face.boundingBox;
    if (right.x - left.x < box.width * 0.25 || Math.abs(left.y - right.y) > box.height * 0.12
      || Math.abs(mouth.x - (left.x + right.x) / 2) > box.width * 0.15
      || mouth.y < Math.max(left.y, right.y) + box.height * 0.15) return null;
    return suggestFaceFraming(bitmap.width, bitmap.height, [box]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
