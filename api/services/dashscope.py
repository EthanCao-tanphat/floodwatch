"""Dashscope (Qwen) client. Reuses the Healix Singapore endpoint pattern.

CRITICAL: Use Singapore endpoint (dashscope-intl.aliyuncs.com), not the
China one — China endpoint returns 401 outside mainland.
"""
import json
import dashscope
from dashscope import MultiModalConversation, Generation
from config import DASHSCOPE_API_KEY, DASHSCOPE_BASE_URL

# Wire SDK to Singapore endpoint
dashscope.api_key = DASHSCOPE_API_KEY
dashscope.base_http_api_url = DASHSCOPE_BASE_URL


def call_qwen_vl(prompt: str, image_base64: str) -> str:
    """Call Qwen-VL on a base64 image + prompt. Returns raw model text."""
    response = MultiModalConversation.call(
        model="qwen-vl-max",
        messages=[
            {
                "role": "user",
                "content": [
                    {"image": f"data:image/jpeg;base64,{image_base64}"},
                    {"text": prompt},
                ],
            }
        ],
    )
    if response.status_code != 200:
        raise RuntimeError(f"Qwen-VL error: {response.code} - {response.message}")
    return response.output.choices[0].message.content[0]["text"]


def call_qwen_max(prompt: str) -> str:
    """Call Qwen-Max for reasoning tasks. Returns raw model text."""
    response = Generation.call(
        model="qwen-max",
        prompt=prompt,
        result_format="message",
    )
    if response.status_code != 200:
        raise RuntimeError(f"Qwen-Max error: {response.code} - {response.message}")
    return response.output.choices[0].message.content


def parse_json_response(text: str) -> dict:
    """Strip code fences and parse JSON. Uses strict=False (Healix lesson:
    Qwen sometimes returns trailing commas / unescaped newlines)."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        # Drop the first fence line and last fence line
        lines = cleaned.split("\n")
        cleaned = "\n".join(lines[1:-1]) if len(lines) > 2 else cleaned
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].lstrip()
    return json.loads(cleaned, strict=False)
