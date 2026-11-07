/** Narrow, explicit pilot contract; existing projects are never silently simplified. */
import {validateProject,newProject} from './project-schema.mjs?v=6.1.2';
import {makeCreative} from './creative-schema.mjs?v=6.1.2';
export function newMatchPilot(){const p=newProject({name:'Min provkaraktär',template:'civilian'});p.creative.outfit='tshirt';p.creative.shoes='sneakers';p.creative.print.text='MITT SPEL';p.palette.jacket=p.palette.pants='#304f65';p.palette.accent='#b9cad3';return p;}
export function validateMatchPilot(p){
 validateProject(p);const c=p.creative,defaults=makeCreative();
 if(p.kind!=='character'||p.base.gender!=='male'||p.base.original_glb!=='quaternius-operator-male.glb')throw Error('Provmatchen stöder Quaternius Male. Välj Ny Male-pilot.');
 if(c.outfit!=='tshirt'||c.shoes!=='sneakers')throw Error('Välj T-shirt och Sneakers före provmatchen.');
 if(Object.values(p.body).some(v=>v!==100)||c.fit!==100)throw Error('Piloten behöver originalproportioner och passform 100 %. Ditt projekt har inte ändrats.');
 if(p.parts.length||c.hair!=='original'||c.vest||Object.entries(defaults.face).some(([k,v])=>k!=='eyeColor'&&c.face[k]!==v)||Object.values(c.sculpt.models).some(model=>Object.values(model).some(mesh=>mesh.deltas.length||mesh.paint.length))||c.realism.head!=='original'||c.realism.fiberHair||c.realism.garment!=='none'||c.realism.fabric!=='original')throw Error('Piloten stöder originalhuvud och originalfrisyr utan extra delar, skulptering eller tygsimulering. Välj Ny Male-pilot för en kompatibel kopia.');
 return p;
}
