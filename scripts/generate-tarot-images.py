"""
펫타로 카드 이미지 자동 생성 스크립트
사용법:
  pip install google-genai pillow
  export GEMINI_API_KEY=your_key_here
  python scripts/generate-tarot-images.py
"""

import os
import time
import base64
from pathlib import Path

try:
    from google import genai
    from google.genai import types
except ImportError:
    print("패키지 설치 필요: pip install google-genai pillow")
    exit(1)

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("GEMINI_API_KEY 환경변수를 설정해주세요.")
    exit(1)

OUTPUT_DIR = Path(__file__).parent.parent / "assets" / "images" / "pet-tarot"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

STYLE = (
    "cute chibi kawaii illustration, soft watercolor style, "
    "pastel purple and warm gold color palette, "
    "portrait orientation taller than wide like a tarot card, "
    "magical whimsical cozy atmosphere, white decorative border frame, "
    "fine line art, dreamy studio ghibli inspired aesthetic"
)

MAJOR_ARCANA = [
    {
        "id": "major-00-fool",
        "name": "바보 (The Fool)",
        "prompt": "A tiny fluffy puppy with a small bindle stick over its shoulder, one paw lifted and about to step off a sunny cliff edge, looking up at a butterfly with sparkling curious eyes, cherry blossom petals floating around, carefree and joyful expression, bright open sky background",
    },
    {
        "id": "major-01-magician",
        "name": "마법사 (The Magician)",
        "prompt": "A clever tabby cat wearing a tiny magician hat and cape, one paw pointing up toward glowing stars, one paw pointing down to a table with a bone wand, a food bowl cup, a fish sword, and a paw print coin, magical sparks and candle flames surrounding, confident pose",
    },
    {
        "id": "major-02-high-priestess",
        "name": "여사제 (The High Priestess)",
        "prompt": "A serene white cat sitting between two moon-decorated pillars, wearing a delicate floral crown and flowing blue veil, a crescent moon resting at her paws, holding a tiny scroll, eyes half-closed in deep knowing wisdom, mysterious soft purple moonlit atmosphere",
    },
    {
        "id": "major-03-empress",
        "name": "여황제 (The Empress)",
        "prompt": "A plump warm golden retriever mother resting in a lush flower garden, three tiny puppies snuggled into her soft fur, wearing a crown of roses and daisies, surrounded by ripe fruits and blooming flowers, golden sunlight filtering through trees, abundant nurturing mood",
    },
    {
        "id": "major-04-emperor",
        "name": "황제 (The Emperor)",
        "prompt": "A dignified Shiba Inu sitting upright on a throne decorated with tiny paw prints and stars, wearing a small golden crown and a regal red robe, rocky mountain landscape behind, steady confident expression, strong and protective energy",
    },
    {
        "id": "major-05-hierophant",
        "name": "교황 (The Hierophant)",
        "prompt": "A wise elderly cat in flowing ceremonial robes sitting on an ornate chair, two small kittens sitting below receiving a gentle paw blessing, ancient stone temple with ivy, glowing lanterns hanging, warm candlelight atmosphere, sacred and gentle mood",
    },
    {
        "id": "major-06-lovers",
        "name": "연인 (The Lovers)",
        "prompt": "An orange tabby cat and a gray cat sitting face to face under a glowing rainbow arch, touching noses gently, heart bubbles floating between them, a tiny angel bunny hovering above with wings spreading golden light, soft flower meadow setting, pure affection",
    },
    {
        "id": "major-07-chariot",
        "name": "전차 (The Chariot)",
        "prompt": "An energetic corgi confidently riding a tiny decorated chariot, pulled by one white hamster and one black hamster, racing forward with determination, motion sparkle trails behind, starry banner waving, triumphant and unstoppable expression",
    },
    {
        "id": "major-08-strength",
        "name": "힘 (Strength)",
        "prompt": "A small delicate kitten gently pressing one soft paw onto the nose of a large fluffy Saint Bernard dog, the big dog looking completely calm and adored, surrounded by blooming wildflowers, warm golden afternoon light, tender and peaceful energy",
    },
    {
        "id": "major-09-hermit",
        "name": "은둔자 (The Hermit)",
        "prompt": "A lone old cat wrapped in a cozy knitted scarf standing on a snowy hilltop, holding a glowing paper lantern, tiny paw prints trailing behind in the snow, vast starry night sky above, solitary but peaceful and quietly wise expression",
    },
    {
        "id": "major-10-wheel",
        "name": "운명의 수레바퀴 (Wheel of Fortune)",
        "prompt": "A large ornate spinning wheel in the sky decorated with stars and crescent moons, a chubby cat sitting regally on top, four different pets at each corner — a dog, cat, rabbit, and hamster — each holding a tiny card, cosmic swirling purple clouds, fate and wonder",
    },
    {
        "id": "major-11-justice",
        "name": "정의 (Justice)",
        "prompt": "A serious Persian cat wearing a tiny white judge wig, seated at a little bench, holding golden scales with a small fish on one side and a glowing heart on the other, eyes sharp and fair, pillars of soft blue and gold on either side, calm courtroom atmosphere",
    },
    {
        "id": "major-12-hanged-man",
        "name": "매달린 사람 (The Hanged Man)",
        "prompt": "A fluffy bunny hanging upside down from a cherry blossom branch by one foot, looking completely relaxed and blissful, eyes closed in peaceful contemplation, flowers drifting down around it, soft dappled spring light, serene and still atmosphere",
    },
    {
        "id": "major-13-death",
        "name": "변화 (Death)",
        "prompt": "An adorably cute kawaii skeleton cat riding a tiny white pony, white roses falling around, a golden sun rising warmly on the horizon, a rainbow emerging from clouds, small animals watching with hopeful eyes, transformation and gentle new beginnings",
    },
    {
        "id": "major-14-temperance",
        "name": "절제 (Temperance)",
        "prompt": "A soft white bunny with tiny feathered wings standing peacefully in a flower garden, pouring sparkling water between two golden cups in perfect balance, one foot on land and one in a still pond, iris flowers blooming, a gentle rainbow arc above, harmonious healing mood",
    },
    {
        "id": "major-15-devil",
        "name": "해방 (The Devil)",
        "prompt": "A cheeky black cat wearing tiny cute devil horns and a playful grin, two small pets sitting below with very loose chains made of yarn balls looking completely unbothered and happy, cozy warm light, mischievous but lighthearted energy, chains clearly easy to remove",
    },
    {
        "id": "major-16-tower",
        "name": "탑 (The Tower)",
        "prompt": "A tall cat scratching tower being toppled by a lightning bolt made of glowing yarn, three surprised cats leaping off in different directions but landing safely with wide cartoon eyes, stars and feather toys raining down, comic book style impact effects, chaotic but unhurt",
    },
    {
        "id": "major-17-star",
        "name": "별 (The Star)",
        "prompt": "A graceful white dog kneeling peacefully beside a moonlit pond, gently pouring water from two small pitchers, eight glowing stars reflected in the water, a gentle breeze moving through wildflowers, vast calm starry night sky, deeply hopeful and healing atmosphere",
    },
    {
        "id": "major-18-moon",
        "name": "달 (The Moon)",
        "prompt": "A black cat and a white cat sitting side by side howling softly at a huge glowing full moon, a tiny crayfish peeking from a still pond below, a winding mysterious path leading into a moonlit forest between two stone pillars, dream-like hazy indigo and silver tones",
    },
    {
        "id": "major-19-sun",
        "name": "태양 (The Sun)",
        "prompt": "An ecstatic golden retriever puppy dancing in the middle of a bright sunflower field, wearing a crown of sunflowers, a tiny baby chick riding on its back, a huge warm sun beaming overhead, pure radiating joy and boundless energy, vibrant warm colors",
    },
    {
        "id": "major-20-judgement",
        "name": "심판 (Judgement)",
        "prompt": "A small angel bunny floating above on soft glowing wings blowing a tiny golden trumpet, below three sleepy pets — a dog, cat, and rabbit — stretching awake from their baskets with surprised delighted expressions, golden light pouring down, joyful awakening and renewal",
    },
    {
        "id": "major-21-world",
        "name": "세계 (The World)",
        "prompt": "A joyful cat dancing gracefully in the center of a large floral wreath made of rainbow flowers, holding two small wands, four adorable pets sitting at each corner — a dog, rabbit, hamster, and bird — each gazing in with celebration, complete and radiant wholeness",
    },
]

def generate_image(client, card):
    output_path = OUTPUT_DIR / f"{card['id']}.png"

    if output_path.exists():
        print(f"  건너뜀 (이미 존재): {card['id']}.png")
        return True

    full_prompt = f"{card['prompt']}, {STYLE}"

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=full_prompt,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
            ),
        )

        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                output_path.write_bytes(part.inline_data.data)
                print(f"  저장됨: {card['id']}.png")
                return True

        print(f"  이미지 없음: {card['name']}")
        return False

    except Exception as e:
        print(f"  오류 ({card['name']}): {e}")
        return False


def main():
    client = genai.Client(api_key=API_KEY)

    cards = MAJOR_ARCANA
    total = len(cards)

    print(f"총 {total}장 생성 시작\n")

    success = 0
    for i, card in enumerate(cards, 1):
        print(f"[{i}/{total}] {card['name']}")
        ok = generate_image(client, card)
        if ok:
            success += 1
        if i < total:
            time.sleep(3)  # API 레이트 리밋 방지

    print(f"\n완료: {success}/{total}장 생성됨")
    print(f"저장 위치: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
