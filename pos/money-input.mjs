// Display Indonesian grouping while preserving the numeric .value contract used by POS.
const moneyName = /^(?:price|priceKg|pricePiece|salePrice|buyPrice|minPrice|maxPrice|purchaseCost|shippingCost|totalCost|paid|salary|wage)$/i;
export function formatMoneyInput(value) {
  const raw = String(value ?? '');
  if (!raw) return '';
  const [integer, fraction] = raw.split('.');
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (fraction !== undefined ? ',' + fraction : '');
}
export function parseMoneyInput(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (!/^-?[\d.]+(?:,\d*)?$/.test(text)) throw Error('Isi harga dengan angka Rupiah');
  return text.replaceAll('.', '').replace(',', '.');
}
export function installMoneyInputs(root = document) {
  const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const bind = input => {
    if (input.dataset.moneyInput) { input.value = input.value; return; }
    if (!moneyName.test(input.name) || !['number','text'].includes(input.type)) return;
    const initial = native.get.call(input);
    input.dataset.moneyInput = 'true'; input.type = 'text'; input.inputMode = 'decimal';
    let raw = initial;
    const validate = () => {
      const n = Number(raw);
      let error = '';
      if (raw && (!/^-?\d+(?:\.\d*)?$/.test(raw) || !Number.isFinite(n))) error = 'Isi harga dengan angka Rupiah';
      else if (raw && input.min && n < Number(input.min)) error = 'Nominal minimal ' + formatMoneyInput(input.min);
      else if (raw && input.max && n > Number(input.max)) error = 'Nominal maksimal ' + formatMoneyInput(input.max);
      else if (raw && input.step && input.step !== 'any') {
        const step = Number(input.step), base = Number(input.min || 0);
        if (Math.abs((n - base) / step - Math.round((n - base) / step)) > 1e-7) error = 'Nominal tidak sesuai kelipatan ' + formatMoneyInput(input.step);
      }
      input.setCustomValidity(error);
    };
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => raw,
      set: value => { raw = String(value ?? ''); native.set.call(input, formatMoneyInput(raw)); validate(); },
    });
    Object.defineProperty(input, 'valueAsNumber', { configurable: true, get: () => raw ? Number(raw) : NaN, set: value => { input.value = value; } });
    input.value = initial;
    input.addEventListener('input', () => {
      const displayed = native.get.call(input), caret = input.selectionStart ?? displayed.length;
      const digitsBefore = displayed.slice(0, caret).replace(/[^\d,]/g, '').length;
      try { raw = parseMoneyInput(displayed); }
      catch { raw = displayed; validate(); return; }
      const formatted = formatMoneyInput(raw); native.set.call(input, formatted);
      let count = 0, next = 0;
      for (; next < formatted.length && count < digitsBefore; next++) if (/[\d,]/.test(formatted[next])) count++;
      input.setSelectionRange(next, next); validate();
    }, true);
    input.form?.addEventListener('formdata', event => {
      if (input.form === event.currentTarget && !input.disabled && input.name) event.formData.set(input.name, raw);
    });
    input.form?.addEventListener('reset', () => { queueMicrotask(() => { if (input.isConnected) input.value = input.defaultValue; }); });
    input.form?.addEventListener('submit', event => { if (input.form !== event.currentTarget || input.disabled) return; validate(); if (!input.checkValidity()) { event.preventDefault(); event.stopImmediatePropagation(); input.reportValidity(); } }, true);
  };
  const scan = node => { if (node.matches?.('input')) bind(node); node.querySelectorAll?.('input').forEach(bind); };
  scan(root);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') scan(record.target);
      else record.addedNodes.forEach(scan);
    }
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['name', 'min', 'max', 'step'] });
  return observer;
}
