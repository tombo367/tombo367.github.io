// Activity heatmap: draws every Strava track with low opacity so frequently
// visited routes glow brighter. Data built by tools/build_heatmap.py.
(function () {
  const SPORTS = {
    Rowing: { label: "Rowing", color: "#3ec6ff" },
    Run: { label: "Running", color: "#ff6a3d" },
    Ride: { label: "Cycling", color: "#ffd23f" },
    Ski: { label: "Skiing", color: "#c18cff" },
    Walk: { label: "Walking & hiking", color: "#5ee37a" },
    Swim: { label: "Swimming", color: "#ff5fae" },
  };

  const placesEl = document.querySelector("#places");
  const sportsEl = document.querySelector("#sports");
  const summaryEl = document.querySelector("#map-summary");

  const map = L.map("map", {
    preferCanvas: true,
    maxZoom: 16,
    zoomSnap: 0.25,
    worldCopyJump: true,
  }).setView([52.2, 0.12], 12);

  const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/";
  L.tileLayer(ESRI + "World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 16,
    attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
  }).addTo(map);
  L.tileLayer(ESRI + "World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 16,
    pane: "shadowPane",
    opacity: 0.6,
  }).addTo(map);

  const renderer = L.canvas({ padding: 0.5 });

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
      pts.push([lat / 1e5, lon / 1e5]);
    }
    return pts;
  }

  function weightForZoom(z) {
    return z >= 15 ? 3 : z >= 12 ? 2.2 : 1.6;
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

  fetch("assets/data/heatmap.json")
    .then((r) => r.json())
    .then((data) => {
      const groups = {};
      const lines = [];
      for (const t of data.tracks) {
        const sport = SPORTS[t.s] ? t.s : null;
        if (!sport) continue;
        groups[sport] = groups[sport] || L.layerGroup().addTo(map);
        const line = L.polyline(t.p.map(decode), {
          renderer,
          color: SPORTS[sport].color,
          weight: weightForZoom(map.getZoom()),
          opacity: 0.35,
          interactive: false,
          lineCap: "round",
          lineJoin: "round",
        });
        line.addTo(groups[sport]);
        lines.push(line);
      }

      map.on("zoomend", () => {
        const w = weightForZoom(map.getZoom());
        lines.forEach((l) => l.setStyle({ weight: w }));
      });

      // Sport toggles
      const active = new Set(Object.keys(groups));
      Object.keys(SPORTS)
        .filter((s) => data.sports[s])
        .forEach((s) => {
          chip(
            sportsEl,
            `<span class="swatch" style="--c:${SPORTS[s].color}"></span>${SPORTS[s].label} <span class="count">${data.sports[s]}</span>`,
            true,
            (btn) => {
              const on = !active.has(s);
              on ? active.add(s) : active.delete(s);
              on ? groups[s].addTo(map) : map.removeLayer(groups[s]);
              btn.setAttribute("aria-pressed", String(on));
            }
          );
        });

      // Place picker
      const placeButtons = [];
      const selectPlace = (btn, bounds) => {
        placeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        map.flyToBounds(bounds, { padding: [24, 24], duration: 0.9, maxZoom: 13.5 });
      };
      const allBounds = L.latLngBounds(data.places.flatMap((p) => p.bounds));
      placeButtons.push(
        chip(placesEl, `Everywhere <span class="count">${data.tracks.length}</span>`, false, (b) =>
          selectPlace(b, allBounds)
        )
      );
      data.places.forEach((p, i) => {
        const btn = chip(placesEl, `${p.name} <span class="count">${p.count}</span>`, i === 0, (b) =>
          selectPlace(b, p.bounds)
        );
        placeButtons.push(btn);
      });
      if (data.places.length) {
        map.fitBounds(data.places[0].bounds, { padding: [24, 24], maxZoom: 13.5 });
      }

      summaryEl.textContent = `${data.tracks.length} activities across ${data.places.length} places.`;
    })
    .catch(() => {
      summaryEl.textContent = "Couldn't load activity data.";
    });
})();
