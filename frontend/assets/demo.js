(function () {
  "use strict";

  var FIXTURES = window.DEMO_FIXTURES || [];

  var STEPS = [
    { id: "connect", title: "Connect trackers" },
    { id: "intake", title: "Intake & validation" },
    { id: "calculate", title: "Scope calculation" },
    { id: "reduce", title: "Reduction plan" },
    { id: "report", title: "Report" }
  ];

  var PATHS = {
    open: { key: "open_source", label: "Open-source data", sub: "Full exports · tighter range" },
    closed: { key: "closed_source", label: "Closed-source data", sub: "Totals only · ±40%" }
  };

  var PROFILE_IDS = ["individual", "small_scale", "large_scale", "large_scale_partial"];
  var SCOPE_SHORT = { scope_1: "Scope 1", scope_2: "Scope 2", scope_3: "Scope 3" };
  var CONFIDENCE_TEXT = { full_data: "Full data", partial_data: "Partial data", overview_only: "Overview only" };

  var state = { profile: "individual", path: "open", step: 0 };

  var profileToggle = document.getElementById("profile-toggle");
  var pathToggle = document.getElementById("path-toggle");
  var stepper = document.getElementById("stepper");
  var stage = document.getElementById("stage");

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

  // Payback comes from the report as text ("12 months", or "N/A (recurring cost)").
  function fmtPayback(payback) {
    return typeof payback === "string" ? payback : String(payback);
  }

  function bandRange(band) {
    return band.to === null ? band.from + " t and above" : band.from + " to " + band.to + " t";
  }

  function currentProfile() {
    return FIXTURES.filter(function (p) { return p.id === state.profile; })[0];
  }

  function currentPath(profile) {
    return profile.paths[PATHS[state.path].key];
  }

  // URL form: #<profile>/<open|closed>/<step 0-4>, so each view can be linked.
  function readHash() {
    var parts = window.location.hash.replace("#", "").split("/");
    if (PROFILE_IDS.indexOf(parts[0]) !== -1) state.profile = parts[0];
    if (parts[1] === "open" || parts[1] === "closed") state.path = parts[1];
    var step = Number(parts[2]);
    if (parts[2] !== undefined && step >= 0 && step < STEPS.length) state.step = step;
  }

  function writeHash() {
    var next = "#" + state.profile + "/" + state.path + "/" + state.step;
    if (window.location.hash !== next) {
      history.replaceState(null, "", next);
    }
  }

  function buildToggles() {
    profileToggle.innerHTML = FIXTURES.map(function (p) {
      return '<button type="button" data-profile="' + esc(p.id) + '"><strong>' + esc(p.label) +
        '</strong><span>' + esc(p.sublabel) + '</span></button>';
    }).join("");

    pathToggle.innerHTML = Object.keys(PATHS).map(function (key) {
      return '<button type="button" data-path="' + key + '"><strong>' + esc(PATHS[key].label) +
        '</strong><span>' + esc(PATHS[key].sub) + '</span></button>';
    }).join("");

    profileToggle.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-profile]");
      if (!button) return;
      state.profile = button.getAttribute("data-profile");
      update();
    });

    pathToggle.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-path]");
      if (!button) return;
      state.path = button.getAttribute("data-path");
      update();
    });
  }

  function buildStepper() {
    stepper.innerHTML = STEPS.map(function (step, index) {
      return '<button type="button" data-step="' + index + '"><span class="num">' + (index + 1) +
        '</span>' + esc(step.title) + '</button>';
    }).join("");

    stepper.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-step]");
      if (!button) return;
      state.step = Number(button.getAttribute("data-step"));
      update();
    });
  }

  function syncControls() {
    Array.prototype.forEach.call(profileToggle.querySelectorAll("button"), function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-profile") === state.profile));
    });
    Array.prototype.forEach.call(pathToggle.querySelectorAll("button"), function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-path") === state.path));
    });
    Array.prototype.forEach.call(stepper.querySelectorAll("button"), function (button) {
      var index = Number(button.getAttribute("data-step"));
      if (index === state.step) {
        button.setAttribute("aria-current", "step");
      } else {
        button.removeAttribute("aria-current");
      }
    });
  }

  function pathBadge(key) {
    return key === "open"
      ? '<span class="badge badge-open">Open-source data</span>'
      : '<span class="badge badge-closed">Closed-source data</span>';
  }

  function renderConnect(profile, path, key) {
    return '' +
      '<h2>Connect trackers</h2>' +
      '<p class="lede">We read the metadata your existing tools export. Nothing is retyped.</p>' +
      '<p>' + pathBadge(key) + '</p>' +
      '<p class="lede">' + esc(path.summary) + '</p>' +
      '<div class="source-grid">' +
      path.sources.map(function (source) {
        return '<article class="source"><span class="scope-chip">' + esc(SCOPE_SHORT[source.scope]) + '</span>' +
          '<h3>' + esc(source.tracker) + '</h3>' +
          '<span class="meta">' + esc(source.format) + '</span>' +
          '<p>' + esc(source.detail) + '</p></article>';
      }).join("") +
      '</div>';
  }

  function renderIntake(profile, path, key) {
    var rows = path.scopes.map(function (scope) {
      var dataPath = path.intake.data_path[scope.id];
      var confidence = path.intake.confidence_metadata[scope.id];
      var estimates = path.intake.estimates[scope.id] || [];
      var assumed = estimates.length
        ? '<ul>' + estimates.map(function (note) { return '<li>' + esc(note) + '</li>'; }).join("") + '</ul>'
        : '<span class="badge badge-muted">None</span>';
      return '<tr><td class="nowrap">' + esc(SCOPE_SHORT[scope.id]) + '</td>' +
        '<td><span class="badge ' + (dataPath === "open_source" ? "badge-open" : "badge-closed") + '">' +
        (dataPath === "open_source" ? "Open source" : "Closed source") + '</span></td>' +
        '<td>' + esc(CONFIDENCE_TEXT[confidence] || confidence) + ' (' + esc(scope.confidence) + ')</td>' +
        '<td>' + assumed + '</td></tr>';
    }).join("");

    return '' +
      '<h2>Intake & validation</h2>' +
      '<p class="lede">Every file is checked. Anything missing is estimated and marked, so the range reflects it.</p>' +
      '<div class="kv">' +
      '<div><span>User type</span><strong>' + esc(profile.label) + '</strong></div>' +
      '<div><span>Tier</span><strong>' + esc(profile.tier) + '</strong></div>' +
      '<div><span>Sub-type</span><strong>' + esc(profile.sublabel) + '</strong></div>' +
      '<div><span>Data source</span><strong>' + esc(PATHS[key].label) + '</strong></div>' +
      '</div>' +
      '<div class="table-wrap"><table><thead><tr><th>Scope</th><th>Data path</th><th>Confidence</th><th>Assumptions made</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  function renderCalculate(profile, path) {
    var cards = path.scopes.map(function (scope) {
      var max = Math.max.apply(null, scope.drivers.map(function (d) { return d.tons; }).concat([0.0001]));
      var drivers = scope.drivers.map(function (driver) {
        var width = (driver.tons / max * 100).toFixed(1);
        return '<div class="driver"><span>' + esc(driver.name) + '</span>' +
          '<span class="driver-value">' + fmtTons(driver.tons) + '</span>' +
          '<div class="driver-bar"><i style="width:' + width + '%"></i></div></div>';
      }).join("");

      return '<article class="scope-card">' +
        '<span class="scope-chip">' + esc(SCOPE_SHORT[scope.id]) + '</span>' +
        '<div class="scope-head"><h3>' + esc(scope.label) + '</h3><span class="scope-tons">' + fmtTons(scope.tons) + '</span></div>' +
        '<p class="range-line">Range ' + fmtTons(scope.low) + ' to ' + fmtTons(scope.high) + ' (' + esc(scope.confidence) + ')</p>' +
        drivers +
        '<p class="formula">Method: ' + esc(scope.formula) + '</p>' +
        '</article>';
    }).join("");

    return '' +
      '<h2>Scope calculation</h2>' +
      '<p class="lede">Each scope is calculated from its drivers. The bars show how much each driver contributes.</p>' +
      '<div class="scope-grid">' + cards + '</div>';
  }

  function renderReduce(profile, path) {
    var noActions = path.actions.length === 0;
    var rows = path.actions.map(function (action, index) {
      return '<tr><td>' + (index + 1) + '</td>' +
        '<td><strong>' + esc(action.action) + '</strong><div class="actions-note">' + esc(action.description) + '</div>' +
        (action.placeholder ? '<span class="badge badge-muted">Placeholder</span>' : '') + '</td>' +
        '<td class="nowrap">' + esc(SCOPE_SHORT[action.scope]) + '</td>' +
        '<td class="num-cell">' + fmtTons(action.tons) + ' / yr</td>' +
        '<td class="num-cell">' + fmtInr(action.cost_inr) + '</td>' +
        '<td class="num-cell">' + esc(fmtPayback(action.payback)) + '</td>' +
        '<td class="num-cell">' + Number(action.roi).toFixed(2) + '</td>' +
        '<td><button class="btn btn-ghost btn-small" type="button" data-scenario="' + index + '">See impact</button></td></tr>';
    }).join("");

    if (noActions) {
      return '' +
        '<h2>Reduction plan</h2>' +
        '<p class="lede">No reduction action from the knowledge base applies at this scale yet. The knowledge base has no actions for individuals, and the rules skip actions whose inputs are missing or below threshold.</p>';
    }

    return '' +
      '<h2>Reduction plan</h2>' +
      '<p class="lede">Actions that apply to this profile, ranked by tons saved per lakh of rupees.</p>' +
      '<div class="table-wrap"><table><thead><tr><th>#</th><th>Action</th><th>Scope</th><th class="num-cell">Saves</th>' +
      '<th class="num-cell">Cost</th><th class="num-cell">Payback</th><th class="num-cell">t per ₹ lakh</th><th></th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<p class="actions-note">An action appears only when its threshold is met. For example, the CNG action applies when Scope 1 is above 50 t. Numbers come from the knowledge base, not a language model.</p>';
  }

  function renderReport(profile, path, key) {
    var bands = path.grade_bands.map(function (band) {
      return '<div class="band' + (band.grade === path.grade ? ' current' : '') + '"><b>' + esc(band.grade) +
        '</b>' + esc(bandRange(band)) + '</div>';
    }).join("");

    var breakdown = path.scopes.map(function (scope) {
      var share = path.total.tons ? (scope.tons / path.total.tons * 100) : 0;
      return '<li>' + esc(SCOPE_SHORT[scope.id]) + ': ' + fmtTons(scope.tons) + ' (' + share.toFixed(0) + '%)</li>';
    }).join("");

    var top = path.actions.slice(0, 3).map(function (action) {
      return '<li>' + esc(action.action) + (action.placeholder ? ' (placeholder)' : '') + ': saves ' +
        fmtTons(action.tons) + ' a year for ' + fmtInr(action.cost_inr) + '</li>';
    }).join("");

    var notes = path.notes.map(function (note) { return '<li>' + esc(note) + '</li>'; }).join("");

    return '' +
      '<h2>Report</h2>' +
      '<div class="grade-row">' +
      '<div class="grade" aria-label="Grade ' + esc(path.grade) + '">' + esc(path.grade) + '</div>' +
      '<div>' +
      '<p class="lede" style="margin-bottom:6px">' + esc(profile.label) + ' · ' + esc(profile.sublabel) + '</p>' +
      '<div class="kv" style="margin-bottom:0">' +
      '<div><span>Total footprint</span><strong>' + fmtTons(path.total.tons) + ' CO₂e a year</strong></div>' +
      '<div><span>Range</span><strong>' + fmtTons(path.total.low) + ' to ' + fmtTons(path.total.high) + '</strong></div>' +
      '<div><span>Data source</span><strong>' + esc(PATHS[key].label) + '</strong></div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="bands">' + bands + '</div>' +
      '<div class="grid-2-report">' +
      '<div><h3>By scope</h3><ul class="notes">' + breakdown + '</ul></div>' +
      '<div><h3>Top actions</h3><ul class="notes">' + top + '</ul></div>' +
      '</div>' +
      '<h3>Method and caveats</h3><ul class="notes">' + notes + '</ul>' +
      '<div class="stage-actions">' +
      '<button class="btn btn-ghost" type="button" data-action="download">Download report JSON</button>' +
      '<button class="btn btn-ghost" type="button" data-action="download-text">Download report text</button>' +
      '</div>';
  }

  // Grade for a footprint, using the same benchmark bands the report uses.
  function gradeFor(bands, tons) {
    for (var i = 0; i < bands.length; i++) {
      var band = bands[i];
      if (tons >= band.from && (band.to === null || tons < band.to)) return band.grade;
    }
    return bands[bands.length - 1].grade;
  }

  function closeScenario() {
    var existing = document.getElementById("scenario-modal");
    if (existing) existing.remove();
    document.removeEventListener("keydown", onScenarioKey);
  }

  function onScenarioKey(event) {
    if (event.key === "Escape") closeScenario();
  }

  function openScenario(index) {
    var profile = currentProfile();
    var path = currentPath(profile);
    var action = path.actions[index];
    if (!action) return;

    var before = path.total.tons;
    var after = Math.max(0, before - action.tons);
    var afterGrade = gradeFor(path.grade_bands, after);
    var paybackText = action.placeholder ? "Placeholder" : fmtPayback(action.payback);

    closeScenario();
    var modal = document.createElement("div");
    modal.id = "scenario-modal";
    modal.className = "modal-backdrop";
    modal.innerHTML = '' +
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="scenario-title">' +
      '<p class="eyebrow">Scenario</p>' +
      '<h3 id="scenario-title">If you do: ' + esc(action.action) + '</h3>' +
      '<div class="kv">' +
      '<div><span>Today</span><strong>' + fmtTons(before) + ' · Grade ' + esc(path.grade) + '</strong></div>' +
      '<div><span>After this action</span><strong>' + fmtTons(after) + ' · Grade ' + esc(afterGrade) + '</strong></div>' +
      '<div><span>Saves</span><strong>' + fmtTons(action.tons) + ' a year</strong></div>' +
      '<div><span>Cost</span><strong>' + fmtInr(action.cost_inr) + '</strong></div>' +
      '<div><span>Payback</span><strong>' + esc(paybackText) + '</strong></div>' +
      '</div>' +
      '<p class="actions-note">The grade is recalculated with the same benchmark bands. Actions overlap, so do not add their savings together.</p>' +
      '<div class="stage-actions"><button class="btn btn-ghost" type="button" data-close>Close</button></div>' +
      '</div>';

    modal.addEventListener("click", function (event) {
      if (event.target === modal || event.target.closest("[data-close]")) closeScenario();
    });
    document.body.appendChild(modal);
    document.addEventListener("keydown", onScenarioKey);
    modal.querySelector("[data-close]").focus();
  }

  function reportText(profile, path, key) {
    var lines = [
      "CARBON FOOTPRINT REPORT (DEMO)",
      "User type: " + profile.label + " (" + profile.sublabel + ")",
      "Data source: " + PATHS[key].label,
      "",
      "Total: " + path.total.tons.toFixed(1) + " t CO2e a year (range " +
        path.total.low.toFixed(1) + " to " + path.total.high.toFixed(1) + " t)",
      "Grade: " + path.grade,
      "",
      "By scope:"
    ];
    path.scopes.forEach(function (scope) {
      lines.push("  " + SCOPE_SHORT[scope.id] + ": " + scope.tons.toFixed(1) + " t (" + scope.confidence + ")");
    });
    lines.push("", "Top actions:");
    path.actions.forEach(function (action, index) {
      lines.push("  " + (index + 1) + ". " + action.action + ": saves " + action.tons.toFixed(1) +
        " t a year, cost " + fmtInr(action.cost_inr) + ", payback " + fmtPayback(action.payback) +
        (action.placeholder ? " (placeholder)" : ""));
    });
    lines.push("", "Notes:");
    path.notes.forEach(function (note) { lines.push("  - " + note); });
    return lines.join("\n") + "\n";
  }

  function saveFile(name, mime, text) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function downloadText() {
    var profile = currentProfile();
    saveFile(profile.id + "-" + state.path + "-report.txt", "text/plain",
      reportText(profile, currentPath(profile), PATHS[state.path].key));
  }

  var RENDERERS = [renderConnect, renderIntake, renderCalculate, renderReduce, renderReport];

  function stageNav() {
    var last = STEPS.length - 1;
    return '<div class="stage-nav">' +
      '<button type="button" data-nav="-1"' + (state.step === 0 ? ' disabled' : '') + '>← Back</button>' +
      '<span class="fine">Step ' + (state.step + 1) + ' of ' + STEPS.length + '</span>' +
      '<button type="button" data-nav="1"' + (state.step === last ? ' disabled' : '') + '>Next →</button>' +
      '</div>';
  }

  function renderStage() {
    var profile = currentProfile();
    if (!profile) {
      stage.innerHTML = '<p class="empty">Unknown demo profile.</p>';
      return;
    }
    var path = currentPath(profile);
    if (!path) {
      stage.innerHTML = '<p class="empty">' + esc(PATHS[state.path].label) + ' is not available for this profile. ' +
        'Switch the data source to see the other view.</p>';
      return;
    }
    var renderer = RENDERERS[state.step];
    var badges = '';
    if (path.assumptions && path.assumptions.length) {
      badges += '<div class="demo-badge demo-badge-info" role="note">ℹ️ Estimated data: ' +
        path.assumptions.length + ' assumption(s) filled in from partial data. ' +
        'Upload the detailed data to tighten the range.' +
        '<ul>' + path.assumptions.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') + '</ul></div>';
    }
    if (path.illustrative && path.illustrative.length) {
      badges += '<div class="demo-badge" role="note">⚠️ Demo uses illustrative factors — real submissions use verified sources</div>';
    }
    stage.innerHTML = badges + renderer(profile, path, state.path) + stageNav();
  }

  function downloadReport() {
    var profile = currentProfile();
    var payload = {
      user_type: profile.id,
      tier: profile.tier,
      data_path: PATHS[state.path].key,
      report: currentPath(profile)
    };
    saveFile(profile.id + "-" + state.path + "-report.json", "application/json", JSON.stringify(payload, null, 2));
  }

  stage.addEventListener("click", function (event) {
    var nav = event.target.closest("button[data-nav]");
    if (nav) {
      state.step = Math.min(STEPS.length - 1, Math.max(0, state.step + Number(nav.getAttribute("data-nav"))));
      update();
      return;
    }
    var scenario = event.target.closest("button[data-scenario]");
    if (scenario) {
      openScenario(Number(scenario.getAttribute("data-scenario")));
      return;
    }
    var action = event.target.closest("button[data-action]");
    if (!action) return;
    if (action.getAttribute("data-action") === "download") downloadReport();
    if (action.getAttribute("data-action") === "download-text") downloadText();
  });

  function update() {
    syncControls();
    renderStage();
    writeHash();
  }

  function init() {
    if (!FIXTURES.length) {
      stage.innerHTML = '<p class="empty">Demo data did not load. Check that data/demo_fixtures.js is next to demo.html.</p>';
      return;
    }
    readHash();
    buildToggles();
    buildStepper();
    update();
    window.addEventListener("hashchange", function () {
      readHash();
      update();
    });
  }

  init();
})();
