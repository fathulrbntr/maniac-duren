import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,today} from '../pos/core.mjs';
import {dashboardPage,resetDashboard} from '../pos/dashboard-ui.mjs';
import {Node} from './variant-dom.mjs';
function state(){
 const s={...emptyState(),me:{id:'owner',name:'Owner',role:'owner'},access:{reports:true,finance:true,stock:true},stores:[{id:'a',name:'Depok'},{id:'b',name:'Bekasi'}],products:[{id:'p',name:'Durpas <aman>',itemType:'finished',stockUnit:'pcs'}]};
 const sale=(id,store_id,total,extra={})=>({id,store_id,total,payment:'QRIS',business_date:today(),paid_date:today(),created_at:today()+'T04:00:00Z',status:'paid',payment_status:'paid',lines:[{productId:'p',qty:1,price:total,unit:'pcs'}],...extra});
 s.orders=[sale('depok-sale','a',200000),sale('depok-free','a',0,{payment:'Tunai'}),sale('bekasi-sale','b',900000),sale('foreign-sale','secret',800000),sale('cancelled-sale','a',700000,{status:'cancelled'}),sale('old-sale','a',600000,{paid_date:'2020-01-01'}),sale('unpaid-sale','a',500000,{payment_status:'unpaid',status:'queued'})];
 return s;
}
test('summary, payment composition and recent table share paid outlet/date scope; free receipts remain counted',()=>{
 resetDashboard();const s=state(),before=structuredClone(s),root=new Node();root.innerHTML=dashboardPage(s,'a');
 assert.match(root.querySelector('.dash-summary-metrics').textContent,/100\.000/,'Average includes the zero-value paid receipt');
 assert.match(root.querySelector('.dash-payment-list').textContent,/QRIS.*200\.000/);
 const recent=root.querySelector('.dash-recent').textContent;
 assert.match(recent,/DEPOK-SALE|POK-SALE/);assert.match(recent,/Durpas <aman>/);
 for(const text of ['ASI-SALE','IGN-SALE','LED-SALE','OLD-SALE','AID-SALE'])assert(!recent.includes(text),text);
 assert.deepEqual(s,before,'Rendering is read-only');
 assert(!dashboardPage(s,'a').includes('<aman>'),'Product labels must be escaped');
});
test('restricted reporting account never receives finance or stock panels or their actions',()=>{
 resetDashboard();const s=state();s.access={reports:true};const root=new Node();root.innerHTML=dashboardPage(s,'a');
 assert(root.querySelector('.dash-recent'));assert(!root.querySelector('.dash-finance-overview'));assert(!root.querySelector('.dash-stock-overview'));
 assert(!root.textContent.includes('Profit / rugi bersih'));assert(!root.textContent.includes('Estimasi nilai aset'));
});
test('empty period provides true zero summaries and empty states without invalid chart or donut values',()=>{
 resetDashboard();const s=state();s.orders=[];const html=dashboardPage(s,'a'),root=new Node();root.innerHTML=html;
 assert(root.querySelector('.dash-chart-empty'));assert.match(root.querySelector('.dash-recent').textContent,/Belum ada transaksi lunas/);
 assert(!/NaN|Infinity/.test(html));assert(!root.querySelector('.dash-recent table'));
});
