// Build the English Cyclades atlas from the vendored MIT-licensed 2D painters.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const input=file=>readFileSync(resolve(root,'frontline/source/src',file),'utf8');
const english=new Map(Object.entries({
  'ΚΑΦΕΝΕΙΟ':'COFFEE HOUSE','Ο ΠΛΑΤΑΝΟΣ':'THE PLANE TREE','ΤΑΒΕΡΝΑ':'TAVERN','ΜΕΛΤΕΜΙ':'MELTEM',
  'ΨΑΡΟΤΑΒΕΡΝΑ':'FISH TAVERN','Ο ΚΑΠΕΤΑΝ ΜΙΧΑΛΗΣ':'CAPTAIN MICHAEL','ΑΡΤΟΠΟΙΕΙΟ':'BAKERY','ΦΡΕΣΚΟ ΨΩΜΙ':'FRESH BREAD',
  'ΠΕΡΙΠΤΕΡΟ':'KIOSK','ΔΩΜΑΤΙΑ':'GUESTHOUSE','ΙΕΡΟΣ ΝΑΟΣ':'CHAPEL','ΠΑΝΑΓΙΑΣ ΘΑΛΑΣΣΙΝΗΣ':'OUR LADY OF THE SEA',
  'ΜΠΑΚΑΛΙΚΟ':'GROCERY','ΠΑΝΤΟΠΩΛΕΙΟ':'GENERAL STORE','ΜΕΛΙΝΑ':'MELINA','ΠΕΙ 4471':'PIR 4471',
  'ΑΓΙΟΣ ΝΙΚΟΛΑΟΣ':'SAINT NICHOLAS','ΣΥΡ 218':'SYR 218','ΕΛΠΙΣ':'HOPE','ΠΕΙ 3092':'PIR 3092',
  'ΘΑΛΑΣΣΑ':'SEA','ΝΑΞ 76':'NAX 76','ΜΕΝΟΥ':'MENU','ΧΤΑΠΟΔΙ ΣΧΑΡΑΣ':'Grilled octopus',
  'ΓΑΥΡΟΣ ΤΗΓΑΝΗΤΟΣ':'Fried anchovies','ΣΑΛΑΤΑ ΧΩΡΙΑΤΙΚΗ':'Village salad','ΤΖΑΤΖΙΚΙ':'Tzatziki',
  'ΜΟΥΣΑΚΑΣ':'Moussaka','ΠΑΝΗΓΥΡΙ':'ISLAND FAIR','15 ΑΥΓΟΥΣΤΟΥ':'AUGUST 15','Μουσική · Χορός · Φαγητό':'Music · Dance · Food',
  'ΔΡΟΜΟΛΟΓΙΑ ΠΛΟΙΩΝ':'FERRY TIMES','ΠΕΙΡΑΙΑΣ':'PIRAEUS','ΣΥΡΟΣ':'SYROS','ΠΑΡΟΣ':'PAROS',
  'ΜΕΤΑ ΤΟΥΣ ΑΝΕΜΟΥΣ':'WEATHER PERMITTING','ΠΩΛΕΙΤΑΙ':'FOR SALE','ΤΗΛ. 22850 71234':'TEL. 22850 71234','ΠΑΓΩΤΟ':'ICE CREAM'
}));
const dependency=(file,fn)=>{
  const source=input(file);
  const entry=source.split('\n').find(line=>line.startsWith('function '+fn+'('));
  assert(entry,'Missing reference function '+fn);
  if(entry.endsWith('}'))return entry;
  const start=source.indexOf(entry),end=source.indexOf('\n}',start);
  assert(end>start,'Missing reference function end for '+fn);
  return source.slice(start,end+2);
};
const cyclades=input('02yb-cyclades.js');
const boats=cyclades.split('\n').find(line=>line.startsWith('const CY_BOATS ='));
assert(boats);
const donors=[
  dependency('01-core.js','mulberry32'),dependency('02a-kit.js','rngOf'),
  dependency('02c-materials.js','canvasOnce'),'const TAU = 2*Math.PI;',boats,
  dependency('02yb-cyclades.js','cySignAtlas'),dependency('02yb-cyclades.js','cyDecalAtlas')
];
const used=new Set();
const paintedSource=donors.join('\n').replace(/'([^'\n]*[\u0370-\u03ff][^'\n]*)'/gu,(_,label)=>{
  assert(english.has(label),'Untranslated Cyclades label '+label);
  used.add(label);return JSON.stringify(english.get(label));
});
assert.equal(used.size,english.size,'The pinned donor changed its displayed labels.');
assert(process.argv[2],'Supply an output WebP path.');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--disable-gpu']});
try{
  const page=await browser.newPage();
  await page.addScriptTag({path:resolve(root,'frontline/source/assets/vendor/three-r147.js')});
  await page.addScriptTag({content:paintedSource});
  const data=await page.evaluate(()=>{
    const image=document.createElement('canvas');
    image.width=1024;image.height=512;
    const ctx=image.getContext('2d');
    ctx.imageSmoothingQuality='high';
    // Retain the two original layouts side-by-side. The mesh compiler applies
    // this same transform to the donor's downward-facing V coordinates.
    ctx.drawImage(cySignAtlas().map.image,0,0,512,512);
    ctx.drawImage(cyDecalAtlas().map.image,512,0,512,512);
    return image.toDataURL('image/webp',.94).split(',')[1];
  });
  writeFileSync(process.argv[2],Buffer.from(data,'base64'));
}finally{
  await browser.close();
}
