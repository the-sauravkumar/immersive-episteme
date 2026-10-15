/**
 * In-page measurement helpers of the interface parity suite (tests/e2e/parity.spec.ts). Plain
 * JavaScript, installed with `addInitScript`, so the same code measures the 2D concept page and
 * the 3D information panel: `window.__parity.measure({ side })` returns everything one condition
 * contributes to checks P1-P10, P12, P14, P17, P18, P20, P22, P25 for the open concept.
 *
 * Every value is read from the live DOM and computed styles; nothing is assumed.
 */
export const PARITY_HELPERS = String.raw`
(() => {
  if (window.__parity) return;
  var raf = function () { return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(function () { r(); }); }); }); };
  var visible = function (el) {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === "function") return el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  };
  var firstVisible = function (sel, root) {
    var list = (root || document).querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) if (visible(list[i])) return list[i];
    return null;
  };
  var round = function (n, d) { var f = Math.pow(10, d == null ? 1 : d); return Math.round(n * f) / f; };
  var STYLE_PROPS = ["fontFamily", "fontSize", "lineHeight", "fontWeight", "letterSpacing", "color", "fontVariantNumeric", "fontFeatureSettings"];
  var styleSig = function (el) {
    if (!el) return null;
    var cs = getComputedStyle(el);
    return STYLE_PROPS.map(function (p) { return cs[p]; }).join("|");
  };
  var hash = function (s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, "0");
  };
  var norm = function (s) { return (s || "").replace(/\s+/g, " ").trim(); };

  // ---- colour and contrast (WCAG 2.2 relative luminance; ratios truncated, R-A2) ----
  var parse = function (c) {
    var m = /rgba?\(([^)]+)\)/.exec(c || "");
    if (!m) return null;
    var p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  var over = function (top, bottom) {
    var a = top.a + bottom.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return { r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a, g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a, b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a, a: a };
  };
  var lum = function (c) {
    var f = function (v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  var ratio = function (a, b) { var x = lum(a), y = lum(b); var r = (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); return Math.floor(r * 100) / 100; };
  var effectiveBg = function (el) {
    var layers = [];
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) {
      var c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    var base = { r: 255, g: 255, b: 255, a: 1 };
    for (var i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  var textColour = function (el) {
    var cs = getComputedStyle(el);
    if (el instanceof SVGElement) { var f = parse(cs.fill); if (f) return f; }
    return parse(cs.color);
  };
  var htmlAncestor = function (el) { var e = el; while (e && e instanceof SVGElement) e = e.parentElement; return e; };

  var lineRects = function (el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    var tops = [];
    var rects = Array.prototype.slice.call(range.getClientRects()).filter(function (r) { return r.width > 0 && r.height > 0; });
    var lines = [];
    rects.forEach(function (r) {
      var t = Math.round(r.top);
      var hit = lines.find(function (l) { return Math.abs(l.top - t) <= 3; });
      if (hit) { hit.bottom = Math.max(hit.bottom, r.bottom); } else lines.push({ top: t, bottom: r.bottom });
    });
    return lines;
  };

  var INTERACTIVE = "a[href], button, input, select, textarea, summary, [role=tab], [role=button], [role=switch], [tabindex]:not([tabindex='-1'])";
  var targetsIn = function (root, label, out) {
    if (!root) return;
    root.querySelectorAll(INTERACTIVE).forEach(function (el) {
      if (!visible(el)) return;
      var r = el.getBoundingClientRect();
      if (r.width <= 1 && r.height <= 1) return; // visually hidden until focused (skip links)
      // A target's hit area includes an ::after hit-area extension (compact buttons).
      var after = getComputedStyle(el, "::after");
      var w = r.width, h = r.height;
      if (after && after.content && after.content !== "none" && after.position === "absolute") {
        w = Math.max(w, parseFloat(after.minWidth) || 0); h = Math.max(h, parseFloat(after.minHeight) || 0);
      }
      out.push({ where: label, name: norm(el.getAttribute("aria-label") || el.textContent).slice(0, 40), w: round(w), h: round(h), ok: w >= 44 - 0.01 && h >= 44 - 0.01 });
    });
  };

  var sheetOf = function (side) {
    return side === "3d" ? firstVisible("#museum-panel [data-slot=knowledge-sheet]") : firstVisible("main [data-slot=knowledge-sheet]");
  };
  var scrollerOf = function (side) { return side === "3d" ? document.getElementById("museum-panel") : null; };

  var groundColour = function () {
    var probe = document.createElement("div");
    probe.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;background:var(--ground)";
    document.body.appendChild(probe);
    var c = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return c;
  };

  var studyBar = function () { return firstVisible("[data-slot=study-bar]"); };
  var noticeHeight = function () {
    var n = firstVisible("[data-access-notice]") || firstVisible("[data-slot=unverified-notice]");
    return n ? round(n.getBoundingClientRect().height) : 0;
  };

  window.__parity = {
    raf: raf,
    visible: visible,
    styleSig: styleSig,
    hash: hash,
    sheetOf: sheetOf,
    scrollerOf: scrollerOf,

    /** One condition's static measurements of the open concept. */
    measure: function (opts) {
      var side = opts.side;
      var sheet = sheetOf(side);
      if (!sheet) return { error: "no visible knowledge sheet" };
      var bar = studyBar();
      var chromeBottom = bar ? bar.getBoundingClientRect().bottom : 0;
      var claimsOl = firstVisible("ol[aria-label='Statements']", sheet);
      var claimLis = claimsOl ? Array.prototype.filter.call(claimsOl.children, function (li) { return li.tagName === "LI"; }) : [];
      var claimPs = claimLis.map(function (li) { return li.querySelector("p.text-reading") || li.querySelector("p"); }).filter(Boolean);
      var h1 = sheet.querySelector("h1, h2[tabindex='-1']");
      var fig = firstVisible("[data-slot=knowledge-figure]", sheet);
      var caption = fig ? fig.querySelector("figcaption .text-caption") : null;
      var credit = fig ? fig.querySelector("figcaption .text-credit") : null;
      var note = claimsOl ? firstVisible("[data-slot=citation-note] button", claimsOl) : null;
      var source = note ? note.querySelector(".text-source") : null;

      // P3 / P8: rendered lines per claim, and claim lines fully visible in the first screen.
      var scroller = scrollerOf(side);
      var viewTop = chromeBottom;
      var viewBottom = window.innerHeight;
      if (scroller) { var sr = scroller.getBoundingClientRect(); viewTop = Math.max(viewTop, sr.top); viewBottom = Math.min(viewBottom, sr.bottom); }
      var perClaim = [];
      var visibleLines = 0;
      claimPs.forEach(function (p) {
        var ls = lineRects(p);
        perClaim.push(ls.length);
        ls.forEach(function (l) { if (l.top >= viewTop - 1 && l.bottom <= viewBottom + 1) visibleLines++; });
      });

      // P4: the knowledge container's surface.
      var container = side === "3d" ? document.getElementById("museum-panel") : sheet;
      var ccs = getComputedStyle(container);
      var scs = getComputedStyle(sheet);

      // P5: texts (claims, captions, credits, alt text). Citation records are read by the spec.
      var figures = Array.prototype.filter.call(sheet.querySelectorAll("[data-slot=knowledge-figure]"), visible).map(function (f) {
        var slot = f.querySelector("[data-slot=figure-slot]");
        var sr2 = slot ? slot.getBoundingClientRect() : { width: 0, height: 0 };
        var img = f.querySelector("[data-slot=figure-slot] img");
        var svg = f.querySelector("[data-slot=figure-slot] [role=img]");
        var li = f.closest("li");
        return {
          index: li && claimsOl ? Array.prototype.indexOf.call(claimsOl.children, li) : -1,
          kind: f.getAttribute("data-figure-kind"),
          src: img ? img.getAttribute("src") : (f.getAttribute("data-figure-id") || ""),
          alt: img ? img.getAttribute("alt") : (svg ? svg.getAttribute("aria-label") : ""),
          caption: norm((f.querySelector("figcaption .text-caption") || {}).textContent),
          credit: norm((f.querySelector("figcaption .text-credit") || {}).textContent),
          w: round(sr2.width), h: round(sr2.height), ratio: sr2.height ? round(sr2.width / sr2.height, 3) : 0,
        };
      });
      var texts = {
        claims: claimPs.map(function (p) { return norm(p.textContent); }),
        notes: claimsOl ? Array.prototype.map.call(claimsOl.querySelectorAll("[data-slot=citation-note] button"), function (b) { return norm(b.getAttribute("aria-label")); }) : [],
        captions: figures.map(function (f) { return f.caption; }),
        credits: figures.map(function (f) { return f.credit; }),
        alts: figures.map(function (f) { return f.alt; }),
      };

      // P9: interactive targets of the StudyBar and the sheet (and, in 3D, the panel's Close and the plan).
      var targets = [];
      targetsIn(bar, "studybar", targets);
      targetsIn(sheet, "sheet", targets);
      if (side === "3d") {
        targetsIn(document.querySelector("[data-slot=panel-close]") ? document.querySelector("[data-slot=panel-close]").parentElement : null, "panel-close", targets);
        targetsIn(firstVisible("[data-slot=museum-minimap]"), "minimap", targets);
      }

      // P10: contrast of every visible text node in the knowledge container.
      var walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
      var minRatio = 99, fails = [], checked = 0;
      for (var n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!/\S/.test(n.nodeValue)) continue;
        var pe = n.parentElement;
        if (!pe || !visible(pe)) continue;
        var fg = textColour(pe);
        if (!fg) continue;
        var bg = effectiveBg(htmlAncestor(pe));
        var opacity = 1;
        for (var e2 = pe; e2 && e2.nodeType === 1; e2 = e2.parentElement) opacity *= parseFloat(getComputedStyle(e2).opacity) || 1;
        var fgc = over({ r: fg.r, g: fg.g, b: fg.b, a: fg.a * opacity }, bg);
        var r2 = ratio(fgc, bg);
        checked++;
        if (r2 < minRatio) minRatio = r2;
        if (r2 < 4.5 && fails.length < 5) fails.push(norm(n.nodeValue).slice(0, 30) + " " + r2);
      }

      // P17: the neutral tradition marker in the sheet's metadata.
      var marker = firstVisible("[data-slot=tradition-marker]", sheet);
      var markerSig = null;
      if (marker) { var ms = getComputedStyle(marker); var mr = marker.getBoundingClientRect(); markerSig = [round(mr.width), round(mr.height), ms.borderTopWidth, ms.borderTopColor, ms.backgroundColor].join("|"); }

      // P18: Related Concepts after the field and before the pager, and its offset below the field.
      var field = firstVisible("[data-slot=sheet-field]", sheet);
      var related = firstVisible("[data-slot=related-concepts]", sheet);
      var pager = firstVisible("[data-slot=pager]", sheet);
      var rel = null;
      if (related) {
        rel = {
          afterField: !!(field && (field.compareDocumentPosition(related) & Node.DOCUMENT_POSITION_FOLLOWING)),
          beforePager: pager ? !!(related.compareDocumentPosition(pager) & Node.DOCUMENT_POSITION_FOLLOWING) : true,
          offset: field ? round(related.getBoundingClientRect().top - field.getBoundingClientRect().bottom) : null,
        };
      }

      // P20: rendered interface strings of the shared parts.
      var ui = [];
      var addText = function (label, el) { if (el && visible(el)) ui.push(label + "=" + norm(el.getAttribute("aria-label") || el.textContent).replace(/\d+/g, "#")); };
      var shared = firstVisible("[data-slot=study-bar-shared]");
      if (shared) shared.querySelectorAll("button, [role=timer], [data-slot=learning-timer]").forEach(function (el) { addText("bar", el); });
      sheet.querySelectorAll("[role=tab]").forEach(function (el) { addText("tab", el); });
      addText("field", sheet.querySelector("[data-slot=sheet-field] > h2, h2[id$='-field']"));
      addText("related", related ? related.querySelector("h2") : null);
      if (pager) pager.querySelectorAll(".text-eyebrow").forEach(function (el) { addText("pager", el); });
      addText("note", note ? note.querySelector(".text-eyebrow") : null);
      addText("progress", sheet.querySelector("[role=progressbar]"));
      addText("meta", sheet.querySelector("[data-slot=sheet-meta]") ? sheet.querySelector("[data-slot=sheet-meta] dt") : null);

      // P22: the shared StudyBar group and the skip link.
      var barItems = [];
      if (bar) {
        var push = function (label, el) {
          if (!el) return;
          var r3 = el.getBoundingClientRect();
          barItems.push({ label: label, name: norm(el.getAttribute("aria-label") || el.textContent).replace(/\d+/g, "#"), x: round(r3.x), y: round(r3.y), w: round(r3.width), h: round(r3.height), style: styleSig(el) });
        };
        push("wordmark", bar.querySelector("[data-slot=wordmark]"));
        bar.querySelectorAll("[data-slot=study-bar-shared] button").forEach(function (el, i) { push("shared-" + i, el); });
        push("timer", bar.querySelector("[data-slot=learning-timer]"));
        push("skip", bar.querySelector("[data-slot=study-skip-link]"));
      }

      // P25: the reading-progress bar.
      var prog = sheet.querySelector("[role=progressbar]");
      var progress = null;
      if (prog) {
        var pr = prog.getBoundingClientRect();
        var fill = prog.firstElementChild;
        progress = { h: round(pr.height), track: getComputedStyle(prog).backgroundColor, fill: fill ? getComputedStyle(fill).backgroundColor : null, role: prog.getAttribute("role"), value: prog.getAttribute("aria-valuenow") };
      }

      return {
        styles: { claim: styleSig(claimPs[0]), title: styleSig(h1), caption: styleSig(caption), credit: styleSig(credit), source: styleSig(source), citeButton: styleSig(note) },
        claimWidth: claimPs[0] ? round(claimPs[0].getBoundingClientRect().width) : null,
        linesPerClaim: perClaim,
        visibleLines: visibleLines,
        surface: { bg: ccs.backgroundColor, sheetBg: scs.backgroundColor, backdrop: ccs.backdropFilter || "none", ground: groundColour() },
        texts: texts,
        headingOffset: h1 ? round(h1.getBoundingClientRect().top - chromeBottom) : null,
        chrome: { studyBar: bar ? round(bar.getBoundingClientRect().height) : null, notice: noticeHeight() },
        targets: targets,
        contrast: { min: minRatio, checked: checked, fails: fails },
        figures: figures,
        marker: markerSig,
        related: rel,
        ui: ui,
        bar: barItems,
        progress: progress,
        titleStyle: styleSig(h1),
        theme: { dark: document.documentElement.classList.contains("dark"), hc: document.documentElement.classList.contains("a11y-contrast") },
      };
    },

    /** P12: elements whose computed transition or animation runs longer than the 0.01 ms clamp. */
    motion: function () {
      var bad = 0, sample = [];
      var long = function (v) { return (v || "0s").split(",").some(function (x) { x = x.trim(); var s = x.endsWith("ms") ? parseFloat(x) / 1000 : parseFloat(x); return s > 0.00001; }); };
      document.querySelectorAll("*").forEach(function (el) {
        var cs = getComputedStyle(el);
        var anim = cs.animationName && cs.animationName !== "none" && long(cs.animationDuration);
        var trans = long(cs.transitionDuration) && cs.transitionProperty !== "none";
        if (anim || trans) { bad++; if (sample.length < 4) sample.push(el.tagName.toLowerCase() + "." + String(el.className).slice(0, 40)); }
      });
      return { bad: bad, sample: sample };
    },

    /** Reads every citation record of the open concept (opening and closing each note in turn). */
    records: async function (side) {
      var sheet = sheetOf(side);
      var ol = sheet ? sheet.querySelector("ol[aria-label='Statements']") : null;
      if (!ol) return { texts: [], quoteStyle: null };
      var out = [], quoteStyle = null;
      var buttons = Array.prototype.slice.call(ol.querySelectorAll("[data-slot=citation-note] > button"));
      for (var i = 0; i < buttons.length; i++) {
        var b = buttons[i];
        b.click(); await raf();
        var rec = b.parentElement.querySelector("[data-slot=citation-record]");
        out.push(norm(rec ? rec.textContent : ""));
        if (!quoteStyle && rec) { var q = rec.querySelector("blockquote, q, [data-slot=citation-quote]") || rec.querySelector("p"); quoteStyle = styleSig(q); }
        b.click(); await raf();
      }
      return { texts: out, quoteStyle: quoteStyle };
    },

    /** Scrolls the sheet's scroll container to the end and reads the reading-progress value (P25). */
    progressAtEnd: async function (side) {
      var sheet = sheetOf(side);
      var scroller = scrollerOf(side);
      if (scroller) scroller.scrollTop = scroller.scrollHeight; else window.scrollTo(0, document.documentElement.scrollHeight);
      await raf(); await raf();
      var prog = sheet ? sheet.querySelector("[role=progressbar]") : null;
      var v = prog ? prog.getAttribute("aria-valuenow") : null;
      if (scroller) scroller.scrollTop = 0; else window.scrollTo(0, 0);
      await raf();
      return v;
    },

    /** Applies a display theme through the stored preferences (in study the sync forces light). */
    applyTheme: async function (t) {
      try {
        localStorage.setItem("ie-display", JSON.stringify({ contrast: t.hc, reduceMotion: false }));
        localStorage.setItem("theme", t.dark ? "dark" : "light");
      } catch (e) {}
      var d = document.documentElement;
      // In study zones the display sync re-applies the stored classes whenever "dark" appears.
      d.classList.add("dark");
      await raf();
      if (!t.dark && d.classList.contains("dark")) d.classList.remove("dark");
      await raf();
      return { dark: d.classList.contains("dark"), hc: d.classList.contains("a11y-contrast") };
    },

    /** Layout-shift score since the observer started (all entries, and excluding recent input). */
    startShift: function () {
      window.__shift = { all: 0, noInput: 0 };
      var po = new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (e) { window.__shift.all += e.value; if (!e.hadRecentInput) window.__shift.noInput += e.value; });
      });
      po.observe({ type: "layout-shift", buffered: false });
      window.__shiftObserver = po;
    },
    stopShift: function () {
      if (window.__shiftObserver) window.__shiftObserver.disconnect();
      return window.__shift || { all: 0, noInput: 0 };
    },
    /** CLS of the page load (buffered layout-shift entries without recent input). */
    loadShift: function () {
      return new Promise(function (resolve) {
        var total = 0;
        try {
          var po = new PerformanceObserver(function (list) { list.getEntries().forEach(function (e) { if (!e.hadRecentInput) total += e.value; }); });
          po.observe({ type: "layout-shift", buffered: true });
          setTimeout(function () { po.disconnect(); resolve(total); }, 300);
        } catch (e) { resolve(null); }
      });
    },
  };
})();
`;
