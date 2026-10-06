import assert from 'node:assert/strict';
import {formatMoneyInput,parseMoneyInput} from '../pos/money-input.mjs';
for(const [raw,display] of [['',''],['1000','1.000'],['1000000','1.000.000'],['1250000.50','1.250.000,50'],['0','0'],['85000.5','85.000,5']]) {
 assert.equal(formatMoneyInput(raw),display);
 assert.equal(parseMoneyInput(display),raw);
}
assert.throws(()=>parseMoneyInput('Rp satu juta'));
console.log('PASS monetary grouping and raw numeric round trip');
