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
  .replace('<script src="data/demo_fixtures.js"></script>', "<script>" + fixtures + "</script>")
  .replace('<script src="assets/dashboard.js"></script>', "");

const results = [];
function check(name, ok, detail) {
  results.push((ok ? "PASS " : "FAIL ") + name + (detail ? "  [" + detail + "]" : ""));
}

const downloads = [];
const dom = new JSDOM(inlined, { runScripts: "outside-only", url: "http://localhost:8000/dashboard.html#small_scale/open" });
const w = dom.window;
w.URL.createObjectURL = (blob) => { downloads.push(blob); return "blob:test/" + downloads.length; };
w.URL.revokeObjectURL = () => {};
w.HTMLAnchorElement.prototype.click = function () { downloads.push({ downloaded: this.download }); };
w.HTMLDialogElement = w.HTMLDialogElement || function () {};
w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
w.eval(fixtures);
w.eval(script);

const doc = w.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));
const click = (el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
const change = (el) => el.dispatchEvent(new w.Event("change", { bubbles: true }));

// 1. Initial view
check("initial title shows Small scale", $("#profile-title").textContent.includes("Small scale"), $("#profile-title").textContent);
check("summary card shows total", $("#summary-cards").textContent.includes("228.6"), "");
check("scope tabs rendered (3)", $$("#scope-tabs button").length === 3);
check("five action cards", $$("#action-cards .action").length === 5, String($$("#action-cards .action").length));

// 2. Scale toggle loads different data
click($('[data-scale="large_scale"]'));
check("switch to Large-Scale changes title", $("#profile-title").textContent.includes("Large scale"), $("#profile-title").textContent);
check("Large-Scale total is 904.2 t", $("#summary-cards").textContent.includes("904.2"));
check("hash updates to large_scale", w.location.hash.startsWith("#large_scale"), w.location.hash);

// 3. Case study toggle loads real company data
click($('[data-scale="case_tcs"]'));
check("TCS toggle loads TCS title", $("#profile-title").textContent.includes("TCS") || $("#profile-title").textContent.toLowerCase().includes("tata"), $("#profile-title").textContent);
check("TCS total shows 3,75,xxx t (Indian grouping)", /3,75,\d{3}/.test($("#summary-cards").textContent), $("#summary-cards").textContent.slice(0, 60));

// 4. Data path toggle
click($('[data-path="toggle"]'));
check("data path toggle switches to totals", $("#top-source").textContent.includes("Totals"), $("#top-source").textContent);
click($('[data-path="toggle"]'));

// back to small scale open
click($('[data-scale="small_scale"]'));

// 5. Scope tabs change the panel
click($('[data-scope="scope_3"]'));
check("Scope 3 tab shows illustrative tag", $("#scope-panel").textContent.includes("Illustrative"), "");
check("Scope 3 panel lists drivers", $("#scope-panel").querySelectorAll(".driver").length >= 3, String($("#scope-panel").querySelectorAll(".driver").length));
click($('[data-scope="scope_1"]'));
check("Scope 1 panel shows formula", $("#scope-panel").textContent.includes("Method:"));

// 6. See impact opens a dialog with before and after
click($('[data-impact="0"]'));
const dlg = $("#impact-dialog");
check("See impact opens dialog", dlg.hasAttribute("open"));
check("dialog shows After total", dlg.textContent.includes("After"), dlg.textContent.slice(0, 80));

// 7. Scenario stacking updates live
const before = $("#scenario-out").textContent;
const boxes = $$("#scenario-slot input[type=checkbox]");
check("scenario has checkboxes", boxes.length === 5, String(boxes.length));
boxes[0].checked = true; change(boxes[0]);
const afterOne = $("#scenario-out").textContent;
check("ticking one action updates Total after", afterOne !== before, afterOne.slice(0, 80));
boxes[2].checked = true; change(boxes[2]);
const afterTwo = $("#scenario-out").textContent;
check("ticking a second action updates again", afterTwo !== afterOne);
check("overlap warning appears with two actions", $("#scenario-warn").textContent.includes("overlap"));
boxes[0].checked = false; change(boxes[0]); boxes[2].checked = false; change(boxes[2]);
check("unticking all restores the total", $("#scenario-out").textContent === before);

// 8. Downloads
const jsonBefore = downloads.length;
click($("#download"));
click($("#dl-json"));
click($("#dl-csv"));
const anchors = downloads.filter((d) => d && d.downloaded).length;
check("downloads triggered (3)", anchors === 3, "anchor clicks " + anchors);
const blobs = downloads.filter((d) => d instanceof w.Blob);
check("JSON and CSV are Blobs", blobs.length >= 2);

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log("\n" + (results.length - failed) + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
