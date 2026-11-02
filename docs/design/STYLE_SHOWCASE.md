# Style showcase — parallel frontend construction

2026-10-29. Owner explicitly prioritizes design/UI/copy/interactions, postpones stability/ops/bugs/tests/review work, and confirms commercial permission for all supplied portraits, hairstyle results and eyewear images. Permission is no longer a prerequisite for using these assets. This records owner authorization; no specific license text is invented.

Independent surface: `/dev/style-showcase`, development and Vercel preview only. Does not change the production Hero/homepage, personal Studio, report data or backend. Claude owns the final page composition. Reusable component: `components/style-showcase/StyleShowcase`, catalog data and isolated CSS. Follows existing R2 paper/moss/serif styling, installed Radix RadioGroup and existing HoldButton. No added dependency.

Implemented: four people with available results; selection between original and supplied hairstyle images; pointer/touch/keyboard hold-to-see-original; three real eyewear PNGs with selectable catalog presentation; upload/sample CTAs; mobile layout and reduced-motion styling. Catalog examples are separate from personalized recommendations; P001 bold is not promoted against its old rules. P002/P003 have no supplied standalone results and are not given fake successful previews. Edited images receive no measurement geometry. Preserve original result watermarks.

Source assets and SHA256 recorded in `web/public/style-showcase/manifest.json`. Eyewear tiles show actual images; personal Studio's existing outline simulation has not been replaced with bitmap fitting.

Plan executed inline: import authorized display assets → implement selection/comparison and frame catalog → provide draft integration PR/preview for Claude. No production deployment, tests, build validation or active review wait run at owner's instruction. Runtime compile/deployment status is not a claim of verified real-provider quality. Automated repository CI may run normally; no workflow changes or gate bypass.
