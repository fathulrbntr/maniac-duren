// Minimal DOM adapter for real form handlers. It does not render screenshots.
const decode=s=>String(s).replace(/&(amp|lt|gt|quot|#39);/g,(_,x)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"})[x]);
const camel=s=>s.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
export class Node {
 constructor(tag='div',attrs={}){this.tagName=tag.toUpperCase();this.attrs=attrs;this.children=[];this.listeners={};this.dataset=Object.fromEntries(Object.entries(attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[camel(k.slice(5)),v]));this.hidden='hidden' in attrs;this.disabled='disabled' in attrs;this.checked='checked' in attrs;this.required='required' in attrs;this._text='';this._value=attrs.value;this.classList={add:(...x)=>this.attrs.class=[this.attrs.class||'',...x].join(' '),toggle:()=>{}};}
 get name(){return this.attrs.name||''}get type(){return this.attrs.type||''}get options(){return this.querySelectorAll('option')}
 get value(){if(this._value!==undefined)return String(this._value);if(this.tagName==='SELECT')return (this.options.find(o=>'selected' in o.attrs)||this.options.find(o=>!o.disabled))?.value||'';if(this.tagName==='OPTION')return this.textContent;return '';}
 set value(x){this._value=String(x)}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('')}set textContent(x){this._text=String(x);this.children=[]}
 get elements(){return {namedItem:name=>this.querySelector(`[name="${name}"]`)}}
 setAttribute(k,v){this.attrs[k]=String(v)}removeAttribute(k){delete this.attrs[k]}hasAttribute(k){return k in this.attrs}
 matches(selector){const tag=selector.match(/^[a-z]+/i)?.[0];if(tag&&tag.toUpperCase()!==this.tagName)return false;const cl=selector.match(/\.([\w-]+)/);if(cl&&!(this.attrs.class||'').split(' ').includes(cl[1]))return false;const id=selector.match(/#([\w-]+)/);if(id&&this.attrs.id!==id[1])return false;for(const m of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)){if(!(m[1] in this.attrs)||(m[2]!==undefined&&this.attrs[m[1]]!==m[2]))return false;}return true;}
 closest(selector){return this.matches(selector)?this:this.parent?.closest(selector)||null}
 querySelectorAll(selector){const found=[];const walk=node=>{for(const c of node.children){if(selector.split(',').some(part=>{const chain=part.trim().split(/\s+/);if(!c.matches(chain.pop()))return false;let a=c.parent;while(chain.length){const last=chain.pop();while(a&&!a.matches(last))a=a.parent;if(!a)return false;a=a.parent;}return true;}))found.push(c);walk(c)}};walk(this);return found;}
 querySelector(s){return this.querySelectorAll(s)[0]||null}
 set innerHTML(html){this.children=[];this._text='';const stack=[this];const voids=['INPUT','IMG','BR','HR'];for(const token of html.matchAll(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)){const raw=token[0];if(raw.startsWith('<!--'))continue;if(raw.startsWith('</')){stack.pop();continue;}if(raw[0]==='<'){const match=raw.match(/^<([\w-]+)([\s\S]*?)\/?\s*>$/);if(!match)continue;const attrs={};for(const m of match[2].matchAll(/([\w-]+)(?:="([^"]*)"|'([^']*)'|=([^\s>]+))?/g))attrs[m[1]]=decode(m[2]??m[3]??m[4]??'');const n=new Node(match[1],attrs);n.parent=stack.at(-1);n.parent.children.push(n);if(!voids.includes(n.tagName))stack.push(n);}else stack.at(-1)._text+=decode(raw);}}
 addEventListener(type,fn){(this.listeners[type]||=[]).push(fn)}
 async fire(type){const event={target:this,currentTarget:this,preventDefault(){}};await this['on'+type]?.(event);for(const fn of this.listeners[type]||[])await fn(event);}
 checkValidity(){return !this.required||!!this.value}reportValidity(){return this.checkValidity()}close(){this.closed=true;this.removeAttribute('open');}
}
export class FormDataAdapter {
 constructor(form){this.form=form}
 *[Symbol.iterator](){for(const c of this.form.querySelectorAll('input,select')){if(!c.name||c.disabled||c.closest('fieldset[disabled]')||((c.type==='checkbox'||c.type==='radio')&&!c.checked))continue;let a=c.parent,disabled=false;while(a){disabled ||= a.disabled;a=a.parent;}if(!disabled)yield [c.name,c.value];}}
}
export function makeModal(){let latest;return {get latest(){return latest},modal(title,html,submit='Simpan'){const d=new Node('dialog',{open:''});d.innerHTML=`<h2>${title}</h2><form>${html}<p id="form-error"></p><div class="modal-actions"><button type="button" class="close">Batal</button><button type="submit">${submit}</button></div></form>`;latest=d;return d;}};}
