(function () {
  "use strict";

  var KEY = "og-individual-activities-v1";
  var COMMUTE_DAYS = 250;
  var M = null;
  var mode = /[?&]mode=live\b/.test(location.search) ? "live" : "demo";
  var editing = null;

  var KINDS = {
    car_petrol: { label: "Car, petrol", scope: "scope_1", unit: "km a year", hint: "Distance driven in a year. Uses the methodology's car fuel use." },
    electricity: { label: "Electricity at home", scope: "scope_2", unit: "kWh a month", hint: "Monthly kWh from your meter or bill." },
    commute_car: { label: "Commute by car", scope: "scope_3", unit: "km one way, a day", hint: "The return trip is counted, over 250 working days." },
    laptop: { label: "Laptop in use", scope: "scope_3", unit: "laptops", hint: "Embodied carbon is spread over the device's life." },
    solid_waste: { label: "Solid waste", scope: "scope_3", unit: "kg a month", hint: "Sent to landfill." },
    ewaste: { label: "E-waste", scope: "scope_3", unit: "kg a year", hint: "Sent to recycling." }
  };
  var SCOPE_NAME = { scope_1: "Scope 1", scope_2: "Scope 2", scope_3: "Scope 3" };
  var DEMO = [
    { id: "d1", kind: "car_petrol", qty: 10000, source: "Own record" },
    { id: "d2", kind: "electricity", qty: 330, source: "Own record" },
    { id: "d3", kind: "commute_car", qty: 12, source: "Own record" },
    { id: "d4", kind: "laptop", qty: 1, source: "Own record" }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var rows = $("rows"), out = $("result"), form = $("add"), kindSel = $("kind");

  function factor(group, key) {
    var g = M.factors[group];
    if (key === undefined) return g.value;
    var f = g[key];
    return f && typeof f === "object" ? f.value : f;
  }
  function kg(kind, qty) {
    if (kind === "car_petrol") return qty * factor("fuel_efficiency", "car") / 100 * factor("fuel", "petrol");
    if (kind === "electricity") return qty * 12 * factor("grid");
    if (kind === "commute_car") return qty * 2 * COMMUTE_DAYS * factor("commute", "car");
    if (kind === "laptop") return qty * factor("hardware_embodied_carbon", "laptop");
    if (kind === "solid_waste") return qty * 12 * factor("waste", "solid waste / landfill");
    if (kind === "ewaste") return qty * factor("waste", "e-waste / recycling");
    return 0;
  }
  function band(list, scope) {
    var mine = list.filter(function (a) { return KINDS[a.kind].scope === scope; });
    if (!mine.length) return 50;
    if (mine.some(function (a) { return a.source === "Own record"; }) && mine.every(function (a) { return a.source === "Own record"; })) return 10;
    return 25;
  }
  function gradeFor(t) {
    if (t <= 0) return "–";
    var bands = M.grading.bands.individual;
    for (var i = 0; i < bands.length; i++) if (bands[i][0] === null || t < bands[i][0]) return bands[i][1];
    return "F";
  }
  function fmt(v) { return Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " t"; }
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function stored() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); $("saved-note").textContent = "Saved in this browser."; }
    catch (e) { $("saved-note").textContent = "Could not save in this browser."; }
  }
  function current() { return mode === "demo" ? DEMO : stored(); }

  function renderKinds() {
    kindSel.innerHTML = Object.keys(KINDS).map(function (k) {
      return '<option value="' + k + '">' + esc(KINDS[k].label) + ' (' + esc(KINDS[k].unit) + ')</option>';
    }).join("");
  }

  function renderRows() {
    var list = current();
    var live = mode === "live";
    rows.innerHTML = list.length ? list.map(function (a) {
      var k = KINDS[a.kind];
      return '<tr' + (editing === a.id ? ' class="flag"' : '') + '><td>' + SCOPE_NAME[k.scope] + '</td><td><b>' + esc(k.label) + '</b></td>' +
        '<td class="num">' + Number(a.qty).toLocaleString("en-IN") + '</td><td class="muted">' + esc(k.unit) + '</td>' +
        '<td class="num">' + fmt(kg(a.kind, a.qty) / 1000) + '</td><td>' + esc(a.source) + '</td><td>' +
        (live ? '<button class="btn btn-ghost btn-small" data-edit="' + a.id + '">Edit</button> <button class="btn btn-ghost btn-small" data-del="' + a.id + '">Delete</button>' : '') +
        '</td></tr>';
    }).join("") : '<tr><td colspan="7" class="muted">No activities yet. Add one below.</td></tr>';
    form.hidden = mode !== "live";
    $("table-title").textContent = mode === "demo" ? "Sample activities (not saved)" : "Your activities";
    $("mode-note").textContent = mode === "demo"
      ? "A sample person, so you can see how a footprint is built. Nothing here is saved."
      : "Add, edit or delete your own activities. They are saved in this browser and the footprint updates as you go.";
    document.querySelectorAll("[data-mode]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-mode") === mode)); });
  }

  function renderResult() {
    var list = current();
    var by = { scope_1: 0, scope_2: 0, scope_3: 0 };
    list.forEach(function (a) { by[KINDS[a.kind].scope] += kg(a.kind, a.qty) / 1000; });
    var total = by.scope_1 + by.scope_2 + by.scope_3;
    var grade = gradeFor(total);
    var lo = 0, hi = 0;
    ["scope_1", "scope_2", "scope_3"].forEach(function (sc) {
      var b = band(list, sc) / 100;
      lo += by[sc] * (1 - b); hi += by[sc] * (1 + b);
    });
    out.innerHTML =
      '<div class="ind-cards">' +
        '<div class="card dark"><div class="label">Your footprint</div><div class="value">' + fmt(total) + '</div><div class="sub">per year · ' + fmt(lo) + ' to ' + fmt(hi) + '</div></div>' +
        '<div class="card"><div class="label">Grade</div><div class="value">' + grade + '</div><div class="sub">Per person: A under 1 t, F from 4 t. India averages about 2 t.</div></div>' +
        '<div class="card"><div class="label">Confidence</div><div class="value">±' + (total ? ((hi - lo) / 2 / total * 100).toFixed(0) : 0) + '%</div><div class="sub">Your own records narrow it; estimates widen it</div></div>' +
      '</div>' +
      '<div class="dcard"><h2>By scope</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Scope</th><th class="num">tCO₂e a year</th><th class="num">Band</th><th>Formula</th></tr></thead><tbody>' +
        ["scope_1", "scope_2", "scope_3"].map(function (sc) {
          return '<tr><td><b>' + SCOPE_NAME[sc] + '</b></td><td class="num">' + fmt(by[sc]) + '</td><td class="num">±' + band(list, sc) + '%</td><td class="muted">' +
            (sc === "scope_1" ? "Km × 7 L per 100 km × 2.29 kg per litre (petrol)" : sc === "scope_2" ? "kWh × 12 × 0.757 kg per kWh" : "Commute × 2 × 250 days × 0.15 kg per km, plus laptops and waste") + '</td></tr>';
        }).join("") +
      '</tbody></table></div></div>' +
      '<div class="ind-cta"><a class="btn" href="dashboard.html#individual/open/reduction">See reduction plan</a></div>';
  }

  function refresh() {
    renderRows(); renderResult();
    var n = current().length;
    $("guide-count").textContent = mode === "demo" ? "This is a sample. Press Your tracker to start your own."
      : n ? "You have " + n + " activit" + (n === 1 ? "y" : "ies") + " saved. Add more, or check your footprint below."
      : "You have no activities yet. Start with step 1.";
  }

  function setEditing(id) {
    editing = id;
    var a = stored().filter(function (x) { return x.id === id; })[0];
    if (a) {
      kindSel.value = a.kind;
      form.elements.qty.value = a.qty;
      form.elements.source.value = a.source;
    }
    $("submit").textContent = "Save changes";
    $("cancel").hidden = false;
    $("add-hint").textContent = KINDS[kindSel.value].hint;
    refresh();
  }
  function resetForm() {
    editing = null;
    form.reset();
    $("submit").textContent = "Add activity";
    $("cancel").hidden = true;
    $("add-hint").textContent = KINDS[kindSel.value].hint;
    refresh();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var qty = Number(form.elements.qty.value);
    if (!isFinite(qty) || qty < 0) { $("add-hint").textContent = "Enter an amount of zero or more."; return; }
    var list = stored();
    var entry = { id: editing || "a" + Date.now().toString(36), kind: kindSel.value, qty: qty, source: form.elements.source.value };
    if (editing) list = list.map(function (x) { return x.id === editing ? entry : x; });
    else list.push(entry);
    save(list);
    resetForm();
  });
  $("cancel").addEventListener("click", resetForm);
  kindSel.addEventListener("change", function () { $("add-hint").textContent = KINDS[kindSel.value].hint; });

  rows.addEventListener("click", function (e) {
    var b = e.target.closest("[data-edit],[data-del]");
    if (!b) return;
    if (b.hasAttribute("data-edit")) { setEditing(b.getAttribute("data-edit")); return; }
    var id = b.getAttribute("data-del");
    save(stored().filter(function (x) { return x.id !== id; }));
    if (editing === id) resetForm();
    refresh();
  });

  document.querySelectorAll("[data-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      mode = b.getAttribute("data-mode");
      editing = null;
      resetForm();
    });
  });

  fetch("data/methodology.json").then(function (r) { return r.json(); }).then(function (m) {
    M = m;
    renderKinds();
    $("add-hint").textContent = KINDS[kindSel.value].hint;
    refresh();
  }).catch(function () {
    out.innerHTML = '<p class="muted">Could not load the methodology file, so results cannot be calculated.</p>';
  });
})();
