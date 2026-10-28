(function () {
  "use strict";

  var ALL = window.DEMO_FIXTURES || [];
  var SCALES = ["individual", "small_scale", "large_scale", "case_tcs", "case_infosys"];
  var SCALE_LABEL = {
    individual: "Individual", small_scale: "Small-scale campus", large_scale: "Large-scale enterprise",
    case_tcs: "TCS · FY 2025-26 (case study)", case_infosys: "Infosys · FY 2025-26 (case study)"
  };
  var VIEWS = ["overview", "scope_1", "scope_2", "scope_3", "estimates", "formulas", "reductions"];
  var VIEW_LABEL = {
    overview: "Overview", scope_1: "Scope 1 · Direct fuel", scope_2: "Scope 2 · Purchased power",
    scope_3: "Scope 3 · Value chain", estimates: "Estimates", formulas: "Formulas & sources", reductions: "Reductions"
  };
  var SCOPE_NAME = { scope_1: "Scope 1", scope_2: "Scope 2", scope_3: "Scope 3" };
  var SCOPE_CLASS = { scope_1: "c1", scope_2: "c2", scope_3: "c3" };
  var CONF_TEXT = { full_data: "Full data", partial_data: "Partial data", overview_only: "Overview only" };
  // Factors used by the calculator. Status mirrors person2 factors.py.
  var FACTORS = [
    { scope: "scope_1", name: "Diesel", value: "2.68 kg CO₂e / L", status: "sourced", source: "IPCC 2006 CO₂ default, converted per litre" },
    { scope: "scope_1", name: "Petrol", value: "2.29 kg CO₂e / L", status: "sourced", source: "IPCC 2006 CO₂ default, converted per litre" },
    { scope: "scope_1", name: "LPG", value: "1.61 kg CO₂e / L", status: "sourced", source: "IPCC 2006 CO₂ default, converted per litre" },
    { scope: "scope_2", name: "Grid electricity (India)", value: "0.757 kg CO₂e / kWh", status: "sourced", source: "CEA CO₂ baseline, combined margin FY 2023-24 (secondary report)" },
    { scope: "scope_3", name: "Laptop, embodied", value: "30 kg / device / yr", status: "illustrative", source: "Illustrative assumption" },
    { scope: "scope_3", name: "Desktop, embodied", value: "60 kg / device / yr", status: "illustrative", source: "Illustrative assumption" },
    { scope: "scope_3", name: "Server, embodied", value: "500 kg / device / yr", status: "illustrative", source: "Illustrative assumption" },
    { scope: "scope_3", name: "Commute · car / bus / bike", value: "0.15 / 0.05 / 0.01 kg / km", status: "illustrative", source: "Illustrative assumption" },
    { scope: "scope_3", name: "Waste · solid / e-waste", value: "0.5 / 3.0 kg / kg", status: "illustrative", source: "Illustrative assumption" },
    { scope: "scope_3", name: "Cloud GPU", value: "0.4 kg / hour", status: "illustrative", source: "Illustrative assumption" }
  ];
  var state = { scale: "small_scale", path: "open_source", view: "overview", picked: {} };

  var $ = function (id) { return document.getElementById(id); };
  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function t(v) { return Number(v).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " t"; }
  function inr(v) { return "₹" + Math.round(v).toLocaleString("en-IN"); }
  function profile() { return ALL.filter(function (p) { return p.id === state.scale; })[0] || ALL[0]; }
  function path() { return profile().paths[state.path] || profile().paths.open_source; }
  function scopeOf(id) { return path().scopes.filter(function (s) { return s.id === id; })[0]; }
  function estimatesFor(id) { return (profile().paths.open_source.intake.estimates[id] || []); }
  function gradeFor(bands, tons) {
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      if (tons >= b.from && (b.to === null || tons < b.to)) return b.grade;
    }
    return bands[bands.length - 1].grade;
  }
  function humanFactor(id) {
    var parts = id.replace("scope_3.", "").split(".");
    var name = parts.filter(function (p) { return p !== "factor" && p !== "embodied_carbon_factor"; })
      .map(function (p) { return p.replace(/_/g, " "); }).join(" · ");
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  // What kind of number each scope is.
  function scopeState(scope) {
    var p = profile();
    if (scope.tons === 0 && state.path === "closed_source") return "none";
    if (scope.id === "scope_3") {
      var ill = (path().illustrative || []).some(function (x) { return x.indexOf("scope_3") === 0; });
      return ill ? "illustrative" : estimatesFor("scope_3").length ? "estimated" : "measured";
    }
    return state.path === "closed_source" ? "totals" : "measured";
  }
  var TAG_TEXT = { measured: "Measured", estimated: "Estimated", illustrative: "Illustrative", sourced: "Sourced", totals: "Totals only", none: "Not calculated" };
  var TAG_CLASS = { measured: "measured", estimated: "estimated", illustrative: "illustrative", sourced: "measured", totals: "estimated", none: "none" };
  function tag(kind) { return '<span class="tag ' + TAG_CLASS[kind] + '">' + TAG_TEXT[kind] + '</span>'; }
  function initials(name) { return name.split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join("").toUpperCase(); }

  // ---- Sidebar ----
  function renderNav() {
    var sel = $("org-select");
    if (!sel.options.length) {
      sel.innerHTML = SCALES.map(function (s) { return '<option value="' + s + '">' + SCALE_LABEL[s] + '</option>'; }).join("");
    }
    sel.value = state.scale;
    document.querySelectorAll(".seg2 button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-path") === state.path));
    });
    document.querySelectorAll("#view-nav a").forEach(function (a) {
      if (a.getAttribute("data-view") === state.view) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    var pa = path();
    pa.scopes.forEach(function (s) {
      var n = document.querySelector('[data-n="' + s.id + '"]');
      if (n) n.textContent = s.tons ? Math.round(s.tons).toLocaleString("en-IN") + " t" : "–";
    });
    var est = 0;
    pa.scopes.forEach(function (s) { est += estimatesFor(s.id).length; });
    document.querySelector('[data-n="estimates"]').textContent = est + (pa.illustrative || []).length;
    document.querySelector('[data-n="reductions"]').textContent = pa.actions.length;
  }

  function renderHeader() {
    var p = profile();
    $("crumb").textContent = VIEW_LABEL[state.view];
    $("profile-title").textContent = p.label + " · " + p.sublabel;
    $("profile-sub").textContent = p.description;
    $("top-source").textContent = state.path === "closed_source" ? "Totals only" : "Detailed exports";
    document.querySelectorAll(".view").forEach(function (v) {
      v.classList.toggle("active", v.getAttribute("data-view") === state.view);
    });
  }

  // ---- Overview ----
  function renderOverview() {
    var p = profile(), pa = path();
    var total = pa.total.tons || 0;
    var half = total ? ((pa.total.high - pa.total.low) / 2 / total) * 100 : 0;
    var hi = pa.total.high || 1;
    $("summary-cards").innerHTML =
      '<div class="card dark"><div class="label">Total footprint</div><div class="value">' + t(total) +
        '</div><div class="sub">tCO₂e a year · range ' + t(pa.total.low) + ' to ' + t(pa.total.high) + '</div>' +
        '<div class="range"><div class="band" style="left:' + (pa.total.low / hi * 100).toFixed(1) + '%;width:' +
        ((pa.total.high - pa.total.low) / hi * 100).toFixed(1) + '%"></div><div class="mid" style="left:' + (total / hi * 100).toFixed(1) + '%"></div></div></div>' +
      '<div class="card"><div class="label">Grade</div><div class="value">' + esc(pa.grade) +
        '</div><div class="sub">Illustrative benchmark for ' + esc(p.label.toLowerCase()) + '</div></div>' +
      '<div class="card"><div class="label">Confidence</div><div class="value">±' + half.toFixed(0) +
        '%</div><div class="sub">Sum of each scope\'s own range</div></div>';

    $("split-bar").innerHTML = pa.scopes.map(function (s) {
      return '<i class="' + SCOPE_CLASS[s.id] + '" style="width:' + (total ? s.tons / total * 100 : 0).toFixed(1) + '%" title="' + SCOPE_NAME[s.id] + '"></i>';
    }).join("");
    $("confidence-explain").textContent = state.path === "closed_source"
      ? "Totals only: Scope 3 can't be calculated from consumption totals."
      : "Click a scope for its full report.";
    $("scope-tiles").innerHTML = pa.scopes.map(function (s) {
      var share = total ? (s.tons / total * 100).toFixed(0) + "%" : "–";
      return '<button class="tile" data-goto="' + s.id + '"><span class="nm"><i class="' + SCOPE_CLASS[s.id] + '"></i>' + esc(s.label) + '</span>' +
        '<strong>' + (s.tons ? t(s.tons) : "–") + '</strong><span class="muted small">' + share + ' of total · ' + esc(s.confidence) + '</span>' +
        '<span>' + tag(scopeState(s)) + '</span><span class="go">Open report →</span></button>';
    }).join("");

    var meta = p.paths.open_source.intake.confidence_metadata || {};
    $("quality").innerHTML = pa.scopes.map(function (s) {
      var q = state.path === "closed_source" ? "Totals only" : (CONF_TEXT[meta[s.id]] || "–");
      return '<li><span>' + SCOPE_NAME[s.id] + '</span><span class="muted">' + esc(q) + '</span><b>' + esc(s.confidence) + '</b></li>';
    }).join("") +
      '<li><span>Sources connected</span><b>' + pa.sources.length + '</b></li>';

    var a = pa.actions[0];
    $("top-action").innerHTML = a
      ? '<span class="ta-k">Best-value action</span><h3>' + esc(a.action) + '</h3><p class="muted">' + esc(a.description) + '</p>' +
        '<p style="margin-top:12px">Saves <b>' + t(a.tons) + '</b> a year for ' + inr(a.cost_inr) + '</p>' +
        '<a class="btn btn-small" href="#" data-goto="reductions">See all reductions →</a>'
      : '<span class="ta-k">Reductions</span><h3>No actions yet</h3><p class="muted">The knowledge base has no actions for this profile.</p>';
  }

  // ---- Scope report ----
  function renderScopeView(id) {
    var el = document.querySelector('.view[data-view="' + id + '"]');
    var pa = path(), s = scopeOf(id);
    if (!s) { el.innerHTML = ""; return; }
    var total = pa.total.tons || 0;
    var kind = scopeState(s);
    var srcs = pa.sources.filter(function (x) { return x.scope === id; });
    var max = Math.max.apply(null, s.drivers.map(function (d) { return d.tons; }).concat([0.0001]));
    var notes = estimatesFor(id).map(function (e) { return { k: "estimated", text: e }; });
    if (id === "scope_3") {
      (pa.illustrative || []).filter(function (x) { return x.indexOf("scope_3") === 0; })
        .forEach(function (x) { notes.push({ k: "illustrative", text: humanFactor(x) + " uses an illustrative factor" }); });
      if (state.path === "closed_source") notes.push({ k: "none", text: "Totals only: Scope 3 needs activity data, so it is not calculated." });
    }
    var acts = pa.actions.filter(function (a) { return a.scope === id; });
    var factors = FACTORS.filter(function (f) { return f.scope === id; });

    el.innerHTML =
      '<div class="scope-hero">' +
        '<div class="card dark"><div class="label">' + esc(s.label) + '</div><div class="value">' + (s.tons ? t(s.tons) : "–") +
          '</div><div class="sub">Range ' + t(s.low) + ' to ' + t(s.high) + '</div></div>' +
        '<div class="card"><div class="label">Data status</div><div style="margin-top:14px">' + tag(kind) + '</div><div class="sub">Confidence ' + esc(s.confidence) + '</div></div>' +
        '<div class="card"><div class="label">Share of total</div><div class="value">' + (total ? (s.tons / total * 100).toFixed(0) : 0) + '%</div><div class="sub">of ' + t(total) + '</div></div>' +
      '</div>' +
      '<div class="two">' +
        '<div class="dcard"><h2>Data from your trackers</h2><div class="src-list">' +
          (srcs.length ? srcs.map(function (x) {
            return '<div class="src"><span class="ico">' + esc(initials(x.tracker)) + '</span><div><strong>' + esc(x.tracker) + '</strong><span>' +
              esc(x.format) + ' · ' + esc(x.detail) + '</span></div>' + tag(state.path === "closed_source" ? "totals" : "measured") + '</div>';
          }).join("") : '<div class="empty">No tracker feeds this scope in this view.</div>') +
        '</div></div>' +
        '<div class="dcard" id="scope-panel"><h2>Breakdown</h2>' +
          (s.drivers.length ? s.drivers.map(function (d) {
            return '<div class="driver"><span>' + esc(d.name) + '</span><span class="num">' + t(d.tons) +
              '</span><div class="bar"><i style="width:' + (d.tons / max * 100).toFixed(1) + '%"></i></div></div>';
          }).join("") : '<div class="empty">Nothing calculated for this scope.</div>') +
        '</div>' +
      '</div>' +
      '<div class="dcard"><h2>How it was calculated</h2><div class="formula">Method: ' + esc(s.formula) + '</div>' +
        (factors.length ? '<div class="tbl-wrap" style="margin-top:14px"><table class="tbl"><thead><tr><th>Factor</th><th>Value</th><th>Status</th></tr></thead><tbody>' +
          factors.map(function (f) { return '<tr><td>' + esc(f.name) + '</td><td><code>' + esc(f.value) + '</code></td><td>' + tag(f.status) + '</td></tr>'; }).join("") +
          '</tbody></table></div>' : '') +
      '</div>' +
      (notes.length ? '<div class="dcard"><h2>Estimates and gaps</h2><ul class="quality">' +
        notes.map(function (n) { return '<li><span>' + esc(n.text) + '</span>' + tag(n.k) + '</li>'; }).join("") + '</ul></div>' : '') +
      '<div class="dcard"><div class="dcard-head"><h2>Reductions for this scope</h2><a class="small" href="#" data-goto="reductions">All reductions →</a></div>' +
        (acts.length ? '<ul class="quality">' + acts.map(function (a) {
          return '<li><span>' + esc(a.action) + '</span><span class="muted">' + inr(a.cost_inr) + '</span><b>−' + t(a.tons) + '</b></li>';
        }).join("") + '</ul>' : '<div class="empty">No actions target this scope yet.</div>') +
      '</div>';
  }

  // ---- Estimates (traceability) ----
  function renderEstimates() {
    var p = profile(), pa = path();
    var measured = pa.sources.map(function (s) { return esc(s.tracker) + " · " + esc(s.detail); });
    var estimated = [];
    Object.keys(p.paths.open_source.intake.estimates).forEach(function (k) {
      (p.paths.open_source.intake.estimates[k] || []).forEach(function (e) { estimated.push(esc(SCOPE_NAME[k] || k) + " · " + esc(e)); });
    });
    (pa.assumptions || []).forEach(function (a) { estimated.push(esc(typeof a === "string" ? a : JSON.stringify(a))); });
    var illustrative = (pa.illustrative || []).map(function (x) { return esc(humanFactor(x)); });
    function card(title, kind, items, empty) {
      return '<div class="trace"><span class="tag ' + TAG_CLASS[kind] + '">' + TAG_TEXT[kind] + '</span><h3>' + title + '</h3>' +
        (items.length ? '<ul>' + items.map(function (i) { return '<li>' + i + '</li>'; }).join("") + '</ul>' : '<p class="muted small">' + empty + '</p>') + '</div>';
    }
    $("trace-grid").innerHTML =
      card("From the trackers", "measured", measured, "Nothing measured in this view.") +
      card("Estimates we filled in", "estimated", estimated, "No estimates were needed.") +
      card("Illustrative factors", "illustrative", illustrative, "No illustrative factors in this view.");
  }

  // ---- Formulas & sources ----
  function renderFormulas() {
    var pa = path();
    $("formula-table").innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Scope</th><th>Formula</th><th>Result</th><th>Range</th><th>Status</th></tr></thead><tbody>' +
      pa.scopes.map(function (s) {
        return '<tr><td><b>' + SCOPE_NAME[s.id] + '</b></td><td>' + esc(s.formula) + '</td><td><b>' + (s.tons ? t(s.tons) : "–") +
          '</b></td><td>' + esc(s.confidence) + '</td><td>' + tag(scopeState(s)) + '</td></tr>';
      }).join("") +
      '<tr><td><b>Total</b></td><td>Scope 1 + Scope 2 + Scope 3</td><td><b>' + t(pa.total.tons) + '</b></td><td>' + t(pa.total.low) + ' to ' + t(pa.total.high) + '</td><td></td></tr>' +
      '</tbody></table></div>';
    $("factor-table").innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Factor</th><th>Value</th><th>Source</th><th>Status</th></tr></thead><tbody>' +
      FACTORS.map(function (f) {
        return '<tr><td>' + esc(f.name) + '</td><td><code>' + esc(f.value) + '</code></td><td class="muted">' + esc(f.source) + '</td><td>' + tag(f.status) + '</td></tr>';
      }).join("") +
      '<tr><td>Grade bands</td><td>–</td><td class="muted">Illustrative benchmarks, not a sourced standard</td><td>' + tag("illustrative") + '</td></tr>' +
      '</tbody></table></div>';
  }

  // ---- Reductions ----
  function renderActions() {
    var acts = path().actions;
    if (!acts.length) {
      $("action-cards").innerHTML = '<div class="empty">No reduction action applies at this scale yet. The knowledge base has no actions for individuals.</div>';
      return;
    }
    $("action-cards").innerHTML = acts.map(function (a, i) {
      return '<article class="action"><span class="rank">#' + (i + 1) + ' · ' + esc(a.scope.replace("scope_", "Scope ")) + '</span>' +
        '<h3>' + esc(a.action) + '</h3><p>' + esc(a.description) + '</p>' +
        '<dl><div><dt>Saves</dt><dd>' + t(a.tons) + ' a year</dd></div>' +
        '<div><dt>Cost</dt><dd>' + inr(a.cost_inr) + '</dd></div>' +
        '<div><dt>Payback</dt><dd>' + esc(a.payback) + '</dd></div>' +
        '<div><dt>Tonnes per ₹ lakh</dt><dd>' + Number(a.roi).toFixed(2) + '</dd></div></dl>' +
        '<button class="btn btn-ghost btn-small" data-impact="' + i + '">See impact</button></article>';
    }).join("");
  }

  function openImpact(index) {
    var pa = path(), a = pa.actions[index];
    if (!a) return;
    var after = Math.max(0, pa.total.tons - a.tons);
    $("impact-body").innerHTML =
      '<p class="kicker">See impact</p><h3 id="impact-title">' + esc(a.action) + '</h3>' +
      '<div class="kv">' +
      '<div><span>Today</span><strong>' + t(pa.total.tons) + ' · ' + esc(pa.grade) + '</strong></div>' +
      '<div><span>After</span><strong>' + t(after) + ' · ' + esc(gradeFor(pa.grade_bands, after)) + '</strong></div>' +
      '<div><span>Saves</span><strong>' + t(a.tons) + ' a year</strong></div>' +
      '<div><span>Cost</span><strong>' + inr(a.cost_inr) + '</strong></div>' +
      '</div>' +
      '<p class="muted small">Payback: ' + esc(a.payback) + '. The grade is recalculated with the same benchmark bands. This is one action on its own.</p>';
    $("impact-dialog").showModal();
  }

  function renderScenario() {
    var pa = path();
    var picked = state.picked[state.scale + state.path] || {};
    $("scenario-slot").innerHTML = '<div class="checks">' + pa.actions.map(function (a, i) {
      return '<label><input type="checkbox" data-pick="' + i + '"' + (picked[i] ? " checked" : "") + '> ' +
        esc(a.action) + ' <span class="muted">(' + t(a.tons) + ')</span></label>';
    }).join("") + '</div>';
    updateScenarioOut();
  }

  function updateScenarioOut() {
    var pa = path();
    var picked = state.picked[state.scale + state.path] || {};
    var chosen = pa.actions.filter(function (a, i) { return picked[i]; });
    var saved = chosen.reduce(function (sum, a) { return sum + a.tons; }, 0);
    var cost = chosen.reduce(function (sum, a) { return sum + a.cost_inr; }, 0);
    var after = Math.max(0, pa.total.tons - saved);
    $("scenario-out").innerHTML =
      '<div><span>Total now</span><strong>' + t(pa.total.tons) + '</strong></div>' +
      '<div><span>After</span><strong>' + t(after) + '</strong></div>' +
      '<div><span>Grade after</span><strong>' + esc(gradeFor(pa.grade_bands, after)) + '</strong></div>' +
      '<div><span>Cost</span><strong>' + inr(cost) + '</strong></div>';
    $("scenario-warn").innerHTML = chosen.length > 1
      ? '<p class="warn">These savings may overlap, so this total is an upper bound on the reduction.</p>' : "";
  }

  // ---- Downloads ----
  function download(name, mime, text) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function downloadJson() {
    var p = profile();
    download(p.id + "-" + state.path + "-report.json", "application/json",
      JSON.stringify({ user_type: p.id, data_path: state.path, report: path() }, null, 2));
  }
  function downloadCsv() {
    var p = profile(), pa = path();
    var rows = ["scope,driver,tCO2e,confidence,state"];
    pa.scopes.forEach(function (s) {
      var k = scopeState(s);
      if (!s.drivers.length) rows.push(s.id + ",(none),0," + s.confidence + "," + k);
      s.drivers.forEach(function (d) {
        rows.push(s.id + ',"' + d.name.replace(/"/g, "'") + '",' + d.tons + "," + s.confidence + "," + k);
      });
    });
    download(p.id + "-" + state.path + "-breakdown.csv", "text/csv", rows.join("\n") + "\n");
  }

  // ---- Wiring ----
  function render() {
    renderNav();
    renderHeader();
    renderOverview();
    ["scope_1", "scope_2", "scope_3"].forEach(renderScopeView);
    renderEstimates();
    renderFormulas();
    renderActions();
    renderScenario();
    window.history.replaceState(null, "", "#" + state.scale + "/" + (state.path === "closed_source" ? "closed" : "open") + "/" + state.view);
  }
  function go(view) {
    state.view = view;
    closeMenu();
    render();
    window.scrollTo(0, 0);
  }

  function readHash() {
    var parts = window.location.hash.replace("#", "").split("/");
    if (SCALES.indexOf(parts[0]) !== -1) state.scale = parts[0];
    if (parts[1] === "closed") state.path = "closed_source";
    if (parts[1] === "open") state.path = "open_source";
    if (VIEWS.indexOf(parts[2]) !== -1) state.view = parts[2];
  }

  var snav = $("snav"), menuBtn = $("menu-btn");
  function closeMenu() { snav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }
  menuBtn.addEventListener("click", function () {
    var open = snav.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", function (e) {
    var b;
    if ((b = e.target.closest("[data-view]")) && b.tagName === "A") { e.preventDefault(); go(b.getAttribute("data-view")); return; }
    if ((b = e.target.closest("[data-goto]"))) { e.preventDefault(); go(b.getAttribute("data-goto")); return; }
    if ((b = e.target.closest("[data-path]"))) { state.path = b.getAttribute("data-path"); render(); return; }
    if ((b = e.target.closest("[data-impact]"))) { openImpact(Number(b.getAttribute("data-impact"))); return; }
    if (e.target.id === "dl-json" || e.target.closest("#download")) { e.preventDefault(); downloadJson(); return; }
    if (e.target.id === "dl-csv") { downloadCsv(); return; }
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "org-select") { state.scale = e.target.value; render(); return; }
    if (e.target.matches("#scenario-slot input[data-pick]")) {
      var key = state.scale + state.path;
      state.picked[key] = state.picked[key] || {};
      state.picked[key][e.target.getAttribute("data-pick")] = e.target.checked;
      updateScenarioOut();
    }
  });

  if (!ALL.length) {
    $("main").innerHTML = '<p class="muted">Demo data did not load. Check that data/demo_fixtures.js is present.</p>';
    return;
  }
  readHash();
  window.addEventListener("hashchange", function () { readHash(); render(); });
  render();
})();
