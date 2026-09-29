/* Drayvenn midnight neural canvas - adapted from the rajat-kumar-pradhan.pages.dev "neural coast".
   Nodes + bezier coast lines + proximity links + pointer links, mint-on-midnight, GPU-free 2D canvas. */
(function () {
  const cv = document.getElementById('neural-bg');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, tick = 0, raf = 0;
  const nodes = [];
  const mouse = { x: -1000, y: -1000 };

  function resize() {
    const r = cv.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nodes.length = 0;
    const n = Math.min(64, Math.max(24, Math.round(W * H / 22000)));
    for (let i = 0; i < n; i++) nodes.push({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - .5) * .42, vy: (Math.random() - .5) * .3,
      r: 1 + Math.random() * 1.6
    });
  }
  function onMove(e) { const r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; }
  function onOut() { mouse.x = -1000; mouse.y = -1000; }

  function frame() {
    ctx.clearRect(0, 0, W, H);
    tick++;
    const t = tick * .011;
    // coast lines
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
      const dm = Math.hypot(n.x - mouse.x, n.y - mouse.y);
      if (dm < 160) {
        ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(mouse.x, mouse.y);
        ctx.strokeStyle = 'rgba(170,255,220,' + ((1 - dm / 160) * .25) + ')';
        ctx.lineWidth = .7; ctx.stroke();
      }
      for (let j = i + 1; j < nodes.length; j++) {
        const o = nodes[j];
        const d = Math.hypot(n.x - o.x, n.y - o.y);
        if (d < 140) {
          ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(o.x, o.y);
          ctx.strokeStyle = 'rgba(133,241,222,' + ((1 - d / 140) * .26) + ')';
          ctx.lineWidth = .65; ctx.stroke();
        }
      }
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 8);
      g.addColorStop(0, 'rgba(181,255,221,.5)');
      g.addColorStop(.35, 'rgba(98,230,221,.15)');
      g.addColorStop(1, 'rgba(98,230,221,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c3fff0'; ctx.globalAlpha = .45;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (!reduced) raf = requestAnimationFrame(frame);
  }

  resize();
  frame(); // reduced-motion: draws exactly one static frame
  new ResizeObserver(() => { resize(); if (reduced) frame(); }).observe(cv);
  if (!reduced) {
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerout', onOut);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
    });
  }
})();
