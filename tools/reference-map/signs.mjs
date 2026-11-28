// Build the English Cyclades atlas from the vendored MIT-licensed 2D painters.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {commonPainters,declaration,paintAtlas} from './atlas-painters.mjs';

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
const kit='02yb-cyclades.js',painters=['cySignAtlas','cyDecalAtlas'];
const donors=[...commonPainters(),declaration(kit,'const','CY_BOATS'),...painters.map(name=>declaration(kit,'function',name))];
const used=new Set();
const paintedSource=donors.join('\n').replace(/'([^'\n]*[\u0370-\u03ff][^'\n]*)'/gu,(_,label)=>{
  assert(english.has(label),'Untranslated Cyclades label '+label);
  used.add(label);return JSON.stringify(english.get(label));
});
assert.equal(used.size,english.size,'The pinned donor changed its displayed labels.');
assert(process.argv[2],'Supply an output WebP path.');
const {webp}=await paintAtlas({sourceText:paintedSource,painters,side:512});
writeFileSync(process.argv[2],Buffer.from(webp,'base64'));
