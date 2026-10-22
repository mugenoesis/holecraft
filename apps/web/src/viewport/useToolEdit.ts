import { useEffect, useRef } from 'react';
import type { SurfaceTool } from './surfaceTool.ts';

/**
 * A Properties button (Edit sketch, Edit engraving) turns a tool on for one thing: `editing` is true while there is such a thing, and turns the tool
 * on; leaving the tool by any way (`tool` is no longer `name`) lets go of it through `letGo`.
 */
export function useToolEdit(
	editing: boolean,
	tool: SurfaceTool | null,
	name: SurfaceTool,
	setTool: (tool: SurfaceTool | null) => void,
	letGo: () => void,
) {
	useEffect(() => {
		if (editing) setTool(name);
	}, [editing, name, setTool]);
	const wasOn = useRef(false);
	useEffect(() => {
		if (wasOn.current && tool !== name) letGo();
		wasOn.current = tool === name;
	}, [tool, name, letGo]);
}
