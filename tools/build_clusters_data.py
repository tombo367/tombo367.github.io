import json, sys
import numpy as np
from pathlib import Path
from astropy.table import Table
from scipy.interpolate import BSpline
import cluster_confirmation as cc  # run with cluster_confirmation/.venv

CC = Path("/Users/tomborrett/documents/Cambridge/PhD/PhD_2/cluster_confirmation")
OUT = Path(sys.argv[1])
MODELS = CC / "bayesian_cc/src/bayesian_cc/models"
COLOURS = ["g-r", "r-z", "z-w1"]
SHOW = ["ACT-CL J2248.8-4431", "ACT-CL J0102.9-4916", "ACT-CL J2327.4-0204", "ACT-CL J0239.8-0134", "ACT-CL J1137.7-0313"]
r = lambda a, n=3: [None if not np.isfinite(v) else round(float(v), n) for v in np.atleast_1d(a)]

zg = np.round(np.arange(0.05, 1.0501, 0.01), 3)
rs = {}
for c in COLOURS:
    rs[c] = {}
    for p in ("a", "b", "sig"):
        with np.load(MODELS / f"rs_model_{p}_{c}.npz") as d:
            rs[c][p] = r(BSpline(d["t"], d["c"], int(d["k"]), extrapolate=False)(zg), 4)
with np.load(MODELS / "mstar_fsps.npz") as m:
    mstar = r(np.interp(zg, m["redshift"], m["z"]), 3)

clusters = Table.read(CC / "data/mcmf_reduced_clusters.fits")
rc = np.load(CC / "poster_plots/richness_curves_with_errors.npz")
peaks = np.load(CC / "data/richness_curves.npz")
idx = {cid: i for i, cid in enumerate(rc["cluster_id"])}
bay = Table.read(CC / "data/results/bayesian_cc/dynesty/summary.ecsv")
bay = {str(b["cluster_id"]): b for b in bay}
summary = []
for row in clusters:
    cid = str(row["cluster_id"])
    i = idx[cid]
    summary.append({"id": cid, "z_spec": round(float(row["z_spec_cluster"]), 4), "z_mcmf": round(float(row["z1C"]), 4),
                    "z_peak": round(float(peaks["z_peak"][i]), 4), "snr": round(float(row["SNR"]), 1),
                    "m500": round(float(row["M500"]) / 1e14, 2), "theta500": round(float(row["theta500_deg"]) * 60, 2),
                    "sample": str(bay[cid]["sample"]), "z_cl": r([bay[cid][k] for k in ("z_cl_16", "z_cl_50", "z_cl_84")], 4),
                    "lam": r(rc["richness"][i], 1), "lam_err": r(rc["richness_err"][i], 1)})


# lambda(z) for the cluster and for an equal patch of empty sky, with the same estimator as
# cc.RichnessCalculator.curve_with_error. Masking and depth come from the cluster catalogue
# columns instead of the randoms, so the cluster curve is checked against the pipeline below.
class SplineRS:
    """The custom red-sequence model of scripts/recovery/run_mcmf_template_peaks.py."""
    def __init__(self, colour):
        d = {n: np.load(CC / f"packages/cluster_confirmation/models/rs_model_custom/rs_model_{n}_{colour}.npz") for n in "a b sig k".split()}
        self.s = {n: BSpline(v["t"], v["c"], int(v["k"])) for n, v in d.items()}
        self.lo, self.hi = d["a"]["z_bins"][0], d["a"]["z_bins"][-1]
        self.da = self.s["a"].derivative()
    def predict(self, z, dm):
        z = np.asarray(z, float); zc = np.clip(z, self.lo, self.hi)
        return self.s["a"](zc) + self.da(zc) * (z - zc) + self.s["b"](zc) * np.asarray(dm, float)
    def sigma(self, z, dm=0.0):
        zc = np.clip(z, self.lo, self.hi)
        return self.s["sig"](zc) * np.exp(self.s["k"](zc) * np.asarray(dm, float))
RSM = {c: SplineRS(c) for c in COLOURS}
colour_models = {c: {"z": RSM[c]} for c in COLOURS}
sigma_models = {c: {"z": RSM[c].sigma} for c in COLOURS}
calc = cc.RichnessCalculator.__new__(cc.RichnessCalculator)
calc.colour_models, calc.sigma_models, calc.colours, calc.reference_band = colour_models, sigma_models, COLOURS, "z"
with np.load(MODELS / "mstar_fsps.npz") as m:
    mstar_of = lambda z, _m=dict(m): np.interp(z, _m["redshift"], _m["z"])
DM_BRIGHT, DM_FAINT, MAX_BKG = -3.0, 2.0, 0.5

def lam_curve(z, g, sep, in_disc, bkg, bkg_area, theta500, row):
    """lambda(z), error: radially weighted red-sequence galaxies with sep <= theta500(z) among in_disc,
    minus the background from the galaxies in bkg (total area bkg_area deg^2)."""
    mag = np.asarray(g["mag_z"], float)[None, :]
    gal = {"mag_ref": mag[0]}
    for c in COLOURS:
        gal[c], gal[f"err_{c}"] = np.asarray(g[c], float), np.asarray(g[f"err_{c}"], float)
    mstar = mstar_of(z)[:, None]
    in_colour, w = calc.colour_weights(z, gal, mag - mstar)
    ok = (mag <= mstar + DM_FAINT) & (mag >= mstar + DM_BRIGHT) & in_colour
    clus = ok & in_disc[None, :] & (sep[None, :] <= theta500[:, None])
    n = cc.radial_weights(z, sep, theta500)
    rich = np.sum(np.where(clus, w * n, 0.0), axis=1)
    sum_bkg = np.sum(np.where(ok & bkg[None, :], w, 0.0), axis=1)
    f_in, f_bkg = float(row["frac_unmasked_in"]), float(row["frac_unmasked_bkg"])
    scale = f_in * theta500 ** 2 / (f_bkg * bkg_area)
    c_cmp = cc.completeness_correction(mstar[:, 0], float(row["galdepth_z_in"]), DM_BRIGHT, DM_FAINT)
    return c_cmp / f_in * (rich - scale * sum_bkg), c_cmp / f_in * np.sqrt(rich + scale ** 2 * sum_bkg)

gal = Table.read(CC / "data/galaxies.fits")
keep = np.isin(gal["cluster_id"].astype(str), SHOW)
gal = gal[keep]
show = {}
for cid in SHOW:
    row = clusters[clusters["cluster_id"] == cid][0]
    g = gal[gal["cluster_id"].astype(str) == cid]
    th = float(row["theta500_deg"])
    inside = g[g["separation_deg"] < th]
    zl = np.asarray(rc["z"], float)
    th_z = cc.M500c_to_theta500(float(row["M500"]), zl)
    sep = np.asarray(g["separation_deg"], float)

    # Pipeline lambda(z) for the cluster, recomputed here as a check on lam_curve.
    lam_cl, _ = lam_curve(zl, g, sep, sep >= 0, (sep[None, :] > th_z[:, None]).any(0) & (sep < MAX_BKG),
                          MAX_BKG ** 2 - th_z ** 2, th_z, row)

    # Empty sky: a random subsample of the outer annulus, with the same area as a disc of radius
    # R = max theta500(z), placed in that disc at random. The rest of the annulus is its background.
    ann = (sep > 1.5 * th) & (sep < MAX_BKG)
    R = float(th_z.max())
    ann_area = MAX_BKG ** 2 - (1.5 * th) ** 2
    rng = np.random.default_rng(1)
    ia = np.flatnonzero(ann)
    patch = rng.choice(ia, int(round(len(ia) * R ** 2 / ann_area)), replace=False)
    fsep = sep.copy()
    fsep[patch] = R * np.sqrt(rng.random(len(patch)))
    in_patch = np.zeros(len(g), bool); in_patch[patch] = True
    rest = ann & ~in_patch
    lam_f, err_f = lam_curve(zl, g, fsep, in_patch, rest, ann_area - R ** 2, th_z, row)
    bkg = g[in_patch & (fsep < th)]
    def pack(t):
        cols = [t["mag_z"]] + [t[c] for c in COLOURS] + [t["err_" + c] for c in COLOURS] + [t["separation_deg"] / th]
        arr = np.vstack([np.asarray(c, float) for c in cols]).T
        arr = arr[np.isfinite(arr[:, 0]) & (arr[:, 0] < 23.5)]
        return [r(a, 3) for a in arr]
    show[cid] = {"z_spec": round(float(row["z_spec_cluster"]), 4), "theta500_arcmin": round(th * 60, 2),
                 "inside": pack(inside), "field": pack(bkg), "field_lam": r(lam_f, 1), "field_lam_err": r(err_f, 1)}
    pipe = np.asarray(rc["richness"][idx[cid]], float)
    print(cid, len(show[cid]["inside"]), len(show[cid]["field"]),
          f"| lam check: max |recomputed - pipeline| = {np.nanmax(np.abs(lam_cl - pipe)):.1f} of peak {np.nanmax(pipe):.0f}",
          f"| field lam range {np.nanmin(lam_f):.1f}..{np.nanmax(lam_f):.1f}")

d = np.load(CC / "data/results/bayesian_cc/n_clusters_no_f_red_rstemp/ACT-CL_J1137.7-0313_n2.npz")
names = list(d["param_names"])
edges = np.linspace(0.2, 0.56, 181)
double = {"edges": r(edges, 3)}
for k in ("z_1", "z_2"):
    h, _ = np.histogram(d["chain"][:, names.index(k)], edges)
    double[k] = r(h / h.max(), 3)
d1 = np.load(CC / "data/results/bayesian_cc/n_clusters_no_f_red_rstemp/ACT-CL_J1137.7-0313_n1.npz")
h, _ = np.histogram(d1["chain"][:, list(d1["param_names"]).index("z_1")], edges)
double["n1"] = r(h / h.max(), 3)
double["log_z"] = [round(float(np.load(CC / f"data/results/bayesian_cc/n_clusters_no_f_red_rstemp/ACT-CL_J1137.7-0313_n{n}.npz")["log_z"]), 1) for n in range(3)]

row = clusters[clusters["cluster_id"] == "ACT-CL J1137.7-0313"][0]
double["z_spec"] = round(float(row["z_spec_cluster"]), 4)
double["z_mcmf"] = [round(float(row["z1C"]), 4), round(float(row["z2C"]), 4)]
json.dump({"z": r(zg, 3), "lam_z": r(rc["z"], 3), "rs": rs, "mstar_z": mstar, "summary": summary, "show": show, "double": double},
          open(OUT, "w"), separators=(",", ":"))
print(OUT.stat().st_size / 1e3, "kB")
