(function () {
  "use strict";

  var ALL = window.DEMO_FIXTURES || [];
  var M = window.METHODOLOGY || {};
  var q = new URLSearchParams(location.search);
  var profile = ALL.filter(function (p) { return p.id === (q.get("org") || "small_scale"); })[0] || ALL[0];
  var pathKey = q.get("path") === "closed_source" ? "closed_source" : "open_source";
  var P = profile.paths[pathKey] || profile.paths.open_source;
  var SCOPE = { scope_1: "Scope 1 · Direct emissions", scope_2: "Scope 2 · Purchased electricity", scope_3: "Scope 3 · Other indirect emissions" };
  var today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function tn(v) { return Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function tons(v) { return tn(v) + " t"; }
  function inr(v) { return "₹" + Math.round(v).toLocaleString("en-IN"); }
  var TBD = '<span class="tbd">To be provided</span>';
  function table(head, rows, opts) {
    opts = opts || {};
    return '<table class="ledger"><thead><tr>' + head.map(function (h, i) {
      return '<th' + (opts.num && opts.num.indexOf(i) !== -1 ? ' class="num"' : '') + '>' + esc(h) + '</th>';
    }).join("") + '</tr></thead><tbody>' + rows.map(function (r) {
      return '<tr' + (r.total ? ' class="total"' : '') + '>' + r.cells.map(function (c, i) {
        return '<td' + (opts.num && opts.num.indexOf(i) !== -1 ? ' class="num"' : '') + '>' + c + '</td>';
      }).join("") + '</tr>';
    }).join("") + '</tbody></table>';
  }
  function section(n, title, body) {
    return '<section class="sec"><h2><span>' + n + '</span>' + esc(title) + '</h2>' + body + '</section>';
  }

  var grade = P.grade, total = P.total.tons;
  var employees = P.employees || profile.employees;
  var perEmp = employees ? total / employees : null;
  var basis = M.grading ? M.grading.basis : "";
  var scopes = P.scopes;

  var cover =
    '<header class="cover">' +
      '<p class="kicker">Greenhouse gas emissions report</p>' +
      '<h1>' + esc(profile.label) + ': ' + esc(profile.sublabel) + '</h1>' +
      '<table class="meta"><tbody>' +
        '<tr><th>Data basis</th><td>' + (pathKey === "open_source" ? "Detailed tracker exports, with labelled estimates" : "Totals only (litres and kWh); Scope 3 not calculated") + '</td></tr>' +
        '<tr><th>Reporting period</th><td>' + TBD + ' (the data provided is a single year)</td></tr>' +
        '<tr><th>Prepared</th><td>' + today + '</td></tr>' +
        '<tr><th>Status</th><td><b>Draft for review. Not independently assured.</b></td></tr>' +
      '</tbody></table>' +
    '</header>';

  var s1 = section(1, "Organisation",
    table(["Item", "Value", "Source of value"], [
      { cells: ["Organisation", esc(profile.label), "Demo or case profile"] },
      { cells: ["Description", esc(profile.description), "Profile"] },
      { cells: ["Headcount", employees ? Number(employees).toLocaleString("en-IN") : TBD, employees ? "Tracker or profile" : "Not in the data supplied"] },
      { cells: ["Corporate identity number", TBD, "Company records"] },
      { cells: ["Registered office", TBD, "Company records"] },
      { cells: ["Organisational boundary", "Operations covered by the data above; sites and subsidiaries " + TBD, "Company records"] }
    ]));

  var s2 = section(2, "Summary of results",
    table(["Measure", "Value", "Note"], [
      { cells: ["Total emissions", tons(total), "Scope 1 + Scope 2 + Scope 3, as calculated"] },
      { cells: ["Range", tons(P.total.low) + " to " + tons(P.total.high), "Sum of each scope's confidence band"] },
      { cells: ["Intensity", perEmp ? tn(perEmp) + " t per employee" : TBD, employees ? "Total ÷ headcount" : "Headcount needed to calculate"] },
      { cells: ["Grade", esc(grade), perEmp ? "Per-employee bands in the methodology" : "Not graded: no headcount"] }
    ], { num: [1] }) +
    '<p class="note">' + esc(basis) + '</p>');

  var scopeRows = [];
  scopes.forEach(function (sc) {
    var none = !sc.tons && !(sc.drivers || []).length;
    scopeRows.push({ total: true, cells: ["<b>" + esc(SCOPE[sc.id]) + "</b>", "", none ? '<span class="tbd">Not calculated</span>' : "<b>" + tons(sc.tons) + "</b>", none ? "–" : esc(sc.confidence), esc(sc.formula)] });
    (sc.drivers || []).forEach(function (d) {
      scopeRows.push({ cells: ["&nbsp;&nbsp;" + esc(d.name), "", tons(d.tons), "", ""] });
    });
  });
  var s3 = section(3, "Emissions by scope and category",
    table(["Scope and category", "Basis", "tCO₂e a year", "Confidence", "Method"], scopeRows, { num: [2] }) +
    '<p class="note">Categories marked illustrative use demo factors, not verified sources. See section 6.</p>');

  var kwh = scopes[1] && scopes[1].tons ? scopes[1].tons * 1000 / 0.757 : 0;
  var s4 = section(4, "Energy and other indicators",
    table(["Indicator", "Value", "Basis"], [
      { cells: ["Electricity consumed", kwh ? Math.round(kwh).toLocaleString("en-IN") + " kWh a year" : TBD, "Derived: Scope 2 tCO₂e ÷ 0.757 kg per kWh"] },
      { cells: ["Share of electricity from renewable sources", TBD, "Supplier or meter records"] },
      { cells: ["Fuel consumed (Scope 1)", TBD, "Fuel logs; the totals are in section 3"] },
      { cells: ["Waste generated", TBD, "Vendor logs"] },
      { cells: ["Refrigerant leakage (HFC)", "Not calculated", "No factor in the methodology"] },
      { cells: ["Business travel", "Not calculated", "Needs travel records"] },
      { cells: ["Purchased goods and services", "Not calculated", "Needs supplier data"] }
    ]));

  var fac = [];
  Object.keys(M.factors || {}).forEach(function (g) {
    var v = M.factors[g];
    if (v && typeof v === "object" && "value" in v) {
      fac.push({ cells: [esc(g), esc(v.value) + " " + esc(v.unit || ""), esc(v.source || ""), esc(v.status || "")] });
    } else if (v && typeof v === "object") {
      Object.keys(v).forEach(function (k) {
        var f = v[k];
        if (f && typeof f === "object" && f.value != null) fac.push({ cells: [esc(g + " · " + k), esc(f.value) + " " + esc(f.unit || ""), esc(f.source || ""), esc(f.status || "")] });
      });
    }
  });
  var s5 = section(5, "Emission factors and sources", table(["Factor", "Value", "Source", "Status"], fac));

  var assumed = P.assumptions || [];
  var s6 = section(6, "Assumptions and estimates",
    assumed.length
      ? table(["#", "Assumption and reasoning"], assumed.map(function (a, i) { return { cells: [String(i + 1), esc(a)] }; }), { num: [0] })
      : '<p class="note">No values were estimated on this path. Every figure comes from data supplied.</p>');

  var acts = (P.actions || []).slice(0, 5);
  var s7 = section(7, "Reduction options considered",
    acts.length
      ? table(["Action", "Scope", "Saving, tCO₂e a year", "Cost", "Payback"], acts.map(function (a) {
          return { cells: [esc(a.action), esc(SCOPE[a.scope] || a.scope), tn(a.tons), inr(a.cost_inr), esc(a.payback || "")] };
        }), { num: [2, 3] }) +
        '<p class="note">Savings and costs come from the knowledge base, and are planning assumptions to verify before relying on them.</p>'
      : '<p class="note">No reduction option applies to this profile.</p>');

  var s8 = section(8, "Limitations",
    '<ul class="notes">' +
      '<li>Confidence bands: ' + scopes.map(function (sc) { return esc(SCOPE[sc.id]) + " " + esc(sc.confidence); }).join("; ") + '.</li>' +
      '<li>Scope 3 values that use illustrative factors are not verified and must not be published as measured.</li>' +
      '<li>Totals-only data cannot give Scope 3; see the data basis on the cover.</li>' +
      '<li>Factors are as stated in section 5 and are not independently checked here.</li>' +
    '</ul>');

  var sign = section(9, "Review and sign-off",
    '<table class="sign"><tbody>' +
      '<tr><th>Prepared by</th><td class="line"></td><th>Date</th><td class="line"></td></tr>' +
      '<tr><th>Reviewed by</th><td class="line"></td><th>Date</th><td class="line"></td></tr>' +
      '<tr><th>Approved by</th><td class="line"></td><th>Date</th><td class="line"></td></tr>' +
    '</tbody></table>' +
    '<p class="note">Method: greenhouse gas emissions are estimated from activity data and emission factors, with the assumptions shown above. This report has not been independently verified.</p>');

  document.getElementById("report").innerHTML = cover + s1 + s2 + s3 + s4 + s5 + s6 + s7 + s8 + sign;
  document.title = "Emissions report · " + profile.label;

  var back = q.get("back") || "";
  if (/^#[a-z_0-9]+\/(open|closed)\/[a-z_0-9]+$/.test(back)) {
    var link = document.querySelector('.toolbar a[href="dashboard.html"]');
    if (link) link.href = "dashboard.html" + back;
  }
  document.getElementById("print").addEventListener("click", function () { window.print(); });
  if (q.get("print") === "1") setTimeout(function () { window.print(); }, 400);
})();
