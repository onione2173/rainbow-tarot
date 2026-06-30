"""
타로 카드 이미지 최적화 스크립트
- 최대 크기: 600x900px (2:3 비율)
- PNG → 최적화 PNG 저장
"""

from pathlib import Path
from PIL import Image

IMG_DIR = Path(__file__).parent.parent / "assets" / "images"
MAX_W, MAX_H = 600, 900

def optimize(path):
    original_size = path.stat().st_size

    # 300KB 미만은 이미 충분히 작음 — 건너뜀
    if original_size < 300 * 1024:
        print(f"  건너뜀 (이미 작음): {path.name} {original_size//1024}KB")
        return

    import tempfile, shutil
    with Image.open(path) as img:
        w, h = img.size
        if w > MAX_W or h > MAX_H:
            img.thumbnail((MAX_W, MAX_H), Image.LANCZOS)

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        img.save(tmp_path, "PNG", optimize=True)

    new_size = tmp_path.stat().st_size
    if new_size < original_size:
        shutil.move(tmp_path, path)
        print(f"  압축됨: {path.name} {original_size//1024}KB → {new_size//1024}KB ({new_size/original_size*100:.0f}%)")
    else:
        tmp_path.unlink()
        print(f"  유지 (압축 불필요): {path.name} {original_size//1024}KB")

def main():
    pngs = sorted(IMG_DIR.glob("*.png"))
    print(f"총 {len(pngs)}장 최적화 시작\n")
    for p in pngs:
        optimize(p)
    print("\n완료!")

if __name__ == "__main__":
    main()
