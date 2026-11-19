// Interactive figures for the galaxy clusters page. Data exported from the
// cluster_confirmation project (red-sequence models, richness curves,
// bayesian_cc results and Legacy Survey DR11 galaxies).
(async function () {
  const D = await fetch("assets/data/projects/clusters.json").then((r) => r.json());
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const C = {
    accent: Plot.css("--accent"), warm: Plot.css("--warm"), gold: Plot.css("--gold"),
    muted: Plot.css("--muted"), line: Plot.css("--line"), ink: Plot.css("--ink"),
  };
  const { el } = Plot;
  const byId = new Map(D.summary.map((s) => [s.id, s]));

  // ---- CMB map and the J2327 zoom (tools/build_cmb_images.py) ---------------
  const M = await fetch("assets/data/projects/cmb.json").then((r) => r.json());
  const cmbHost = document.querySelector("#cmb");
  const cmbTip = Plot.tip(cmbHost);
  const marksBtn = document.querySelector("#cmb-marks");
  let showMarks = false, marks = null;
  function drawCMB() {
    cmbHost.querySelectorAll("svg").forEach((x) => x.remove());
    const W = cmbHost.clientWidth || 600, wd = M.wide;
    const Hm = W * wd.ny / wd.nx, ppa = W / wd.nx / wd.pix_arcmin; // px per arcmin
    const gap = Math.max(8, W * 0.025), P = (W - 2 * gap) / 3;
    const top2 = Hm + 52, H = top2 + 18 + P + 2;
    const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    cmbHost.prepend(svg);
    el("image", { href: "assets/images/cmb/act_f150_wide.jpg", x: 0, y: 0, width: W, height: Hm, preserveAspectRatio: "none" }, svg);
    el("rect", { x: 0.5, y: 0.5, width: W - 1, height: Hm - 1, fill: "none", stroke: C.line }, svg);

    // Scale bar and colour bar under the map.
    const deg = 60 * ppa, yb = Hm + 14;
    el("line", { x1: 0, x2: deg, y1: yb, y2: yb, stroke: C.ink, "stroke-width": 2 }, svg);
    el("text", { x: deg + 6, y: yb + 4 }, svg).textContent = "1°";
    const gid = "cmbgrad" + Math.random().toString(36).slice(2);
    const grad = el("linearGradient", { id: gid }, el("defs", {}, svg));
    ["#053061", "#4393c3", "#f7f7f7", "#d6604d", "#67001f"].forEach((c, i) =>
      el("stop", { offset: i / 4, "stop-color": c }, grad));
    const cbw = Math.min(160, W * 0.3), cbx = W - cbw;
    el("rect", { x: cbx, y: yb - 5, width: cbw, height: 8, fill: `url(#${gid})` }, svg);
    el("text", { x: cbx - 6, y: yb + 3, "text-anchor": "end" }, svg).textContent = `−${wd.lim} μK`;
    el("text", { x: W, y: yb + 20, "text-anchor": "end" }, svg).textContent = `+${wd.lim} μK`;

    // Every nemo detection in the patch, hidden until asked for.
    const mk = el("g", { visibility: showMarks ? "visible" : "hidden" }, svg);
    const pts = M.clusters.map((c) => [c, W * c.x, Hm * c.y]);
    for (const [c, x, y] of pts) {
      el("circle", { cx: x, cy: y, r: Math.max(4, 2.2 * ppa), fill: "none", stroke: C.gold, "stroke-width": 1.2,
        "stroke-opacity": 0.9 }, mk);
    }
    marks = mk;

    // The J2327 box, and lines down to the cutouts.
    const j = pts.find(([c]) => c.name === M.cut.name);
    const half = (M.cut.size_arcmin / 2) * ppa, bx0 = j[1] - half, bx1 = j[1] + half, by1 = j[2] + half;
    el("rect", { x: bx0, y: j[2] - half, width: 2 * half, height: 2 * half, fill: "none", stroke: C.ink, "stroke-width": 1.5 }, svg);
    el("text", { x: bx1 + 6, y: j[2] - half + 10, fill: C.ink }, svg).textContent = "RCS2 J2327";
    for (const [x0, x1] of [[bx0, 0], [bx1, W]]) {
      el("line", { x1: x0, y1: by1, x2: x1, y2: top2 + 18, stroke: C.ink, "stroke-opacity": 0.3 }, svg);
    }
    const panels = [["j2327_f090.png", "98 GHz"], ["j2327_f150.png", "150 GHz"], ["j2327_snr.png", `matched filter (S/N ≤ ${M.cut.snr_max.toFixed(0)})`]];
    panels.forEach(([f, title], i) => {
      const x = i * (P + gap);
      el("text", { x: x + P / 2, y: top2 + 12, "text-anchor": "middle" }, svg).textContent = title;
      el("image", { href: `assets/images/cmb/${f}`, x, y: top2 + 18, width: P, height: P }, svg);
      el("rect", { x: x + 0.5, y: top2 + 18.5, width: P - 1, height: P - 1, fill: "none", stroke: C.line }, svg);
    });

    svg.addEventListener("pointermove", (ev) => {
      if (!showMarks) { cmbTip.hide(); return; }
      const [px, py] = Plot.pointer(svg, ev);
      let best = null, bd = 144;
      for (const p of pts) {
        const d = (p[1] - px) ** 2 + (p[2] - py) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      if (!best) { cmbTip.hide(); return; }
      cmbTip.show(`${best[0].name}<br><span class="dim">ACT S/N</span> ${best[0].snr.toFixed(1)}`, best[1], best[2]);
    });
    svg.addEventListener("pointerleave", () => cmbTip.hide());
  }
  marksBtn.addEventListener("click", () => {
    showMarks = !showMarks;
    marksBtn.setAttribute("aria-pressed", String(showMarks));
    marksBtn.textContent = showMarks ? `Hide the ${M.clusters.length} clusters` : "Mark every cluster ACT found here";
    if (marks) marks.setAttribute("visibility", showMarks ? "visible" : "hidden");
    if (!showMarks) cmbTip.hide();
  });
  Plot.onResize(cmbHost, drawCMB);

  // ---- Red-sequence model -------------------------------------------------
  const COLOURS = ["g-r", "r-z", "z-w1"];
  const LABEL = { "g-r": "g − r", "r-z": "r − z", "z-w1": "z − W1" };
  const YR = { "g-r": [0, 2.3], "r-z": [0, 2.5], "z-w1": [-0.8, 2.3] };
  const DM_BRIGHT = -3, DM_FAINT = 2, NSIG = 1;
  const interp = (grid, vals, z) => {
    const i = Math.max(0, Math.min(grid.length - 2, Math.floor((z - grid[0]) / (grid[1] - grid[0]))));
    const t = (z - grid[i]) / (grid[i + 1] - grid[i]);
    return vals[i] + t * (vals[i + 1] - vals[i]);
  };
  const rsAt = (c, z) => ({
    a: interp(D.z, D.rs[c].a, z), b: interp(D.z, D.rs[c].b, z), sig: interp(D.z, D.rs[c].sig, z),
    ms: interp(D.z, D.mstar_z, z),
  });
  const autoColour = (z) => (z < 0.35 ? "g-r" : z < 0.9 ? "r-z" : "z-w1");
  function isMember(g, c, rs) {
    const ci = COLOURS.indexOf(c);
    const m = g[0], col = g[1 + ci], err = g[4 + ci];
    if (col == null || m > rs.ms + DM_FAINT || m < rs.ms + DM_BRIGHT) return false;
    const s = Math.sqrt(rs.sig * rs.sig + (err || 0) ** 2);
    return Math.abs(col - (rs.a + rs.b * (m - rs.ms))) < NSIG * s;
  }

  // ---- Cluster picker -----------------------------------------------------
  const INFO = {
    "ACT-CL J2248.8-4431": { name: "Abell S1063", note: "The most massive cluster in this sample, and a famous gravitational lens." },
    "ACT-CL J0239.8-0134": { name: "Abell 370", note: "Home of the first giant gravitational arc ever identified." },
    "ACT-CL J2327.4-0204": { name: "RCS2 J2327", note: "A massive cluster seen when the Universe was about half its present age." },
    "ACT-CL J0102.9-4916": { name: "El Gordo", note: "“The fat one”: a violent collision of two clusters, remarkably massive for how early in cosmic history we see it." },
    "ACT-CL J1137.7-0313": { name: "J1137", note: "A smaller cluster with a surprise behind it. Keep scanning after the first peak." },
  };
  const IDS = Object.keys(D.show);
  const ORDER = ["ACT-CL J2248.8-4431", "ACT-CL J0239.8-0134", "ACT-CL J2327.4-0204", "ACT-CL J0102.9-4916", "ACT-CL J1137.7-0313"]
    .filter((id) => IDS.includes(id));
  const pick = document.querySelector("#cl-pick");
  const card = document.querySelector("#cl-card");
  const zIn = document.querySelector("#cl-z");
  const zOut = document.querySelector("#cl-z-out");
  const readout = document.querySelector("#cl-readout");
  const fieldBtn = document.querySelector("#cl-field");
  const revealBtn = document.querySelector("#cl-reveal");
  const colourHost = document.querySelector("#cl-colours");

  const st = { id: ORDER[0], z: 0.15, colour: "auto", field: false, visited: {}, revealed: {} };
  for (const id of ORDER) { st.visited[id] = new Set(); st.revealed[id] = false; }

  ORDER.forEach((id) => {
    const li = document.createElement("li");
    li.innerHTML = `<button type="button" class="chip" aria-pressed="false">${INFO[id].name}</button>`;
    li.firstChild.addEventListener("click", () => selectCluster(id));
    pick.appendChild(li);
  });
  ["auto", ...COLOURS].forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.style.marginRight = "0.9rem";
    b.dataset.c = c;
    b.textContent = c === "auto" ? "auto" : LABEL[c];
    b.addEventListener("click", () => { st.colour = c; drawCMD(); });
    colourHost.appendChild(b);
  });

  function renderCard() {
    const s = byId.get(st.id), info = INFO[st.id];
    const img = st.id === "ACT-CL J1137.7-0313" ? "" : `<img src="assets/images/clusters/${st.id.slice(7)}.jpg" alt="Legacy Survey image of ${info.name}" loading="lazy">`;
    const z = st.revealed[st.id]
      ? `spectroscopic z = <span style="color:var(--gold)">${s.z_spec.toFixed(3)}</span>`
      : "spectroscopic z = ?";
    card.innerHTML = `${img}<div><p>${info.note}</p><p class="meta">${st.id} · M<sub>500</sub> ≈ ${s.m500.toFixed(1)}×10<sup>14</sup> M<sub>☉</sub> · ACT S/N ${s.snr.toFixed(0)} · θ<sub>500</sub> = ${s.theta500.toFixed(1)}′ · ${z}</p></div>`;
    pick.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(ORDER[i] === st.id)));
  }

  function selectCluster(id) {
    st.id = id;
    st.field = false;
    fieldBtn.setAttribute("aria-pressed", "false");
    fieldBtn.textContent = "Show an empty patch of sky";
    setZ(0.15);
    renderCard();
    drawCMD();
    drawLam();
  }

  // ---- Colour–magnitude diagram -------------------------------------------
  const cmdHost = document.querySelector("#cmd");
  let cmd = null;
  function currentColour() { return st.colour === "auto" ? autoColour(st.z) : st.colour; }
  function drawCMD() {
    const c = currentColour();
    colourHost.querySelectorAll("button").forEach((b) => {
      const on = b.dataset.c === st.colour;
      b.setAttribute("aria-pressed", String(on));
      b.style.color = on ? C.ink : "";
      b.style.textDecoration = on ? "underline" : "";
      b.textContent = b.dataset.c === "auto" ? (st.colour === "auto" ? `auto (${LABEL[c]})` : "auto") : LABEL[b.dataset.c];
    });
    const F = Plot.frame(cmdHost, { height: 300, x: [16, 23.5], y: YR[c], xlabel: "z-band magnitude (brighter ←)", ylabel: LABEL[c] });
    const band = el("path", { fill: C.warm, "fill-opacity": 0.13, stroke: C.warm, "stroke-opacity": 0.5, "stroke-width": 1 }, F.g);
    const mid = el("path", { fill: "none", stroke: C.warm, "stroke-opacity": 0.6, "stroke-dasharray": "4 4" }, F.g);
    const mstar = el("line", { stroke: C.muted, "stroke-opacity": 0.6, "stroke-dasharray": "2 3" }, F.g);
    const mstarLabel = el("text", { "text-anchor": "middle" }, F.svg);
    mstarLabel.textContent = "m*";
    const gals = st.field ? D.show[st.id].field : D.show[st.id].inside;
    const ci = 1 + COLOURS.indexOf(c);
    const dots = [];
    const layer = el("g", {}, F.g);
    for (const g of gals) {
      if (g[ci] == null) { dots.push(null); continue; }
      dots.push(el("circle", { cx: F.x(g[0]).toFixed(1), cy: F.y(g[ci]).toFixed(1), r: 2 }, layer));
    }
    cmd = { F, band, mid, mstar, mstarLabel, dots, gals, c };
    updateCMD();
  }

  // Best excess significance over a scan in z with the automatic colour, for the "found it" cue.
  const peaks = {};
  function peakSignal(id) {
    if (peaks[id] == null) {
      let best = 0;
      for (let z = 0.1; z <= 1.05; z += 0.01) {
        const c = autoColour(z), rs = rsAt(c, z);
        const a = count(D.show[id].inside, c, rs), b = count(D.show[id].field, c, rs);
        best = Math.max(best, (a - b) / Math.sqrt(b + 4));
      }
      peaks[id] = best;
    }
    return peaks[id];
  }

  function count(gals, c, rs) {
    let n = 0;
    for (const g of gals) if (isMember(g, c, rs)) n++;
    return n;
  }

  function updateCMD() {
    if (!cmd) return;
    const c = currentColour();
    if (c !== cmd.c) { drawCMD(); return; }
    const { F, band, mid, mstar, mstarLabel, dots, gals } = cmd;
    const rs = rsAt(c, st.z);
    const m0 = rs.ms + DM_BRIGHT, m1 = rs.ms + DM_FAINT;
    const w = NSIG * Math.sqrt(rs.sig * rs.sig + 0.04 * 0.04);
    const col = (m) => rs.a + rs.b * (m - rs.ms);
    band.setAttribute("d", `M${F.x(m0)},${F.y(col(m0) + w)}L${F.x(m1)},${F.y(col(m1) + w)}L${F.x(m1)},${F.y(col(m1) - w)}L${F.x(m0)},${F.y(col(m0) - w)}Z`);
    mid.setAttribute("d", `M${F.x(m0)},${F.y(col(m0))}L${F.x(m1)},${F.y(col(m1))}`);
    mstar.setAttribute("x1", F.x(rs.ms)); mstar.setAttribute("x2", F.x(rs.ms));
    mstar.setAttribute("y1", F.y.lo); mstar.setAttribute("y2", F.y.hi);
    mstarLabel.setAttribute("x", F.x(rs.ms)); mstarLabel.setAttribute("y", F.y.lo + 13);
    const base = st.field ? C.muted : C.accent;
    gals.forEach((g, i) => {
      const d = dots[i];
      if (!d) return;
      const on = isMember(g, c, rs);
      d.setAttribute("fill", on ? C.warm : base);
      d.setAttribute("fill-opacity", on ? 0.95 : st.field ? 0.35 : 0.45);
      d.setAttribute("r", on ? 2.6 : 1.8);
    });
    const show = D.show[st.id];
    const nIn = count(show.inside, c, rs), nF = count(show.field, c, rs);
    const sig = (nIn - nF) / Math.sqrt(nF + 4);
    const strong = sig > 0.75 * peakSignal(st.id);
    readout.innerHTML = `<span class="${strong ? "hot" : ""}">${nIn}</span> galaxies in the band inside the cluster`
      + ` <span class="dim">vs</span> ${nF} <span class="dim">in an equal area of empty sky</span>`
      + (strong ? ` · <span class="hot">a red sequence!</span>` : "");
  }

  // ---- λ(z) panel ---------------------------------------------------------
  const lamHost = document.querySelector("#lam");
  let lam = null;
  function drawLam() {
    const s = byId.get(st.id), sh = D.show[st.id];
    // In empty-sky mode the curve is the same estimator run on the empty patch, on the cluster's axes.
    const src = st.field ? { lam: sh.field_lam, lam_err: sh.field_lam_err } : s;
    const ymax = Math.max(...s.lam.map((v, i) => v + (s.lam_err[i] || 0))) * 1.08;
    const ymin = st.field ? Math.min(0, ...src.lam.map((v, i) => (D.lam_z[i] <= 1.05 && v != null ? v - src.lam_err[i] : 0))) * 1.08 : 0;
    const F = Plot.frame(lamHost, { height: 170, x: [0.1, 1.05], y: [ymin, ymax], xlabel: "redshift z", ylabel: "λ(z)" });
    if (ymin < 0) el("line", { x1: F.x.lo, x2: F.x.hi, y1: F.y(0), y2: F.y(0), stroke: C.line }, F.g);
    const col = st.field ? C.muted : C.accent;
    const bandP = el("path", { fill: col, "fill-opacity": 0.15 }, F.g);
    const lineP = el("path", { fill: "none", stroke: col, "stroke-width": 2 }, F.g);
    const spec = el("line", { y1: F.y.lo, y2: F.y.hi, stroke: C.gold, "stroke-width": 1.5, "stroke-dasharray": "5 4" }, F.g);
    const cursor = el("line", { y1: F.y.lo, y2: F.y.hi, stroke: C.warm, "stroke-width": 1.5 }, F.g);
    const hint = el("text", { x: (F.x.lo + F.x.hi) / 2, y: (F.y.lo + F.y.hi) / 2, "text-anchor": "middle" }, F.svg);
    lam = { F, bandP, lineP, spec, cursor, hint, s: src, zSpec: s.z_spec, ymin };
    const drag = (ev) => {
      const [px] = Plot.pointer(F.svg, ev);
      setZ(Math.min(1.05, Math.max(0.1, F.x.invert(px))));
    };
    F.svg.style.cursor = "ew-resize";
    F.svg.addEventListener("pointerdown", (ev) => { F.svg.setPointerCapture(ev.pointerId); drag(ev); });
    F.svg.addEventListener("pointermove", (ev) => { if (ev.buttons) drag(ev); });
    updateLam();
  }
  function updateLam() {
    if (!lam) return;
    const { F, bandP, lineP, spec, cursor, hint, s, zSpec, ymin } = lam;
    const seen = st.visited[st.id], all = st.revealed[st.id];
    const z = D.lam_z;
    const vis = (i) => all || seen.has(i);
    const y = s.lam.map((v, i) => (vis(i) ? v : null));
    lineP.setAttribute("d", Plot.path(z, y, F.x, F.y));
    let d = "";
    let seg = [];
    const flush = () => {
      if (seg.length > 1) {
        d += "M" + seg.map((i) => `${F.x(z[i])},${F.y(s.lam[i] + s.lam_err[i])}`).join("L");
        d += "L" + seg.slice().reverse().map((i) => `${F.x(z[i])},${F.y(Math.max(ymin, s.lam[i] - s.lam_err[i]))}`).join("L") + "Z";
      }
      seg = [];
    };
    z.forEach((_, i) => (vis(i) && s.lam[i] != null ? seg.push(i) : flush()));
    flush();
    bandP.setAttribute("d", d);
    cursor.setAttribute("x1", F.x(st.z)); cursor.setAttribute("x2", F.x(st.z));
    spec.setAttribute("x1", F.x(zSpec)); spec.setAttribute("x2", F.x(zSpec));
    spec.setAttribute("visibility", all && !st.field ? "visible" : "hidden");
    hint.textContent = seen.size < 6 && !all ? "drag here to scan in redshift" : "";
  }

  function setZ(z) {
    st.z = Math.round(z / 0.005) * 0.005;
    zIn.value = st.z;
    zOut.textContent = st.z.toFixed(3);
    if (lam) {
      const g = D.lam_z, seen = st.visited[st.id];
      for (let i = 0; i < g.length; i++) if (Math.abs(g[i] - st.z) < 0.0155) seen.add(i);
      if (!st.revealed[st.id] && seen.size > 0.9 * g.length) reveal();
    }
    updateCMD();
    updateLam();
  }
  function reveal() {
    st.revealed[st.id] = true;
    renderCard();
    updateLam();
  }
  zIn.addEventListener("input", () => setZ(+zIn.value));
  revealBtn.addEventListener("click", () => {
    reveal();
    const s = byId.get(st.id);
    if (reduceMotion) { setZ(s.z_spec); return; }
    const from = st.z, t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 900);
      setZ(from + (s.z_spec - from) * (1 - (1 - t) ** 3));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  fieldBtn.addEventListener("click", () => {
    st.field = !st.field;
    fieldBtn.setAttribute("aria-pressed", String(st.field));
    fieldBtn.textContent = st.field ? "Back to the cluster" : "Show an empty patch of sky";
    drawCMD();
    drawLam();
  });

  // ---- Two clusters on one line of sight ----------------------------------
  const DB = D.double;
  const dblHost = document.querySelector("#double");
  const dblOut = document.querySelector("#dbl-readout");
  const b1 = document.querySelector("#dbl-1"), b2 = document.querySelector("#dbl-2");
  let nFit = 2, dbl = null;
  function drawDouble() {
    dblHost.innerHTML = "";
    const top = document.createElement("div"), bottom = document.createElement("div");
    dblHost.append(top, bottom);
    const s = byId.get("ACT-CL J1137.7-0313");
    const xr = [0.15, 0.65];
    const ymax = Math.max(...s.lam.map((v, i) => (D.lam_z[i] <= xr[1] ? v + s.lam_err[i] : 0))) * 1.1;
    const F = Plot.frame(top, { height: 150, x: xr, y: [0, ymax], margin: { bottom: 8 }, xticks: [], ylabel: "λ(z)" });
    el("path", { d: Plot.path(D.lam_z, s.lam, F.x, F.y), fill: "none", stroke: C.muted, "stroke-width": 1.8 }, F.g);
    const G = Plot.frame(bottom, { height: 150, x: xr, y: [0, 1.15], margin: { top: 4 }, noY: true,
      xlabel: "redshift z", ylabel: "p(z | data)" });
    const e = DB.edges;
    const hist = (h) => {
      let d = `M${G.x(e[0])},${G.y(0)}`;
      h.forEach((v, i) => { d += `L${G.x((e[i] + e[i + 1]) / 2)},${G.y(v)}`; });
      return d + `L${G.x(e[e.length - 1])},${G.y(0)}Z`;
    };
    const p1 = el("path", { fill: C.accent, "fill-opacity": 0.25, stroke: C.accent, "stroke-width": 1.6 }, G.g);
    const p2 = el("path", { fill: C.warm, "fill-opacity": 0.25, stroke: C.warm, "stroke-width": 1.6 }, G.g);
    for (const [zv, dash, label] of [[DB.z_spec, "5 4", "spec-z"], [DB.z_mcmf[1], "1 3", "MCMF 2nd"]]) {
      for (const P of [F, G]) el("line", { x1: P.x(zv), x2: P.x(zv), y1: P.y.lo, y2: P.y.hi, stroke: C.gold, "stroke-dasharray": dash, "stroke-opacity": 0.8 }, P.g);
      el("text", { x: G.x(zv) + 4, y: G.y(1.07), fill: C.gold, "font-size": 11 }, G.svg).textContent = label;
    }
    dbl = { p1, p2, hist };
    updateDouble();
  }
  function updateDouble() {
    if (!dbl) return;
    const { p1, p2, hist } = dbl;
    p1.setAttribute("d", hist(nFit === 1 ? DB.n1 : DB.z_1));
    p2.setAttribute("d", nFit === 2 ? hist(DB.z_2) : "");
    b1.setAttribute("aria-pressed", String(nFit === 1));
    b2.setAttribute("aria-pressed", String(nFit === 2));
    b1.style.color = nFit === 1 ? C.ink : ""; b2.style.color = nFit === 2 ? C.ink : "";
    const lz = DB.log_z;
    const peak = (h) => {
      let k = 0;
      h.forEach((v, i) => { if (v > h[k]) k = i; });
      return ((DB.edges[k] + DB.edges[k + 1]) / 2).toFixed(3);
    };
    dblOut.innerHTML = nFit === 1
      ? `One cluster: z ≈ ${peak(DB.n1)} · ln Z<sub>1</sub> − ln Z<sub>0</sub> = ${(lz[1] - lz[0]).toFixed(0)} <span class="dim">(a cluster is certainly there)</span>`
      : `Two clusters: z ≈ ${peak(DB.z_1)} and ${peak(DB.z_2)} · <span class="hot">ln Z<sub>2</sub> − ln Z<sub>1</sub> = ${(lz[2] - lz[1]).toFixed(0)}</span> <span class="dim">(odds of e<sup>${(lz[2] - lz[1]).toFixed(0)}</sup> to 1 for two)</span>`;
  }
  b1.addEventListener("click", () => { nFit = 1; updateDouble(); });
  b2.addEventListener("click", () => { nFit = 2; updateDouble(); });

  // ---- z_cl against z_spec ------------------------------------------------
  const scHost = document.querySelector("#scatter");
  const miniHost = document.querySelector("#mini");
  const scTip = Plot.tip(scHost);
  let sel = "ACT-CL J2248.8-4431";
  function drawScatter() {
    const F = Plot.frame(scHost, { height: Math.min(360, scHost.clientWidth * 0.75), x: [0.2, 1], y: [0.2, 1],
      xlabel: "spectroscopic redshift", ylabel: "my redshift" });
    el("line", { x1: F.x(0.2), y1: F.y(0.2), x2: F.x(1), y2: F.y(1), stroke: C.muted, "stroke-opacity": 0.5, "stroke-dasharray": "4 4" }, F.g);
    const pts = [];
    for (const s of D.summary) {
      const [lo, mid, hi] = s.z_cl;
      const single = s.sample === "tested";
      const colr = single ? C.accent : C.warm;
      el("line", { x1: F.x(s.z_spec), x2: F.x(s.z_spec), y1: F.y(lo), y2: F.y(hi), stroke: colr, "stroke-opacity": 0.5 }, F.g);
      const c = el("circle", { cx: F.x(s.z_spec), cy: F.y(mid), r: s.id === sel ? 5.5 : 3.6,
        fill: single ? colr : "none", stroke: s.id === sel ? C.gold : colr, "stroke-width": s.id === sel ? 2 : 1.5 }, F.g);
      pts.push([F.x(s.z_spec), F.y(mid), s, c]);
    }
    el("circle", { cx: F.x.lo + 14, cy: F.y.lo + 16, r: 3.6, fill: C.accent }, F.svg);
    el("text", { x: F.x.lo + 24, y: F.y.lo + 20 }, F.svg).textContent = "one cluster on the line of sight";
    el("circle", { cx: F.x.lo + 14, cy: F.y.lo + 34, r: 3.6, fill: "none", stroke: C.warm, "stroke-width": 1.5 }, F.svg);
    el("text", { x: F.x.lo + 24, y: F.y.lo + 38 }, F.svg).textContent = "two peaks in λ(z)";
    const nearest = (ev) => {
      const [px, py] = Plot.pointer(F.svg, ev);
      let best = null, bd = 400;
      for (const p of pts) {
        const d = (p[0] - px) ** 2 + (p[1] - py) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    };
    const hover = (ev) => {
      const p = nearest(ev);
      if (!p) { scTip.hide(); return; }
      const s = p[2];
      scTip.show(`${s.id}<br><span class="dim">spec-z</span> ${s.z_spec.toFixed(3)} · <span class="dim">mine</span> ${s.z_cl[1].toFixed(3)}<br><span class="dim">M<sub>500</sub> ≈ ${s.m500.toFixed(1)}×10<sup>14</sup> M<sub>☉</sub></span>`, p[0], p[1]);
      if (s.id !== sel) { sel = s.id; drawMini(); restyle(); }
    };
    const restyle = () => pts.forEach(([, , s, c]) => {
      const single = s.sample === "tested";
      const colr = single ? C.accent : C.warm;
      c.setAttribute("r", s.id === sel ? 5.5 : 3.6);
      c.setAttribute("stroke", s.id === sel ? C.gold : colr);
      c.setAttribute("stroke-width", s.id === sel ? 2 : 1.5);
    });
    F.svg.addEventListener("pointermove", hover);
    F.svg.addEventListener("pointerdown", hover);
    F.svg.addEventListener("pointerleave", () => scTip.hide());
  }
  function drawMini() {
    const s = byId.get(sel);
    const ymax = Math.max(...s.lam.map((v, i) => v + (s.lam_err[i] || 0))) * 1.1;
    const F = Plot.frame(miniHost, { height: 140, x: [0.1, 1.1], y: [0, ymax], xlabel: "redshift z", ylabel: "λ(z)" });
    let d = "M" + D.lam_z.map((z, i) => `${F.x(z)},${F.y(s.lam[i] + s.lam_err[i])}`).join("L");
    d += "L" + D.lam_z.map((z, i) => [z, i]).reverse().map(([z, i]) => `${F.x(z)},${F.y(Math.max(0, s.lam[i] - s.lam_err[i]))}`).join("L") + "Z";
    el("path", { d, fill: C.accent, "fill-opacity": 0.15 }, F.g);
    el("path", { d: Plot.path(D.lam_z, s.lam, F.x, F.y), fill: "none", stroke: C.accent, "stroke-width": 1.8 }, F.g);
    el("line", { x1: F.x(s.z_spec), x2: F.x(s.z_spec), y1: F.y.lo, y2: F.y.hi, stroke: C.gold, "stroke-dasharray": "5 4" }, F.g);
    el("text", { x: F.x.hi - 6, y: F.y.hi + 14, "text-anchor": "end" }, F.svg).textContent = s.id;
  }
  (function caption() {
    const t = D.summary.filter((s) => s.sample === "tested");
    const dz = t.map((s) => (s.z_cl[1] - s.z_spec) / (1 + s.z_spec));
    const med = (a) => { const b = a.slice().sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
    const m = med(dz);
    const nmad = 1.4826 * med(dz.map((v) => Math.abs(v - m)));
    const worst = Math.max(...dz.map(Math.abs));
    document.querySelector("#scatter-caption").innerHTML =
      `For the ${t.length} clusters alone on their line of sight, the scatter in Δz/(1 + z) is ${nmad.toFixed(3)} (normalised median absolute deviation) and the worst miss is ${worst.toFixed(3)}. `
      + `The ${D.summary.length - t.length} hollow points have a second peak in λ(z), so a one-cluster fit can lock onto the wrong one; those are what the multi-cluster model above is for. Error bars are 68% credible intervals.`;
  })();

  Plot.onResize(cmdHost, () => {
    renderCard(); drawCMD(); drawLam(); setZ(st.z); drawDouble(); drawScatter(); drawMini();
  });
})();
