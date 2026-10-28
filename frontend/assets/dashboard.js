(function () {
  "use strict";

  var ALL = window.DEMO_FIXTURES || [];
  var SCALES = ["individual", "small_scale", "large_scale", "large_scale_partial", "case_tcs", "case_infosys"];
  var SCALE_LABEL = {
    individual: "Individual", small_scale: "Small-scale campus", large_scale: "Large-scale enterprise", large_scale_partial: "Partial data (AI-estimated)",
    case_tcs: "TCS · FY 2025-26 (case study)", case_infosys: "Infosys · FY 2025-26 (case study)"
  };
  var VIEWS = ["overview", "connect", "scope_1", "scope_2", "scope_3", "reduction", "breakdown", "export"];
  var VIEW_LABEL = {
    overview: "Overview", connect: "Connect", scope_1: "Scope 1 · Direct fuel", scope_2: "Scope 2 · Purchased power",
    scope_3: "Scope 3 · Value chain", reduction: "Reduction", breakdown: "Data breakdown", export: "Download & export"
  };
  var SCOPE_NAME = { scope_1: "Scope 1", scope_2: "Scope 2", scope_3: "Scope 3" };
  var SCOPE_CLASS = { scope_1: "c1", scope_2: "c2", scope_3: "c3" };
  var DIESEL = 2.68, GRID = 0.757;

  // Trackers the platform can read. Status comes from the profile's sources; charts from its raw exports.
  var PLATFORMS = [
    { name: "Fleet & fuel log", note: "Fuel-log CSV export (e.g. Fuelio): vehicle, fuel type, distance", scope: "scope_1", cat: "Fleet", match: /fuel|vehicle|fleet/i, demo: "tracker-demo/fuelio.html",
      steps: ["Export the fuel log as CSV", "Keep vehicle, fuel type, annual km and L/100 km columns", "Upload: each vehicle becomes a Scope 1 line"] },
    { name: "DG set log", note: "Run-hours and litres per hour, entered as a form", scope: "scope_1", cat: "DG set", match: /\bDG\b/, demo: "tracker-demo/index.html",
      steps: ["Note the generator's capacity (kVA)", "Enter run-hours a year and litres per hour", "Diesel use becomes a Scope 1 line"] },
    { name: "Energy meter", note: "Monthly kWh export from a smart meter, with the grid region", scope: "scope_2", cat: "Electricity", match: /meter|electricity|bill/i, demo: "tracker-demo/energy-meter.html",
      steps: ["Export 12 months of readings as CSV", "Keep month, kWh and state columns", "Upload: kWh × grid factor gives Scope 2"] },
    { name: "Cloud bill", note: "Usage export (e.g. AWS): instance-hours by region", scope: "scope_3", cat: "Cloud", match: /cloud/i, demo: "tracker-demo/aws.html",
      steps: ["Download the usage report as CSV", "Keep instance type, region and usage hours", "GPU hours are calculated; others are flagged"] },
    { name: "Asset register", note: "Device counts by type, for embodied carbon", scope: "scope_3", cat: "Hardware", match: /asset|device/i, demo: "tracker-demo/index.html",
      steps: ["List devices by type and count", "Add purchase year and expected lifespan", "Each device gets a yearly embodied-carbon factor"] },
    { name: "Commute survey", note: "Distance and travel mode per person", scope: "scope_3", cat: "Commute", match: /commute/i, demo: "tracker-demo/index.html",
      steps: ["Survey staff for mode and distance", "Upload headcount and mode split", "Each mode uses its own factor"] },
    { name: "Waste log", note: "Monthly kg by waste type and disposal route", scope: "scope_3", cat: "Waste", match: /waste/i, demo: "tracker-demo/index.html",
      steps: ["Get monthly kg from the waste vendor", "Split by solid, e-waste and wastewater", "Each type uses its own factor"] }
  ];

  // Factors used by the calculator. Status mirrors person2 factors.py.
  var FACTORS = [
    { scope: "scope_1", name: "Diesel", value: "2.68 kg CO₂e / L", status: "sourced", source: "IPCC 2006 CO₂ default, converted per litre" },
    { scope: "scope_1", name: "Petrol", value: "2.29 kg CO₂e / L", status: "sourced", source: "IPCC 2006 CO₂ default, converted per litre" },
    { scope: "scope_1", name: "LPG", value: "1.61 kg CO₂e / L", status: "sourced", source: "IPCC 2006 CO₂ default, converted per litre" },
    { scope: "scope_2", name: "Grid electricity (India)", value: "0.757 kg CO₂e / kWh", status: "sourced", source: "CEA CO₂ baseline, combined margin FY 2023-24 (secondary report)" },
    { scope: "scope_3", name: "Laptop / desktop / server, embodied", value: "30 / 60 / 500 kg per device a year", status: "illustrative", source: "Illustrative assumption" },
    { scope: "scope_3", name: "Commute · car / bus / bike", value: "0.15 / 0.05 / 0.01 kg / km", status: "illustrative", source: "Illustrative assumption" },
    { scope: "scope_3", name: "Waste · solid / e-waste", value: "0.5 / 3.0 kg / kg", status: "illustrative", source: "Illustrative assumption" },
    { scope: "scope_3", name: "Cloud GPU", value: "0.4 kg / hour", status: "illustrative", source: "Illustrative assumption" }
  ];

  // How far each action can go, as a share of the emissions it acts on. Caps are assumptions.
  var LEVERS = [
    { match: /route/i, pool: "fleet", label: "Fleet distance cut", max: 20 },
    { match: /cng/i, pool: "fleet", label: "Fleet emissions cut by switching to CNG", max: 60 },
    { match: /\bdg\b/i, pool: "dg", label: "DG fuel saved", max: 30 },
    { match: /carpool|public transport|commute/i, pool: "commute", label: "Commute moved to shared transport", max: 50 },
    { match: /renewable/i, pool: "power", label: "Renewable share of electricity", max: 100 },
    { match: /solar/i, pool: "power", label: "Electricity from rooftop solar", max: 40 },
    { match: /./, pool: "total", label: "Scale of action", max: 50 }
  ];
  var ACT_CLASS = ["a1", "a2", "a3", "a4", "a5"];

  var state = { scale: "small_scale", path: "open_source", view: "overview", edits: {}, levers: {} };

  // ---- Projects: named sets of inputs and plans, kept in this browser ----
  var PROJ_KEY = "og-projects-v1";
  var projects = loadProjects();
  function loadProjects() {
    var fresh = { active: "base", list: [{ id: "base", name: "Base data", edits: {}, levers: {} }] };
    try {
      var saved = JSON.parse(localStorage.getItem(PROJ_KEY) || "null");
      return saved && saved.list && saved.list.length ? saved : fresh;
    } catch (e) { return fresh; }
  }
  function saveProjects() {
    var p = projects.list.filter(function (x) { return x.id === projects.active; })[0];
    if (p) { p.edits = JSON.parse(JSON.stringify(state.edits)); p.levers = JSON.parse(JSON.stringify(state.levers)); }
    try { localStorage.setItem(PROJ_KEY, JSON.stringify(projects)); } catch (e) { /* storage unavailable: session only */ }
  }
  function switchProject(id) {
    saveProjects();
    var p = projects.list.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    projects.active = id;
    state.edits = JSON.parse(JSON.stringify(p.edits || {}));
    state.levers = JSON.parse(JSON.stringify(p.levers || {}));
    saveProjects();
    render();
  }
  function createProject(name) {
    var id = "p" + Date.now().toString(36);
    saveProjects();
    projects.list.push({ id: id, name: name, edits: {}, levers: {} });
    projects.active = id;
    state.edits = {}; state.levers = {};
    saveProjects();
    render();
  }
  function renderProjects() {
    var sel = $("project-select");
    sel.innerHTML = projects.list.map(function (p) {
      return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>';
    }).join("") + '<option value="__new__">+ New project…</option>';
    sel.value = projects.active;
  }
  function importCsv(text) {
    var fields = { litres: "litres", kwh: "kwh", renewable: "renewable", s3pct: "s3pct" };
    var applied = [], rejected = [];
    text.split(/\r?\n/).forEach(function (line) {
      var parts = line.split(",").map(function (v) { return v.trim(); });
      if (parts.length < 2 || parts[0].toLowerCase() === "field") return;
      var f = fields[parts[0].toLowerCase()], v = Number(parts[1]);
      if (!f || !isFinite(v) || v < 0 || (f === "renewable" && v > 100)) { rejected.push(parts[0]); return; }
      inputs()[f] = v;
      applied.push(f);
    });
    saveProjects();
    $("import-note").textContent = "Applied: " + (applied.join(", ") || "nothing") + (rejected.length ? ". Not applied: " + rejected.join(", ") + "." : ".");
    live();
  }
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var $ = function (id) { return document.getElementById(id); };
  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function t(v) { return Number(v).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " t"; }
  function n0(v) { return Math.round(v).toLocaleString("en-IN"); }
  function inr(v) { return "₹" + n0(v); }
  function lakh(v) { return "₹" + (v / 100000).toLocaleString("en-IN", { maximumFractionDigits: 1 }) + " L"; }
  function pct(v) { return (Math.round(v * 10) / 10) + "%"; }
  function key() { return state.scale + "|" + state.path; }
  function profile() { return ALL.filter(function (p) { return p.id === state.scale; })[0] || ALL[0]; }
  function path() { return profile().paths[state.path] || profile().paths.open_source; }
  function baseScope(id) { return path().scopes.filter(function (s) { return s.id === id; })[0]; }
  function estimatesFor(id) { return profile().paths.open_source.intake.estimates[id] || []; }
  function bandOf(s) { return (parseFloat(String(s.confidence).replace(/[^\d.]/g, "")) || 0) / 100; }
  function gradeFor(bands, tons) {
    var heads = profile().id === "individual" ? 1 : path().employees;
    if (!heads) return "N/A";
    tons = tons / heads;
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      if (tons >= b.from && (b.to === null || tons < b.to)) return b.grade;
    }
    return bands[bands.length - 1].grade;
  }
  function annualSaving(a) {
    var m = /(\d+(?:\.\d+)?)\s*month/.exec(a.payback || "");
    var y = /(\d+(?:\.\d+)?)\s*year/.exec(a.payback || "");
    var months = m ? Number(m[1]) : y ? Number(y[1]) * 12 : 0;
    return months ? a.cost_inr * 12 / months : null;
  }

  var TAG_TEXT = { measured: "Measured", estimated: "Estimated", illustrative: "Illustrative", sourced: "Sourced", totals: "Totals only", none: "No data" };
  var TAG_CLASS = { measured: "measured", estimated: "estimated", illustrative: "illustrative", sourced: "measured", totals: "estimated", none: "none" };
  function tag(kind) { return '<span class="tag ' + TAG_CLASS[kind] + '">' + TAG_TEXT[kind] + '</span>'; }

  // ---- Inputs: activity values backed out of each scope, then recalculated ----
  function baseInputs() {
    var s = {}; path().scopes.forEach(function (x) { s[x.id] = x.tons; });
    return { litres: Math.round(s.scope_1 * 1000 / DIESEL), kwh: Math.round(s.scope_2 * 1000 / GRID), renewable: 0, s3pct: 100 };
  }
  function inputs() {
    if (!state.edits[key()]) state.edits[key()] = baseInputs();
    return state.edits[key()];
  }
  function isEdited() {
    var a = inputs(), b = baseInputs();
    return Object.keys(b).some(function (k) { return a[k] !== b[k]; });
  }

  // The footprint after input edits (before any reduction action).
  function effPath() {
    var pa = path(), v = inputs(), b = baseInputs();
    var target = {
      scope_1: b.litres ? v.litres * DIESEL / 1000 : 0,
      scope_2: b.kwh ? v.kwh * (1 - v.renewable / 100) * GRID / 1000 : 0,
      scope_3: baseScope("scope_3").tons * v.s3pct / 100
    };
    var scopes = pa.scopes.map(function (s) {
      var r = s.tons ? target[s.id] / s.tons : 0;
      return {
        id: s.id, label: s.label, confidence: s.confidence, formula: s.formula,
        tons: s.tons * r, low: s.low * r, high: s.high * r,
        drivers: s.drivers.map(function (d) { return { name: d.name, tons: d.tons * r }; })
      };
    });
    var sum = function (k) { return scopes.reduce(function (a, s) { return a + s[k]; }, 0); };
    var total = { tons: sum("tons"), low: sum("low"), high: sum("high") };
    return { scopes: scopes, total: total, grade: gradeFor(pa.grade_bands, total.tons) };
  }

  // ---- Categories: drivers grouped into readable lines ----
  var CAT_FORMULA = {
    Fleet: "litres of fuel × 2.68 kg CO₂e (diesel) or 2.29 (petrol), IPCC 2006",
    "DG set": "run-hours × litres per hour × 2.68 kg CO₂e per litre of diesel",
    Electricity: "kWh × 0.757 kg CO₂e, CEA combined margin FY 2023-24",
    Cloud: "GPU hours × 0.4 kg CO₂e per hour (illustrative)",
    Hardware: "devices × embodied kg CO₂e per device a year (illustrative)",
    Commute: "km × mode factor: car 0.15, bus 0.05, bike 0.01 kg (illustrative)",
    Waste: "kg × waste factor by type and disposal (illustrative)"
  };
  function catName(d) {
    if (/^DG/i.test(d)) return "DG set";
    if (/fleet vehicle|fuel total/i.test(d)) return "Fleet";
    if (/electricity/i.test(d)) return "Electricity";
    if (/cloud/i.test(d)) return "Cloud";
    if (/hardware/i.test(d)) return "Hardware";
    if (/commute/i.test(d)) return "Commute";
    if (/waste/i.test(d)) return "Waste";
    return d;
  }
  function categories(eff) {
    var out = [];
    eff.scopes.forEach(function (s) {
      var groups = {}, order = [];
      s.drivers.forEach(function (d) {
        var n = catName(d.name);
        if (!groups[n]) { groups[n] = { name: n, tons: 0, est: false }; order.push(n); }
        groups[n].tons += d.tons;
        if (/est_/.test(d.name)) groups[n].est = true;
      });
      if (!order.length) out.push({ scope: s.id, name: SCOPE_NAME[s.id], tons: 0, kind: "none", band: bandOf(s), formula: s.formula });
      order.forEach(function (n) {
        var g = groups[n], kind;
        if (!g.tons) kind = "none";
        else if (state.path === "closed_source" && s.id !== "scope_3") kind = "totals";
        else if (g.est) kind = "estimated";
        else if (s.id === "scope_3") kind = "illustrative";
        else kind = "measured";
        out.push({ scope: s.id, name: n, tons: g.tons, kind: kind, band: bandOf(s), formula: CAT_FORMULA[n] || s.formula });
      });
    });
    return out;
  }
  function scopeKind(id, eff) {
    var cats = categories(eff).filter(function (c) { return c.scope === id && c.tons > 0; });
    if (!cats.length) return "none";
    var kinds = cats.map(function (c) { return c.kind; });
    if (kinds.indexOf("illustrative") !== -1) return "illustrative";
    if (kinds.indexOf("estimated") !== -1) return "estimated";
    if (kinds.indexOf("totals") !== -1) return "totals";
    return "measured";
  }

  // ---- Reduction levers and the live scenario ----
  function poolTons(eff, pool) {
    var cats = categories(eff);
    var sumCat = function (n) { return cats.filter(function (c) { return c.name === n; }).reduce(function (a, c) { return a + c.tons; }, 0); };
    if (pool === "fleet") return sumCat("Fleet");
    if (pool === "dg") return sumCat("DG set");
    if (pool === "commute") return sumCat("Commute");
    if (pool === "power") return eff.scopes.filter(function (s) { return s.id === "scope_2"; })[0].tons;
    return eff.total.tons;
  }
  function poolScope(pool, a) {
    return { fleet: "scope_1", dg: "scope_1", commute: "scope_3", power: "scope_2" }[pool] || a.scope;
  }
  function leverDefs(eff) {
    return path().actions.slice(0, 5).map(function (a, i) {
      var def = LEVERS.filter(function (l) { return l.match.test(a.action); })[0];
      var pool = poolTons(eff, def.pool);
      var base = pool ? Math.min(def.max, a.tons / pool * 100) : 0;
      return { i: i, a: a, def: def, pool: pool, base: base, enabled: pool > 0 && base > 0 };
    });
  }
  function leverState(defs) {
    var st = state.levers[key()];
    if (!st) {
      st = state.levers[key()] = {};
      defs.forEach(function (d) { st[d.i] = { on: false, pct: d.base }; });
    }
    return st;
  }
  function scenario() {
    var eff = effPath();
    var defs = leverDefs(eff), st = leverState(defs);
    var left = {}, scopeCut = { scope_1: 0, scope_2: 0, scope_3: 0 };
    var rows = [], cut = 0, cost = 0, saving = 0, noSaving = false;
    defs.forEach(function (d) {
      var s = st[d.i];
      if (!d.enabled || !s.on || !s.pct) return;
      if (left[d.def.pool] === undefined) left[d.def.pool] = d.pool;
      // Actions on the same emissions apply one after another, so they never double count.
      var c = left[d.def.pool] * s.pct / 100;
      left[d.def.pool] -= c;
      var scale = s.pct / d.base;
      var sv = annualSaving(d.a);
      cut += c; cost += d.a.cost_inr * scale;
      if (sv === null) noSaving = true; else saving += sv * scale;
      scopeCut[poolScope(d.def.pool, d.a)] += c;
      rows.push({ d: d, pct: s.pct, cut: c, cost: d.a.cost_inr * scale, saving: sv === null ? 0 : sv * scale });
    });
    var after = Math.max(0, eff.total.tons - cut);
    return {
      eff: eff, defs: defs, st: st, rows: rows, cut: cut, cost: cost, saving: saving, noSaving: noSaving,
      after: after, grade: gradeFor(path().grade_bands, after), scopeCut: scopeCut,
      payback: saving ? cost / saving * 12 : null
    };
  }

  // ---- Charts ----
  // ---- Charts (Chart.js, vendored). Each chart has its figures in a table beside it. ----
  var charts = {};
  var PALETTE = { s1: "#4e5a36", s2: "#8a7062", s3: "#b9c4a0", cut: "#c9a66b", muted: "#8a8f80" };
  function mountChart(id, config) {
    var box = $(id);
    if (!box) return;
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    if (!window.Chart) { box.innerHTML = '<p class="muted small">Chart unavailable. The figures are in the table beside it.</p>'; return; }
    var canvas = box.querySelector("canvas");
    if (!canvas) { box.innerHTML = ""; canvas = document.createElement("canvas"); box.appendChild(canvas); }
    charts[id] = new window.Chart(canvas, config);
  }
  function chartOptions(extra) {
    var o = {
      responsive: true, maintainAspectRatio: false,
      animation: reduce ? false : { duration: 600 },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } }, tooltip: { backgroundColor: "#1f2418", padding: 10, cornerRadius: 10 } },
      scales: { x: { grid: { display: false } }, y: { grid: { color: "#ececec" }, ticks: { callback: function (v) { return n0(v); } } } }
    };
    return Object.assign(o, extra || {});
  }
  function renderTrend(total, sc, canvasId, noteId) {
    var years = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];
    var bau = years.map(function () { return Math.round(total * 10) / 10; });
    var plan = years.map(function (_, i) { return Math.round((i === 0 ? total : sc.after) * 10) / 10; });
    mountChart(canvasId, { type: "line", data: { labels: years, datasets: [
      { label: "No change", data: bau, borderColor: PALETTE.muted, borderDash: [6, 6], pointRadius: 0, tension: 0 },
      { label: "With your plan", data: plan, borderColor: PALETTE.s1, backgroundColor: "rgba(78,90,54,.12)", fill: true, pointRadius: 3, tension: 0 }
    ] }, options: chartOptions({ scales: { x: { grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: "tCO₂e a year" } } } }) });
    if (noteId) $(noteId).textContent = sc.rows.length ? "Plan applied from year 2." : "Tick actions to draw the plan line.";
  }
  function renderScopeDonut(eff) {
    mountChart("scope-donut", { type: "doughnut", data: { labels: eff.scopes.map(function (s) { return SCOPE_NAME[s.id]; }),
      datasets: [{ data: eff.scopes.map(function (s) { return Math.round(s.tons * 10) / 10; }), backgroundColor: [PALETTE.s1, PALETTE.s2, PALETTE.s3], borderWidth: 0 }] },
      options: chartOptions({ cutout: "62%", scales: {} }) });
  }

  // Small charts for the Connect page.
  function miniBars(items, unit) {
    var max = Math.max.apply(null, items.map(function (i) { return i.v; }).concat([0.0001]));
    return '<div class="mini-bars">' + items.map(function (i) {
      return '<div class="mb"><span>' + esc(i.l) + '</span><div><i style="width:' + (i.v / max * 100).toFixed(1) + '%"></i></div><b>' + n0(i.v) + ' ' + esc(unit) + '</b></div>';
    }).join("") + '</div>';
  }
  function miniLine(items, unit) {
    var W = 320, H = 110, P = 8;
    var vals = items.map(function (i) { return i.v; });
    var lo = Math.min.apply(null, vals) * 0.95, hi = Math.max.apply(null, vals) * 1.03, span = hi - lo || 1;
    var x = function (i) { return P + i * (W - 2 * P) / Math.max(1, vals.length - 1); };
    var y = function (v) { return P + (hi - v) / span * (H - 2 * P - 14); };
    var pts = vals.map(function (v, i) { return x(i).toFixed(1) + "," + y(v).toFixed(1); }).join(" ");
    return '<svg class="mini-line" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Monthly ' + esc(unit) + '">' +
      '<polygon points="' + x(0) + ',' + (H - 14) + ' ' + pts + ' ' + x(vals.length - 1) + ',' + (H - 14) + '" class="ml-area"/>' +
      '<polyline points="' + pts + '" class="ml"/>' +
      '<text x="' + x(0) + '" y="' + (H - 2) + '" class="ax">' + esc(items[0].l) + '</text>' +
      '<text x="' + x(vals.length - 1) + '" y="' + (H - 2) + '" class="ax" text-anchor="end">' + esc(items[items.length - 1].l) + '</text></svg>';
  }
  function platformData(p) {
    var raw = profile().raw || {};
    var r;
    if (p.cat === "Fleet" && (r = raw.vehicles)) {
      return { title: "Fuel a year, by vehicle", chart: miniBars(r.map(function (v) { return { l: v.vehicle_id, v: v.annual_km * v.fuel_efficiency_l_per_100km / 100 }; }), "L"),
        sample: r.slice(0, 3).map(function (v) { return v.vehicle_id + " · " + v.fuel_type + " · " + n0(v.annual_km) + " km · " + v.fuel_efficiency_l_per_100km + " L/100 km"; }) };
    }
    if (p.cat === "DG set" && (r = raw.dg_set)) {
      return { title: "Generator use", chart: miniBars([{ l: "Hours a year", v: r.hours_per_year }, { l: "Litres a year", v: r.hours_per_year * r.fuel_consumption_per_hour }], ""),
        sample: [r.capacity_kva + " kVA · " + r.fuel_type, r.hours_per_year + " hours a year", r.fuel_consumption_per_hour + " litres per hour"] };
    }
    if (p.cat === "Electricity" && (r = raw.energy_meter || raw.energy)) {
      var even = r.every(function (m) { return m.kwh === r[0].kwh; });
      return { title: "Monthly kWh, 12 months" + (even ? " (annual total spread evenly)" : ""), chart: miniLine(r.map(function (m) { return { l: String(m.month), v: m.kwh }; }), "kWh"),
        sample: r.slice(-3).map(function (m) { return m.month + " · " + n0(m.kwh) + " kWh · " + m.region_state; }) };
    }
    if (p.cat === "Cloud" && (r = raw.cloud)) {
      return { title: "Usage hours, by line", chart: miniBars(r.map(function (c, i) { return { l: c.instance_type + " #" + (i + 1), v: c.usage_hours }; }), "h"),
        sample: r.slice(0, 3).map(function (c) { return c.instance_type + " · " + c.region + " · " + n0(c.usage_hours) + " h"; }) };
    }
    if (p.cat === "Hardware" && (r = raw.hardware)) {
      return { title: "Devices, by type", chart: miniBars(r.map(function (h) { return { l: h.device_type, v: h.quantity }; }), ""),
        sample: r.slice(0, 3).map(function (h) { return h.quantity + " × " + h.model + " · bought " + h.purchase_year + " · " + h.expected_lifespan_years + "-year life"; }) };
    }
    if (p.cat === "Commute" && (r = raw.commute) && r[0]) {
      var c = r[0];
      return { title: "How " + n0(c.total_employees) + " people travel", chart: miniBars([
          { l: "Car", v: c.car_pct * 100 }, { l: "Bus", v: c.bus_pct * 100 }, { l: "Bike", v: c.bike_pct * 100 }, { l: "Home", v: (c.wfh_pct || 0) * 100 }], "%"),
        sample: [n0(c.total_employees) + " people", "Average " + c.avg_distance_km + " km a day, as entered"] };
    }
    if (p.cat === "Waste" && (r = raw.waste)) {
      return { title: "kg a month, by type", chart: miniBars(r.map(function (w) { return { l: w.category, v: w.mass_kg_per_month }; }), "kg"),
        sample: r.slice(0, 3).map(function (w) { return w.category + " · " + n0(w.mass_kg_per_month) + " kg a month"; }) };
    }
    return null;
  }

  // ---- Sidebar ----
  var GHG_CODE = { Fleet: "1.1 Mobile", "DG set": "1.2 Stationary", Electricity: "2.1 Purchased power", Cloud: "3.1 Purchased services", Hardware: "3.2 Capital goods", Commute: "3.7 Commuting", Waste: "3.5 Waste" };
  var openGroups = { scope_1: true, scope_2: true, scope_3: true };
  function renderSidebar(sc) {
    var cats = categories(sc.eff);
    $("scope-sel").innerHTML = ["scope_1", "scope_2", "scope_3"].map(function (id) {
      var s = sc.eff.scopes.filter(function (x) { return x.id === id; })[0];
      var items = cats.filter(function (c) { return c.scope === id && c.name !== SCOPE_NAME[id]; });
      var open = openGroups[id] !== false;
      return '<div class="sg' + (open ? ' open' : '') + '">' +
        '<div class="sg-head"><button class="sg-caret" aria-expanded="' + open + '" aria-label="Toggle ' + SCOPE_NAME[id] + '" data-toggle="' + id + '">›</button>' +
        '<button class="sg-name' + (s.tons ? '' : ' empty') + '" data-view="' + id + '" aria-pressed="' + (state.view === id) + '">' + SCOPE_NAME[id] +
        '<small>' + (s.tons ? n0(s.tons) + ' t' : 'No data') + '</small></button></div>' +
        '<ul class="sg-items">' + items.map(function (c) {
          return '<li><button class="sg-item' + (c.tons ? '' : ' off') + '" data-view="' + id + '" data-cat="' + esc(c.name) + '" title="' + esc(GHG_CODE[c.name] || c.name) + '">' +
            esc(c.name) + '<small>' + (c.tons ? n0(c.tons) + ' t' : '–') + '</small></button></li>';
        }).join("") + '</ul></div>';
    }).join("");
    document.querySelectorAll("#view-nav a, .side-dl").forEach(function (a) {
      if (a.getAttribute("data-view") === state.view) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    var tot = sc.eff.total, half = tot.tons ? (tot.high - tot.low) / 2 / tot.tons * 100 : 0;
    $("quick-stats").innerHTML =
      '<div><dt>Total</dt><dd>' + t(tot.tons) + '</dd></div>' +
      '<div><dt>Grade</dt><dd>' + esc(sc.eff.grade) + '</dd></div>' +
      '<div><dt>Confidence</dt><dd>±' + half.toFixed(0) + '%</dd></div>' +
      '<div class="plan' + (sc.rows.length ? '' : ' none') + '"><dt>With plan</dt><dd>' + (sc.rows.length ? t(sc.after) + ' · ' + esc(sc.grade) : '–') + '</dd></div>';
  }

  function renderHeader() {
    var p = profile();
    var sel = $("org-select");
    if (!sel.options.length) sel.innerHTML = SCALES.map(function (s) { return '<option value="' + s + '">' + SCALE_LABEL[s] + '</option>'; }).join("");
    sel.value = state.scale;
    document.querySelectorAll(".seg2 button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-path") === state.path)); });
    $("crumb").textContent = VIEW_LABEL[state.view];
    $("profile-title").textContent = p.label + " · " + p.sublabel;
    $("profile-sub").textContent = p.description;
    $("top-source").textContent = state.path === "closed_source" ? "Totals only" : "Detailed exports";
    document.querySelectorAll(".view").forEach(function (v) { v.classList.toggle("active", v.getAttribute("data-view") === state.view); });
  }

  // ---- Written summary: a plain sentence from the numbers, replaced by Gemini when it answers ----
  var summaryCache = {};
  function plainSummary(sc) {
    var eff = sc.eff, total = eff.total.tons, biggest = eff.scopes.slice().sort(function (a, b) { return b.tons - a.tons; })[0];
    var s = profile().label + " emits " + t(total) + " a year" + (eff.grade !== "N/A" ? ", grade " + eff.grade : "") + ". " +
      SCOPE_NAME[biggest.id] + " is the largest part at " + t(biggest.tons) + " (" + (total ? Math.round(biggest.tons / total * 100) : 0) + "%).";
    if (sc.rows.length) s += " The selected actions would cut " + t(sc.cut) + (sc.payback ? ", paying back in about " + Math.round(sc.payback) + " months." : ".");
    return s;
  }
  function renderSummary(sc) {
    var el = $("ai-summary"), k = key() + "|" + sc.eff.total.tons.toFixed(2) + "|" + sc.cut.toFixed(2);
    if (summaryCache[k]) { el.innerHTML = summaryText(summaryCache[k], "AI summary"); return; }
    el.innerHTML = summaryText(plainSummary(sc), "Summary from the numbers");
    if (!window.fetch) return;
    var eff = sc.eff;
    fetch("/api/ai", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "summarise", input: { report: {
        organisation: profile().label, total_t: Math.round(eff.total.tons * 10) / 10, grade: eff.grade,
        scopes: eff.scopes.map(function (x) { return { scope: SCOPE_NAME[x.id], t: Math.round(x.tons * 10) / 10 }; }),
        plan_cut_t: Math.round(sc.cut * 10) / 10, plan_cost_inr: Math.round(sc.cost)
      } } })
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.result && typeof j.result.summary === "string") {
        summaryCache[k] = j.result.summary.slice(0, 600);
        if (k === key() + "|" + sc.eff.total.tons.toFixed(2) + "|" + sc.cut.toFixed(2)) el.innerHTML = summaryText(summaryCache[k], "AI summary");
      }
    }).catch(function () { /* keep the plain summary */ });
  }
  function summaryText(text, label) {
    return '<p class="sum-label">' + esc(label) + '</p><p class="sum-text">' + esc(text) + '</p>';
  }

  // ---- Overview callouts: each one uses this profile's own numbers ----
  function renderCallouts(sc) {
    var eff = sc.eff, total = eff.total.tons || 0, cats = categories(eff);
    var s2 = eff.scopes.filter(function (x) { return x.id === "scope_2"; })[0];
    var elec = cats.filter(function (c) { return c.name === "Electricity"; })[0];
    var H = eff.total.high - eff.total.tons;
    var mix = { measured: 0, estimated: 0, illustrative: 0 };
    cats.forEach(function (c) { var k = c.kind === "totals" ? "estimated" : c.kind; if (mix[k] !== undefined) mix[k] += c.tons; });
    var ranked = path().actions.filter(function (a) { return a.tons > 0; }).map(function (a) {
      return { name: a.action, perT: a.cost_inr / a.tons, tons: a.tons };
    }).sort(function (a, b) { return a.perT - b.perT; });
    var used = cats.filter(function (c) { return c.tons > 0; });
    var cards = [];
    cards.push({ title: "Every number shows its formula", body: elec && elec.tons
        ? "Electricity: " + n0(inputs().kwh) + " kWh a year × 0.757 kg CO₂e per kWh = " + t(elec.tons) + ". The factor is the CEA grid figure, shown on the scope page."
        : "Each category shows its formula on hover, with the factor and its status.",
      link: "Scope 2 factors", goto: "scope_2" });
    cards.push({ title: "Confidence is shown per scope", body: eff.scopes.map(function (x) { return SCOPE_NAME[x.id] + " ±" + (x.confidence || "").replace(/[^\d]/g, "") + "%"; }).join(" · ") +
        ". Total range " + t(eff.total.low) + " to " + t(eff.total.high) + ".",
      link: "Upload data to narrow it", goto: "connect" });
    cards.push({ title: "Measured, estimated, illustrative", body: "Measured " + t(mix.measured) + " · Estimated " + t(mix.estimated) + " · Illustrative " + t(mix.illustrative) + ". The band is ±" + (total ? (H / total * 100).toFixed(0) : 0) + "% overall.",
      link: "See the breakdown", goto: "breakdown" });
    cards.push({ title: "Methods differ by category", body: used.slice(0, 3).map(function (c) { return c.name + ": " + (CAT_FORMULA[c.name] || c.formula); }).join(" ") || "No categories calculated yet.",
      link: "Open Scope 1", goto: "scope_1" });
    cards.push({ title: "Actions ranked by cost per tonne", body: ranked.length
        ? ranked.slice(0, 2).map(function (r) { return r.name + ": " + inr(r.perT) + " per tonne a year"; }).join(" · ") + ". Cost per tonne is the knowledge base's cost ÷ tonnes saved."
        : "No actions apply to this profile yet.",
      link: "See all actions", goto: "reduction" });
    cards.push({ title: "Plan against your budget", body: sc.rows.length
        ? "Your plan cuts " + t(sc.cut) + " for " + inr(sc.cost) + (sc.payback ? ", paying back in about " + Math.round(sc.payback) + " months." : ".")
        : "Tick actions, or let AI Apply choose within a budget. Nothing is ticked yet.",
      link: "Open the plan", goto: "reduction" });
    cards.push({ title: "Your inputs drive every chart", body: "Change fuel, electricity, renewable share or Scope 3 activity on the Reduction page. Totals, grade and charts update together. Saved reports do not change.",
      link: "Try an input", goto: "reduction" });
    $("callouts").innerHTML = cards.map(function (c) {
      return '<div class="callout"><h3>' + esc(c.title) + '</h3><p>' + esc(c.body) + '</p><a href="#" data-goto="' + c.goto + '">' + esc(c.link) + ' →</a></div>';
    }).join("");
  }

  // Organisations side by side: intensity per employee, and the scope mix of each total.
  function renderCompare() {
    var orgs = ALL.filter(function (p) {
      var P = p.paths.open_source;
      return p.id !== "individual" && P && (P.employees || p.employees);
    });
    var labels = orgs.map(function (p) { return p.label.replace(/^Case: /, "").replace(/ FY.*$/, ""); });
    var intensity = orgs.map(function (p) {
      var P = p.paths.open_source;
      return Math.round(P.total.tons / (P.employees || p.employees) * 100) / 100;
    });
    mountChart("compare-chart", { type: "bar", data: { labels: labels, datasets: [{ label: "t CO₂e per employee", data: intensity, backgroundColor: PALETTE.s1 }] },
      options: chartOptions({ plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }) });
    var share = function (scopeId) {
      return orgs.map(function (p) {
        var P = p.paths.open_source, tot = P.total.tons || 1;
        var sc = P.scopes.filter(function (x) { return x.id === scopeId; })[0];
        return Math.round((sc ? sc.tons : 0) / tot * 1000) / 10;
      });
    };
    mountChart("mix-compare", { type: "bar", data: { labels: labels, datasets: [
      { label: "Scope 1", data: share("scope_1"), backgroundColor: PALETTE.s1 },
      { label: "Scope 2", data: share("scope_2"), backgroundColor: PALETTE.s2 },
      { label: "Scope 3", data: share("scope_3"), backgroundColor: PALETTE.s3 }
    ] }, options: chartOptions({ scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, max: 100, beginAtZero: true, ticks: { callback: function (v) { return v + "%"; } } } } }) });
  }

  // ---- Overview ----
  function renderOverview(sc) {
    var eff = sc.eff, total = eff.total.tons || 0;
    var half = total ? (eff.total.high - eff.total.low) / 2 / total * 100 : 0;
    var hi = eff.total.high || 1;
    var mShare = total ? categories(eff).filter(function (c) { return c.kind === "measured"; }).reduce(function (a, c) { return a + c.tons; }, 0) / total * 100 : 0;
    var measured = mShare.toFixed(0);
    var drop = total && sc.cut ? sc.cut / total * 100 : 0;
    $("summary-cards").innerHTML =
      '<div class="card dark"><div class="label">Total footprint' + (isEdited() ? ' <span class="edited">What-if</span>' : '') + '</div><div class="value">' + t(total) +
        '</div><div class="sub">tCO₂e a year · ' + t(eff.total.low) + ' to ' + t(eff.total.high) + '</div>' +
        '<div class="range"><div class="band" style="left:' + (eff.total.low / hi * 100).toFixed(1) + '%;width:' + ((eff.total.high - eff.total.low) / hi * 100).toFixed(1) +
        '%"></div><div class="mid" style="left:' + (total / hi * 100).toFixed(1) + '%"></div></div></div>' +
      '<div class="card"><div class="label">Grade</div><div class="value">' + esc(eff.grade) + '</div><div class="sub">' + (eff.grade === "N/A" ? "Headcount not disclosed" : "t CO₂e per " + (profile().id === "individual" ? "person" : "employee")) + '</div></div>' +
      '<div class="card"><div class="label">Confidence</div><div class="value">±' + half.toFixed(0) + '%</div><div class="sub">Sum of each scope\'s range</div></div>' +
      '<div class="card"><div class="label">Measured data</div><div class="value">' + measured + '%</div><div class="sub">' +
        (drop ? '↓ ' + drop.toFixed(1) + '% with your plan' : 'Share from trackers, not estimates') + '</div></div>';

    $("scope-tiles").innerHTML = eff.scopes.map(function (s) {
      var share = total ? Math.round(s.tons / total * 100) : 0;
      return '<button class="tile' + (s.tons ? '' : ' empty') + '" data-view="' + s.id + '">' +
        '<span class="nm"><i class="' + SCOPE_CLASS[s.id] + '"></i>' + SCOPE_NAME[s.id] + '</span>' +
        '<strong>' + (s.tons ? t(s.tons) : '–') + '</strong>' +
        '<span class="go">' + (s.tons ? share + '% of total · open →' : 'No data · connect a tracker') + '</span>' +
        '<span class="tip">ƒ ' + esc(s.formula) + '</span></button>';
    }).join("");
    renderCaseCompare();
    renderTrend(total, sc, "trend-chart", "trend-note");
    renderSummary(sc);
    renderCallouts(sc);

    renderScopeDonut(eff);
    renderCompare();
    var cats = categories(eff);
    $("cat-list").innerHTML = '<table class="tbl cat-tbl"><thead><tr><th>Category</th><th>Scope</th><th class="num">tCO₂e</th><th class="num">Share</th><th>Data</th><th>Method</th></tr></thead><tbody>' + cats.map(function (c) {
      return '<tr' + (c.tons ? '' : ' class="off"') + '><td><b>' + esc(c.name) + '</b></td><td>' + SCOPE_NAME[c.scope] + '</td><td class="num">' + (c.tons ? t(c.tons) : '–') +
        '</td><td class="num">' + (c.tons && total ? (c.tons / total * 100).toFixed(1) + '%' : '–') + '</td><td>' + tag(c.kind) + '</td><td class="muted">' + esc(c.formula) + '</td></tr>';
    }).join("") + '</tbody></table>';
  }

  // Case studies: what the company disclosed next to what the public data lets us calculate.
  function renderCaseCompare() {
    var p = profile(), el = $("case-compare");
    if (!p.disclosed || !p.comparison) { el.innerHTML = ""; return; }
    var d = p.disclosed, disclosedTotal = d.scope_1 + d.scope_2_location + d.scope_3;
    el.innerHTML = '<div class="dcard"><div class="dcard-head"><h2>Disclosed vs calculated</h2><span class="muted small">' + esc(p.source) + '</span></div>' +
      '<p class="muted small" style="margin-bottom:12px">The company disclosed <b>' + t(disclosedTotal) + '</b> (location-based Scope 2). ' +
      'The totals above are only what our calculator can rebuild from the public data, so they are lower.</p>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Scope</th><th>Our calculation</th><th>Disclosed</th><th>Why they differ</th></tr></thead><tbody>' +
      p.comparison.map(function (r) {
        return '<tr><td><b>' + esc(r.scope) + '</b></td><td>' + (r.calculated_t === null ? '<span class="tag none">Not calculated</span>' : t(r.calculated_t)) +
          '</td><td>' + t(r.disclosed_t) + '</td><td class="muted">' + esc(r.note) + '</td></tr>';
      }).join("") + '</tbody></table></div></div>';
  }

  // ---- Connect ----
  // Tracker status is kept per browser, so a disconnect survives a reload.
  var CONN_KEY = "og-connections-v1";
  function disconnectedSet() {
    try { return JSON.parse(localStorage.getItem(CONN_KEY) || "{}"); } catch (e) { return {}; }
  }
  function setDisconnected(name, off) {
    var set = disconnectedSet();
    if (off) set[name] = true; else delete set[name];
    try { localStorage.setItem(CONN_KEY, JSON.stringify(set)); } catch (e) { /* storage unavailable: session only */ }
  }
  function renderConnect() {
    var srcs = path().sources, cats = categories(effPath()), connected = 0, off = disconnectedSet();
    var html = PLATFORMS.map(function (p) {
      var sourced = srcs.filter(function (s) { return s.scope === p.scope && p.match.test(s.tracker); })[0];
      var disc = !!off[p.name];
      var hit = sourced && !disc;
      if (hit) connected++;
      var cat = cats.filter(function (c) { return c.name === p.cat; })[0];
      var kind = hit ? (cat && cat.tons ? cat.kind : "measured") : "none";
      var body;
      if (hit && state.path === "closed_source") {
        body = '<div class="tc-total"><span>Total provided</span><strong>' + esc(sourced.detail) + '</strong><p class="muted small">Totals only: no detailed rows to chart.</p></div>';
      } else if (hit) {
        var d = platformData(p);
        body = d ? '<p class="tc-ct">' + esc(d.title) + '</p>' + d.chart +
            '<ul class="tc-sample">' + d.sample.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join("") + '</ul>'
          : '<div class="tc-total"><span>Data</span><strong>' + esc(sourced.detail) + '</strong></div>';
      } else if (sourced && disc) {
        body = '<div class="tc-total"><span>Disconnected in this browser</span><strong>Status only: the figures still come from the saved export.</strong></div>';
      } else {
        body = '<ol class="tc-steps">' + p.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join("") + '</ol>';
      }
      var actions = sourced && !disc
        ? '<button class="btn btn-ghost btn-small" data-disc="' + esc(p.name) + '">Disconnect</button>'
        : '<button class="btn btn-small" data-reconn="' + esc(p.name) + '">' + (sourced ? 'Reconnect' : 'Connect') + '</button>';
      return '<article class="tcard' + (hit ? ' ok' : '') + '">' +
        '<div class="tc-top"><div><h3>' + esc(p.name) + '</h3><p class="muted small">' + esc(p.note) + '</p></div>' +
        '<span class="tc-st">' + (hit ? '✓ Connected' : (sourced && disc ? '✗ Disconnected' : '✗ Not connected')) + '</span></div>' +
        '<div class="tc-tags"><span class="chip-s">' + SCOPE_NAME[p.scope] + '</span>' + tag(kind) +
          (hit ? '<span class="muted small">' + esc(sourced.tracker) + ' · ' + esc(sourced.format) + ' · ' + (platformRows(p) || 0) + (platformRows(p) === 1 ? ' row' : ' rows') + '</span>' : '') + '</div>' +
        body +
        '<div class="tc-actions">' + actions + (hit ? '<a class="btn btn-ghost btn-small" href="' + demoLink(p) + '">Open setup</a>' : '<a class="btn btn-ghost btn-small" href="' + demoLink(p) + '">Set up</a>') + '</div></article>';
    }).join("");
    $("connect-list").innerHTML = html;
    $("connect-head").innerHTML = '<div class="dcard ch"><div><h2>' + connected + ' of ' + PLATFORMS.length + ' trackers connected</h2>' +
      '<p class="muted small">Charts show the rows each export contains. Status is kept in this browser.</p></div>' +
      '<div class="ch-bar"><i style="width:' + (connected / PLATFORMS.length * 100).toFixed(0) + '%"></i></div></div>';
    var n = document.querySelector('[data-n="connect"]');
    if (n) n.textContent = connected + "/" + PLATFORMS.length;
  }
  function currentHash() {
    return "#" + state.scale + "/" + (state.path === "closed_source" ? "closed" : "open") + "/" + state.view;
  }
  function demoLink(p) {
    return p.demo + "?back=" + encodeURIComponent(currentHash());
  }
  function platformRows(p) {
    var raw = profile().raw || {};
    var map = { Fleet: raw.vehicles, "DG set": raw.dg_set ? [raw.dg_set] : null, Electricity: raw.energy_meter || raw.energy, Cloud: raw.cloud, Hardware: raw.hardware, Commute: raw.commute, Waste: raw.waste };
    var rows = map[p.cat];
    return rows ? rows.length : 0;
  }

  // ---- Scope views ----
  // Scope page: what the trackers supplied, what was filled in, and how each value was reached.
  var CAT_WORDS = { "Fleet": /vehicle|fleet|fuel/i, "DG set": /generator|\bdg\b/i, "Electricity": /electric|kwh|tariff/i,
    "Cloud": /cloud|gpu/i, "Hardware": /laptop|desktop|server|device|hardware/i, "Commute": /commut|travel|mode/i, "Waste": /waste/i };
  function scopeTables(id, s, srcs, gaps, cats, factors) {
    var basis = path().assumptions || [];
    var rowsOr = function (arr, fn, empty, cols) {
      return arr.length ? arr.map(fn).join("") : '<tr><td colspan="' + cols + '" class="muted">' + empty + '</td></tr>';
    };
    var supplied = rowsOr(srcs, function (x) {
      return '<tr><td><b>' + esc(x.tracker) + '</b></td><td>' + esc(x.format) + '</td><td>' + esc(x.detail) + '</td><td>' +
        tag(state.path === "closed_source" ? "totals" : "measured") + '</td></tr>';
    }, "No tracker feeds this scope.", 4);
    var missing = rowsOr(gaps, function (g) {
      return '<tr><td><b>' + esc(g) + '</b></td><td colspan="2" class="muted">Not in the trackers. Filled in from the rules or AI, see below.</td><td>' + tag("estimated") + '</td></tr>';
    }, "Nothing is missing from the trackers for this scope.", 4);
    var values = cats.filter(function (c) { return c.tons > 0; });
    var filled = rowsOr(values, function (c) {
      var words = CAT_WORDS[c.name];
      var why = (words && basis.filter(function (a) { return words.test(a); })[0]) || c.formula;
      return '<tr><td><b>' + esc(c.name) + '</b></td><td class="num">' + t(c.tons) + '</td><td>' + tag(c.kind) + '</td><td class="muted">' + esc(why) + '</td></tr>';
    }, "No values calculated for this scope.", 4);
    return '<div class="dcard"><h2>From your trackers</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tracker</th><th>Format</th><th>What it holds</th><th>Status</th></tr></thead><tbody>' + supplied + '</tbody></table></div></div>' +
      '<div class="dcard"><h2>Not supplied, filled in</h2><p class="muted small">Each estimate widens the confidence band. Replace it by connecting the tracker.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Item</th><th colspan="2">Note</th><th>Status</th></tr></thead><tbody>' + missing + '</tbody></table></div></div>' +
      '<div class="dcard"><h2>Values and how they were reached</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Category</th><th class="num">tCO₂e</th><th>Status</th><th>Basis: assumption or formula</th></tr></thead><tbody>' + filled + '</tbody></table></div></div>' +
      '<div class="dcard"><h2>How it was calculated</h2><div class="formula">Method: ' + esc(s.formula) + '</div>' +
        '<div class="tbl-wrap" style="margin-top:14px"><table class="tbl"><thead><tr><th>Factor</th><th>Value</th><th>Source</th><th>Status</th></tr></thead><tbody>' +
        factors.map(function (f) { return '<tr><td>' + esc(f.name) + '</td><td><code>' + esc(f.value) + '</code></td><td class="muted">' + esc(f.source) + '</td><td>' + tag(f.status) + '</td></tr>'; }).join("") +
        '</tbody></table></div></div>';
  }

  function renderScopeView(id, sc) {
    var el = document.querySelector('.view[data-view="' + id + '"]');
    var eff = sc.eff, s = eff.scopes.filter(function (x) { return x.id === id; })[0];
    var total = eff.total.tons || 0, kind = scopeKind(id, eff);
    var srcs = path().sources.filter(function (x) { return x.scope === id; });
    var cats = categories(eff).filter(function (c) { return c.scope === id; });
    var gaps = estimatesFor(id).map(function (e) { return e.charAt(0).toUpperCase() + e.slice(1); });
    if (id === "scope_3" && state.path === "closed_source") gaps.push("Totals only: Scope 3 needs activity data, so it is not calculated.");
    var factors = FACTORS.filter(function (f) { return f.scope === id; });
    var hi = s.high || 1;

    if (!s.tons) {
      el.innerHTML = '<div class="dcard blank"><span class="tag none">No data</span><h2>' + esc(s.label) + '</h2>' +
        '<p class="muted">None of the connected trackers has data for this scope' + (gaps.length ? ': ' + esc(gaps.join("; ")) : '') + '.</p>' +
        '<a class="btn btn-small" href="#" data-goto="connect">Connect a tracker</a></div>';
      return;
    }
    el.innerHTML =
      '<div class="scope-hero">' +
        '<div class="card dark"><div class="label">' + esc(s.label) + '</div><div class="value">' + t(s.tons) + '</div>' +
          '<div class="sub">' + t(s.low) + ' to ' + t(s.high) + '</div>' +
          '<div class="range"><div class="band" style="left:' + (s.low / hi * 100).toFixed(1) + '%;width:' + ((s.high - s.low) / hi * 100).toFixed(1) +
          '%"></div><div class="mid" style="left:' + (s.tons / hi * 100).toFixed(1) + '%"></div></div></div>' +
        '<div class="card"><div class="label">Confidence band</div><div class="value">' + esc(s.confidence) + '</div><div style="margin-top:8px">' + tag(kind) + '</div></div>' +
        '<div class="card"><div class="label">Share of total</div><div class="value">' + (total ? (s.tons / total * 100).toFixed(0) : 0) + '%</div><div class="sub">of ' + t(total) + '</div></div>' +
      '</div>' +
      scopeTables(id, s, srcs, gaps, cats, factors);
  }

  // ---- Reduction ----
  function scopeNotes(id) {
    var list = path().actions.filter(function (a) { return a.scope === id; }).slice(0, 2);
    return list.length ? list.map(function (a) { return a.action + (/^N\/A/.test(a.payback) ? " (recurring cost)" : " (pays back in " + a.payback + ")"); }).join("; ") : "No measure in the knowledge base for this scope.";
  }
  function renderReduction(sc) {
    var now = sc.eff.total.tons;
    var rows = sc.eff.scopes.map(function (s) {
      var cut = sc.scopeCut[s.id] || 0;
      return '<tr><th>' + SCOPE_NAME[s.id] + '</th><td class="num">' + t(s.tons) + '</td><td class="num">' + (cut ? '−' + t(cut) : '–') +
        '</td><td class="num">' + t(Math.max(0, s.tons - cut)) + '</td><td class="muted">' + esc(scopeNotes(s.id)) + '</td></tr>';
    }).join("");
    rows += '<tr class="tot"><th>Total</th><td class="num">' + t(now) + '</td><td class="num">' + (sc.cut ? '−' + t(sc.cut) : '–') +
      '</td><td class="num">' + t(sc.after) + '</td><td class="muted">' + (sc.cut ? 'Cuts ' + (sc.cut / now * 100).toFixed(1) + '% of the total' : 'Press AI Apply to see a cut') + '</td></tr>';
    rows += '<tr><th>Investment</th><td class="num">–</td><td class="num">–</td><td class="num">' + inr(sc.cost) + '</td><td class="muted">' +
      (sc.payback ? 'Pays back in ' + Math.round(sc.payback) + ' months from ' + inr(sc.saving) + ' saved a year' : (sc.cost ? 'No money payback on these actions' : 'One-off cost of the plan')) + '</td></tr>';
    rows += '<tr><th>Grade</th><td class="num">' + esc(sc.eff.grade) + '</td><td class="num">→</td><td class="num">' + esc(sc.grade) + '</td><td class="muted">Per-employee bands, see the methodology</td></tr>';
    $("scenario-out").innerHTML = rows;

    var names = sc.rows.map(function (r) { return "#" + (r.d.i + 1); });
    $("scenario-note").innerHTML = names.length
      ? 'If you do <b>' + names.join(" + ") + '</b>: cut <b>' + t(sc.cut) + '</b>, cost <b>' + inr(sc.cost) + '</b>, new grade <b>' + esc(sc.grade) + '</b>'
      : 'No plan yet. Press AI Apply.';
    renderNowPlan(sc);

    $("scenario-warn").innerHTML = '<p class="muted small fine-print">' +
      (sc.rows.length > 1 ? 'Actions on the same emissions apply one after another, so they don\'t double count; other overlaps are possible, so treat the cut as an upper bound. ' : '') +
      (sc.noSaving ? 'Some actions have no payback period (a recurring cost), so they add no money saved. ' : '') +
      'Cost and savings scale in proportion from the knowledge base\'s figures for each action. Slider caps are assumptions.</p>';
  }
  // Estimates filled in by the intake (AI or rules), with the reason for each.
  function renderMissing() {
    var list = path().assumptions || [];
    var el = $("missing-data");
    if (!list.length) { el.innerHTML = '<p class="muted small">Nothing is estimated on this path. Every figure comes from data you supplied.</p>'; return; }
    el.innerHTML = '<ul class="quality missing">' + list.map(function (a) {
      return '<li><span>' + esc(a) + '</span><span class="mbtns"><button class="btn btn-ghost btn-small" data-goto="connect">Upload real data</button></span></li>';
    }).join("") + '</ul><p class="muted small" style="margin-top:10px">Keep an estimate until a real figure replaces it; each one widens the range.</p>';
  }
  function optimise(sc, budget, priority) {
    var cands = sc.defs.filter(function (d) { return d.enabled; }).map(function (d) {
      var costPer = d.a.cost_inr / d.base, tonsPer = d.pool / 100, sv = annualSaving(d.a);
      return { d: d, costPer: costPer, tonsPer: tonsPer, eff: tonsPer / costPer, months: sv ? d.a.cost_inr / sv * 12 : Infinity };
    });
    var plan = {};
    sc.defs.forEach(function (d) { plan[d.i] = { on: false, pct: 0 }; });
    var left = budget, chosen = cands.slice();
    if (priority === "cost") {
      // Only actions that pay for themselves, quickest payback first, at their standard size.
      chosen = chosen.filter(function (c) { return isFinite(c.months); }).sort(function (a, b) { return a.months - b.months; });
      chosen.forEach(function (c) {
        var spend = c.d.a.cost_inr;
        if (spend <= left) { plan[c.d.i] = { on: true, pct: c.d.base }; left -= spend; }
      });
      return plan;
    }
    chosen.sort(function (a, b) { return b.eff - a.eff; });
    if (priority === "balanced") {
      // Skip the least cost-effective half: the last tonnes cost the most.
      var effs = chosen.map(function (c) { return c.eff; }).sort(function (a, b) { return a - b; });
      var median = effs[Math.floor((effs.length - 1) / 2)];
      chosen = chosen.filter(function (c) { return c.eff >= median; });
    }
    var used = {};
    chosen.forEach(function (c) {
      var room = c.d.def.max - (used[c.d.def.pool] || 0);
      var p = Math.max(0, Math.min(room, left / c.costPer));
      p = Math.floor(p * 10) / 10;
      if (p <= 0) return;
      plan[c.d.i] = { on: true, pct: p };
      used[c.d.def.pool] = (used[c.d.def.pool] || 0) + p;
      left -= p * c.costPer;
    });
    return plan;
  }
  // One button: the screen floods while the AI works, the plan is applied, then the water drains to it.
  var AI_BUDGET = 2500000; // planning budget, not shown to the user
  var aiBusy = false;
  function runAi() {
    if (aiBusy) return;
    aiBusy = true;
    var btn = $("ai-apply");
    btn.disabled = true;
    var finish = function () { aiBusy = false; btn.disabled = false; };
    var apply = function () {
      var sc = scenario();
      var target = optimise(sc, AI_BUDGET, "balanced");
      sc.defs.forEach(function (d) { sc.st[d.i].on = target[d.i].on; sc.st[d.i].pct = target[d.i].on ? target[d.i].pct : sc.st[d.i].pct; });
      live();
      var after = scenario();
      var now = after.eff.total.tons, ratio = now ? after.after / now : 1;
      showAiResult();
      var sub = after.rows.length
        ? "Grade " + after.grade + ". The water drains to " + Math.round(ratio * 100) + "% of today's level."
        : "Nothing fits the AI's budget, so the water stays where it is.";
      if (window.Flood) window.Flood.go(ratio, reduce ? 0 : 3500, "Plan applied", t(after.after) + " a year", sub);
      setTimeout(finish, reduce || !window.Flood ? 0 : 3600);
    };
    if (window.Flood) {
      window.Flood.reset();
      window.Flood.go(1, reduce ? 0 : 2500, "AI is working", "Reading your inputs", "The whole screen is today's emissions.");
      setTimeout(apply, reduce ? 0 : 2600);
    } else {
      apply();
      finish();
    }
  }
  function showAiResult() {
    var sc = scenario();
    $("ai-out").innerHTML = sc.rows.length
      ? 'Applied: cuts <b>' + t(sc.cut) + '</b>, costs <b>' + inr(sc.cost) + '</b>' +
        (sc.payback ? ', pays back in <b>' + Math.round(sc.payback) + ' months</b>' : '') + '. New grade <b>' + esc(sc.grade) + '</b>.'
      : 'The AI found no change to apply for this data.';
  }

  // Now vs the AI plan, per scope.
  function renderNowPlan(sc) {
    var scopes = sc.eff.scopes;
    var planned = scopes.map(function (s) { return Math.max(0, s.tons - (sc.scopeCut[s.id] || 0)); });
    mountChart("reduction-line", { type: "bar", data: {
      labels: scopes.map(function (s) { return SCOPE_NAME[s.id]; }),
      datasets: [
        { label: "Now", data: scopes.map(function (s) { return Math.round(s.tons * 10) / 10; }), backgroundColor: PALETTE.muted },
        { label: "AI plan", data: planned.map(function (v) { return Math.round(v * 10) / 10; }), backgroundColor: PALETTE.s1 }
      ] },
      options: chartOptions({ scales: { x: { grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: "tCO₂e a year" } } } }) });
    $("reduction-note").textContent = sc.rows.length ? "Cut " + t(sc.cut) + " a year" : "Press AI Apply to see the plan";
  }

  // ---- Data breakdown ----
  function renderBreakdown(sc) {
    var eff = sc.eff, cats = categories(eff), total = eff.total.tons || 0;
    var H = eff.total.high - eff.total.tons;
    var mix = { measured: 0, estimated: 0, illustrative: 0 };
    cats.forEach(function (c) { var k = c.kind === "totals" ? "estimated" : c.kind; if (mix[k] !== undefined) mix[k] += c.tons; });
    mountChart("mix-bar", { type: "doughnut", data: { labels: ["Measured", "Estimated", "Illustrative"],
      datasets: [{ data: [mix.measured, mix.estimated, mix.illustrative].map(function (v) { return Math.round(v * 10) / 10; }), backgroundColor: [PALETTE.s1, PALETTE.cut, "#cfd3c4"], borderWidth: 0 }] },
      options: chartOptions({ cutout: "62%", scales: {}, plugins: { legend: { display: false } } }) });
    var LBL = { measured: "Measured: from trackers", estimated: "Estimated: filled in or totals only", illustrative: "Illustrative: demo factors" };
    $("mix-legend").innerHTML = ["measured", "estimated", "illustrative"].map(function (k) {
      return '<div><i class="mx ' + k + '"></i><span>' + LBL[k] + '</span><b>' + t(mix[k]) + ' · ' + (total ? (mix[k] / total * 100).toFixed(0) : 0) + '%</b></div>';
    }).join("");
    $("mix-note").textContent = "Overall confidence ±" + (total ? (H / total * 100).toFixed(1) : 0) + "%";

    var assumed = path().assumptions || [];
    $("assumption-table").innerHTML = assumed.length
      ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Assumption and reasoning</th></tr></thead><tbody>' +
        assumed.map(function (a, i) { return '<tr class="flag"><td class="num">' + (i + 1) + '</td><td>' + esc(a) + '</td></tr>'; }).join("") +
        '</tbody></table></div>'
      : '<p class="muted small">Nothing is assumed on this path. Every figure comes from data you supplied.</p>';
    $("breakdown-table").innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Scope</th><th>Category</th><th>tCO₂e</th><th>Status</th><th>If you measure it</th></tr></thead><tbody>' +
      cats.map(function (c) {
        var impact = "–";
        if (c.tons && c.kind !== "measured" && c.band > 0.1 && total) {
          var nh = H - c.tons * (c.band - 0.1);
          impact = 'Confidence ±' + (H / total * 100).toFixed(1) + '% → ±' + (nh / total * 100).toFixed(1) + '%';
        } else if (!c.tons) impact = '<a href="#" data-goto="connect">Upload data</a>';
        var rowClass = !c.tons ? ' class="off"' : (c.kind === "measured" ? '' : ' class="flag"');
        return '<tr' + rowClass + '><td>' + SCOPE_NAME[c.scope] + '</td><td>' + esc(c.name) + '</td><td><b>' + (c.tons ? t(c.tons) : '–') + '</b></td><td>' +
          tag(c.kind) + '</td><td class="muted">' + impact + '</td></tr>';
      }).join("") + '</tbody></table></div>';

    $("factor-table").innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Factor</th><th>Value</th><th>Source</th><th>Status</th></tr></thead><tbody>' +
      FACTORS.map(function (f) { return '<tr><td>' + esc(f.name) + '</td><td><code>' + esc(f.value) + '</code></td><td class="muted">' + esc(f.source) + '</td><td>' + tag(f.status) + '</td></tr>'; }).join("") +
      '<tr><td>Grade bands</td><td>–</td><td class="muted">t CO₂e per employee (per person for individuals); thresholds are planning bands, see methodology</td><td>' + tag("illustrative") + '</td></tr></tbody></table></div>';
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
    var p = profile(), rows = ["scope,category,tCO2e,status,confidence"];
    var bySc = {}; path().scopes.forEach(function (s) { bySc[s.id] = s.confidence; });
    categories({ scopes: path().scopes, total: path().total }).forEach(function (c) {
      rows.push(c.scope + ',"' + c.name.replace(/"/g, "'") + '",' + c.tons.toFixed(2) + "," + c.kind + "," + bySc[c.scope]);
    });
    download(p.id + "-" + state.path + "-breakdown.csv", "text/csv", rows.join("\n") + "\n");
  }
  function downloadPdf() {
    var url = "report.html?org=" + encodeURIComponent(state.scale) + "&path=" + encodeURIComponent(state.path) + "&print=1";
    window.open(url, "_blank");
  }

  // ---- Rendering ----
  function live() {
    saveProjects();
    var sc = scenario();
    renderSidebar(sc);
    renderOverview(sc);
    ["scope_1", "scope_2", "scope_3"].forEach(function (id) { renderScopeView(id, sc); });
    renderReduction(sc);
    renderBreakdown(sc);
  }
  function render() {
    renderHeader();
    renderProjects();
    renderConnect();
    renderMissing();
    $("ai-out").innerHTML = "";
    live();
    window.history.replaceState(null, "", "#" + state.scale + "/" + (state.path === "closed_source" ? "closed" : "open") + "/" + state.view);
  }
  function go(view) {
    state.view = view;
    closeMenu();
    render();
    try { window.scrollTo(0, 0); } catch (e) { /* not available in tests */ }
  }
  function readHash() {
    var parts = window.location.hash.replace("#", "").split("/");
    if (SCALES.indexOf(parts[0]) !== -1) state.scale = parts[0];
    if (parts[1] === "closed") state.path = "closed_source";
    if (parts[1] === "open") state.path = "open_source";
    if (VIEWS.indexOf(parts[2]) !== -1) state.view = parts[2];
  }

  // ---- Wiring ----
  var snav = $("snav"), menuBtn = $("menu-btn");
  function closeMenu() { snav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }
  menuBtn.addEventListener("click", function () {
    var open = snav.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", function (e) {
    var b;
    if ((b = e.target.closest("[data-toggle]"))) { var g = b.getAttribute("data-toggle"); openGroups[g] = openGroups[g] === false; renderSidebar(scenario()); return; }
    if ((b = e.target.closest("a[data-view], button[data-view]"))) { e.preventDefault(); state.cat = b.getAttribute("data-cat") || null; go(b.getAttribute("data-view")); return; }
    if ((b = e.target.closest("[data-goto]"))) { e.preventDefault(); go(b.getAttribute("data-goto")); return; }
    if ((b = e.target.closest("[data-path]"))) { state.path = b.getAttribute("data-path"); render(); return; }
    if (e.target.id === "ai-apply") { runAi(); return; }
    if ((b = e.target.closest("[data-disc]"))) { setDisconnected(b.getAttribute("data-disc"), true); renderConnect(); live(); return; }
    if ((b = e.target.closest("[data-reconn]"))) { setDisconnected(b.getAttribute("data-reconn"), false); renderConnect(); live(); return; }
    if (e.target.id === "dl-json") { downloadJson(); return; }
    if (e.target.id === "dl-csv") { downloadCsv(); return; }
    if (e.target.id === "dl-pdf") { downloadPdf(); return; }
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "org-select") { state.scale = e.target.value; render(); return; }
    if (e.target.id === "project-select") {
      if (e.target.value === "__new__") {
        var name = window.prompt("Name for the new project", "Project " + (projects.list.length + 1));
        if (name && name.trim()) createProject(name.trim().slice(0, 60)); else render();
      } else switchProject(e.target.value);
      return;
    }
    if (e.target.id === "csv-input" && e.target.files && e.target.files[0]) {
      var reader = new FileReader();
      reader.onload = function () { importCsv(String(reader.result)); e.target.value = ""; };
      reader.readAsText(e.target.files[0]);
      return;
    }
  });
  if (!ALL.length) {
    $("main").innerHTML = '<p class="muted">Demo data did not load. Check that data/demo_fixtures.js is present.</p>';
    return;
  }
  if (window.Chart) { window.Chart.defaults.font.family = "Inter, system-ui, sans-serif"; window.Chart.defaults.color = "#646464"; }
  readHash();
  window.addEventListener("hashchange", function () { readHash(); render(); });
  render();
})();
