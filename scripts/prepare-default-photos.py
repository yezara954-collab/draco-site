"""用 Pillow 处理 6 张相册默认照片。位置参数按 default_01 到 default_06 排序。"""
import argparse
from pathlib import Path
from PIL import Image, ImageOps

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("photos", nargs=6, type=Path)
args = parser.parse_args()
output = Path(__file__).resolve().parents[1] / "src/assets/photos"
output.mkdir(parents=True, exist_ok=True)
for index, path in enumerate(args.photos, 1):
    with Image.open(path) as original:
        oriented = ImageOps.exif_transpose(original).convert("RGB")
        cropped = ImageOps.fit(oriented, (768, 768), Image.Resampling.LANCZOS, centering=(0.5, 0.5))
        # 新建像素容器，输出不携带 EXIF、GPS、XMP 或源文件色彩配置。
        clean = Image.new("RGB", cropped.size)
        clean.paste(cropped)
        clean.save(output / f"default_{index:02}.jpg", quality=82, format="JPEG", optimize=True)
