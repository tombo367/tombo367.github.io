import csv, json, sys
import numpy as np
from pathlib import Path
EDE = Path("/Users/tomborrett/documents/Cambridge/PhD/PhD_2/ede")
sys.path.insert(0, str(EDE / "toy_model"))
from model import ToyEDE, PRIOR
OUT = Path(sys.argv[1])
r = lambda a, n=4: [round(float(v), n) for v in np.atleast_1d(a)]

m = ToyEDE()
prof = json.load(open(EDE / "toy_model/output/profile.json"))["profile"]
toy = {"data": r(m.data.numpy(), 4), "profile": [{k: round(v, 4) for k, v in p.items()} for p in prof]}

runs = []
for row in csv.DictReader(open(EDE / "profiles/agent_progress/agent_runs.csv")):
    runs.append({"run": row["run"], "t": row["time"][5:16], "score": float(row["score"]), "status": row["status"],
                 "desc": row["description"]})

prof_class = []
for line in open(EDE / "scripts/boris_chi2_compare/fEDE.txt"):
    if line.startswith("#") or not line.strip():
        continue
    v = line.split()
    prof_class.append([round(float(v[0]), 4), round(float(v[1]), 3)])
emu = []
for row in csv.DictReader(open(EDE / "scripts/boris_chi2_compare/chi2_compare.csv")):
    if row["d_chi2_total"] and float(row["fEDE"]) > 0:
        emu.append([round(float(row["fEDE"]), 4), round(float(row["d_chi2_total"]), 3)])
# Emulator error along the profile: whitened RMS error e and measured chi2_emu - chi2_CLASS (ACT + Planck lite)
# at each profile point, as in ede-analyses/rmse_requirement/predicted_delta_chi2.py.
from scipy.linalg import block_diag, solve_triangular
RR = EDE / "data/ede_emulators/rmse_requirement"
bp = dict(np.load(RR / "bandpowers.npz"))
for name in ("scaling_bandpowers", "box_bandpowers"):
    bp.update(np.load(RR / f"{name}.npz"))
chol = np.linalg.cholesky(block_diag(bp["act_cov"], bp["planck_cov"]))
whiten = lambda x: solve_triangular(chol, x.T, lower=True).T
data = np.concatenate([bp["act_data"], bp["planck_data"]])
truth = np.hstack([bp["act_truth"], bp["planck_truth"]])
chi2_truth = np.sum(whiten(data - truth) ** 2, axis=1)
n_d = len(data)
fede = bp["fEDE"]
lam = [round(float(dict(prof_class)[min(dict(prof_class), key=lambda f: abs(f - v))]), 3) for v in fede]
emus = []
names = {"v2": "cp2", "v3": "ede-v3", "cp3": "cp3", "cp3twin": "cp3twin", "cp3twin1k": "cp3twin1k"}
for key in [k[4:] for k in bp if k.startswith("act_") and k[4:] not in ("data", "cov", "ell", "pol", "truth")]:
    t_emu = np.hstack([bp[f"act_{key}"], bp[f"planck_{key}"]])
    e = np.linalg.norm(whiten(t_emu - truth), axis=1) / np.sqrt(n_d)
    meas = np.sum(whiten(data - t_emu) ** 2, axis=1) - chi2_truth
    group = names.get(key) or ("box" if key.startswith("bx") else key[2:key.index("ks")] + "k")
    emus.append({"key": key, "group": group, "e": r(e, 6), "dchi2": r(meas, 3)})
rmse = {"fede": r(fede, 4), "lam": lam, "n_d": n_d, "emus": emus}

json.dump({"rmse": rmse, "toy": toy, "runs": runs, "profile_class": prof_class, "emu_dchi2": emu}, open(OUT, "w"), separators=(",", ":"))
print(len(runs), len(prof_class), len(emu), OUT.stat().st_size / 1e3, "kB")
print(prof_class); print(emu)
