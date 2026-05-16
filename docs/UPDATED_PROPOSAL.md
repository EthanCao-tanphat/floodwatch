# CtrlAltElite — FloodWatch Updated Proposal Draft

## 1. Project overview

**Project title:** FloodWatch — Flood Risk Before It Reaches Your Route

**Challenge area:** Urban Air Quality and Climate Resilience

**Solution category:** Web/Mobile Application

FloodWatch is a predictive flood-aware routing platform for Vietnamese motorbike riders. The system helps riders compare routes by flood risk and motorbike passability, not only by distance or travel time. A rider enters an origin and destination, and FloodWatch returns route options with segment-by-segment flood-risk scoring, evidence explanations, and a recommendation such as safe, pass slowly, avoid for motorbikes, or delay.

FloodWatch is designed for Vietnam-wide flood-aware routing with confidence tiers. In the current MVP, Ho Chi Minh City has the strongest full prediction layer, while other areas use partial or rainfall-first warnings until more verified local hotspot and drainage data is connected.

## 2. Problem statement

Flooding is a daily mobility risk in Vietnamese cities, especially for motorbike riders and delivery workers. A road can be passable now but become unsafe minutes later after heavy rain, poor drainage, high tide pressure, or upstream flooding. Existing map tools usually optimize for distance and time, while many flood tools are reactive: they show where water has already appeared.

For motorbike riders, this is not enough. The important question is not only “Where is water now?” but also “Will this route still be passable in the next 30–60 minutes?”

## 3. Existing solutions and gap

Google Maps provides route guidance but does not optimize for flood passability. Community flood maps and reactive dashboards show flooded locations, but they usually do not convert that information into rider-specific route decisions. Academic flood models often focus on city-scale risk and are not designed for a fast, practical route choice.

FloodWatch fills this gap by combining route selection with predictive flood evidence. It translates flood-related signals into a rider-friendly recommendation: continue, slow down, avoid, or delay.

Key positioning:

> UDI Maps tells riders where water already is; FloodWatch estimates where flood risk may hit their route next.

## 4. Proposed solution

FloodWatch is a web app that provides flood-aware route options for motorbike riders.

### Core features

1. **Flood-aware route comparison**  
   The app returns recommended, fastest, and alternative routes. Users can click route cards or map lines to choose a route.

2. **Segment-by-segment risk scoring**  
   Each route is divided into segments. Each segment receives a risk score, risk level, passability class, and confidence level.

3. **Evidence explanation**  
   The app explains why a segment is risky using rainfall, tide pressure, hotspot proximity, drainage proxy, rider report count, and photo confirmation when available.

4. **Live rider reports**  
   Riders can submit a photo report. The report appears on the map and can influence nearby route risk.

5. **Vietnam coverage tiers**  
   FloodWatch supports Vietnam-wide routing, but clearly labels prediction confidence: Full prediction, Partial prediction, or Rain-only warning.

## 5. Innovation and competitive advantage

FloodWatch is different because it is route-first and passability-first. It does not simply visualize flood points. It turns flood evidence into practical mobility decisions for motorbike riders.

The innovation is the combination of:

- Google Maps-style route comparison.
- Flood-risk scoring per route segment.
- Motorbike passability classification.
- Evidence-based explanations.
- Rider photo reports as live map evidence.
- Coverage confidence tiers for responsible Vietnam-wide expansion.

This creates a product that is easy to understand during emergencies: a rider can see the risky part of the route, understand why it is risky, and choose a safer alternative.

## 6. Feasibility and development plan

The current MVP already demonstrates the main workflow:

```text
origin/destination input
→ route candidates
→ selected route
→ segment risk scoring
→ evidence explanation
→ passability recommendation
→ rider reports and map evidence
```

The frontend uses React, Vite, TypeScript, Tailwind CSS, MapLibre GL JS, Three.js, and Framer Motion. The backend uses FastAPI, Pydantic, httpx, and asyncio. Routing uses GraphHopper. Rainfall forecasting uses Open-Meteo. Photo passability uses Qwen-VL/Dashscope when available.

The development plan is:

1. Lock one bulletproof HCMC demo route.
2. Expand verified hotspot data across more Vietnamese cities.
3. Replace proxy tide/drainage signals with official feeds where possible.
4. Persist rider reports in a production database.
5. Integrate Qwen-Max for natural Vietnamese alert messages.

## 7. Target users and impact

### Target users

- Motorbike riders.
- Delivery drivers.
- Ride-hailing drivers.
- Students and commuters.
- Urban flood-response teams.

### Environmental and climate resilience impact

FloodWatch helps people adapt to urban flooding by making mobility decisions more resilient. Instead of forcing riders to discover flooded roads by trial and error, the app gives earlier warning and safer route choices.

### Economic impact

For delivery and ride-hailing workers, flooded roads can cause lost income, damaged vehicles, and delayed service. FloodWatch can reduce avoidable flood exposure by helping riders choose safer routes before entering high-risk segments.

### Social impact

FloodWatch is designed for ordinary riders, not only city planners or specialists. The app converts complex flood signals into simple passability language.

## 8. Technologies applied

| Layer | Technology |
|---|---|
| Frontend | React, Vite, TypeScript, Tailwind CSS, MapLibre GL JS |
| Visualization | Three.js globe intro, map route rendering, draggable panels |
| Backend | FastAPI, Pydantic, httpx, asyncio |
| Routing | GraphHopper Directions API with alternative routes |
| Weather | Open-Meteo rainfall forecast with caching |
| AI | Qwen-VL/Dashscope for rider photo passability classification |
| Data | Curated flood hotspots, modeled tide-pressure proxy, drainage proxy, rider reports |
| Architecture | Multi-agent route, forecast, and photo verification services |

## 9. Data transparency

FloodWatch does not claim full official nationwide flood prediction yet. The MVP uses real routing and real rainfall forecasts, combined with modeled/proxy evidence and rider reports. The strongest current evidence layer is Ho Chi Minh City. Other cities are shown with lower confidence tiers until more local data is added.

This transparency is part of the product: users should know when a route is based on full evidence and when it is based on rainfall-first warning.

## 10. Closing

FloodWatch turns flood information into route decisions. It helps motorbike riders answer the practical question: “Can I still take this road safely?” By combining predictive route scoring, passability language, evidence explanations, and rider reports, FloodWatch can become a climate-resilient navigation layer for Vietnamese cities.
