import type { Design, MeshData, NodeId } from '@holecraft/core';
import { useEffect, useRef, useState } from 'react';
import { ExportMenuItems } from './ExportMenuItems.tsx';
import { ExportCancelled, type ExportFormat, exportDeps, hasExportableShapes, onlySelected, runExport } from './exportDesign.ts';
import { useBelowPlane } from './useBelowPlane.tsx';

/** The "Export" button and its menu of file formats, for the top bar. */
export function ExportMenu({
	design,
	selection,
	meshes,
}: {
	design: Design;
	selection: readonly NodeId[];
	meshes: ReadonlyMap<string, MeshData>;
}) {
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	const [selectedOnly, setSelectedOnly] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const belowPlane = useBelowPlane();
	const canExport = hasExportableShapes(design);

	// The choice only makes sense while something is selected; otherwise export everything.
	const picked = selection.length > 0 ? onlySelected(design, selection) : null;
	const usingSelection = selectedOnly && picked !== null;

	// Close on Escape, or on a click anywhere outside the menu.
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
		const onPointer = (e: PointerEvent) => {
			if (!root.current?.contains(e.target as Node)) setOpen(false);
		};
		window.addEventListener('keydown', onKey);
		window.addEventListener('pointerdown', onPointer);
		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('pointerdown', onPointer);
		};
	}, [open]);

	const start = async (format: ExportFormat) => {
		setOpen(false);
		setBusy(true);
		setProblem(null);
		try {
			await runExport(usingSelection ? picked : design, format, exportDeps(meshes, belowPlane.ask));
		} catch (error) {
			if (!(error instanceof ExportCancelled)) setProblem(error instanceof Error ? error.message : 'The export failed');
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="export-menu" ref={root}>
			<button
				type="button"
				aria-haspopup="menu"
				aria-expanded={open}
				disabled={!canExport || busy}
				title={canExport ? 'Download this design as a file for printing' : 'Add a solid shape to export'}
				onClick={() => setOpen((o) => !o)}
			>
				{busy ? 'Exporting…' : 'Export'}
			</button>

			{open && (
				<div className="menu">
					{picked && (
						<label className="menu-option">
							<input type="checkbox" checked={selectedOnly} onChange={(e) => setSelectedOnly(e.target.checked)} />
							Only the selected ({selection.length})
						</label>
					)}
					<ExportMenuItems
						source={usingSelection ? picked : design}
						meshes={meshes}
						onFormat={(format) => void start(format)}
						onSent={() => setOpen(false)}
						askBelowPlane={belowPlane.ask}
					/>
				</div>
			)}

			{belowPlane.dialog}

			{problem && (
				<span className="export-problem" role="alert">
					{problem}
				</span>
			)}
		</div>
	);
}
