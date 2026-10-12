// Small inline-SVG line icons. Returned as markup strings (no <script>, no style="").
function svg(inner, size = 22) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

export const icons = {
  home: svg('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9h13v-9"/><path d="M9.5 19v-6h5v6"/>'),
  practise: svg('<path d="M4 5.5h9a3 3 0 0 1 3 3V19"/><path d="M4 5.5v13.5h12"/><path d="M20 5.5h-4"/><path d="M20 9h-4"/><path d="M20 12.5h-4"/>'),
  cards: svg('<rect x="3" y="7" width="13" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>'),
  mistakes: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v6"/><circle cx="12" cy="16.3" r="0.4" fill="currentColor"/>'),
  more: svg('<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>'),
  star: svg('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9L12 17l-5.2 2.8 1-5.9-4.3-4.2 5.9-.8z" fill="currentColor" stroke="currentColor"/>'),
  starOutline: svg('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9L12 17l-5.2 2.8 1-5.9-4.3-4.2 5.9-.8z"/>'),
  check: svg('<path d="M4.5 12.5l5 5 10-11"/>'),
  cross: svg('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'),
  chevronRight: svg('<path d="M9 5l7 7-7 7"/>', 18),
  chevronDown: svg('<path d="M5 9l7 7 7-7"/>', 18),
  search: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/>', 18),
  close: svg('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>', 18),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>', 18),
  moon: svg('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>', 18),
  system: svg('<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16.5V20"/>', 18),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
  flag: svg('<path d="M6 3v18"/><path d="M6 4h11l-2.5 3.5L17 11H6"/>'),
  arrowLeft: svg('<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>', 18),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 18),
  trash: svg('<path d="M4 7h16"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/>', 18),
  download: svg('<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/>', 18),
  upload: svg('<path d="M12 21V9"/><path d="M7 13l5-5 5 5"/><path d="M5 4h14"/>', 18),
};

export function icon(name, size) {
  const fn = icons[name];
  return fn || '';
}
