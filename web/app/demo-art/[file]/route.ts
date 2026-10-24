/** Demo-only illustration art for fixture Look Studio previews: the committed sample portrait (a drawn, fictional
 *  person) with its hair recoloured. `/demo-art/<base>_<RRGGBB>.svg`, base = portrait | portrait-safe | -bold | -easy.
 *  No photo is ever involved. */
const BASES = new Set(["portrait", "portrait-safe", "portrait-bold", "portrait-easy"]);
const HAIR_FILL = /fill="#3b2a24"/gi;

export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = /^(portrait(?:-safe|-bold|-easy)?)(?:_([0-9a-fA-F]{6}))?\.svg$/.exec(file);
  if (!m || !BASES.has(m[1])) return new Response("not found", { status: 404 });
  const res = await fetch(new URL(`/sample/${m[1]}.svg`, req.url));
  if (!res.ok) return new Response("not found", { status: 404 });
  let svg = await res.text();
  if (m[2]) svg = svg.replace(HAIR_FILL, `fill="#${m[2]}"`);
  return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
