import type { UpAxis } from '@holecraft/core';
import { useRef, useState } from 'react';
import { IMPORT_ACCEPT, type ImportedModel, importModelObjects } from './importModel.ts';
import { browserStorage, readUpAxis, writeUpAxis } from './importUpAxis.ts';
import { uploadMesh } from './meshApi.ts';
import { extrudeSvg } from './svgExtruder.ts';

/** The "Import" button: pick an STL, OBJ, 3MF or SVG file and it becomes a shape in the design (a 3MF with several objects, a shape for each). */
export function ImportButton({ onImported }: { onImported: (model: ImportedModel) => void }) {
	const picker = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	// which of a file's axes is up: Z for most files, Y for what many modellers make (kept for next time)
	const [up, setUp] = useState<UpAxis>(() => readUpAxis(browserStorage()));

	const importFile = async (file: File) => {
		setBusy(true);
		setProblem(null);
		try {
			onImported(await importModelObjects(file, { upload: uploadMesh, extrudeSvg }, { up }));
		} catch (error) {
			setProblem(error instanceof Error ? error.message : 'The import failed');
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="import-button">
			<button
				type="button"
				disabled={busy}
				title="Bring in an STL, OBJ, 3MF or SVG file as a shape (an SVG is extruded 5 mm to start)"
				onClick={() => picker.current?.click()}
			>
				{busy ? 'Importing…' : 'Import'}
			</button>
			<select
				aria-label="Up axis for imports"
				title="Which way is up in the files you import: Z for most CAD, STL and 3MF files, Y for many OBJ files (it stands the model upright)"
				value={up}
				onChange={(e) => {
					const next = e.target.value === 'y' ? 'y' : 'z';
					setUp(next);
					writeUpAxis(browserStorage(), next);
				}}
			>
				<option value="z">Z up</option>
				<option value="y">Y up</option>
			</select>
			<input
				ref={picker}
				type="file"
				accept={IMPORT_ACCEPT}
				hidden
				aria-label="Choose a model file to import"
				data-testid="import-file"
				onChange={(e) => {
					const file = e.target.files?.[0];
					e.target.value = ''; // so choosing the same file again still counts
					if (file) void importFile(file);
				}}
			/>
			{problem && (
				<span className="export-problem" role="alert">
					{problem}
				</span>
			)}
		</div>
	);
}
