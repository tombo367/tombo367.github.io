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
s = np.load(EDE / "toy_model/output/samples.npy")
edges = np.linspace(0, 0.3, 61)
h, _ = np.histogram(s[:, 2], edges, density=True)
toy = {"data": r(m.data.numpy(), 4), "profile": [{k: round(v, 4) for k, v in p.items()} for p in prof],
       "post_edges": r(edges, 3), "post_f": r(h, 3)}

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
json.dump({"toy": toy, "runs": runs, "profile_class": prof_class, "emu_dchi2": emu}, open(OUT, "w"), separators=(",", ":"))
print(len(runs), len(prof_class), len(emu), OUT.stat().st_size / 1e3, "kB")
print(prof_class); print(emu)
