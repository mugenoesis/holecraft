import { useEffect, useRef, useState } from 'react';
import { ChooseModels } from './ChooseModels.tsx';
import { createDesign, saveDesign } from './designsApi.ts';
import { importModelObjects } from './importModel.ts';
import { browserStorage, readUpAxis } from './importUpAxis.ts';
import { deleteInboxFile, fetchInboxFile } from './inboxApi.ts';
import { buildDesignFrom, MAX_AUTO_SELECT, type ModelFile, type Opened, openInboxFile, readingMessage } from './inboxImport.ts';
import { uploadMesh } from './meshApi.ts';
import { NotFound } from './NotFound.tsx';
import { designPath, navigate } from './router.ts';
import { extrudeSvg } from './svgExtruder.ts';

type State = { kind: 'working'; text: string } | { kind: 'choosing'; id: string; opened: Opened } | { kind: 'failed'; message: string };

/** Reads a model and stores it, with the axis the user last chose for imports. */
const importOne = (file: ModelFile) =>
	importModelObjects(
		{
			name: file.name,
			size: file.bytes.length,
			arrayBuffer: async () => file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) as ArrayBuffer,
		},
		{ upload: uploadMesh, extrudeSvg },
		{ up: readUpAxis(browserStorage()) },
	);

/** Makes the design from the models, forgets the file on the server, and goes to the design. */
async function openDesign(id: string, title: string, files: readonly ModelFile[]): Promise<void> {
	const design = await buildDesignFrom(title, files, { importOne, create: createDesign, save: saveDesign });
	await deleteInboxFile(id);
	navigate(designPath(design.id), { replace: true });
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong');

/**
 * `/import/<id>`: a model file the browser add-on sent to this server. It is read, becomes a shape in a new design (a zip with several models asks
 * which first) and the design opens.
 */
export function ImportInbox({ id }: { id: string }) {
	const [state, setState] = useState<State>({ kind: 'working', text: 'Opening the model…' });
	const [selected, setSelected] = useState<string[]>([]);
	// the work makes a design, so it must run once even where effects run twice
	const started = useRef(false);

	useEffect(() => {
		if (started.current) return;
		started.current = true;
		void (async () => {
			try {
				const file = await fetchInboxFile(id);
				// the work below holds the page, so the message is drawn first
				setState({ kind: 'working', text: readingMessage(file.bytes.length) });
				await new Promise<void>((resolve) => setTimeout(resolve, 50));
				const opened = await openInboxFile(file);
				if (opened.kind === 'models') return await openDesign(id, opened.title, opened.files);
				setSelected(opened.files.length <= MAX_AUTO_SELECT ? opened.files.map((f) => f.name) : []);
				setState({ kind: 'choosing', id, opened });
			} catch (error) {
				setState({ kind: 'failed', message: messageOf(error) });
			}
		})();
	}, [id]);

	if (state.kind === 'failed') return <NotFound heading="This file could not be opened">{state.message}</NotFound>;
	if (state.kind === 'working') return <main className="screen-message muted">{state.text}</main>;

	const { opened } = state;
	const open = async () => {
		setState({ kind: 'working', text: 'Opening the models…' });
		try {
			await openDesign(
				state.id,
				opened.title,
				opened.files.filter((f) => selected.includes(f.name)),
			);
		} catch (error) {
			setState({ kind: 'failed', message: messageOf(error) });
		}
	};
	return (
		<ChooseModels
			title={opened.title}
			names={opened.files.map((f) => f.name)}
			selected={selected}
			busy={false}
			onToggle={(name) => setSelected((s) => (s.includes(name) ? s.filter((n) => n !== name) : [...s, name]))}
			onAll={() => setSelected(opened.files.map((f) => f.name))}
			onNone={() => setSelected([])}
			onOpen={() => void open()}
		/>
	);
}
