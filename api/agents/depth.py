"""Photo report agent.

Qwen-VL verifies motorbike passability from a rider's photo. The old
``depth_class`` field is retained for UI compatibility, but the preferred
output is passability rather than exact water depth.
"""
from models import DepthReportResponse
from services.dashscope import call_qwen_vl, parse_json_response


DEPTH_PROMPT = """You verify whether a Vietnamese street is passable for motorbikes.
Do not estimate exact water depth. Classify the road into exactly ONE passability category:

- "safe": no standing water or clearly normal motorbike travel
- "slow_pass": shallow water or uncertain conditions; motorbikes may pass slowly
- "avoid_for_motorbikes": likely stall or safety risk for many motorbikes
- "impassable": do not attempt
- "unknown": image is too dark, ambiguous, or lacks useful road evidence

Use visual cues: water reflection, wheel/tire submergence on visible vehicles,
people wading, water reaching shop fronts, current, and whether similar motorbikes
are passing safely.

Respond ONLY with valid JSON, no markdown:
{
  "passability": "safe" | "slow_pass" | "avoid_for_motorbikes" | "impassable" | "unknown",
  "confidence": 0.0-1.0,
  "reasoning": "1-2 sentence explanation in English"
}"""


def _depth_from_passability(passability: str) -> str:
    return {
        "safe": "dry",
        "slow_pass": "ankle",
        "avoid_for_motorbikes": "knee",
        "impassable": "impassable",
        "unknown": "dry",
    }.get(passability, "dry")


def _passability_from_depth(depth_class: str) -> str:
    return {
        "dry": "safe",
        "ankle": "slow_pass",
        "knee": "avoid_for_motorbikes",
        "impassable": "impassable",
    }.get(depth_class, "unknown")


async def classify_depth(image_base64: str, lat: float, lng: float) -> DepthReportResponse:
    raw = call_qwen_vl(DEPTH_PROMPT, image_base64)
    parsed = parse_json_response(raw)
    passability = parsed.get("passability") or _passability_from_depth(parsed.get("depth_class", ""))

    return DepthReportResponse(
        depth_class=_depth_from_passability(passability),
        passability=passability,
        confidence=float(parsed.get("confidence", 0.7)),
        reasoning=parsed.get("reasoning", ""),
        lat=lat,
        lng=lng,
    )
