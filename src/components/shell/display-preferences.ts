/**
 * Display preferences (DESIGN.md 4.5, 9.19; DR-019): the per-device choices behind the Display
 * Settings dialog, and how they become classes on <html>.
 *
 *  - Theme (light or dark) is owned by next-themes (storage key "theme"), whose own pre-paint
 *    script applies it on public and console pages.
 *  - High contrast and Reduce motion are stored here under one key as JSON.
 *
 * Zones:
 *  - "public" and "console": every stored choice applies.
 *  - "study" (/learn/*, /study/*): the theme is forced to light in BOTH conditions (DR-019: a dark
 *    theme would darken the whole 2D page but only the chrome and panel in 3D). High contrast
 *    applies as an accessibility accommodation, identically in both conditions. Reduce motion is
 *    moot (study has no motion), so its class is not written: the classes on <html> are then the
 *    same in both conditions for the same stored choices.
 *
 * Deliberately NOT a "use client" module: the boot script string below must be importable by a
 * server component (the root layout) as a plain value.
 */

export type DisplayZone = "public" | "console" | "study";

export interface StoredDisplayPreferences {
  /** `.a11y-contrast` on <html>. */
  contrast: boolean;
  /** `.a11y-reduce-motion` on <html> (public and console only). */
  reduceMotion: boolean;
}

/** localStorage key for the high-contrast and reduce-motion choices. */
export const DISPLAY_STORAGE_KEY = "ie-display";
/** localStorage key next-themes uses for the theme (its default). */
export const THEME_STORAGE_KEY = "theme";

export const DEFAULT_DISPLAY_PREFERENCES: StoredDisplayPreferences = { contrast: false, reduceMotion: false };

/** Route prefixes that are study mode (DESIGN.md 3): light only, zero motion. */
export const STUDY_PATH_PREFIXES = ["/learn", "/study"] as const;

export function isStudyPath(pathname: string): boolean {
  return STUDY_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Parses the stored JSON defensively: anything malformed falls back to the defaults. */
export function parseDisplayPreferences(raw: string | null | undefined): StoredDisplayPreferences {
  if (!raw) return { ...DEFAULT_DISPLAY_PREFERENCES };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return { ...DEFAULT_DISPLAY_PREFERENCES };
    const v = value as Record<string, unknown>;
    return { contrast: v.contrast === true, reduceMotion: v.reduceMotion === true };
  } catch {
    return { ...DEFAULT_DISPLAY_PREFERENCES };
  }
}

/** Reads the stored choices. Storage can be blocked (private windows, policies): never throws. */
export function readDisplayPreferences(): StoredDisplayPreferences {
  try {
    return parseDisplayPreferences(window.localStorage.getItem(DISPLAY_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_DISPLAY_PREFERENCES };
  }
}

export function writeDisplayPreferences(prefs: StoredDisplayPreferences): void {
  try {
    window.localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
}

/** The stored theme as next-themes wrote it; anything but "dark" is light (forced light default). */
export function readStoredTheme(): "light" | "dark" {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/**
 * Writes the zone's classes on <html>. In the study zone the `dark` class is removed and the
 * colour scheme set to light; elsewhere the stored theme is restored (next-themes may not re-apply
 * it after a study page removed it, because its own state did not change).
 */
export function applyDisplayClasses(zone: DisplayZone, prefs: StoredDisplayPreferences = readDisplayPreferences()): void {
  const html = document.documentElement;
  html.classList.toggle("a11y-contrast", prefs.contrast);
  html.classList.toggle("a11y-reduce-motion", zone !== "study" && prefs.reduceMotion);
  const dark = zone !== "study" && readStoredTheme() === "dark";
  html.classList.toggle("dark", dark);
  html.classList.toggle("light", !dark);
  html.style.colorScheme = dark ? "dark" : "light";
}

/** Name of the window property holding the boot script's study-route guard (see below). */
export const STUDY_GUARD_GLOBAL = "__ieStudyThemeGuard";

/**
 * Pre-paint boot script for the root layout's <head> (an inline script, so it runs before first
 * paint on a hard load; the CSP allows inline scripts, see src/lib/security/csp.ts). It applies the
 * stored high-contrast and reduce-motion classes, and forces light on study routes, so neither a
 * high-contrast user nor a study page ever flashes the wrong theme.
 *
 * On a study route it also installs a MutationObserver that strips `dark` again when next-themes'
 * own script (which runs later, inside <body>) adds it. The observer callback is a microtask, so
 * it runs before paint. <DisplayPreferencesSync> disconnects it on mount and takes over; client
 * navigation is handled there.
 */
export const DISPLAY_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,p={};try{p=JSON.parse(localStorage.getItem(${JSON.stringify(
  DISPLAY_STORAGE_KEY,
)})||"{}")||{}}catch(e){}var s=/^\\/(learn|study)(\\/|$)/.test(location.pathname);d.classList.toggle("a11y-contrast",p.contrast===true);d.classList.toggle("a11y-reduce-motion",!s&&p.reduceMotion===true);if(s){var f=function(){if(d.classList.contains("dark")){d.classList.remove("dark");d.classList.add("light")}d.style.colorScheme="light"};f();var o=new MutationObserver(f);o.observe(d,{attributes:true,attributeFilter:["class","style"]});window[${JSON.stringify(
  STUDY_GUARD_GLOBAL,
)}]=o}}catch(e){}})();`;
