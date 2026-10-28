(function () {
  "use strict";

  var ALL = window.DEMO_FIXTURES || [];
  var SCALES = ["individual", "small_scale", "large_scale", "case_tcs", "case_infosys"];
  var SCALE_LABEL = {
    individual: "Individual", small_scale: "Small-Scale", large_scale: "Large-Scale",
    case_tcs: "TCS FY25-26", case_infosys: "Infosys FY25-26"
  };
  var SCOPE_NAME = { scope_1: "Scope 1", scope_2: "Scope 2", scope_3: "Scope 3" };
  var state = { scale: "small_scale", path: "open_source", scope: "scope_1", picked: {} };

  var $ = function (id) { return document.getElementById(id); };
  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function t(v) { return Number(v).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " t"; }
  function inr(v) { return "₹" + Math.round(v).toLocaleString("en-IN"); }
  function lakh(v) { return "₹" + (v / 100000).toFixed(1) + " L"; }
  function profile() { return ALL.filter(function (p) { return p.id === state.scale; })[0] || ALL[0]; }
  function path() { return profile().paths[state.path] || profile().paths.open_source; }
  function gradeFor(bands, tons) {
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      if (tons >= b.from && (b.to === null || tons < b.to)) return b.grade;
    }
    return bands[bands.length - 1].grade;
  }
  function humanFactor(id) {
    // e.g. scope_3.hardware.laptop.embodied_carbon_factor -> Laptop embodied carbon
    var parts = id.replace("scope_3.", "").split(".");
    var name = parts.filter(function (p) { return p !== "factor" && p !== "embodied_carbon_factor"; })
      .map(function (p) { return p.replace(/_/g, " "); }).join(" · ");
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  // What kind of number each scope is, for the tags and the sidebar.
  function scopeState(scope, p) {
    if (scope.tons === 0 && state.path === "closed_source") return "none";
    if (scope.id === "scope_3") {
      var ill = (p.illustrative || []).some(function (x) { return x.indexOf("scope_3") === 0; });
      return ill ? "illustrative" : (p.paths.open_source.intake.estimates.scope_3 || []).length ? "estimated" : "measured";
    }
    return state.path === "closed_source" ? "totals" : "measured";
  }
  var TAG_TEXT = { measured: "Measured", estimated: "Estimated", illustrative: "Illustrative", totals: "Totals only", none: "Not calculated" };
  var TAG_CLASS = { measured: "measured", estimated: "estimated", illustrative: "illustrative", totals: "estimated", none: "none" };
  function tag(kind) { return '<span class="tag ' + TAG_CLASS[kind] + '">' + TAG_TEXT[kind] + '</span>'; }

  // ---- Header toggles ----
  function renderScaleToggle() {
    $("scale-toggle").innerHTML = SCALES.map(function (s) {
      return '<button role="tab" aria-selected="' + (s === state.scale) + '" data-scale="' + s + '">' + SCALE_LABEL[s] + '</button>';
    }).join("") +
    '<button role="tab" aria-selected="' + (state.path === "closed_source") + '" data-path="toggle">' +
      (state.path === "closed_source" ? "Totals only" : "Detailed exports") + '</button>';
  }

  // ---- Sidebar ----
  function renderSidebar() {
    var p = profile(), pa = path();
    var trackers = [];
    pa.sources.forEach(function (s) { if (trackers.indexOf(s.tracker) === -1) trackers.push(s.tracker); });
    $("tracker-list").innerHTML = trackers.map(function (name) {
      return '<li class="ok"><span class="dot measured"></span>' + esc(name) + '</li>';
    }).join("");

    var estimates = [];
    pa.scopes.forEach(function (s) { (p.paths.open_source.intake.estimates[s.id] || []).forEach(function (e) { estimates.push(e); }); });
    var illustrative = (pa.illustrative || []);
    var measuredN = state.path === "closed_source" ? 0 : 2;
    $("source-list").innerHTML =
      '<li><span class="dot measured"></span>Measured scopes: ' + measuredN + '</li>' +
      '<li><span class="dot estimated"></span>Estimates made: ' + estimates.length + '</li>' +
      '<li><span class="dot illustrative"></span>Illustrative factors: ' + illustrative.length + '</li>';

    var shares = pa.scopes.map(function (s) { return pa.total.tons ? (s.tons / pa.total.tons) * 100 : 0; });
    $("quick-stats").innerHTML =
      '<div><dt>Total</dt><dd>' + t(pa.total.tons) + '</dd></div>' +
      '<div><dt>Grade</dt><dd>' + esc(pa.grade) + '</dd></div>' +
      '<div><dt>Scope 1 share</dt><dd>' + shares[0].toFixed(0) + '%</dd></div>' +
      '<div><dt>Scope 2 share</dt><dd>' + shares[1].toFixed(0) + '%</dd></div>' +
      '<div><dt>Scope 3 share</dt><dd>' + shares[2].toFixed(0) + '%</dd></div>';
  }

  // ---- Summary ----
  function renderSummary() {
    var p = profile(), pa = path();
    $("profile-title").textContent = p.label + " · " + p.sublabel;
    $("profile-sub").textContent = p.description;
    $("top-source").textContent = state.path === "closed_source" ? "Totals only" : "Detailed exports";

    var total = pa.total.tons || 0;
    var half = total ? ((pa.total.high - pa.total.low) / 2 / total) * 100 : 0;
    var tipRows = pa.scopes.map(function (s) {
      return SCOPE_NAME[s.id] + ": " + (s.tons ? s.confidence : "not calculated") + " (" + TAG_TEXT[scopeState(s, p)].toLowerCase() + ")";
    }).join("<br>");

    var hi = pa.total.high || 1;
    var bandLeft = (pa.total.low / hi) * 100;
    var bandWidth = ((pa.total.high - pa.total.low) / hi) * 100;
    var midPct = (total / hi) * 100;
    $("summary-cards").innerHTML =
      '<div class="card dark"><div class="label">Total footprint</div><div class="value">' + t(total) +
        '</div><div class="sub">tCO₂e a year · range ' + t(pa.total.low) + ' to ' + t(pa.total.high) + '</div>' +
        '<div class="range"><div class="band" style="left:' + bandLeft.toFixed(1) + '%;width:' + bandWidth.toFixed(1) + '%"></div>' +
        '<div class="mid" style="left:' + midPct.toFixed(1) + '%"></div></div></div>' +
      '<div class="card" data-tip><div class="label">Grade</div><div class="value">' + esc(pa.grade) +
        '</div><div class="sub">Illustrative benchmark for ' + esc(p.label.toLowerCase()) + '</div>' +
        '<div class="tip">' + tipRows + '</div></div>' +
      '<div class="card" data-tip><div class="label">Confidence</div><div class="value">±' + half.toFixed(0) +
        '%</div><div class="sub">Each scope carries its own range</div>' +
        '<div class="tip">' + tipRows + '<br><br>Overall range is the sum of the scope ranges.</div></div>';

    $("confidence-explain").innerHTML = state.path === "closed_source"
      ? "Totals only. Scope 1 and 2 come from consumption totals, so the range is wide. Scope 3 cannot be calculated from totals."
      : "Scope 1 and 2 come from measured data. Scope 3 uses illustrative or estimated factors, so its range is wider. Hover the cards to see each scope's range.";
    $("download").setAttribute("href", "#");
  }

  // ---- Scope tabs ----
  function renderScopes() {
    var p = profile(), pa = path();
    $("scope-tabs").innerHTML = pa.scopes.map(function (s) {
      return '<button role="tab" aria-selected="' + (s.id === state.scope) + '" data-scope="' + s.id + '">' +
        SCOPE_NAME[s.id] + ' · ' + (s.tons ? t(s.tons) : "–") + '</button>';
    }).join("");
    var s = pa.scopes.filter(function (x) { return x.id === state.scope; })[0] || pa.scopes[0];
    var kind = scopeState(s, p);
    var max = Math.max.apply(null, s.drivers.map(function (d) { return d.tons; }).concat([0.0001]));
    var drivers = s.drivers.length ? s.drivers.map(function (d) {
      var w = (d.tons / max * 100).toFixed(1);
      return '<div class="driver"><span>' + esc(d.name) + '</span><span class="num">' + t(d.tons) +
        '</span><div class="bar"><i style="width:' + w + '%"></i></div></div>';
    }).join("") : '<p class="muted">No drivers for this scope.</p>';

    var notes = [];
    if (s.id === "scope_3") {
      (pa.illustrative || []).filter(function (x) { return x.indexOf("scope_3") === 0; })
        .forEach(function (x) { notes.push("Illustrative factor: " + humanFactor(x)); });
      (p.paths.open_source.intake.estimates.scope_3 || []).forEach(function (e) { notes.push("Estimate: " + e); });
    }
    if (state.path === "closed_source" && s.id === "scope_3") {
      notes.push("Totals only: Scope 3 needs activity data, so it is not calculated from totals.");
    }

    $("scope-panel").innerHTML =
      '<div class="panel-head"><div><p class="kicker">' + esc(s.label) + '</p><div class="value">' + (s.tons ? t(s.tons) : "–") +
      '</div></div><div>' + tag(kind) + ' <span class="muted small">Range ' + t(s.low) + ' to ' + t(s.high) + ' (' + esc(s.confidence) + ')</span></div></div>' +
      '<div style="margin-top:14px">' + drivers + '</div>' +
      '<div class="formula">Method: ' + esc(s.formula) + '</div>' +
      (notes.length ? '<ul class="note-list">' + notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join("") + '</ul>' : "");
  }

  // ---- Actions ----
  function renderActions() {
    var pa = path();
    var acts = pa.actions;
    if (!acts.length) {
      $("action-cards").innerHTML = '<p class="muted">No reduction action applies at this scale yet. The knowledge base has no actions for individuals.</p>';
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

  function gradeLine(pa, tons) { return gradeFor(pa.grade_bands, tons); }

  function openImpact(index) {
    var pa = path();
    var a = pa.actions[index];
    if (!a) return;
    var after = Math.max(0, pa.total.tons - a.tons);
    $("impact-body").innerHTML =
      '<p class="kicker">See impact</p><h3 id="impact-title">' + esc(a.action) + '</h3>' +
      '<div class="kv">' +
      '<div><span>Today</span><strong>' + t(pa.total.tons) + ' · ' + esc(pa.grade) + '</strong></div>' +
      '<div><span>After</span><strong>' + t(after) + ' · ' + esc(gradeLine(pa, after)) + '</strong></div>' +
      '<div><span>Saves</span><strong>' + t(a.tons) + ' a year</strong></div>' +
      '<div><span>Cost</span><strong>' + inr(a.cost_inr) + '</strong></div>' +
      '</div>' +
      '<p class="muted small">Payback: ' + esc(a.payback) + '. The grade is recalculated with the same benchmark bands. This is one action on its own.</p>';
    $("impact-dialog").showModal();
  }

  // ---- Scenario builder: stack actions, with an overlap warning ----
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
      '<div><span>Grade after</span><strong>' + esc(gradeLine(pa, after)) + '</strong></div>' +
      '<div><span>Cost</span><strong>' + inr(cost) + '</strong></div>';
    $("scenario-warn").innerHTML = chosen.length > 1
      ? '<p class="warn">These savings may overlap, so this total is an upper bound on the reduction.</p>' : "";
  }

  // ---- Traceability ----
  function renderTrace() {
    var p = profile(), pa = path();
    var measured = pa.sources.map(function (s) { return esc(s.tracker) + " · " + esc(s.detail); });
    var estimated = [];
    Object.keys(p.paths.open_source.intake.estimates).forEach(function (k) {
      (p.paths.open_source.intake.estimates[k] || []).forEach(function (e) { estimated.push(esc(e)); });
    });
    var illustrative = (pa.illustrative || []).map(function (x) { return esc(humanFactor(x)); });
    function card(title, kind, items, empty) {
      return '<div class="trace"><span class="tag ' + TAG_CLASS[kind] + '">' + TAG_TEXT[kind] + '</span><h3>' + title + '</h3>' +
        (items.length ? '<ul>' + items.map(function (i) { return '<li>' + i + '</li>'; }).join("") + '</ul>' : '<p class="muted small">' + empty + '</p>') + '</div>';
    }
    $("trace-grid").innerHTML =
      card("From the trackers", "measured", measured, "Nothing measured in this view.") +
      card("Estimates we filled in", "estimated", estimated, "No estimates were needed.") +
      card("Illustrative factors", "illustrative", illustrative, "No illustrative factors in this view.") +
      '<div class="trace" style="grid-column:1/-1"><h3>Sources and benchmarks</h3><ul>' +
      '<li>Grid electricity: CEA CO₂ baseline, combined margin FY 2023-24 (0.757 kg CO₂e/kWh). Secondary report, primary to be checked.</li>' +
      '<li>Diesel, petrol and LPG: IPCC 2006 CO₂ defaults, converted per litre. Sourced, derivation shown.</li>' +
      '<li>Scope 3 factors: illustrative assumptions for the demo, not verified sources.</li>' +
      '<li>Grade bands: illustrative benchmarks, not a sourced standard.</li></ul>' +
      '<div class="download-row"><button class="btn btn-ghost btn-small" id="dl-json">Download report (JSON)</button>' +
      '<button class="btn btn-ghost btn-small" id="dl-csv">Download breakdown (CSV)</button></div></div>';
  }

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
      var k = scopeState(s, p);
      if (!s.drivers.length) rows.push(s.id + ",(none),0," + s.confidence + "," + k);
      s.drivers.forEach(function (d) {
        rows.push(s.id + ',"' + d.name.replace(/"/g, "'") + '",' + d.tons + "," + s.confidence + "," + k);
      });
    });
    download(p.id + "-" + state.path + "-breakdown.csv", "text/csv", rows.join("\n") + "\n");
  }

  // ---- Wiring ----
  function render() {
    renderScaleToggle();
    renderSidebar();
    renderSummary();
    renderScopes();
    renderActions();
    renderScenario();
    renderTrace();
    window.history.replaceState(null, "", "#" + state.scale + "/" + (state.path === "closed_source" ? "closed" : "open"));
  }

  function readHash() {
    var parts = window.location.hash.replace("#", "").split("/");
    if (SCALES.indexOf(parts[0]) !== -1) state.scale = parts[0];
    if (parts[1] === "closed") state.path = "closed_source";
    if (parts[1] === "open") state.path = "open_source";
  }

  document.addEventListener("click", function (e) {
    var b;
    if ((b = e.target.closest("[data-scale]"))) { state.scale = b.getAttribute("data-scale"); render(); return; }
    if ((b = e.target.closest("[data-path]"))) { state.path = state.path === "closed_source" ? "open_source" : "closed_source"; render(); return; }
    if ((b = e.target.closest("[data-scope]"))) { state.scope = b.getAttribute("data-scope"); renderScopes(); renderScopesTabs(); return; }
    if ((b = e.target.closest("[data-impact]"))) { openImpact(Number(b.getAttribute("data-impact"))); return; }
    if (e.target.id === "dl-json") { downloadJson(); return; }
    if (e.target.id === "dl-csv") { downloadCsv(); return; }
  });
  document.addEventListener("change", function (e) {
    if (e.target.matches("#scenario-slot input[data-pick]")) {
      var key = state.scale + state.path;
      state.picked[key] = state.picked[key] || {};
      state.picked[key][e.target.getAttribute("data-pick")] = e.target.checked;
      updateScenarioOut();
    }
  });
  function renderScopesTabs() {
    var pa = path();
    $("scope-tabs").querySelectorAll("button").forEach(function (b) {
      b.setAttribute("aria-selected", String(b.getAttribute("data-scope") === state.scope));
    });
  }
  $("download").addEventListener("click", function (e) { e.preventDefault(); downloadJson(); });

  if (!ALL.length) {
    $("main").innerHTML = '<p class="muted">Demo data did not load. Check that data/demo_fixtures.js is present.</p>';
    return;
  }
  readHash();
  window.addEventListener("hashchange", function () { readHash(); render(); });
  render();
})();
