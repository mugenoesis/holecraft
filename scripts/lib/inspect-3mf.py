"""Prints what Trident's 3MF reader finds in a file (run inside the Trident image).
Usage: python inspect-3mf.py /files/some.3mf
"""
import json
import sys
import zipfile
from pathlib import Path

from app.threemf import inspect_3mf

path = Path(sys.argv[1])
result = inspect_3mf(path)
print(f"  objects:           {[o.name for o in result.objects]}")
print(f"  filament per obj:  {list(result.extruder_indices)}")
print(f"  filament colours:  {list(result.embedded_filament_colors)}")
with zipfile.ZipFile(path) as z:
    names = z.namelist()
    print(f"  files:             {sorted(n for n in names if n.startswith('Metadata/') and not n.endswith('.png'))}")
    if "Metadata/project_settings.config" in z.namelist():
        settings = json.loads(z.read("Metadata/project_settings.config"))
        print(f"  filament_type:     {settings.get('filament_type')}")
