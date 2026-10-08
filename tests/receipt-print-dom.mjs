// Iframe/measurement adapter for Node handler tests, not a rendering engine.
import {Node} from './variant-dom.mjs';
const container=tag=>{const n=new Node(tag);n.append=child=>{child.parent=n;n.children.push(child);};return n;};
function clone(node){
 const copy=new Node(node.tagName,{...node.attrs});copy._text=node._text;copy.append=child=>{child.parent=copy;copy.children.push(child);};
 copy.children=node.children.map(child=>{const c=clone(child);c.parent=copy;return c;});return copy;
}
export function printDocument({base={},height=()=>384,onPrint=()=>{},fontsReady=Promise.resolve()}={}){
 const frames=[],printed=[],body=container('body');
 const document={...base,body,createElement(tag){
  if(tag!=='iframe')return base.createElement?.(tag)||new Node(tag);
  const frame=new Node('iframe');frame.style={};
  frame.remove=()=>{frame.removed=true;const i=body.children.indexOf(frame);if(i>=0)body.children.splice(i,1);};
  const doc={head:container('head'),body:container('body'),fonts:{ready:fontsReady},
   open(){},write(html){frame.shell=html;},close(){},createElement:tag=>new Node(tag),
   importNode(node){const copy=clone(node);copy.getBoundingClientRect=()=>({height:height(copy)});return copy;}};
  frame.contentDocument=doc;
  frame.contentWindow={print(){const record={frame,text:doc.body.textContent,css:doc.head.textContent};printed.push(record);onPrint(record);}};
  frames.push(frame);return frame;
 }};
 return {document,frames,printed};
}
