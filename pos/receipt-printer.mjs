// Use a separate, local print document so the POS dialog/viewport cannot add
// height to the roll. Measurement and printing use exactly the same CSS.
import {readDeviceSettings,validateDeviceSettings} from './device-settings.mjs?v=58';
let lastFrame = null;
let preparing = false;

export function receiptHeightMm(heightPx) {
  if (!Number.isFinite(heightPx) || heightPx <= 0) {
    throw Error('Isi struk belum siap dicetak. Silakan coba lagi.');
  }
  // CSS pixels are 1/96 inch. Round upward and allow 1 mm for print rounding.
  // Do not cap the length: large orders must keep their final items/totals.
  return Math.ceil((heightPx * 25.4 / 96 + 1) * 10) / 10;
}

const receiptCss = ({paperWidth,fontSize,padding}) => `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { width: ${paperWidth}mm; height: auto; min-height: 0;
    margin: 0; padding: 0; overflow: visible; background: #fff; color: #000; }
  .receipt-print { display: flow-root; width: 100%; height: auto; min-height: 0;
    margin: 0; padding: ${padding}mm ${padding}mm 2mm; white-space: normal; overflow-wrap: anywhere;
    font: ${fontSize}px/1.35 'Courier New', monospace; }
  h3 { margin: 0 0 6px; font-size: ${fontSize+2}px; line-height: 1.35; }
  .receipt-plain { white-space: pre-wrap; }
  .receipt-footer { white-space: pre-line; text-align: center; border-top: 1px dashed #777; padding-top: 6px; }
  p { margin: 6px 0; }
  .receipt-print > :last-child { margin-bottom: 0; }
  table { width: 100%; table-layout: fixed; border-collapse: collapse; font: inherit; }
  th, td { padding: 4px 2px; text-align: left; vertical-align: top; }
  th:first-child { width: 48%; }
  th:nth-child(2) { width: 18%; }
  th:last-child { width: 34%; }
  th:last-child, td:last-child { text-align: right; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
`;

export async function printReceipt(receipt, settings = readDeviceSettings()) {
  const printer = validateDeviceSettings(settings).printer;
  const paperWidthMm = printer.paperWidth;
  if (preparing) throw Error('Struk sedang disiapkan. Tunggu sebentar.');
  if (!receipt?.textContent?.trim()) throw Error('Isi struk kosong. Buka ulang struk transaksi.');
  preparing = true;
  let frame;
  try {
    lastFrame?.remove();
    lastFrame = null;
    frame = document.createElement('iframe');
    frame.title = 'Cetak struk';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    // Keep a layout box: display:none would make the measured height zero.
    frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${paperWidthMm}mm;height:1px;border:0;`;
    document.body.append(frame);
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) throw Error('Dokumen cetak tidak dapat dibuka. Coba cetak ulang.');
    doc.open();
    doc.write('<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Struk Maniac Duren</title></head><body></body></html>');
    doc.close();
    const style = doc.createElement('style');
    style.textContent = receiptCss(printer);
    doc.head.append(style);
    // Clone the rendered, escaped receipt only, without form controls/messages.
    const copy = doc.importNode(receipt, true);
    if (printer.footer) {
      const footer = doc.createElement('p');
      footer.className = 'receipt-footer';
      footer.textContent = printer.footer;
      copy.append(footer);
    }
    doc.body.append(copy);
    await doc.fonts?.ready;
    await new Promise(resolve => requestAnimationFrame(resolve));
    const height = receiptHeightMm(copy.getBoundingClientRect().height);
    const page = doc.createElement('style');
    page.textContent = `@page { size: ${paperWidthMm}mm ${height}mm; margin: 0; }`;
    doc.head.append(page);
    win.print();
    // Some browsers return/emit afterprint before their preview is finished.
    // Keep this single frame until the next print instead of removing it early
    // (which can cause a blank receipt). It is never accumulated or persisted.
    lastFrame = frame;
    return { widthMm: paperWidthMm, heightMm: height };
  } catch (error) {
    frame?.remove();
    throw error;
  } finally {
    preparing = false;
  }
}
