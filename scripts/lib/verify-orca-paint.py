"""Checks the paint in a Holecraft OrcaSlicer 3MF, or in the project the OrcaSlicer engine wrote back out of it.

Usage: python verify-orca-paint.py <file.3mf> <painted triangles> <filament>
Reads every .model part in the zip, counts the triangles with a paint_color attribute and decodes each one the way OrcaSlicer's
TriangleSelector writes it (this checker only knows triangles that are not split, which a whole painted face is), and requires that
exactly <painted triangles> are painted, all in <filament>, and that every other triangle has no paint at all.
"""
import re
import sys
import zipfile

path, expected, filament = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])


def decode(code):
    """The filament of an unsplit triangle's paint_color text, or None if the triangle is split or the text is not understood."""
    bits = []
    for ch in reversed(code):  # the digits are written last first, each one low bit first
        v = int(ch, 16)
        bits += [bool(v & (1 << i)) for i in range(4)]
    if len(bits) < 4 or bits[0] or bits[1]:  # the first two bits count the sides that are split
        return None
    state = (bits[2] << 0) | (bits[3] << 1)
    if state < 3:
        return state
    nibble = sum(bits[4 + i] << i for i in range(4)) if len(bits) >= 8 else None
    if nibble is None:
        return None
    if nibble < 15:
        return nibble + 3
    return sum(bits[8 + i] << i for i in range(4)) + 18 if len(bits) >= 12 else None


with zipfile.ZipFile(path) as z:
    models = [n for n in z.namelist() if n.endswith(".model")]
    text = "".join(z.read(n).decode("utf-8") for n in models)

triangles = re.findall(r"<triangle\b[^>]*>", text)
painted = [re.search(r'paint_color="([0-9A-Fa-f]+)"', t) for t in triangles]
painted = [m.group(1) for m in painted if m]
states = [decode(code) for code in painted]

problems = []
if len(painted) != expected:
    problems.append(f"{len(painted)} triangles are painted, expected {expected}")
if any(s != filament for s in states):
    problems.append(f"painted filaments are {sorted(set(map(str, states)))}, expected only {filament}")
print(f"  {path}: {len(triangles)} triangles, {len(painted)} painted, filaments {sorted(set(map(str, states)))}")
if problems:
    print("  PROBLEMS:")
    for p in problems:
        print("   -", p)
    sys.exit(1)
