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
    var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var selectedTab = 0;
    var pickerAnimation = null;
    var collapsedPicker = "none";
    var afterPickerClose = null;

    function route() {
      var id;
      try { id = decodeURIComponent(location.hash.slice(1)); } catch (err) { id = ""; }
      // Old Listen bookmarks also start at the daily read, above the podcasts.
      if (id === "listen") {
        id = "picks";
        // Update the native anchor too, so the browser's load-time jump
        // cannot override our position after pictures have loaded.
        history.replaceState(null, "", "#picks");
      }
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
        var selected = link.hash === "#" + next.id || (next.panel && link.hash === "#" + next.panel.id);
        if (selected) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
      var isSection = next.id !== "front" && (!next.panel || next.panel.id !== "picks");
      pickerTrigger.classList.toggle("is-current", isSection);
      pickerTrigger.setAttribute("aria-label", isSection && next.panel ? "Sections, " + next.panel.querySelector("h2").textContent.trim() + " selected" : "Sections");
      selectedTab = isSection ? 2 : next.panel && next.panel.id === "picks" ? 1 : 0;
      updateDock();
      current = next.id;
      if (options.initial && !location.hash) return;

      var heading = next.target.matches("h2, h3") ? next.target : next.target.querySelector("h2, h3");
      if (options.focus && heading) heading.focus({ preventScroll: true });
      var top = options.restore && positions.has(next.id) ? positions.get(next.id) :
        next.id === "front" || next.id === "all" ? 0 : next.target.getBoundingClientRect().top + window.scrollY - 24;
      window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    }

    function updateDock() {
      dock.style.setProperty("--active-tab", picker.open && !picker.classList.contains("is-closing") ? 2 : selectedTab);
    }

    function spring(name) {
      var easing = getComputedStyle(picker).getPropertyValue(name).trim();
      return CSS.supports("animation-timing-function", easing) ? easing : "cubic-bezier(.2,.8,.2,1)";
    }

    function cancelPickerAnimation() {
      if (pickerAnimation) pickerAnimation.cancel();
      pickerAnimation = null;
    }

    function finishPickerClose() {
      cancelPickerAnimation();
      var after = afterPickerClose;
      afterPickerClose = null;
      picker.close();
      picker.classList.remove("is-opening", "is-closing");
      pickerTrigger.setAttribute("aria-expanded", "false");
      document.documentElement.classList.remove("picker-open");
      updateDock();
      // Move focus only after the modal releases the reading surface.
      if (after) after();
    }

    function closePicker(after) {
      if (picker.classList.contains("is-closing")) return;
      afterPickerClose = typeof after === "function" ? after : null;
      if (!picker.open || reducedMotion.matches || typeof picker.animate !== "function") {
        finishPickerClose();
        return;
      }
      // Closing mid-bounce starts from its current shape, without a snap.
      var transform = getComputedStyle(picker).transform;
      var opacity = getComputedStyle(picker).opacity;
      cancelPickerAnimation();
      picker.classList.remove("is-opening");
      picker.classList.add("is-closing");
      pickerTrigger.setAttribute("aria-expanded", "false");
      updateDock();
      var animation = picker.animate([
        { transform: transform, opacity: opacity },
        { transform: collapsedPicker, opacity: 0 }
      ], { duration: 240, easing: spring("--spring-w-retract"), fill: "forwards" });
      pickerAnimation = animation;
      animation.finished.then(function () {
        if (pickerAnimation === animation) finishPickerClose();
      }, function () { /* Interrupted motion is deliberately cancelled. */ });
    }

    function openPicker() {
      if (picker.open) return;
      picker.showModal();
      picker.scrollTop = 0;
      pickerTrigger.setAttribute("aria-expanded", "true");
      document.documentElement.classList.add("picker-open");
      updateDock();
      if (reducedMotion.matches || typeof picker.animate !== "function") return;

      // Grow out of the Sections tab using the original glass menu's spring.
      var from = pickerTrigger.getBoundingClientRect();
      var to = picker.getBoundingClientRect();
      collapsedPicker = "translate(" + (from.right - to.right) + "px," + (from.bottom - to.bottom) + "px) scale(" + from.width / to.width + "," + from.height / to.height + ")";
      picker.classList.add("is-opening");
      var animation = picker.animate([
        { transform: collapsedPicker, opacity: .3 },
        { transform: "none", opacity: 1 }
      ], { duration: 540, easing: spring("--spring-w-expand") });
      pickerAnimation = animation;
      animation.finished.then(function () {
        if (pickerAnimation !== animation) return;
        pickerAnimation = null;
        picker.classList.remove("is-opening");
      }, function () { /* Closing can interrupt the opening spring. */ });
    }

    pickerTrigger.hidden = false;
    document.querySelector(".sections-fallback").hidden = true;
    document.documentElement.classList.add("edition-reader");
    pickerTrigger.addEventListener("click", openPicker);
    picker.querySelector(".picker-close").addEventListener("click", closePicker);
    picker.addEventListener("cancel", function (e) {
      e.preventDefault();
      closePicker();
    });
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
      if (picker.open) return;
      cancelPickerAnimation();
      picker.classList.remove("is-opening", "is-closing");
      pickerTrigger.setAttribute("aria-expanded", "false");
      document.documentElement.classList.remove("picker-open");
      updateDock();
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
      function navigate() {
        if (link.hash !== location.hash) history.pushState(null, "", link.hash);
        renderView({ focus: true });
      }
      if (picker.open) closePicker(navigate);
      else navigate();
    });
    function restoreView() {
      if (picker.open) {
        afterPickerClose = null;
        finishPickerClose();
      }
      renderView({ restore: true });
    }
    window.addEventListener("popstate", restoreView);
    window.addEventListener("hashchange", restoreView);
    reducedMotion.addEventListener("change", function () {
      if (!reducedMotion.matches) return;
      if (picker.classList.contains("is-closing")) finishPickerClose();
      else {
        cancelPickerAnimation();
        picker.classList.remove("is-opening");
      }
    });
    renderView({ initial: true });
    requestAnimationFrame(function () { dock.classList.add("is-ready"); });
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
