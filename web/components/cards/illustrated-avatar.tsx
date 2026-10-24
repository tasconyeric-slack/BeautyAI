import { cardPalette, safeColor } from "./card-frame";

export interface IllustratedAvatarProps {
  hair: { length: string; fringe: string; curl: string; colorHex: string };
  palette: readonly string[];
  /** User-selected expression; it changes clothing only, never infers identity. */
  presentation: "feminine" | "masculine" | "neutral";
  label?: string;
}

/** Original parameter-drawn SVG. No photo inputs, image elements, filters or external resources. */
export function IllustratedAvatar({ hair, palette, presentation, label = "参数生成的插画头像" }: IllustratedAvatarProps) {
  const colors = cardPalette(palette);
  const ink = "#37312E";
  const hairColor = safeColor(hair.colorHex, "#493C36");
  const short = ["short", "ear", "crop"].includes(hair.length);
  const long = ["long", "chest"].includes(hair.length);
  const wavy = !["straight", "none"].includes(hair.curl);
  const backHair = short
    ? "M155 232 C111 124 165 64 244 66 C331 64 375 126 345 247 L316 291 L174 288 Z"
    : `M144 243 C108 139 151 61 244 62 C341 63 383 141 353 246 ${wavy ? "C391 292 354 319 382 354 C399 397 369 418 363" : "L365"} ${long ? 480 : 389} Q250 ${long ? 510 : 424} 128 ${long ? 480 : 389} ${wavy ? "C98 361 131 331 114 301 Q106 274 144 243" : "L144 243"} Z`;
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 560" width="100%" height="100%" role="img" aria-label={label}>
    <title>{label}</title>
    <circle cx="250" cy="236" r="202" fill={colors[2]} opacity="0.45" />
    <path d="M51 493 Q81 382 193 381 L306 381 Q418 386 449 493 L449 560 L51 560Z" fill={colors[0]} stroke={ink} strokeWidth="2.4" />
    <path d={backHair} fill={hairColor} stroke={ink} strokeWidth="2.7" strokeLinejoin="round" />
    <path d="M209 313 L208 382 Q247 420 293 382 L290 312" fill="#D8B8A3" stroke={ink} strokeWidth="2.2" />
    <path d="M165 210 Q144 186 149 224 Q150 251 173 255 M332 210 Q354 188 349 225 Q347 251 327 256" fill="#E8CCB6" stroke={ink} strokeWidth="2.2" />
    <path d="M164 174 Q167 116 245 113 Q326 116 336 177 L326 270 Q308 331 251 348 Q195 334 174 277Z" fill="#E8CCB6" stroke={ink} strokeWidth="2.4" />
    <path d="M182 210 Q203 200 222 208 M278 208 Q299 199 317 210" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />
    <path d="M185 230 Q202 240 220 230 M280 230 Q297 240 314 229" fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
    <path d="M251 237 L243 271 Q250 275 259 270 M229 299 Q251 310 275 297" fill="none" stroke="#916F61" strokeWidth="2.4" strokeLinecap="round" />
    {hair.fringe === "blunt" || hair.fringe === "air" ? <path d="M159 181 Q161 100 245 100 Q328 101 339 187 L312 180 L303 151 L296 184 L273 181 L266 154 L258 186 L231 183 L225 154 L214 184 L190 183 L182 154 L176 186Z" fill={hairColor} stroke={ink} strokeWidth="2.2" />
      : <path d={hair.fringe === "none" ? "M155 203 Q138 117 204 94 Q287 56 332 135 L341 206 Q307 171 295 130 Q212 135 155 203Z" : "M154 218 Q127 140 187 101 Q223 76 250 105 Q271 77 305 104 Q362 138 341 219 Q301 188 274 129 L251 112 Q219 185 154 218Z"} fill={hairColor} stroke={ink} strokeWidth="2.5" />}
    {wavy && <path d={short ? "M157 147 Q132 171 153 194 M326 134 Q350 160 335 183" : "M148 253 Q122 277 143 302 Q164 328 143 353 M341 255 Q367 279 348 307 Q328 335 349 363"} fill="none" stroke="#BBA38B" strokeWidth="2" opacity="0.65" />}
    {presentation === "feminine" ? <path d="M188 391 L251 456 L312 391 M251 456 L251 560" fill="none" stroke={ink} strokeWidth="2.5" />
      : presentation === "masculine" ? <path d="M188 387 L210 437 L250 416 L290 437 L313 388 M250 417 L250 560" fill="none" stroke={ink} strokeWidth="2.5" />
        : <path d="M187 391 Q247 447 313 391" fill="none" stroke={ink} strokeWidth="2.5" />}
    <path d="M117 451 L108 560 M384 453 L395 560" fill="none" stroke={ink} strokeWidth="2" opacity="0.7" />
    <circle cx="329" cy="462" r="13" fill={colors[1]} stroke={ink} strokeWidth="2" />
  </svg>;
}
