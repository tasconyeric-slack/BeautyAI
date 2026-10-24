/** Fixture-mode mirror of src/aesthetic_passport/api/entitlement.py free_view (values from config/pricing.yaml).
 * The real API trims on the server; this keeps fixture demos honest about what is free. */
import type { Passport } from "../passport";

const FREE = { hairTiers: ["safe", "bold", "easy"], outfitFormulas: 2, outfitItems: 4, lipFamilies: 2, measurementTiers: ["free"] } as const; // D33, D34

export function freeView(passport: Passport): [Passport, string[]] {
  const p = JSON.parse(JSON.stringify(passport)) as Passport;
  const an = p.analysis;
  const d = p.derived;
  const locked: string[] = [];
  const dropped = an.hair_options.filter((o) => !(FREE.hairTiers as readonly string[]).includes(o.tier)).map((o) => o.tier);
  an.hair_options = an.hair_options.filter((o) => (FREE.hairTiers as readonly string[]).includes(o.tier)) as typeof an.hair_options;
  locked.push(...dropped.map((t) => `hair_options.${t}`));
  const od = an.outfit_direction;
  if (od.formulas.length > FREE.outfitFormulas) {
    od.formulas = od.formulas.slice(0, FREE.outfitFormulas) as typeof od.formulas;
    locked.push("outfit.formulas");
  }
  if (od.occasions.length) {
    od.occasions = [] as unknown as typeof od.occasions;
    locked.push("outfit.occasions");
  }
  if (od.items.length > FREE.outfitItems) {
    od.items = od.items.slice(0, FREE.outfitItems) as typeof od.items;
    const ids = new Set(od.items.map((i) => i.garment_id));
    d.outfit_checks.items = d.outfit_checks.items.filter((i) => ids.has(i.garment_id));
    locked.push("outfit.items");
  }
  const lips = an.color_profile.lip_families;
  if (lips.length > FREE.lipFamilies) {
    an.color_profile.lip_families = lips.slice(0, FREE.lipFamilies) as typeof lips;
    locked.push("makeup.lip_families");
  }
  if (d.glasses_size !== null) {
    d.glasses_size = null;
    locked.push("glasses_size");
  }
  const mp = p.measurement_profile;
  if (mp) {
    // mirrors api/entitlement.free_view (V3B): locked rows stay listed, their values and overlays do not
    const lockedIds = new Set<string>();
    for (const m of mp.metrics) {
      if ((FREE.measurementTiers as readonly string[]).includes(m.tier)) continue;
      lockedIds.add(m.id);
      Object.assign(m, { value: null, components: null, confidence: null, locked: true, notes: [],
        overlay: { segments: [], angles: [], points: [], outline: false, silhouette: false } });
    }
    if (lockedIds.size) {
      locked.push("measurement_profile.full");
      const mi = d.measurement_insights;
      if (mi) {
        mi.items = mi.items.filter((i) => !lockedIds.has(i.metric_id));
        if (mi.assessments) mi.assessments = mi.assessments.filter((a) => !lockedIds.has(a.metric_id));
        for (const pl of mi.pillars) pl.notable = pl.notable.filter((x) => !lockedIds.has(x));
      }
    }
  }
  if (d.plan.today.length || d.plan.next_haircut.length || d.plan.invest.length) {
    d.plan = { today: [], next_haircut: [], invest: [] };
    locked.push("plan");
  }
  return [p, locked];
}
