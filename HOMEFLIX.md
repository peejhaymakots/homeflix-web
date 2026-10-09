# HomeFlix TV LAN preview

This fork is based on Jellyfin Web tag `v12.1` (`fae41f33eb7cd636a9ef68984adb82bb247a6e1b`), matching Jellyfin Server 12.1.0. Jellyfin's GPL-2.0-or-later license remains in LICENSE.

HomeFlix adds a responsive browsing experience, user-scoped library recommendations, multilingual spoiler-free summaries and Seerr Requests. Upstream playback, stream negotiation, subtitles, audio selection and settings remain available.

## Build

Use Node.js >=24 and npm >=11. Run `npm ci`, `npm run build:check`, then `npm run build:production`. The deployable assets are in `dist/`. Builds run off the shared LXC host.

## Backend

The separate infojellyfin Worker provides `/api/frontend/*`, protected by a gateway secret and an exact frontend-origin allowlist. The Nginx instance exposes this as same-origin `/homeflix-api/*` and sends only the preview's Requests cookie. Library AI uses the viewer's Jellyfin token and fetches allowed candidates before inference. Restricted profiles cannot use external catalog discovery/Requests.

The LAN preview uses `http://172.16.110.6:8093`; credentials travel over the trusted LAN using HTTP. Its Requests session has a separate encryption key, cookie name and `/homeflix-api` path. Production info-site cookie behavior remains unchanged. Never commit either gateway or session secrets.

## Preview host

The preview runs as the dedicated `homeflix-preview` user/service with one Nginx worker and a 256 MB memory limit. Static assets, runtime, logs and temporary files are confined to `/opt/homeflix-preview`. It has no database credentials. Existing applications, databases and scheduled jobs are not deployment targets.

Rollbacks stop only `homeflix-preview` or switch its own `current` release symlink before restarting that service. Public-domain rollout is a separate step after LAN acceptance.
