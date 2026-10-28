(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canObserve = "IntersectionObserver" in window;
  var ALL = window.DEMO_FIXTURES || [];

  function byId(id) { return ALL.filter(function (p) { return p.id === id; })[0]; }
  function fmtTons(v) {
    return Number(v).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  // ---- Scroll progress and nav ----
  var progress = document.getElementById("progress");
  window.addEventListener("scroll", function () {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + "%";
  }, { passive: true });

  // ---- Reveal on scroll ----
  var reveals = document.querySelectorAll(".reveal");
  if (canObserve && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // ---- Hero card: the small-scale demo, from the pipeline output ----
  var small = byId("small_scale");
  if (small) {
    var path = small.paths.open_source;
    document.getElementById("hero-total").textContent = fmtTons(path.total.tons);
    document.getElementById("hero-grade").textContent = path.grade;
    document.getElementById("hero-conf").textContent = path.scopes[0].confidence + " on Scope 1";
    var total = path.total.tons || 1;
    var widths = path.scopes.map(function (s) { return (s.tons / total) * 100; });
    var bars = document.querySelectorAll(".hc-bars span");
    bars.forEach(function (bar, i) {
      if (widths[i] !== undefined) bar.style.setProperty("--w", widths[i].toFixed(1) + "%");
    });
  }

  // ---- Comparison table: methodology shown on hover and focus ----
  var line = document.getElementById("method-line");
  var rows = document.querySelectorAll(".cmp tbody tr[data-method]");
  function showMethod(row) {
    var label = row.querySelector("th").textContent;
    line.innerHTML = "<strong>" + label + ":</strong> " + row.getAttribute("data-method");
  }
  rows.forEach(function (row) {
    row.addEventListener("mouseenter", function () { showMethod(row); });
    row.addEventListener("focus", function () { showMethod(row); });
  });

  // ---- Layer tabs ----
  var tabs = document.querySelectorAll(".tab[data-tab]");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var n = tab.getAttribute("data-tab");
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", String(on));
      });
      document.querySelectorAll(".panel").forEach(function (panel) {
        panel.hidden = panel.id !== "layer-" + n;
      });
    });
  });
})();
