// Build a static import map for the public HTML. Relative keys support both a root
// site and GitHub project Pages. All spellings of one module resolve to one URL.
import {posix} from 'node:path';

const modulePath = path => /\.(?:mjs|js)$/.test(path);
const moduleTag = /<script\b[^>]*\btype="module"[^>]*>/g;
const stylesheetTag = /<link\b[^>]*\brel="stylesheet"[^>]*>/g;
const importTag = /<script type="importmap">[\s\S]*?<\/script>/;
const queryReference = /["']((?:\.\.?\/|\/)[^"'\s]*?\.(?:js|mjs)\?[^"'\s]+)["']/g;

export async function publicGameHTML(html, entries, read) {
  const byPath=new Map(entries.map(entry=>[entry.path,entry]));
  const imports={};
  function url(path){
    const entry=byPath.get(path);
    if(!entry)throw Error('Missing public asset: '+path);
    return '../'+path+'?asset='+entry.sha256.slice(0,16);
  }
  // Keep the original bare specifiers used by the shipped Three addons.
  imports.three=url('vendor/three/three.module.js');
  imports['three/addons/']='../vendor/three/addons/';
  const modules=entries.filter(entry=>modulePath(entry.path));
  for(const {path} of modules){
    imports['../'+path]=url(path);
    if(path.startsWith('vendor/three/addons/')){
      imports[path.slice('vendor/'.length)]=url(path);
    }
  }
  // Some existing imports use historical ?v= values and must share the same
  // module state as their unqualified equivalents (operator, input, room, etc.).
  for(const {path} of modules){
    const bytes=await read(path);
    for(const [,specifier] of bytes.toString().matchAll(queryReference)){
      const at=specifier.indexOf('?'),local=specifier.slice(0,at);
      const target=local.startsWith('/')?local.slice(1):posix.join(posix.dirname(path),local);
      if(byPath.has(target))imports['../'+target+specifier.slice(at)]=url(target);
    }
  }
  function rewrite(tag,attribute){
    const pattern=new RegExp('('+attribute+'=")([^"]+)(")');
    return tag.replace(pattern,(_,prefix,value,end)=>{
      const local=value.split('?')[0];
      const path=posix.join('fps',local);
      return prefix+local+'?asset='+byPath.get(path).sha256.slice(0,16)+end;
    });
  }
  const sorted=Object.fromEntries(Object.entries(imports).sort(([a],[b])=>a<b?-1:a>b?1:0));
  return html.replace(importTag,'<script type="importmap">'+JSON.stringify({imports:sorted},null,1)+'</script>')
    .replace(moduleTag,tag=>rewrite(tag,'src'))
    .replace(stylesheetTag,tag=>rewrite(tag,'href'));
}
