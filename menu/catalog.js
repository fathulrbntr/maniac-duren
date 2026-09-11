'use strict';
(async()=>{
  const grid=document.querySelector('.product-grid'),status=document.querySelector('#cart-status'),checkout=document.querySelector('#checkout');
  const key='maniac-duren-cart-v1';let products=[],cart=[];
  const el=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const say=text=>{status.textContent=text;};
  function save(){try{localStorage.setItem(key,JSON.stringify(cart));}catch{say('Keranjang hanya tersimpan selama halaman terbuka karena penyimpanan browser tidak tersedia.');}}
  function drawCart(){
    const list=document.querySelector('#cart-items');list.replaceChildren();if(!cart.length)list.append(el('p','','Keranjang masih kosong.'));
    cart.forEach(line=>{
      const product=products.find(p=>p.id===line.id),row=el('div','cart-row'),info=el('div','');
      info.append(el('h3','',product.name),el('p','',`${MenuLogic.money(product.price)} / ${product.unit}`));
      const controls=el('div','cart-controls');
      function control(label,text,action,disabled=false){const button=el('button','',text);button.type='button';button.setAttribute('aria-label',label);button.disabled=disabled;button.onclick=()=>{action();save();drawCart();const next=[...document.querySelectorAll('.cart-controls button')].find(b=>b.getAttribute('aria-label')===label&&!b.disabled);(next||document.querySelector('#cart-title')).focus();};return button;}
      controls.append(control(`Kurangi ${product.name}`,'−',()=>{line.qty--;cart=cart.filter(x=>x.qty>0);}),el('span','',`${line.qty} ${product.unit}`),control(`Tambah ${product.name}`,'+',()=>line.qty++,line.qty>=99),control(`Hapus ${product.name}`,'Hapus',()=>{cart=cart.filter(x=>x.id!==line.id);}));
      row.append(info,controls,el('strong','',MenuLogic.money(product.price*line.qty)));list.append(row);
    });
    document.querySelector('#cart-count').textContent=`(${cart.reduce((n,l)=>n+l.qty,0)})`;
    document.querySelector('#cart-total').textContent=MenuLogic.money(MenuLogic.total(cart,products));checkout.disabled=!cart.length;
  }
  try{
    const response=await fetch('/menu/menu.json',{cache:'no-cache'});if(!response.ok)throw Error('fetch');
    const data=await response.json();if(!Array.isArray(data))throw Error('data');const ids=new Set();
    products=data.map(item=>{if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id)||typeof item.name!=='string')throw Error('product');ids.add(item.id);return {...item,price:MenuLogic.price(item.price),unit:['kg','porsi','paket','box','buah'].includes(item.unit)?item.unit:'porsi'};});
    grid.replaceChildren();
    products.forEach(product=>{
      const card=el('article','product-card');card.id=product.id;const visual=el('div','product-image');
      if(typeof product.image==='string'&&/^(https?:\/\/|\/(?!\/)|data:image\/(png|jpeg|webp);base64,)/i.test(product.image)){const img=el('img','');img.src=product.image;img.alt=product.name;img.loading='lazy';img.onerror=()=>visual.replaceChildren(el('span','',product.name));visual.append(img);}else visual.textContent=product.name;
      const info=el('div','product-info'),available=product.price!==null;
      info.append(el('p','product-category',product.category||''),el('h3','',product.name),el('p','',product.description||''),el('p','menu-price',available?`${MenuLogic.money(product.price)} / ${product.unit}`:'Stok Habis'));
      const add=el('button','button button-primary',available?'Tambah ke Keranjang':'Stok Habis');add.type='button';add.disabled=!available;add.setAttribute('aria-label',`${available?'Tambah ke keranjang:':'Stok habis:'} ${product.name}`);
      add.onclick=()=>{const line=cart.find(x=>x.id===product.id);if(line?.qty>=99){say('Maksimal 99 per produk dalam keranjang.');return;}if(line)line.qty++;else cart.push({id:product.id,qty:1});say(`${product.name} ditambahkan ke keranjang.`);save();drawCart();};
      info.append(add);card.append(visual,info);grid.append(card);
    });
    if(!products.length)grid.append(el('p','','Menu sedang diperbarui.'));
    try{const stored=JSON.parse(localStorage.getItem(key)||'[]');cart=MenuLogic.reconcile(stored,products);if(JSON.stringify(stored)!==JSON.stringify(cart))say('Keranjang disesuaikan dengan menu dan stok terbaru.');}catch{cart=[];}
    save();drawCart();if(location.hash){try{document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();}catch{}}
  }catch{grid.replaceChildren(el('p','','Menu belum dapat dimuat. Muat ulang halaman untuk mencoba kembali.'));checkout.disabled=true;}finally{grid.setAttribute('aria-busy','false');}
  document.querySelector('#cart-title').tabIndex=-1;
  checkout.onclick=()=>{cart=MenuLogic.reconcile(cart,products);save();drawCart();if(!cart.length)return;window.open('https://wa.me/628133331105?text='+encodeURIComponent(MenuLogic.message(cart,products)),'_blank','noopener,noreferrer');};
})();
