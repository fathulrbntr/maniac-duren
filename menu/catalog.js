'use strict';
(async()=>{
  const catalog=document.querySelector('#catalog'),status=document.querySelector('#cart-status'),checkout=document.querySelector('#checkout'),dialog=document.querySelector('#cart-dialog'),dock=document.querySelector('.cart-dock');
  const key='maniac-duren-cart-v1';let products=[],cart=[];const cards=new Map();let activeType='durian';
  function filterMenu(){
    document.querySelectorAll('[data-menu-type]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.menuType===activeType)));
    products.forEach(product=>{cards.get(product.id).hidden=product.menuType!==activeType;});
    catalog.querySelectorAll('.menu-group').forEach(section=>{section.hidden=![...section.querySelectorAll('.product-card')].some(card=>!card.hidden);});
    let empty=catalog.querySelector('.category-empty');
    if(!empty){empty=el('p','category-empty');catalog.append(empty);}
    empty.textContent=`Menu ${MenuLogic.types[activeType].toLowerCase()} belum tersedia.`;
    empty.hidden=products.some(product=>product.menuType===activeType);
  }
  document.querySelectorAll('[data-menu-type]').forEach(button=>{button.onclick=()=>{activeType=button.dataset.menuType;filterMenu();};});
  const el=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const say=text=>{status.textContent=text;};
  function save(){try{localStorage.setItem(key,JSON.stringify(cart));}catch{say('Keranjang tersimpan hanya selama halaman ini terbuka.');}}
  function openCart(){if(!dialog.open)dialog.showModal();}
  document.querySelector('#open-cart').onclick=openCart;
  document.querySelector('#close-cart').onclick=()=>dialog.close();
  document.querySelector('#add-more').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{if(!cart.length)document.querySelector('.add-button:not(:disabled)')?.focus();});
  function quantity(product,context){
    const line=cart.find(x=>x.id===product.id),controls=el('div','qty-controls');
    for(const [delta,label] of [[-1,'Kurangi'],[1,'Tambah']]){
      const button=el('button','',delta===1?'+':'−');button.type='button';button.dataset.focus=`${context}-${product.id}-${delta}`;button.setAttribute('aria-label',`${label} ${product.name}`);button.disabled=delta===1&&line.qty>=99;
      button.onclick=()=>{const token=button.dataset.focus;change(product,delta);const replacement=[...document.querySelectorAll('[data-focus]')].find(n=>n.dataset.focus===token&&!n.disabled);(replacement||(dialog.open?document.querySelector('#close-cart'):cards.get(product.id)?.querySelector('button')))?.focus();};
      if(delta===1)controls.append(el('span','',`${line.qty}`));controls.append(button);
    }
    return controls;
  }
  function change(product,delta){
    if(product.price===null)return;const line=cart.find(x=>x.id===product.id);
    if(line){line.qty=Math.min(99,line.qty+delta);cart=cart.filter(x=>x.qty>0);}else if(delta>0)cart.push({id:product.id,qty:1,note:''});
    say(`${product.name}: ${cart.find(x=>x.id===product.id)?.qty||0} ${product.unit} di keranjang.`);save();refresh();
  }
  function drawCard(product){
    const card=cards.get(product.id),bottom=card.querySelector('.product-bottom'),line=cart.find(x=>x.id===product.id);card.classList.toggle('selected',!!line);bottom.replaceChildren();
    if(product.price===null){bottom.append(el('span','stock-label','Stok Habis'));const b=el('button','add-button','Tambah');b.disabled=true;bottom.append(b);return;}
    if(line){const note=el('button','note-button',line.note?'Edit catatan':'＋ Catatan');note.type='button';note.onclick=()=>{openCart();document.getElementById(`note-${product.id}`)?.focus();};bottom.append(note,quantity(product,'card'));}
    else{bottom.append(el('span','product-badge',product.category||''));const add=el('button','add-button','Tambah');add.type='button';add.setAttribute('aria-label',`Tambah ke keranjang: ${product.name}`);add.onclick=()=>{change(product,1);card.querySelector('.qty-controls button:last-child')?.focus();};bottom.append(add);}
  }
  function refresh(){
    products.forEach(drawCard);
    const count=cart.reduce((n,l)=>n+l.qty,0),total=MenuLogic.money(MenuLogic.total(cart,products));dock.hidden=!count;
    document.querySelector('#dock-count').textContent=`${count} item`;document.querySelector('#dock-total').textContent=total;document.querySelector('#cart-total').textContent=total;checkout.disabled=!count;
    const list=document.querySelector('#cart-items');list.replaceChildren();if(!count)list.append(el('p','','Keranjang masih kosong. Tambahkan menu favoritmu.'));
    cart.forEach(line=>{
      const product=products.find(p=>p.id===line.id),row=el('article','cart-row'),top=el('div','cart-row-top'),info=el('div','');
      info.append(el('h3','',product.name),el('span','line-price',`${line.qty} ${product.unit} · ${MenuLogic.money(product.price*line.qty)}`));top.append(info,quantity(product,'dialog'));
      const label=el('label','','Catatan produk'),input=el('textarea','');input.id=`note-${product.id}`;label.htmlFor=input.id;input.maxLength=300;input.rows=2;input.placeholder='Contoh: pilih yang manis';input.value=line.note||'';
      input.oninput=()=>{line.note=input.value;save();drawCard(product);};row.append(top,label,input);list.append(row);
    });
  }
  try{
    const response=await fetch('/menu/menu.json',{cache:'no-cache'});if(!response.ok)throw Error('fetch');const data=await response.json();if(!Array.isArray(data))throw Error('data');const ids=new Set();
    products=data.map(item=>{if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id)||typeof item.name!=='string')throw Error('product');ids.add(item.id);return {...item,menuType:MenuLogic.menuType(item.menuType),price:MenuLogic.price(item.price),unit:['kg','porsi','paket','box','buah'].includes(item.unit)?item.unit:'porsi'};});
    catalog.replaceChildren();const groups=new Map();
    products.forEach(product=>{
      const group=typeof product.group==='string'&&product.group.trim()?product.group.trim():'Pilihan '+MenuLogic.types[product.menuType];
      if(!groups.has(group)){const section=el('section','menu-group'),grid=el('div','product-grid');section.append(el('h2','',group),grid);catalog.append(section);groups.set(group,grid);}
      const card=el('article',`product-card${product.price===null?' sold-out':''}`);card.id=product.id;const info=el('div','product-info');info.append(el('h3','',product.name),el('p','product-description',product.description||''));if(product.price!==null)info.append(el('p','menu-price',`${MenuLogic.money(product.price)} / ${product.unit}`));
      const visual=el('div','product-image');
      if(typeof product.image==='string'&&/^(https?:\/\/|\/(?!\/)|data:image\/(png|jpeg|webp);base64,)/i.test(product.image)){const img=el('img','');img.src=product.image;img.alt=product.name;img.loading='lazy';img.onerror=()=>visual.replaceChildren(el('span','',product.name));visual.append(img);}else visual.textContent=product.name;
      card.append(info,visual,el('div','product-bottom'));groups.get(group).append(card);cards.set(product.id,card);
    });
    if(!products.length)catalog.append(el('p','','Menu sedang diperbarui.'));
    try{cart=MenuLogic.reconcile(JSON.parse(localStorage.getItem(key)||'[]'),products);}catch{cart=[];}save();refresh();
    if(location.hash){try{const target=products.find(p=>p.id===decodeURIComponent(location.hash.slice(1)));if(target)activeType=target.menuType;}catch{}}
    filterMenu();
    if(location.hash){try{document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();}catch{}}
  }catch{catalog.replaceChildren(el('p','','Menu belum dapat dimuat. Muat ulang halaman untuk mencoba kembali.'));checkout.disabled=true;}finally{catalog.setAttribute('aria-busy','false');}
  checkout.onclick=()=>{cart=MenuLogic.reconcile(cart,products);save();refresh();if(!cart.length)return;window.open('https://wa.me/628133331105?text='+encodeURIComponent(MenuLogic.message(cart,products)),'_blank','noopener,noreferrer');};
})();
