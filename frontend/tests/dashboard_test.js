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
check("Scope 3 lists low or missing data", active().textContent.includes("Low or missing data"));
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
check("top 5 actions as levers", $$(".lever").length === 5, String($$(".lever").length));
const out0 = $("#scenario-out").textContent;
const box0 = $('[data-pick="0"]');
box0.checked = true; change(box0);
const out1 = $("#scenario-out").textContent;
check("ticking an action updates the live result", out1 !== out0 && out1.includes("−"), out1.slice(0, 60));
const slider0 = $('input[type=range][data-pct="0"]');
const em1 = made.length;
input(slider0, "15");
check("charts redraw when a slider moves", made.length > em1);
const out2 = $("#scenario-out").textContent;
check("dragging a lever updates the result", out2 !== out1, out2.slice(0, 60));
check("number box follows the slider", $('input[type=number][data-pct="0"]').value === "15");
const box2 = $('[data-pick="2"]');
box2.checked = true; change(box2);
check("stacking two actions shows the combined line", $("#scenario-note").textContent.includes("#1 + #3"), $("#scenario-note").textContent);
check("overlap note with two actions", $("#scenario-warn").textContent.includes("double count"));
check("reduction table has six rows", $$("#scenario-out tr").length === 6 && ["Scope 1", "Total", "Investment", "Grade"].every((k) => $("#scenario-out").textContent.includes(k)));
check("reduction chart: now vs with plan line", chartOf("reduction-line") && chartOf("reduction-line").type === "line");
check("sidebar shows with-plan total", $("#quick-stats").textContent.includes("With plan"));
nav("overview");
check("overview trend shows the plan", $("#summary-cards").textContent.includes("↓") && chartOf("trend-chart").datasets === 2);

// Inputs flow through the whole dashboard
nav("reduction");
const kwh = $('[data-edit="kwh"]');
input(kwh, String(Number(kwh.value) * 2));
check("editing kWh changes the total", !$("#quick-stats").textContent.includes("264.0"), $("#quick-stats").textContent.slice(0, 40));
click($("#reset-edits"));
check("reset restores the total", $("#quick-stats").textContent.includes("264"));

// 4. AI Apply
$("#ai-budget").value = "2500000";
click($("#ai-apply"));
check("AI Apply suggests a plan", $("#ai-out").textContent.includes("Suggested plan") && $("#ai-out").textContent.includes("Cuts"), $("#ai-out").textContent.slice(0, 80));
check("AI Apply ticks levers", $$("[data-pick]:checked").length >= 1, String($$("[data-pick]:checked").length));
const spend = Number(($("#scenario-out").textContent.match(/Investment[^₹]*₹([\d,]+)/) || [0, "0"])[1].replace(/,/g, ""));
check("AI plan stays within budget", spend <= 2500000 && spend > 0, String(spend));
$("#ai-priority").value = "cost";
click($("#ai-apply"));
check("lowest-spend priority only picks paying actions", $("#ai-out").textContent.includes("pays back"), $("#ai-out").textContent.slice(0, 120));
$("#ai-budget").value = "0";
click($("#ai-apply"));
check("zero budget explains nothing fits", $("#ai-out").textContent.includes("Nothing fits"));

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
check("PDF opens print", printed === 1);

// Individual has no actions: the reduction page explains instead of breaking
pick("individual");
nav("reduction");
check("individual shows no-actions note", $("#levers").textContent.includes("No reduction action"));

// Projects: a new project keeps its own inputs, and the base data is unchanged
pick("small_scale");
w.prompt = () => "Project A";
const psel = $("#project-select");
psel.value = "__new__"; change(psel);
const projId = $("#project-select").value;
check("new project is selected", projId !== "base" && $("#project-select").textContent.includes("Project A"));
const kwhP = $('[data-edit="kwh"]');
input(kwhP, String(Number(kwhP.value) * 2));
check("project input changes the total", !$("#quick-stats").textContent.includes("264.0"));
$("#project-select").value = "base"; change($("#project-select"));
check("base data is unchanged", $("#quick-stats").textContent.includes("264.0"));
$("#project-select").value = projId; change($("#project-select"));
check("project keeps its inputs after switching back", !$("#quick-stats").textContent.includes("264.0"));
check("no script errors", errors.length === 0, errors.join("; "));

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log("\n" + (results.length - failed) + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
