import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const root = new URL('../',import.meta.url);
const html = readFileSync(new URL('pos/index.html',root),'utf8');
const manifest = JSON.parse(readFileSync(new URL('pos/manifest.webmanifest',root),'utf8'));
assert.match(html, /rel="manifest" href="manifest.webmanifest"/);
assert.equal(manifest.id,'/pos/');
assert.equal(manifest.start_url,'/pos/');
assert.equal(manifest.scope,'/pos/');
assert.equal(manifest.display,'standalone');
assert.equal(manifest.prefer_related_applications,false);
for (const size of [192,512]) {
  const icon = manifest.icons.find(icon=>icon.sizes===`${size}x${size}`);
  assert(icon);
  const bytes = readFileSync(new URL('pos/'+icon.src,root));
  assert.equal(bytes.subarray(1,4).toString(),'PNG');
  assert.equal(bytes.readUInt32BE(16),size);
  assert.equal(bytes.readUInt32BE(20),size);
}
assert(existsSync(new URL('pos/pwa.css',root)));
console.log('PASS manifest links, POS scope, standalone display and actual icon dimensions');

const originals = {window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch};
const control = () => {
  const button = {hidden:false,disabled:false};
  const status = {textContent:'',hidden:true};
  return {hidden:true,button,status,querySelector:s=>s==='[data-pos-install]'?button:status};
};
let controls = [control()];
const win = {}, doc = {}, media = {matches:false,addEventListener:(name,fn)=>media.change=fn};
globalThis.window = {matchMedia:()=>media,addEventListener:(type,fn)=>(win[type]??=[]).push(fn)};
globalThis.document = {querySelectorAll:()=>controls,addEventListener:(type,fn)=>(doc[type]??=[]).push(fn)};
globalThis.fetch = () => {throw Error('Installation must not fetch application data.');};
const emit = (type,event={}) => Promise.all((win[type]||[]).map(fn=>fn(event)));
const click = () => doc.click[0]({target:{closest:s=>s==='[data-pos-install]'?{}:null}});
const freshOffer = () => {
  let resolveChoice;
  const event = {calls:0,prevented:false,preventDefault(){this.prevented=true;},prompt(){this.calls++;return Promise.resolve();},userChoice:new Promise(resolve=>resolveChoice=resolve)};
  return {event,choose:outcome=>resolveChoice({outcome})};
};
try {
  const {startPWA,bindInstall,installButton} = await import('../pos/pwa.mjs?unit');
  assert.match(installButton(),/type="button"/);
  assert(startPWA());assert.equal(startPWA(),false);
  assert.equal(win.beforeinstallprompt.length,1);
  assert(controls[0].hidden);
  const first = freshOffer();await emit('beforeinstallprompt',first.event);
  assert(first.event.prevented);assert(!controls[0].hidden);
  const activeClick = click();
  assert.equal(first.event.calls,1,'prompt invoked synchronously during click');
  assert(controls[0].button.disabled);
  await click();assert.equal(first.event.calls,1,'double click cannot open another prompt');
  first.choose('dismissed');await activeClick;
  assert(controls[0].hidden,'dismissed prompt cannot be reused');
  const second = freshOffer();await emit('beforeinstallprompt',second.event);
  controls = [control()];bindInstall();
  assert(!controls[0].hidden,'prompt survives login/navigation replacing the DOM');
  const accepted = click();second.choose('accepted');await accepted;
  assert(controls[0].hidden);
  const failed = freshOffer();failed.event.prompt=()=>Promise.reject(Error('unavailable'));
  await emit('beforeinstallprompt',failed.event);await click();
  assert.match(controls[0].status.textContent,/Belum berhasil/);
  assert(!controls[0].status.hidden);
  const retry = freshOffer();await emit('beforeinstallprompt',retry.event);
  assert(controls[0].status.hidden);
  media.matches=true;media.change();assert(controls[0].hidden);
  media.matches=false;media.change();assert(!controls[0].hidden);
  await emit('appinstalled');assert(controls[0].hidden);
  const installedOffer = freshOffer();await emit('beforeinstallprompt',installedOffer.event);
  assert(!installedOffer.event.prevented);assert(controls[0].hidden);
  console.log('PASS install lifecycle: single user prompt, dismissal, acceptance, render changes, errors, standalone and installed state');
} finally { Object.assign(globalThis,originals); }
