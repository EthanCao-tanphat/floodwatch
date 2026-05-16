# FloodWatch Video Demo Guide

**Audience:** Hackathon judges  
**Target length:** 2–3 minutes  
**Goal:** Show that FloodWatch is not just a concept. It is a working flood-aware routing app.

## 1. Main message

Use this one sentence again and again:

> UDI Maps tells riders where water already is; FloodWatch estimates where flood risk may hit their route next.

## 2. Demo story

The video should show this flow:

```text
Rider enters route
→ FloodWatch compares route options
→ App highlights risky segments
→ User clicks a segment and sees evidence
→ App recommends pass slowly / avoid / delay
→ Coverage badge explains confidence
```

Do not spend too long on the globe intro. It looks cool, but the core product is route risk.

## 3. Setup checklist before filming

Run backend:

```bash
cd ~/floodwatch/api
/usr/bin/python3 -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Run frontend:

```bash
cd ~/floodwatch/web
npm run dev
```

Open:

```text
http://localhost:5173
```

Hard refresh:

```text
Cmd + Shift + R
```

Check:

```text
1. Globe loads or skip works.
2. Dashboard map loads.
3. Routes panel opens.
4. Typed input works.
5. Route cards appear.
6. Map route appears.
7. Segment popup appears when clicked.
8. Floating panel can drag/reset.
9. Layers panel toggles markers.
```

## 4. Recommended demo routes

### Primary HCMC demo

Use this for the main demo:

```text
FROM: Huynh Tan Phat, District 7
TO:   Vo Van Ngan, Thu Duc
```

Expected message:

```text
Coverage: Full prediction · Ho Chi Minh City
```

### Vietnam-wide demo

Use this as a quick second example:

```text
FROM: Da Nang
TO:   Hoi An
```

Expected message:

```text
Coverage: Partial prediction · Da Nang
```

or lower-confidence rain-only warning depending on route coverage.

## 5. Filming sequence

### Shot 1 — Hook, 0:00–0:20

Show map/globe quickly.

Say:

> In Vietnam, a motorbike route that looks normal now can become risky after heavy rain, tide pressure, or poor drainage. FloodWatch helps riders know which route is still passable before they enter the flood.

### Shot 2 — Route input, 0:20–0:45

Open Routes.

Type:

```text
Huynh Tan Phat, District 7
Vo Van Ngan, Thu Duc
```

Say:

> The rider enters origin and destination just like a normal map app.

### Shot 3 — Route options, 0:45–1:15

Show route cards.

Click fastest, then recommended.

Say:

> FloodWatch compares multiple routes. The fastest route is not always the safest. Our recommended route is selected based on flood risk and motorbike passability.

### Shot 4 — Segment evidence, 1:15–1:50

Click a route segment on the map.

Show popup evidence.

Say:

> Each route is split into segments. Every segment has a risk score and evidence: rainfall, tide pressure, hotspot history, drainage proxy, and rider reports.

### Shot 5 — Recommendation, 1:50–2:10

Show RouteResults panel.

Say:

> Instead of showing raw data only, FloodWatch gives an action: safe, pass slowly, avoid for motorbikes, or delay.

### Shot 6 — Coverage tier, 2:10–2:30

Show coverage badge.

Say:

> FloodWatch supports Vietnam-wide routing with confidence tiers. HCMC has the strongest full prediction layer, while other areas use partial or rainfall-first warnings until more local data is connected.

### Shot 7 — Closing, 2:30–2:50

Say:

> FloodWatch is a climate-resilient navigation layer for Vietnamese motorbike riders. It helps riders avoid flood risk before it reaches their route.

## 6. What to show visually

Must show:

```text
✅ Typed route input
✅ Route options cards
✅ Selected route on map
✅ Segment numbers
✅ Evidence popup
✅ Coverage badge
✅ Recommendation panel
```

Optional if time:

```text
✅ Layers panel
✅ Hotspot markers
✅ Rider report upload
✅ Draggable floating panel
```

## 7. What not to say

Do not say:

```text
❌ All data is official and real-time.
❌ FloodWatch fully predicts floods everywhere in Vietnam.
❌ We measure exact water depth.
❌ Tide/drainage data is official nationwide.
```

Say this instead:

```text
✅ FloodWatch uses real routing and real rainfall forecast data.
✅ Flood risk and passability are model-estimated from multiple signals.
✅ HCMC has the strongest evidence layer in the MVP.
✅ Other regions use lower-confidence rainfall-first warnings until more local data is connected.
```

## 8. Backup plan if something breaks

### If geocoding fails

Use coordinates:

```text
FROM: 10.7376, 106.7245
TO:   10.8506, 106.7714
```

### If the route API fails

Restart backend:

```bash
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
cd ~/floodwatch/api
/usr/bin/python3 -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### If frontend looks stale

Hard refresh:

```text
Cmd + Shift + R
```

Or restart:

```bash
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
cd ~/floodwatch/web
npm run dev
```

## 9. Friend roles during filming

### Ethan

- Run backend/frontend.
- Click through the demo.
- Fix issues if route/geocode breaks.

### Kim

- Record voiceover and final pitch.
- Keep the message simple and judge-friendly.

### Kalent

- Verify globe intro and frontend visuals.
- Help capture clean UI shots.

### Muthuraman

- Explain data/evidence layer if asked.
- Prepare hotspot/drainage credibility notes.

## 10. Final video checklist

Before submitting, confirm:

```text
✅ Video is 2–3 minutes.
✅ Audio is clear.
✅ App UI is readable.
✅ Route result appears on screen.
✅ The evidence popup is visible.
✅ No false claim about official nationwide data.
✅ Closing line explains FloodWatch in one sentence.
```
