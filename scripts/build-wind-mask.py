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
# Gold and cream pixels in the top silhouette identify strands. Keep the
# forehead, ears and the face-side hairline behind a padded, fixed boundary.
hair_zone = polygon([(.20, 0), (.76, 0), (.79, .079), (.65, .107),
                     (.60, .066), (.43, .057), (.37, .105), (.24, .082)])
gold = smooth(.015, .14, red - blue) * smooth(.37, .68, red)
hair = hair_zone * (.48 + .52 * gold) * (1 - smooth(.012, .077, edge_distance))
hair *= 1 - smooth(.065, .115, y)

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
weights = gaussian_filter(np.maximum(hair, robe) * solid, sigma=(5, 3))
weights *= ~maximum_filter(protected, size=(67, 61))
Image.fromarray(np.uint8(np.clip(weights, 0, 1) * 255)).save(assets / "draco-wind-weights.png", optimize=True)
