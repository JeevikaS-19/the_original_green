// Full-screen flood: the screen is the container. Water level = share of today's emissions.
// Plain canvas, no library. Respects reduced motion by drawing the final state at once.
(function () {
  "use strict";

  var root = null, canvas = null, ctx = null, frame = 0;
  var level = 0, from = 0, to = 0, start = 0, dur = 1, running = false;
  var particles = [], bubbles = [];
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function ease(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }

  function size() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ensure() {
    if (root) return true;
    if (!document.body) return false;
    root = document.createElement("div");
    root.id = "flood";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Water level shows emissions. Full screen is today's total.");
    root.innerHTML = '<canvas aria-hidden="true"></canvas>' +
      '<div class="flood-label"><p class="flood-kicker" id="flood-title"></p><p class="flood-value" id="flood-value"></p><p class="flood-sub" id="flood-sub"></p></div>' +
      '<button type="button" class="flood-close">Close</button>';
    document.body.appendChild(root);
    canvas = root.querySelector("canvas");
    ctx = canvas.getContext ? canvas.getContext("2d") : null;
    root.querySelector(".flood-close").addEventListener("click", hide);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") hide(); });
    window.addEventListener("resize", function () { if (ctx) size(); });
    if (ctx) size();
    return true;
  }

  function hide() {
    if (!root) return;
    root.classList.remove("on");
    running = false;
    cancelAnimationFrame(frame);
  }

  function label(title, value, sub) {
    document.getElementById("flood-title").textContent = title;
    document.getElementById("flood-value").textContent = value;
    document.getElementById("flood-sub").textContent = sub;
  }

  function draw(now) {
    var W = window.innerWidth, H = window.innerHeight;
    ctx.clearRect(0, 0, W, H);
    var surface = H * (1 - level);
    var t = now / 1000;

    // Smoke rises from the floor; more of it the higher the level.
    if (level > 0.02 && particles.length < 160) {
      for (var i = 0; i < 1 + level * 3; i++) {
        particles.push({ x: Math.random() * W, y: H + 20, r: 30 + Math.random() * 40, a: 0.35 + Math.random() * 0.2, vx: (Math.random() - 0.5) * 0.4, vy: -0.6 - Math.random() * 0.8 });
      }
    }
    particles = particles.filter(function (p) {
      p.x += p.vx + Math.sin((p.y + t * 40) / 60) * 0.2; p.y += p.vy; p.r += 0.35; p.a *= 0.996;
      if (p.a < 0.01 || p.y < -p.r) return false;
      var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, "rgba(70,70,64," + p.a.toFixed(3) + ")");
      g.addColorStop(1, "rgba(70,70,64,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      return true;
    });

    if (level > 0) {
      // Translucent water: three layered waves, each a little different.
      var layers = [
        { c: "rgba(78,90,54,0.42)", amp: 14, k: 0.011, w: 1.4, ph: 0 },
        { c: "rgba(138,112,98,0.30)", amp: 10, k: 0.017, w: -1.0, ph: 2.1 },
        { c: "rgba(185,196,160,0.26)", amp: 7, k: 0.024, w: 1.9, ph: 4.2 }
      ];
      layers.forEach(function (L) {
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (var x = 0; x <= W; x += 12) {
          var y = surface + Math.sin(x * L.k + t * L.w + L.ph) * L.amp + Math.sin(x * L.k * 0.4 - t * 0.7) * L.amp * 0.5;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fillStyle = L.c;
        ctx.fill();
      });
      // Surface highlight.
      ctx.beginPath();
      for (var xs = 0; xs <= W; xs += 12) {
        var ys = surface + Math.sin(xs * 0.011 + t * 1.4) * 14;
        if (xs === 0) ctx.moveTo(xs, ys); else ctx.lineTo(xs, ys);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 2;
      ctx.stroke();
      // Bubbles rising through the water.
      if (bubbles.length < 60 && Math.random() < 0.3 + level * 0.4) {
        bubbles.push({ x: Math.random() * W, y: H + 10, r: 2 + Math.random() * 5, s: 0.6 + Math.random() * 1.2 });
      }
      bubbles = bubbles.filter(function (b) {
        b.y -= b.s;
        if (b.y < surface + 12 || b.y < 0) return false;
        ctx.beginPath(); ctx.arc(b.x + Math.sin(b.y / 30) * 4, b.y, b.r, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1; ctx.stroke();
        return true;
      });
    }
  }

  function tick(now) {
    if (!running) return;
    if (start === null) start = now;
    var k = Math.min(1, (now - start) / dur);
    level = from + (to - from) * ease(k);
    if (ctx) draw(now);
    if (k < 1) frame = requestAnimationFrame(tick);
    else { running = false; level = to; if (ctx) draw(now); }
  }

  // Animate the water from its current level to `target` over `ms`.
  function go(target, ms, title, value, sub) {
    if (!ensure()) return;
    root.classList.add("on");
    label(title, value, sub);
    target = Math.max(0, Math.min(1, target));
    if (reduce || !ctx) {
      level = target; from = to = target;
      if (ctx) draw(performance.now());
      return;
    }
    cancelAnimationFrame(frame);
    from = level; to = target; dur = Math.max(200, ms);
    start = null;
    running = true;
    frame = requestAnimationFrame(tick);
  }

  // Start from empty (no water) and flood to `target`.
  function reset() { level = 0; from = to = 0; particles = []; bubbles = []; }

  function setLevel(v) { level = from = to = Math.max(0, Math.min(1, v)); }
  function isOn() { return !!root && root.classList.contains("on"); }

  window.Flood = { go: go, reset: reset, hide: hide, setLevel: setLevel, isOn: isOn, getLevel: function () { return level; } };
})();
