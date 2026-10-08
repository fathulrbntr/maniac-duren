export const deviceSettingsKey = 'maniac-pos-devices-v1';
export const defaultDeviceSettings = () => ({
  printer: { paperWidth: 80, fontSize: 11, padding: 3, autoPrint: true, footer: '' },
  scanner: { enabled: true, terminator: 'Enter', prefix: '', suffix: '' },
});
export const canConfigureDevices = s => !s.access || s.me?.role === 'owner' || !!(s.access.sell || s.access.master);

export function validateDeviceSettings(value) {
  const defaults = defaultDeviceSettings();
  const printer = { ...defaults.printer, ...value?.printer };
  const scanner = { ...defaults.scanner, ...value?.scanner };
  printer.paperWidth = Number(printer.paperWidth);
  printer.fontSize = Number(printer.fontSize);
  printer.padding = Number(printer.padding);
  if (![58, 80].includes(printer.paperWidth)) throw Error('Pilih kertas 58 atau 80 mm.');
  if (![10, 11, 12, 13, 14].includes(printer.fontSize)) throw Error('Ukuran teks harus 10–14 px.');
  if (![2, 3, 4].includes(printer.padding)) throw Error('Margin isi harus 2–4 mm.');
  if (typeof printer.autoPrint !== 'boolean' || typeof scanner.enabled !== 'boolean') throw Error('Pilihan perangkat tidak valid.');
  printer.footer = String(printer.footer ?? '').trim();
  if (printer.footer.length > 200) throw Error('Pesan bawah struk maksimal 200 karakter.');
  if (!['Enter', 'Tab'].includes(scanner.terminator)) throw Error('Pilih tombol akhir Enter atau Tab.');
  for (const key of ['prefix', 'suffix']) {
    scanner[key] = String(scanner[key] ?? '');
    if (scanner[key].length > 16 || /[\x00-\x1f\x7f]/.test(scanner[key])) throw Error('Awalan/akhiran maksimal 16 karakter biasa.');
  }
  // Store a known shape only; no account, stock or transaction data.
  return { printer: { paperWidth: printer.paperWidth, fontSize: printer.fontSize, padding: printer.padding, autoPrint: printer.autoPrint, footer: printer.footer },
    scanner: { enabled: scanner.enabled, terminator: scanner.terminator, prefix: scanner.prefix, suffix: scanner.suffix } };
}
export function readDeviceSettings() {
  try { return validateDeviceSettings(JSON.parse(globalThis.localStorage?.getItem(deviceSettingsKey) || 'null')); }
  catch { return defaultDeviceSettings(); }
}
export function saveDeviceSettings(value) {
  const settings = validateDeviceSettings(value);
  try {
    if (!globalThis.localStorage) throw Error();
    localStorage.setItem(deviceSettingsKey, JSON.stringify(settings));
  } catch { throw Error('Pengaturan belum tersimpan. Izinkan penyimpanan pada browser ini lalu coba lagi.'); }
  return settings;
}
