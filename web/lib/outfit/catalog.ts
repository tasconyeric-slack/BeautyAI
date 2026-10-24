/** The garment catalog (config/garments.yaml, exported by `make types`) as the outfit boards see it: the only source of
 *  garment ids, slots and search terms. A piece that has no entry here is shown as a generic, clearly marked slot. */
import raw from "@/lib/generated/garments.json";

export type Slot = "top" | "bottom" | "dress" | "outer" | "shoes" | "bag" | "accessory";
export interface CatalogGarment {
  id: string;
  category: Slot;
  name_zh: string;
  silhouette: string | null;
  fabric: string | null;
  color_slot: "near_face" | "base" | "accent";
  presentations: string[];
  occasions: string[];
  search_tpl: string;
}

export const CATALOG: readonly CatalogGarment[] = (raw as { garments: CatalogGarment[] }).garments;
const BY_ID = new Map(CATALOG.map((g) => [g.id, g]));
export const catalogGarment = (id: string): CatalogGarment | undefined => BY_ID.get(id);

/** Same template the rules layer uses for `outfit_checks[].search_zh`, for pieces that layer did not cover. */
export function searchTerm(g: CatalogGarment, colorName: string | null): string {
  const out = g.search_tpl
    .replace("{color}", colorName ?? "")
    .replace("{fabric}", g.fabric ?? "")
    .replace("{name}", g.name_zh)
    .replace("{silhouette}", g.silhouette ?? "");
  return out.split(/\s+/).filter(Boolean).join(" ");
}
