import { viewRotation, type OrbitState, type ViewPresetName } from '@holecraft/core';
import { viewCubeMatrix } from './viewCube.ts';

type Face = Extract<ViewPresetName, 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'>;

const FACES: ReadonlyArray<{ id: Face; label: string }> = [
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'right', label: 'Right' },
  { id: 'left', label: 'Left' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
];

interface Props {
  camera: OrbitState;
  onSelect: (view: ViewPresetName) => void;
}

/** A small cube that mirrors the camera orientation; click a visible face to look from that side. */
export function ViewCube({ camera, onSelect }: Props) {
  return (
    <div className="view-cube" role="group" aria-label="View cube">
      <div className="view-cube-body" data-testid="view-cube-body" style={{ transform: viewCubeMatrix(viewRotation(camera)) }}>
        {FACES.map(({ id, label }) => (
          <button key={id} type="button" className={`view-cube-face ${id}`} aria-label={`${label} view`} onClick={() => onSelect(id)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
