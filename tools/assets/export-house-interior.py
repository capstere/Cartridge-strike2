"""Blender 4.5 LTS: screened static library derivatives, never saves a source BLEND.
Usage: blender -b --factory-startup --disable-autoexec --python tools/assets/export-house-interior.py -- SOURCE_DIRECTORY OUTPUT_DIRECTORY
Source unit/scale is preserved; catalog dimensions are measured, not guessed.
"""
import bpy,sys,json,hashlib,math
from pathlib import Path
from mathutils import Vector
source,out=map(Path,sys.argv[sys.argv.index('--')+1:]);out.mkdir(parents=True,exist_ok=True)
report=[]
def bounds(objects):
    pts=[o.matrix_world@Vector(v) for o in objects for v in o.bound_box]
    low=[min(v[i] for v in pts) for i in range(3)];high=[max(v[i] for v in pts) for i in range(3)]
    return low,high
for path in sorted(source.glob('*.blend')):
    row={'source':path.name,'sourceSHA256':hashlib.sha256(path.read_bytes()).hexdigest()}
    try:
        bpy.ops.wm.open_mainfile(filepath=str(path),load_ui=False,use_scripts=False)
        objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
        if not objects:raise ValueError('Inga meshobjekt')
        if any(o.type=='ARMATURE' or o.animation_data for o in bpy.context.scene.objects):raise ValueError('Animerad modell kräver separat granskning')
        materials={m for o in objects for m in o.data.materials if m}
        row['materialNodes']={m.name:[n.type for n in m.node_tree.nodes] if m.use_nodes else [] for m in materials}
        row['materialAdaptations']=[]
        for m in materials:
            if m.use_nodes:
                for n in m.node_tree.nodes:
                    if n.type=='TEX_IMAGE' and n.outputs[0].is_linked and (not n.image or not n.image.has_data):raise ValueError('Saknad aktiv bildtextur: '+m.name)
        # A direct legacy Transparent BSDF is otherwise exported as opaque white.
        # Preserve its thin transparent color in the derivative only.
        for m in materials:
            if not m.use_nodes:continue
            outputs=[n for n in m.node_tree.nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output]
            if len(outputs)==1 and outputs[0].inputs['Surface'].is_linked:
                shader=outputs[0].inputs['Surface'].links[0].from_node
                if shader.type=='BSDF_TRANSPARENT':
                    color=list(shader.inputs['Color'].default_value)
                    if shader.inputs['Color'].is_linked:raise ValueError('Texturerat transparent shader kräver separat granskning')
                    m.node_tree.nodes.clear();principled=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');principled.inputs['Base Color'].default_value=color;principled.inputs['Transmission Weight'].default_value=1;principled.inputs['IOR'].default_value=1;principled.inputs['Roughness'].default_value=0
                    output=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(principled.outputs['BSDF'],output.inputs['Surface']);m.surface_render_method='DITHERED'
                    row['materialAdaptations'].append(m.name+': Transparent BSDF -> glTF transmission 1, IOR 1')
        low,high=bounds(objects);dims=[high[i]-low[i] for i in range(3)]
        if not all(math.isfinite(x) and x>0.00001 and x<100 for x in dims):raise ValueError('Ogiltiga mått')
        tri=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
        row.update(meshes=len(objects),triangles=tri,dimensionsXYZ=dims,materials=[m.name for m in materials],uvLayers=[len(o.data.uv_layers) for o in objects],units=bpy.context.scene.unit_settings.system)
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.hide_set(False);o.hide_viewport=False;o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        # Exporter converts Blender Z-up to glTF Y-up. No scaling/decimation or pivot edits.
        dest=out/(path.stem+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True,export_extras=False)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(dest))
        imported=[o for o in bpy.context.scene.objects if o.type=='MESH']
        lo,hi=bounds(imported);after=[hi[i]-lo[i] for i in range(3)]
        if max(abs(a-b) for a,b in zip(dims,after))>0.0001:raise ValueError('Exportmått avviker')
        tri_after=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in imported)
        if tri_after!=tri:raise ValueError(f'Trianglar ändrade: {tri} -> {tri_after}')
        if hashlib.sha256(path.read_bytes()).hexdigest()!=row['sourceSHA256']:raise ValueError('Originalfil ändrad')
        data=dest.read_bytes();row.update(status='PASS',output=dest.name,bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),roundTripTriangles=tri_after)
    except Exception as e:
        row.update(status='FAILED',reason=str(e));(out/(path.stem+'.glb')).unlink(missing_ok=True)
    report.append(row);print('HOUSE_EXPORT',row['source'],row['status'],row.get('reason',''),flush=True)
    (out/'conversion-report.json').write_text(json.dumps({'blender':bpy.app.version_string,'sourceCommit':'ccaf58d2b3eca04d1ddb07af9a3989ff0390b33c','files':report},indent=2)+'\n')
