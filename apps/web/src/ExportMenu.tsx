import type { Design } from '@holecraft/core';
import { useEffect, useRef, useState } from 'react';
import { EXPORT_FORMATS, hasExportableShapes, runExport, type ExportFormat } from './exportDesign.ts';

/** The "Export" button and its menu of file formats, for the top bar. */
export function ExportMenu({ design }: { design: Design }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const canExport = hasExportableShapes(design);

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
      await runExport(design, format);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'The export failed');
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
        <div className="menu" role="menu" aria-label="Export format">
          {EXPORT_FORMATS.map((f) => (
            <button key={f.id} type="button" role="menuitem" aria-label={`Export as ${f.label}`} onClick={() => void start(f.id)}>
              <strong>{f.label}</strong>
              <span className="muted">{f.hint}</span>
            </button>
          ))}
        </div>
      )}

      {problem && (
        <span className="export-problem" role="alert">
          {problem}
        </span>
      )}
    </div>
  );
}
