// One stroke, viewbox and alignment for the cashier's small interface icons.
const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  fruit: '<path d="M12 6c-2-3-7-2-8 2-2 6 2 12 5 12 2 0 2-1 3-1s2 1 3 1c4 0 7-7 5-12-1-3-5-5-8-2Z"/><path d="M12 7V4m0 0c1-2 3-2 5-2-1 3-3 3-5 2Z"/>',
  drink: '<path d="M6 8h12l-2 13H8L6 8Zm5 0 2-6h4M5 8h14M8 13h8"/>',
  dessert: '<path d="m8 14 4 8 4-8M6 14h12M7 8a5 5 0 0 1 10 0 3 3 0 0 1 1 6H6a3 3 0 0 1 1-6Z"/>',
  food: '<path d="M3 13h18M5 13a7 7 0 0 1 14 0M3 17h18M12 6V3m-2 0h4"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  bag: '<path d="M4 7h16l-1 14H5L4 7ZM8 8V6a4 4 0 0 1 8 0v2"/>',
  remove: '<path d="M5 6h14M9 6V3h6v3M7 6l1 15h8l1-15M10 10v7m4-7v7"/>',
  display: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4M7 8h.01M7 11h.01"/>',
  scan: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 7v10m3-10v10m4-10v10m3-10v10"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
};
export const uiIcon = name => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.grid}</svg>`;
export function categoryIcon(name) {
  const key = String(name).toLowerCase();
  return uiIcon(/buah|duren|durian/.test(key) ? 'fruit' : /minum|coffee|kopi/.test(key) ? 'drink' : /dessert|es |pancake/.test(key) ? 'dessert' : /makan|olahan|durpas|coral/.test(key) ? 'food' : 'grid');
}
