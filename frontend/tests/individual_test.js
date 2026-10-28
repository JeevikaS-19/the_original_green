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
const errors = [];
w.addEventListener("error", (e) => errors.push(e.message));
w.eval(script);

const results = [];
const check = (name, ok, detail) => results.push((ok ? "PASS " : "FAIL ") + name + (detail ? "  [" + detail + "]" : ""));
const doc = w.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));
const click = (el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
const tick = () => new Promise((r) => setTimeout(r, 20));
const submit = () => $("#add").dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));

(async () => {
  await tick();
  // Demo: the sample person, hand-calculated: petrol 10,000 km × 7 L/100 km × 2.29 = 1.60 t;
  // electricity 330 kWh × 12 × 0.757 = 3.00 t; commute 12 × 2 × 250 × 0.15 = 0.90 t; laptop 0.03 t. Total 5.53 t.
  check("demo shows the sample total", $("#result").textContent.includes("5.53 t"), $("#result").textContent.slice(0, 60));
  check("demo has no add form", $("#add").hidden === true);
  check("demo does not save", !w.localStorage.getItem("og-individual-activities-v1"));

  // Your tracker: starts empty, then add, edit, delete
  click($('[data-mode="live"]'));
  await tick();
  check("live mode shows the add form", $("#add").hidden === false);
  check("live starts with no activities", $("#rows").textContent.includes("No activities yet"));

  $("#kind").value = "car_petrol"; $("#add").elements.qty.value = "10000"; submit();
  $("#kind").value = "electricity"; $("#add").elements.qty.value = "330"; submit();
  check("adding activities updates the total to 4.60 t", $("#result").textContent.includes("4.60 t"), $("#result").textContent.slice(0, 60));
  check("activities are saved in this browser", (w.localStorage.getItem("og-individual-activities-v1") || "").includes("electricity"));

  const editBtn = $$("[data-edit]").filter((b) => b.closest("tr").textContent.includes("Electricity"))[0];
  click(editBtn);
  check("edit loads the activity into the form", $("#add").elements.qty.value === "330" && $("#submit").textContent.includes("Save"));
  $("#add").elements.qty.value = "165"; submit();
  check("saving an edit updates the total to 3.10 t", $("#result").textContent.includes("3.10 t"), $("#result").textContent.slice(0, 60));

  const delBtn = $$("[data-del]").filter((b) => b.closest("tr").textContent.includes("Car, petrol"))[0];
  click(delBtn);
  check("delete removes the activity and updates the total to 1.50 t", $("#result").textContent.includes("1.50 t") && $$("#rows tr").length === 1, $("#result").textContent.slice(0, 60));

  // Back to demo keeps the saved tracker intact
  click($('[data-mode="demo"]'));
  await tick();
  check("switching back to demo shows the sample again", $("#result").textContent.includes("5.53 t"));
  click($('[data-mode="live"]'));
  await tick();
  check("your saved activities survive a switch", $("#result").textContent.includes("1.50 t"));

  check("no script errors", errors.length === 0, errors.join("; "));
  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log("\n" + (results.length - failed) + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})();
