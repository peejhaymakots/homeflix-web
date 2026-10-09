# HomeFlix preview

Jellyfin Web 12.1 with a custom browser interface for the authenticated LAN preview.

The homepage includes HomeFlix AI, a controlled eight-second carousel, scoped library rails, series updates and grouped upcoming releases. Libraries use user-visible Jellyfin views; prerolls are hidden and Vivamax is isolated from general browsing and recommendations. A unified details dialog provides automatic multilingual summaries, rich metadata, movie versions, audio/subtitle selection and season/episode playback through the upstream player.

`src/homeflix/` contains the custom controllers, reusable UI, filters and styles. The companion `infojellyfin` gateway supplies authenticated configuration, enriched details, catalog lookups, recommendations and per-user summaries. Core playback and settings remain provided by Jellyfin.

## Local checks

Run `npm run build:check` and `npm run build:production`. Run `node tests/homeflix-ui.cjs` with `HOMEFLIX_PLAYWRIGHT_MODULE` pointing to an installed Playwright module and `HOMEFLIX_API_DIR` pointing to the gateway checkout. The fixture uses mocked services and never submits a live media request. Screenshots default to ignored `.homeflix-qa/`, configurable with `HOMEFLIX_QA_DIR`.

Build off-host. Deploy compiled assets into a new versioned release under `/opt/homeflix-preview/releases/` and switch only `/opt/homeflix-preview/current`. Gateway changes deploy through GitHub main and Cloudflare Workers Builds. Shared applications, databases, dependencies and public media routing are outside this preview deployment.
