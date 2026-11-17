// Activity heatmap on a spinnable globe (MapLibre GL). Every Strava track is
// drawn semi-transparent so frequently visited routes glow brighter.
// Data built by tools/build_heatmap.py.
(function () {
  const SPORTS = {
    Rowing: { label: "Rowing", color: "#3ec6ff" },
    Run: { label: "Running", color: "#ff6a3d" },
    Ride: { label: "Cycling", color: "#ffd23f" },
    Ski: { label: "Skiing", color: "#c18cff" },
    Walk: { label: "Walking & hiking", color: "#5ee37a" },
    Swim: { label: "Swimming", color: "#ff5fae" },
  };
  const GLOBE_VIEW = { center: [8, 30], zoom: 1.4 };
  const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const placesEl = document.querySelector("#places");
  const sportsEl = document.querySelector("#sports");
  const summaryEl = document.querySelector("#map-summary");

  function decode(str) {
    const pts = [];
    let i = 0, lat = 0, lon = 0;
    while (i < str.length) {
      for (const which of [0, 1]) {
        let shift = 0, result = 0, b;
        do {
          b = str.charCodeAt(i++) - 63;
          result |= (b & 0x1f) << shift;
          shift += 5;
        } while (b >= 0x20);
        const d = result & 1 ? ~(result >> 1) : result >> 1;
        if (which === 0) lat += d; else lon += d;
      }
      pts.push([lon / 1e5, lat / 1e5]);
    }
    return pts;
  }

  // ---- Track density -------------------------------------------------------
  // Tracks are bucketed into ~25 m grid cells. Every stretch of every track
  // gets a "heat": how many different activities passed within a cell or so
  // of it. Busy routes are then drawn wider and brighter, so tracks that run
  // close together merge into one glowing band.
  const M_PER_DEG = 111320;
  const CELL = 25; // metres
  const STEP = 15; // resample spacing, metres

  // Adds points every STEP metres; original vertices are flagged so the
  // straight-line filler can be dropped again before drawing.
  function densify(pts) {
    for (const p of pts) p.o = true;
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const k = Math.cos((y0 * Math.PI) / 180);
      const d = Math.hypot((x1 - x0) * k, y1 - y0) * M_PER_DEG;
      const n = Math.floor(d / STEP);
      for (let j = 1; j <= n; j++) {
        const f = j / (n + 1);
        out.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]);
      }
      out.push(pts[i]);
    }
    return out;
  }

  // Cell index: rows of fixed height, each row with its own longitude scale.
  const rowOf = (lat) => Math.floor((lat * M_PER_DEG) / CELL);
  const rowScale = new Map();
  const colOf = (lon, row) => {
    let k = rowScale.get(row);
    if (k === undefined) {
      k = (M_PER_DEG * Math.cos((((row + 0.5) * CELL) / M_PER_DEG) * (Math.PI / 180))) / CELL;
      rowScale.set(row, k);
    }
    return Math.floor(lon * k);
  };
  // Two-level grid (row -> col -> value) keeps keys as small integers.
  const grid = () => new Map();
  const gget = (g, r, c) => { const m = g.get(r); return m && m.get(c); };
  const gset = (g, r, c, v) => { let m = g.get(r); if (!m) g.set(r, (m = new Map())); m.set(c, v); };

  function buildHeat(parts, nActivities) {
    const cells = grid();
    for (const { id, pts } of parts) {
      let lr = NaN, lc = NaN;
      for (const [lon, lat] of pts) {
        const r = rowOf(lat), c = colOf(lon, r);
        if (r === lr && c === lc) continue;
        lr = r; lc = c;
        let ids = gget(cells, r, c);
        if (!ids) gset(cells, r, c, (ids = []));
        if (!ids.includes(id)) ids.push(id);
      }
    }

    const stamp = new Int32Array(nActivities).fill(-1);
    const cache = grid();
    let q = 0;
    function count(lon, lat) {
      const r = rowOf(lat), c0 = colOf(lon, r);
      const hit = gget(cache, r, c0);
      if (hit !== undefined) return hit;
      q++;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        const c = colOf(lon, r + dr);
        for (let dc = -1; dc <= 1; dc++) {
          const ids = gget(cells, r + dr, c + dc);
          if (!ids) continue;
          for (const id of ids) {
            if (stamp[id] !== q) { stamp[id] = q; n++; }
          }
        }
      }
      gset(cache, r, c0, n);
      return n;
    }

    // Heat per point in half-steps of log2(count), smoothed with a running
    // median (via a sliding histogram) so a single crossing street doesn't
    // leave a bright blip.
    const features = [];
    const W = 7; // ±~100 m
    const BINS = 24;
    const hist = new Int32Array(BINS);
    for (const { sport, pts } of parts) {
      const raw = pts.map(([lon, lat]) =>
        Math.min(BINS - 1, Math.round(Math.log2(Math.max(1, count(lon, lat))) * 2))
      );
      hist.fill(0);
      let lo = 0, hi = -1, size = 0;
      const h = new Array(pts.length);
      for (let i = 0; i < pts.length; i++) {
        const want = Math.min(pts.length - 1, i + W);
        while (hi < want) { hist[raw[++hi]]++; size++; }
        while (lo < i - W) { hist[raw[lo++]]--; size--; }
        let acc = 0, b = 0;
        while ((acc += hist[b]) <= size >> 1) b++;
        h[i] = b / 2;
      }
      // Split into runs of constant heat; neighbouring runs share a vertex.
      let start = 0;
      for (let i = 1; i <= pts.length; i++) {
        if (i === pts.length || h[i] !== h[start]) {
          const end = Math.min(i, pts.length - 1);
          if (end > start) {
            features.push({
              type: "Feature",
              properties: { sport, h: h[start] },
              geometry: {
                type: "LineString",
                coordinates: pts.slice(start, end + 1).filter((p, j, a) => p.o || j === 0 || j === a.length - 1),
              },
            });
          }
          start = i;
        }
      }
    }
    return { type: "FeatureCollection", features };
  }

  function chip(parent, html, pressed, onClick) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.innerHTML = html;
    btn.setAttribute("aria-pressed", String(pressed));
    btn.addEventListener("click", () => onClick(btn));
    li.appendChild(btn);
    parent.appendChild(li);
    return btn;
  }

  const map = new maplibregl.Map({
    container: "map",
    center: GLOBE_VIEW.center,
    zoom: GLOBE_VIEW.zoom,
    maxZoom: 16,
    attributionControl: { compact: true },
    style: {
      version: 8,
      projection: { type: "globe" },
      sky: {
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0],
      },
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        base: {
          type: "raster",
          tiles: [ESRI + "World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          maxzoom: 16,
          attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
        },
        labels: {
          type: "raster",
          tiles: [ESRI + "World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          maxzoom: 16,
        },
      },
      layers: [
        { id: "space", type: "background", paint: { "background-color": "#0b1520" } },
        {
          id: "base",
          type: "raster",
          source: "base",
          paint: { "raster-brightness-max": ["interpolate", ["linear"], ["zoom"], 2, 1, 6, 0.5], "raster-contrast": 0.1 },
        },
      ],
    },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
  map.addControl(new maplibregl.FullscreenControl(), "top-left");

  // Slow spin while zoomed out, until the visitor interacts.
  let spinning = !reduceMotion;
  function spin() {
    if (!spinning || map.getZoom() > 3 || map.isMoving()) return;
    const c = map.getCenter();
    map.easeTo({ center: [c.lng - 6, c.lat], duration: 1000, easing: (t) => t });
  }
  map.on("moveend", spin);
  ["mousedown", "touchstart", "wheel", "dragstart"].forEach((ev) =>
    map.on(ev, () => { spinning = false; })
  );

  const dataReady = fetch("assets/data/heatmap.json").then((r) => r.json());
  // Draw tracks as soon as the style is ready, without waiting for every basemap tile.
  const mapReady = new Promise((resolve) => (map.isStyleLoaded() ? resolve() : map.once("style.load", resolve)));

  Promise.all([dataReady, mapReady])
    .then(([data]) => {
      const parts = [];
      data.tracks.forEach((t, id) => {
        if (!SPORTS[t.s]) return;
        for (const enc of t.p) {
          const pts = decode(enc);
          if (pts.length > 1) parts.push({ id, sport: t.s, pts: densify(pts) });
        }
      });
      // Heat is counted within each sport, so a run along the towpath isn't
      // lit up by all the rowing on the river next to it.
      const tracks = { type: "FeatureCollection", features: [] };
      for (const sp of Object.keys(SPORTS)) {
        const mine = parts.filter((p) => p.sport === sp);
        if (mine.length) tracks.features.push(...buildHeat(mine, data.tracks.length).features);
      }
      const places = {
        type: "FeatureCollection",
        features: data.places.map((p, i) => ({
          type: "Feature",
          properties: { i, name: p.name, count: p.count },
          geometry: {
            type: "Point",
            coordinates: [(p.bounds[0][1] + p.bounds[1][1]) / 2, (p.bounds[0][0] + p.bounds[1][0]) / 2],
          },
        })),
      };
      map.addSource("tracks", { type: "geojson", data: tracks });
      map.addSource("places", { type: "geojson", data: places });

      const sportIds = Object.keys(SPORTS).filter((s) => data.sports[s]);
      for (const s of sportIds) {
        const filter = ["==", ["get", "sport"], s];
        const h = ["get", "h"]; // log2 of how many activities passed here
        // Wide soft glow that grows with traffic, so neighbouring tracks
        // blend into one band. All glows go under all crisp lines.
        map.addLayer({
          id: `glow-${s}`,
          type: "line",
          source: "tracks",
          filter,
          layout: { "line-cap": "round", "line-join": "round", "line-sort-key": h },
          paint: {
            "line-color": SPORTS[s].color,
            "line-width": [
              "interpolate", ["linear"], ["zoom"],
              4, ["+", 2, ["*", 0.8, h]],
              10, ["+", 4, ["*", 2, h]],
              15, ["+", 8, ["*", 4, h]],
            ],
            "line-blur": ["interpolate", ["linear"], ["zoom"], 4, ["+", 2, h], 15, ["+", 6, ["*", 2.5, h]]],
            "line-opacity": ["min", 0.45, ["+", 0.05, ["*", 0.05, h]]],
          },
        });
      }
      for (const s of sportIds) {
        const filter = ["==", ["get", "sport"], s];
        const h = ["get", "h"];
        // Crisp core that widens and brightens towards white on busy routes.
        map.addLayer({
          id: `line-${s}`,
          type: "line",
          source: "tracks",
          filter,
          layout: { "line-cap": "round", "line-join": "round", "line-sort-key": h },
          paint: {
            "line-color": ["interpolate", ["linear"], h, 0, SPORTS[s].color, 3, SPORTS[s].color, 9, "#ffffff"],
            "line-width": [
              "interpolate", ["linear"], ["zoom"],
              4, ["+", 0.6, ["*", 0.15, h]],
              10, ["+", 1, ["*", 0.4, h]],
              15, ["+", 1.5, ["*", 0.9, h]],
            ],
            "line-opacity": ["min", 0.95, ["+", 0.35, ["*", 0.1, h]]],
          },
        });
      }

      map.addLayer({
        id: "labels",
        type: "raster",
        source: "labels",
        paint: { "raster-opacity": 0.6 },
      });

      // Place dots, visible when zoomed out on the globe.
      const fade = (a) => ["interpolate", ["linear"], ["zoom"], 5, a, 7, 0];
      map.addLayer({
        id: "place-dots",
        type: "circle",
        source: "places",
        maxzoom: 7,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "count"]], 1, 5, 17, 15],
          "circle-color": "#ffb347",
          "circle-opacity": fade(0.35),
          "circle-blur": 0.2,
          "circle-stroke-color": "#ffd9a0",
          "circle-stroke-width": 1.5,
          "circle-stroke-opacity": fade(0.95),
        },
      });
      map.addLayer({
        id: "place-names",
        type: "symbol",
        source: "places",
        maxzoom: 7,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Semibold"],
          "text-size": 12,
          "text-offset": [0, 1.3],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#0b1520",
          "text-halo-width": 1.4,
        },
      });

      // Sport toggles
      sportIds.forEach((s) => {
        let on = true;
        chip(
          sportsEl,
          `<span class="swatch" style="--c:${SPORTS[s].color}"></span>${SPORTS[s].label}`,
          true,
          (btn) => {
            on = !on;
            const v = on ? "visible" : "none";
            map.setLayoutProperty(`glow-${s}`, "visibility", v);
            map.setLayoutProperty(`line-${s}`, "visibility", v);
            btn.setAttribute("aria-pressed", String(on));
          }
        );
      });

      // Place picker
      const placeButtons = [];
      const press = (btn) => placeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      const goToPlace = (i) => {
        spinning = false;
        press(placeButtons[i + 1]);
        const [[s, w], [n, e]] = data.places[i].bounds;
        map.fitBounds([[w, s], [e, n]], {
          padding: 30,
          maxZoom: 13.5,
          duration: reduceMotion ? 0 : 2000,
          essential: true,
        });
      };
      placeButtons.push(
        chip(placesEl, "Globe", true, (b) => {
          press(b);
          map.flyTo({ ...GLOBE_VIEW, center: map.getCenter(), pitch: 0, bearing: 0, duration: reduceMotion ? 0 : 2500 });
        })
      );
      data.places.forEach((p, i) => {
        placeButtons.push(chip(placesEl, p.name, false, () => goToPlace(i)));
      });

      map.on("click", "place-dots", (e) => goToPlace(e.features[0].properties.i));
      map.on("mouseenter", "place-dots", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "place-dots", () => { map.getCanvas().style.cursor = ""; });

      // Deep links: index.html#cambridge, #mont-blanc, ...
      const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const fromHash = () => {
        const i = data.places.findIndex((p) => slug(p.name) === location.hash.slice(1));
        if (i >= 0) goToPlace(i);
      };
      window.addEventListener("hashchange", fromHash);
      if (location.hash) fromHash();
      else spin();
    })
    .catch(() => {
      if (summaryEl) summaryEl.textContent = "Couldn't load activity data.";
    });
})();
