import assert from 'node:assert/strict';
import { compressStoredPhotos } from '../pos/photo-maintenance.mjs';
const calls = [], backups = [];
const original = 'data:image/png;base64,' + 'A'.repeat(1000);
let current = original;
const rpc = async (action, payload) => {
  calls.push({ action, payload });
  if (action === 'list') return payload.kind === 'product' && !payload.after ? [{ id: 'a' }] : [];
  if (action === 'get') return { photo: current, digest: 'original' };
  assert.equal(action, 'replace');assert.equal(backups.length, 1, 'backup must finish before replacing');
  current = payload.photo;return { status: 'updated', savedBytes: 500 };
};
const compress = async () => ({ photo: 'data:image/webp;base64,AAAA', changed: true });
let result = await compressStoredPhotos({ rpc, backup: async x => backups.push(x), compress });
assert.equal(result.updated, 1);assert.equal(result.savedBytes, 500);
assert.equal(backups[0].photo, original);assert.equal(backups[0].format, 'maniac-pos-photo-backup-v1');
const make = (replace = async () => ({ status: 'updated', savedBytes: 1 })) => async (action, p) => {
  if (action === 'list') return p.kind === 'product' && !p.after ? [{ id: 'a' }] : [];
  if (action === 'get') return { photo: original, digest: 'original' };
  return replace();
};
let writes = 0;
await assert.rejects(compressStoredPhotos({ rpc: make(async () => { writes++; }), backup: async () => { throw Error('Disk full'); }, compress }), /Disk full/);
assert.equal(writes, 0);
result = await compressStoredPhotos({ rpc: make(), backup: async () => { throw Error('should not back up'); }, compress: async () => ({ changed: false, photo: original }) });
assert.equal(result.skipped, 1);
result = await compressStoredPhotos({ rpc: make(), backup: async () => {}, compress: async () => { throw Error('Bad image'); } });
assert.equal(result.errors.length, 1);assert.equal(result.updated, 0);
result = await compressStoredPhotos({ rpc: make(async () => ({ status: 'conflict' })), backup: async () => {}, compress });
assert.equal(result.conflicts, 1);assert.equal(result.updated, 0);
let stop = false;
result = await compressStoredPhotos({ rpc: make(async () => { writes++; }), backup: async () => { stop = true; }, compress, shouldStop: () => stop });
assert.equal(result.stopped, true);assert.equal(writes, 0);
// Evidence sources are traversed even when only the last slot has a photo.
const visited = [];
result = await compressStoredPhotos({ rpc: async (action, p) => {
  if (action === 'list') return p.kind === 'evidence' && !p.after ? [{ id: 'a' }] : [];
  if (action === 'get') { visited.push(p.slot);return { photo: '', digest: '' }; }
  throw Error('No update expected');
}, backup: async () => {} });
assert.deepEqual(visited, ['reject', 'processed', 'durpas500', 'durpas1000', 'coral']);
console.log('PASS: backups before writes, backup failure stops writes, small/corrupt photos, conflict handling, cancellation, evidence slots.');
