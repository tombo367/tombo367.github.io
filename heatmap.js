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
        { id: "space", type: "background", paint: { "background-color": "#0e1114" } },
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
  const mapReady = new Promise((resolve) => map.on("load", resolve));

  Promise.all([dataReady, mapReady])
    .then(([data]) => {
      const tracks = {
        type: "FeatureCollection",
        features: data.tracks
          .filter((t) => SPORTS[t.s])
          .map((t) => ({
            type: "Feature",
            properties: { sport: t.s },
            geometry: { type: "MultiLineString", coordinates: t.p.map(decode) },
          })),
      };
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
        // Soft glow underneath, crisp line on top.
        map.addLayer({
          id: `glow-${s}`,
          type: "line",
          source: "tracks",
          filter,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": SPORTS[s].color,
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 2, 10, 5, 15, 10],
            "line-blur": ["interpolate", ["linear"], ["zoom"], 4, 2, 15, 8],
            "line-opacity": 0.08,
          },
        });
        map.addLayer({
          id: `line-${s}`,
          type: "line",
          source: "tracks",
          filter,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": SPORTS[s].color,
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.8, 10, 1.6, 15, 3],
            "line-opacity": 0.35,
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
          "text-halo-color": "#0e1114",
          "text-halo-width": 1.4,
        },
      });

      // Sport toggles
      sportIds.forEach((s) => {
        let on = true;
        chip(
          sportsEl,
          `<span class="swatch" style="--c:${SPORTS[s].color}"></span>${SPORTS[s].label} <span class="count">${data.sports[s]}</span>`,
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
          duration: reduceMotion ? 0 : 3500,
          essential: true,
        });
      };
      placeButtons.push(
        chip(placesEl, `Globe <span class="count">${data.tracks.length}</span>`, true, (b) => {
          press(b);
          map.flyTo({ ...GLOBE_VIEW, center: map.getCenter(), pitch: 0, bearing: 0, duration: reduceMotion ? 0 : 2500 });
        })
      );
      data.places.forEach((p, i) => {
        placeButtons.push(chip(placesEl, `${p.name} <span class="count">${p.count}</span>`, false, () => goToPlace(i)));
      });

      map.on("click", "place-dots", (e) => goToPlace(e.features[0].properties.i));
      map.on("mouseenter", "place-dots", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "place-dots", () => { map.getCanvas().style.cursor = ""; });

      summaryEl.textContent = `${data.tracks.length} activities across ${data.places.length} places. Drag to spin, scroll to zoom, right-drag to tilt.`;
      // Deep links: activities.html#cambridge, #mont-blanc, ...
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
      summaryEl.textContent = "Couldn't load activity data.";
    });
})();
