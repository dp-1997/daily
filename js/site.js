/* damianpickett.com — menu, reveals, work briefs, lightbox, timeline. */

(function () {
  "use strict";

  /* The long staggered entrance is for first arrival only. On every
     later page in the session, content appears at once: replaying
     the stagger made internal navigation feel jumpy. */
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

  /* And when a real view transition runs, its crossfade is the
     entrance, so suppress the rise entirely. */
  window.addEventListener("pagereveal", function (e) {
    if (e.viewTransition) {
      document.documentElement.classList.add("vt-nav");
    }
  });

  /* ----- Menu ----- */

  var menu = document.querySelector(".menu");
  var trigger = menu && menu.querySelector(".menu-trigger");
  var links = menu && menu.querySelector(".menu-links");

  function setOpen(open) {
    menu.classList.toggle("is-open", open);
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    trigger.textContent = open ? "Close" : "Menu";
    if (open) {
      links.removeAttribute("inert");
    } else {
      links.setAttribute("inert", "");
    }
  }

  if (menu && trigger && links) {
    /* Size the collapsed pill to the label, so "Menu" sits dead
       centre whatever font the platform renders. */
    var font = getComputedStyle(trigger);
    var ctx = document.createElement("canvas").getContext("2d");
    ctx.font =
      font.fontWeight + " " + font.fontSize + " " + font.fontFamily;
    var label = Math.max(
      ctx.measureText("Menu").width,
      ctx.measureText("Close").width
    );
    menu.style.setProperty("--menu-cw", Math.ceil(label) + 52 + "px");

    /* Stagger indexes for the item reveal */
    var items = links.querySelectorAll("a, .menu-divider");
    menu.style.setProperty("--n", items.length - 1);
    items.forEach(function (el, i) {
      el.style.setProperty("--i", i);
    });

    setOpen(false);

    /* Warm the other pages' HTML the moment the menu is touched, so
       navigation lands from cache instead of starting cold. */
    var warmed = false;
    function warmPages() {
      if (warmed || !window.fetch) return;
      warmed = true;
      var here = location.pathname.replace(/\/$/, "") || "/";
      ["/", "/work", "/timeline", "/resume"].forEach(function (p) {
        if (p === here) return;
        try {
          fetch(p, { priority: "low" }).catch(function () {});
        } catch (err) {
          fetch(p).catch(function () {});
        }
      });
    }

    /* Open on pointerdown: the pill reacts on touch, not on release. */
    var suppressClick = false;
    trigger.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      suppressClick = true;
      setOpen(!menu.classList.contains("is-open"));
      warmPages();
    });
    trigger.addEventListener("pointerenter", warmPages);

    trigger.addEventListener("click", function () {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      /* keyboard activation */
      setOpen(!menu.classList.contains("is-open"));
      warmPages();
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
    links.querySelectorAll("a").forEach(function (a) {
      var path = a.getAttribute("href").replace(/\/$/, "") || "/";
      if (path === here || (path !== "/" && here.indexOf(path + "/") === 0)) {
        a.classList.add("active");
      }
    });
  }

  /* ----- Reveal on scroll ----- */

  var revealables = document.querySelectorAll("[data-reveal]");
  if (revealables.length) {
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              io.unobserve(entry.target);
            }
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
      );
      revealables.forEach(function (el) {
        io.observe(el);
      });
    } else {
      revealables.forEach(function (el) {
        el.classList.add("is-visible");
      });
    }
  }

  /* ----- Work: expandable role briefs ----- */

  document.querySelectorAll(".entry-head").forEach(function (head) {
    var entry = head.closest(".entry");
    var detail = document.getElementById(head.getAttribute("aria-controls"));
    if (!entry || !detail) return;

    head.addEventListener("click", function () {
      var open = !entry.classList.contains("is-open");
      entry.classList.toggle("is-open", open);
      head.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        detail.removeAttribute("inert");
        revealMedia(detail);
      } else {
        detail.setAttribute("inert", "");
      }
    });
  });

  /* Image slots fill in only for files that exist. Probed on first
     expansion, so pages never fetch or 404 for images nobody opened. */

  function revealMedia(detail) {
    var strip = detail.querySelector(".entry-media");
    if (!strip || strip.dataset.probed) return;
    strip.dataset.probed = "true";

    strip.querySelectorAll("figure").forEach(function (fig) {
      var img = fig.querySelector("img[data-src]");
      if (!img) {
        fig.remove();
        return;
      }
      var probe = new Image();
      probe.onload = function () {
        img.src = img.dataset.src;
        img.removeAttribute("data-src");
        strip.removeAttribute("hidden");
      };
      probe.onerror = function () {
        fig.remove();
      };
      probe.src = img.dataset.src;
    });
  }

  /* ----- Lightbox for work images ----- */

  var lightbox = null;
  var lightboxSource = null;

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove("is-open");
    document.documentElement.classList.remove("lightbox-open");
    var lb = lightbox;
    setTimeout(function () {
      if (lb.parentNode) lb.parentNode.removeChild(lb);
    }, 240);
    lightbox = null;
    if (lightboxSource) {
      lightboxSource.focus({ preventScroll: true });
      lightboxSource = null;
    }
  }

  function openLightbox(img) {
    closeLightbox();
    lightboxSource = img;

    var overlay = document.createElement("div");
    overlay.className = "lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", img.alt || "Image");

    var big = document.createElement("img");
    big.src = img.src;
    big.alt = img.alt || "";
    overlay.appendChild(big);

    var fig = img.closest("figure");
    var cap = fig && fig.querySelector("figcaption");
    if (cap) {
      var caption = document.createElement("figcaption");
      caption.textContent = cap.textContent;
      overlay.appendChild(caption);
    }

    var close = document.createElement("button");
    close.type = "button";
    close.className = "lightbox-close";
    close.setAttribute("aria-label", "Close image");
    overlay.appendChild(close);

    overlay.addEventListener("click", closeLightbox);
    overlay.addEventListener("keydown", function (e) {
      if (e.key === "Tab") e.preventDefault(); /* single control */
    });

    document.body.appendChild(overlay);
    document.documentElement.classList.add("lightbox-open");
    lightbox = overlay;
    setTimeout(function () {
      overlay.classList.add("is-open");
    }, 10);
    close.focus({ preventScroll: true });
  }

  document.addEventListener("click", function (e) {
    var img = e.target.closest && e.target.closest(".entry-media img, .cs-figure img");
    if (img && img.src) {
      e.preventDefault();
      openLightbox(img);
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && lightbox) closeLightbox();
  });

  /* ----- The egg -----
     Three quick taps on the portrait. */

  var eggPortrait = document.querySelector(".portrait");
  if (eggPortrait) {
    var eggEl = null;

    function closeEgg() {
      if (!eggEl) return;
      eggEl.classList.remove("is-open");
      var el = eggEl;
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 280);
      eggEl = null;
    }

    function openEgg() {
      if (eggEl) return;
      var overlay = document.createElement("div");
      overlay.className = "egg";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "A favourite quote");

      var inner = document.createElement("figure");
      inner.className = "egg-inner";

      var arc = document.createElement("div");
      arc.className = "egg-arc";
      arc.setAttribute("aria-hidden", "true");
      var DOTS = [
        [15.0, 66.0, 2.6, "#3f4c39"],
        [21.1, 46.1, 2.8, "#4a5a43"],
        [38.4, 29.2, 3.1, "#55684c"],
        [64.4, 18.0, 3.3, "#6c7f63"],
        [95.0, 14.0, 3.5, "#7c8f73"],
        [125.6, 18.0, 3.8, "#8ba37f"],
        [151.6, 29.2, 4.0, "#a9bf9d"],
        [168.9, 46.1, 4.3, "#dbe7d1"],
        [175.0, 66.0, 4.5, "#45caff"]
      ];
      var dots = DOTS.map(function (d) {
        var s = document.createElement("span");
        s.style.left = d[0] - d[2] + "px";
        s.style.top = d[1] - d[2] + "px";
        s.style.width = d[2] * 2 + "px";
        s.style.height = d[2] * 2 + "px";
        s.style.background = d[3];
        arc.appendChild(s);
        return s;
      });

      var text = document.createElement("div");
      text.className = "egg-text";
      text.innerHTML =
        '<blockquote>\u201CThink of your life as a rainbow arcing across the horizon of this world. You appear, have a chance to blaze in the sky, then you disappear. To know my arc will fall makes me want to blaze while I am in the sky. Not for others, but for myself, for the trail I know I am leaving.\u201D</blockquote>' +
        '<figcaption><b>Steve Jobs</b>from <i>Make Something Wonderful</i></figcaption>';

      inner.appendChild(arc);
      inner.appendChild(text);
      overlay.appendChild(inner);
      overlay.addEventListener("click", closeEgg);
      document.body.appendChild(overlay);
      eggEl = overlay;

      /* Each dot begins at the portrait and flies to its place in
         the arc, in sequence: the trail leaving the photograph. */
      var p = eggPortrait.getBoundingClientRect();
      var px = p.left + p.width / 2;
      var py = p.top + p.height / 2;
      dots.forEach(function (s, k) {
        var r = s.getBoundingClientRect();
        var dx = px - (r.left + r.width / 2);
        var dy = py - (r.top + r.height / 2);
        s.style.transform =
          "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px) scale(0.25)";
        s.style.transitionDelay = 140 + k * 80 + "ms, " + (140 + k * 80) + "ms";
      });

      setTimeout(function () {
        overlay.classList.add("is-open");
      }, 30);
    }

    eggPortrait.setAttribute("role", "button");
    eggPortrait.setAttribute("tabindex", "0");
    eggPortrait.setAttribute("aria-label", "A favourite quote");

    eggPortrait.addEventListener("click", openEgg);
    eggPortrait.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openEgg();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && eggEl) closeEgg();
    });
  }

  var motionOK =
    !window.matchMedia ||
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ----- Timeline choreography -----
     A focal band sits at ~40% of the viewport. The section inside it
     is sharp, full-size and fully opaque; everything above and below
     softens: slightly smaller, quieter, gently blurred. Each section
     follows its focus value on a soft spring, so scrolling feels
     buoyant without bouncing. */

  var tl = document.querySelector(".timeline");
  if (tl && motionOK) {
    tl.classList.add("tl-live");
    document.documentElement.classList.add("tl-snap");
    var tlRail = tl.querySelector(".t-rail");
    var tlEls = [].slice.call(tl.querySelectorAll(".t-block, .t-era"));
    var tlS = tlEls.map(function (el, i) {
      return { el: el, f: 0, v: 0, blur: -1, delay: i * 50 };
    });
    var railCur = 0;
    var railVel = 0;
    var tlT0 = null;
    var tlRaf = null;
    var lastFocused = -1;

    function tlTick(now) {
      if (tlT0 === null) tlT0 = now;
      var vh = window.innerHeight;
      if (vh < 1) {
        tlRaf = requestAnimationFrame(tlTick);
        return;
      }

      /* The focal band sits at 40% of the viewport, but slides down
         toward the bottom over the last stretch of scroll, so the
         final entries can come into full focus even though the page
         cannot scroll them any higher. */
      var maxScroll = document.documentElement.scrollHeight - vh;
      var endP =
        maxScroll > 0
          ? Math.max(
              0,
              Math.min(1, (window.scrollY - (maxScroll - vh * 0.6)) / (vh * 0.6))
            )
          : 1;
      var focal = vh * (0.4 + 0.38 * endP);
      var band = vh * 0.52;
      var bestIdx = -1;
      var bestFs = 0;

      tlS.forEach(function (s, i) {
        var r = s.el.getBoundingClientRect();
        var centre = (r.top + r.bottom) / 2;
        var d = Math.min(1, Math.abs(centre - focal) / band);
        var target = 1 - d;
        target = target * target * (3 - 2 * target); /* smoothstep falloff */
        if (now - tlT0 < s.delay) target = 0;

        s.v += (target - s.f) * 0.085;
        s.v *= 0.86;
        s.f += s.v;
        if (s.f > bestFs) {
          bestFs = s.f;
          bestIdx = i;
        }

        var fs = Math.max(0, Math.min(1, s.f));
        var below = centre > focal;
        var y = (1 - fs) * (below ? 16 : -8);
        var scale = 0.965 + 0.035 * fs;
        var op = 0.38 + 0.62 * fs;
        var blur = (1 - fs) * 2;

        s.el.style.transform =
          "translate3d(0," + y.toFixed(2) + "px,0) scale(" + scale.toFixed(4) + ")";
        s.el.style.opacity = op.toFixed(3);
        s.el.style.setProperty("--pop", Math.max(0.01, fs).toFixed(3));

        var b = blur < 0.08 ? 0 : Math.round(blur * 20) / 20;
        if (b !== s.blur) {
          s.blur = b;
          s.el.style.filter = b === 0 ? "none" : "blur(" + b + "px)";
        }
      });

      /* A tiny haptic tick as focus lands on a new section, on
         devices that expose vibration to the web (Android). */
      if (bestFs > 0.65 && bestIdx !== lastFocused) {
        if (lastFocused !== -1 && now - tlT0 > 900 && navigator.vibrate) {
          navigator.vibrate(3);
        }
        lastFocused = bestIdx;
      }

      if (tlRail) {
        var tr = tl.getBoundingClientRect();
        var target2 = (vh * 0.72 - tr.top) / tr.height;
        target2 = Math.max(0, Math.min(1, target2));
        railVel += (target2 - railCur) * 0.09;
        railVel *= 0.84;
        railCur += railVel;
        tlRail.style.transform = "scaleY(" + Math.max(0, railCur).toFixed(4) + ")";
      }

      tlRaf = requestAnimationFrame(tlTick);
    }
    tlRaf = requestAnimationFrame(tlTick);

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        if (tlRaf) cancelAnimationFrame(tlRaf);
        tlRaf = null;
      } else if (!tlRaf) {
        tlRaf = requestAnimationFrame(tlTick);
      }
    });
  }
})();
