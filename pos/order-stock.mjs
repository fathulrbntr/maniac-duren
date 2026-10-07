// A recipe uses prepared ingredients as stock; it never manufactures missing prep automatically.
export function requirements(state, lines) {
  const needs = new Map();
  const add = (key, qty, pieces = 0) => {
    const prior = needs.get(key) || {qty:0,pieces:0};
    needs.set(key,{qty:prior.qty + Number(qty),pieces:prior.pieces + Number(pieces)});
  };
  for (const line of lines) {
    const p = state.products.find(p=>p.id===line.productId);
    if (!p || ['raw','prep'].includes(p.itemType)) throw Error('Produk tidak dapat dijual');
    if (p.stockUnit==='kg_butir') {
      if (!line.lotId || !Number.isFinite(Number(line.kg)) || !(Number(line.kg)>0) || !Number.isInteger(Number(line.pieces)) || !(Number(line.pieces)>0)) throw Error('Isi berat dan butir buah');
      if (state.lots.find(l=>l.id===line.lotId)?.productId !== p.id) throw Error('Asal stok buah tidak cocok');
      add('lot:'+line.lotId,line.kg,line.pieces);
    } else {
      if (!Number.isFinite(Number(line.qty)) || !(Number(line.qty)>0) || (['pcs','porsi'].includes(p.stockUnit) && !Number.isInteger(Number(line.qty)))) throw Error('Jumlah produk tidak valid');
      if (p.itemType==='recipe') {
      const recipes=(state.recipes||[]).filter(r=>r.outputId===p.id);
      if(recipes.length!==1 || !(recipes[0].yieldQty>0) || !recipes[0].ingredients?.length) throw Error('Resep belum lengkap');
      for(const item of recipes[0].ingredients) {
        const qty=Number(item.qty)*Number(line.qty)/Number(recipes[0].yieldQty);
        const unit=state.products.find(p=>p.id===item.productId)?.stockUnit;
        if(!(qty>0) || (['pcs','porsi'].includes(unit)&&!Number.isInteger(qty))) throw Error('Takaran resep tidak valid');
        add('product:'+item.productId,qty);
      }
    } else add('product:'+p.id,line.qty);
    }
  }
  return needs;
}
export function availableStock(state, store, date) {
  const result=new Map();
  const add=(key,qty,pieces=0)=>{const old=result.get(key)||{qty:0,pieces:0};result.set(key,{qty:old.qty+Number(qty),pieces:old.pieces+Number(pieces)});};
  for(const lot of state.unitLots||[]) if(lot.storeId===store&&lot.date<=date&&(!lot.expiry||lot.expiry>=date)) add('product:'+lot.productId,lot.qty);
  for(const lot of state.lots||[]) if(lot.storeId===store&&lot.quality==='ready'&&lot.date<=date) add('lot:'+lot.id,lot.kg,lot.pieces);
  for(const order of state.orders||[]) if(order.store_id===store&&order.status==='queued') {
    const reserved=order.reserved;
    if(reserved) for(const [key,value] of Object.entries(reserved)) add(key,-value.qty,-(value.pieces||0));
    else {try{for(const [key,value] of requirements(state,order.lines))add(key,-value.qty,-value.pieces);}catch{ /* SQL upgrade validates all new orders. */ }}
  }
  return result;
}
export function checkOrder(state,store,lines,date) {
  if(!state.orderStockVersion) return {ok:false,reason:'Pembaruan database 011 diperlukan'};
  try {
    const available=availableStock(state,store,date);
    for(const [key,need] of requirements(state,lines)) {
      const left=available.get(key)||{qty:0,pieces:0};
      if(need.qty>left.qty+1e-8||need.pieces>left.pieces) {
        const id=key.slice(key.indexOf(':')+1);
        const product=state.products.find(p=>p.id===(key.startsWith('lot:')?state.lots.find(l=>l.id===id)?.productId:id));
        return {ok:false,reason:'Stok kurang: '+(product?.name||'bahan')};
      }
    }
    return {ok:true,reason:'Siap dipesan'};
  }catch(err){return {ok:false,reason:err.message};}
}
export function menuStatus(state,store,product,draft,date) {
  if(product.stockUnit!=='kg_butir') return checkOrder(state,store,[...draft,{productId:product.id,qty:1}],date);
  if(!state.orderStockVersion)return {ok:false,reason:'Pembaruan database 011 diperlukan'};
  const available=availableStock(state,store,date);
  let demands;try{demands=requirements(state,draft);}catch{return {ok:false,reason:'Periksa pesanan'};}
  for(const lot of state.lots||[])if(lot.storeId===store&&lot.productId===product.id&&lot.quality==='ready') {
    const left=available.get('lot:'+lot.id),used=demands.get('lot:'+lot.id)||{qty:0,pieces:0};
    if(left&&left.qty>used.qty&&left.pieces>used.pieces)return {ok:true,reason:'Buah siap jual'};
  }
  return {ok:false,reason:'Stok buah siap jual habis'};
}
