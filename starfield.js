// Realistic night-sky background, drawn at the screen's native resolution:
// power-law star brightnesses, temperature-based colours, and a faint,
// clumpy Milky Way band with dark dust lanes.
(function () {
  const canvas = document.createElement("canvas");
  canvas.className = "starfield";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const ctx = canvas.getContext("2d");

  let seed;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  // Star colours by spectral type, desaturated as the eye sees them,
  // weighted roughly by how common they are among visible stars.
  const COLOURS = [
    [0.08, [170, 191, 255]], // O/B blue-white
    [0.22, [202, 216, 255]], // A white-blue
    [0.30, [248, 247, 255]], // F white
    [0.22, [255, 244, 234]], // G yellow-white
    [0.13, [255, 222, 190]], // K pale orange
    [0.05, [255, 196, 150]], // M orange
  ];
  function starColour() {
    let r = rand();
    for (const [p, c] of COLOURS) {
      if ((r -= p) <= 0) return c;
    }
    return COLOURS[2][1];
  }

  // Soft round sprite for diffuse glow and dust.
  function blobSprite(rgb) {
    const s = document.createElement("canvas");
    s.width = s.height = 64;
    const c = s.getContext("2d");
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, `rgba(${rgb}, 1)`);
    g.addColorStop(0.4, `rgba(${rgb}, 0.45)`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    return s;
  }
  const GLOW = blobSprite("200, 210, 235");
  const WARM = blobSprite("235, 215, 190");
  const DUST = blobSprite("3, 7, 13");

  let drawnWidth = 0;

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = window.innerWidth;
    // The canvas is sized in CSS to the largest viewport height (100lvh),
    // so mobile URL-bar changes don't force a redraw.
    const h = canvas.getBoundingClientRect().height || window.innerHeight;
    drawnWidth = w;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const W = canvas.width, H = canvas.height;
    seed = 20261117;

    // Sky: near black, slightly bluer towards the top.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#060d18");
    sky.addColorStop(1, "#02050a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Milky Way: a band crossing diagonally, gently curved.
    const ax = -0.1 * W, ay = 0.95 * H, bx = 1.1 * W, by = 0.05 * H;
    const len = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / len, uy = (by - ay) / len; // along band
    const nx = -uy, ny = ux; // across band
    const width = 0.11 * Math.hypot(W, H);
    const bandPoint = (spread) => {
      const t = rand();
      const bend = Math.sin(t * Math.PI) * 0.06 * len;
      const off = gauss() * width * spread + bend;
      return [ax + ux * t * len + nx * off, ay + uy * t * len + ny * off, t];
    };

    // Diffuse glow from unresolved stars, built from clumps.
    ctx.globalCompositeOperation = "lighter";
    const clumps = 260;
    for (let i = 0; i < clumps; i++) {
      const [cx, cy, t] = bandPoint(0.55);
      const brightness = 0.6 + 0.8 * Math.exp(-Math.pow((t - 0.55) / 0.22, 2));
      const n = 6 + Math.floor(rand() * 10);
      for (let j = 0; j < n; j++) {
        const r = (0.02 + rand() * 0.06) * width * 2.4;
        const x = cx + gauss() * width * 0.25;
        const y = cy + gauss() * width * 0.25;
        ctx.globalAlpha = (0.01 + rand() * 0.018) * brightness;
        ctx.drawImage(rand() < 0.3 ? WARM : GLOW, x - r, y - r, r * 2, r * 2);
      }
    }

    // Dark dust lanes running along the band.
    ctx.globalCompositeOperation = "source-over";
    for (let i = 0; i < 900; i++) {
      const t = rand();
      const lane = Math.sin(t * 9 + 1.3) * 0.18 * width + Math.sin(t * Math.PI) * 0.06 * len;
      const x = ax + ux * t * len + nx * (lane + gauss() * width * 0.12);
      const y = ay + uy * t * len + ny * (lane + gauss() * width * 0.12);
      const r = (0.03 + rand() * 0.07) * width;
      ctx.globalAlpha = 0.05 + rand() * 0.08;
      ctx.drawImage(DUST, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;

    // Stars. Counts scale with CSS-pixel area so density looks the same
    // on every screen. Brightness follows a steep power law: most stars
    // are at the edge of visibility, very few are bright.
    const area = w * h;
    const fieldStars = Math.round(area / 900);
    const bandStars = Math.round(area / 450);

    function star(x, y, faintBias) {
      const L = Math.pow(rand(), 10 + faintBias); // 0..1, heavily skewed faint
      const [r, g, b] = starColour();
      if (L < 0.02) {
        // Faint: a single device pixel.
        ctx.fillStyle = `rgba(${r},${g},${b},${0.08 + L * 14})`;
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
        return;
      }
      const core = (0.35 + Math.sqrt(L) * 0.9) * dpr;
      if (L > 0.35) {
        // Bright: soft halo from atmospheric and optical scatter.
        const halo = core * (5 + L * 6);
        const g2 = ctx.createRadialGradient(x, y, 0, x, y, halo);
        g2.addColorStop(0, `rgba(${r},${g},${b},${0.22 * L + 0.05})`);
        g2.addColorStop(0.25, `rgba(${r},${g},${b},${0.05 * L})`);
        g2.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = g2;
        ctx.fillRect(x - halo, y - halo, halo * 2, halo * 2);
      }
      ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, 0.3 + L)})`;
      ctx.beginPath();
      ctx.arc(x, y, core, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < fieldStars; i++) star(rand() * W, rand() * H, 0);
    // Extra, mostly faint stars concentrated in the band.
    for (let i = 0; i < bandStars; i++) {
      const [x, y] = bandPoint(0.45);
      star(x, y, 3);
    }
  }

  draw();
  let t;
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (window.innerWidth !== drawnWidth) draw();
    }, 150);
  });
})();
