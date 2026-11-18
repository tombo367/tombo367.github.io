// Interactive figures for the early dark energy page. Data exported from the
// ede project (toy_model/, profiles/, scripts/boris_chi2_compare/).
(async function () {
  const D = await fetch("assets/data/projects/ede.json").then((r) => r.json());
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const C = {
    accent: Plot.css("--accent"), warm: Plot.css("--warm"), gold: Plot.css("--gold"),
    muted: Plot.css("--muted"), line: Plot.css("--line"), ink: Plot.css("--ink"),
  };
  const { el } = Plot;

  // ---- Toy model (a port of toy_model/model.py) ---------------------------
  const KAPPA = 0.6, LAMBDA = 0.5, K0 = 6, L_DAMP = 0.55, W = 0.07, N = 300;
  const X = Array.from({ length: N }, (_, i) => i / (N - 1));
  const SIG = X.map((x) => 0.07 * (1 + 30 * x ** 3));
  const DATA = D.toy.data;
  const NAMES = ["A", "h", "f", "x_c", "theta"];
  const PRIOR = { A: [0.8, 1.2], h: [0.8, 1.2], f: [0, 0.3], x_c: [0, 1], theta: [0.1, 3.1] };
  const TRUTH = { A: 1, h: 1, f: 0.06, x_c: 0.35, theta: 2.5 };
  const PROFILE = D.toy.profile;
  const CHI2_MIN = Math.min(...PROFILE.map((q) => q.chi2));

  function model(p, x) {
    const s = p.h * (1 - KAPPA * p.f);
    const base = p.A * (1 + LAMBDA * p.f) * Math.exp(-(x * x) / (2 * L_DAMP * L_DAMP))
      * (1 + 0.5 * Math.cos((2 * Math.PI * K0 * x) / s));
    const amp = 0.5 + (1 - Math.cos(p.theta));
    const ede = p.f * amp * Math.exp(-((x - p.x_c) ** 2) / (2 * W * W))
      * Math.cos((2 * Math.PI * K0 * (x - p.x_c)) / s + p.theta);
    return [base, ede];
  }
  function chi2(p) {
    let c = 0;
    for (let i = 0; i < N; i++) {
      const [b, e] = model(p, X[i]);
      const r = (b + e - DATA[i]) / SIG[i];
      c += r * r;
    }
    return c;
  }
  function profileAt(f) {
    const i = Math.min(PROFILE.length - 2, Math.floor(f / 0.01));
    const t = (f - PROFILE[i].f) / (PROFILE[i + 1].f - PROFILE[i].f);
    return PROFILE[i].chi2 + t * (PROFILE[i + 1].chi2 - PROFILE[i].chi2);
  }

  function nelderMead(fn, x0, step, iters) {
    const n = x0.length;
    let S = [x0.slice()];
    for (let i = 0; i < n; i++) { const v = x0.slice(); v[i] += step[i]; S.push(v); }
    let F = S.map(fn);
    for (let it = 0; it < iters; it++) {
      const order = F.map((v, i) => i).sort((a, b) => F[a] - F[b]);
      S = order.map((i) => S[i]); F = order.map((i) => F[i]);
      if (F[n] - F[0] < 1e-7) break;
      const c = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += S[i][j] / n;
      const at = (t) => c.map((cj, j) => cj + t * (S[n][j] - cj));
      const xr = at(-1), fr = fn(xr);
      if (fr < F[0]) {
        const xe = at(-2), fe = fn(xe);
        if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; }
      } else if (fr < F[n - 1]) {
        S[n] = xr; F[n] = fr;
      } else {
        const xk = fr < F[n] ? at(-0.5) : at(0.5), fk = fn(xk);
        if (fk < Math.min(fr, F[n])) { S[n] = xk; F[n] = fk; }
        else for (let i = 1; i <= n; i++) { S[i] = S[i].map((v, j) => S[0][j] + 0.5 * (v - S[0][j])); F[i] = fn(S[i]); }
      }
    }
    return { x: S[0], f: F[0] };
  }

  // Profile step: minimise chi^2 over (A, h, x_c, theta) at fixed f, from a grid of starts.
  function bestAtF(f) {
    const free = ["A", "h", "x_c", "theta"];
    const fn = (v) => {
      const p = { f };
      let pen = 0;
      free.forEach((k, i) => {
        const [lo, hi] = PRIOR[k];
        const c = Math.min(hi, Math.max(lo, v[i]));
        pen += 1e4 * (v[i] - c) ** 2;
        p[k] = c;
      });
      return chi2(p) + pen;
    };
    let best = null;
    const A0 = 1 / (1 + LAMBDA * f);
    for (const h0 of [0.95, 1.0]) for (const xc of [0.1, 0.3, 0.5, 0.7, 0.9]) for (const th of [0.6, 1.6, 2.6]) {
      const r = nelderMead(fn, [A0, h0 / (1 - KAPPA * f), xc, th], [0.01, 0.01, 0.08, 0.5], 500);
      if (!best || r.f < best.f) best = r;
    }
    const out = { f };
    free.forEach((k, i) => (out[k] = Math.min(PRIOR[k][1], Math.max(PRIOR[k][0], best.x[i]))));
    return out;
  }

  // ---- Toy figure ----------------------------------------------------------
  const toyHost = document.querySelector("#toy");
  const state = Object.assign({}, TRUTH);
  const SLIDERS = [
    ["A", "<b>A</b> amplitude (like A<sub>s</sub>)", 0.001],
    ["h", "<b>h</b> acoustic scale (like H<sub>0</sub>)", 0.001],
    ["f", "<b>f</b> EDE fraction (f<sub>EDE</sub>)", 0.001],
    ["x_c", "<b>x<sub>c</sub></b> where (like z<sub>c</sub>)", 0.005],
    ["theta", "<b>θ</b> phase (like θ<sub>i</sub>)", 0.01],
  ];
  const inputs = {};
  const rows = {};
  const slidersEl = document.querySelector("#toy-sliders");
  for (const [k, label, step] of SLIDERS) {
    const row = document.createElement("div");
    row.className = "slider";
    const id = "toy-" + k;
    row.innerHTML = `<label for="${id}">${label}</label><input id="${id}" type="range" min="${PRIOR[k][0]}" max="${PRIOR[k][1]}" step="${step}"><output for="${id}"></output>`;
    slidersEl.appendChild(row);
    const inp = row.querySelector("input");
    inp.value = state[k];
    inp.addEventListener("input", () => { stopAnim(); state[k] = +inp.value; update(); });
    inputs[k] = inp;
    rows[k] = row;
  }

  let toy = null;
  function drawToy() {
    toyHost.innerHTML = "";
    const top = document.createElement("div");
    const bottom = document.createElement("div");
    toyHost.append(top, bottom);
    const F = Plot.frame(top, { height: 270, x: [0, 1], y: [-0.7, 1.9], margin: { bottom: 8 }, xticks: [], ylabel: "spectrum" });
    for (let i = 0; i < N; i++) {
      const y0 = Math.max(F.y(DATA[i] - SIG[i]), F.y.lo - 5), y1 = Math.min(F.y(DATA[i] + SIG[i]), F.y.hi + 5);
      el("line", { x1: F.x(X[i]), x2: F.x(X[i]), y1: y0, y2: y1, stroke: C.muted, "stroke-opacity": 0.13 }, F.g);
    }
    for (let i = 0; i < N; i++) el("circle", { cx: F.x(X[i]), cy: F.y(DATA[i]), r: 1.5, fill: C.muted, "fill-opacity": 0.75 }, F.g);
    const truthPath = el("path", { fill: "none", stroke: C.ink, "stroke-opacity": 0.25, "stroke-dasharray": "3 4" }, F.g);
    const curve = el("path", { fill: "none", stroke: C.accent, "stroke-width": 2 }, F.g);
    const G = Plot.frame(bottom, { height: 110, x: [0, 1], y: [-0.5, 0.5], margin: { top: 4 }, yticks: [-0.4, 0, 0.4],
      xlabel: "x  (think multipole ℓ)", ylabel: "EDE" });
    el("line", { x1: G.x.lo, x2: G.x.hi, y1: G.y(0), y2: G.y(0), stroke: C.line }, G.g);
    const edeCurve = el("path", { fill: "none", stroke: C.gold, "stroke-width": 1.8 }, G.g);
    const xs = Array.from({ length: 401 }, (_, i) => i / 400);
    truthPath.setAttribute("d", Plot.path(xs, xs.map((x) => model(TRUTH, x).reduce((a, b) => a + b)), F.x, F.y));
    toy = { F, G, curve, edeCurve, xs };
    update();
  }

  const readout = document.querySelector("#toy-readout");
  function update() {
    if (!toy) return;
    const { F, G, curve, edeCurve, xs } = toy;
    const comps = xs.map((x) => model(state, x));
    curve.setAttribute("d", Plot.path(xs, comps.map((c) => c[0] + c[1]), F.x, F.y));
    edeCurve.setAttribute("d", Plot.path(xs, comps.map((c) => c[1]), G.x, G.y));
    for (const [k] of SLIDERS) {
      rows[k].querySelector("output").textContent = (+state[k]).toFixed(k === "f" ? 3 : 2);
      inputs[k].value = state[k];
    }
    const idle = state.f < 0.0005;
    rows.x_c.classList.toggle("idle", idle);
    rows.theta.classList.toggle("idle", idle);
    const c = chi2(state);
    const d = c - CHI2_MIN;
    readout.innerHTML = `χ² = ${c.toFixed(1)} for ${N} points · <span class="${d < 2.3 ? "" : "hot"}">Δχ² = ${d.toFixed(1)}</span>`
      + ` <span class="dim">above the best fit${idle ? " · with f = 0, x<sub>c</sub> and θ are unconstrained" : ""}</span>`;
    updateDot();
  }

  let anim = null;
  const stopAnim = () => { if (anim) cancelAnimationFrame(anim); anim = null; };
  function animateTo(target) {
    stopAnim();
    const from = Object.assign({}, state);
    if (reduceMotion) { Object.assign(state, target); update(); return; }
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 700);
      const e = 1 - (1 - t) ** 3;
      for (const k of NAMES) state[k] = from[k] + (target[k] - from[k]) * e;
      update();
      anim = t < 1 ? requestAnimationFrame(step) : null;
    };
    anim = requestAnimationFrame(step);
  }
  document.querySelector("#toy-truth").addEventListener("click", () => animateTo(TRUTH));
  document.querySelector("#toy-off").addEventListener("click", () => animateTo(Object.assign({}, state, { f: 0 })));
  const bestBtn = document.querySelector("#toy-best");
  bestBtn.addEventListener("click", () => {
    bestBtn.disabled = true;
    bestBtn.textContent = "Optimising…";
    setTimeout(() => {
      const b = bestAtF(state.f);
      bestBtn.disabled = false;
      bestBtn.textContent = "Best fit at this f";
      animateTo(b);
    }, 20);
  });

  // ---- Profile vs posterior -----------------------------------------------
  const profHost = document.querySelector("#profile");
  let dot = null, dotF = null;
  function drawProfile() {
    const F = Plot.frame(profHost, { height: 250, x: [0, 0.3], y: [0, 1.12], xlabel: "<tspan font-style='italic'>f</tspan>",
      ylabel: "relative probability", yticks: [0, 0.5, 1] });
    // Rebin the 60-bin histogram to 30 bins to calm the sampling noise.
    const e = D.toy.post_edges.filter((_, i) => i % 2 === 0);
    const h = e.slice(1).map((_, i) => (D.toy.post_f[2 * i] + D.toy.post_f[2 * i + 1]) / 2);
    const hmax = Math.max(...h);
    let d = `M${F.x(e[0])},${F.y(0)}`;
    h.forEach((v, i) => { d += `L${F.x(e[i])},${F.y(v / hmax)}L${F.x(e[i + 1])},${F.y(v / hmax)}`; });
    d += `L${F.x(e[e.length - 1])},${F.y(0)}Z`;
    el("path", { d, fill: C.warm, "fill-opacity": 0.22, stroke: C.warm, "stroke-width": 1.2 }, F.g);
    const fs = PROFILE.map((q) => q.f);
    el("path", { d: Plot.path(fs, PROFILE.map((q) => Math.exp(-(q.chi2 - CHI2_MIN) / 2)), F.x, F.y), fill: "none",
      stroke: C.accent, "stroke-width": 2 }, F.g);
    el("line", { x1: F.x(TRUTH.f), x2: F.x(TRUTH.f), y1: F.y.lo, y2: F.y.hi, stroke: C.ink, "stroke-opacity": 0.3, "stroke-dasharray": "3 4" }, F.g);
    const lx = F.x.hi - 8;
    el("text", { x: lx, y: F.y(1.04), "text-anchor": "end", fill: C.accent }, F.svg).textContent = "profile likelihood";
    el("text", { x: lx, y: F.y(0.92), "text-anchor": "end", fill: C.warm }, F.svg).textContent = "marginal posterior";
    el("text", { x: F.x(TRUTH.f) + 5, y: F.y(0.06), fill: C.muted }, F.svg).textContent = "truth";
    dotF = F;
    dot = el("circle", { r: 5, fill: C.gold, stroke: "#050d17", "stroke-width": 1.5 }, F.svg);
    updateDot();
  }
  function updateDot() {
    if (!dot) return;
    const p = Math.exp(-(chi2(state) - CHI2_MIN) / 2);
    dot.setAttribute("cx", dotF.x(state.f));
    dot.setAttribute("cy", dotF.y(Math.min(1.1, p)));
    dot.setAttribute("opacity", p > 0.002 ? 1 : 0.35);
  }

  // ---- Real profile: emulator vs CLASS -----------------------------------
  const realHost = document.querySelector("#real");
  const realBtn = document.querySelector("#real-toggle");
  const PE = D.profile_class.filter((r) => r[0] > 0);
  const dmap = new Map(D.emu_dchi2.map((r) => [r[0], r[1]]));
  const pts = PE.filter((r) => dmap.has(r[0]));
  const emuY = pts.map((r) => r[1]);
  const classRaw = pts.map((r) => r[1] + dmap.get(r[0]));
  const cmin = Math.min(...classRaw);
  const classY = classRaw.map((v) => v - cmin);
  const fx = pts.map((r) => r[0]);
  let realMix = 0, realTarget = 0, realAnim = null, realLine = null, realF = null, realDots = [];
  function drawReal() {
    realHost.innerHTML = "";
    const top = document.createElement("div"), bottom = document.createElement("div");
    realHost.append(top, bottom);
    const F = Plot.frame(top, { height: 230, x: [0, 0.2], y: [0, 9], margin: { bottom: 8 }, xticks: [], ylabel: "Δχ²" });
    el("path", { d: Plot.path(fx, emuY, F.x, F.y), fill: "none", stroke: C.accent, "stroke-opacity": 0.35, "stroke-dasharray": "4 4" }, F.g);
    realLine = el("path", { fill: "none", stroke: C.accent, "stroke-width": 2 }, F.g);
    realDots = fx.map(() => el("circle", { r: 2.4, fill: C.accent }, F.g));
    el("text", { x: F.x.hi - 8, y: F.y(8.2), "text-anchor": "end" }, F.svg).textContent = "ACT DR6 + Planck + lensing + DESI + Pantheon+";
    realF = F;
    const G = Plot.frame(bottom, { height: 120, x: [0, 0.2], y: [-0.6, 2], margin: { top: 4 }, yticks: [0, 1, 2],
      xlabel: "f<tspan dy='4' font-size='9'>EDE</tspan>", ylabel: "χ² error" });
    el("line", { x1: G.x.lo, x2: G.x.hi, y1: G.y(0), y2: G.y(0), stroke: C.line }, G.g);
    const bw = Math.max(2, (G.x(0.0059) - G.x(0)) * 0.6);
    for (let i = 0; i < fx.length; i++) {
      const v = dmap.get(fx[i]);
      el("rect", { x: G.x(fx[i]) - bw / 2, y: Math.min(G.y(0), G.y(v)), width: bw, height: Math.abs(G.y(v) - G.y(0)),
        fill: v > 0 ? C.warm : C.accent, "fill-opacity": 0.8 }, G.g);
    }
    setReal();
  }
  function setReal() {
    if (!realLine) return;
    const ys = emuY.map((v, i) => v + (classY[i] - v) * realMix);
    realLine.setAttribute("d", Plot.path(fx, ys, realF.x, realF.y));
    realLine.setAttribute("stroke", realMix > 0.5 ? C.warm : C.accent);
    realDots.forEach((c, i) => {
      c.setAttribute("cx", realF.x(fx[i]));
      c.setAttribute("cy", realF.y(ys[i]));
      c.setAttribute("fill", realMix > 0.5 ? C.warm : C.accent);
    });
  }
  realBtn.addEventListener("click", () => {
    realTarget = realTarget ? 0 : 1;
    realBtn.setAttribute("aria-pressed", String(!!realTarget));
    realBtn.textContent = realTarget ? "Back to the emulator" : "Re-evaluate with CLASS";
    if (realAnim) cancelAnimationFrame(realAnim);
    const from = realMix, t0 = performance.now();
    const step = (now) => {
      const t = reduceMotion ? 1 : Math.min(1, (now - t0) / 800);
      realMix = from + (realTarget - from) * (1 - (1 - t) ** 3);
      setReal();
      realAnim = t < 1 ? requestAnimationFrame(step) : null;
    };
    realAnim = requestAnimationFrame(step);
  });

  // ---- RMSE -> profile error (ede-analyses/rmse_requirement) ---------------
  const R = D.rmse;
  const rmseHost = document.querySelector("#rmse");
  const fIn = document.querySelector("#rmse-f"), tauIn = document.querySelector("#rmse-tau");
  const rmseOut = document.querySelector("#rmse-readout");
  const rmseTip = Plot.tip(rmseHost);
  const Z = 1, SQN = Math.sqrt(R.n_d), EMAX = 0.065, DMAX = 2.5;
  const GROUP = {
    "25k": { color: "#4f7fa8", label: "25k training spectra" },
    "50k": { color: "#6ea6cf", label: "50k" },
    "100k": { color: C.accent, label: "100k" },
    box: { color: C.muted, label: "doubled prior box" },
  };
  const named = (g) => !GROUP[g];
  let rm = null;
  const bound = (e, lam, sign) => { const s = SQN * e; return s * s + sign * 2 * (Math.sqrt(lam) + Z) * s; };
  // Largest e with |dchi2| <= tau guaranteed by the bound (emulator_rmse.py).
  const eReq = (lam, tau) => { const a = Math.sqrt(lam) + Z; return (Math.sqrt(a * a + tau) - a) / SQN; };
  function drawRmse() {
    const F = Plot.frame(rmseHost, { height: 300, x: [0, EMAX], y: [-DMAX, DMAX], xfmt: (v) => +(v * 100).toFixed(1) + "%",
      xlabel: "emulator RMS error, per band power, in units of σ", ylabel: "χ²<tspan dy='4' font-size='9'>emu</tspan><tspan dy='-4'> − χ²</tspan><tspan dy='4' font-size='9'>CLASS</tspan>" });
    el("line", { x1: F.x.lo, x2: F.x.hi, y1: F.y(0), y2: F.y(0), stroke: C.line }, F.g);
    const wedge = el("path", { fill: C.warm, "fill-opacity": 0.12, stroke: C.warm, "stroke-opacity": 0.6 }, F.g);
    const tauBand = el("rect", { x: F.x.lo, width: F.x.hi - F.x.lo, fill: C.gold, "fill-opacity": 0.06 }, F.g);
    const req = el("line", { stroke: C.gold, "stroke-dasharray": "4 4", y1: F.y.lo, y2: F.y.hi }, F.g);
    const reqLabel = el("text", { y: F.y.hi - 8, fill: C.gold }, F.svg);
    const layer = el("g", {}, F.g);
    const dots = R.emus.map((m) => {
      const g = GROUP[m.group];
      return el("circle", { r: named(m.group) ? 4.5 : 3.2, fill: g ? g.color : C.gold, "fill-opacity": g ? 0.85 : 1,
        stroke: named(m.group) ? "#050d17" : "none" }, layer);
    });
    const labels = R.emus.filter((m) => named(m.group)).map((m) => [m, el("text", { fill: C.gold, "font-size": 11 }, F.svg)]);
    let lx = F.x.hi - 8, ly = F.y.lo + 16;
    for (const k of ["25k", "50k", "100k", "box"]) {
      el("circle", { cx: lx - 4, cy: ly - 4, r: 3.2, fill: GROUP[k].color }, F.svg);
      el("text", { x: lx - 12, y: ly, "text-anchor": "end" }, F.svg).textContent = GROUP[k].label;
      ly += 15;
    }
    rm = { F, wedge, tauBand, req, reqLabel, dots, labels };
    F.svg.addEventListener("pointermove", (ev) => {
      const [px, py] = Plot.pointer(F.svg, ev);
      const i = +fIn.value;
      let best = null, bd = 150;
      R.emus.forEach((m) => {
        const d = (F.x(m.e[i]) - px) ** 2 + (F.y(m.dchi2[i]) - py) ** 2;
        if (d < bd) { bd = d; best = m; }
      });
      if (!best) { rmseTip.hide(); return; }
      const what = named(best.group) ? best.group : best.group === "box" ? `doubled prior box, ${best.key.includes("nall") ? "all" : "25k"} spectra` : `${best.group} training spectra, seed ${best.key.slice(-1)}`;
      rmseTip.show(`${what}<br><span class="dim">RMS error</span> ${(best.e[i] * 100).toFixed(2)}% σ · <span class="dim">Δχ²</span> ${best.dchi2[i] >= 0 ? "+" : ""}${best.dchi2[i].toFixed(2)}`,
        F.x(best.e[i]), F.y(best.dchi2[i]));
    });
    F.svg.addEventListener("pointerleave", () => rmseTip.hide());
    updateRmse();
  }
  function updateRmse() {
    if (!rm) return;
    const { F, wedge, tauBand, req, reqLabel, dots, labels } = rm;
    const i = +fIn.value, tau = +tauIn.value, lam = R.lam[i];
    document.querySelector("#rmse-f-out").textContent = R.fede[i].toFixed(3);
    document.querySelector("#rmse-tau-out").textContent = tau.toFixed(2);
    const es = Array.from({ length: 81 }, (_, k) => (k / 80) * EMAX);
    wedge.setAttribute("d", "M" + es.map((e) => `${F.x(e)},${F.y(Math.min(DMAX * 3, bound(e, lam, 1)))}`).join("L")
      + "L" + es.slice().reverse().map((e) => `${F.x(e)},${F.y(Math.max(-DMAX * 3, bound(e, lam, -1)))}`).join("L") + "Z");
    tauBand.setAttribute("y", F.y(tau)); tauBand.setAttribute("height", F.y(-tau) - F.y(tau));
    const er = eReq(lam, tau);
    req.setAttribute("x1", F.x(er)); req.setAttribute("x2", F.x(er));
    reqLabel.setAttribute("x", F.x(er) + 5);
    reqLabel.textContent = "requirement";
    let inside = 0, meet = 0, within = 0;
    R.emus.forEach((m, k) => {
      dots[k].setAttribute("cx", F.x(m.e[i]));
      dots[k].setAttribute("cy", F.y(Math.max(-DMAX + 0.05, Math.min(DMAX - 0.05, m.dchi2[i]))));
      const s = SQN * m.e[i];
      if (Math.abs(m.dchi2[i] - s * s) <= 2 * (Math.sqrt(lam) + Z) * s) inside++;
      if (m.e[i] <= er) meet++;
      if (Math.abs(m.dchi2[i]) <= tau) within++;
    });
    labels.forEach(([m, t]) => {
      t.setAttribute("x", F.x(m.e[i]) + 7);
      t.setAttribute("y", F.y(Math.max(-DMAX + 0.05, Math.min(DMAX - 0.05, m.dchi2[i]))) + 4);
      t.textContent = m.group;
    });
    const n = R.emus.length;
    rmseOut.innerHTML = `λ = ${lam.toFixed(2)} · the wedge holds ${inside} of ${n} emulators · `
      + `<span class="hot">|Δχ²| ≤ ${tau.toFixed(2)} needs RMS error ≤ ${(er * 100).toFixed(2)}% of σ</span>`
      + ` <span class="dim">· ${meet} of ${n} guarantee it, ${within} achieve it here</span>`;
  }
  fIn.addEventListener("input", updateRmse);
  tauIn.addEventListener("input", updateRmse);

  // ---- Agent replay --------------------------------------------------------
  const agentHost = document.querySelector("#agent");
  const RUNS = D.runs;
  const YMIN = 4.6e-4, YMAX = 1.0e-3;
  const logEl = document.querySelector("#agent-log");
  const countEl = document.querySelector("#agent-count");
  const playBtn = document.querySelector("#agent-play");
  const tip = Plot.tip(agentHost);
  let shown = RUNS.length, agent = null, timer = null;
  const fmtScore = (s) => (s * 1e4).toFixed(2) + "×10⁻⁴";
  function drawAgent() {
    const F = Plot.frame(agentHost, { height: 280, x: [0, RUNS.length + 1], y: [YMIN, YMAX], margin: { top: 22 },
      yticks: [5e-4, 6e-4, 7e-4, 8e-4, 9e-4, 1e-3], yfmt: (v) => (v * 1e4).toFixed(0),
      xlabel: "experiment", ylabel: "TT error (×10⁻⁴)" });
    const split = RUNS.findIndex((r) => r.run === "nov8");
    const xs = F.x(split + 0.5);
    el("line", { x1: xs, x2: xs, y1: F.y.lo, y2: F.y.hi, stroke: C.muted, "stroke-opacity": 0.5, "stroke-dasharray": "3 4" }, F.g);
    el("text", { x: F.x(1), y: F.y.hi - 6 }, F.svg).textContent = "night 1";
    el("text", { x: xs + 6, y: F.y.hi - 6 }, F.svg).textContent = "night 2, longer budget";
    const best = el("path", { fill: "none", stroke: C.accent, "stroke-width": 1.8 }, F.g);
    const marks = RUNS.map((r, i) => {
      const cx = F.x(i + 1);
      if (r.score > YMAX) {
        return el("path", { d: `M${cx},${F.y.lo + 2}l-4,8h8z`, fill: C.warm }, F.svg);
      }
      const keep = r.status === "keep";
      return el("circle", { cx, cy: F.y(r.score), r: keep ? 4 : 3.4, fill: keep ? C.accent : "none",
        stroke: keep ? "none" : C.warm, "stroke-width": 1.5 }, F.g);
    });
    agent = { F, best, marks };
    F.svg.addEventListener("pointermove", (ev) => {
      const [px, py] = Plot.pointer(F.svg, ev);
      const i = Math.round(F.x.invert(px)) - 1;
      if (i < 0 || i >= shown) { tip.hide(); return; }
      const r = RUNS[i];
      const cy = r.score > YMAX ? F.y.lo : F.y(r.score);
      if (Math.abs(py - cy) > 40 && Math.abs(F.x(i + 1) - px) > 8) { tip.hide(); return; }
      tip.show(`<span class="${r.status === "keep" ? "" : "dim"}">#${i + 1} · ${r.status} · ${fmtScore(r.score)}</span><br>${r.desc}<br><span class="dim">${+r.t.slice(3, 5)} Nov, ${r.t.slice(6)} · ${r.run === "nov6a" ? "night 1" : "night 2"}</span>`,
        F.x(i + 1), cy);
    });
    F.svg.addEventListener("pointerleave", () => tip.hide());
    renderAgent();
  }
  function bestPath(n) {
    const { F } = agent;
    let d = "", best = null;
    for (let i = 0; i < n; i++) {
      const r = RUNS[i];
      if (i > 0 && r.run !== RUNS[i - 1].run) best = null;
      if (r.status === "keep" && (best === null || r.score < best)) {
        d += best === null ? `M${F.x(i + 1)},${F.y(r.score)}` : `H${F.x(i + 1)}V${F.y(r.score)}`;
        best = r.score;
      }
      const last = i === n - 1 || RUNS[i + 1].run !== r.run;
      if (last && best !== null) d += `H${F.x(i + 1)}`;
    }
    return d;
  }
  function logLine(r, i) {
    return `<div><span class="${r.status}">${r.status === "keep" ? "keep   " : "discard"}</span> #${String(i + 1).padStart(2, "0")} ${(r.score * 1e4).toFixed(2)} ${r.desc}</div>`;
  }
  function renderAgent() {
    if (!agent) return;
    agent.marks.forEach((m, i) => m.setAttribute("visibility", i < shown ? "visible" : "hidden"));
    agent.best.setAttribute("d", bestPath(shown));
    const kept = RUNS.slice(0, shown).filter((r) => r.status === "keep").length;
    countEl.textContent = `${shown} experiments · ${kept} kept`;
    const from = Math.max(0, shown - 4);
    logEl.innerHTML = RUNS.slice(from, shown).map((r, k) => logLine(r, from + k)).join("");
  }
  playBtn.addEventListener("click", () => {
    if (timer) { clearInterval(timer); timer = null; playBtn.textContent = "▶ Replay the two nights"; return; }
    shown = 0;
    renderAgent();
    playBtn.textContent = "❚❚ Pause";
    timer = setInterval(() => {
      shown++;
      renderAgent();
      if (shown >= RUNS.length) { clearInterval(timer); timer = null; playBtn.textContent = "▶ Replay the two nights"; }
    }, reduceMotion ? 20 : 170);
  });

  Plot.onResize(toyHost, () => { drawToy(); drawProfile(); drawReal(); drawRmse(); drawAgent(); });
})();
