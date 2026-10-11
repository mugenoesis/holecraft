import { HOME_VIEW, cameraPosition, type OrbitState } from '@holecraft/core';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { CameraRig, FOV_DEG, type Projection } from './CameraRig.ts';

let onChange: Mock<(state: OrbitState, projection: Projection) => void>;
let rig: CameraRig;

beforeEach(() => {
  onChange = vi.fn<(state: OrbitState, projection: Projection) => void>();
  rig = new CameraRig(onChange);
  rig.resize(1000, 800);
  onChange.mockClear();
});

function expectCameraAt(state: OrbitState) {
  const p = cameraPosition(state);
  expect(rig.active.position.x).toBeCloseTo(p[0], 5);
  expect(rig.active.position.y).toBeCloseTo(p[1], 5);
  expect(rig.active.position.z).toBeCloseTo(p[2], 5);
}

describe('CameraRig basics', () => {
  it('starts at the home view in perspective', () => {
    expect(rig.state).toEqual(HOME_VIEW);
    expect(rig.projection).toBe('perspective');
    expect(rig.active).toBeInstanceOf(THREE.PerspectiveCamera);
    expectCameraAt(HOME_VIEW);
  });

  it('is Z-up and looks at the target', () => {
    expect(rig.active.up.toArray()).toEqual([0, 0, 1]);
    const dir = new THREE.Vector3();
    rig.active.getWorldDirection(dir);
    const toTarget = new THREE.Vector3(...rig.state.target).sub(rig.active.position).normalize();
    expect(dir.distanceTo(toTarget)).toBeLessThan(1e-6);
  });

  it('keeps the aspect ratio in sync with the viewport size', () => {
    rig.resize(500, 250);
    expect((rig.active as THREE.PerspectiveCamera).aspect).toBeCloseTo(2);
  });

  it('notifies on every change', () => {
    rig.zoomBy(0.9);
    rig.orbitBy(10, 10);
    rig.panBy(5, 5);
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith(rig.state, 'perspective');
  });
});

describe('CameraRig input', () => {
  it('dragging right swings the camera to the left of the scene (azimuth decreases)', () => {
    const before = rig.state.azimuth;
    rig.orbitBy(100, 0);
    expect(rig.state.azimuth).toBeLessThan(before);
    expectCameraAt(rig.state);
  });

  it('dragging down raises the camera (polar decreases)', () => {
    const before = rig.state.polar;
    rig.orbitBy(0, 100);
    expect(rig.state.polar).toBeLessThan(before);
  });

  it('zooms by a factor', () => {
    rig.zoomBy(0.5);
    expect(rig.state.distance).toBeCloseTo(HOME_VIEW.distance * 0.5);
  });

  it('pans using the viewport height for scale', () => {
    rig.panBy(100, 0);
    expect(rig.state.target[0]).not.toBe(0);
    expect(rig.state.azimuth).toBe(HOME_VIEW.azimuth);
  });
});

describe('CameraRig projection', () => {
  it('switches to an orthographic camera that frames the same area at the target', () => {
    rig.setProjection('orthographic');
    expect(rig.projection).toBe('orthographic');
    const cam = rig.active as THREE.OrthographicCamera;
    expect(cam).toBeInstanceOf(THREE.OrthographicCamera);
    const halfHeight = HOME_VIEW.distance * Math.tan((FOV_DEG * Math.PI) / 360);
    expect(cam.top).toBeCloseTo(halfHeight);
    expect(cam.right).toBeCloseTo(halfHeight * (1000 / 800));
    expectCameraAt(HOME_VIEW);
  });

  it('zooming rescales the orthographic frustum', () => {
    rig.setProjection('orthographic');
    const top = (rig.active as THREE.OrthographicCamera).top;
    rig.zoomBy(0.5);
    expect((rig.active as THREE.OrthographicCamera).top).toBeCloseTo(top * 0.5);
  });

  it('notifies when the projection changes', () => {
    rig.setProjection('orthographic');
    expect(onChange).toHaveBeenLastCalledWith(rig.state, 'orthographic');
  });
});

describe('CameraRig.goTo', () => {
  const dest: OrbitState = { target: [10, 20, 30], azimuth: 1, polar: 0.5, distance: 100 };

  it('jumps immediately without animation', () => {
    rig.goTo(dest, { animate: false });
    expect(rig.state).toEqual(dest);
    expect(rig.isAnimating).toBe(false);
    expectCameraAt(dest);
  });

  it('animates, ending exactly on the destination', () => {
    rig.goTo(dest);
    expect(rig.isAnimating).toBe(true);
    expect(rig.advance(0)).toBe(true);
    expect(rig.advance(110)).toBe(true);
    const mid = rig.state;
    expect(mid.distance).toBeGreaterThan(Math.min(HOME_VIEW.distance, dest.distance));
    expect(mid.distance).toBeLessThan(Math.max(HOME_VIEW.distance, dest.distance));
    expect(rig.advance(10_000)).toBe(false);
    expect(rig.state).toEqual(dest);
    expect(rig.isAnimating).toBe(false);
  });

  it('takes the short way round the azimuth', () => {
    rig.goTo({ ...HOME_VIEW, target: [0, 0, 0], azimuth: 3 }, { animate: false });
    rig.goTo({ ...HOME_VIEW, target: [0, 0, 0], azimuth: -3 });
    rig.advance(0);
    rig.advance(110);
    // Short way is through ±π (a gap of ~0.28 rad), not back through 0.
    expect(Math.abs(rig.state.azimuth)).toBeGreaterThan(2.9);
    rig.advance(10_000);
    expect(rig.state.azimuth).toBe(-3);
  });

  it('is cancelled by user input', () => {
    rig.goTo(dest);
    rig.advance(0);
    rig.orbitBy(10, 0);
    expect(rig.isAnimating).toBe(false);
  });

  it('does not alias the state it was given', () => {
    const d: OrbitState = { target: [1, 2, 3], azimuth: 0, polar: 1, distance: 50 };
    rig.goTo(d, { animate: false });
    d.target[0] = 99;
    expect(rig.state.target[0]).toBe(1);
  });
});
