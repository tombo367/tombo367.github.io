"""Build assets/data/heatmap.json from a Strava bulk export.

Usage:
    python tools/build_heatmap.py /path/to/strava_data

Needs `fitdecode` (pip install fitdecode) for .fit/.fit.gz files.

Privacy: the first and last TRIM_M metres of every track are dropped so
start/finish points (e.g. home) are not published.
"""
import csv
import gzip
import json
import math
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

import fitdecode

TRIM_M = 400          # metres removed from each end of every track
SIMPLIFY_M = 6        # Douglas-Peucker tolerance in metres
CLUSTER_KM = 30       # activities starting within this distance share a place
MIN_PER_PLACE = 3     # minimum activities for a place to get its own view

SPORT_MAP = {
    "Rowing": "Rowing",
    "Run": "Run",
    "Ride": "Ride",
    "Alpine Ski": "Ski",
    "Walk": "Walk",
    "Hike": "Walk",
    "Swim": "Swim",
}

# Human names for clusters: (lat, lon, name), matched to the nearest centroid.
PLACE_NAMES = [
    (52.21, 0.14, "Cambridge"),
    (51.45, -0.08, "London"),
    (46.53, 11.86, "Dolomites"),
    (-13.31, -72.56, "Inca Trail, Peru"),
    (52.43, 13.17, "Berlin"),
    (47.31, 13.23, "Salzburger Land"),
    (48.85, 2.35, "Paris"),
    (54.40, -1.62, "North Yorkshire"),
    (51.55, -0.89, "Henley-on-Thames"),
    (45.90, 7.01, "Mont Blanc"),
    (46.18, 6.73, "Morzine"),
]


def place_name(centre):
    best = min(PLACE_NAMES, key=lambda p: hav(centre, p[:2]), default=None)
    if best and hav(centre, best[:2]) < CLUSTER_KM * 1000:
        return best[2]
    return f"{centre[0]:.2f}, {centre[1]:.2f}"


def hav(a, b):
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    d = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(d))


def open_maybe_gz(path):
    return gzip.open(path, "rb") if path.suffix == ".gz" else open(path, "rb")


def read_gpx(path):
    with open_maybe_gz(path) as f:
        root = ET.parse(f).getroot()
    pts = []
    for el in root.iter():
        if el.tag.endswith("trkpt"):
            pts.append((float(el.get("lat")), float(el.get("lon"))))
    return pts


def read_fit(path):
    pts = []
    with open_maybe_gz(path) as f:
        with fitdecode.FitReader(f) as fit:
            for frame in fit:
                if isinstance(frame, fitdecode.FitDataMessage) and frame.name == "record":
                    if frame.has_field("position_lat") and frame.has_field("position_long"):
                        la, lo = frame.get_value("position_lat"), frame.get_value("position_long")
                        if la is not None and lo is not None:
                            pts.append((la * 180 / 2**31, lo * 180 / 2**31))
    return pts


def trim(pts, metres):
    if len(pts) < 2:
        return []
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + hav(a, b))
    total = cum[-1]
    if total < 2 * metres + 200:
        return []
    return [p for p, c in zip(pts, cum) if metres <= c <= total - metres]


def split_gaps(pts, max_gap=500):
    """Split where consecutive points jump (GPS dropouts, lifts, paused)."""
    segs, cur = [], []
    for p in pts:
        if cur and hav(cur[-1], p) > max_gap:
            segs.append(cur)
            cur = []
        cur.append(p)
    segs.append(cur)
    return [s for s in segs if len(s) > 1]


def simplify(pts, tol):
    if len(pts) < 3:
        return pts
    lat0 = math.radians(pts[0][0])
    xy = [(p[1] * 111320 * math.cos(lat0), p[0] * 110540) for p in pts]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        (x1, y1), (x2, y2) = xy[i], xy[j]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy) or 1e-9
        best, idx = 0.0, -1
        for k in range(i + 1, j):
            x, y = xy[k]
            d = abs(dy * (x - x1) - dx * (y - y1)) / norm
            if d > best:
                best, idx = d, k
        if best > tol and idx > 0:
            keep[idx] = True
            stack += [(i, idx), (idx, j)]
    return [p for p, k in zip(pts, keep) if k]


def encode_polyline(pts, precision=5):
    out, plat, plon = [], 0, 0
    f = 10 ** precision
    for lat, lon in pts:
        ilat, ilon = round(lat * f), round(lon * f)
        for v in (ilat - plat, ilon - plon):
            v = ~(v << 1) if v < 0 else v << 1
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1F)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        plat, plon = ilat, ilon
    return "".join(out)


def main(data_dir):
    data_dir = Path(data_dir)
    rows = list(csv.DictReader(open(data_dir / "activities.csv", encoding="utf-8")))
    acts = []
    for r in rows:
        sport = SPORT_MAP.get(r["Activity Type"])
        fn = r.get("Filename") or ""
        if not sport or not fn:
            continue
        path = data_dir / fn
        if not path.exists():
            continue
        try:
            pts = read_fit(path) if ".fit" in path.name else read_gpx(path)
        except Exception as e:  # noqa: BLE001
            print(f"skip {path.name}: {e}", file=sys.stderr)
            continue
        pts = [p for p in pts if abs(p[0]) > 1e-6 or abs(p[1]) > 1e-6]
        if len(pts) < 10:
            continue
        start = pts[0]
        segs = [simplify(s, SIMPLIFY_M) for s in split_gaps(trim(pts, TRIM_M))]
        segs = [s for s in segs if len(s) > 1]
        if not segs:
            continue
        acts.append({"sport": sport, "start": start, "segs": segs, "year": r["Activity Date"][-20:-16].strip()})

    # Greedy clustering on start points.
    clusters = []
    for a in acts:
        for c in clusters:
            if hav(c["centre"], a["start"]) < CLUSTER_KM * 1000:
                c["acts"].append(a)
                n = len(c["acts"])
                c["centre"] = tuple((c["centre"][i] * (n - 1) + a["start"][i]) / n for i in range(2))
                break
        else:
            clusters.append({"centre": a["start"], "acts": [a]})

    places = []
    for c in sorted(clusters, key=lambda c: -len(c["acts"])):
        if len(c["acts"]) < MIN_PER_PLACE:
            continue
        lats = [p[0] for a in c["acts"] for s in a["segs"] for p in s]
        lons = [p[1] for a in c["acts"] for s in a["segs"] for p in s]
        # robust bounds: 1st-99th percentile so one long outing doesn't zoom out the view
        lats.sort(); lons.sort()
        q = lambda v, f: v[min(len(v) - 1, int(f * len(v)))]
        name = place_name(c["centre"])
        places.append({
            "name": name,
            "count": len(c["acts"]),
            "sports": dict(Counter(a["sport"] for a in c["acts"])),
            "bounds": [[q(lats, .01), q(lons, .01)], [q(lats, .99), q(lons, .99)]],
        })

    out = {
        "sports": dict(Counter(a["sport"] for a in acts)),
        "places": places,
        "tracks": [{"s": a["sport"], "p": [encode_polyline(s) for s in a["segs"]]} for a in acts],
    }
    dest = Path(__file__).resolve().parent.parent / "assets" / "data" / "heatmap.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, separators=(",", ":")))
    print(f"{len(acts)} activities, {len(places)} places -> {dest} ({dest.stat().st_size/1e3:.0f} kB)")
    for p in places:
        print(" ", p["name"], p["count"], p["sports"])


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "../export_49541598")
