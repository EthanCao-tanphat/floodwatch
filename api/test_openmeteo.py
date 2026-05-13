"""Quick smoke test. Run this FIRST to verify Open-Meteo returns data for HCMC.

    python test_openmeteo.py

If this prints rainfall numbers, your data layer works and you can build.
If it errors, the network or Open-Meteo is the problem — not your code.
"""
import asyncio
from services.openmeteo import fetch_rainfall, rainfall_in_window


async def main():
    # Vo Van Ngan, Thu Duc — a known flood hotspot
    lat, lng = 10.8506, 106.7714
    print(f"Fetching rainfall forecast for ({lat}, {lng}) — Vo Van Ngan, Thu Duc...")
    data = await fetch_rainfall(lat, lng)

    minutely = data.get("minutely_15", {})
    times = minutely.get("time", [])[:8]
    precip = minutely.get("precipitation", [])[:8]
    print(f"\nNext 2 hours, 15-min buckets:")
    for t, p in zip(times, precip):
        print(f"  {t}   rainfall: {p}mm")

    print(f"\nRainfall in next 30 min: {rainfall_in_window(data, 0):.2f}mm")
    print(f"Rainfall in 30-60 min window: {rainfall_in_window(data, 30):.2f}mm")
    print(f"Rainfall in 60-90 min window: {rainfall_in_window(data, 60):.2f}mm")

    print("\n✅ Data layer works. You can start the API.")


if __name__ == "__main__":
    asyncio.run(main())
