import { useEffect, useRef, useState } from 'react';
import { Viewport } from './Viewport.ts';

interface Props {
  width: number;
  depth: number;
}

/** React host for the imperative three.js viewport. */
export function ViewportCanvas({ width, depth }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // WebGL can be missing (VMs, blocked GPU drivers); keep the rest of the UI alive.
    let viewport: Viewport;
    try {
      viewport = new Viewport(container, { workplaneWidth: width, workplaneDepth: depth });
    } catch (err) {
      console.warn('Viewport failed to start:', err);
      setFailed(true);
      return;
    }
    setFailed(false);
    return () => viewport.dispose();
  }, [width, depth]);

  return (
    <div ref={containerRef} className="viewport" data-testid="viewport">
      {failed && (
        <div className="viewport-error" role="alert">
          <strong>The 3D view could not start.</strong>
          <p>Holecraft needs WebGL 2. Enable hardware acceleration in your browser, or update your graphics drivers.</p>
        </div>
      )}
    </div>
  );
}
