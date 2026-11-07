/** User-supplied office models; original GLB bytes and embedded credits retained.
 * Both source assets include CC BY 4.0 author/source metadata.
 * The whiteboard's native broad face is along Z; modelYaw presents it across X.
 */
export const OFFICE_LIBRARY = Object.freeze([
 {
  id:'office:whiteboard-mobile',name:'Whiteboard på hjul',category:'kontor',kind:'prop',
  width:1.84,depth:.47,height:2,
  modelSize:[3.213887620704397,3.49680555089453,.8208607716375838],
  modelYaw:-Math.PI/2,placement:'floor',wallFacing:'+z',
  url:'./library/models/office/whiteboard-mobile.glb',thumb:'./library/thumbs/office/whiteboard-mobile.png',
  pack:'office',model:'whiteboard-mobile',staticOnly:true,
  keywords:'whiteboard tavla white board skrivtavla anslagstavla möte meeting mobile hjul golv kontor',
  author:'tankop1',license:'CC BY 4.0 · tankop1',
  licenseURL:'https://creativecommons.org/licenses/by/4.0/',
  source:'https://sketchfab.com/3d-models/low-poly-whiteboard-1cbf089ec4b741ad9d092d15db6d55ba',
  sha256:'75e6cb0003bff1e7dc27f1a35669824beeee5ed80e3082deb3f2652d4c43e3f7',bytes:162552,
  triangles:2388
 },
 {
  id:'office:ricoh-printer',name:'Ricoh skrivare / kopiator',category:'kontor',kind:'prop',
  width:.95,depth:.873,height:1.2,
  modelSize:[1.1187150478363037,1.4145439267158508,1.0285377502441406],
  modelYaw:Math.PI,placement:'floor',wallFacing:'+z',
  url:'./library/models/office/ricoh-printer.glb',thumb:'./library/thumbs/office/ricoh-printer.png',
  pack:'office',model:'ricoh-printer',staticOnly:true,
  keywords:'ricoh printer skrivare kopiator kopieringsmaskin multifunktion scanner skanner kontor golv',
  author:'Nol22',license:'CC BY 4.0 · Nol22',
  licenseURL:'https://creativecommons.org/licenses/by/4.0/',
  source:'https://sketchfab.com/3d-models/ricoh-printer-17d94e94fc034392a370ccc8832d60cc',
  sha256:'88c07363e9afc420c7f05e0f9c67ae7815a82383680e80470bca1e58b0f4e002',bytes:1003812,
  triangles:3760
 }
].map(Object.freeze));
