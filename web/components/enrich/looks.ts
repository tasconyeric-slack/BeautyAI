/** Parameter sets for IllustratedAvatar examples (styles and A/B impressions), per user-selected presentation.
 *  Pure illustration parameters — nothing here is read from a photo. */
import type { IllustratedAvatarProps } from "@/components/cards";

export type StyleKey = "sweet" | "boyish" | "modern" | "elegant" | "classic" | "natural" | "romantic" | "dramatic";
export const STYLE_KEYS: readonly StyleKey[] = ["sweet", "boyish", "modern", "elegant", "classic", "natural", "romantic", "dramatic"];
export type AvatarPresentation = IllustratedAvatarProps["presentation"];

type Look = { length: string; fringe: string; curl: string; colorHex: string; palette: string[] };
type LookSet = { long: Look; short: Look };

const look = (length: string, fringe: string, curl: string, colorHex: string, palette: string[]): Look =>
  ({ length, fringe, curl, colorHex, palette });

const STYLE_LOOKS: Record<StyleKey, LookSet> = {
  sweet: { long: look("collarbone", "air", "wavy", "#4A352D", ["#F2C4C0", "#F7E3DC", "#E9A6A1"]),
    short: look("ear", "blunt", "straight", "#3B2A24", ["#F2C4C0", "#F7E3DC", "#E9A6A1"]) },
  boyish: { long: look("ear", "side", "straight", "#2E2724", ["#9CC3D9", "#F3F1EA", "#5E8FB0"]),
    short: look("short", "side", "straight", "#2E2724", ["#9CC3D9", "#F3F1EA", "#5E8FB0"]) },
  modern: { long: look("crop", "blunt", "straight", "#151515", ["#1C1C1C", "#F4F4F2", "#C8372D"]),
    short: look("crop", "blunt", "straight", "#151515", ["#1C1C1C", "#F4F4F2", "#C8372D"]) },
  elegant: { long: look("shoulder", "side", "wavy", "#3E2E2A", ["#B79AA6", "#EDE4E6", "#8C6F7B"]),
    short: look("ear", "side", "wavy", "#3E2E2A", ["#B79AA6", "#EDE4E6", "#8C6F7B"]) },
  classic: { long: look("collarbone", "none", "straight", "#2A2220", ["#2F3E5C", "#E8E1D3", "#A88B62"]),
    short: look("short", "none", "straight", "#2A2220", ["#2F3E5C", "#E8E1D3", "#A88B62"]) },
  natural: { long: look("shoulder", "none", "wavy", "#4F3B2E", ["#A58D6F", "#EAE2D2", "#6F7F5E"]),
    short: look("ear", "none", "wavy", "#4F3B2E", ["#A58D6F", "#EAE2D2", "#6F7F5E"]) },
  romantic: { long: look("long", "side", "curly", "#3A2622", ["#9E3D52", "#F1DCDC", "#C98A93"]),
    short: look("ear", "side", "curly", "#3A2622", ["#9E3D52", "#F1DCDC", "#C98A93"]) },
  dramatic: { long: look("long", "none", "straight", "#121212", ["#121212", "#C9A24B", "#5A1F2B"]),
    short: look("short", "none", "straight", "#121212", ["#121212", "#C9A24B", "#5A1F2B"]) },
};

export type ImpressionKey = "sharp" | "gentle" | "mature" | "youthful" | "refined" | "distinctive";
const IMPRESSION_LOOKS: Record<ImpressionKey, LookSet> = {
  sharp: { long: look("ear", "none", "straight", "#1E1E1E", ["#26313B", "#EDEDEA", "#5B6B78"]),
    short: look("crop", "none", "straight", "#1E1E1E", ["#26313B", "#EDEDEA", "#5B6B78"]) },
  gentle: { long: look("collarbone", "air", "wavy", "#5A4034", ["#D9C3B8", "#F1E8E1", "#BFA89C"]),
    short: look("ear", "side", "wavy", "#5A4034", ["#D9C3B8", "#F1E8E1", "#BFA89C"]) },
  mature: { long: look("shoulder", "side", "straight", "#2D2321", ["#4A3B36", "#D8CCBF", "#2F3A40"]),
    short: look("short", "side", "straight", "#2D2321", ["#4A3B36", "#D8CCBF", "#2F3A40"]) },
  youthful: { long: look("collarbone", "blunt", "straight", "#3E2C25", ["#F2B8A2", "#F6E9C9", "#8CCBBE"]),
    short: look("ear", "blunt", "straight", "#3E2C25", ["#F2B8A2", "#F6E9C9", "#8CCBBE"]) },
  refined: { long: look("collarbone", "none", "straight", "#33302E", ["#8C8C88", "#E3E1DC", "#5E605E"]),
    short: look("short", "none", "straight", "#33302E", ["#8C8C88", "#E3E1DC", "#5E605E"]) },
  distinctive: { long: look("shoulder", "blunt", "curly", "#1A1A1A", ["#B33A3A", "#F2C14E", "#1C1C1C"]),
    short: look("ear", "blunt", "curly", "#1A1A1A", ["#B33A3A", "#F2C14E", "#1C1C1C"]) },
};

function toProps(set: LookSet, presentation: AvatarPresentation, label: string): IllustratedAvatarProps {
  const l = presentation === "masculine" ? set.short : set.long;
  return { hair: { length: l.length, fringe: l.fringe, curl: l.curl, colorHex: l.colorHex }, palette: l.palette, presentation, label };
}

export const styleLook = (k: StyleKey, p: AvatarPresentation, label: string) => toProps(STYLE_LOOKS[k], p, label);
export const impressionLook = (k: ImpressionKey, p: AvatarPresentation, label: string) => toProps(IMPRESSION_LOOKS[k], p, label);

export function avatarPresentation(p: "feminine" | "masculine" | "androgynous" | undefined): AvatarPresentation {
  return p === "masculine" ? "masculine" : p === "androgynous" ? "neutral" : "feminine";
}
