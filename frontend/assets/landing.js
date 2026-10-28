(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canObserve = "IntersectionObserver" in window;
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
  function byId(id) { return FIXTURES.filter(function (p) { return p.id === id; })[0]; }
  function openPath(profile) { return profile.paths.open_source; }
  function gradeFor(path, tons) {
    var bands = path.grade_bands;
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      if (tons >= b.from && (b.to === null || tons < b.to)) return b.grade;
    }
    return bands[bands.length - 1].grade;
  }

  // ---- Nav shadow and scroll progress ----
  var nav = document.getElementById("nav");
  var progress = document.getElementById("progress");
  function onScroll() {
    nav.classList.toggle("scrolled", window.scrollY > 16);
    var max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + "%";
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ---- Reveal on scroll ----
  var reveals = document.querySelectorAll(".reveal");
  if (canObserve && !reduceMotion) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { revealObserver.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // ---- Stat counters, values from the fixtures ----
  var actionMax = FIXTURES.reduce(function (most, p) {
    var path = openPath(p);
    return Math.max(most, path ? path.actions.length : 0);
  }, 0);
  var targets = { "4": FIXTURES.length, "3": 3, "2": 2, "5": actionMax };

  function countUp(el, to) {
    if (reduceMotion || !requestAnimationFrame) { el.textContent = to; return; }
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / 1000);
      el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var counters = document.querySelectorAll("[data-count]");
  if (canObserve && !reduceMotion) {
    var countObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        countUp(el, targets[el.getAttribute("data-count")] || 0);
        countObserver.unobserve(el);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { countObserver.observe(el); });
  } else {
    counters.forEach(function (el) { el.textContent = targets[el.getAttribute("data-count")] || 0; });
  }

  // ---- Stacked share chart in the hero visual ----
  var stack = document.getElementById("stack-chart");
  if (stack && FIXTURES.length) {
    var rows = FIXTURES.map(function (profile) {
      var path = openPath(profile) || profile.paths.closed_source;
      var total = path.total.tons || 1;
      var segments = path.scopes.map(function (scope, i) {
        var share = (scope.tons / total) * 100;
        return '<span class="s' + (i + 1) + '" data-w="' + share.toFixed(2) + '" style="width:0"></span>';
      }).join("");
      return '<div class="stack-row"><span class="name">' + esc(profile.label) + '</span>' +
        '<div class="stack">' + segments + '</div>' +
        '<span class="total">' + fmtTons(path.total.tons) + '</span></div>';
    }).join("");
    stack.innerHTML = rows;

    var fillStack = function () {
      stack.querySelectorAll("span[data-w]").forEach(function (span) {
        span.style.width = span.getAttribute("data-w") + "%";
      });
    };
    if (canObserve && !reduceMotion) {
      var stackObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { fillStack(); stackObserver.disconnect(); }
        });
      }, { threshold: 0.2 });
      stackObserver.observe(stack);
    } else {
      fillStack();
    }
  }

  // ---- Profiles side by side ----
  var head = document.getElementById("persona-head");
  var body = document.getElementById("persona-body");
  if (head && body && FIXTURES.length) {
    head.innerHTML = '<th scope="col"></th>' + FIXTURES.map(function (p) {
      return '<th scope="col">' + esc(p.label) + '<small style="display:block;font-weight:400;color:var(--muted)">' + esc(p.sublabel) + '</small></th>';
    }).join("");

    function row(label, cells) {
      return '<tr><th scope="row">' + esc(label) + '</th>' + cells.map(function (c) {
        return '<td class="num">' + c + '</td>';
      }).join("") + '</tr>';
    }
    var paths = FIXTURES.map(openPath);
    body.innerHTML = [
      row("Footprint, a year", paths.map(function (p) { return '<strong>' + fmtTons(p.total.tons) + '</strong>'; })),
      row("Range", paths.map(function (p) { return fmtTons(p.total.low) + ' to ' + fmtTons(p.total.high); })),
      row("Grade", paths.map(function (p) { return '<span class="grade">' + esc(p.grade) + '</span>'; })),
      row("Scope 1 · fuel", paths.map(function (p) { return fmtTons(p.scopes[0].tons); })),
      row("Scope 2 · electricity", paths.map(function (p) { return fmtTons(p.scopes[1].tons); })),
      row("Scope 3 · devices, commute, waste", paths.map(function (p) { return fmtTons(p.scopes[2].tons); })),
      row("Actions ranked", paths.map(function (p) { return String(p.actions.length); })),
      row("Top action", paths.map(function (p) {
        return p.actions.length ? esc(p.actions[0].action) : '<span class="muted">None at this scale yet</span>';
      }))
    ].join("");
  }

  // ---- Data paths: the same profile, two ranges ----
  var small = byId("small_scale");
  var rangeGrid = document.getElementById("range-grid");
  var quote = document.getElementById("path-quote");
  if (small && rangeGrid) {
    var open = small.paths.open_source;
    var closed = small.paths.closed_source;
    var max = Math.max(open.total.high, closed.total.high) * 1.08;
    function pos(tons) { return (tons / max) * 100; }
    function rangeRow(label, path, wide) {
      var left = pos(path.total.low);
      var width = pos(path.total.high) - left;
      return '<div class="range-row"><span>' + esc(label) + '</span><div>' +
        '<div class="range-track"><div class="range-band' + (wide ? ' wide' : '') + '" style="left:0%;width:0%" data-left="' +
        left.toFixed(2) + '" data-width="' + width.toFixed(2) + '"></div>' +
        '<div class="range-mid" style="left:' + pos(path.total.tons).toFixed(2) + '%"></div></div>' +
        '<div class="range-cap">' + fmtTons(path.total.low) + ' to ' + fmtTons(path.total.high) + ' · ' + esc(path.grade) + '</div>' +
        '</div></div>';
    }
    rangeGrid.innerHTML = rangeRow("Detailed exports", open, false) + rangeRow("Totals only", closed, true);
    if (quote) {
      quote.innerHTML = 'Same campus. Detailed exports give ' + esc(open.scopes[0].confidence) +
        ' on Scope 1; totals only give ' + esc(closed.scopes[0].confidence) + '.' +
        '<small>Demo figures, small-scale profile. Dark marker = the calculated total.</small>';
    }
    var fillRanges = function () {
      rangeGrid.querySelectorAll(".range-band").forEach(function (band) {
        band.style.left = band.getAttribute("data-left") + "%";
        band.style.width = band.getAttribute("data-width") + "%";
      });
    };
    if (canObserve && !reduceMotion) {
      var rangeObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { fillRanges(); rangeObserver.disconnect(); }
        });
      }, { threshold: 0.3 });
      rangeObserver.observe(rangeGrid);
    } else {
      fillRanges();
    }
  }

  // ---- Pinned steps: the active step lights up, and the progress dots follow ----
  var steps = Array.prototype.slice.call(document.querySelectorAll(".pin-step"));
  var pinBig = document.getElementById("pin-big");
  var dots = Array.prototype.slice.call(document.querySelectorAll(".pin .dots i"));
  function setActive(index) {
    steps.forEach(function (s, i) { s.classList.toggle("active", i === index); });
    dots.forEach(function (d, i) { d.classList.toggle("on", i === index); });
    if (pinBig && steps[index]) {
      pinBig.innerHTML = esc(steps[index].getAttribute("data-visual")) +
        "<small>" + esc(steps[index].getAttribute("data-text")) + "</small>";
    }
  }
  if (canObserve && steps.length) {
    var stepObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setActive(steps.indexOf(entry.target));
      });
    }, { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach(function (s) { stepObserver.observe(s); });
  }
  setActive(0);

  // ---- Scenario slider: small-scale open path, same grade bands as the report ----
  var cut = document.getElementById("cut");
  if (small && cut) {
    var path = openPath(small);
    var scope1 = path.scopes.filter(function (s) { return s.id === "scope_1"; })[0];
    var total = path.total.tons;
    function updateScenario() {
      var pct = Number(cut.value);
      document.getElementById("cut-out").textContent = pct + "%";
      var after = Math.max(0, total - scope1.tons * pct / 100);
      document.getElementById("sc-now").textContent = fmtTons(total);
      document.getElementById("sc-after").textContent = fmtTons(after);
      document.getElementById("sc-grade-now").textContent = gradeFor(path, total);
      document.getElementById("sc-grade-after").textContent = gradeFor(path, after);
    }
    cut.addEventListener("input", updateScenario);
    updateScenario();
  }
})();
