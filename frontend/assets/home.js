(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canObserve = "IntersectionObserver" in window;
  var $ = function (id) { return document.getElementById(id); };

  // ---- Reveal on scroll ----
  var reveals = document.querySelectorAll(".reveal");
  if (canObserve && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        io.unobserve(e.target);
      });
    }, { threshold: 0.15 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // ---- Hero phones: the spotlight moves Individual → Small → Large ----
  var phones = document.querySelectorAll(".phone");
  var phoneI = 1;
  function showPhone(i) {
    phoneI = (i + phones.length) % phones.length;
    phones.forEach(function (p, n) { p.classList.toggle("on", n === phoneI); });
  }
  showPhone(1);
  var phoneTimer = reduce ? null : setInterval(function () { showPhone(phoneI + 1); }, 3200);
  phones.forEach(function (p, n) {
    p.addEventListener("mouseenter", function () { clearInterval(phoneTimer); showPhone(n); });
  });

  // ---- Comparison rows open on tap (hover is CSS) ----
  document.querySelectorAll(".crow:not(.chead)").forEach(function (row) {
    row.addEventListener("click", function () { row.classList.toggle("open"); });
    row.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); row.classList.toggle("open"); }
    });
  });

  // ---- Case study carousel: tabs, arrow keys and swipe ----
  var tabs = document.querySelectorAll("#case-tabs button");
  var track = $("case-track");
  var ind = $("tab-ind");
  var caseI = 0;
  function showCase(i) {
    caseI = (i + tabs.length) % tabs.length;
    track.style.transform = "translateX(" + (-100 * caseI) + "%)";
    tabs.forEach(function (t, n) {
      t.setAttribute("aria-selected", String(n === caseI));
      t.tabIndex = n === caseI ? 0 : -1;
    });
    var t = tabs[caseI];
    ind.style.width = t.offsetWidth + "px";
    ind.style.transform = "translateX(" + t.offsetLeft + "px)";
  }
  tabs.forEach(function (t, n) {
    t.addEventListener("click", function () { showCase(n); });
    t.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { showCase(caseI + 1); tabs[caseI].focus(); }
      if (e.key === "ArrowLeft") { showCase(caseI - 1); tabs[caseI].focus(); }
    });
  });
  var startX = null;
  $("case-view").addEventListener("pointerdown", function (e) { startX = e.clientX; });
  $("case-view").addEventListener("pointerup", function (e) {
    if (startX === null) return;
    var dx = e.clientX - startX;
    if (Math.abs(dx) > 50) showCase(caseI + (dx < 0 ? 1 : -1));
    startX = null;
  });
  showCase(0);
  window.addEventListener("resize", function () { showCase(caseI); });

  // ---- Scroll: nav, progress bar and the layer in focus ----
  var nav = $("nav"), bar = $("progress");
  var layers = document.querySelectorAll(".layer");
  var ticking = false;
  function update() {
    ticking = false;
    var y = window.scrollY, vh = window.innerHeight;
    nav.classList.toggle("scrolled", y > 12);
    var max = document.documentElement.scrollHeight - vh;
    bar.style.width = (max > 0 ? (y / max) * 100 : 0) + "%";
    layers.forEach(function (l) {
      var r = l.getBoundingClientRect();
      if (reduce || r.top < vh * 0.7) l.classList.add("on");
    });
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();
