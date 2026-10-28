// Full-screen flood animation, in jsdom with a stubbed canvas and frame clock.
// Run from the repo root: node frontend/tests/flood_test.js
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "assets/flood.js"), "utf8");
const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost:8011/" });
const w = dom.window;
const noop = () => {};
const fakeCtx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === "createRadialGradient" ? () => ({ addColorStop: noop }) : noop)) });
w.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
w.matchMedia = () => ({ matches: false });
const frames = [];
w.requestAnimationFrame = (cb) => { frames.push(cb); return frames.length; };
w.cancelAnimationFrame = noop;
w.eval(src);
const step = (ts) => { const cbs = frames.splice(0); cbs.forEach((cb) => cb(ts)); };
const results = [];
const check = (name, ok, detail) => results.push((ok ? "PASS " : "FAIL ") + name + (detail ? "  [" + detail + "]" : ""));

w.Flood.reset();
w.Flood.go(1, 2000, "Today", "264.0 t", "test");
check("starts empty", w.Flood.getLevel() === 0);
step(1000); // the first frame sets the start time
step(2000); // half the duration has passed
check("halfway through a 2 s flood, the water is halfway up", Math.abs(w.Flood.getLevel() - 0.5) < 1e-9, String(w.Flood.getLevel()));
step(3000);
check("after the full duration, the screen is full", w.Flood.getLevel() === 1, String(w.Flood.getLevel()));

w.Flood.go(0.45, 4000, "With your plan", "150.0 t", "drain");
step(10000); step(11000); step(14000);
check("the drain ends at the planned level", Math.abs(w.Flood.getLevel() - 0.45) < 1e-9, String(w.Flood.getLevel()));
check("the overlay carries its label", w.document.getElementById("flood-value").textContent === "150.0 t");
w.Flood.hide();
check("closing hides the overlay", !w.Flood.isOn());
console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log("\n" + (results.length - failed) + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
