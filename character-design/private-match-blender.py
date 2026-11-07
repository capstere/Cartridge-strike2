"""Blender 4.5 LTS round trip of the GLB created by private-match-browser.mjs.
Compares actual deformed triangle corners, original UVs, weights and bind pose.
No original asset is written. Outputs are confined to ignored test-results/.
"""
import bpy, hashlib, json
from pathlib import Path
import numpy as np

assert bpy.app.version[:2] == (4, 5), bpy.app.version_string
folder = Path('test-results/private-character').resolve()
source = folder / 'pilot.glb'
destination = folder / 'pilot-blender-roundtrip.glb'
original = Path('assets/fps/models/quaternius-operator-male.glb')
original_hash = hashlib.sha256(original.read_bytes()).hexdigest()
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()

def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    rigs = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    assert len(rigs) == 1
    rig = rigs[0]
    assert len(rig.data.bones) == 65
    meshes = sorted([o for o in bpy.data.objects if o.type == 'MESH'], key=lambda o:o.name)
    actions = {t.name: t.strips[0].action for t in rig.animation_data.nla_tracks}
    assert len(actions) == 13, list(actions)
    return rig, meshes, actions

def signature(rig, meshes):
    bones = {b.name: {'parent':b.parent.name if b.parent else None,
        'matrix':np.array(b.matrix_local)} for b in rig.data.bones}
    parts = {}
    for obj in meshes:
        mesh = obj.data
        # glTF can duplicate seam vertices: compare indexed corners, including UV and weights.
        corners = []
        for poly in mesh.polygons:
            for loop in poly.loop_indices:
                v = mesh.vertices[mesh.loops[loop].vertex_index]
                weights = {obj.vertex_groups[g.group].name: g.weight for g in v.groups if g.weight > 1e-8}
                corners.append((np.array(v.co), np.array([u.data[loop].uv[:] for u in mesh.uv_layers]), weights, poly.material_index))
        parts[obj.name] = corners
    return bones, parts

def samples(rig, meshes, actions):
    result = {}
    old = rig.animation_data.action
    for track in rig.animation_data.nla_tracks: track.mute = True
    for name, action in actions.items():
        rig.animation_data.action = action
        poses = []
        for frame in np.linspace(*action.frame_range, 5):
            bpy.context.scene.frame_set(int(frame), subframe=float(frame % 1))
            bpy.context.view_layer.update()
            dg = bpy.context.evaluated_depsgraph_get()
            pose = {}
            for obj in meshes:
                ev = obj.evaluated_get(dg); mesh = ev.to_mesh()
                pose[obj.name] = np.array([tuple(ev.matrix_world @ mesh.vertices[i].co) for p in mesh.polygons for i in p.vertices])
                ev.to_mesh_clear()
            poses.append(pose)
        result[name] = poses
    rig.animation_data.action = old
    bpy.context.scene.frame_set(0)
    return result

rig, meshes, actions = load(source)
a_bones, a_parts = signature(rig, meshes)
a_poses = samples(rig, meshes, actions)
a_duration = {k:(a.frame_range[1]-a.frame_range[0])/bpy.context.scene.render.fps for k,a in actions.items()}
bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', export_force_sampling=False,
    export_animation_mode='ACTIONS', export_optimize_animation_size=False)
rig, meshes, actions = load(destination)
b_bones, b_parts = signature(rig, meshes)
b_poses = samples(rig, meshes, actions)
assert a_bones.keys() == b_bones.keys()
for name, a in a_bones.items():
    b = b_bones[name]; assert a['parent'] == b['parent'], name
    assert np.allclose(a['matrix'], b['matrix'], atol=2e-5), name
assert a_parts.keys() == b_parts.keys(), (a_parts.keys(), b_parts.keys())
max_weight_error = 0
for name, corners in a_parts.items():
    assert len(corners) == len(b_parts[name]), name
    for a,b in zip(corners,b_parts[name]):
        assert np.allclose(a[0],b[0],atol=2e-5), (name,'geometry')
        assert np.allclose(a[1],b[1],atol=2e-6), (name,'UV')
        # Blender 4.5 exporter drops weights below its hard-coded 0.0001 influence.
        max_weight_error = max(max_weight_error, max((abs(a[2].get(k,0)-b[2].get(k,0)) for k in a[2].keys()|b[2].keys()),default=0))
        assert max_weight_error < 3e-4, (name,'weights',a[2],b[2])
        assert a[3] == b[3], (name,'material slot')
assert a_poses.keys() == b_poses.keys(), (a_poses.keys(),b_poses.keys())
max_error = max(float(np.max(np.abs(a[name]-b[name]))) for clip in a_poses for a,b in zip(a_poses[clip],b_poses[clip]) for name in a)
assert max_error < 5e-5, max_error
max_duration = max(abs(a_duration[k]-(a.frame_range[1]-a.frame_range[0])/bpy.context.scene.render.fps) for k,a in actions.items())
assert max_duration < 2e-5, max_duration
assert original_hash == hashlib.sha256(original.read_bytes()).hexdigest()
assert source_hash == hashlib.sha256(source.read_bytes()).hexdigest()
result = {'blender':bpy.app.version_string,'bones':65,'clips':13,'meshes':len(meshes),'poses_per_clip':5,
          'max_posed_corner_error_m':max_error,'max_duration_error_seconds':max_duration,'max_weight_error':max_weight_error,
          'geometry_uv_weights_bind_hierarchy':'preserved within stated tolerances','source_unchanged':True}
(folder/'blender-result.json').write_text(json.dumps(result,indent=2))
print('PRIVATE_CHARACTER_BLENDER_OK',json.dumps(result))
