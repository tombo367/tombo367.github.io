// Crisp starfield background, drawn at the screen's native resolution.
(function () {
  const canvas = document.createElement("canvas");
  canvas.className = "starfield";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const ctx = canvas.getContext("2d");

  // Seeded random so the sky looks the same on every visit.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed = 7;

    // Faint nebula glows.
    const glows = [
      [0.15, 0.2, 0.55, "rgba(70, 110, 170, 0.16)"],
      [0.85, 0.65, 0.6, "rgba(110, 80, 160, 0.12)"],
      [0.55, 1.0, 0.5, "rgba(40, 120, 150, 0.10)"],
    ];
    for (const [x, y, r, c] of glows) {
      const g = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * Math.max(w, h));
      g.addColorStop(0, c);
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // Stars: mostly faint pinpricks, a few brighter ones with a soft halo.
    const count = Math.round((w * h) / 2200);
    for (let i = 0; i < count; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const m = Math.pow(rand(), 3);
      const r = 0.3 + m * 1.3;
      const tint = rand();
      const col = tint < 0.15 ? "255, 220, 190" : tint < 0.35 ? "190, 215, 255" : "235, 240, 248";
      ctx.fillStyle = `rgba(${col}, ${0.25 + m * 0.75})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (m > 0.55) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
        g.addColorStop(0, `rgba(${col}, 0.25)`);
        g.addColorStop(1, `rgba(${col}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
      }
    }
  }

  let t;
  draw();
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(draw, 150);
  });
})();
