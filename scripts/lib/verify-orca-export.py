"""Checks a Holecraft OrcaSlicer-flavoured 3MF with Trident's own reader (run inside the Trident image).

Usage: python verify-orca-export.py <file.3mf> <colour count> [filaments-only]
With "filaments-only" only the filaments and colours are checked: that is for the project the OrcaSlicer
engine writes back out, which it has re-arranged and re-oriented on its plate.
Expects the sample from make-orca-sample.ts: three objects (box, cylinder, sphere), each 20 mm, 40 mm
apart, printed with filaments 1, 2 and 4, and a palette whose first four colours are the defaults.
"""
import sys
from pathlib import Path

from app.threemf import inspect_3mf

path, expected_colours = Path(sys.argv[1]), int(sys.argv[2])
filaments_only = len(sys.argv) > 3 and sys.argv[3] == "filaments-only"
result = inspect_3mf(path)
first_four = ["#F28C28", "#2A9D8F", "#E76F51", "#8D99AE"]

problems = []
if len(result.plates) != 1 or result.plates[0].object_count != 3:
    problems.append(f"expected 1 plate holding 3 objects, got {result.plates}")
if [o.name for o in result.objects] != ["Box 1", "Cylinder 1", "Sphere 1"]:
    problems.append(f"object names are {[o.name for o in result.objects]}")
if not filaments_only:
    for o in result.objects:
        if abs(o.width_mm - 20) > 0.01 or abs(o.depth_mm - 20) > 0.01 or abs(o.height_mm - 20) > 0.01:
            problems.append(f"{o.name} is {o.width_mm} x {o.depth_mm} x {o.height_mm} mm, expected 20 x 20 x 20")
    if [round(o.center_x_mm) for o in result.objects] != [0, 40, 80]:
        problems.append(f"object positions are {[o.center_x_mm for o in result.objects]}")
if list(result.extruder_indices) != [1, 2, 4]:
    problems.append(f"filaments per object are {result.extruder_indices}, expected [1, 2, 4]")
colours = list(result.embedded_filament_colors)
if len(colours) != expected_colours:
    problems.append(f"{len(colours)} filament colours, expected {expected_colours}")
if colours[:4] != first_four:
    problems.append(f"the first four filament colours are {colours[:4]}, expected {first_four}")

print(f"  {path.name}: {len(result.objects)} objects, filaments {list(result.extruder_indices)}, {len(colours)} colours")
if problems:
    print("  PROBLEMS:")
    for p in problems:
        print("   -", p)
    sys.exit(1)
