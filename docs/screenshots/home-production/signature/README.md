# Hero signature motion (Issue #35)

Recorded from the production build (`NEXT_PUBLIC_USE_FIXTURE=1 npm run build && next start`) in Chromium.
Each clip: entrance (approved front draw → measured profile), rest, manual **正脸**, manual **侧脸**.

| Viewport | Motion | Wipe keyframes (≈6 fps) | Rest |
|---|---|---|---|
| 1440 × 900 | [hero-signature-1440.mp4](hero-signature-1440.mp4) | [sequence-1440.jpg](sequence-1440.jpg) | [rest-profile-1440x900.png](rest-profile-1440x900.png) |
| 390 × 844 (touch) | [hero-signature-390.mp4](hero-signature-390.mp4) | [sequence-390.jpg](sequence-390.jpg) | [rest-profile-390x844.png](rest-profile-390x844.png) |

Checks during recording: photo/SVG box drift **0 px** for both plates at both sizes, no page errors. Separately
checked at 1024×768, 1100×800, 800×1000, 1280×720, 430×932 and 320×568: no horizontal overflow, controls never
overlap the main CTA; reduced motion renders the static front with instant view switches and no autoplay/replay.
