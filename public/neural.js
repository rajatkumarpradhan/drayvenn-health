/* Drayvenn midnight neural canvas - performance build.
   Same look, mobile-cheap: pre-rendered glow sprite (one radial gradient total,
   drawImage per node instead of one createRadialGradient per node per frame),
   squared-distance link checks, ~30fps cap, fewer nodes on small screens. */
(function () {
  const cv = document.getElementById('neural-bg');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, tick = 0, raf = 0;
  const nodes = [];
  const mouse = { x: -1000, y: -1000 };

  // Pre-rendered glow: one radial gradient for the whole animation.
  const SPRITE_R = 32;
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = SPRITE_R * 2;
  (function () {
    const s = sprite.getContext('2d');
    const g = s.createRadialGradient(SPRITE_R, SPRITE_R, 0, SPRITE_R, SPRITE_R, SPRITE_R);
    g.addColorStop(0, 'rgba(181,255,221,.5)');
    g.addColorStop(.35, 'rgba(98,230,221,.15)');
    g.addColorStop(1, 'rgba(98,230,221,0)');
    s.fillStyle = g;
    s.fillRect(0, 0, SPRITE_R * 2, SPRITE_R * 2);
  })();

  function resize() {
    const r = cv.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nodes.length = 0;
    const maxN = W < 500 ? 26 : 48;
    const n = Math.min(maxN, Math.max(18, Math.round(W * H / 30000)));
    for (let i = 0; i < n; i++) nodes.push({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - .5) * .84, vy: (Math.random() - .5) * .6,
      r: 1 + Math.random() * 1.6
    });
  }
  function onMove(e) { const r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; }
  function onOut() { mouse.x = -1000; mouse.y = -1000; }

  const LINK2 = 140 * 140, MOUSE2 = 160 * 160;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    tick++;
    const t = tick * .022;
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      const y = H * (.22 + i * .19);
      ctx.moveTo(0, y + 16 * Math.sin(t + i));
      ctx.bezierCurveTo(W * .27, y - 55, W * .62, y + 70, W, y - 12 * Math.sin(t * .75 + i));
      ctx.strokeStyle = 'rgba(117,229,219,' + (.06 + i * .012) + ')';
      ctx.stroke();
    }
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.x += n.vx; n.y += n.vy;
      if (n.x < 0 || n.x > W) n.vx *= -1;
      if (n.y < 0 || n.y > H) n.vy *= -1;
      const mdx = n.x - mouse.x, mdy = n.y - mouse.y;
      const dm2 = mdx * mdx + mdy * mdy;
      if (dm2 < MOUSE2) {
        const dm = Math.sqrt(dm2);
        ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(mouse.x, mouse.y);
        ctx.strokeStyle = 'rgba(170,255,220,' + ((1 - dm / 160) * .25) + ')';
        ctx.lineWidth = .7; ctx.stroke();
      }
      for (let j = i + 1; j < nodes.length; j++) {
        const o = nodes[j];
        const dx = n.x - o.x; if (dx > 140 || dx < -140) continue;
        const dy = n.y - o.y; if (dy > 140 || dy < -140) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 < LINK2) {
          const d = Math.sqrt(d2);
          ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(o.x, o.y);
          ctx.strokeStyle = 'rgba(133,241,222,' + ((1 - d / 140) * .26) + ')';
          ctx.lineWidth = .65; ctx.stroke();
        }
      }
      const sr = n.r * 8;
      ctx.drawImage(sprite, n.x - sr, n.y - sr, sr * 2, sr * 2);
      ctx.fillStyle = '#c3fff0'; ctx.globalAlpha = .45;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ~30fps: advance physics every other rAF so motion speed is unchanged.
  let frameParity = 0;
  function frame() {
    frameParity ^= 1;
    if (frameParity) draw();
    if (!reduced) raf = requestAnimationFrame(frame);
  }

  resize();
  draw(); // reduced-motion: draws exactly one static frame
  new ResizeObserver(() => { resize(); draw(); }).observe(cv);
  if (!reduced) {
    raf = requestAnimationFrame(frame);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerout', onOut);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
    });
  }
})();
