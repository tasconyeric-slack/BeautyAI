/** The overview's evidence and availability (Issue #2): which photo views were measured, what is withheld by the free
 *  view, and which atlas region backs each strength. Pure functions; every fact is read from the passport's own
 *  measurement view — nothing is measured, scored or invented here. */
import { ATLAS } from "@/components/face/atlas-model";
import type { MeasureView } from "@/components/face/measure-model";

/** The face-atlas region (config/face_atlas.yaml) a feature-signature region belongs to, or null if none claims it. */
export const atlasKeyFor = (region: string): string | null =>
  ATLAS.regions.find((r) => r.signature_regions.includes(region))?.key ?? null;

export interface AvailabilityRow {
  key: string;
  name: string;
  state: "measured" | "missing";
  text: string;
}

export interface Availability {
  rows: AvailabilityRow[];
  /** Detailed measurements the free view withholds, or null when nothing is withheld. */
  locked: string | null;
  /** "共已测 112 / 117 项" */
  summary: string;
}

export function availability(mv: MeasureView | null): Availability | null {
  if (!mv) return null;
  const rows = mv.views.map<AvailabilityRow>((v) => {
    if (v.status === "measured") return { key: v.role, name: v.name, state: "measured", text: `已测 ${v.measured} / ${v.total} 项` };
    if (v.status === "unavailable") return { key: v.role, name: v.name, state: "missing", text: "这张照片没能用于测量" };
    return { key: v.role, name: v.name, state: "missing", text: v.total > 0 ? `未提供，补充后可多测 ${v.total} 项` : "未提供" };
  });
  return {
    rows,
    locked: mv.lockedCount > 0 ? `${mv.lockedCount} 项测量明细包含在完整护照中` : null,
    summary: `共已测 ${mv.totalMeasured} / ${mv.totalDefined} 项`,
  };
}
