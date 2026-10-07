import {existsSync,readFileSync,lstatSync,mkdirSync,renameSync,rmdirSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if (!readFileSync(join(root,'pos/app.js'),'utf8').includes('/rest/v1/rpc/pos_mutate_027')) {
 throw Error('Timpa seluruh isi ZIP rollback 027 terlebih dahulu.');
}
const paths=[
  "PATCH-028.md",
  "database/audit-data.sql",
  "database/clear-operations.sql",
  "database/migrations/020-multi-product-receipt.sql",
  "database/migrations/021-batch-tracking.sql",
  "database/migrations/021-offline-pos.sql",
  "database/migrations/022-offline-batch-compat.sql",
  "database/migrations/023-login-fast.sql",
  "database/migrations/024-login-bootstrap.sql",
  "database/sections/operations/batch-tracking.sql",
  "database/sections/operations/login-bootstrap.sql",
  "database/sections/operations/login-fast.sql",
  "database/sections/operations/multi-product-receipt.sql",
  "database/sections/operations/offline-pos.sql",
  "database/sections/operations/receipt-cost-breakdown.sql",
  "database/sections/operations/service-read.sql",
  "database/upgrade.sql",
  "pos/amounts.mjs",
  "pos/batch-tracking.mjs",
  "pos/batch-ui.mjs",
  "pos/icons/icon-192.png",
  "pos/icons/icon-512.png",
  "pos/manifest.webmanifest",
  "pos/modern.css",
  "pos/offline.mjs",
  "pos/page-cache.mjs",
  "pos/pwa.mjs",
  "scripts/build-pwa.mjs",
  "scripts/clean-legacy-docs.mjs",
  "scripts/clean-project.mjs",
  "shared/photo.mjs",
  "tests/batch-tracking.test.mjs",
  "tests/instant-navigation.test.mjs",
  "tests/login-startup.test.mjs",
  "tests/multi-product-receipt.test.mjs",
  "tests/offline-browser.mjs",
  "tests/offline-database.test.mjs",
  "tests/offline.test.mjs",
  "tests/page-cache.test.mjs",
  "tests/service-reset.test.mjs"
];
const existing=paths.filter(name=>existsSync(join(root,name)));
for(const name of existing) if(!lstatSync(join(root,name)).isFile()) throw Error('Bukan file biasa: '+name);
if(process.argv.includes('--check')) {
 console.log(existing.length+' file sisa patch setelah 027 akan dipindahkan ke backup/rollback-027/.');
 console.log(existing.join('\n'));
} else {
 const run=new Date().toISOString().replace(/[:.]/g,'-');
 const backup=join(root,'backup','rollback-027',run);
 for(const name of existing) {
  const destination=join(backup,name);
  mkdirSync(dirname(destination),{recursive:true});
  renameSync(join(root,name),destination);
 }
 for(const name of ['pos/icons','shared']) {
  try {rmdirSync(join(root,name));}catch(error){if(!['ENOENT','ENOTEMPTY'].includes(error.code))throw error;}
 }
 console.log(existing.length+' file sisa patch dipindahkan ke backup/rollback-027/.');
 console.log('Selesai. Folder .git, konfigurasi .env, data browser dan database tidak diubah.');
}
