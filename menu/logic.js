'use strict';
(function(root){
  const types = {durian:'Durian',makanan:'Makanan',minuman:'Minuman'};
  const menuType = value => Object.hasOwn(types,value) ? value : 'durian';
  function price(value){
    if(value==null||value==='')return null;
    if(typeof value!=='number'&&!(typeof value==='string'&&/^\d+$/.test(value)))throw Error('Harga harus angka Rupiah utuh atau kosong untuk Stok Habis.');
    const n=Number(value);if(!Number.isSafeInteger(n)||n<0||n>1000000000)throw Error('Harga harus 0–1.000.000.000 tanpa desimal.');return n;
  }
  const money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
  function migrate(items){if(!Array.isArray(items))return items;return items.map(item=>{
    if(!item||typeof item.price!=='string'||/^\d*$/.test(item.price))return item;
    const m=item.price.match(/^(?:Mulai\s+)?Rp\s*([\d.]+)(?:\s*\/\s*(kg|porsi|paket|box|buah))?$/i);
    return {...item,price:m?Number(m[1].replaceAll('.','')):null,unit:item.unit||m?.[2]?.toLowerCase()||'porsi'};
  });}
  function reconcile(cart,products){
    if(!Array.isArray(cart))return [];const result=new Map();
    cart.forEach(line=>{if(!line||!products.some(p=>p.id===line.id&&p.price!==null)||!Number.isInteger(line.qty)||line.qty<1)return;result.set(line.id,{id:line.id,qty:Math.min(99,(result.get(line.id)?.qty||0)+line.qty),note:typeof line.note==='string'?line.note.slice(0,300):''});});return [...result.values()];
  }
  const total=(cart,products)=>cart.reduce((sum,line)=>sum+(products.find(p=>p.id===line.id)?.price||0)*line.qty,0);
  function message(cart,products){return ['Halo Maniac Duren, saya ingin pesan:',...cart.map((line,i)=>{const p=products.find(p=>p.id===line.id);return `${i+1}. ${p.name} — ${line.qty} ${p.unit} × ${money(p.price)} = ${money(p.price*line.qty)}${line.note ? '\n   Catatan: '+line.note : ''}`;}),'',`Total: ${money(total(cart,products))}`,'Belum termasuk ongkir. Mohon konfirmasi stok, berat akhir (untuk kg), dan total pembayaran.'].join('\n');}
  root.MenuLogic={types,menuType,price,money,migrate,reconcile,total,message};if(typeof module!=='undefined')module.exports=root.MenuLogic;
})(globalThis);
