import assert from 'node:assert/strict';
import { createSidebarController } from '../pos/sidebar.mjs';
import { navigation, sections, visibleSections } from '../pos/navigation.mjs';

const pages = sections.flatMap(x => x.pages);
assert.equal(new Set(pages).size, pages.length, 'Each menu must appear only once');
assert.deepEqual(visibleSections({}).flatMap(x=>x.pages), ['guide']);
assert.deepEqual(visibleSections({sell:true,attendance:true}).flatMap(x=>x.pages), ['orders','kitchen','attendance','guide']);
assert(!visibleSections({master:true}).flatMap(x=>x.pages).includes('employees'));
const labels = Object.fromEntries(pages.map(x=>[x,x]));
const markup = navigation(labels,'orders',()=>'<svg></svg>',null,{utama:true,inventory:true});
assert.match(markup,/data-nav-group="utama" open/);
assert.match(markup,/data-nav-group="inventory" >/);
assert.equal((markup.match(/aria-current="page"/g)||[]).length,1);

function fixture({mobile=false,saved='{}',blocked=false}={}) {
  const listeners={},values=new Map([['maniac-pos-sidebar-v1',saved]]), flags=new Set();
  const root={activeElement:null,body:{classList:{toggle(k,v){v?flags.add(k):flags.delete(k)},remove(k){flags.delete(k)}}},addEventListener(k,fn){listeners[k]=fn}};
  const node=()=>({dataset:{},attrs:{},inert:false,focus(){root.activeElement=this},setAttribute(k,v){this.attrs[k]=v},getClientRects(){return [1]}});
  const shell=node(),panel=node(),main=node(),outside=node(),inside=node(),last=node(),nav={scrollTop:0};
  panel.querySelectorAll=()=>[inside,last];panel.contains=x=>[inside,last].includes(x);
  const group={open:true,isConnected:true,dataset:{navGroup:'inventory'},addEventListener(_,fn){this.onToggle=fn}};
  const lookup={'.shell':shell,'#pos-sidebar':panel,'#pos-main':main,'#sidebar-toggle':outside,'#pos-sidebar [data-sidebar-toggle]':inside,'#pos-navigation':nav};
  root.querySelector=k=>lookup[k]||null;
  root.querySelectorAll=k=>k==='[data-sidebar-toggle]'?[outside,inside]:k==='[data-nav-group]'?[group]:[];
  const media={matches:mobile,addEventListener(_,fn){this.change=fn}};
  const viewport={matchMedia:()=>media,get localStorage(){if(blocked)throw Error('Blocked storage');return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}}};
  const ctrl=createSidebarController(root,viewport);ctrl.mount();
  const click=k=>listeners.click({target:{closest:selector=>selector===k?inside:null}});
  const key=(k,shift=false)=>{let prevented=false;listeners.keydown({key:k,shiftKey:shift,preventDefault(){prevented=true}});return prevented;};
  return {ctrl,root,shell,panel,main,outside,inside,last,nav,group,values,flags,media,click,key};
}
let f=fixture();
assert.equal(f.panel.inert,false);assert.equal(f.main.inert,false);
f.click('[data-sidebar-toggle]');assert.equal(f.shell.dataset.sidebarCollapsed,'true');assert.equal(f.panel.inert,true);assert.equal(f.outside.attrs['aria-expanded'],'false');assert.equal(f.root.activeElement,f.outside);
assert.equal(JSON.parse(f.values.get('maniac-pos-sidebar-v1')).collapsed,true);
f.click('[data-sidebar-toggle]');assert.equal(f.panel.inert,false);assert.equal(f.root.activeElement,f.inside);
f.nav.scrollTop=200;f.ctrl.capture();f.nav.scrollTop=0;f.ctrl.mount();assert.equal(f.nav.scrollTop,200);
f.group.open=false;f.group.onToggle();assert.equal(f.ctrl.closedGroups.inventory,true);
assert.equal(JSON.parse(f.values.get('maniac-pos-sidebar-v1')).groups.inventory,true);
f=fixture({saved:'{"collapsed":true,"groups":{"laporan":true}}'});assert.equal(f.panel.inert,true);assert.equal(f.ctrl.closedGroups.laporan,true);
for(const config of [{saved:'invalid json'},{blocked:true}]){f=fixture(config);f.click('[data-sidebar-toggle]');assert.equal(f.panel.inert,true);}
f=fixture({mobile:true});assert.equal(f.panel.inert,true);assert.equal(f.main.inert,false);
f.click('[data-sidebar-toggle]');assert.equal(f.panel.inert,false);assert.equal(f.main.inert,true);assert(f.flags.has('sidebar-mobile-open'));assert.equal(f.root.activeElement,f.inside);
f.root.activeElement=f.last;assert(f.key('Tab'));assert.equal(f.root.activeElement,f.inside);
f.root.activeElement=f.inside;assert(f.key('Tab',true));assert.equal(f.root.activeElement,f.last);
assert(f.key('Escape'));assert.equal(f.panel.inert,true);assert.equal(f.main.inert,false);assert.equal(f.root.activeElement,f.outside);
f.click('[data-sidebar-toggle]');f.ctrl.navigate();f.ctrl.mount();assert.equal(f.panel.inert,true);assert(!f.flags.has('sidebar-mobile-open'));
f.click('[data-sidebar-toggle]');f.click('[data-sidebar-close]');assert.equal(f.main.inert,false);
f.click('[data-sidebar-toggle]');f.media.matches=false;f.media.change();assert.equal(f.main.inert,false);assert(!f.flags.has('sidebar-mobile-open'));
f.ctrl.reset();assert(!f.flags.has('sidebar-mobile-open'));
console.log('PASS: menu permissions, unique groups, desktop toggle/persistence, scroll retention, blocked storage, mobile overlay, Escape, focus trap, navigation and resize.');
