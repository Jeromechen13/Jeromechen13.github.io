(() => {
  // src/scripts/motion.ts
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function createSpring(options) {
    let value = options.value ?? 0;
    let velocity = 0;
    let target = value;
    let raf = 0;
    const precision = options.precision ?? 15e-4;
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const tick = (now, last) => {
      const dt = Math.min(0.032, Math.max(8e-3, (now - last) / 1e3));
      const h = dt / 6;
      for (let i = 0; i < 6; i += 1) {
        const force = -options.stiffness * (value - target) - options.damping * velocity;
        velocity += force * h;
        value += velocity * h;
      }
      options.onUpdate(value);
      const velEps = Math.max(0.08, precision * 12);
      if (Math.abs(value - target) < precision && Math.abs(velocity) < velEps) {
        value = target;
        velocity = 0;
        raf = 0;
        options.onUpdate(value);
        options.onRest?.();
        return;
      }
      raf = requestAnimationFrame((next) => tick(next, now));
    };
    return {
      get value() {
        return value;
      },
      stop,
      snap(next) {
        stop();
        value = next;
        target = next;
        velocity = 0;
        options.onUpdate(next);
      },
      to(next) {
        target = next;
        if (reduced) {
          this.snap(next);
          options.onRest?.();
          return;
        }
        if (!raf) {
          const start = performance.now();
          raf = requestAnimationFrame((now) => tick(now, start));
        }
      }
    };
  }
  function bindPress(el) {
    let held = false;
    const paint = (scale) => {
      el.style.transform = `scale(${scale})`;
      const t = Math.min(1.35, Math.max(0, (scale - 0.94) / 0.06));
      const y = 1 + t * 3;
      const blur = 2 + t * 6;
      const alpha = 0.04 + t * 0.08;
      el.style.boxShadow = `0 ${y}px ${blur}px rgb(15 35 64 / ${alpha})`;
    };
    const spring = createSpring({ stiffness: 260, damping: 12, value: 1, onUpdate: paint });
    paint(1);
    const press = () => {
      held = true;
      spring.snap(0.94);
    };
    const release = () => {
      if (!held) return;
      held = false;
      spring.to(1);
    };
    el.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      press();
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
      }
    });
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("keydown", (event) => {
      if (event.repeat) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.key === " " && el.tagName === "A") return;
      press();
    });
    el.addEventListener("keyup", (event) => {
      if (event.key === "Enter" || event.key === " ") release();
    });
  }
  function bindTips() {
    const tip = document.querySelector("[data-tip-root]");
    const body = tip?.querySelector("[data-tip-body]");
    if (!tip || !body) return;
    let anchor = null;
    let open = false;
    let side = "top";
    const spring = createSpring({
      stiffness: 300,
      damping: 18,
      value: 0.6,
      onUpdate: (scale) => {
        if (!open) return;
        const rise = 14 * (1 - (scale - 0.6) / 0.4);
        const shift = side === "top" ? `translateY(calc(-100% + ${rise}px))` : `translateY(${rise}px)`;
        tip.style.transform = `translateX(-50%) ${shift} scale(${scale})`;
      }
    });
    const place = () => {
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      side = rect.top > 96 ? "top" : "bottom";
      tip.dataset.side = side;
      tip.style.left = `${rect.left + rect.width / 2}px`;
      tip.style.top = side === "top" ? `${rect.top - 8}px` : `${rect.bottom + 8}px`;
    };
    const hide = () => {
      if (!open) return;
      open = false;
      anchor = null;
      spring.stop();
      if (reduced) {
        tip.hidden = true;
        return;
      }
      tip.style.transition = "opacity 180ms ease";
      tip.style.opacity = "0";
      window.setTimeout(() => {
        if (!open) tip.hidden = true;
      }, 180);
    };
    const show = (next) => {
      const text = next.getAttribute("data-tip");
      if (!text) return;
      anchor = next;
      open = true;
      body.textContent = text;
      tip.hidden = false;
      tip.style.transition = "none";
      tip.style.opacity = "1";
      place();
      spring.snap(0.6);
      spring.to(1);
    };
    document.querySelectorAll("[data-tip]").forEach((el) => {
      el.addEventListener("pointerenter", () => show(el));
      el.addEventListener("focus", () => show(el));
    });
    document.addEventListener("pointerdown", (event) => {
      if (!open) return;
      const target = event.target;
      if (target instanceof Node && (tip.contains(target) || anchor?.contains(target))) return;
      hide();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hide();
    });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
  }
  function bindZoom() {
    const root = document.querySelector("[data-zoom-root]");
    const mask = document.querySelector("[data-zoom-mask]");
    const card = document.querySelector("[data-zoom-card]");
    const image = document.querySelector("[data-zoom-img]");
    const closeBtn = document.querySelector("[data-zoom-close]");
    if (!root || !mask || !card || !image || !closeBtn) return;
    let trigger = null;
    let generation = 0;
    let open = false;
    const spring = createSpring({
      stiffness: 260,
      damping: 20,
      value: 0.8,
      onUpdate: (scale) => {
        if (!open) return;
        card.style.transform = `scale(${scale})`;
      }
    });
    const finishClose = (token) => {
      if (token !== generation) return;
      open = false;
      root.hidden = true;
      card.style.opacity = "1";
      document.body.style.overflow = "";
      trigger?.focus();
    };
    const close = () => {
      if (root.hidden) return;
      const token = ++generation;
      open = false;
      spring.stop();
      const from = spring.value;
      if (reduced) {
        finishClose(token);
        return;
      }
      const started = performance.now();
      const step = (now) => {
        if (token !== generation) return;
        const t = Math.min(1, (now - started) / 200);
        card.style.transform = `scale(${from + (0.92 - from) * t})`;
        card.style.opacity = String(1 - t);
        mask.style.opacity = String(1 - t);
        if (t < 1) requestAnimationFrame(step);
        else finishClose(token);
      };
      requestAnimationFrame(step);
    };
    const openZoom = (src, alt, from) => {
      const token = ++generation;
      trigger = from;
      image.src = src;
      image.alt = alt;
      card.setAttribute("aria-label", alt ? `\u653E\u5927\u7684\u56FE\uFF1A${alt}` : "\u653E\u5927\u7684\u56FE");
      root.hidden = false;
      document.body.style.overflow = "hidden";
      card.style.opacity = "1";
      open = true;
      spring.snap(0.8);
      if (reduced) {
        mask.style.opacity = "1";
        spring.snap(1);
      } else {
        mask.style.opacity = "0";
        const started = performance.now();
        const fade = (now) => {
          if (token !== generation) return;
          const t = Math.min(1, (now - started) / 240);
          mask.style.opacity = String(t);
          if (t < 1) requestAnimationFrame(fade);
        };
        requestAnimationFrame(fade);
        spring.to(1);
      }
      closeBtn.focus({ preventScroll: true });
    };
    document.querySelectorAll("[data-zoom]").forEach((button) => {
      button.addEventListener("click", () => {
        const img = button.querySelector("img");
        if (!img) return;
        openZoom(img.currentSrc || img.src, button.dataset.zoomAlt || img.alt, button);
      });
    });
    closeBtn.addEventListener("click", close);
    mask.addEventListener("pointerdown", close);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
  }
  function bindCopy() {
    const toast = document.querySelector("[data-toast]");
    if (!toast) return;
    let token = 0;
    let timer = 0;
    const show = (message) => {
      const current = ++token;
      window.clearTimeout(timer);
      toast.textContent = message;
      if (reduced) {
        toast.style.transition = "none";
        toast.style.opacity = "1";
        toast.style.transform = "translateX(-50%) translateY(0)";
      } else {
        toast.style.transition = "none";
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(28px)";
        void toast.offsetWidth;
        toast.style.transition = "transform 260ms cubic-bezier(.16,.8,.2,1), opacity 260ms ease";
        toast.style.opacity = "1";
        toast.style.transform = "translateX(-50%) translateY(0)";
      }
      timer = window.setTimeout(() => {
        if (current !== token) return;
        toast.style.transition = reduced ? "none" : "opacity 200ms ease";
        toast.style.opacity = "0";
      }, (reduced ? 0 : 260) + 1200);
    };
    const write = async (text) => {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-999px";
      document.body.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      if (!ok) throw new Error("copy failed");
    };
    document.querySelectorAll("[data-copy]").forEach((button) => {
      button.addEventListener("click", async () => {
        const text = button.getAttribute("data-copy") ?? "";
        try {
          await write(text);
          show("\u90AE\u7BB1\u5DF2\u590D\u5236");
        } catch {
          show("\u6CA1\u80FD\u590D\u5236\uFF0C\u8BF7\u76F4\u63A5\u9009\u62E9\u90AE\u7BB1");
        }
      });
    });
  }
  document.querySelectorAll("[data-press]").forEach(bindPress);
  bindTips();
  bindZoom();
  bindCopy();
})();
