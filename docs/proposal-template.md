# FloodWatch Vietnam — Proposal (DRAFT)

> Asian Hackathon for Green Future 2026
> Deadline: 17 May 2026, 23:59 GMT+7. Submit target: 15 May evening.
> 3 A4 pages / ~1,500 words.

---

## 1. Problem (≈250 words)

Hook: rider quote + Vietnam-first stats:
- HCMC May 2025: 223.2mm in 90 min (Cu Chi station, biggest first-season rain in 8 years).
- Hanoi: Yagi typhoon Sep 2024, submerged neighborhoods for days.
- Mekong Delta: tidal flooding now hits Can Tho twice yearly, up from once.
- HCMC sinking 1.6cm/year — among top 10 fastest-sinking coastal cities globally.
- ~50M motorbikes in Vietnam; backbone of urban delivery + commuting.
- Grab driver quote: "floods are my biggest fear … fixing a waterlogged bike costs more than VND 150,000 — not worth it for a few dollars' ride."

End with the wedge:
> **Existing apps tell you the water has already arrived. FloodWatch tells you when it will arrive at YOUR route — anywhere in Vietnam.**

## 2. Competitive landscape (≈150 words)

- **UDI Maps** (HCMC, 2017): reactive, officer-in-the-loop, HCMC-only.
- **HSDC Maps** (Hanoi): same pattern, Hanoi-only.
- **Google Maps**: global flood pins, sparse Vietnam data, no prediction.
- **Waze**: crowdsource only, low Vietnam adoption.

| Dimension | Incumbents | FloodWatch |
|---|---|---|
| Coverage | Single-city, reactive | **All of Vietnam, tiered** |
| Forecast | None | 30 / 60 / 90 min |
| Route-aware | No | Yes |
| AI | None | Qwen-VL depth + multi-agent fusion |
| Data fusion | Single source | Rainfall + tide + drainage + crowdsource |
| Audience | General public | Riders + delivery / ride-hail B2B |
| Business model | Free government | Free B2C + paid B2B API |

## 3. Solution architecture — tiered coverage (≈350 words)

FloodWatch covers all of Vietnam through three honest tiers — judges, this is intentional. We claim accuracy where we can validate it, and rainfall-warnings everywhere else.

**Tier 1 — Full multi-feature prediction.** Ho Chi Minh City. Inputs: rainfall (Open-Meteo 15-min forecast), tide level (Vung Tau station), district drainage capacity (calibrated from UDI Maps historical reports), proximity to historical flood hotspots (30+ seed points in Thu Duc, growing). Methodology anchored in Scheiber et al. 2023 NHESS, which achieved 73% accuracy on a normalized flood severity index for HCMC.

**Tier 2 — Rainfall + tide + drainage prediction.** Hanoi, Da Nang, Can Tho, Hue. Inputs: rainfall + tide (coastal cities only) + city-level drainage score. Sparser hotspot data, coarser confidence. Used for "flood likely / unlikely" warnings.

**Tier 3 — Heavy-rain warning.** Anywhere else in Vietnam. Open-Meteo rainfall forecast only. Threshold: >20mm/30min triggers a warning. Not a flood prediction — explicitly framed as rainfall intensity alert.

Architecture diagram from `docs/architecture.md` goes here.

**Multi-agent orchestration:** four specialist agents per request — Forecast (tier-aware fusion), Route (samples 5 segments, parallel forecast calls), Depth (Qwen-VL classifies rider photos as dry/ankle/knee/impassable), Alert (plain-language recommendation). Mirrors ATM-style specialist coordination — judge-fit for Prof. Duong Nguyen Vu's aerospace/EUROCONTROL background.

## 4. Technical depth (≈250 words)

Stack: FastAPI + Qwen-VL + Qwen-Max + React PWA + Mapbox GL JS. Same stack we shipped 5 days ago for the Qwen AI Build Day Vietnam 2026 hackathon (project: Healix). Team has shipped this exact pipeline before.

Data layer:
- **Rainfall** — Open-Meteo (free, no API key, 15-min granularity nationwide)
- **Radar visualization** — RainViewer tile overlay
- **Tide** — Vung Tau station for southern coast, Da Nang for central coast
- **Drainage** — per-city scores calibrated against UDI Maps + HSDC Maps historical reports
- **Hotspots** — seeded 30+ for HCMC, ~3 each for Tier-2 cities, expanding via crowdsource

Validation:
- Tier 1 HCMC: backtest against UDI Maps historical reports, target 70%+ at 60-min horizon for severe events (matches Scheiber et al. benchmark).
- Tier 2 cities: 50%+ "flood likely" recall during typhoon season events.
- Tier 3: not validated for flood specifically — clearly framed as rainfall intensity warning.

## 5. Impact & scale (≈200 words)

- **Year 1 — Vietnam.** Tier 1 expands HCMC → all districts. Tier 2 cities promoted to Tier 1 as drainage data collected via partnerships with municipal authorities. Target: 100,000 active riders in rainy season 2027.
- **Year 2 — Vietnam + Indonesia + Philippines.** Same tiered architecture, regionalize fusion coefficients per city. Target: Jakarta, Manila pilot.
- **Year 3 — Wider SEA.** Bangkok, Phnom Penh, Yangon. Each new city = a config block, not a rewrite.

Social impact: poor and informal workers (Grab drivers, street vendors, delivery riders) bear disproportionate cost of climate-driven flooding (World Bank WPS7765, 2017). Free B2C tier means the people most exposed don't pay.

## 6. Business model (≈150 words)

- **B2C: free.** Individual riders never pay. ESG positioning.
- **B2B API: paid.** Tier-based pricing per fleet platform (Grab, ShopeeFood, Ahamove, J&T). Anchor: each cancelled delivery in a storm costs platforms ~$2–5 in refunds + re-dispatch.
- **Government partnership.** Complement UDI Maps and HSDC Maps with the prediction layer — not compete. HCMC and Hanoi each have Climate Resilience budgets.

## 7. Team & deadlines (≈100 words)

- **Ethan (Cao Tan Phat)** — full-stack AI, backend lead, fusion model architect. Qwen pipeline veteran (Healix hackathon).
- **Muthuraman** — data layer lead. Tide scraper, hotspot expansion across 5 pilot cities, RainViewer integration.
- **Kalent** — frontend lead. PWA, Mapbox flyover, mobile UX.
- **Kim** — pitch + demo. Proposal, intro video, B2B research.

Milestones: pre-submission MVP demo 14 May. Submission 15 May evening (48h buffer). Online training 2–28 June. 24-hour final 2–5 July at VinUniversity Hanoi.

---

## Submission checklist

- [ ] 3-page PDF following BTC's 7-section template
- [ ] 2–3 minute intro video — open with HCMC rainy-season footage, show flyover globe→Vietnam→Thu Duc, end with rider quote
- [ ] ≥8 named sources: Scheiber NHESS 2023, World Bank WPS7765, Vietnamnet on UDI Maps, IPCC AR6, MONRE Vietnam, ADB Climate Risk Vietnam, GSO Vietnam motorbike census, …
- [ ] External review by domain professor
- [ ] Submitted ≥48 hours before 17 May deadline
