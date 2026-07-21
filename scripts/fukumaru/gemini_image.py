"""
Generates a character-consistent illustration for a Fukumaru post via the
Gemini image model, using marketing/assets/fukumaru-reference.png as a
conditioning/reference image so every post visually reads as the same cat.

Model choice: "gemini-2.5-flash-image". This is the same model already used
successfully elsewhere in this repo (scripts/generate-tarot-images.py) via
the google-genai SDK's client.models.generate_content(..., contents=[...]),
so it's a proven-working pairing of SDK version + model name rather than a
guess. A newer "gemini-3.1-flash-image" ("nano banana 2", accessed via a
different client.interactions.create() API surface in some docs) exists, but
was left alone here in favor of the already-validated approach -- revisit if
image quality/consistency needs improve.

Scene hints are simple JP-keyword -> English scene description lookups
(deliberately not a second LLM call) so a post about rain gets a rainy-window
scene, a tsundere line gets an aloof pose, etc.

Any failure here should be caught by the caller (post_next.py), which falls
back to a text-only post -- this module does not swallow errors itself.
"""
import os

from google import genai
from google.genai import types
from PIL import Image

MODEL_NAME = "gemini-2.5-flash-image"

# (JP keywords, English scene hint) -- first matches win, up to 2 combined.
KEYWORD_SCENE_HINTS = [
    (["雨"], "a cozy scene with rain falling outside a window, soft grey-blue light"),
    (["星"], "a quiet starry night sky, gentle twinkling stars, hopeful mood"),
    (["太陽", "元気", "散歩"], "a bright sunny scene, warm golden light, cheerful energetic mood"),
    (["月"], "a moonlit night scene, mysterious soft blue-silver glow"),
    (["虹", "橋"], "a soft rainbow over a peaceful meadow, gentle warm light, tender atmosphere"),
    (["ツン", "そっけ", "ふん", "ガブ"], "the cat looking away with a chic, aloof expression"),
    (["デレ", "あったか", "膝", "甘え", "丸くなって"], "the cat curled up warmly and affectionately on a soft blanket"),
    (["窓", "鳥"], "the cat looking out a window, watching birds outside"),
    (["タロット", "カード"], "the cat with a single glowing tarot card on a small table"),
    (["ありがとう", "一週間", "フォロー"], "a warm, celebratory scene with soft sparkles, grateful mood"),
    (["夜", "眠", "寝", "おやすみ"], "a calm nighttime scene, warm dim lamp light, sleepy cozy mood"),
]

DEFAULT_SCENE_HINT = "a warm, gentle everyday moment, soft cozy indoor lighting"


def _scene_hint(post_text_jp: str) -> str:
    hints = []
    for keywords, hint in KEYWORD_SCENE_HINTS:
        if any(k in post_text_jp for k in keywords):
            hints.append(hint)
        if len(hints) >= 2:
            break
    return "; ".join(hints) if hints else DEFAULT_SCENE_HINT


def generate_image(post_text_jp: str, reference_image_path: str) -> bytes:
    """Generate a PNG image (bytes) consistent with the reference character,
    depicting a scene inferred from the JP post text. Raises on any failure
    (missing key, API error, no image in response) -- callers should catch
    and fall back to a text-only post rather than let this block posting."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set")

    client = genai.Client(api_key=api_key)
    reference_image = Image.open(reference_image_path)
    scene = _scene_hint(post_text_jp)

    prompt = (
        "Using the attached illustration as the exact character reference "
        "(a white cat wearing a black hooded mystic robe, tarot-reading "
        "persona), generate a NEW square illustration of the SAME character "
        "in the SAME art style, same robe, same proportions and color "
        f"palette, in a new scene: {scene}. Keep it recognizably the same "
        "character as the reference image. No text or watermarks."
    )

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=[reference_image, prompt],
        config=types.GenerateContentConfig(response_modalities=["IMAGE", "TEXT"]),
    )

    candidates = response.candidates or []
    if not candidates or not candidates[0].content or not candidates[0].content.parts:
        raise RuntimeError("Gemini response had no candidates/parts")

    for part in candidates[0].content.parts:
        if part.inline_data is not None:
            return part.inline_data.data

    raise RuntimeError("Gemini response contained no image data")
