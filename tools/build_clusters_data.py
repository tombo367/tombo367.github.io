import json, sys
import numpy as np
from pathlib import Path
from astropy.table import Table
from scipy.interpolate import BSpline

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

gal = Table.read(CC / "data/galaxies.fits")
keep = np.isin(gal["cluster_id"].astype(str), SHOW)
gal = gal[keep]
show = {}
for cid in SHOW:
    row = clusters[clusters["cluster_id"] == cid][0]
    g = gal[gal["cluster_id"].astype(str) == cid]
    th = float(row["theta500_deg"])
    inside = g[g["separation_deg"] < th]
    bkg = g[(g["separation_deg"] > 1.5 * th) & (g["separation_deg"] < 0.5)]
    area_ratio = th ** 2 / (0.5 ** 2 - (1.5 * th) ** 2)
    rng = np.random.default_rng(1)
    nb = int(round(len(bkg) * area_ratio))
    bkg = bkg[rng.choice(len(bkg), nb, replace=False)]
    def pack(t):
        cols = [t["mag_z"]] + [t[c] for c in COLOURS] + [t["err_" + c] for c in COLOURS] + [t["separation_deg"] / th]
        arr = np.vstack([np.asarray(c, float) for c in cols]).T
        arr = arr[np.isfinite(arr[:, 0]) & (arr[:, 0] < 23.5)]
        return [r(a, 3) for a in arr]
    show[cid] = {"z_spec": round(float(row["z_spec_cluster"]), 4), "theta500_arcmin": round(th * 60, 2),
                 "inside": pack(inside), "field": pack(bkg)}
    print(cid, len(show[cid]["inside"]), len(show[cid]["field"]))

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
