import {networkInterfaces} from 'node:os';
import {privateIPv4} from '../server/access.mjs';
// Test harness only. Production never discovers/enables a LAN bind implicitly.
export function testLanHost(){
  const host=process.env.FPS_LAN_TEST_HOST||Object.values(networkInterfaces()).flat().find(x=>!x.internal&&privateIPv4(x.address))?.address;
  if(!privateIPv4(host))throw Error('LAN regression needs an assigned private IPv4 interface (or FPS_LAN_TEST_HOST).');
  return host;
}
