import type { MeshData, MeshShapeInput } from '@holecraft/core';
import { useRef, useState } from 'react';
import { IMPORT_ACCEPT, importModelFile } from './importModel.ts';
import { uploadMesh } from './meshApi.ts';

/** The "Import" button: pick an STL, OBJ or 3MF file and it becomes a shape in the design. */
export function ImportButton({ onImported }: { onImported: (input: MeshShapeInput, mesh: MeshData) => void }) {
	const picker = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);

	const importFile = async (file: File) => {
		setBusy(true);
		setProblem(null);
		try {
			const { input, mesh } = await importModelFile(file, { upload: uploadMesh });
			onImported(input, mesh);
		} catch (error) {
			setProblem(error instanceof Error ? error.message : 'The import failed');
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="import-button">
			<button type="button" disabled={busy} title="Bring in an STL, OBJ or 3MF file as a shape" onClick={() => picker.current?.click()}>
				{busy ? 'Importing…' : 'Import'}
			</button>
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
