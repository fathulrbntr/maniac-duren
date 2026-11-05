import {escape as e,num} from './core.mjs';
import {reportStamp,cashReport} from './dashboard-report.mjs';

const rupiah=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'Belum lengkap':'Rp '+new Intl.NumberFormat('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
const units=row=>[...row.units].map(([u,q])=>num(q)+' '+u).join(' · ')||'—';
const text=v=>e(v??'—');
const cell=(v,numeric=false)=>`<td${numeric?' class="dr-number"':''}>${text(v)}</td>`;
function table(headers,rows,numbers=[],total=null){
 return `<table class="dr-table"><thead><tr>${headers.map((h,i)=>`<th${numbers.includes(i)?' class="dr-number"':''}>${text(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map((v,i)=>cell(v,numbers.includes(i))).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}" class="dr-empty">Tidak ada data pada periode ini.</td></tr>`}${total?`<tr class="dr-total">${total.map((v,i)=>cell(v,numbers.includes(i))).join('')}</tr>`:''}</tbody></table>`;
}
const section=(title,body,note='')=>`<section class="dr-section"><h3>${text(title)}</h3>${body}${note?`<p class="dr-note">${text(note)}</p>`:''}</section>`;
const financialRow=(label,value,bold=false)=>`<tr${bold?' class="dr-total"':''}><td>${text(label)}</td><td class="dr-number">${text(rupiah(value))}</td></tr>`;
export const dashboardPrintStyles=`
@page{size:A4 portrait;margin:12mm}
.dr-report{font:10px Arial,Helvetica,sans-serif;color:#222;line-height:1.4}
.dr-page{break-before:page}.dr-page:first-child{break-before:auto}
.dr-header{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;border-bottom:1.5px solid #333;padding:0 0 10px;margin-bottom:14px}
.dr-header h1{font-size:16px;letter-spacing:.2px;margin:0 0 3px}.dr-header p{margin:0;font-size:10px}.dr-header>div:last-child{text-align:right;max-width:46%}
.dr-page-title{font-size:12px!important;margin:0 0 10px!important;text-transform:uppercase;letter-spacing:.5px}
.dr-section{margin:0 0 12px}.dr-section h3{font-size:11px;margin:0 0 6px;break-after:avoid}
.dr-table{width:100%;border-collapse:collapse;table-layout:auto;margin:0;font-size:10px}
.dr-table th,.dr-table td{padding:4px 7px;border:1px solid #dedede;vertical-align:top;overflow-wrap:anywhere;text-align:left}
.dr-table th{font-weight:normal;background:#f6f6f6;color:#333}.dr-table .dr-number{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.dr-table thead{display:table-header-group}.dr-table tr{break-inside:avoid}.dr-table .dr-total{font-weight:bold;background:#fafafa}
.dr-finance td:first-child{width:72%}.dr-finance .dr-total td{padding-top:8px;padding-bottom:8px}.dr-note{font-size:9px;color:#666;margin:6px 0 0;line-height:1.45;white-space:normal}
.dr-empty{color:#777}.dr-footer{margin:14px 0 0;padding:6px 0 0;border-top:1px solid #ddd;color:#666;font-size:9px;break-inside:avoid}
.dr-demo{font-weight:bold;border:1px solid #555;padding:5px;margin-bottom:10px;text-align:center}
.dr-warning{border-left:3px solid #777;background:#f7f7f7;padding:7px 10px;margin:8px 0;font-size:9px;break-inside:avoid}
@media screen{.dr-report{max-width:186mm;margin:0 auto}.dr-page{background:#fff;padding:12mm;margin:20px -12mm;box-shadow:0 2px 18px #0001;min-height:250mm}}
@media print{body{color:#222;background:white}.dr-page{margin:0;padding:0}.dr-report{width:auto}.dr-table th,.dr-table .dr-total{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

export function dashboardPrintHTML(s,r){
 const h=r.f.store?s.stores.find(x=>x.id===r.f.store):{name:'MANIAC DUREN'};
 const header=(title)=>`<div class="dr-header"><div><h1>${text(h?.name||'MANIAC DUREN')}</h1><p>Laporan Keseluruhan Penjualan</p>${!r.f.store?`<p>${text(r.storeName)}</p>`:''}${h?.address||h?.location?`<p>${text(h.address||h.location)}</p>`:''}</div><div><p>Tanggal jual: ${text(r.f.from)} — ${text(r.f.to)}</p><p>Dicetak: ${text(reportStamp(r.asOf))}</p></div></div>${r.demo?'<div class="dr-demo">DEMO · BUKAN TRANSAKSI NYATA</div>':''}<h2 class="dr-page-title">${text(title)}</h2>`;
 const footer=note=>`<div class="dr-footer">${text(note)}</div>`;
 const ranking=(rows,label)=>table([label,'Total penjualan','Jumlah'],rows.map(x=>[x.name,rupiah(x.revenue),units(x)]),[1,2]);
 const cash=cashReport(r.cash,s,r.f);
 const cashRows=cash?[
  ['Penjualan tunai masuk',rupiah(cash.sales)],['Pengembalian / refund tunai',rupiah(cash.refunds)],['Arus tunai transaksi bersih',rupiah(cash.net)],['Kas selisih (shift ditutup)',rupiah(cash.difference)],['Jumlah shift ditutup',num(cash.closed)],
 ]:[['Penjualan lunas aktif · Tunai',rupiah(r.payments.find(x=>x.name==='Tunai')?.revenue||0)],['Pengembalian / refund tunai','Riwayat kas belum dimuat'],['Kas selisih (shift)','Riwayat kas belum dimuat']];
 const pages=[];
 pages.push(header('Penjualan & pembayaran')+
  section('Ringkasan Penjualan',table(['Sumber penjualan','Total penjualan','Qty pesanan'],r.channels.map(x=>[x.name,rupiah(x.revenue),num(x.count)]),[1,2],['Total',rupiah(r.total),num(r.tx.length)]),'Sumber: nomor meja = Dine In; tanpa meja = Take Away; GoFood / GrabFood / ShopeeFood = Delivery. Transaksi lama tanpa penanda ditampilkan terpisah.')+
  section('Penjualan berdasarkan Kategori',ranking(r.categories,'Grup produk'),r.unallocated?`${r.unallocated} transaksi tidak memiliki rincian produk; total kategori belum dapat direkonsiliasi.`:'Jumlah dengan satuan berbeda ditampilkan terpisah. Kategori mengikuti master produk saat cetak.')+
  section('Ringkasan Metode Pembayaran',table(['Cara pembayaran','Akun bank transaksi','Total penjualan'],r.payments.map(x=>[x.name,'—',rupiah(x.revenue)]),[2],['Total','',rupiah(r.total)]),'Label pembayaran mengikuti transaksi. Snapshot akun bank belum tersimpan pada transaksi.')+
  section('Transaksi Tunai',table(['Keterangan','Nominal / jumlah'],cashRows,[1]),cash?'Mengikuti tanggal aktivitas kas (WIB). Refund dapat berasal dari penjualan periode sebelumnya; selisih kas bersifat informasi dan tidak otomatis menjadi beban.':'Penjualan aktif berbeda dari arus kas masuk/keluar berdasarkan tanggal pembayaran dan refund.')+
  (r.cashError?`<p class="dr-warning">${text(r.cashError)}</p>`:'')+
  footer('Penjualan dihitung setelah diskon. Transaksi yang telah dibatalkan dikeluarkan dari periode penjualan asal. Void dan refund tidak dikurangkan dua kali.'));
 pages.push(header('Diskon, loyalitas & produk')+
  section('Ringkasan Diskon',table(['Sumber penjualan','Nama diskon','Jumlah diskon','Qty pesanan'],r.discounts.map(x=>[x.channel,x.name,rupiah(x.revenue),num(x.count)]),[2,3],['Total','',rupiah(r.discounts.reduce((n,x)=>n+x.revenue,0)),num(r.discounts.reduce((n,x)=>n+x.count,0))]))+
  section('Ringkasan Loyalty Point',table(['Program','Poin diperoleh','Poin terpakai','Diskon ditebus'],[['Poin member',r.pointsUnknown?`${num(r.points)} tercatat; ${r.pointsUnknown} transaksi belum lengkap`:num(r.points),'Belum tersedia','Belum tersedia']],[1,2,3]),'Poin diperoleh dari transaksi lunas aktif. Penukaran poin / item gratis belum dicatat oleh sistem ini.')+
  section('Pesanan Dibatalkan',table(['Tanggal void','Sumber penjualan','Nilai pesanan','Status'],r.cancellations.map(x=>[x.date,x.channel,rupiah(x.amount),x.refunded?'Refund':'Batal sebelum lunas']),[2]),r.cancelUnknown?`${r.cancelUnknown} pembatalan tidak memiliki tanggal void dan belum masuk tabel. Nilai pesanan batal bukan otomatis kerugian stok.`:'Mengikuti tanggal pembatalan. Nilai pesanan batal bukan otomatis kerugian stok.')+
  section('Top Grup Produk',ranking(r.categories.slice(0,5),'Grup produk'))+
  section('Top Produk',ranking(r.products.slice(0,5),'Produk'))+
  footer('Peringkat berdasarkan penjualan setelah diskon. Kuantitas kg, butir, pcs, porsi, g, dan ml tidak dijumlahkan sebagai satu satuan.'));
 if(r.financial){
  const m=r.financial,expenseRows=m.expenses.map(x=>financialRow('— '+(x.description||x.category||'Pengeluaran'),x.amount!==null&&x.amount!==undefined&&x.amount!==''&&Number.isFinite(Number(x.amount))?Number(x.amount):null)).join('');
  const pnl=`<table class="dr-table dr-finance"><thead><tr><th>Uraian</th><th class="dr-number">Nominal (IDR)</th></tr></thead><tbody>`+
   financialRow('A. Pendapatan bersih setelah diskon',r.total,true)+r.channels.map(x=>financialRow('— SALES · '+x.name,x.revenue)).join('')+
   financialRow('B. Harga Pokok Penjualan (HPP)',m.cogs,true)+
   financialRow('C. Laba Kotor (A − B)',m.gross,true)+
   financialRow('D. Pengeluaran Operasional',m.operating,true)+expenseRows+
   financialRow('E. Kerugian stok / waste bersih',m.loss,true)+
   financialRow('F. Profit / Rugi Bersih Tercatat (C − D − E)',m.result,true)+
   financialRow('— Profit bersih',m.result===null?null:Math.max(0,m.result))+
   financialRow('— Rugi bersih',m.result===null?null:Math.max(0,-m.result))+'</tbody></table>';
  pages.push(header('Laba / Rugi & estimasi aset')+
   section('Laba / Rugi',pnl,'Hasil berdasarkan biaya yang tercatat. Pembelian stok dan ongkir modal tidak dikurangkan lagi setelah masuk HPP. Pajak, biaya kirim pelanggan, deposit, dan penyusutan aset tetap belum dirinci dalam data transaksi.')+
   (m.unknownCogs||m.unknownLoss||m.operating===null?`<p class="dr-warning">${text(`${m.unknownCogs} rincian transaksi belum memiliki HPP lengkap; ${m.unknownLoss} catatan waste belum lengkap. ${m.operating===null?'Ada pengeluaran tanpa nominal. ':''}Profit belum dapat dipastikan. HPP yang sudah tercatat: ${rupiah(m.knownCogs)}.`)}</p>`:'')+
   section('Kerugian / Koreksi Waste',table(['Keterangan','Modal hilang / koreksi'],m.losses.map(x=>[x.note||'Waste tercatat',rupiah(x.cost==null?null:Number(x.cost))]),[1]),'Hanya waste yang tercatat sebagai kehilangan modal. Angka negatif adalah koreksi waste. Reject yang masih tersedia tetap persediaan; kulit / susut proses yang diserap modal hasil tidak dibebankan lagi.')+
   section('Total Estimasi Nilai Aset yang Tersedia',table(['Kelompok persediaan','Lot tersedia','Nilai berdasarkan modal'],m.assets.groups.map(x=>[x.name,num(x.lots),x.unknown?`${rupiah(x.value)} + ${x.unknown} lot belum lengkap`:rupiah(x.value)]),[1,2],['Total estimasi nilai aset persediaan',num(m.assets.rows.length),rupiah(m.assets.total)]),`Posisi stok saat laporan dibuat: ${reportStamp(r.asOf)}. Nilai = sisa fisik × modal per satuan lot, termasuk bahan dan reject menunggu pengolahan. Buah dihitung per kg; butir tidak dinilai lagi. Bukan nilai jual, kas, piutang, atau aset tetap.`)+
   (m.assets.unknown?`<p class="dr-warning">${text(`${m.assets.unknown} lot memiliki modal / jumlah / satuan yang belum lengkap. Nilai aset yang telah terhitung: ${rupiah(m.assets.known)}. Total aset belum lengkap.`)}</p>`:'')+
   footer('Periode laba/rugi mengikuti filter tanggal. Nilai aset memakai stok saat ini, bukan posisi historis akhir periode.'));
 }
 return `<style>${dashboardPrintStyles}</style><article class="dr-report">${pages.map(p=>`<div class="dr-page">${p}</div>`).join('')}</article>`;
}
