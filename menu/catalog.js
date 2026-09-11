"use strict";
// Public catalog reads published data only, never a browser's management draft.
fetch('/menu/menu.json', {cache: 'no-cache'})
  .then(response => { if (!response.ok) throw new Error('Menu unavailable'); return response.json(); })
  .then(items => {
    if (!Array.isArray(items) || !items.every(item => item && typeof item.name === 'string')) throw new Error('Invalid menu');
    const grid = document.querySelector('.product-grid');
    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const card = document.createElement('article'); card.className = 'product-card'; card.id = item.id || `produk-${index + 1}`;
      const visual = document.createElement('div'); visual.className = 'product-image';
      if (typeof item.image === 'string' && /^(https?:\/\/|\/(?!\/)|data:image\/(png|jpeg|webp);base64,)/i.test(item.image)) {
        const img = document.createElement('img'); img.src = item.image; img.alt = item.name; img.loading = 'lazy';
        img.addEventListener('error', () => { img.remove(); visual.textContent = item.name; }); visual.append(img);
      } else visual.textContent = item.name;
      const info = document.createElement('div'); info.className = 'product-info';
      [['p','product-category',item.category],['h3','',item.name],['p','',item.description],['p','menu-price',item.price || 'Hubungi untuk harga']].forEach(([tag, cls, value]) => {
        const el = document.createElement(tag); el.className = cls; el.textContent = value || ''; info.append(el);
      });
      const link = document.createElement('a'); link.className = 'button button-primary'; link.textContent = 'Pesan via WhatsApp'; link.setAttribute('aria-label', `Pesan ${item.name} via WhatsApp`);
      link.href = 'https://wa.me/628133331105?text=' + encodeURIComponent(`Halo Maniac Duren, saya ingin pesan ${item.name}. Boleh info harga dan stok saat ini?`);
      link.target = '_blank'; link.rel = 'noopener noreferrer'; info.append(link); card.append(visual, info); fragment.append(card);
    });
    if (!items.length) { const empty = document.createElement('p'); empty.textContent = 'Menu sedang diperbarui. Silakan hubungi kami melalui WhatsApp.'; fragment.append(empty); }
    grid.replaceChildren(fragment);
    if(location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  }).catch(() => { /* Keep the supplied HTML catalog when published data is unavailable. */ });
