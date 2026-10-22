<p align="center">
  <img src="branding/logo.jpg" alt="Holecraft logo" width="480">
</p>

<h1 align="center">Holecraft</h1>

<p align="center">
  <b>Open-source, offline, browser-based 3D modeling for makers.</b>
</p>

<p align="center">
  <a href="https://ko-fi.com/mugenoesis"><img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support me on Ko-fi"></a>
</p>

Holecraft is an approachable solid modeler: drag primitive shapes onto a
workplane, turn some into holes, group them, and export a printable model. It is an
independent project with its own code and design, and it runs entirely on your own hardware:

- **Docker**: self-host it and open it from any browser on your network.
- **Linux desktop app**: AppImage or .deb that works fully offline.

> **Status: version 0.5.** A library of designs that save automatically, with folders, search and sorting; shapes
> (basic, parametric, threads and fasteners, text in ten fonts, SVG and sketches) with move, resize, rotate, holes and
> groups that cut real geometry, and a shape may go through the workplane; chamfers and rounds on any edge; align,
> flip, ruler and Workplane tools; **Engrave** (lettering fitted to the surface of any shape), text wrapped round a
> cylinder, **Merge**, **Model check and repair** for imported models, an **X-ray** view; colour painting and a filament
> palette; **import** (STL, OBJ, 3MF, SVG) and **export** (STL, OBJ, 3MF, and 3MF for OrcaSlicer); **Send to Trident**
> and resin tools (hollowing, drain holes, tilt, support points) with a [Trident Studio](https://github.com/mugenoesis/Trident)
> slicer. Still to come: more Sketch tools (revolve, fillets, dimensions), packaging (Flatpak, multi-arch Docker, login)
> and version history. There is no authentication, so keep it on a trusted network.

## Colours and multi-colour printing

Every design has a **palette** of filament colours (the **Colours** panel): four to start, the usual
multi-material setup, up to sixteen, which is what a Bambu printer can address. Click a colour to paint the
selected shapes with it. **Change the chosen colour** and everything painted with it changes too, so a colour
always means "this filament". **Add colour** and **Remove colour** manage the palette; shapes keep their colour
if its slot is removed (they print with the nearest remaining filament). Shapes can still be any colour via the
Color field in Properties; they print with the nearest palette colour.

Both colour fields have a swatch that opens a **colour wheel** (hue round the rim, white in the middle, a
**Brightness** slider) and 24 ready-made **filament colours** (Properties also offers the design's own
colours first), and a box for typing the colour as hex (`#rrggbb` or `#rgb`). Dragging on the wheel shows
the colour on the shapes as you go and keeps where you let go as one undo step; on a touch screen the wheel
opens as a sheet along the bottom of the screen.

**Export as 3MF for OrcaSlicer** writes the palette as the file's filament list and gives each object the
filament (numbered from 1) of its colour, in the form OrcaSlicer, Bambu Studio and Trident read for
multi-material projects. Only filament settings are written (at OrcaSlicer's generic PLA values), never your
printer or print profile. It was checked against the real OrcaSlicer engine (`scripts/verify-orca-export.sh`),
which loads it and keeps every object's filament and all the colours, for 4 and for 16 filaments. **Paint** (see below) colours parts of a single model: the faces you paint are exported to OrcaSlicer as its own paint-on colours.

## On a phone or tablet

The editor works from a phone's browser (open the server's address on your home network). On any touch
screen, and in windows narrower than 900 px, it uses a **compact layout** so the 3D view keeps the room:

- The top bar is one row (two on a phone): back, undo and redo as arrows, the design's name, Import, Export
  and the save status.
- The view toolbar keeps **Home**, **Fit** and **Select** and puts **Ruler**, **Workplane**, **Edges**,
  **Paint** and **Orthographic** under **Tools**. The tool in use stays on the bar (`Paint ✕`), so one tap
  puts it away, since a touch screen has no `Esc`.
- The side panel (beside the view on a tablet, below it on a phone) shows one tab at a time: **Shapes**,
  **Edit** (Properties and Arrange), **Colours** and **Objects**. Selecting something from the Shapes tab
  brings up Edit (the tab shows how many things are selected), and clearing the selection goes back.
- While something is selected a bar over the bottom of the view does what the editing shortcuts do:
  **Duplicate** (`Ctrl+D`, which also repeats the last move), **Make hole** / **Make solid**, **Group**
  and **Ungroup** (`Ctrl+G`), **Delete** and **Done** (`Esc`).

Menus and messages open across the full width, and buttons, fields and the resize/rotate handles are larger
on touch screens. Camera: drag one finger on empty space to orbit, two fingers to pan, pinch to zoom.

## Importing models

**Import** in the top bar brings in an STL (binary or text), OBJ, 3MF or SVG file (3MF files, including
the compressed ones slicers write, are read in the units they were saved in and converted to
millimetres). The model becomes a shape named after the file, resting on the workplane at its real
size, and from then on it is like any other shape: move, resize, rotate, recolour, duplicate, turn it
into a **hole**, group it, export it.

- **SVG files** are extruded into a solid **5 mm** deep (change it with Height, like any shape): the filled shapes of the drawing, in millimetres, standing on the workplane and named after the file. It reads paths (all the curve and arc commands), rectangles (rounded too), circles, ellipses, polygons and polylines, in groups with transforms, with their fill, fill-rule (even-odd or non-zero, so holes come out as holes) and display. Shapes that overlap are joined. The size comes from the file's width and height against its view box (mm, cm, in, pt and pc are honoured; **pixels and plain numbers count as millimetres**); without a size, one unit is a millimetre. **Not read:** strokes (an outline drawn as a stroke has no area: use *Stroke to Path* first), text (use *Object to Path*), gradients, clipping, masks and `use`. A file with nothing filled says so. The up axis does not apply to an SVG.
- **Which way is up.** Files are read as Z up (CAD, STL and 3MF files). Many OBJ files, from Blender and game tools, have Y as the height and would arrive lying on their side: set the **Up axis** next to the Import button to **Y up** first and the model is stood upright as it is read (a quarter turn, not a mirror, so its width, depth and height are right straight away). The choice is remembered in your browser.
- A model has to be **watertight** (a closed surface) to be cut or to cut something. If it has holes in
  its surface it still imports and moves, but grouping it with a hole or exporting it as a group says
  which model is the problem.
- **Model check and repair.** Select one imported model and the side panel has a **Model check** section. It says whether the model is a **closed surface** (it must be, to be cut, grouped with a hole or merged) and, if not, what is wrong: **open edges** (holes in the surface), **neighbouring triangles facing opposite ways**, **triangles with no area**, **a surface that faces inwards**, or **edges three or more triangles share**. **Repair** mends what can be mended by itself, as one undo step: it removes the empty triangles, turns triangles and pieces the right way round, and fills each hole flat (it follows the hole's outline, so an L-shaped hole is not covered over). It says what it did, and what it could not (a hole that touches itself, a very large one, an edge three triangles share, which it never guesses at; for those, fix the model in the program that made it). Repair needs no Trident and no network, and it keeps the model's size, place and colour. Filling a hole is a flat patch, not a guess at the missing shape: look at the result.
- Limits: files up to 200 MB, 3 million triangles (a detailed scan or a hollow skeleton model of about 1.9 million opens as it is), and no bigger than 1000 mm in any direction. A model that big is slow to turn into a group and cut (the cut takes seconds and a lot of memory), and a phone may struggle to read one: a computer is better for the detailed ones.
  A model with no thickness is refused. **A 3MF with several objects** (what a slicer saves when more than one is on the plate) opens as a shape for each object, named as the file names them (or by the file's name and a number), standing where they stood in relation to each other: the whole is centred on the workplane and put on it, and each object keeps its height above the others. They are all selected, so one Undo takes them all away and you can group or move them together. An object made of several parts is one shape. A file with more than 200 objects opens as one joined shape instead. STL, OBJ and SVG files, and a 3MF with one object, open as one shape.
- Colours and materials in the file are not kept (imports are grey; recolour them). A model's data is
  stored once on the server, in `<data folder>/meshes/`, so duplicating it costs nothing. Files for
  models you have deleted are not cleaned up yet.

### From MakerWorld, Printables and Thingiverse (a Firefox add-on)

The **Holecraft Send** add-on (in `apps/addon`) puts a button in Firefox, on a computer or on Android, that opens a model you have just downloaded in Holecraft or in [Trident Studio](https://github.com/mugenoesis/Trident). A web page cannot see another site's downloads, so the add-on is the part that does: while a tab on MakerWorld, Printables or Thingiverse is open, it notices a model or a zip coming down (STL, 3MF, OBJ, STEP, or a zip), keeps a copy for half an hour, and shows how many are waiting on its toolbar button. Tap it, and each file has **Open in Holecraft** and **Open in Trident**. Nothing leaves the browser until you press one, and only for the addresses you gave it.

- **Holecraft** gets the file as it came (a zip too: Holecraft then asks which models to open) and opens it as a new design named for the file. See `/api/import` below.
- **Trident** gets the model by its normal upload with your API key, and opens it there. A zip with several models shows one **Open in Trident** button for each model in it.
- **Setting it up:** open the add-on's settings, give Holecraft's address (for example `http://192.168.1.3:8200`) and, for Trident, its address and an API key (one that may upload models), and press **Check** to see each answer. They are kept in the browser on that device. The settings page also lists what that browser can do and the downloads the add-on saw lately (with no signed part of an address), which shows why one was not offered.
- **Build it:** `scripts/package-addon.sh` makes `apps/addon/release/holecraft-send-<version>.zip` (CI keeps the add-on as the artifact `holecraft-send` of each run: download it from the run's page and it is the zip, with nothing to unpack first). Firefox only installs signed add-ons: upload the zip at addons.mozilla.org (choose **On your own** to keep it unlisted) and it is signed within minutes. To try it first on a computer, open `about:debugging`, **This Firefox**, **Load Temporary Add-on**, and pick `apps/addon/dist/manifest.json`.
- **On Android**, Firefox has no downloads API, so the add-on watches responses instead. To install the signed file: copy it to the phone, then in Firefox open **Settings, About Firefox**, tap the logo five times to unlock the debug menu, go back to **Settings**, and choose **Install extension from file**.
- It asks for access to all sites because a download can come from any address (a download network), but it only looks at tabs on the three sites, and it never reads a page.

## Exporting for printing

The **Export** button in the top bar downloads the whole design as (tick **Only the selected** in the menu, shown while something is selected, to export just those):

| Format | Good for |
|---|---|
| **STL** | Slicers and printing. Binary, in millimetres |
| **OBJ** | Other 3D programs. Text, in millimetres, one named object per shape |
| **3MF** | Viewers and other 3D programs. Keeps each object's name and colour, in millimetres. Slicers such as OrcaSlicer and Trident ignore these colours: use **3MF for OrcaSlicer** for multi-colour printing |
| **3MF for OrcaSlicer** | Multi-colour printing in OrcaSlicer, Bambu Studio and Trident: each object is assigned the filament of its colour (see below) |
| **Send to Trident** | Not a file: sends the same file as *3MF for OrcaSlicer* to your [Trident Studio](https://github.com/mugenoesis/Trident) slicer (Trident for short) and opens it there in a new tab (see below) |

What you get is what you see: holes are cut out of the solids they share a group with, every
shape is placed where it sits (moved, lifted, turned), and each top-level shape or group becomes its
own object. Holes that are not in a group with a solid, hidden shapes and anything the holes cut away
completely are left out. The file is named after the design. The files have been checked with an
independent mesh library (`scripts/verify-exports.sh`): closed, consistently wound, the right volume.
In the desktop app you choose where to save; set `HOLECRAFT_DOWNLOAD_DIR` to save straight into a folder.

**Going through the workplane.** A shape can be lifted below the workplane, by dragging its lift handle past the plane or typing a negative **Z**, so that part of it is underground (down to 1000 mm). A hole never decides how tall a group is or where it sits: a hole cube under a solid cube leaves a group as tall as the solid one, standing where the solid one stands, and **Drop to workplane** rests the lowest solid point on the plane. When what you export (a file, or Send to Trident) has any part below the plane, Holecraft asks first: **Cut off at the workplane** removes everything under the plane from the file and leaves a flat bottom (a part wholly underground is left out; painting on a part that is cut is dropped), **Export as it is** keeps the whole shape where it is for the slicer to deal with (most slicers lift it onto the bed), and **Cancel** exports nothing. Nothing is asked when everything is on or above the plane. Hollow, Merge and the support-point request keep the shape as it is and do not ask.

### Send to Trident

If you run Trident Studio (version 0.6 or later), **Export, Send to Trident** uploads the design to it and opens it there, with the palette
as filaments, in one click. The first time it asks for Trident's address (such as `http://192.168.1.3:8000`) and an API key; make the key in Trident
under the settings cog, **API keys…**, as a *Holecraft* key (it can only upload models). Leave the key empty if your Trident has no login. After that
the menu shows where it sends to, and **Trident settings…** changes or forgets it. *Only the selected* is respected.

Holecraft's server sends the file, not your browser, so the two need no shared folder, Trident needs no cross-site setup and Holecraft may be on
https while Trident is on http. The address and key are kept in `trident.json` in Holecraft's data folder (readable only by the server's user);
the key is never sent back to the browser. Holecraft has no login, so anyone who can open it can send to that Trident or change the settings: keep both on a
trusted network.

## Resin printing

The **Resin** section of the side panel (under Properties) has tools for printing with resin. On a desktop screen it starts **folded** to its heading, since most designs are not for resin: open it with the arrow beside the heading, and it stays open in this browser (a phone or tablet shows it under the Edit tab). Select one shape or group first. When a button is off, the panel says why in plain text beside it: nothing (or several things) selected, the shape locked, hidden or a hole, a diameter or wall outside its range, or no Trident set up.

- **Hollow.** Select a shape or group, set the **Wall thickness** (2 mm to start, 0.5 to 20) and the **Accuracy** (Fast, Normal or Fine) and press **Hollow the
  selected shape**. Holecraft's server sends the shape to your Trident Studio (see *Send to Trident* above), which works out the cavity, and the shape is swapped
  for the hollow model that comes back, in the same place and the same size, as one undo step (Undo brings the original back). It becomes a mesh shape, so
  it can be moved, turned, resized, coloured and grouped like an imported model, but its parts can no longer be edited: do the editing first, or for a partial
  hollow, a different inner shape or ribs make the cavity yourself with hole shapes. The panel says how much resin is saved. The button is off, with the reason,
  until a Trident is set up; the key Trident gives Holecraft has to be a **Holecraft resin tools** key (or a full-access one), and
  Trident needs to be a version that can hollow. Hollowing a very complex model can take a while.
- **Drain holes.** A hollow resin print fills with liquid resin, which has to run out (and air has to get in) or the print is sucked against the film.
  **Add drain hole** puts a round hole (**Diameter**, 3.5 mm to start, 0.5 to 30) in the middle of the bottom of the selection, and **Add vent hole** one in the
  middle of the top. Each goes in as an **ordinary hole** grouped with the shape so it cuts: you see it, move it, resize it or delete it like any other shape,
  and a second hole joins the same group. It goes a quarter of the height in (3 to 15 mm, never past the shape) and starts 1 mm outside the face so it cuts clean
  through. Holes only help a model that is hollow: make the cavity yourself with a hole shape inside the model (a partial hollow, a different inner shape and ribs
  are all just shapes), then add the holes. Each press is one undo step.
- **Orientation.** **Tilt 15°, 30° or 45°** turns the selection about the X axis (on top of any turn it has), about its middle, and sets it back on the plane.
  A model laid on a slant is peeled from the film a thin line at a time instead of all at once, which is gentler on the print and the film. Press again to tilt further.
- **Supports.** Choose the resin printer you will print on (the list comes from your Trident) and press **Generate support points**: Trident's slicer works out where
  the supports would touch the model, and the points show over it (through the model: light blue were made by Trident, dark blue are yours, orange is the one
  chosen). Click a point to choose it, drag it over the model to move it (it stays on the model), change its **Tip radius**, press **Delete** or **Delete point**
  to take it away, or **Add point** and click the model to put one where you want it (Escape stops adding). **Delete all** takes every point away and **Back to
  generated** has Trident work them out again. **Show points** hides them. Every change is one undo step, and the points are saved with the design. If you change
  the shape afterwards the panel warns that the points are out of date: generate them again. **Send to Trident** then sends the points with the model, and
  Trident prints with exactly those supports (its resin screen has a tick box to use its own instead). Points go with the whole design, not with a selection.
  The key needs the **Holecraft resin tools** access, and Trident must be a version that places supports.

## Your designs

Holecraft opens on a list of your designs. **New design** makes one and opens it; click a name to
open it, or use **Rename**, **Duplicate** and **Delete** (which asks first). Everything you do is
**saved automatically** a moment after you stop changing things, and the top bar shows
*Saved*, *Unsaved changes*, *Saving…* or *Couldn't save* (it keeps your work on screen and retries
until the server answers). If you have the same design open in two tabs, windows or devices, the one that saves second is told the design was **changed somewhere else** and has to choose: **Keep my version** saves what that tab shows over the other version, **Load the other version** drops that tab's unsaved changes and shows what was saved. Nothing is lost without asking, and a design renamed from the list counts as changed too. Moving a design to a folder does not. Change a design's name in the top bar. **Version history** (the ↺ button in the top bar) lists earlier versions the server kept of the design: how it stood before each stretch of editing (one every five minutes at most, up to 50, thinned from the middle so the oldest and newest stay). **Restore** puts one back; what was there is kept first, so a restore can itself be taken back. Deleting a design deletes its history, and saved shapes in the library keep none. Each design on the list shows a small
**picture** of itself (taken from the usual angle, without the grid, a couple of seconds after you stop
editing; designs with nothing in them show a placeholder). Undo history is not kept between
sessions. Designs are plain JSON files, one per design, in `<data folder>/designs/`, so they are
easy to back up or copy (the earlier versions are in `<data folder>/versions/`).

**Folders, search and order.** Each design has a **Folder** list under its name: pick a folder, **No folder**, or **New folder…** and type a name. Designs in no folder come first, then each folder under its own heading, with how many designs it holds. The arrow beside a heading folds the folder away (kept in this browser), **Rename** renames the folder for everything in it (a name that is another folder's joins it), and **Remove folder** takes the folder apart and keeps its designs (it asks first). Folders are one level deep, and a folder exists while a design is in it. The **search** box keeps the designs whose name or folder holds every word you type, and shows a matching folder even if it is folded. **Sort by** changes the order inside each folder: last changed (the usual), name, or date made, which is also kept in this browser. A design's folder is saved in its own file (`"folder": "Name"`) and moving a design does not count as changing it; editing a design never moves it out of its folder, and a copy stays in the original's folder.

## Using the editor

| Action | How |
|---|---|
| Add a shape | Click a shape in the Shapes panel, then click the plate: a see-through ghost of the shape follows the pointer, snapped to the grid, standing on the top or side of any shape it is over (or on the floor), and one click puts it down there (Esc, a right click, or clicking the shape again lets go of it; saved shapes under Mine work the same way). Or drag it from the panel onto the plate or onto a shape (it lands where the ghost would). On a touch screen a tap adds the shape at once, and pressing and holding a shape for a moment lifts it: drag it onto the plate with the ghost under your finger and lift to put it down (lift over the panel to let go; a quick swipe still scrolls the panel). Enter on a shape adds it at once too (there is no pointer to aim with). Drops snap to the grid. The panel has Box, Cylinder, Sphere, Cone, Pyramid, Wedge (tallest at the back), Roof (ridge runs front to back), Round Roof (a half cylinder lying along the depth) and Half Sphere and Hexagon (a regular one at 20 × 17.32 mm to start), all stretching to any size like a box; and the **Tube** (a hole right through it, with a **Wall thickness**) and **Torus** (a ring, 30 × 30 × 10 mm to start, with a **Ring thickness**) and **Star** (five tips, 20 × 19.02 × 10 mm to start, with an **Inner radius**) and **Polygon** (a regular one with 3 to 32 **Sides**, 5 to start, filling a 19.02 × 18.09 × 20 mm box), and the **Threaded Rod** and **Threaded Hole** (real right-handed threads, picked with **Size**: ISO metric M2 to M12 at coarse pitch, or unified inch coarse (UNC) #4-40 to 1/2-13, listed in their own group of the menu (the pitch is 25.4 over the threads per inch, and the heads, nuts, washers and sockets of the inch sizes use their nominal ASME dimensions); a hole also has a **Fit** of Tight, Normal or Loose, which opens it by 0.1, 0.2 or 0.4 mm on every side so a screw of the same size turns in it). **A thread keeps its real size:** the diameter comes from the Size and cannot be dragged or typed (only the corner-free height and lift handles show), only the **Length** changes, and the thread stays exact at any length. A **Bolt** is a thread with a head on it (**Head**: Hex or Socket cap, with its hex socket; the ISO 4017 and 4762 sizes), and its **Length** is the shank under the head, so an M5 bolt of 20 mm is 23.5 mm tall with a hex head. A **Nut** is the ISO hex for its size, 4 mm thick for an M5 (change its Length to make a thicker or thinner one), with the thread of the same Size through it, opened by its **Fit**. A nut and a bolt of the same size mate: the nut's thread starts at the same height as the bolt's, so slide it along the bolt by a whole number of pitches (or turn it with Rotate Z). **Simple threads** (a button in the view toolbar, shown once the design has a thread, remembered in your browser) draws every thread as a plain cylinder at its pitch diameter while you edit, so long threads stay quick on a slow device; groups with threaded holes are worked out from the cylinder too. It only changes how things are drawn: saving and every export always use the real thread. A **Washer** is the flat ISO 7089 ring for its Size (an M5 is 10 mm across, 1 mm thick; its Length can be changed). A **Standoff** is a hex spacer with the thread of its Size in it and a **Fit**: **Female-female** has the thread right through it (a long nut), **Male-female** has a stud (twice the thread's diameter long) under its body and a thread blind into the other end, going down to a diameter above the body's bottom. Its **Length** is the body (10 mm to start), not counting the stud, and it can't be shorter than a nut's thickness (female) or twice the thread's diameter (male). The stud's thread starts at the same height as a bolt's so a nut goes on it, and a screw seats in the blind hole when it is lowered a whole number of pitches. A group holding a thread cannot be resized. The Shapes panel has a **search box** (by name or another name: "ring" finds the tube, torus and washer; Enter adds the first match, Esc clears it) and **All / Basic / Parametric / Fasteners** chips, over a grid that shows four rows and scrolls for the rest. The other settings (shown in mm for the size they are now) stretch evenly with the shape when you resize it, like the rest of it, so a tube made twice as big has a wall twice as thick and nothing about it breaks. A too-big value is limited to what fits, and Properties says so |
| Select | Click a shape (or its row in the Objects list). Shift-click adds or removes. Drag a box around shapes to select several. `Ctrl+A` selects all, `Esc` clears. **On a touch screen** (no Shift key): turn on **Select** in the view toolbar, then every tap on a shape or an Objects row adds it to the selection (or takes it out again), and a finger dragging on empty space draws the selection box instead of orbiting; shapes don't move while it is on. Turn it off to go back to normal. **Select all** in the Objects list does what `Ctrl+A` does |
| Move | Drag a shape. It snaps to the grid and stays on the workplane. Dragging one of several selected shapes moves them all |
| Resize | Select one shape and drag a handle. Corner handles resize width and depth, side handles one dimension, the top round handle the height. The opposite corner or side stays fixed, and the edge you drag snaps to the grid. Hold `Shift` to scale all three dimensions together, `Alt` to resize about the centre. The size shows live while you drag |
| Rotate | Select one shape and drag a coloured ring handle: red turns it about the X axis, green about Y, blue about Z. It turns about the shape's centre and snaps to 22.5° (hold `Shift` for 1° steps). The angle shows live while you drag. You can also type **Rotate X / Y / Z** in degrees in the Properties panel |
| Lift | Drag the black cone above a shape to raise it off the workplane. Press `D` (or **Drop to workplane**) to put it back down |
| Shortcuts | Press `?` (or the **?** button in the top bar) for a sheet of every keyboard shortcut and mouse move; `Esc` closes it |
| Nudge | Arrow keys move the selection along the nearest workplane axis by the grid step (`Shift` for ten times as far) |
| Edit properties | Select a shape, then type a name, position (X, Y, Z), size (width, depth, height) or color in the Properties panel. Press Enter or click away to apply; invalid values are rejected |
| Tilted shapes | A shape tipped about X or Y keeps its resize and lift handles, and they work along the shape's own axes: a side or corner handle changes the size it belongs to (the opposite side stays put), the height handle stretches it along its own up, and the lift handle raises or lowers the whole shape straight up, never below the workplane. Its X, Y and Z fields show its base point, which moves when it tips. **Drop to workplane** rests its lowest corner on the plane. A group tipped about X or Y keeps its handles the same way (along the group's own axes) as long as the shapes inside are in quarter turns within it. |
| Solid / hole | Choose **Solid** or **Hole** under Type in the Properties panel (it applies to everything selected). A hole on its own is drawn as a pale see-through ghost, and keeps its colour for when you turn it back into a solid |
| Cut a hole | Make a shape a **Hole**, position it where it overlaps a solid, then select both and **Group** them: the group becomes one solid with the hole cut out of it. Several solids in a group are joined together, and several holes all cut. Ungroup to get the separate shapes back, ghosts and all |
| Saved shapes | With one shape or group selected, **Save to library** in Properties opens a name box (the object's own name to start with); saving keeps a copy of it, with everything in it (holes, colours, chamfers, sizes, imported models), for **every design**: it is under the **Mine** chip of the Shapes panel. A saved shape adds like any other (click it or press Enter, or drag it onto the workplane or a chosen plane) as a new copy, named as saved, standing at the middle of the workplane or where you drop it, and selected. Several objects must be grouped first. **Manage** (a switch in the Mine view) shows a rename and a delete on each tile; delete asks a second time. Saved shapes are plain files in `<data folder>/library/` like designs, and are not part of any design, so deleting one does not change the designs that used it |
| Text | The **Text** tile (Parametric) adds the words *Text* in 10 mm letters, 3 mm thick. With it selected, Properties has a **Text** box (type the words, Enter or click away: up to 100 characters, as one undo step) and a **Font** choice: **Sans** (Inter Bold), **Serif** (Noto Serif Bold), **Mono** (Roboto Mono Bold) and **Script** (Lobster), **Rounded** (Nunito Bold), **Condensed** (Oswald Bold), **Caps** (Bebas Neue), **Display** (Playfair Display Bold), **Handwriting** (Caveat Bold) and **Brush** (Pacifico), all SIL Open Font Licence and built into the app, so it works offline. Only Sans is loaded with the page: each other font is a small file of its own that is fetched the first time a design uses it (the first time you pick it, or when you open a design that has it), which keeps the first load about half the size. **Wrap radius** bends the words round a cylinder: the radius in mm, 0 for flat (the usual), a positive number round the outside of a cylinder that size (the middle of the line touches it and the ends curl away) and a negative one round the inside (the ends curl up). The Width stays the length of the line along the surface, the Height how thick the letters are, so a bent text is the same words at the same size; a radius too small for the words to fit round is raised to the least that does (they never go more than 330 degrees round, and it says so). A text that was resting on the workplane keeps resting on it. To put words on a real cylinder, turn the text upright (Rotate X 90, so its letters point up the cylinder), give it the cylinder's radius and put its base centre where it should touch; as a hole it cuts the words into the cylinder. There are no resize handles while the text is bent (type the Width, Depth and Height instead). Letters are Basic Latin and Latin-1 (accents like é and ü); anything else is skipped, and words with nothing to draw are refused. Changing the words or the font gives the shape the size of the new letters at the same letter size, and the shape then stretches like any other (Width, Depth and Height, or its handles; the letters stretch with it). Make it a **Hole** to cut words out of a block, group it, save it to the library, export it: it is real geometry, with the holes of letters like *o* and *e* left open. Words are saved in the design and stay editable |
| Group | Select two or more shapes and press **Group** or `Ctrl+G`. A group moves, nudges, duplicates, deletes, recolours and drops as one. A group is drawn as a single merged shape in the group's colour. Clicking any shape in it selects the whole group. Groups can be nested. A selected group has the three rotation rings (and Rotate X/Y/Z fields) and turns about the middle of what it holds, and the same resize and lift handles as a shape, working on the box around its contents: dragging one stretches every shape inside along with it, so the contents fill the new box exactly. Properties also has **Width**, **Depth** and **Height** fields for the group's box (along its own axes): typing one stretches everything inside the same way, keeping the middle and the base, as one undo step. The handles work along the group's own axes, however it is turned or tipped. While every shape inside is in quarter turns (0, 90, 180, 270 degrees) within the group, the shapes get their new sizes. If some shape is turned at another angle, rewriting the shapes would shear it, so the **group itself is stretched** instead (its holes are cut first, then everything is stretched, and the shapes inside are left as they were): that works the same way for you, but such a stretched group cannot be split back into shapes (**Ungroup** is off, and Properties says why; undo the stretch first) and cannot take new paint or edge chamfers and rounds. A group holding a thread, nut, washer or standoff starts **locked** (a fastener keeps its real size): Properties says so and has an **Unlock stretching** button. Unlocked, the handles and the size fields work, and the fastener is stretched with the group, so it may no longer fit a real screw or nut; **Lock stretching** puts the lock back. The unlock lasts for the editing session only (it is not saved with the design), and such a stretched group cannot be split back into shapes |
| Merge | Select two or more shapes (or one group) and press **Merge** in the top bar (or **Merge** on the bar over the view on a touch screen). They become **one solid**: the shapes' solids joined, and any hole among the selected shapes cut out of them, as in a group. It is one undo step, takes the place of the first shape in the Objects list, keeps its size and place and is named after the first shape with "merged". **Group keeps the parts editable; Merge does not**: the result is a model like an imported one (move, turn, resize, recolour, hole, group, export), but its shapes, edge treatments and paint are baked in and can no longer be changed one by one, so use Undo if you merged too early. The button says why it is off (fewer than two shapes, a shape locked or hidden, or nothing but holes selected); a model that is not a closed surface says which one when it is merged. |
| Duplicate and repeat | `Ctrl+D` copies the selection. Move, lift or turn the copy, then press `Ctrl+D` again: you get another copy that has had the same step applied again, and again on each press, so a row, a ring or a staircase takes a few key presses. Select something else and `Ctrl+D` starts over with a plain copy. Sizes are not part of the step |
| Hide and lock | Each row in the **Objects** list has a padlock and an eye. **Hide** takes an object out of the view, out of picking, Select all, Fit and the exports (and deselects it); **Show all** appears whenever something is hidden. **Lock** keeps an object where it is: moving, nudging, resizing, turning, recolouring, grouping and deleting skip it, but you can still select it and unlock it. A group's row has a **▸** that opens it to list what it holds, each part with its own padlock and eye (clicking a part's name selects its group). A hidden part is left out of the group's merged shape and of the exports, and a hidden hole does not cut. Both are saved with the design and are undoable |
| Engrave | The **Engrave** button (or **T**) puts lettering on the surface of any shape. Click a face (the top, a side, a curved wall: not one that points down), and the view turns to look straight at it, with everything else faded, as the Sketch tool does. The bar at the bottom has the **Words**, a **Font**, the **Letter size** (mm to the em, as for the Text shape), the **Depth** (or the **Height**, for raised lettering) and a **Turn** in degrees; click or drag on the surface to place the words, and a flat preview of them follows. **Engrave** cuts the words in, **Raised** stands them out of the surface. **Done** fits the words to the surface beneath them (each point is moved along the view direction onto the shape, so the cut follows a sphere, a cylinder or an imported model) and groups the result with the shape: an engraving is a hole in that group, raised lettering is joined to it. It reads the way you saw it, and is one undo step. The depth is measured along the view direction, so on a slope it is a little less into the surface itself, and the letters stretch on a part nearly edge-on to the view. The starting **Letter size** is chosen to fit the words "Text" on the shape you clicked (at most the usual 10 mm), and while you place the words the bar warns as soon as any of them go past the edge of the shape; if you press Done anyway it says so and leaves the tool open: make the letters smaller or move them. The result is an ordinary imported-model shape, and the preview shows the words flat, not fitted. **To change an engraving, select the group it is in and press Edit engraving** in Properties: the tool opens on the same face with the words, font, size, turn, depth and place it was made with (the old cut is hidden while you work), and Done fits it again in place of the old one, in one undo step. The engraving remembers its settings in the saved design, and follows the group when that is moved or turned (if the group has been stretched, the lettering is fitted afresh at the size you typed). It cannot be edited from inside another group: ungroup it first. Engravings made before this version have no settings to open. |
| X-ray | The **X-ray** button on the view toolbar opens a bar over the view (bottom left) for looking inside the design. **See through** draws solids faintly, so you can judge gaps and where parts meet (holes are always ghosts). **Cut away** takes off everything past a plane across Left to right, Front to back or Up and down, with a slider along the design: it starts at the far end, where nothing is cut, and sliding it towards the other end opens the design up (the faces of what is cut show from both sides, so you see the inside; the cut is not capped). It only changes how the view is drawn: not the design, not an export, not the picture on the designs list, and it is off at the start of every visit. On a phone or tablet the button is in the **Tools** menu. |
| Side panel | On a desktop screen, drag the thin edge between the 3D view and the side panel to make the panel wider or narrower (220 to 560 px), or focus the edge and use the Left and Right arrow keys (Shift for bigger steps, Home for the usual 260 px); a double click puts it back. Each section (Shapes, Properties, Resin, Arrange, Colours, Objects) has an arrow beside its heading that folds it to its heading and opens it again; clicking the heading does nothing. The width and the folded sections are remembered in this browser, not in the design; Resin starts folded until you open it. A phone or tablet keeps the panel as tabs (see above). |
| Ruler | **Ruler** in the view toolbar, or `R`: click a face of a shape or the workplane to start, hover to see a live distance and the offset on each axis (in your units), click again to pin it, click a third time to start over. On the bare workplane points snap to the grid; on a shape they are exact to 0.01 mm. Within 12 pixels of a sharp **corner**, the **middle** of a straight edge or an **edge** itself, the point jumps onto it exactly and a yellow marker shows which (a square, a triangle or a ring; corners win over middles, middles over edges), so corner to corner is exact. Only edges on the side you are looking at are caught. **Snap to corners and edges** in the readout turns it off (on to start, remembered in your browser). While it is on, the left button no longer selects or moves (dragging orbits). `Esc` clears it, then turns it off. Nothing is saved or exported |
| Workplane tool | **Workplane** in the view toolbar, or `W`, then click a face of a shape: a gridded amber square appears on it and new shapes (a click in the Shapes panel, or dragging one into the view) stand on that face, base on the surface and height going out of it, snapped to a grid measured from where you clicked. Click the floor with the tool on, or the **Floor** button, to go back. Undersides can't be built on, and a shape that would end up below the floor is lifted. The plane is not saved with the design. With a plane chosen, the **Arrange** panel has **Stand on plane**: select one shape or group and it is put on that face the way a new shape is (base on the surface, height going out, turned to match, under where its middle was, lifted if that would go below the floor), as one undo step. Dragging an existing shape still moves it on the floor |
| Chamfer | Boxes and cylinders have a **Chamfer** field in Properties: a 45 degree bevel of that many mm, on **All** edges, only the **Top** ones, or only the **Bottom** ones (handy against elephant's foot when printing). The outside size stays the same and the bevel stays the same size in mm when you resize the shape; if it no longer fits it is limited (and Properties says so) until the shape is big enough again. Chamfered shapes cut, group, turn and export like any other. 0 removes it |
| Countersink | A **cylinder set to Hole** has a **Countersink** field in Properties: how far (mm) its opening widens on every side, a 45 degree flare so a screw head sits flush, at the **Top**, **Bottom** or **Both** ends (Top to start). It cuts like any hole in a group, and shows on the hole's ghost before you group it. It is limited to the hole's length (half of it each when both ends flare, and Properties says so). It replaces a chamfer typed on the same hole, which Properties notes. 0 removes it |
| Edge tool | Select one solid shape or group (including one with holes cut in it), then **Edges** in the view toolbar, or `E`: its sharp edges are drawn over the view. Click an edge to choose it (`Shift`-click adds or drops more; on a touch screen every tap adds), or **All outer edges**. Pick **Chamfer** or **Round** and a **Size** in mm (it starts at about 5% of the part, on the grid) and the result shows straight away. **Apply** keeps it as one undo step; **Cancel** or `Esc` leaves the part as it was (and still selected); a second `Esc` turns the tool off. Treated edges show dashed; choose one to change its size or kind, or **Remove** it. Resizing a treated shape or group (typing, or dragging a handle) stretches its chamfers and rounds with it, at the same size. If another edit takes away a treated edge, a notice says so instead of cutting the wrong place. Inside (concave) corners can't be filled yet |
| Sketch | **Sketch** in the view toolbar, or `K`: the view turns to look straight at the plane you are drawing on (the floor, or a face chosen with the Workplane tool, so you can sketch on a wall or a top), everything else is shown faded, and a bar of tools opens. **Rectangle** (drag corner to corner), **Circle** (drag from the centre out) and **Polygon** (drag from the centre to a corner; the **Sides** number sets 3 to 32) draw an outline; **Line** clicks out points one after another and closes by clicking the first point again, or `Enter` (`Backspace` takes the last point back, `Esc` cancels the line); **Select** picks an outline (click it: an outline inside another is a hole, and the smaller one is picked first), drags a corner to reshape it or the body to move it, and `Delete` removes the selection (a corner, while the outline keeps three). **Snap to grid** (1 mm, measured from the plane's origin) is on to start. Outlines lying inside others are **holes** (even-odd, so one inside a hole is solid again). `Ctrl+Z` / `Ctrl+Shift+Z` undo and redo the drawing. Type the **Extrude height** (mm) and press **Finish**: the view goes back to how it was and a **Sketch** shape stands on the plane, that thick, selected. It is an ordinary shape (move, resize, turn, flip, hole, group, library, every export), and its drawing stretches evenly when you resize it. Select it and press **Edit sketch** in Properties to draw it again (what you resized or flipped it to is part of the drawing now). **Arc** clicks out a path of circular arcs: the start, then for each arc a point it passes through and its end (clicking back on the start closes the outline with that arc, `Enter` closes it with a straight side, so a start, a point through and an end make a D). **Spline** clicks points and draws a smooth curve through all of them, closed by clicking the first point or `Enter`. With an outline selected, every side has a small diamond in its middle: drag it to **bend** the side into an arc through where you drop it (drag it back onto the line to straighten it; `Delete` straightens the selected side), and **Straighten sides** and **Smooth corners** (a smooth curve through the corners) in the bar change the whole outline. A **circle** is two true half circles. Curves are cut into short straight pieces only when the shape is built and exported (never more than 0.02 mm from the true curve), and stretching a sketch stretches its curves exactly (a circle made wider is an ellipse). Revolve and dragging by touch (a finger orbits the view) are not built yet |
| Paint | **Paint** in the view toolbar, or `N`, opens a bar like OrcaSlicer's colour painting: pick a **filament** (a numbered swatch of the design's palette, or its number key `1` to `9`), pick **Smart fill** or **Bucket fill**, and click a face of any shape or group. **Smart fill** paints the face you click and the faces joined to it that turn no more than the **Smart fill angle** (0 to 90 degrees, 30 to start, `Ctrl` + wheel changes it): a flat face, or a curved surface up to a sharp edge. **Bucket fill** paints everything joined to the click that is currently the same colour (on a plain shape that is the whole shape). **Shift**+click erases the paint under the click (back to the shape's own colour), and **Erase all** clears the paint on the selected shapes. **Done** or `Esc` leaves the tool; each click is one undo step. Paint is kept on the shape (it is saved with the design), as a fill that is found again on the shape's surface, so it follows the shape when it is moved, turned or resized (including a group or text), and a fill whose face has gone, say because a hole now cuts through it, paints nothing rather than the wrong place. Changing a palette colour changes the paint in it too. Locked shapes, holes and the parts inside a group are not painted (paint the group). **Export as 3MF for OrcaSlicer** writes the paint as `paint_color` on the painted triangles, so OrcaSlicer, Bambu Studio and Trident show it as colour painting with the same filaments (checked against the real OrcaSlicer engine); STL, OBJ and the plain 3MF have no place for it. The **Brush** paints as you drag (a plain click puts one dab down): pick its **shape**, **Circle** (a disc across the face it is put on: it stays on that face and does not reach through a thin plate), **Sphere** (a ball: it wraps round edges and thin walls) or **Triangles** (just the one triangle under the pointer), and its **size** (the diameter, 1 to 60 mm; `Ctrl` + wheel changes it; a ring on the surface shows how far it reaches). The left button paints, the right button still turns the view, and `Shift` erases. The surface is cut finer under the brush so the paint follows its edge, in the design's exports too (OrcaSlicer gets the finer triangles, each with its filament). A brush needs a mouse (a finger has to turn the view); Smart and Bucket fill work by touch. **Height range** paints a flat band right round the shape: click at a height and everything from there up by the **Height range** setting (0.1 to 50 mm, `Ctrl` + wheel changes it) is painted, across the whole surface (the sides, and the top or bottom if they lie within it), with straight edges (the surface is cut along the band's two planes); it goes by the world's up, so on a turned shape the band still runs level, and a translucent slab shows where it will go. `Shift`+click erases a band. **Gap fill** tidies what is left over: select the shapes and press **Apply**, and every patch of one colour (or bare surface) smaller than the **Gap area** (0 to 5 mm2, `Ctrl` + wheel changes it) is merged into the neighbour it shares the most edge with, repeating until nothing small is left to join, as one undo step, so specks and slivers a brush left behind go. Gap fill only tidies the paint before it, so paint added afterwards stays. Touch painting with the brush is not built yet |
| Align | Select two or more objects and use the **Arrange** panel: for X, Y or Z, line up their low edges, centres or high edges at wherever the whole selection reaches. Locked objects stay put. One undo step |
| Flip | **Flip X / Y / Z** in the Arrange panel mirrors the selection across a plane through the middle of everything selected (one object flips in place, several swap sides). Groups flip with their contents. Imported models flip too, as a true mirror image (not a turned copy): the stored model is shown reversed in its own x, so flipping twice gives the original back. Threads flip as a turned copy (a right-hand thread stays right-handed) |
| Ungroup | **Ungroup** or `Ctrl+Shift+G` opens a group one level, leaving every shape exactly where it was. Ungrouping a hole group turns its contents into holes |
| Duplicate / delete | `Ctrl+D` / `Delete`, or the buttons in the Properties panel |
| Undo / redo | `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`), or the Undo and Redo buttons. A whole drag is one step |
| Orbit | Right-drag. **Touch:** drag one finger on empty space |
| Pan | Middle-drag, or Shift + right-drag. **Touch:** slide two fingers |
| Zoom | Mouse wheel. **Touch:** pinch with two fingers |
| Home view | **Home** button or the `Home` key |
| Fit all | **Fit** button or `F` |
| Perspective / orthographic | **Ortho** toggle |
| Look from a side | Click a visible face of the view cube, or use the **View…** menu |

## Run it

### Docker

Run the published image (amd64):

```bash
docker run -d --name holecraft -p 8080:8080 -v holecraft-data:/data mugenoesis/holecraft:0.5.0
# open http://<host>:8080
```

Or build it yourself from a clone:

```bash
docker compose -f docker/compose.yaml up -d --build
# open http://<host>:8080
```

Designs are stored in the `/data` volume. Environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `HOLECRAFT_PORT` | `8080` | HTTP port |
| `HOLECRAFT_HOST` | `0.0.0.0` | Bind address |
| `HOLECRAFT_DATA_DIR` | `/data` | Storage directory |

There is no authentication yet, so anyone who can reach the port can read, change and delete every
design. Only expose Holecraft on a trusted network.

**Storage API** (used by the app; handy for backups and scripts): `GET /api/designs`,
`POST /api/designs`, `GET|PUT|PATCH|DELETE /api/designs/:id` `POST /api/designs/:id/duplicate`, `GET /api/designs/:id/versions` and `POST /api/designs/:id/versions/:version/restore`. Files sent by the browser add-on wait in an inbox: `POST /api/import` (the file as `application/vnd.holecraft.import`, its name URL-encoded in `x-file-name`, and the header `x-holecraft-import: 1`, which a web page cannot add to a request to this server) answers `{ id, openUrl: "/import/<id>" }`, and `GET|DELETE /api/import/:id` read and forget it. Opening `/import/<id>` in the editor makes a new design named for the file with the model in it (a zip with several models asks which to open, and puts them in a row); the file is deleted from the server then, or after a day if it is never opened (at most 20 wait at once).
Everything sent to it is validated, and a design larger than 8 MB or with a broken structure is
refused.
Serve it at the root of a host or subdomain (`holecraft.example.lan`). Path prefixes such as
`example.lan/holecraft` are not supported yet.

**Unraid:** set `user: "99:100"` and map `/mnt/user/appdata/holecraft` to `/data` (see
`docker/compose.yaml`).

### Desktop (Linux)

```bash
scripts/package-desktop.sh
# → apps/desktop/release/Holecraft-<version>-x86_64.AppImage and Holecraft-<version>-amd64.deb
```

The desktop app stores designs in `$XDG_DATA_HOME/holecraft` (usually `~/.local/share/holecraft`).

## Develop

Requirements: Node 22+, npm, and Docker (for integration tests and packaging).

```bash
npm install
npm run dev          # server on :8080 + Vite on :5173 (open http://localhost:5173)
npm test             # unit tests (Vitest)
npm run test:e2e     # integration tests (Playwright, in Docker)
npm run check        # full gate: typecheck + unit + build + web e2e
FULL=1 npm run check # + Docker smoke test + desktop package + desktop e2e
```

Holecraft is developed **test-first**. Every feature lands with unit tests, plus integration tests
where it touches the UI, server, or packaging. See [AGENTS.md](AGENTS.md) for conventions.

### Layout

```
apps/web        Browser editor: React UI + imperative three.js viewport (Vite)
apps/server     Fastify server: serves the web app and the storage API (bundled with esbuild)
apps/desktop    Electron shell that embeds the same server on 127.0.0.1
apps/addon      Firefox add-on that sends a download from MakerWorld, Printables or Thingiverse to Holecraft or Trident
packages/core   Document model and editor logic, with no DOM dependencies
e2e/            Playwright integration tests (web + packaged desktop app)
docker/         Dockerfile and compose file
scripts/        Repeatable dev/test/packaging tasks
```

### Scripts

| Script | Purpose |
|---|---|
| `scripts/check.sh` | Pre-commit gate (`FULL=1` for packaging too) |
| `scripts/install-hooks.sh` | Use the git hooks in `.githooks/` (pre-commit: lint, knip, typecheck, unit tests; pre-push: `scripts/check.sh`, with `FULL=1` / `AUDIT=1` for more). Stands in for CI while GitHub Actions is unavailable |
| `scripts/e2e.sh` | Playwright tests in the Playwright Docker image |
| `scripts/docker-smoke.sh` | Build the image (or, with `SKIP_BUILD=1`, take one already built), run it, verify health, the non-root user and that `/app` is readable by user 99:100 |
| `scripts/release-docker.sh` | Build the release image (`mugenoesis/holecraft:<version>` and `latest`), smoke-test it, and push it to Docker Hub with `PUSH=1` |
| `scripts/release-desktop.sh` | Build the AppImage and .deb for the release version, check them, write `SHA256SUMS.txt`, and attach them to the GitHub release with `UPLOAD=1` |
| `scripts/package-addon.sh` | Build the Firefox add-on and the zip to have signed |
| `scripts/package-desktop.sh` | Build the AppImage and .deb (in a Debian container) |
| `npm run knip` | Unused files, exports and dependencies (fails the gate) |
| `npm run coverage` | Unit tests with coverage; per-package floors in `vitest.config.ts` fail the gate, HTML report in `coverage/` |
| `scripts/audit.sh` (`npm run audit:deps`) | Dependency vulnerabilities: anything that ships must be clean, build tools are only reported |
| `scripts/docker-lint.sh [image]` | hadolint on the Dockerfile and trivy on its configuration and the built image (HIGH/CRITICAL with a fix fail it) |
| `npm run lint` / `npm run format` | Biome: check formatting, lint rules and the complexity limit (15 per function); `format` fixes what it can. `scripts/check.sh` runs `lint` first |
| `scripts/verify-orca-export.sh` | Write the OrcaSlicer-flavoured 3MF and have the real OrcaSlicer engine (from the local Trident image, in throwaway containers) slice it and load it, checking it does not crash and keeps every object's filament, the palette and the painted triangles |
| `scripts/update-orca-filament-defaults.sh` | Regenerate `orcaFilamentDefaults.ts` (the per-filament project settings) from the real engine; run after changing the Trident/OrcaSlicer version |
| `scripts/verify-exports.sh` | Write sample STL/OBJ/3MF files with the real writers and check them with an independent mesh library (trimesh, in a Python container) |
| `scripts/deploy-local.sh` | Rebuild the Docker image from `origin/main` and restart the local test container (default port 8200, keeps its data volume) |
| `scripts/screenshot.sh` | Screenshot a running instance with software WebGL (`DEMO=1` adds shapes, `VIEW=top` picks a view, `CLICK=0,0` selects, `PRESS=Control+a` presses keys) |
| `scripts/tool-shots.sh <url> [out-dir]` | Drive the ruler, the Workplane tool and the Edge tool in a real browser and save screenshots (ruler line, plane marker and a shape on a top face and on a wall, edges hovered, chosen, previewed and applied) for looking at what the browser tests only check by numbers |
| `scripts/make-fonts.sh` | Rebuild the bundled Text fonts (`packages/core/src/fonts/outlines/*.generated.ts`, one file per font, and `fontIndex.generated.ts`: outlines, widths and boxes of Basic Latin and Latin-1 for ten open fonts) and the licence texts in `licenses/` from the `@fontsource` dev dependencies. Only needed when a font changes |
| `scripts/make-icon.sh` | Regenerate the app icons from the cube mark cropped out of `branding/logo.jpg` |

## Reporting a problem

The keyboard shortcut sheet (the **?** button, or the key) and the foot of the designs list have **Report a problem**: it opens a new issue on GitHub in your own browser with the Holecraft version, browser, platform and screen size already filled in, and headings for what happened and what you expected. Nothing is sent from your server or your design, and a page cannot attach a screenshot for you, so drag one into the issue. **Copy diagnostics** puts the same details on the clipboard, with the last few errors the page hit (messages only, since the page was opened); there is no design data in it. Where the browser will not allow clipboard access (a page opened over plain http from another computer), the text is shown in a box to copy by hand.

## Support the project

Holecraft is free and I build it in my spare time. If it saves you time or gets your next print designed, you can
[buy me a coffee on Ko-fi](https://ko-fi.com/mugenoesis). Bug reports and ideas are welcome as GitHub issues.

## License

[AGPL-3.0](LICENSE). If you run a modified Holecraft as a network service, you must share your
changes.
