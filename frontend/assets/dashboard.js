(function () {
  "use strict";

  var ALL = window.DEMO_FIXTURES || [];
  var SCALES = ["individual", "small_scale", "large_scale", "case_tcs", "case_infosys"];
  var SCALE_LABEL = {
    individual: "Individual", small_scale: "Small-scale campus", large_scale: "Large-scale enterprise",
    case_tcs: "TCS · FY 2025-26 (case study)", case_infosys: "Infosys · FY 2025-26 (case study)"
  };
  var VIEWS = ["overview", "scope_1", "scope_2", "scope_3", "reduction", "breakdown", "export"];
  var VIEW_LABEL = {
    overview: "Overview", scope_1: "Scope 1 · Direct fuel", scope_2: "Scope 2 · Purchased power",
    scope_3: "Scope 3 · Value chain", reduction: "Reduction & AI Apply", breakdown: "Data breakdown", export: "Download & export"
  };
  var SCOPE_NAME = { scope_1: "Scope 1", scope_2: "Scope 2", scope_3: "Scope 3" };
  var SCOPE_CLASS = { scope_1: "c1", scope_2: "c2", scope_3: "c3" };
  var DIESEL = 2.68, GRID = 0.757;

  // Trackers the platform can read. Status comes from the profile's sources.
  var PLATFORMS = [
    { name: "Fleet & fuel log", note: "Fuel-log CSV export (e.g. Fuelio): vehicle, fuel type, distance", scope: "scope_1", match: /fuel|vehicle|fleet/i, demo: "tracker-demo/fuelio.html" },
    { name: "DG set log", note: "Run-hours and litres per hour, entered as a form", scope: "scope_1", match: /\bDG\b/, demo: "tracker-demo/index.html" },
    { name: "Energy meter", note: "Monthly kWh export from a smart meter, with the grid region", scope: "scope_2", match: /meter|electricity|bill/i, demo: "tracker-demo/energy-meter.html" },
    { name: "Cloud bill", note: "Usage export (e.g. AWS): instance-hours by region", scope: "scope_3", match: /cloud/i, demo: "tracker-demo/aws.html" },
    { name: "Asset register", note: "Device counts by type, for embodied carbon", scope: "scope_3", match: /asset|device/i, demo: "tracker-demo/index.html" },
    { name: "Commute survey", note: "Distance and travel mode per person", scope: "scope_3", match: /commute/i, demo: "tracker-demo/index.html" },
    { name: "Waste log", note: "Monthly kg by waste type and disposal route", scope: "scope_3", match: /waste/i, demo: "tracker-demo/index.html" }
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

  var state = { scale: "small_scale", path: "open_source", view: "overview", edits: {}, levers: {} };
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var $ = function (id) { return document.getElementById(id); };
  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function t(v) { return Number(v).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " t"; }
  function inr(v) { return "₹" + Math.round(v).toLocaleString("en-IN"); }
  function pct(v) { return (Math.round(v * 10) / 10) + "%"; }
  function key() { return state.scale + "|" + state.path; }
  function profile() { return ALL.filter(function (p) { return p.id === state.scale; })[0] || ALL[0]; }
  function path() { return profile().paths[state.path] || profile().paths.open_source; }
  function baseScope(id) { return path().scopes.filter(function (s) { return s.id === id; })[0]; }
  function estimatesFor(id) { return profile().paths.open_source.intake.estimates[id] || []; }
  function bandOf(s) { return (parseFloat(String(s.confidence).replace(/[^\d.]/g, "")) || 0) / 100; }
  function gradeFor(bands, tons) {
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
      rows.push({ d: d, pct: s.pct, cut: c, cost: d.a.cost_inr * scale });
    });
    var after = Math.max(0, eff.total.tons - cut);
    return {
      eff: eff, defs: defs, st: st, rows: rows, cut: cut, cost: cost, saving: saving, noSaving: noSaving,
      after: after, grade: gradeFor(path().grade_bands, after), scopeCut: scopeCut,
      payback: saving ? cost / saving * 12 : null
    };
  }

  // ---- Chart: emissions over the next five years ----
  function chart(el, today, after, hasPlan) {
    var years = ["FY 25-26", "FY 26-27", "FY 27-28", "FY 28-29", "FY 29-30", "FY 30-31"];
    var W = 1000, H = 260, L = 64, R = 44, T = 18, B = 36;
    var max = Math.max(today, 0.0001) * 1.15;
    var x = function (i) { return L + i * (W - L - R) / (years.length - 1); };
    var y = function (v) { return T + (1 - v / max) * (H - T - B); };
    var bau = years.map(function (_, i) { return [x(i), y(today)]; });
    var plan = years.map(function (_, i) { return [x(i), y(i === 0 ? today : after)]; });
    var line = function (pts) { return pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(""); };
    var grid = [0, 0.5, 1].map(function (f) {
      var v = max / 1.15 * f;
      return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="gl"/>' +
        '<text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" class="ax" text-anchor="end">' + Math.round(v).toLocaleString("en-IN") + '</text>';
    }).join("");
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Emissions projection">' + grid +
      years.map(function (yr, i) { return '<text x="' + x(i) + '" y="' + (H - 10) + '" class="ax" text-anchor="middle">' + yr + '</text>'; }).join("") +
      '<path d="' + line(bau) + '" class="ln bau"/>' +
      (hasPlan ? '<path d="' + line(plan) + 'L' + x(years.length - 1) + ' ' + (H - B) + 'L' + x(0) + ' ' + (H - B) + 'Z" class="area"/><path d="' + line(plan) + '" class="ln plan"/>' : '') +
      (hasPlan ? plan : bau).map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4" class="pt"/>'; }).join("") +
      '</svg><div class="chart-legend"><span><i class="bau"></i>Today\'s level held (tCO₂e)</span>' + (hasPlan ? '<span><i class="plan"></i>With your plan</span>' : '') + '</div>';
  }

  // ---- Sidebar ----
  function renderSidebar(sc) {
    var sel = $("org-select");
    if (!sel.options.length) sel.innerHTML = SCALES.map(function (s) { return '<option value="' + s + '">' + SCALE_LABEL[s] + '</option>'; }).join("");
    sel.value = state.scale;
    document.querySelectorAll(".seg2 button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-path") === state.path)); });

    var srcs = path().sources;
    $("connect-list").innerHTML = PLATFORMS.map(function (p, i) {
      var hit = srcs.filter(function (s) { return s.scope === p.scope && p.match.test(s.tracker); })[0];
      return '<div class="cn' + (hit ? ' ok' : '') + '" data-cn="' + i + '" tabindex="0" role="button" aria-expanded="false">' +
        '<div class="cn-top"><strong>' + esc(p.name) + '</strong><span>' + (hit ? '✓ Connected' : '✗ Not connected') + '</span></div>' +
        '<p>' + esc(p.note) + '</p>' +
        '<div class="cn-more">' + (hit ? '<p><b>' + esc(hit.tracker) + '</b> · ' + esc(hit.format) + ' · ' + esc(hit.detail) + '</p>' : '<p>No ' + esc(SCOPE_NAME[p.scope]) + ' data from this source yet.</p>') +
        '<a href="' + p.demo + '">' + (hit ? 'Reconnect →' : 'Connect →') + '</a></div></div>';
    }).join("");

    document.querySelectorAll("#scope-sel button").forEach(function (b) {
      var id = b.getAttribute("data-view"), s = sc.eff.scopes.filter(function (x) { return x.id === id; })[0];
      b.classList.toggle("empty", !s.tons);
      b.setAttribute("aria-pressed", String(state.view === id));
      b.innerHTML = SCOPE_NAME[id] + '<small>' + (s.tons ? Math.round(s.tons).toLocaleString("en-IN") + ' t' : 'No data') + '</small>';
    });
    document.querySelectorAll("#view-nav a").forEach(function (a) {
      if (a.getAttribute("data-view") === state.view) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });

    var tot = sc.eff.total, half = tot.tons ? (tot.high - tot.low) / 2 / tot.tons * 100 : 0;
    $("quick-stats").innerHTML =
      '<div><dt>Total</dt><dd>' + t(tot.tons) + '</dd></div>' +
      '<div><dt>Grade</dt><dd>' + esc(sc.eff.grade) + '</dd></div>' +
      '<div><dt>Confidence</dt><dd>±' + half.toFixed(0) + '%</dd></div>' +
      (sc.rows.length ? '<div class="plan"><dt>With plan</dt><dd>' + t(sc.after) + ' · ' + esc(sc.grade) + '</dd></div>' : '');
  }

  function renderHeader() {
    var p = profile();
    $("crumb").textContent = VIEW_LABEL[state.view];
    $("profile-title").textContent = p.label + " · " + p.sublabel;
    $("profile-sub").textContent = p.description;
    $("top-source").textContent = state.path === "closed_source" ? "Totals only" : "Detailed exports";
    document.querySelectorAll(".view").forEach(function (v) { v.classList.toggle("active", v.getAttribute("data-view") === state.view); });
  }

  // ---- 1. Overview ----
  function renderOverview(sc) {
    var eff = sc.eff, total = eff.total.tons || 0;
    var half = total ? (eff.total.high - eff.total.low) / 2 / total * 100 : 0;
    var hi = eff.total.high || 1;
    var drop = total && sc.cut ? sc.cut / total * 100 : 0;
    $("summary-cards").innerHTML =
      '<div class="card dark"><div class="label">Total footprint' + (isEdited() ? ' <span class="edited">What-if</span>' : '') + '</div><div class="value">' + t(total) +
        '</div><div class="sub">tCO₂e a year · ' + t(eff.total.low) + ' to ' + t(eff.total.high) + '</div>' +
        '<div class="range"><div class="band" style="left:' + (eff.total.low / hi * 100).toFixed(1) + '%;width:' + ((eff.total.high - eff.total.low) / hi * 100).toFixed(1) +
        '%"></div><div class="mid" style="left:' + (total / hi * 100).toFixed(1) + '%"></div></div></div>' +
      '<div class="card"><div class="label">Grade</div><div class="value">' + esc(eff.grade) + '</div><div class="sub">Illustrative benchmark bands</div></div>' +
      '<div class="card"><div class="label">Confidence</div><div class="value">±' + half.toFixed(0) + '%</div><div class="sub">Sum of each scope\'s range</div></div>' +
      '<div class="card"><div class="label">Trend</div><div class="value">' + (drop ? '↓ ' + drop.toFixed(1) + '%' : '–') + '</div><div class="sub">' +
        (drop ? 'With your plan, from FY 26-27' : 'One year of data. <a href="#" data-goto="reduction">Build a plan</a>') + '</div></div>';

    chart($("trend-chart"), total, sc.after, sc.rows.length > 0);
    $("trend-note").textContent = "Projection: assumes activity stays at today's level. No earlier years on file.";

    $("split-bar").innerHTML = eff.scopes.map(function (s) {
      return '<i class="' + SCOPE_CLASS[s.id] + '" style="width:' + (total ? s.tons / total * 100 : 0).toFixed(1) + '%" title="' + SCOPE_NAME[s.id] + '"></i>';
    }).join("");
    var cats = categories(eff), max = Math.max.apply(null, cats.map(function (c) { return c.tons; }).concat([0.0001]));
    $("cat-list").innerHTML = cats.map(function (c) {
      return '<div class="cat' + (c.tons ? '' : ' off') + '" tabindex="0"><span class="cname"><i class="' + SCOPE_CLASS[c.scope] + '"></i>' + esc(c.name) +
        '<small>' + SCOPE_NAME[c.scope] + '</small></span><span class="cbar"><i style="width:' + (c.tons / max * 100).toFixed(1) + '%"></i></span>' +
        '<b>' + (c.tons ? t(c.tons) : '–') + '</b>' + tag(c.kind) +
        '<span class="ftip">ƒ ' + esc(c.formula) + '</span></div>';
    }).join("");
  }

  // ---- Scope views ----
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
        '<a class="btn btn-small" href="tracker-demo/index.html">Connect a tracker</a></div>';
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
      '<div class="two">' +
        '<div class="dcard"><h2>Measured data from trackers</h2><div class="src-list">' +
          (srcs.length ? srcs.map(function (x) {
            return '<div class="src"><span class="ico">' + esc(x.tracker.split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join("").toUpperCase()) +
              '</span><div><strong>' + esc(x.tracker) + '</strong><span>' + esc(x.format) + ' · ' + esc(x.detail) + '</span></div>' +
              tag(state.path === "closed_source" ? "totals" : "measured") + '</div>';
          }).join("") : '<div class="empty">No tracker feeds this scope.</div>') +
        '</div></div>' +
        '<div class="dcard" id="scope-panel"><h2>Categories</h2>' + cats.map(function (c) {
          return '<div class="driver' + (c.tons ? '' : ' off') + '"><span>' + esc(c.name) + ' ' + tag(c.kind) + '</span><span class="num">' + (c.tons ? t(c.tons) : '–') +
            '</span><div class="bar"><i style="width:' + (s.tons ? c.tons / s.tons * 100 : 0).toFixed(1) + '%"></i></div></div>';
        }).join("") + '</div>' +
      '</div>' +
      '<div class="dcard"><h2>How it was calculated</h2><div class="formula">Method: ' + esc(s.formula) + '</div>' +
        '<div class="tbl-wrap" style="margin-top:14px"><table class="tbl"><thead><tr><th>Factor</th><th>Value</th><th>Source</th><th>Status</th></tr></thead><tbody>' +
        factors.map(function (f) { return '<tr><td>' + esc(f.name) + '</td><td><code>' + esc(f.value) + '</code></td><td class="muted">' + esc(f.source) + '</td><td>' + tag(f.status) + '</td></tr>'; }).join("") +
        '</tbody></table></div></div>' +
      (gaps.length ? '<div class="dcard"><h2>Low or missing data</h2><p class="muted small" style="margin-bottom:12px">Filled by the intake estimator (rules, or Gemini when a key is set). Each estimate widens the band.</p><ul class="quality">' +
        gaps.map(function (g) { return '<li><span>' + esc(g) + '</span>' + tag("estimated") + '</li>'; }).join("") + '</ul></div>' : '');
  }

  // ---- 2. Reduction ----
  function renderLevers(sc) {
    $("levers").innerHTML = sc.defs.length ? sc.defs.map(function (d) {
      var s = sc.st[d.i], sv = annualSaving(d.a);
      return '<div class="lever' + (d.enabled ? '' : ' off') + (s.on ? ' on' : '') + '" data-lever="' + d.i + '">' +
        '<label class="lv-pick"><input type="checkbox" data-pick="' + d.i + '"' + (s.on ? ' checked' : '') + (d.enabled ? '' : ' disabled') + '>' +
        '<span><b>#' + (d.i + 1) + ' ' + esc(d.a.action) + '</b><small>' + esc(SCOPE_NAME[d.a.scope] || d.a.scope) + ' · ' + Number(d.a.roi).toFixed(2) + ' t per ₹ lakh' +
        (sv === null ? ' · no direct saving' : ' · payback ' + esc(d.a.payback)) + '</small></span></label>' +
        (d.enabled
          ? '<div class="lv-ctl"><span class="lv-label">' + esc(d.def.label) + '</span>' +
            '<input type="range" min="0" max="' + d.def.max + '" step="0.1" value="' + Math.round(s.pct * 10) / 10 + '" data-pct="' + d.i + '" aria-label="' + esc(d.def.label) + '">' +
            '<span class="lv-num"><input type="number" min="0" max="' + d.def.max + '" step="0.1" value="' + Math.round(s.pct * 10) / 10 + '" data-pct="' + d.i + '" aria-label="' + esc(d.def.label) + ', percent">%</span>' +
            '<span class="lv-res" data-res="' + d.i + '"></span></div>'
          : '<div class="lv-ctl"><span class="muted small">No data for the emissions this action targets.</span></div>') +
        '</div>';
    }).join("") : '<div class="empty">No reduction action applies here yet. The knowledge base has no actions for individuals.</div>';
  }
  function updateLeverResults(sc) {
    sc.defs.forEach(function (d) {
      var el = document.querySelector('[data-res="' + d.i + '"]');
      if (!el) return;
      var s = sc.st[d.i], scale = d.base ? s.pct / d.base : 0;
      el.textContent = "−" + t(d.pool * s.pct / 100) + " · " + inr(d.a.cost_inr * scale);
      var row = document.querySelector('[data-lever="' + d.i + '"]');
      row.classList.toggle("on", !!s.on);
    });
  }
  function renderScenarioOut(sc) {
    $("scenario-out").innerHTML =
      '<div><span>Emissions cut</span><strong>' + (sc.cut ? '−' + t(sc.cut) : '–') + '</strong></div>' +
      '<div><span>Total after</span><strong>' + t(sc.after) + '</strong></div>' +
      '<div><span>Grade after</span><strong>' + esc(sc.grade) + '</strong></div>' +
      '<div><span>Cost</span><strong>' + inr(sc.cost) + '</strong></div>' +
      '<div><span>Money saved / yr</span><strong>' + (sc.saving ? inr(sc.saving) : '–') + '</strong></div>' +
      '<div><span>Payback</span><strong>' + (sc.payback ? Math.round(sc.payback) + ' months' : '–') + '</strong></div>';
    var names = sc.rows.map(function (r) { return "#" + (r.d.i + 1); });
    $("scenario-note").textContent = names.length
      ? "If you do " + names.join(" + ") + ": cut " + t(sc.cut) + ", cost " + inr(sc.cost) + ", new grade " + sc.grade
      : "Tick actions below to stack them";
    $("scenario-warn").innerHTML = (sc.rows.length > 1 ? '<p class="warn">Actions on the same emissions are applied one after another, so they don\'t double count. Other overlaps are possible, so treat the cut as an upper bound.</p>' : '') +
      (sc.noSaving ? '<p class="muted small" style="margin-top:8px">Some actions have no payback period (a recurring cost), so they add no money saved.</p>' : '') +
      '<p class="muted small" style="margin-top:8px">Cost and savings scale in proportion from the knowledge base\'s figures for each action. Slider caps are assumptions.</p>';
    chart($("scenario-chart"), sc.eff.total.tons, sc.after, sc.rows.length > 0);
  }
  function renderEdits() {
    var v = inputs(), b = baseInputs();
    var fields = [
      { k: "litres", label: "Fuel burned (Scope 1)", unit: "litres a year, diesel-equivalent", step: 100, on: b.litres > 0 },
      { k: "kwh", label: "Electricity used (Scope 2)", unit: "kWh a year", step: 100, on: b.kwh > 0 },
      { k: "renewable", label: "Renewable share (Scope 2)", unit: "% of electricity, market-based view", step: 5, max: 100, on: b.kwh > 0 },
      { k: "s3pct", label: "Scope 3 activity", unit: "% of today: staff, devices, travel, waste", step: 5, on: baseScope("scope_3").tons > 0 }
    ];
    $("edits").innerHTML = fields.map(function (f) {
      return '<label class="edit' + (f.on ? '' : ' off') + '"><span>' + f.label + '</span>' +
        '<input type="number" min="0"' + (f.max ? ' max="' + f.max + '"' : '') + ' step="' + f.step + '" data-edit="' + f.k + '" value="' + v[f.k] + '"' + (f.on ? '' : ' disabled') + '>' +
        '<em>' + (f.on ? f.unit : 'No tracker data') + '</em></label>';
    }).join("");
  }

  // ---- 3. AI Apply: search the levers for the best plan within the budget ----
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
  var anim = null;
  function aiApply() {
    var sc = scenario();
    var budget = Math.max(0, Number($("ai-budget").value) || 0);
    var target = optimise(sc, budget, $("ai-priority").value);
    var from = {};
    sc.defs.forEach(function (d) { from[d.i] = sc.st[d.i].pct; sc.st[d.i].on = target[d.i].on; });
    var start = null, dur = reduce ? 0 : 900;
    if (anim) cancelAnimationFrame(anim);
    function frame(ts) {
      if (start === null) start = ts;
      var k = dur ? Math.min(1, (ts - start) / dur) : 1;
      var e = 1 - Math.pow(1 - k, 3);
      sc.defs.forEach(function (d) {
        var to = target[d.i].on ? target[d.i].pct : from[d.i];
        sc.st[d.i].pct = Math.round((from[d.i] + (to - from[d.i]) * e) * 10) / 10;
        document.querySelectorAll('[data-pct="' + d.i + '"]').forEach(function (inp) { inp.value = sc.st[d.i].pct; });
        var cb = document.querySelector('[data-pick="' + d.i + '"]');
        if (cb) cb.checked = sc.st[d.i].on;
      });
      live();
      if (k < 1) anim = requestAnimationFrame(frame);
      else { anim = null; showAiResult(); }
    }
    if (dur) anim = requestAnimationFrame(frame); else frame(0);
  }
  function showAiResult() {
    var sc = scenario();
    $("ai-out").innerHTML = sc.rows.length
      ? '<p class="ai-say"><b>Suggested plan:</b> ' + sc.rows.map(function (r) {
          return esc(r.d.a.action) + ' → ' + pct(r.pct) + ' ' + esc(r.d.def.label.toLowerCase());
        }).join(", ") + '.</p>' +
        '<p class="ai-sum">Cuts <b>' + t(sc.cut) + '</b> · costs <b>' + inr(sc.cost) + '</b>' +
        (sc.payback ? ' · pays back in <b>' + Math.round(sc.payback) + ' months</b>' : '') + ' · new grade <b>' + esc(sc.grade) + '</b></p>'
      : '<div class="empty">Nothing fits this budget and priority.</div>';
  }

  // ---- 4. Data breakdown ----
  function renderBreakdown(sc) {
    var eff = sc.eff, cats = categories(eff), total = eff.total.tons || 0;
    var H = eff.total.high - eff.total.tons;
    var mix = { measured: 0, estimated: 0, illustrative: 0 };
    cats.forEach(function (c) { mix[c.kind === "totals" ? "estimated" : c.kind] = (mix[c.kind === "totals" ? "estimated" : c.kind] || 0) + c.tons; });
    $("mix-bar").innerHTML = ["measured", "estimated", "illustrative"].map(function (k) {
      return '<i class="mx ' + k + '" style="width:' + (total ? mix[k] / total * 100 : 0).toFixed(1) + '%"></i>';
    }).join("");
    var LBL = { measured: "Measured: from trackers", estimated: "Estimated: filled in or totals only", illustrative: "Illustrative: demo factors" };
    $("mix-legend").innerHTML = ["measured", "estimated", "illustrative"].map(function (k) {
      return '<div><i class="mx ' + k + '"></i><span>' + LBL[k] + '</span><b>' + t(mix[k]) + ' · ' + (total ? (mix[k] / total * 100).toFixed(0) : 0) + '%</b></div>';
    }).join("");
    $("mix-note").textContent = "Overall confidence ±" + (total ? (H / total * 100).toFixed(0) : 0) + "%";

    $("breakdown-table").innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Scope</th><th>Category</th><th>tCO₂e</th><th>Status</th><th>If you measure it</th></tr></thead><tbody>' +
      cats.map(function (c) {
        var impact = "–";
        if (c.tons && c.kind !== "measured" && c.band > 0.1 && total) {
          var nh = H - c.tons * (c.band - 0.1);
          impact = 'Confidence ±' + (H / total * 100).toFixed(1) + '% → ±' + (nh / total * 100).toFixed(1) + '%';
        } else if (!c.tons) impact = '<a href="tracker-demo/index.html">Upload data</a>';
        return '<tr' + (c.tons ? '' : ' class="off"') + '><td>' + SCOPE_NAME[c.scope] + '</td><td>' + esc(c.name) + '</td><td><b>' + (c.tons ? t(c.tons) : '–') + '</b></td><td>' +
          tag(c.kind) + '</td><td class="muted">' + impact + '</td></tr>';
      }).join("") + '</tbody></table></div>';

    $("factor-table").innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Factor</th><th>Value</th><th>Source</th><th>Status</th></tr></thead><tbody>' +
      FACTORS.map(function (f) { return '<tr><td>' + esc(f.name) + '</td><td><code>' + esc(f.value) + '</code></td><td class="muted">' + esc(f.source) + '</td><td>' + tag(f.status) + '</td></tr>'; }).join("") +
      '<tr><td>Grade bands</td><td>–</td><td class="muted">Illustrative benchmarks, not a sourced standard</td><td>' + tag("illustrative") + '</td></tr></tbody></table></div>';
  }

  // ---- 5. Downloads ----
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
    var base = { scopes: path().scopes, total: path().total };
    categories(base).forEach(function (c) {
      rows.push(c.scope + ',"' + c.name.replace(/"/g, "'") + '",' + c.tons.toFixed(2) + "," + c.kind + "," + bySc[c.scope]);
    });
    download(p.id + "-" + state.path + "-breakdown.csv", "text/csv", rows.join("\n") + "\n");
  }
  function downloadPdf() {
    document.body.classList.add("print-all");
    window.print();
    setTimeout(function () { document.body.classList.remove("print-all"); }, 500);
  }

  // ---- Rendering ----
  function live() {
    var sc = scenario();
    renderSidebar(sc);
    renderOverview(sc);
    ["scope_1", "scope_2", "scope_3"].forEach(function (id) { renderScopeView(id, sc); });
    renderScenarioOut(sc);
    updateLeverResults(sc);
    renderBreakdown(sc);
  }
  function render() {
    renderHeader();
    renderEdits();
    renderLevers(scenario());
    $("ai-out").innerHTML = "";
    live();
    window.history.replaceState(null, "", "#" + state.scale + "/" + (state.path === "closed_source" ? "closed" : "open") + "/" + state.view);
  }
  function go(view) {
    state.view = view;
    closeMenu();
    render();
    if (window.scrollTo) try { window.scrollTo(0, 0); } catch (e) { /* jsdom */ }
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
    if ((b = e.target.closest("a[data-view], button[data-view]"))) { e.preventDefault(); go(b.getAttribute("data-view")); return; }
    if ((b = e.target.closest("[data-goto]"))) { e.preventDefault(); go(b.getAttribute("data-goto")); return; }
    if ((b = e.target.closest("[data-path]"))) { state.path = b.getAttribute("data-path"); render(); return; }
    if ((b = e.target.closest("[data-cn]")) && !e.target.closest("a")) {
      var open = b.classList.toggle("open");
      b.setAttribute("aria-expanded", String(open));
      return;
    }
    if (e.target.id === "ai-apply") { aiApply(); return; }
    if (e.target.id === "dl-json") { downloadJson(); return; }
    if (e.target.id === "dl-csv") { downloadCsv(); return; }
    if (e.target.id === "dl-pdf") { downloadPdf(); return; }
    if (e.target.id === "reset-edits") {
      state.edits[key()] = baseInputs();
      delete state.levers[key()];
      renderEdits(); renderLevers(scenario()); live();
    }
  });
  document.addEventListener("keydown", function (e) {
    var b = e.target.closest && e.target.closest("[data-cn]");
    if (b && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); b.click(); }
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "org-select") { state.scale = e.target.value; render(); return; }
    if (e.target.matches("[data-pick]")) {
      var sc = scenario();
      sc.st[e.target.getAttribute("data-pick")].on = e.target.checked;
      live();
    }
  });
  document.addEventListener("input", function (e) {
    var k = e.target.getAttribute && e.target.getAttribute("data-edit");
    if (k) {
      var v = Math.max(0, Number(e.target.value) || 0);
      if (k === "renewable") v = Math.min(100, v);
      inputs()[k] = v;
      // Pools change with the inputs, so the levers are rebuilt around them.
      renderLevers(scenario());
      live();
      return;
    }
    var i = e.target.getAttribute && e.target.getAttribute("data-pct");
    if (i !== null && i !== undefined) {
      var sc = scenario(), max = Number(e.target.max) || 100;
      var val = Math.max(0, Math.min(max, Number(e.target.value) || 0));
      sc.st[i].pct = val;
      sc.st[i].on = true;
      document.querySelectorAll('[data-pct="' + i + '"]').forEach(function (inp) { if (inp !== e.target) inp.value = val; });
      var cb = document.querySelector('[data-pick="' + i + '"]');
      if (cb) cb.checked = true;
      live();
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
