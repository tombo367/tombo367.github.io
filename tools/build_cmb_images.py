"""ACT CMB map images for clusters.html: the whole nemo quickstart patch at 150 GHz, plus 30 arcmin
cutouts of ACT-CL J2327.4-0204 at 98 and 150 GHz and in the matched-filtered S/N map.

Run with the nemo environment:
  .../cluster_confirmation/nemo/.venv-nemo/bin/python tools/build_cmb_images.py
"""
import json
from pathlib import Path

import numpy as np
import astropy.units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.nddata import Cutout2D
from astropy.table import Table
from astropy.wcs import WCS
from matplotlib import colormaps
from PIL import Image
from scipy.ndimage import gaussian_filter, zoom

RUN = Path("/Users/tomborrett/documents/Cambridge/PhD/PhD_2/cluster_confirmation/nemo/nemo-quickstart-maps")
SITE = Path(__file__).resolve().parents[1]
IMG = SITE / "assets/images/cmb"
NAME = "ACT-CL J2327.4-0204"
PIX = 0.5  # arcmin
WIDE_LIM, CUT_SIZE, UP = 250.0, 30, 4


def load(path):
    with fits.open(path) as h:
        return np.squeeze(h[0].data).astype(float), WCS(h[0].header).celestial


def save(img, lim, path, cmap="RdBu_r", lo=None):
    lo = -lim if lo is None else lo
    rgb = colormaps[cmap](np.clip((img - lo) / (lim - lo), 0, 1))[..., :3]
    im = Image.fromarray((rgb[::-1] * 255).astype(np.uint8))  # FITS row 0 is the bottom
    im.save(path, quality=85, optimize=True) if path.suffix == ".jpg" else im.save(path, optimize=True)


def main():
    IMG.mkdir(parents=True, exist_ok=True)
    f150, wcs = load(RUN / "maps/f150_1_10_8_map.fits")
    ny, nx = f150.shape
    sm = lambda a, arcmin: gaussian_filter(a, arcmin / PIX / 2.355)
    save(sm(f150, 2.0), WIDE_LIM, IMG / "act_f150_wide.jpg")

    cat = Table.read(RUN / "quickstart-clusters/quickstart-clusters_optimalCatalog.fits")
    cat.sort("fixed_SNR", reverse=True)
    x, y = wcs.world_to_pixel(SkyCoord(cat["RADeg"], cat["decDeg"], unit="deg"))
    clusters = [{"name": str(c["name"]), "x": round(float(px) / nx, 5), "y": round(1 - float(py) / ny, 5),
                 "snr": round(float(c["fixed_SNR"]), 1)} for c, px, py in zip(cat, x, y)]
    row = cat[cat["name"] == NAME][0]
    centre = SkyCoord(row["RADeg"], row["decDeg"], unit="deg")

    cut = lambda a, w: Cutout2D(a, centre, CUT_SIZE * u.arcmin, wcs=w).data
    up = lambda a: zoom(a, UP, order=3)
    f090, w090 = load(RUN / "maps/f090_1_10_8_map.fits")
    snr, wsnr = load(RUN / "quickstart-clusters/filteredMaps/stitched_Arnaud_M2e14_z0p4_SNMap.fits")
    c090, c150 = cut(sm(f090, 1.0), w090), cut(sm(f150, 1.0), wcs)
    lim = 330.0
    save(up(c090), lim, IMG / "j2327_f090.png")
    save(up(c150), lim, IMG / "j2327_f150.png")
    cs = cut(snr, wsnr)
    save(up(cs), float(np.nanmax(cs)), IMG / "j2327_snr.png", cmap="magma", lo=0)

    n = c150.shape[0] // 2
    meta = {
        "wide": {"nx": nx, "ny": ny, "pix_arcmin": PIX, "ra": [round(float(v), 3) for v in wcs.pixel_to_world_values([0, nx - 1], [0, 0])[0]],
                 "dec": [round(float(v), 3) for v in wcs.pixel_to_world_values([0, 0], [0, ny - 1])[1]], "lim": WIDE_LIM},
        "cut": {"name": NAME, "size_arcmin": CUT_SIZE, "lim": lim, "snr_max": round(float(np.nanmax(cs)), 1),
                "dT_090": round(float(c090[n - 1:n + 2, n - 1:n + 2].min()), 0),
                "dT_150": round(float(c150[n - 1:n + 2, n - 1:n + 2].min()), 0)},
        "clusters": clusters,
    }
    json.dump(meta, open(SITE / "assets/data/projects/cmb.json", "w"), separators=(",", ":"))
    print(meta["wide"], meta["cut"], len(clusters))


if __name__ == "__main__":
    main()
