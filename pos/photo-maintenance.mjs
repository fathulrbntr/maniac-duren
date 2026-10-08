import { compressPhoto } from './photo-compression.mjs?v=41';
export const PHOTO_KINDS = ['product', 'profile', 'ktp', 'evidence'];
const slots = ['reject', 'processed', 'durpas500', 'durpas1000', 'coral'];

// Back up each original durably before its compare-and-swap update.
// Failed backup/network stops the run; a malformed image is reported and skipped.
export async function compressStoredPhotos({ rpc, backup, compress = compressPhoto, onProgress = () => {}, shouldStop = () => false }) {
  const report = { checked: 0, updated: 0, skipped: 0, conflicts: 0, errors: [], savedBytes: 0, stopped: false };
  for (const kind of PHOTO_KINDS) {
    let after = '';
    while (true) {
      if (shouldStop()) return { ...report, stopped: true };
      const rows = await rpc('list', { kind, after });
      if (!Array.isArray(rows)) throw Error('Daftar foto tidak valid');
      if (!rows.length) break;
      for (const row of rows) {
        for (const slot of kind === 'evidence' ? slots : ['']) {
          if (shouldStop()) return { ...report, stopped: true };
          const item = { kind, id: row.id, slot };
          const original = await rpc('get', item);
          if (!original.photo) continue;
          report.checked++;
          let compressed;
          try { compressed = await compress(original.photo, kind); }
          catch (error) {
            report.errors.push({ ...item, message: error.message });
            onProgress({ ...report }, item);
            continue;
          }
          if (!compressed.changed || compressed.photo.length >= original.photo.length) report.skipped++;
          else {
            await backup({ format: 'maniac-pos-photo-backup-v1', ...item, digest: original.digest, photo: original.photo });
            if (shouldStop()) return { ...report, stopped: true };
            const result = await rpc('replace', { ...item, expected: original.digest, photo: compressed.photo });
            if (result.status === 'updated') { report.updated++; report.savedBytes += result.savedBytes; }
            else if (result.status === 'conflict') report.conflicts++;
            else if (result.status === 'unchanged') report.skipped++;
            else throw Error('Status penyimpanan foto tidak dikenal. Periksa hasil sebelum mengulang.');
          }
          onProgress({ ...report }, item);
        }
      }
      const next = rows.at(-1).id;
      if (!next || next <= after) throw Error('Urutan daftar foto tidak valid');
      after = next;
    }
  }
  return report;
}
