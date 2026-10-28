(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canObserve = "IntersectionObserver" in window;

  // ---- Nav and progress ----
  var nav = document.getElementById("nav");
  var bar = document.getElementById("progress");
  function onScroll() {
    nav.classList.toggle("scrolled", window.scrollY > 12);
    var max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + "%";
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ---- Reveal on scroll ----
  var reveals = document.querySelectorAll(".reveal");
  if (canObserve && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
          fillBars(e.target);
        }
      });
    }, { threshold: 0.15 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // ---- Mock bars fill in once visible ----
  function fillBars(scope) {
    var bars = scope.querySelectorAll ? scope.querySelectorAll(".mock-stack span[data-w]") : [];
    bars.forEach(function (b) { b.style.width = b.getAttribute("data-w") + "%"; });
  }
  if (!canObserve || reduce) fillBars(document);
  else {
    var mock = document.querySelector(".mock");
    if (mock) {
      var mo = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { fillBars(document); mo.disconnect(); } });
      }, { threshold: 0.4 });
      mo.observe(mock);
    }
  }

  // ---- Problem cards: expand on click, keyboard too ----
  document.querySelectorAll(".p-card").forEach(function (card) {
    function toggle() {
      var open = card.getAttribute("aria-expanded") === "true";
      card.setAttribute("aria-expanded", String(!open));
    }
    card.addEventListener("click", toggle);
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
  });

  // ---- Comparison table: a row selects its method ----
  var rows = document.querySelectorAll("#cmp tbody tr[data-m]");
  var mk = document.getElementById("m-k");
  var mm = document.getElementById("m-m");
  var mv = document.getElementById("m-v");
  function select(row) {
    rows.forEach(function (r) { r.classList.toggle("active", r === row); });
    mk.textContent = row.getAttribute("data-k");
    mm.textContent = row.getAttribute("data-m");
    mv.textContent = row.getAttribute("data-v");
  }
  rows.forEach(function (row) {
    row.addEventListener("click", function () { select(row); });
    row.addEventListener("mouseenter", function () { select(row); });
    row.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(row); }
    });
  });

  // ---- Flow: steps light up in turn as the section comes into view ----
  var flow = document.getElementById("flow-track");
  var steps = document.querySelectorAll(".f-step");
  if (flow && canObserve && !reduce) {
    var fo = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        flow.classList.add("in");
        steps.forEach(function (s, i) {
          setTimeout(function () { s.classList.add("lit"); }, 350 + i * 450);
        });
        fo.disconnect();
      });
    }, { threshold: 0.35 });
    fo.observe(flow);
  } else {
    flow && flow.classList.add("in");
    steps.forEach(function (s) { s.classList.add("lit"); });
  }

  // ---- Method tabs with a sliding indicator ----
  var seg = document.querySelector(".seg");
  var ind = document.getElementById("seg-ind");
  var tabs = document.querySelectorAll(".seg .tab");
  function placeIndicator(tab) {
    if (!ind || !tab) return;
    ind.style.width = tab.offsetWidth + "px";
    ind.style.transform = "translateX(" + tab.offsetLeft + "px)";
  }
  function showLayer(n) {
    tabs.forEach(function (t) { t.setAttribute("aria-selected", String(t.getAttribute("data-tab") === n)); });
    [1, 2, 3].forEach(function (i) {
      var panel = document.getElementById("layer-" + i);
      if (!panel) return;
      var on = String(i) === n;
      if (on && panel.hidden) {
        panel.hidden = false;
        panel.classList.remove("anim");
        void panel.offsetWidth;
        panel.classList.add("anim");
      } else if (!on) {
        panel.hidden = true;
      }
    });
    placeIndicator(document.querySelector('.seg .tab[data-tab="' + n + '"]'));
  }
  tabs.forEach(function (t) {
    t.addEventListener("click", function () { showLayer(t.getAttribute("data-tab")); });
  });
  if (seg) {
    placeIndicator(document.querySelector('.seg .tab[aria-selected="true"]'));
    window.addEventListener("resize", function () {
      placeIndicator(document.querySelector('.seg .tab[aria-selected="true"]'));
    });
  }
})();
