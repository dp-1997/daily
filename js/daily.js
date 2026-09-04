/* The Daily: the glass sections menu, lifted from damianpickett.com. */

(function () {
  "use strict";

  /* The staggered entrance runs on first arrival in a session only. */
  try {
    if (sessionStorage.getItem("dp-visited")) {
      document.documentElement.classList.add("revisit");
    } else {
      document.documentElement.classList.add("first-visit");
    }
    sessionStorage.setItem("dp-visited", "1");
  } catch (err) {
    document.documentElement.classList.add("first-visit");
  }

  window.addEventListener("pagereveal", function (e) {
    if (e.viewTransition) {
      document.documentElement.classList.add("vt-nav");
    }
  });

  var menu = document.querySelector(".menu");
  var trigger = menu && menu.querySelector(".menu-trigger");
  var links = menu && menu.querySelector(".menu-links");
  if (!menu || !trigger || !links) return;

  var LABEL = trigger.textContent.trim() || "Sections";

  function setOpen(open) {
    menu.classList.toggle("is-open", open);
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    trigger.textContent = open ? "Close" : LABEL;
    if (open) {
      links.removeAttribute("inert");
    } else {
      links.setAttribute("inert", "");
    }
  }

  /* Size the collapsed pill to its label, whatever font the platform
     renders, and the open height to however many sections ran today. */
  var font = getComputedStyle(trigger);
  var ctx = document.createElement("canvas").getContext("2d");
  ctx.font = font.fontWeight + " " + font.fontSize + " " + font.fontFamily;
  var label = Math.max(ctx.measureText(LABEL).width, ctx.measureText("Close").width);
  menu.style.setProperty("--menu-cw", Math.ceil(label) + 52 + "px");

  var anchors = links.querySelectorAll("a");
  menu.style.setProperty("--menu-h", anchors.length * 38 + 73 + "px");

  var items = links.querySelectorAll("a, .menu-divider");
  menu.style.setProperty("--n", items.length - 1);
  items.forEach(function (el, i) {
    el.style.setProperty("--i", i);
  });

  setOpen(false);

  /* Open on pointerdown: the pill reacts on touch, not on release. */
  var suppressClick = false;
  trigger.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    suppressClick = true;
    setOpen(!menu.classList.contains("is-open"));
  });

  trigger.addEventListener("click", function () {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    setOpen(!menu.classList.contains("is-open"));
  });

  links.addEventListener("click", function (e) {
    if (e.target.closest("a")) setOpen(false);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && menu.classList.contains("is-open")) {
      setOpen(false);
      trigger.focus();
    }
  });

  document.addEventListener("pointerdown", function (e) {
    if (menu.classList.contains("is-open") && !menu.contains(e.target)) {
      setOpen(false);
    }
  });

  var here = location.pathname.replace(/\/$/, "") || "/";
  anchors.forEach(function (a) {
    var href = a.getAttribute("href");
    if (href.charAt(0) === "#") return;
    var path = href.replace(/\/$/, "") || "/";
    if (path === here) a.classList.add("active");
  });
})();
