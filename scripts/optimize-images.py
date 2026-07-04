"""
타로 카드 이미지 최적화 스크립트
- assets/images/ 의 PNG/JPG를 WebP로 변환 (카드 최대 600x900, 배너 최대 1200px)
- 변환 후 원본 삭제, 코드 참조는 .webp 확장자 사용
- 새 이미지를 추가하면 반드시 이 스크립트를 돌린 뒤 커밋할 것
  (PNG를 그대로 커밋하면 장당 300~800KB라 모바일 로딩이 느려짐)
"""

from pathlib import Path
from PIL import Image

IMG_DIR = Path(__file__).parent.parent / "assets" / "images"
CARD_MAX = (600, 900)
BANNER_MAX = (1200, 1200)
QUALITY = 80

def convert(path):
    original = path.stat().st_size
    with Image.open(path) as img:
        # 가로가 세로보다 길면 배너로 취급
        limit = BANNER_MAX if img.width > img.height else CARD_MAX
        img.thumbnail(limit, Image.LANCZOS)
        out = path.with_suffix(".webp")
        img.save(out, "WEBP", quality=QUALITY, method=6)
    new = out.stat().st_size
    path.unlink()
    print(f"  {path.name} {original//1024}KB → {out.name} {new//1024}KB ({new/original*100:.0f}%)")

def main():
    targets = sorted(list(IMG_DIR.glob("*.png")) + list(IMG_DIR.glob("*.jpg")))
    if not targets:
        print("변환할 PNG/JPG 없음 — 모두 WebP 상태")
        return
    print(f"총 {len(targets)}장 WebP 변환 시작\n")
    for p in targets:
        convert(p)
    print("\n완료! 코드에서 해당 이미지 참조도 .webp인지 확인하세요.")

if __name__ == "__main__":
    main()
