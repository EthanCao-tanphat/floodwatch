# FloodWatch Implementation Insights

## Core Product Shift

FloodWatch is now framed as a motorbike-passability tool, not a generic flood map.

The sharper claim is:

> FloodWatch tells riders when flood risk may hit their route and whether a motorbike can still pass.

This matters because UDI Maps and similar tools are mostly reactive. FloodWatch's strongest wedge is route-aware, 30-60 minute decision support for riders and delivery platforms.

## Canonical Spec

`docs/SPEC.md` is the source of truth for MVP decisions.

Important defaults:

- MVP pilot is Thu Duc / District 7, not perfect nationwide prediction.
- Core forecast horizon is 30-60 minutes.
- 90-minute and wider Vietnam coverage are roadmap/stretch, not the main pitch.
- Qwen-VL verifies photo passability; it should not be described as exact water-depth measurement.
- B2B is route-risk and operational decision support, not just a prettier map.

## API Concept

The API keeps existing endpoint names for compatibility, but the meaning is now passability-first.

Key fields:

- `risk_score`: normalized 0.0-1.0 risk value
- `risk_level`: `low`, `moderate`, `high`, `severe`
- `passability`: `safe`, `slow_pass`, `avoid_for_motorbikes`, `impassable`, `unknown`
- `confidence`: `low`, `medium`, `high`
- `evidence`: rainfall, tide, hotspot proximity, drainage proxy, rider reports, photo confirmation

`POST /report/depth` still exists, but it should be treated as a compatibility name. The concept is photo-based passability verification.

## Globe Intro Concept

`web/src/components/GlobeIntro.tsx` rebuilds the missing globe from `docs/globe-handoff.md`.

Design intent:

- First impression: regional climate intelligence, not a generic landing page.
- Globe opens facing Southeast Asia so Vietnam/HCMC are immediately visible.
- Clicking Vietnam or HCMC enters the dashboard.
- Skip button always enters the dashboard.
- If WebGL or texture loading fails, the app falls back to `LandingScreen`.

Technical notes:

- The globe is lazy-loaded from `App.tsx` so Three.js does not inflate the initial dashboard bundle.
- It uses a procedural fallback earth texture first, then upgrades to the CDN night-earth texture if available.
- Existing `LandingScreen.tsx` is intentionally preserved as a safe fallback.

## Local Staging

Frontend only:

```powershell
cd C:\Users\kalen\projects\floodwatch\floodwatch\web
npm run dev
```

Full demo:

```powershell
cd C:\Users\kalen\projects\floodwatch\floodwatch\api
uvicorn main:app --reload --port 8000
```

Then open:

```text
http://localhost:5173
```

To replay the intro:

```js
localStorage.removeItem('floodwatch.landing.seen')
location.reload()
```

## Push Guidance

Safe to commit:

- source files under `api/`, `web/src/`, and `docs/`
- `README.md`
- `.env.example` files
- `package-lock.json`

Do not commit:

- real `.env` or `.env.local` files
- `node_modules/`
- `dist/`
- `__pycache__/`
- `*.pyc`
- `*.log`
- `web/tsconfig.tsbuildinfo`

The current `.gitignore` files already cover those generated or sensitive files.
