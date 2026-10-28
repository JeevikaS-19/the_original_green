(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canObserve = "IntersectionObserver" in window;

  // ---- Reveal on scroll ----
  var reveals = document.querySelectorAll(".reveal");
  if (canObserve && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        io.unobserve(e.target);
        if (e.target.id === "hero-mock") fillBars();
      });
    }, { threshold: 0.15 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
    fillBars();
  }

  function fillBars() {
    document.querySelectorAll(".mock-stack span[data-w]").forEach(function (b) {
      b.style.width = b.getAttribute("data-w") + "%";
    });
  }

  // ---- Scroll-driven effects, one rAF per frame ----
  var nav = document.getElementById("nav");
  var bar = document.getElementById("progress");
  var mock = document.getElementById("hero-mock");
  var hs = document.getElementById("gap");
  var track = document.getElementById("hs-track");
  var hsI = document.getElementById("hs-i");
  var steps = document.getElementById("steps");
  var fill = document.getElementById("steps-fill");
  var stepEls = document.querySelectorAll(".step");
  var ticking = false;

  function clamp(v) { return Math.max(0, Math.min(1, v)); }

  function update() {
    ticking = false;
    var y = window.scrollY, vh = window.innerHeight;
    nav.classList.toggle("scrolled", y > 12);
    var max = document.documentElement.scrollHeight - vh;
    bar.style.width = (max > 0 ? (y / max) * 100 : 0) + "%";
    if (reduce) return;

    // Hero mock flattens out as it scrolls up
    if (mock) {
      var p = clamp(1 - mock.getBoundingClientRect().top / vh);
      mock.style.setProperty("--tilt", (14 * (1 - p)).toFixed(2) + "deg");
      mock.style.setProperty("--sc", (0.94 + 0.06 * p).toFixed(3));
    }

    // Pinned section: vertical scroll drives the horizontal track
    if (hs && track) {
      var r = hs.getBoundingClientRect();
      var hp = clamp(-r.top / (r.height - vh));
      var dist = track.scrollWidth - window.innerWidth;
      track.style.transform = "translate3d(" + (-hp * Math.max(0, dist)) + "px,0,0)";
      var n = track.children.length;
      hsI.textContent = "0" + Math.min(n, 1 + Math.floor(hp * n * 0.999));
    }

    // Steps: the line fills and each step lights as it passes the middle
    if (steps) {
      var sr = steps.getBoundingClientRect();
      fill.style.height = (clamp((vh * 0.55 - sr.top) / sr.height) * 100) + "%";
      stepEls.forEach(function (s) {
        s.classList.toggle("on", s.getBoundingClientRect().top < vh * 0.6);
      });
    }
  }

  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();
})();
