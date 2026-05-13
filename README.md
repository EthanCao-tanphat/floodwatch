# FloodWatch HCMC

> Predictive flooded-road intel for Ho Chi Minh City motorbike riders.
> Built for the **Asian Hackathon for Green Future 2026** (Vingroup + VinUniversity).

UDI Maps tells you the water has already arrived. **FloodWatch tells you when it will arrive at YOUR route.**

## What this is

A web platform with three faces:
- **Rider PWA** — free for individual motorbike riders, shows flood-risk forecast 30/60/90 minutes ahead on your route
- **B2B API** — paid tier for delivery and ride-hail platforms (Grab, ShopeeFood, Ahamove, J&T) to re-route fleets before the rain hits
- **Public dashboard** — city-wide flood map for partnership with HCMC Urban Drainage Company

Pilot district: **Thu Duc**. Scale path: HCMC → Hanoi → Jakarta / Manila / Bangkok.

## Repo layout

```
floodwatch/
├── api/           FastAPI backend, deploys to Hugging Face Spaces
├── web/           React PWA frontend, deploys to Vercel
├── docs/          Architecture, proposal drafts, references
└── README.md      You are here
```

## Quick start

Two terminal windows side by side.

### Terminal 1 — backend
```bash
cd api
pip install -r requirements.txt
cp .env.example .env
# put your DASHSCOPE_API_KEY in .env
python test_openmeteo.py   # smoke test, should print rainfall
uvicorn main:app --reload --port 8000
```

Open `http://localhost:8000/docs` for the interactive Swagger UI.

### Terminal 2 — frontend
```bash
cd web
npm install
cp .env.example .env.local
# leave VITE_API_BASE_URL=http://localhost:8000 for local dev
npm run dev
```

Open `http://localhost:5173`.

Frontend (`web/`) is open — whoever has cycles. Mobile-first, Vietnamese-first UI.

## Deployment

Backend → Hugging Face Spaces (Docker SDK). See [`api/README.md`](api/README.md).
Frontend → Vercel. Set root directory to `web/`. See [`web/README.md`](web/README.md).

## Key technical decisions

- **No LangGraph / CrewAI for MVP.** Four agents is small enough for plain `async def` + Pydantic. Faster to ship, easier to debug. Roadmap as scale-out.
- **Fusion model = logistic regression on 4 features.** Defensible to judges, interpretable, calibratable against UDI Maps historical data.
- **Open-Meteo for rainfall.** Free, no API key, real coverage for Vietnam. VMHA radar is internal and not publicly accessible.
- **Static JSON for hotspots / drainage.** Will migrate to Postgres post-MVP. For 5-day sprint, JSON files beat database setup.
- **Two-repo deployment, one-repo development.** Monorepo here, two hosts in production (Vercel + HF). Same pattern as Healix.

## Reading list (for the pitch)

- [Scheiber et al. 2023, NHESS](https://nhess.copernicus.org/articles/23/2313/2023/) — open-access HCMC flood index methodology, our academic anchor
- [Vietnamnet 2017 on UDI Maps](https://vietnamnet.vn/en/hcm-city-flood-updates-available-on-app-E179011.html) — the incumbent we differentiate against
- [World Bank WPS7765](https://documents1.worldbank.org/curated/en/928051469466398905/pdf/WPS7765.pdf) — flood exposure + poverty in HCMC, for the social-impact framing
- The brainstorm document, `docs/brainstorm-v3.md`

## Deadlines

| Date | Milestone |
|---|---|
| **17 May 2026, 23:59 GMT+7** | Proposal + intro video submission |
| **2–28 June 2026** | Online training for Top 30 |
| **2–5 July 2026** | 24-hour final at VinUniversity Hanoi |

Submit 48h early: **target 15 May evening**.
