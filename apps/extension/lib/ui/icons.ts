/** Inline SVG icons, currentColor. Rendered with `ic(name)` into a `.ic` span. */
const A = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
export const ICONS = {
  mic: `<svg ${A}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg>`,
  micOff: `<svg ${A}><path d="M15 9.5V6a3 3 0 0 0-6 0v1M9 11v3a3 3 0 0 0 5 2.2M5 11a7 7 0 0 0 10.6 6M19 11a7 7 0 0 1-.7 3M12 18v3M9 21h6M4 4l16 16"/></svg>`,
  cam: `<svg ${A}><rect x="3" y="7" width="13" height="10" rx="2.5"/><path d="m16 10 5-2.5v9L16 14"/></svg>`,
  camOff: `<svg ${A}><path d="M8 7h5.5A2.5 2.5 0 0 1 16 9.5v1l5-2.5v9l-2.5-1.3M16 15.5a2.5 2.5 0 0 1-2.5 1.5H5.5A2.5 2.5 0 0 1 3 14.5v-5A2.5 2.5 0 0 1 5.5 7M4 4l16 16"/></svg>`,
  server: `<svg ${A}><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.2M7 17h.2"/></svg>`,
  eye: `<svg ${A}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg ${A}><path d="M3 3l18 18M10.6 6.3A11 11 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.6 6.8A16 16 0 0 0 2 12s3.5 6 10 6a10 10 0 0 0 4-.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`,
  info: `<svg ${A} stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.2"/></svg>`,
  warn: `<svg ${A} stroke-width="1.7"><path d="M12 3 22 21H2Z"/><path d="M12 10v5M12 18v.2"/></svg>`,
  ok: `<svg ${A} stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/></svg>`,
  err: `<svg ${A} stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 6v8M12 17v.2"/></svg>`,
} as const;
export type IconName = keyof typeof ICONS;
export const ic = (name: IconName, cls = '') => `<span class="ic ${cls}">${ICONS[name]}</span>`;
export const escapeHtml = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
