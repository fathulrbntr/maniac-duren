// Shared by settings, checkout and demo. Labels are immutable transaction values.
export const paymentGroups=[
 {id:'cash',name:'Tunai',hint:'Uang fisik yang masuk ke laci kasir.'},
 {id:'qris',name:'QRIS',hint:'Catat pembayaran dari QRIS toko.'},
 {id:'bank',name:'Transfer Bank',hint:'Pilih rekening bank yang menerima pembayaran.'},
 {id:'card',name:'Kartu Debit / Kredit',hint:'Pembayaran melalui mesin EDC toko.'},
 {id:'ewallet',name:'E-Wallet',hint:'Pembayaran langsung melalui dompet digital.'},
 {id:'ecommerce',name:'E-Commerce',hint:'Pesanan yang sudah dibayar melalui marketplace.'},
 {id:'delivery',name:'Pesan Antar',hint:'Pesanan yang sudah dibayar melalui aplikasi pesan antar.'},
];
const rows=[
 ['cash','cash','Tunai'],['qris','qris','QRIS'],
 ['transfer','bank','Transfer'],['bca','bank','Transfer BCA'],['bri','bank','Transfer BRI'],['bni','bank','Transfer BNI'],['mandiri','bank','Transfer Mandiri'],['cimb','bank','Transfer CIMB Niaga'],['permata','bank','Transfer Permata'],['bsi','bank','Transfer BSI'],
 ['debit','card','Kartu Debit'],['credit','card','Kartu Kredit'],
 ['gopay','ewallet','GoPay'],['ovo','ewallet','OVO'],['dana','ewallet','DANA'],['shopeepay','ewallet','ShopeePay'],['linkaja','ewallet','LinkAja'],
 ['shopee','ecommerce','Shopee'],['tokopedia','ecommerce','Tokopedia'],['tiktok','ecommerce','TikTok Shop'],['lazada','ecommerce','Lazada'],['marketplace_other','ecommerce','E-Commerce Lainnya'],
 ['gofood','delivery','GoFood'],['grabfood','delivery','GrabFood'],['shopeefood','delivery','ShopeeFood'],
];
export const paymentMethods=rows.map(([id,group,label])=>({id,group,label}));
export const isPaymentLabel=label=>paymentMethods.some(m=>m.label===label);
export function defaultPaymentSettings(){
 return {groups:Object.fromEntries(paymentGroups.map(g=>[g.id,['cash','qris','bank'].includes(g.id)])),methods:Object.fromEntries(paymentMethods.map(m=>[m.id,{enabled:m.group!=='bank'||m.id==='transfer',bank:'',accountName:'',accountNumber:'',note:''}]))};
}
export function normalizePaymentSettings(input){
 if(!input||typeof input!=='object'||!input.groups||!input.methods)throw Error('Pengaturan pembayaran tidak valid');
 if(Object.keys(input).some(k=>!['groups','methods'].includes(k))||Object.keys(input.groups).some(k=>!paymentGroups.some(g=>g.id===k))||Object.keys(input.methods).some(k=>!paymentMethods.some(m=>m.id===k)))throw Error('Metode pembayaran tidak dikenal');
 const result={groups:{},methods:{}};
 for(const g of paymentGroups){if(typeof input.groups[g.id]!=='boolean')throw Error('Status kategori tidak valid');result.groups[g.id]=input.groups[g.id];}
 for(const m of paymentMethods){
  const v=input.methods[m.id];if(!v||typeof v.enabled!=='boolean')throw Error('Status metode tidak valid');
  if(Object.keys(v).some(k=>!['enabled','bank','accountName','accountNumber','note'].includes(k)))throw Error('Detail metode tidak valid');
  const clean={enabled:v.enabled};
  for(const [key,max] of [['bank',60],['accountName',100],['accountNumber',50],['note',200]]){
   if(typeof v[key]!=='string'||v[key].length>max||/[\u0000-\u001f\u007f]/.test(v[key]))throw Error('Detail rekening / catatan tidak valid');
   clean[key]=v[key].trim();
  }
  result.methods[m.id]=clean;
 }
 if(!paymentMethods.some(m=>result.groups[m.group]&&result.methods[m.id].enabled))throw Error('Aktifkan minimal satu metode pembayaran');
 return result;
}
export const paymentSettingsFor=(s,storeId)=>s.paymentSettings?.find(x=>x.storeId===storeId)||{storeId,revision:0,config:defaultPaymentSettings()};
export function availablePayments(s,storeId){
 const config=paymentSettingsFor(s,storeId).config;
 // Old databases continue to offer only their established methods until SQL 084 is installed.
 return paymentMethods.filter(m=>(s.paymentMethodsVersion>=84||['cash','qris','transfer'].includes(m.id))&&config.groups[m.group]&&config.methods[m.id]?.enabled).map(m=>({...m,...config.methods[m.id]}));
}
export function requireEnabledPayment(s,storeId,label){
 const m=availablePayments(s,storeId).find(m=>m.label===label);if(!m)throw Error('Metode pembayaran tidak aktif di outlet ini. Pilih kembali metode pembayaran.');return m;
}
export function savePaymentSettingsDemo(s,p){
 if(s.me?.role!=='owner')throw Error('Hanya owner yang dapat mengatur metode pembayaran');
 if(!s.stores.some(x=>x.id===p.storeId))throw Error('Outlet tidak tersedia');
 const old=paymentSettingsFor(s,p.storeId);if(old.revision!==p.expectedRevision)throw Error('Pengaturan berubah. Muat ulang sebelum menyimpan.');
 const config=normalizePaymentSettings(p.config);s.paymentSettings||=[];
 s.paymentSettings=s.paymentSettings.filter(x=>x.storeId!==p.storeId);
 s.paymentSettings.push({storeId:p.storeId,revision:old.revision+1,config,eventId:p.id});
}
