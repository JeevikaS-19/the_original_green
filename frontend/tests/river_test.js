// Landing water scene, in jsdom with WebGL unavailable. Run from the repo root: node frontend/tests/river_test.js
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8")
  .replace(/<link[^>]*>/g, "")
  .replace(/<script[^>]*><\/script>/g, "");
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost:8011/index.html" });
const w = dom.window;
w.HTMLCanvasElement.prototype.getContext = () => null; // no WebGL: the static photo is the fallback
w.matchMedia = () => ({ matches: false });
w.IntersectionObserver = function () { this.observe = () => {}; };
const errors = [];
w.addEventListener("error", (e) => errors.push(e.message));
w.eval(fs.readFileSync(path.join(root, "assets/river_flow.js"), "utf8"));

const results = [];
const check = (name, ok, detail) => results.push((ok ? "PASS " : "FAIL ") + name + (detail ? "  [" + detail + "]" : ""));
const doc = w.document;
const cap = () => doc.getElementById("river-cap").textContent;

check("the module exposes OGWater.update", typeof w.OGWater.update === "function");
check("without WebGL the static photo is shown", doc.getElementById("river-fb").style.display === "block");
check("the sample campus total is shown on the landing page", cap().includes("264.0 t") && cap().includes("Visual indicator, not a measurement"), cap());
check("the scene says no plan is applied yet", cap().includes("No plan applied yet."), cap());

w.OGWater.update({ currentTotal: 0, unit: "t" });
check("zero is never shown: it waits for data", cap().includes("Waiting for data") && !cap().includes("0.0 t"), cap());
w.OGWater.update({ currentTotal: null, unit: "t" });
check("null waits for data", cap().includes("Waiting for data"));
w.OGWater.update({ currentTotal: 100, withPlanTotal: 60, unit: "t" });
check("a plan is described with its total", cap().includes("With plan 60.0 t"), cap());
w.dispatchEvent(new w.CustomEvent("og:reduction", { detail: { currentTotal: 50, unit: "t" } }));
check("the og:reduction event also updates the scene", cap().includes("Current 50.0 t"), cap());
check("the scene states it is a visual indicator", cap().includes("Visual indicator, not a measurement."));
check("no script errors", errors.length === 0, errors.join("; "));

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log("\n" + (results.length - failed) + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
