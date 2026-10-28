// Individual tracker page, in jsdom. Run from the repo root: node frontend/tests/individual_test.js
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "individual.html"), "utf8").replace('<script src="assets/individual.js"></script>', "");
const script = fs.readFileSync(path.join(root, "assets/individual.js"), "utf8");
const methodology = fs.readFileSync(path.join(root, "data/methodology.json"), "utf8");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost:8011/individual.html" });
const w = dom.window;
w.fetch = () => Promise.resolve({ json: () => Promise.resolve(JSON.parse(methodology)) });
w.URL.createObjectURL = () => "blob:x";
w.HTMLAnchorElement.prototype.click = function () {};
const errors = [];
w.addEventListener("error", (e) => errors.push(e.message));
w.eval(script);

const results = [];
const check = (name, ok, detail) => results.push((ok ? "PASS " : "FAIL ") + name + (detail ? "  [" + detail + "]" : ""));
const doc = w.document;
const set = (name, v) => { doc.querySelector('[name="' + name + '"]').value = v; };

const tick = () => new Promise((r) => setTimeout(r, 20));
(async () => {
  await tick();
  set("fuel", "petrol"); set("km", "10000"); set("eff", "7");
  set("kwh", "330"); set("ren", "0");
  set("commute_km", "12"); set("days", "5"); set("mode", "car");
  set("laptops", "1"); set("solid", "0"); set("ewaste", "0");
  doc.getElementById("form").dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));
  const text = doc.getElementById("result").textContent;
  // Hand check: petrol 700 L × 2.29 = 1.60 t; 330 × 12 × 0.757 = 3.00 t; commute 12×2×5×50×0.15 = 0.90 t; laptop 0.03 t → 5.53 t
  check("scope 1 is 1.60 t", text.includes("1.60 t"), text.slice(0, 80));
  check("scope 2 is 3.00 t", text.includes("3.00 t"));
  check("total is 5.53 t", text.includes("5.53 t"));
  check("grade F at 5.53 t per person", text.includes("F"));
  check("scope 3 band is partial ±25%", text.includes("±25%"));
  check("saved to localStorage note", doc.getElementById("saved-note").textContent.includes("Saved"));
  check("links to reduction plan", !!doc.querySelector('a[href="dashboard.html#individual/open/reduction"]'));
  check("no script errors", errors.length === 0, errors.join("; "));
  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log("\n" + (results.length - failed) + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})();
