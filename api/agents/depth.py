"""Depth-classifier agent — Qwen-VL classifies a rider's photo into
{dry, ankle, knee, impassable}. This is the hero AI feature for the demo:
"snap a photo, AI tells you how deep, map updates for everyone in seconds."
"""
from models import DepthReportResponse
from services.dashscope import call_qwen_vl, parse_json_response


DEPTH_PROMPT = """You are a flood depth classifier. Look at this photo of a Vietnamese street
and classify the flood depth into exactly ONE of these categories:

- "dry": no standing water, road is clear
- "ankle": shallow water, up to ankle height (~10cm). Motorbikes can pass slowly.
- "knee": water up to knee height (~30-50cm). Risky for motorbikes — small bikes will stall.
- "impassable": water above knee, or visible strong current. Do not attempt.

Use visual cues: water reflection, wheel/tire submergence on visible vehicles,
people wading, water reaching shop fronts, etc.

Respond ONLY with valid JSON, no markdown:
{
  "depth_class": "dry" | "ankle" | "knee" | "impassable",
  "confidence": 0.0-1.0,
  "reasoning": "1-2 sentence explanation in English"
}"""


async def classify_depth(image_base64: str, lat: float, lng: float) -> DepthReportResponse:
    raw = call_qwen_vl(DEPTH_PROMPT, image_base64)
    parsed = parse_json_response(raw)
    return DepthReportResponse(
        depth_class=parsed["depth_class"],
        confidence=float(parsed.get("confidence", 0.7)),
        reasoning=parsed.get("reasoning", ""),
        lat=lat,
        lng=lng,
    )
