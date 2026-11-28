"""Build the Pi/touch harbor tier from indexed donor geometry in world metres."""
import numpy as np

# Each step is local to that donor material. Public signs, rail silhouettes,
# doors, surface boundaries, glass and the playable level remain full fidelity.
spacing = {
    'rock':.72,'fish':.12,'crushedice':.13,'steel':.15,'plastic':.12,
    'crate':.13,'rubber':.13,'canvas':.13,'stone':.20,'concrete':.12,
    'paintwood':.09,'paint':.10,'timber':.09,'dark':.10,'carpaint':.14,
    'hull':.10,'rooftiles':.12,'rust':.12,'shutter':.08,
}

def reduce_vertices(material, positions, normals, uv, colors, faces):
    step=spacing.get(material)
    if not step or len(faces)<18:
        return positions,normals,uv,colors,faces
    # Preserve axial edges for structures. Non-structural rocks, fish and ice
    # retain their averaged normals and artwork while small relief is merged.
    vertices=np.rint(positions/step).astype(np.int32)
    if material not in ('rock','fish','crushedice'):
        axis=np.abs(normals).argmax(axis=1)
        side=normals[np.arange(len(axis)),axis] < 0
        vertices=np.column_stack((vertices,axis*2+side))
    _,assignment=np.unique(vertices,axis=0,return_inverse=True)
    count=np.bincount(assignment)
    def average(values):
        return np.column_stack([np.bincount(assignment,weights=channel)/count for channel in values.T]).astype(np.float32)
    collapsed=assignment[faces].reshape(-1,3)
    distinct=(collapsed[:,0]!=collapsed[:,1])&(collapsed[:,1]!=collapsed[:,2])&(collapsed[:,0]!=collapsed[:,2])
    collapsed=collapsed[distinct]
    if not len(collapsed):
        return positions[:0],normals[:0],uv[:0],colors[:0],faces[:0]
    # Identical oriented triangles that formerly differed only by a tiny
    # bevel must not overdraw a surface repeatedly.
    sorted_ids=np.sort(collapsed,axis=1)
    _,first=np.unique(sorted_ids,axis=0,return_index=True)
    used,compact=np.unique(collapsed[first],return_inverse=True)
    normal=average(normals)[used]
    normal/=np.maximum(np.linalg.norm(normal,axis=1,keepdims=True),.00001)
    return average(positions)[used],normal,average(uv)[used],average(colors)[used],compact.astype(np.uint32).reshape(-1,3)
