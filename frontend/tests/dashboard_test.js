// Browser-behaviour test for dashboard.html, run in jsdom.
// Setup once: cd frontend && npm i jsdom@24   Run: node tests/dashboard_test.js
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const fixtures = fs.readFileSync(path.join(root, "data/demo_fixtures.js"), "utf8");
const script = fs.readFileSync(path.join(root, "assets/dashboard.js"), "utf8");

const inlined = html
  .replace('<script src="data/demo_fixtures.js"></script>', "")
  .replace('<script src="assets/dashboard.js"></script>', "");

const results = [];
function check(name, ok, detail) {
  results.push((ok ? "PASS " : "FAIL ") + name + (detail ? "  [" + detail + "]" : ""));
}

const downloads = [];
const errors = [];
const dom = new JSDOM(inlined, { runScripts: "outside-only", url: "http://localhost:8000/dashboard.html#small_scale/open" });
const w = dom.window;
w.URL.createObjectURL = (blob) => { downloads.push(blob); return "blob:test/" + downloads.length; };
w.URL.revokeObjectURL = () => {};
w.HTMLAnchorElement.prototype.click = function () { downloads.push({ downloaded: this.download }); };
w.scrollTo = () => {};
let printed = 0;
w.print = () => { printed++; };
const opened = []; w.open = (url) => { opened.push(url); return null; };
w.matchMedia = () => ({ matches: true }); // reduced motion: AI Apply settles at once
w.addEventListener("error", (e) => errors.push(e.message));
// Chart.js is vendored in the page; jsdom has no canvas, so record what each chart is given.
const made = [];
w.Chart = function (canvas, cfg) { made.push({ id: canvas.parentNode.id, type: cfg.type, datasets: cfg.data.datasets.length }); this.destroy = function () {}; };
w.Chart.defaults = { font: {} };
const chartOf = (id) => made.filter((c) => c.id === id).slice(-1)[0];
w.eval(fixtures);
w.eval(script);

const doc = w.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));
const click = (el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
const change = (el) => el.dispatchEvent(new w.Event("change", { bubbles: true }));
const input = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };
const pick = (v) => { const sel = $("#org-select"); sel.value = v; change(sel); };
const nav = (v) => click($('#view-nav a[data-view="' + v + '"]'));
const active = () => $(".view.active");

// 1. Name, sidebar and overview
check("named The Original Green", doc.title.includes("The Original Green") && $(".logo").textContent.includes("The Original Green"));
check("initial title shows Small scale", $("#profile-title").textContent.includes("Small scale"), $("#profile-title").textContent);
check("overview total 264.0 (commute×2)", $("#summary-cards").textContent.includes("264"));
check("summary has Total, Grade, Confidence, Measured data", ["Total", "Grade", "Confidence", "Measured data"].every((k) => $("#summary-cards").textContent.includes(k)));
check("overview projection is a line with and without plan", chartOf("trend-chart") && chartOf("trend-chart").type === "line" && chartOf("trend-chart").datasets === 2);
check("overview compares organisations by intensity", chartOf("compare-chart") && chartOf("compare-chart").type === "bar" && chartOf("mix-compare") && chartOf("mix-compare").datasets === 3);
check("overview scope split is a doughnut", chartOf("scope-donut") && chartOf("scope-donut").type === "doughnut");
check("categories listed in a table with method", $$("#cat-list tbody tr").length >= 6 && $("#cat-list thead").textContent.includes("Method"), String($$("#cat-list tbody tr").length));
check("sidebar is navigation only (no org picker inside)", !$("#snav #org-select") && !$("#snav .tcard"));
nav("connect");
check("Connect is its own page", active().dataset.view === "connect" && w.location.hash.endsWith("/connect"));
check("Connect lists 7 tracker cards", $$("#connect-list .tcard").length === 7);
check("6 connected, 1 not", $$(".tcard.ok").length === 6 && $("#connect-list").textContent.includes("Not connected"), String($$(".tcard.ok").length));
check("connected cards chart real rows", $$(".tcard.ok .mini-bars, .tcard.ok .mini-line").length >= 5 && $("#connect-list").textContent.includes("BUS_01"));
check("meter card shows 12 monthly kWh", !!$(".tcard.ok .mini-line") && $("#connect-list").textContent.includes("2025-12"));
check("disconnected card shows setup steps", $$(".tcard:not(.ok) .tc-steps li").length === 3);
check("cards carry quality badges", $$(".tcard .tag").length === 7);
check("connect and disconnect buttons", $("#connect-list").textContent.includes("Disconnect") && /Connect$/m.test($$(".tcard:not(.ok) .btn")[0].textContent));
const discBtn = $('[data-disc="Fleet & fuel log"]');
click(discBtn);
check("disconnect persists and drops the card to not connected", $$(".tcard.ok").length === 5 && $("#connect-list").textContent.includes("Disconnected in this browser") && w.localStorage.getItem("og-connections-v1").includes("Fleet"));
click($('[data-reconn="Fleet & fuel log"]'));
check("reconnect restores the card", $$(".tcard.ok").length === 6);
nav("overview");
check("quick stats show total and grade", $("#quick-stats").textContent.includes("264") && $("#quick-stats").textContent.includes("Grade"));

// 2. Scope selector
click($('#scope-sel button[data-view="scope_3"]'));
check("Scope 3 selected shows its view", active().dataset.view === "scope_3" && w.location.hash.endsWith("/scope_3"), w.location.hash);
check("Scope 3 shows illustrative and confidence band", active().textContent.includes("Illustrative") && active().textContent.includes("Confidence band"));
check("Scope 3 lists low or missing data", active().textContent.includes("Not supplied, filled in"));
click($('#scope-sel button[data-view="scope_1"]'));
check("Scope 1 shows formula and trackers", active().textContent.includes("Method:") && active().textContent.includes("Vehicle log"));

pick("case_tcs");
check("TCS loads", $("#profile-title").textContent.includes("TCS"), $("#profile-title").textContent);
check("TCS Scope 1 button is greyed", $('#scope-sel button[data-view="scope_1"]').classList.contains("empty"));
check("TCS Scope 1 view is blank, not hidden", active().dataset.view === "scope_1" && active().textContent.includes("No data"));
click($('[data-path="closed_source"]'));
check("totals-only toggle", $("#top-source").textContent.includes("Totals"));
click($('[data-path="open_source"]'));
pick("small_scale");

// 3. Reduction: levers, stacking, live updates
nav("reduction");
check("reduction view", active().dataset.view === "reduction");
check("no adjust panel, levers or input sliders", !$(".adjust") && !$(".lever") && !$("#edits"));
check("AI Apply is the only control", !!$("#ai-apply") && !$("#ai-budget") && !$("#ai-priority"));
check("reduction table starts with no change", $("#scenario-out").textContent.includes("264.0"));
click($("#ai-apply"));
const aiOut = $("#ai-out").textContent;
check("AI Apply applies a plan and says what changed", aiOut.includes("Applied") && aiOut.includes("cuts"), aiOut.slice(0, 80));
check("the table shows the changed total", !$("#scenario-out").textContent.includes("With plan264.0"));
check("chart compares now with the AI plan, as bars", chartOf("reduction-line") && chartOf("reduction-line").type === "bar" && chartOf("reduction-line").datasets === 2);
check("sidebar shows the with-plan total", $("#quick-stats").textContent.includes("With plan") && !$("#quick-stats").textContent.includes("With plan–"));
check("filled-in estimates are listed on the reduction page", !!$("#missing-data"));
nav("overview");
check("overview trend shows the plan", $("#summary-cards").textContent.includes("↓") && chartOf("trend-chart").datasets === 2);

// 5. Data breakdown
nav("breakdown");
check("breakdown view", active().dataset.view === "breakdown");
check("mix legend shows three kinds", ["Measured", "Estimated", "Illustrative"].every((k) => $("#mix-legend").textContent.includes(k)));
check("confidence impact shown", $("#breakdown-table").textContent.includes("→"), "");
check("upload CTA", active().textContent.includes("Upload data to improve"));

// 6. Export
click($(".side-dl"));
check("sidebar Download opens export", active().dataset.view === "export");
click($("#dl-json"));
click($("#dl-csv"));
click($("#dl-pdf"));
const anchors = downloads.filter((d) => d && d.downloaded).length;
check("JSON and CSV download", anchors === 2, "anchor clicks " + anchors);
check("PDF opens the formal report page", opened.length === 1 && opened[0].startsWith("report.html?org=") && opened[0].includes("print=1"), opened.join(" "));

// Individual has no actions: AI Apply says so instead of breaking
pick("individual");
nav("reduction");
click($("#ai-apply"));
check("individual: AI Apply reports no change", $("#ai-out").textContent.includes("no change"), $("#ai-out").textContent.slice(0, 60));

// Projects: a new project starts with no plan, and plans never leak between projects
pick("small_scale");
w.prompt = () => "Project A";
const psel = $("#project-select");
psel.value = "__new__"; change(psel);
const projId = $("#project-select").value;
check("new project is selected", projId !== "base" && $("#project-select").textContent.includes("Project A"));
check("a new project has no plan yet", $("#quick-stats").textContent.includes("With plan–"));
$("#project-select").value = "base"; change($("#project-select"));
check("base keeps its applied plan", !$("#quick-stats").textContent.includes("With plan–"));
$("#project-select").value = projId; change($("#project-select"));
check("the project still has no plan after switching back", $("#quick-stats").textContent.includes("With plan–"));

check("no script errors", errors.length === 0, errors.join("; "));

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log("\n" + (results.length - failed) + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
