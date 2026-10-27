# Design component workflow

This setup extends the existing Next.js app. Start in `web/`, read `web/AGENTS.md`, and reuse `components/ui/`, `components/ds/`, `lib/utils.ts`, and the `--ap-*` tokens in `components/ds/tokens.css`. Tailwind v4 aliases in `app/globals.css` supply the current paper, ink, accent, stage, and rule utilities. The homepage is outside this tooling setup.

## Choosing a component

| Source | Fit and license | Decision |
| --- | --- | --- |
| [shadcn/ui](https://ui.shadcn.com/docs/installation/next) | MIT; works with the current React 19, Tailwind v4, Radix and Lucide stack. Copies source into the app. | Primary CLI for missing primitives. Check `components/ui/` first so existing Button, Card, Accordion and Popover stay intact. |
| [Aceternity UI](https://ui.aceternity.com/installation) | Official free registry; some blocks and pages require a Pro key. Many effects add animation dependencies. | Its published free registry is configured as `@aceternity`. Inspect an item's code, license, dependencies, motion and accessibility before adding it. |
| [React Bits](https://github.com/DavidHDev/react-bits#installation) | Free components in four JS/TS and CSS/Tailwind variants. Its repository states MIT + Commons Clause; this is more restrictive than plain MIT. Pro requires a paid license. | Research source for a specific effect. No React Bits registry or code is installed in this setup. Review its terms and runtime cost before use. |

For React Bits free components, the [installation guide](https://reactbits.dev/get-started/installation) currently documents `npx shadcn@latest add @react-bits/SplitText-TS-TW`, `npx jsrepo@latest add https://reactbits.dev/r/SplitText-TS-TW`, and copying code plus its listed dependencies. The free registry URL is published by the [project itself](https://github.com/DavidHDev/react-bits#use-it-with-your-agent) as `https://reactbits.dev/r/{name}.json`. Do not use the separate authenticated Pro registries for this workflow.

## Add a component

1. From `web/`, inspect the existing UI and the [shadcn registry](https://ui.shadcn.com/docs/cli): `npx shadcn@latest view separator`. Search Aceternity with `npx shadcn@latest search '@aceternity' -q card` when it suits the design.
2. Run `npx shadcn@latest add <component>` from `web/`. `web/components.json` points at the existing CSS file and aliases. The Separator in `web/components/ui/separator.tsx` is the installed smoke component; it is not imported by a production page.
3. Inspect every generated file and dependency diff. Reuse `@/lib/utils` for `cn`, existing Radix and Lucide packages, and BeautyAI utilities such as `bg-rule`. Generated Nova classes may refer to a generic shadcn palette that this app does not use. Adapt them to `--ap-*` aliases before rendering. Preserve upstream license notices and add adapted third-party code to `THIRD_PARTY.md`.
4. Run `npm run typecheck`, `npm test`, and `npm run build` in `web/`. Check the affected screen in light and dark modes, on mobile, and with reduced motion before putting a new component in a user path.

The initialization CLI detected Next.js 16, Tailwind v4 and `@/*`. It also rewrote the established fonts, color aliases, layout and shared utility file. Those unrelated edits were reverted. Keep `web/components.json`; review the diff after any future CLI run and do not accept a replacement global theme.

## MCP in this repository

Open the repository **root** in Codex or Claude Code. `.codex/config.toml` and `.mcp.json` register a local `shadcn` server. Both launch `node scripts/shadcn-mcp.mjs`, which starts the [official shadcn MCP server](https://ui.shadcn.com/docs/mcp) with `web/` as its working directory. This relative launcher works across checkout locations and keeps machine paths and credentials out of Git. Node and npm must be on `PATH`; the first `npx` run needs network access.

After restarting the client, run `codex mcp get shadcn` in Codex, or `/mcp` in Claude Code. Ask the server for `get_project_registries`; it should return `@shadcn` and `@aceternity` from `web/components.json`. The Codex CLI and a direct MCP protocol call were verified here. Claude Code was unavailable on this machine, so its client connection remains untested.

## Design Skill

The official [Anthropic frontend-design Skill](https://github.com/anthropics/skills/tree/main/skills/frontend-design) is installed in this machine's Codex skills directory with its sibling `LICENSE.txt` (Apache 2.0). The Skill is local agent guidance, not a web dependency or repository asset. Install it on another machine from that official folder using Codex's `skill-installer`; keep `LICENSE.txt` with `SKILL.md`. It becomes available to Codex on the next turn. BeautyAI's own product brief and tokens take precedence for this app.
