/**
 * Collapsed/expanded state for the app sidebar.
 *
 * The preference lives in localStorage and is mirrored onto
 * `<html data-sidebar>`, so the `sidebar-collapsed:` variant in `globals.css`
 * can paint the narrow rail before React hydrates — the same anti-FOUC trick
 * the theme uses. React state tracks the same value only for the bits CSS
 * can't express (ARIA, tooltips), and reads the document through
 * `useSyncExternalStore` so hydration still matches the server's markup.
 */
export const SIDEBAR_STORAGE_KEY = "sidebar";

export type SidebarState = "collapsed" | "expanded";

/**
 * Anti-FOUC snippet, rendered in <head> of the root layout. Keep in sync with
 * `readSidebarState` below — both must read the same key and default.
 */
export const sidebarScript = `(function(){try{var s=localStorage.getItem("${SIDEBAR_STORAGE_KEY}");document.documentElement.dataset.sidebar=s==="collapsed"?"collapsed":"expanded";}catch(e){}})()`;

const listeners = new Set<() => void>();

/** Subscribe to changes, for `useSyncExternalStore`. */
export function subscribeSidebarState(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Whether the rail is showing, as the document currently has it. */
export function isSidebarCollapsed(): boolean {
  return document.documentElement.dataset.sidebar === "collapsed";
}

/** Server (and hydration) snapshot: the sidebar renders expanded by default. */
export function isSidebarCollapsedOnServer(): boolean {
  return false;
}

/** Apply a state to the document and remember it for the next page load. */
export function writeSidebarState(state: SidebarState) {
  document.documentElement.dataset.sidebar = state;
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, state);
  } catch {
    // localStorage may be unavailable (private mode, etc.) — ignore.
  }
  for (const listener of listeners) listener();
}
