(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var FIXTURES = window.DEMO_FIXTURES || [];

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtTons(value) {
    return Number(value).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " t";
  }

  function fmtInr(value) {
    return "₹" + Math.round(value).toLocaleString("en-IN");
  }

  // ---- Nav shadow and scroll progress ----
  var nav = document.getElementById("nav");
  var progress = document.getElementById("progress");

  function onScroll() {
    var y = window.scrollY;
    nav.classList.toggle("scrolled", y > 24);
    var max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = (max > 0 ? (y / max) * 100 : 0) + "%";
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ---- Reveal on scroll ----
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    reveals.forEach(function (el) { revealObserver.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // ---- Count-up for the stats strip, values taken from the pipeline fixtures ----
  var openPaths = FIXTURES.map(function (p) { return p.paths.open_source; }).filter(Boolean);
  var actionCount = openPaths.reduce(function (most, p) { return Math.max(most, p.actions.length); }, 0);
  var targets = {
    "4": FIXTURES.length,
    "3": 3,
    "2": 2,
    "5": actionCount
  };

  function countUp(el, to) {
    if (reduceMotion) { el.textContent = to; return; }
    var start = null;
    var duration = 1100;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / duration);
      el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var statObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      countUp(el, targets[el.getAttribute("data-count")] || 0);
      statObserver.unobserve(el);
    });
  }, { threshold: 0.6 });
  document.querySelectorAll("[data-count]").forEach(function (el) {
    if ("IntersectionObserver" in window) statObserver.observe(el);
    else el.textContent = targets[el.getAttribute("data-count")];
  });

  // ---- Pinned steps: the active step lights up and the visual follows ----
  var steps = Array.prototype.slice.call(document.querySelectorAll(".pin-step"));
  var pinBig = document.getElementById("pin-big");

  function setActive(step) {
    steps.forEach(function (s) { s.classList.toggle("active", s === step); });
    if (pinBig && step) {
      pinBig.innerHTML = esc(step.getAttribute("data-visual")) +
        "<small>" + esc(step.getAttribute("data-text")) + "</small>";
    }
  }

  if ("IntersectionObserver" in window && steps.length) {
    var stepObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setActive(entry.target);
      });
    }, { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach(function (s) { stepObserver.observe(s); });
  }
  setActive(steps[0]);

  // ---- Persona switcher, built from the pipeline fixtures ----
  var tabs = document.getElementById("tabs");
  var panels = document.getElementById("persona-panels");

  function personaPanel(profile, index) {
    var path = profile.paths.open_source || profile.paths.closed_source;
    var maxTons = Math.max.apply(null, path.scopes.map(function (s) { return s.tons; }).concat([0.0001]));
    var bars = path.scopes.map(function (scope) {
      var width = (scope.tons / maxTons) * 100;
      return '<div class="bar-row"><span>' + esc(scope.id.replace("scope_", "Scope ")) +
        '</span><div class="bar-track"><div class="bar-fill" data-width="' + width.toFixed(1) +
        '"></div></div><strong>' + fmtTons(scope.tons) + '</strong></div>';
    }).join("");
    var top = path.actions[0];
    return '<div class="persona' + (index === 0 ? " show" : "") + '" role="tabpanel" id="panel-' + esc(profile.id) + '">' +
      '<dl class="persona-facts">' +
      '<dt>' + esc(profile.sublabel) + '</dt><dd>' + esc(profile.label) + '</dd>' +
      '<dt>Total footprint</dt><dd>' + fmtTons(path.total.tons) + ' CO₂e a year</dd>' +
      '<dt>Range</dt><dd>' + fmtTons(path.total.low) + ' to ' + fmtTons(path.total.high) + '</dd>' +
      '<dt>Grade</dt><dd><span class="grade-pill">' + esc(path.grade) + '</span></dd>' +
      '</dl>' +
      '<div><p class="lede" style="margin-bottom:18px">' + esc(profile.description) + '</p>' +
      '<div class="bars">' + bars + '</div>' +
      (top ? '<p style="margin-top:22px"><strong>Top action:</strong> ' + esc(top.action) + ', saves ' +
        fmtTons(top.tons) + ' a year for ' + fmtInr(top.cost_inr) + '.</p>' : '<p style="margin-top:22px;color:var(--muted)">No reduction action applies at this scale yet.</p>') +
      '<p><a class="btn btn-small" href="demo.html#' + esc(profile.id) + '/open/0">Open this in the demo</a></p>' +
      '</div></div>';
  }

  if (FIXTURES.length) {
    tabs.innerHTML = FIXTURES.map(function (p, i) {
      return '<button class="tab" role="tab" aria-selected="' + (i === 0) + '" aria-controls="panel-' +
        esc(p.id) + '" data-index="' + i + '">' + esc(p.label) + '</button>';
    }).join("");
    panels.innerHTML = FIXTURES.map(personaPanel).join("");

    tabs.addEventListener("click", function (event) {
      var tab = event.target.closest("button[data-index]");
      if (!tab) return;
      var index = Number(tab.getAttribute("data-index"));
      Array.prototype.forEach.call(tabs.querySelectorAll(".tab"), function (t, i) {
        t.setAttribute("aria-selected", String(i === index));
      });
      Array.prototype.forEach.call(panels.querySelectorAll(".persona"), function (panel, i) {
        var show = i === index;
        panel.classList.toggle("show", show);
        if (show) {
          panel.querySelectorAll(".bar-fill").forEach(function (bar) {
            bar.style.width = bar.getAttribute("data-width") + "%";
          });
        }
      });
    });

    // Fill the first panel's bars once it is visible.
    var first = panels.querySelector(".persona.show");
    if (first && "IntersectionObserver" in window) {
      var barObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.querySelectorAll(".bar-fill").forEach(function (bar) {
            bar.style.width = bar.getAttribute("data-width") + "%";
          });
          barObserver.disconnect();
        });
      }, { threshold: 0.3 });
      barObserver.observe(first);
    } else if (first) {
      first.querySelectorAll(".bar-fill").forEach(function (bar) {
        bar.style.width = bar.getAttribute("data-width") + "%";
      });
    }
  }

  // ---- Scenario slider: small-scale open path, same grade bands as the report ----
  var small = FIXTURES.filter(function (p) { return p.id === "small_scale"; })[0];
  var cut = document.getElementById("cut");
  if (small && cut) {
    var path = small.paths.open_source;
    var scope1 = path.scopes.filter(function (s) { return s.id === "scope_1"; })[0];
    var total = path.total.tons;

    function gradeFor(tons) {
      var bands = path.grade_bands;
      for (var i = 0; i < bands.length; i++) {
        var b = bands[i];
        if (tons >= b.from && (b.to === null || tons < b.to)) return b.grade;
      }
      return bands[bands.length - 1].grade;
    }

    function updateScenario() {
      var pct = Number(cut.value);
      document.getElementById("cut-out").textContent = pct + "%";
      var after = Math.max(0, total - scope1.tons * pct / 100);
      document.getElementById("sc-now").textContent = fmtTons(total);
      document.getElementById("sc-after").textContent = fmtTons(after);
      document.getElementById("sc-grade-now").textContent = gradeFor(total);
      document.getElementById("sc-grade-after").textContent = gradeFor(after);
    }
    cut.addEventListener("input", updateScenario);
    updateScenario();
  }
})();
