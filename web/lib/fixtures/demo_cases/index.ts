/** Pipeline-backed sample reports (Issue #14): owner-approved, fully AI-synthesized fictional adults, analysed by the
 *  real production pipeline (scripts/build_demo_cases.py). The JSON files are byte-identical copies of
 *  examples/demo_cases/<person>/ (a test keeps them in sync). To add a person: add a manifest entry, run the script,
 *  then import its three files below. Nothing else changes. */
import type { Passport } from "../../passport";
import type { FaceGeometry } from "../../tint";
import p001 from "./person-001.passport.json";
import g001 from "./person-001.geometry.json";
import v001 from "./person-001.provenance.json";
import p002 from "./person-002.passport.json";
import g002 from "./person-002.geometry.json";
import v002 from "./person-002.provenance.json";

export interface DemoProvenance {
  snapshot_version: string;
  person_id: string;
  sample_id: string;
  display_label: string;
  built_at: string;
  published_images: Record<string, { path: string; width: number; height: number; sha256: string }>;
  layers: {
    cv: { engine: string; side_view: { qc_accepted: boolean; status: string | null } };
    scoring: { scoring_version: string | null; status: string | null };
    analysis: { provider: string; model: string; prompt_version: string; retries: number };
    previews: { status: string; reason: string };
    learned_attractiveness: { status: string; reason: string };
  };
}

export interface DemoCase {
  /** URL key for /report/sample?v=<key> */
  key: string;
  id: string;
  label: string;
  passport: Passport;
  geometry: FaceGeometry;
  /** role → public URL; profile90 only when real QC accepted the side photo */
  photos: Record<string, string>;
  provenance: DemoProvenance;
}

function demoCase(key: string, passport: unknown, geometry: unknown, provenance: unknown): DemoCase {
  const v = provenance as DemoProvenance;
  const p = passport as Passport;
  return {
    key, id: p.passport_id, label: v.display_label, passport: p, geometry: geometry as FaceGeometry,
    photos: Object.fromEntries(Object.entries(v.published_images).map(([role, img]) => [role, img.path])),
    provenance: v,
  };
}

export const DEMO_CASES: DemoCase[] = [
  demoCase("p001", p001, g001, v001),
  demoCase("p002", p002, g002, v002),
];

export const demoCaseById = (id: string) => DEMO_CASES.find((c) => c.id === id);
export const demoCaseByKey = (key: string | undefined) => DEMO_CASES.find((c) => c.key === key);
