// Offline access to the pinned reference painters. Their geometry and UVs stay in the mesh compiler.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const source=resolve(dirname(fileURLToPath(import.meta.url)),'../../frontline/source');
export const readSource=file=>readFileSync(resolve(source,'src',file),'utf8');

export function declaration(file,kind,name){
  const text=readSource(file);
  const prefix=kind==='const'?`const ${name} =`:`function ${name}(`;
  const lines=text.split('\n'),index=lines.findIndex(line=>line.startsWith(prefix));
  assert(index>=0,`Missing ${name} in ${file}`);
  if(kind==='const'||lines[index].endsWith('}'))return lines[index];
  const end=lines.indexOf('}',index+1);
  assert(end>index,`Missing end of ${name} in ${file}`);
  return lines.slice(index,end+1).join('\n');
}

export function commonPainters(){
  return [declaration('01-core.js','function','mulberry32'),declaration('02a-kit.js','function','rngOf'),
    declaration('02c-materials.js','function','canvasOnce'),declaration('01-core.js','const','TAU')];
}

export async function paintAtlas({sourceText,painters,side,checkLabels=false}){
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--disable-gpu']});
  try{
    const page=await browser.newPage();
    await page.addScriptTag({path:resolve(source,'assets/vendor/three-r147.js')});
    await page.addScriptTag({content:sourceText});
    return await page.evaluate(({painters,side,checkLabels})=>{
      const image=document.createElement('canvas');image.width=2*side;image.height=side;
      const ctx=image.getContext('2d');ctx.imageSmoothingQuality='high';
      let part=0;
      const labels={signs:{},decals:{}};
      if(checkLabels){
        // Observe real draw calls after the painter's font fitting and transforms.
        // This includes array-driven labels, cropped instrument art and registrations.
        for(const key of ['fillText','strokeText']){
          const original=CanvasRenderingContext2D.prototype[key];
          CanvasRenderingContext2D.prototype[key]=function(value,x,y,maxWidth){
            const at=this.getTransform().transformPoint(new DOMPoint(x,y));
            const width=part===0?512:256,columns=1024/width;
            const column=Math.floor(at.x/width),row=Math.floor(at.y/256);
            const group=part===0?labels.signs:labels.decals;
            const strings=group[row*columns+column]??=[];
            if(!strings.includes(String(value)))strings.push(String(value));
            return original.apply(this,arguments);
          };
        }
      }
      for(const [index,name] of painters.entries()){
        part=index;
        const {map}=globalThis[name]();
        ctx.drawImage(map.image,index*side,0,side,side);
        map.dispose();
      }
      return {labels,webp:image.toDataURL('image/webp',.94).split(',')[1]};
    },{painters,side,checkLabels});
  }finally{await browser.close();}
}
