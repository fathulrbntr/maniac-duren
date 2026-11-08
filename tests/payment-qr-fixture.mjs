// Synthetic EMV only: no real merchant, no acquirer account, cannot settle a payment.
import {crc16} from '../pos/payment-qr.mjs';
export const tlv = (tag, value) => tag + String(value.length).padStart(2, '0') + value;
export function testPaymentQR({amount='150000.00', initiation='12', currency='360', country='ID', merchant='TEST - NO PAYMENT', reference='TEST-001', extra=''}={}) {
  const value = tlv('00','01')+tlv('01',initiation)+tlv('26',tlv('00','TEST.INVALID')+tlv('01','NO-MERCHANT'))+tlv('52','5499')+tlv('53',currency)+tlv('54',amount)+tlv('58',country)+tlv('59',merchant)+tlv('60','TEST CITY')+tlv('62',tlv('05',reference))+extra+'6304';
  return value+crc16(value);
}
