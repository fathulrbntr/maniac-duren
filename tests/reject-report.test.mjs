import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stockReport,reportSheets} from '../pos/reports.mjs';
import {reportPrint,workbook} from '../pos/report-export.mjs';
import {rejectReportFixture,period} from './reject-report-fixture.mjs';
const fruit=r=>r.rows.find(x=>x.productId==='fruit'&&x.storeId==='a');
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('500 received / 400 direct reject: one marking, preserved stock and readable stages',()=>{
 const s=rejectReportFixture(),before=structuredClone(s),report=stockReport(s,period),r=fruit(report);
 assert.equal(r.incoming,500);assert.equal(r.rejected,400);close(r.sold,30.24);close(r.closing,69.76);close(r.opening,0);assert.equal(r.other,-400);assert.equal(r.rejectCurrent,0);assert.equal(report.details.length,11);assert.equal(report.rejectUnclassified,0);assert.deepEqual(s,before);
 const changes=report.details.filter(j=>j.event_id==='mark');assert.deepEqual(changes.map(j=>j.label),['Ditandai reject (stok asal)','Masuk stok reject','Reject dipakai untuk olahan','Hasil olahan reject','Hasil olahan reject','Hasil olahan reject']);
 for(const [productId,qty] of [['coral',127],['durpas1',70],['durpas05',60]]){const out=report.rows.find(r=>r.productId===productId);assert.equal(out.rejected,0);assert.equal(out.current,qty);}
});
test('mark-only and mark then process on a different date count the same 400 kg',()=>{
 const s=rejectReportFixture();s.rejectRecords[0].kind='mark';s.events.find(e=>e.id==='mark').payload.processNow=false;
 const process=s.journal.filter(j=>j.event_id==='mark').slice(2);for(const j of process)j.event_id='process';s.events.push({id:'process',action:'reject_process',business_date:'2026-10-24',payload:{sourceLotId:'rejected'}});s.rejectRecords.push({id:'process',kind:'process',sourceLotId:'rejected'});
 assert.equal(fruit(stockReport(s,period)).rejected,400);
 const only=fruit(stockReport(s,{...period,from:'2026-10-23',to:'2026-10-23'}));assert.equal(only.rejected,400);assert.equal(only.other,0);close(only.closing,496.76);
 const processed=fruit(stockReport(s,{...period,from:'2026-10-24',to:'2026-10-24'}));assert.equal(processed.rejected,0);assert.equal(processed.other,-400);close(processed.closing,69.76);
});
test('reject from opening stock is not clamped to receipts in the selected period',()=>{
 const r=fruit(stockReport(rejectReportFixture(),{...period,from:'2026-10-23'}));assert.equal(r.incoming,0);assert.equal(r.rejected,400);close(r.opening,496.76);close(r.closing,69.76);
 assert.equal(stockReport(rejectReportFixture(),{...period,store:'b'}).rows.length,0);
});
test('void reverses marking once at its own date, including the combined direct journal',()=>{
 const s=rejectReportFixture();s.lots[0].kg+=400;s.unitLots.forEach(l=>l.qty=0);s.rejectRecords[0].voided=true;s.rejectRecords[0].voidEventId='undo';s.events.push({id:'undo',action:'reject_void',business_date:'2026-10-25',payload:{recordId:'mark'}});
 for(const j of s.journal.filter(j=>j.event_id==='mark'&&j.lot_id!=='rejected'))s.journal.push({...j,id:j.id+'u',event_id:'undo',qty:-j.qty});
 assert.equal(fruit(stockReport(s,period)).rejected,0);close(fruit(stockReport(s,period)).closing,469.76);
 assert.equal(fruit(stockReport(s,{...period,to:'2026-10-24'})).rejected,400);close(fruit(stockReport(s,{...period,to:'2026-10-24'})).closing,69.76);
 const undo=fruit(stockReport(s,{...period,from:'2026-10-25'}));assert.equal(undo.rejected,-400);close(undo.opening,69.76);
});
test('server records, event payloads and journal quality provide consistent classification',()=>{
 for(const variant of ['record','payload','quality','lot']){
  const s=rejectReportFixture();if(variant!=='record')s.rejectRecords=[];
  if(['quality','lot'].includes(variant))s.events.forEach(e=>delete e.payload);if(variant==='lot')s.journal.forEach(j=>delete j.quality);
  const r=stockReport(s,period);assert.equal(fruit(r).rejected,400,variant);assert.equal(r.rejectUnclassified,0);
 }
 const unknown=rejectReportFixture();unknown.rejectRecords=[];unknown.events.forEach(e=>delete e.payload);unknown.journal.forEach(j=>delete j.quality);unknown.lots.forEach(l=>delete l.quality);
 assert(stockReport(unknown,period).rejectUnclassified>0,'missing evidence is flagged instead of guessing or counting both deductions');
});
test('repeated marks in different events are added, not collapsed by product',()=>{
 const s=rejectReportFixture();s.events.push({id:'mark2',action:'reject_mark',business_date:'2026-10-24',payload:{sourceLotId:'original',rejectLotId:'rejected2'}});s.lots[0].kg-=20;s.lots.push({...s.lots[1],id:'rejected2',kg:20,receivedKg:20});
 s.journal.push({...s.journal[1],id:'j12',event_id:'mark2',qty:-20},{...s.journal[2],id:'j13',event_id:'mark2',lot_id:'rejected2',qty:20});
 const r=fruit(stockReport(s,period));assert.equal(r.rejected,420);assert.equal(r.rejectCurrent,20);close(r.current,69.76);
});
test('Excel/PDF use the same corrected totals and stage labels',async()=>{
 const sheets=reportSheets(rejectReportFixture(),period),stock=sheets.find(s=>s.name==='Stok'),r=stock.rows.find(r=>r[0]==='Durian Monthong');assert.equal(r[6],400);close(r[11],69.76);
 const html=reportPrint(sheets,{},'Uji');assert(html.includes('Reject dipakai untuk olahan'));assert(!html.includes('<td>800</td>'));
 const bytes=Buffer.from(await workbook(sheets).arrayBuffer());assert(bytes.includes(Buffer.from('<v>400</v>')));assert(!bytes.includes(Buffer.from('<v>800</v>')));
});
