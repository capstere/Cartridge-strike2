/** Map bare 'three' imports from vendored Three addons to the SAME Three module.
 * Node-only test loader. No browser imports, downloads or third-party packages.
 * Run: node --experimental-loader ./tools/vendor-three-test-loader.mjs --test ...
 */
const threeUrl=new URL('../vendor/three/three.module.js',import.meta.url).href;
export async function resolve(specifier,context,nextResolve){
 if(specifier==='three')return {url:threeUrl,shortCircuit:true};
 if(specifier.startsWith('three/addons/')){
  return {url:new URL('../vendor/three/addons/'+specifier.slice('three/addons/'.length),import.meta.url).href,shortCircuit:true};
 }
 return nextResolve(specifier,context);
}
