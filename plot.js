// Small SVG plotting helpers shared by the project pages. Figures are drawn at
// the container's real width (and redrawn on resize) so text stays legible on
// phones.
const Plot = (function () {
  const NS = "http://www.w3.org/2000/svg";
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function scale(d0, d1, r0, r1) {
    const f = (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
    f.invert = (p) => d0 + ((p - r0) / (r1 - r0)) * (d1 - d0);
    f.lo = Math.min(r0, r1);
    f.hi = Math.max(r0, r1);
    return f;
  }

  function niceTicks(a, b, n) {
    const raw = (b - a) / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
    const out = [];
    for (let v = Math.ceil(a / step - 1e-9) * step; v <= b + step * 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }

  // A plotting frame: returns { svg, x, y, w, h, g } where g is a clipped layer for data.
  function frame(host, o) {
    host.querySelectorAll("svg").forEach((s) => s.remove());
    const W = host.clientWidth || 600;
    const H = o.height;
    const m = Object.assign({ top: 10, right: 12, bottom: 38, left: 46 }, o.margin || {});
    const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    host.prepend(svg);
    const x = scale(o.x[0], o.x[1], m.left, W - m.right);
    const y = scale(o.y[0], o.y[1], H - m.bottom, m.top);
    const line = css("--line");
    const axes = el("g", {}, svg);
    el("rect", { x: x.lo, y: y.lo, width: x.hi - x.lo, height: y.hi - y.lo, fill: "none", stroke: line }, axes);
    const xt = o.xticks || niceTicks(o.x[0], o.x[1], Math.max(3, Math.round((W - m.left - m.right) / 80)));
    for (const t of xt) {
      el("line", { x1: x(t), x2: x(t), y1: y.hi, y2: y.hi - 4, stroke: line }, axes);
      el("text", { x: x(t), y: y.hi + 15, "text-anchor": "middle" }, axes).textContent = (o.xfmt || String)(t);
    }
    if (!o.noY) {
      const yt = o.yticks || niceTicks(o.y[0], o.y[1], Math.max(2, Math.round((H - m.top - m.bottom) / 45)));
      for (const t of yt) {
        el("line", { x1: x.lo, x2: x.lo + 4, y1: y(t), y2: y(t), stroke: line }, axes);
        el("text", { x: x.lo - 6, y: y(t) + 4, "text-anchor": "end" }, axes).textContent = (o.yfmt || String)(t);
      }
    }
    if (o.xlabel) el("text", { x: (x.lo + x.hi) / 2, y: H - 4, "text-anchor": "middle" }, axes).innerHTML = o.xlabel;
    if (o.ylabel) {
      el("text", { x: 0, y: 0, "text-anchor": "middle", transform: `translate(12 ${(y.lo + y.hi) / 2}) rotate(-90)` }, axes)
        .innerHTML = o.ylabel;
    }
    const id = "clip" + Math.random().toString(36).slice(2);
    const cp = el("clipPath", { id }, el("defs", {}, svg));
    el("rect", { x: x.lo, y: y.lo, width: x.hi - x.lo, height: y.hi - y.lo }, cp);
    const g = el("g", { "clip-path": `url(#${id})` }, svg);
    return { svg, x, y, W, H, g, m };
  }

  const path = (xs, ys, x, y) => {
    let d = "", pen = false;
    for (let i = 0; i < xs.length; i++) {
      if (ys[i] == null || !isFinite(ys[i])) { pen = false; continue; }
      d += (pen ? "L" : "M") + x(xs[i]).toFixed(1) + "," + y(ys[i]).toFixed(1);
      pen = true;
    }
    return d;
  };

  // Floating tooltip inside a .figure host.
  function tip(host) {
    const t = document.createElement("div");
    t.className = "tip";
    t.hidden = true;
    host.appendChild(t);
    return {
      show(html, px, py) {
        t.innerHTML = html;
        t.hidden = false;
        const W = host.clientWidth;
        const tw = t.offsetWidth;
        t.style.left = Math.min(Math.max(0, px + 12), W - tw) + "px";
        t.style.top = Math.max(0, py - t.offsetHeight - 10) + "px";
      },
      hide() { t.hidden = true; },
    };
  }

  // Calls fn now and whenever the host changes width.
  function onResize(host, fn) {
    let w = 0;
    const ro = new ResizeObserver(() => {
      if (host.clientWidth !== w) { w = host.clientWidth; fn(); }
    });
    ro.observe(host);
  }

  const pointer = (svg, ev) => {
    const r = svg.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  };

  return { el, scale, niceTicks, frame, path, tip, onResize, pointer, css };
})();
