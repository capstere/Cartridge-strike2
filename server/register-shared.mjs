// Resolution only: vendored Three addons import bare "three". No DOM/WebGL shims.
import {register} from 'node:module';
register('../tools/vendor-three-test-loader.mjs', import.meta.url);
