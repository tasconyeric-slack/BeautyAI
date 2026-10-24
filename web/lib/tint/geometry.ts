/** Coordinates are normalized to the whole image, not the reference dimensions. */
export type Pt = readonly [number, number];
export interface FaceGeometry {
  readonly width: number;
  readonly height: number;
  readonly lip_outer: readonly Pt[];
  readonly lip_inner: readonly Pt[];
  readonly eye_l: readonly Pt[];
  readonly eye_r: readonly Pt[];
  readonly brow_l: readonly Pt[];
  readonly brow_r: readonly Pt[];
  readonly cheek_l: readonly Pt[];
  readonly cheek_r: readonly Pt[];
  /** Closed face outline, including the jaw. */
  readonly jaw: readonly Pt[];
  /** Intended cloth overlay polygon below the jaw. */
  readonly neck: readonly Pt[];
  /** Named measurement points (V3A, D34): the landmarks and construction points the measurement profile was
   *  computed from. Normalized to the image; helper points may lie slightly outside 0..1. Absent in older files. */
  readonly points?: Readonly<Record<string, Pt>>;
  /** V3B (D35): the other measurement photos (true profile, glasses-free front, smile), each in its own image's
   *  normalized coordinates. Same 24 h lifetime as the front photo. */
  readonly views?: Readonly<Record<string, ViewGeometry>>;
}
export interface ViewGeometry {
  readonly width: number;
  readonly height: number;
  readonly points: Readonly<Record<string, Pt>>;
  /** Traced profile outline (profile90 only). */
  readonly silhouette?: readonly Pt[];
  readonly facing?: "left" | "right";
}
export const polygonKeys = [
  "lip_outer",
  "lip_inner",
  "eye_l",
  "eye_r",
  "brow_l",
  "brow_r",
  "cheek_l",
  "cheek_r",
  "jaw",
  "neck",
] as const;
type PolygonKey = (typeof polygonKeys)[number];
interface Edge {
  x: number;
  y: number;
  dx: number;
  dy: number;
  inverseLengthSquared: number;
}
export interface Polygon {
  readonly points: readonly Pt[];
  readonly edges: readonly Edge[];
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}
export type PreparedGeometry = Record<PolygonKey, Polygon | null>;

/** Validate even unused polygons, so malformed geometry never partially renders. */
export function prepareGeometry(
  g: FaceGeometry,
  width: number,
  height: number,
): PreparedGeometry {
  if (
    !g ||
    !Number.isFinite(g.width) ||
    !Number.isFinite(g.height) ||
    g.width <= 0 ||
    g.height <= 0
  ) {
    throw new RangeError(
      "FaceGeometry reference width and height must be positive.",
    );
  }
  const prepared = {} as PreparedGeometry;
  for (const key of polygonKeys) {
    const coordinates = g[key];
    if (!Array.isArray(coordinates))
      throw new TypeError(
        `FaceGeometry.${key} must be a normalized polygon array.`,
      );
    const points: Pt[] = Array.from(coordinates, (point) => {
      if (
        !Array.isArray(point) ||
        point.length !== 2 ||
        !Number.isFinite(point[0]) ||
        !Number.isFinite(point[1]) ||
        point[0] < 0 ||
        point[0] > 1 ||
        point[1] < 0 ||
        point[1] > 1
      ) {
        throw new RangeError(
          `FaceGeometry.${key} requires finite normalized coordinates in 0..1.`,
        );
      }
      return [point[0] * width, point[1] * height];
    });
    let area = 0;
    const edges: Edge[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x, y] = points[i],
        [nextX, nextY] = points[(i + 1) % points.length];
      const dx = nextX - x,
        dy = nextY - y;
      area += x * nextY - nextX * y;
      edges.push({
        x,
        y,
        dx,
        dy,
        inverseLengthSquared: dx || dy ? 1 / (dx * dx + dy * dy) : 0,
      });
    }
    prepared[key] =
      points.length < 3 || Math.abs(area) < 1e-8
        ? null
        : {
            points,
            edges,
            minX: Math.min(...points.map((p) => p[0])),
            maxX: Math.max(...points.map((p) => p[0])),
            minY: Math.min(...points.map((p) => p[1])),
            maxY: Math.max(...points.map((p) => p[1])),
          };
  }
  return prepared;
}

/** Distance to the closed polygon boundary in output pixels. */
export function boundaryDistance(
  polygon: Polygon,
  x: number,
  y: number,
): number {
  let squared = Infinity;
  for (const edge of polygon.edges) {
    const t = Math.max(
      0,
      Math.min(
        1,
        ((x - edge.x) * edge.dx + (y - edge.y) * edge.dy) *
          edge.inverseLengthSquared,
      ),
    );
    const dx = x - edge.x - t * edge.dx,
      dy = y - edge.y - t * edge.dy;
    squared = Math.min(squared, dx * dx + dy * dy);
  }
  return Math.sqrt(squared);
}

/** Pixel centers on a polygon edge are included, for either winding direction. */
export function contains(
  polygon: Polygon | null,
  x: number,
  y: number,
): polygon is Polygon {
  if (
    !polygon ||
    x < polygon.minX ||
    x > polygon.maxX ||
    y < polygon.minY ||
    y > polygon.maxY
  )
    return false;
  let inside = false;
  for (const edge of polygon.edges) {
    if (
      edge.y > y !== edge.y + edge.dy > y &&
      x < edge.x + ((y - edge.y) * edge.dx) / edge.dy
    )
      inside = !inside;
  }
  return inside || boundaryDistance(polygon, x, y) < 1e-8;
}
