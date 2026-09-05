/* The DJ: focused edition views, section picker and the archive menu. */

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

  /* A picture that fails to load takes its frame with it. */
  function removeBrokenImage(el) {
      if (!el || el.tagName !== "IMG") return;
      var fig = el.closest(".story-media, .pick-media, .pick-art");
      if (!fig) return;
      var owner = fig.closest(".has-media, .has-art, .has-cover");
      fig.parentNode.removeChild(fig);
      if (owner) {
        owner.classList.remove("has-media");
        owner.classList.remove("has-art");
        owner.classList.remove("has-cover");
      }
  }
  document.addEventListener("error", function (e) { removeBrokenImage(e.target); }, true);
  document.querySelectorAll("img").forEach(function (el) {
    if (el.complete && !el.naturalWidth) removeBrokenImage(el);
  });

  /* The HTML remains a complete paper without JavaScript. Enhance it
     into views only when the whole navigation surface is available. */
  var panels = Array.from(document.querySelectorAll("[data-edition-panel]"));
  var dock = document.querySelector(".edition-dock");
  var picker = document.querySelector("#section-picker");
  var pickerTrigger = document.querySelector(".sections-trigger");
  if (panels.length && dock && picker && pickerTrigger && typeof picker.showModal === "function") {
    var overview = document.querySelector("[data-overview]");
    var positions = new Map();
    var current = null;
    var viewLinks = document.querySelectorAll("[data-view-link]");

    function route() {
      var id;
      try { id = decodeURIComponent(location.hash.slice(1)); } catch (err) { id = ""; }
      if (id === "all") return { id: "all", panel: null, target: document.querySelector("#front") };
      var target = id && document.getElementById(id);
      var panel = target && target.closest("[data-edition-panel]");
      if (!panel) return { id: "front", panel: panels[0], target: panels[0] };
      return { id: id, panel: panel, target: target };
    }

    function renderView(options) {
      options = options || {};
      var next = route();
      if (current && current !== next.id) positions.set(current, window.scrollY);
      panels.forEach(function (panel) {
        panel.hidden = next.id !== "all" && panel !== next.panel && !(next.id === "front" && panel.id === "finally");
      });
      overview.hidden = next.id !== "front" && next.id !== "all";
      viewLinks.forEach(function (link) {
        var selected = link.hash === "#" + next.id || (next.panel && link.hash === "#" + next.panel.id) || (link.closest(".edition-dock") && link.hash === "#listen" && next.panel && next.panel.id === "picks");
        if (selected) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
      var isSection = next.id !== "front" && (!next.panel || next.panel.id !== "picks");
      pickerTrigger.classList.toggle("is-current", isSection);
      pickerTrigger.setAttribute("aria-label", isSection && next.panel ? "Sections, " + next.panel.querySelector("h2").textContent.trim() + " selected" : "Sections");
      current = next.id;
      if (options.initial && !location.hash) return;

      var heading = next.target.matches("h2, h3") ? next.target : next.target.querySelector("h2, h3");
      if (options.focus && heading) heading.focus({ preventScroll: true });
      var top = options.restore && positions.has(next.id) ? positions.get(next.id) :
        next.id === "front" || next.id === "all" ? 0 : next.target.getBoundingClientRect().top + window.scrollY - 24;
      window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    }

    function closePicker() {
      picker.close();
      pickerTrigger.setAttribute("aria-expanded", "false");
      document.documentElement.classList.remove("picker-open");
    }

    pickerTrigger.hidden = false;
    document.querySelector(".sections-fallback").hidden = true;
    document.documentElement.classList.add("edition-reader");
    pickerTrigger.addEventListener("click", function () {
      picker.showModal();
      pickerTrigger.setAttribute("aria-expanded", "true");
      document.documentElement.classList.add("picker-open");
    });
    picker.querySelector(".picker-close").addEventListener("click", closePicker);
    picker.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      /* Keep every section reachable even when the platform's default
         Tab behaviour skips links. The native dialog makes the page inert. */
      var controls = Array.from(picker.querySelectorAll("button:not([disabled]), a[href]"));
      var index = controls.indexOf(document.activeElement);
      var next = (index + (e.shiftKey ? -1 : 1) + controls.length) % controls.length;
      e.preventDefault();
      controls[next].focus();
    });
    picker.addEventListener("close", function () {
      pickerTrigger.setAttribute("aria-expanded", "false");
      document.documentElement.classList.remove("picker-open");
    });
    picker.addEventListener("click", function (e) {
      if (e.target !== picker) return;
      var rect = picker.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) closePicker();
    });
    document.addEventListener("click", function (e) {
      var link = e.target.closest("[data-view-link]");
      if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (picker.open) closePicker();
      if (link.hash !== location.hash) history.pushState(null, "", link.hash);
      renderView({ focus: true });
    });
    window.addEventListener("popstate", function () { renderView({ restore: true }); });
    window.addEventListener("hashchange", function () { renderView({ restore: true }); });
    renderView({ initial: true });
  }

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
