(function () {
  "use strict";

  var KEY = "og-individual-v1";
  var TARIFF = 7.5;
  var WORKING_WEEKS = 50;
  var form = document.getElementById("form");
  var out = document.getElementById("result");
  var M = null;

  function num(name) {
    var v = form.elements[name].value;
    return v === "" ? null : Number(v);
  }
  function factor(group, key) {
    var g = M.factors[group];
    if (key === undefined) return g.value;
    var f = g[key];
    return f && typeof f === "object" ? f.value : f;
  }
  function gradeFor(tPerPerson) {
    var bands = M.grading.bands.individual;
    for (var i = 0; i < bands.length; i++) {
      if (bands[i][0] === null || tPerPerson < bands[i][0]) return bands[i][1];
    }
    return "F";
  }
  function t(v) { return Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " t"; }

  // Confidence follows the methodology: full ±10%, partial ±25%, missing ±50%.
  function band(filled, of) {
    if (filled === of) return 10;
    return filled > 0 ? 25 : 50;
  }

  function calculate() {
    var fuel = form.elements.fuel.value;
    var km = num("km") || 0, eff = num("eff") || 0;
    var kwh = num("kwh"), bill = num("bill");
    var ren = Number(form.elements.ren.value) || 0;
    var commuteKm = num("commute_km") || 0, days = num("days") || 0, mode = form.elements.mode.value;
    var laptops = num("laptops") || 0, solid = num("solid") || 0, ewaste = num("ewaste") || 0;

    var s1 = fuel !== "none" && km > 0 ? km * eff / 100 * factor("fuel", fuel) / 1000 : 0;
    var s1Band = band(fuel !== "none" && km > 0 ? 1 : 0, 1);

    var monthlyKwh = kwh !== null && kwh > 0 ? kwh : (bill ? bill / TARIFF : 0);
    var s2 = monthlyKwh * 12 * (1 - ren / 100) * factor("grid") / 1000;
    var s2Band = kwh !== null && kwh > 0 ? 10 : (bill ? 25 : 50);

    var commuteKg = commuteKm * 2 * days * WORKING_WEEKS * factor("commute", mode);
    var deviceKg = laptops * factor("hardware_embodied_carbon", "laptop");
    var wasteKg = solid * 12 * factor("waste", "solid waste / landfill") + ewaste * factor("waste", "e-waste / recycling");
    var s3 = (commuteKg + deviceKg + wasteKg) / 1000;
    var s3Band = band([commuteKm > 0, laptops > 0, solid > 0 || ewaste > 0].filter(Boolean).length, 3);

    return {
      scopes: [
        { id: "scope_1", label: "Scope 1 · Your vehicle", tons: s1, band: s1Band, note: "Km × litres per 100 km × fuel factor" },
        { id: "scope_2", label: "Scope 2 · Electricity", tons: s2, band: s2Band, note: "kWh × 12 × (1 − renewable share) × 0.757" },
        { id: "scope_3", label: "Scope 3 · Commute, devices, waste", tons: s3, band: s3Band, note: "Commute × 2 (return trip) × days × 50 weeks × mode factor, plus devices and waste" }
      ]
    };
  }

  function render() {
    var r = calculate();
    var total = r.scopes.reduce(function (a, s) { return a + s.tons; }, 0);
    var low = 0, high = 0;
    r.scopes.forEach(function (s) { low += s.tons * (1 - s.band / 100); high += s.tons * (1 + s.band / 100); });
    var grade = gradeFor(total);
    var conf = total ? ((high - low) / 2 / total * 100) : 0;
    var rows = r.scopes.map(function (s) {
      var pct = total ? s.tons / total * 100 : 0;
      return '<div class="ind-row"><div><strong>' + s.label + '</strong><small>' + s.note + '</small></div>' +
        '<div class="ind-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
        '<b>' + t(s.tons) + '</b><span class="band">±' + s.band + '%</span></div>';
    }).join("");
    var hasAny = total > 0;
    out.innerHTML =
      '<div class="ind-cards">' +
        '<div class="card dark"><div class="label">Your footprint</div><div class="value">' + t(total) + '</div><div class="sub">per year · ' + t(low) + ' to ' + t(high) + '</div></div>' +
        '<div class="card"><div class="label">Grade</div><div class="value">' + grade + '</div><div class="sub">Per person: A under 1 t, F from 4 t. India averages about 2 t.</div></div>' +
        '<div class="card"><div class="label">Confidence</div><div class="value">±' + conf.toFixed(0) + '%</div><div class="sub">Fills in as you add real figures</div></div>' +
      '</div>' +
      '<div class="dcard"><h2>Breakdown</h2>' + rows + '</div>' +
      '<div class="ind-cta"><a class="btn" href="dashboard.html#individual/open/reduction">See reduction plan</a>' +
        '<button class="btn btn-ghost" type="button" id="dl">Download JSON</button></div>' +
      (hasAny ? '' : '<p class="muted small">Enter at least one figure to see a result.</p>');
    document.getElementById("dl").addEventListener("click", function () {
      var blob = new Blob([JSON.stringify({ total_tons: total, grade: grade, scopes: r.scopes, inputs: read() }, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "my-footprint.json";
      document.body.appendChild(a); a.click(); a.remove();
    });
  }

  function read() {
    var o = {};
    Array.prototype.forEach.call(form.elements, function (el) { if (el.name) o[el.name] = el.value; });
    return o;
  }
  function restore() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved) {
        Object.keys(saved).forEach(function (k) { if (form.elements[k]) form.elements[k].value = saved[k]; });
        document.getElementById("saved-note").textContent = "Saved in this browser.";
      }
    } catch (e) { /* storage unavailable: start blank */ }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(read())); document.getElementById("saved-note").textContent = "Saved in this browser."; }
    catch (e) { document.getElementById("saved-note").textContent = "Could not save in this browser."; }
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); save(); render(); });
  form.elements.ren.addEventListener("input", function () { document.getElementById("ren-out").textContent = form.elements.ren.value; });
  document.getElementById("reset").addEventListener("click", function () {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    form.reset(); document.getElementById("ren-out").textContent = "0"; out.innerHTML = "";
    document.getElementById("saved-note").textContent = "Cleared.";
  });

  fetch("data/methodology.json").then(function (r) { return r.json(); }).then(function (m) {
    M = m;
    restore();
    if (read().km || read().kwh || read().bill) render();
  }).catch(function () {
    out.innerHTML = '<p class="muted">Could not load the methodology file, so results cannot be calculated.</p>';
  });
})();
