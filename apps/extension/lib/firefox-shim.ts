/**
 * Firefox's `chrome.*` namespace takes callbacks and returns nothing; `browser.*`
 * is the promise-returning one every call in this extension expects. Imported
 * first by each entrypoint so the alias is in place before any other module runs.
 */
declare const browser: typeof chrome | undefined;
if (import.meta.env.BROWSER === 'firefox' && typeof browser !== 'undefined') (globalThis as { chrome: typeof chrome }).chrome = browser;
