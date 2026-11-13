"""Rebuild the Draco wind weights from the current transparent illustration."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, gaussian_filter, maximum_filter

assets = Path(__file__).resolve().parents[1] / "src" / "assets"
art = Image.open(assets / "draco.png").convert("RGBA")
width, height = art.size
red, green, blue, alpha = np.asarray(art, dtype=np.float32).transpose(2, 0, 1) / 255
x, y = np.meshgrid(np.linspace(0, 1, width), np.linspace(0, 1, height))


def polygon(points):
    image = Image.new("L", art.size)
    ImageDraw.Draw(image).polygon([(u * width, v * height) for u, v in points], fill=255)
    return np.asarray(image) > 0


def smooth(low, high, value):
    t = np.clip((value - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


solid = alpha > .35
edge_distance = distance_transform_edt(solid, sampling=(1 / height, 1 / width))
# Four loose ends traced from the annotated close-up in source-image pixels.
# The crown and the painted face are outside these patches.
tip_regions = [
    [(148, 100), (165, 96), (186, 99), (195, 115), (201, 140),
     (194, 153), (178, 149), (159, 132), (146, 115)],
    [(292, 100), (305, 98), (319, 107), (327, 119),
     (316, 124), (306, 120), (294, 115)],
    [(328, 94), (342, 92), (357, 98), (364, 111),
     (354, 121), (343, 119), (334, 108)],
    [(351, 73), (367, 69), (382, 82), (390, 99),
     (377, 113), (365, 110), (355, 99)],
]
tips = np.zeros((height, width))
for region in tip_regions:
    tips = np.maximum(tips, polygon([(px / width, py / height) for px, py in region]))
hair = gaussian_filter(tips, sigma=(3.4, 3.8))
# End the feathering before the eyebrow and ear. The low-weight cutoff also
# prevents a one-pixel blur tail from moving a neighbouring mesh cell.
fixed_face = ((x >= 203 / width) & (x < 330 / width) & (y >= 121 / height))
fixed_ear = (x >= 330 / width) & (y >= 120 / height)
hair[(y < 65 / height) | fixed_face | fixed_ear | (hair < .025)] = 0

# Separate the robe by its painted outline and darker fabric pigments.
robe_zone = polygon([(.35, .19), (.91, .16), (.99, .85), (.8, .886),
                     (.12, .89), (0, .84), (.13, .6), (.06, .45), (.26, .28)])
fabric = 1 - smooth(.49, .72, red) * smooth(.035, .19, red - blue)
outer_edge = 1 - smooth(.008, .18, edge_distance)
body_falloff = smooth(.08, .31, np.abs(x - (.47 + .07 * y)))
hem = smooth(.63, .88, y)
cuffs = smooth(.31, .51, y) * (1 - smooth(.53, .65, y)) * body_falloff
robe = robe_zone * fabric * np.maximum(hem * (.30 + .70 * outer_edge),
                                       (.12 * body_falloff * smooth(.29, .77, y) + .75 * cuffs)
                                       * outer_edge)

# Expand the protected region beyond a mesh cell. This pins every triangle
# that crosses a facial feature, the neck, the torso or either hand/wand grip.
protected = (
    polygon([(.38, .061), (.57, .069), (.64, .078), (.65, .151), (.60, .188),
             (.47, .222), (.37, .182), (.37, .103)])
    | polygon([(.41, .207), (.58, .205), (.64, .299), (.57, .42),
               (.52, .526), (.37, .51), (.35, .394)])
    | polygon([(.118, .48), (.205, .48), (.212, .555), (.158, .59), (.085, .583)])
    | polygon([(.47, .505), (.625, .503), (.60, .599), (.48, .597)])
    | polygon([(0, .72), (.086, .552), (.132, .565), (.037, .727)])
    | (y >= .889)
)
weights = gaussian_filter(robe * solid, sigma=(5, 3))
weights *= ~maximum_filter(protected, size=(67, 61))
weights = np.maximum(weights, hair)
Image.fromarray(np.uint8(np.clip(weights, 0, 1) * 255)).save(assets / "draco-wind-weights.png", optimize=True)
