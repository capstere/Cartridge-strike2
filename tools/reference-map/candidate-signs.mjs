// Bake the source sign, hazard and instrument painters used by the Embruns and Tephra factories.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {commonPainters,declaration,paintAtlas,readSource} from './atlas-painters.mjs';

const maps={
  embruns:{
    file:'02l-port.js',blob:'a996fb0d9a47d3a1eb6fb485b9d92699c015357d',
    painters:['portSignAtlas','portDecalAtlas'],extras:[['02l-port.js','const','BOATS']],
    translations:{
      'CRIÉE\nDE KERVÉNEC':'KERVÉNEC\nFISH AUCTION','CAFÉ DE LA MARINE':'HARBOR CAFÉ','FABRIQUE\nDE GLACE':'ICE\nWORKS',
      'MAREYAGE\nEXPÉDITIONS':'FISH\nDISPATCH','COOPÉRATIVE\nMARITIME':'MARITIME\nCOOPERATIVE',
      'CAPITAINERIE':'HARBOR OFFICE','POISSONNERIE':'FISH MARKET','SALLE DES VENTES\nACHETEURS AGRÉÉS':'AUCTION HALL\nLICENSED BUYERS',
      'AR MOR':'THE SEA','STEREDENN':'STAR','BUGALE MOR':'CHILDREN OF THE SEA',
      '12,40':'12.40','LOT 0347  BAR':'LOT 0347  BASS','ACHETEUR 112':'BUYER 112',
      'Bar de ligne':'Sea bass','24,50':'24.50','Lieu jaune':'Pollack','9,80':'9.80','19,00':'19.00',
      '22,00':'22.00','Maquereau':'Mackerel','4,20':'4.20','Saint-Pierre':'John Dory','16,90':'16.90',
      'FÊTE\nDE LA MER':'SEA\nFESTIVAL','Kervénec · 14 août':'Kervénec · August 14',
      'PARDON\nDES MARINS':'FLEET\nBLESSING','Bénédiction des bateaux':'Blessing of the boats',
      'ACCÈS':'NO PUBLIC','INTERDIT':'ENTRY','AU PUBLIC':'RESTRICTED AREA','ZONE PORTUAIRE':'PORT AUTHORITY',
      'HORAIRES DES MARÉES':'TIDE TABLE','PM':'High','BM':'Low','06 h 42':'06:42','12 h 58':'12:58',
      '19 h 07':'19:07','01 h 20':'01:20','5,80 m':'5.80 m','0,95 m':'0.95 m','5,95 m':'5.95 m','1,10 m':'1.10 m',
      'COEF. 98 · GRANDE MARÉE':'SPRING TIDE · COEFF. 98'
    },
    unchanged:['GWENOLA','GV 913425','CC 832107','GV 905118','AD 771304','48 KG  EXTRA','Sole','Langoustines','BZH','11','18','25','32'],
    // Preserve a gutter between long species names and prices on the narrow chalkboard.
    fit:[['g.fillText(n, 36, 52 + j * 32)','g.fillText(n, 36, 52 + j * 32, 112)'],
         ['g.fillText(p, T - 36, 52 + j * 32)','g.fillText(p, T - 36, 52 + j * 32, 60)']]
  },
  tephra:{
    file:'02yg-tephra-kit.js',blob:'b394efcfc19d1bf4feb85153976a6c590b8a60bf',
    painters:['tpSignAtlas','tpDecalAtlas'],extras:[['01-core.js','const','lerp']],
    translations:{
      'ELDFJALLASTÖÐ':'FIELD STATION','RANNSÓKNARSTOFA':'LABORATORY','LABORATORY  ·  GEOCHEMISTRY':'GEOCHEMISTRY',
      'STJÓRNSTÖÐ':'CONTROL ROOM','CONTROL ROOM  ·  GEOTHERMAL PLANT':'GEOTHERMAL PLANT','BORKJARNASAFN':'CORE ARCHIVE',
      'CORE STORE':'DRILL SAMPLES','DÆLUSTÖÐ 2':'PUMP STATION 2','PUMP STATION 2  ·  REINJECTION':'REINJECTION',
      'HÆTTA · DANGER':'DANGER','HÁÞRÝSTIGUFA':'HIGH PRESSURE','HIGH PRESSURE STEAM':'STEAM',
      'EKKI SNERTA  ·  DO NOT TOUCH':'DO NOT TOUCH','TPH.HHZ  ·  SKJÁLFTAVIRKNI  ·  24 KLST':'TPH.HHZ  ·  SEISMIC ACTIVITY  ·  24 H',
      'TEPHRA  ·  VÖKTUN / MONITORING':'TEPHRA  ·  MONITORING','ÓRÓI / TREMOR  ▲':'TREMOR  ▲',
      'BORHOLA · WELL':'GEOTHERMAL WELL','BRENNISTEINSVETNI':'HYDROGEN SULFIDE','TOXIC GAS  ·  GASGRÍMA':'TOXIC GAS  ·  GAS MASK',
      'JARÐFRÆÐIKORT  ·  GEOLOGY':'GEOLOGICAL MAP','BANNAÐ  ·  NO ENTRY':'NO ENTRY','SLÖKKVITÆKI':'FIRE EXTINGUISHER',
      'NEYÐARÚTGANGUR':'EMERGENCY'
    },
    unchanged:['!','TEPHRA','VOLCANO OBSERVATORY','GPS  +4.2 mm/d','SO2  2140 t/d','H2S  38 ppm','TP-07','TP-12','H2S','EXIT']
  }
};
const [id,output,receipt]=process.argv.slice(2),kit=maps[id];
assert(kit&&output,'Supply embruns or tephra, a WebP output path and an optional receipt path.');
const fileBytes=Buffer.from(readSource(kit.file));
const blob=createHash('sha1').update('blob '+fileBytes.length+'\0').update(fileBytes).digest('hex');
assert.equal(blob,kit.blob,'Review the changed donor labels and material layout before rebaking.');
let sourceText=[...commonPainters(),...kit.extras.map(args=>declaration(...args)),
  ...kit.painters.map(name=>declaration(kit.file,'function',name))].join('\n');
const allowed=new Set(kit.unchanged);
for(const [original,english] of Object.entries(kit.translations)){
  const literal="'"+original.replaceAll('\n','\\n')+"'";
  assert(sourceText.includes(literal),'Missing original label '+original);
  sourceText=sourceText.replaceAll(literal,JSON.stringify(english));
  for(const line of english.split('\n'))allowed.add(line);
}
for(const [donor,withGutter] of kit.fit||[]){
  assert(sourceText.includes(donor),'Missing original chalkboard columns.');
  sourceText=sourceText.replace(donor,withGutter);
}
// The source draws 13 px instrument captions. A 3/4 scale retains 9.75 px;
// both UV layouts and all emissive panels share one 1536 × 768 texture.
const side=768;
const {webp,labels}=await paintAtlas({sourceText,painters:kit.painters,side,checkLabels:true});
const displayed=new Set([...Object.values(labels.signs),...Object.values(labels.decals)].flat());
assert.deepEqual([...displayed].sort(),[...allowed].sort(),'Unexpected or missing player-visible text from the source painters');
const bytes=Buffer.from(webp,'base64');
writeFileSync(output,bytes);
if(receipt)writeFileSync(receipt,JSON.stringify({map:id,painters:kit.painters,sourceBlob:blob,size:[2*side,side],
  bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),labels},null,2)+'\n');
