// A mild ripple where the user clicks (not on hover). Off for reduced motion.
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  function ring(x, y, delay) {
    var el = document.createElement("span");
    el.className = "ripple";
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.animationDelay = delay + "ms";
    el.addEventListener("animationend", function () { el.remove(); });
    document.body.appendChild(el);
  }

  document.addEventListener("pointerdown", function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    ring(e.clientX, e.clientY, 0);
    ring(e.clientX, e.clientY, 160);
  }, { passive: true });
})();
