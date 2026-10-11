import math
import sys

import trimesh

folder = sys.argv[1]
bore = 0.5 * 64 * 25 * math.sin(2 * math.pi / 64) * 20
expected_box = 8000 - bore

for ext in ("stl", "obj", "3mf"):
    scene = trimesh.load(f"{folder}/check.{ext}", force="scene")
    meshes = list(scene.geometry.values())
    print(f"{ext}: {len(meshes)} geometry(ies)")
    for m in meshes:
        print(f"   watertight={m.is_watertight} winding_ok={m.is_winding_consistent} volume={m.volume:.1f} "
              f"bounds_min={m.bounds[0].round(2).tolist()} bounds_max={m.bounds[1].round(2).tolist()} faces={len(m.faces)}")

# Every format should give the same parts.
stl = trimesh.load(f"{folder}/check.stl")
assert stl.is_watertight, "STL is not watertight"
parts = stl.split(only_watertight=False)
volumes = sorted(round(p.volume, 1) for p in parts)
print("STL split into", len(parts), "parts with volumes", volumes)
box = min(volumes, key=lambda v: abs(v - expected_box))
assert abs(box - expected_box) < 80, f"drilled box volume {box} is not near {expected_box:.1f}"
print("OK: files load, are watertight, and the drilled box has the right volume")
