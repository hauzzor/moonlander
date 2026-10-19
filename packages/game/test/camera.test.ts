import { describe, expect, it } from "vitest";
import type { SimState } from "@moonlander/sim";
import {
  CAMERA_RESPONSE,
  cameraTarget,
  createCamera,
  snapCamera,
  updateCamera,
  worldToScreen,
} from "../src/camera";

function makeState(
  position: SimState["ship"]["position"] = { x: 0, y: 0 },
  velocity: SimState["ship"]["velocity"] = { x: 0, y: 0 },
): SimState {
  return {
    tick: 0,
    time: 0,
    seed: 1,
    ship: { position, velocity, angle: 0, angularVelocity: 0 },
    hull: 100,
    invulnerable: false,
    thrusters: { left: false, right: false },
    outcome: "flying",
    score: 0,
    progress: 0,
  };
}

describe("camera helpers", () => {
  it("creates an uninitialized camera at the origin", () => {
    expect(createCamera()).toEqual({ x: 0, y: 0, ready: false });
  });

  describe("cameraTarget", () => {
    it("adds the documented vertical offset with zero velocity", () => {
      expect(cameraTarget(makeState({ x: 12, y: -4 }))).toEqual({ x: 12, y: 4 });
    });

    it("adds positive velocity look-ahead to the ship position", () => {
      expect(
        cameraTarget(makeState({ x: 10, y: 20 }, { x: 20, y: 25 })),
      ).toEqual({ x: 17, y: 32 });
    });

    it("adds negative velocity look-ahead to the ship position", () => {
      expect(
        cameraTarget(makeState({ x: 10, y: 20 }, { x: -20, y: -25 })),
      ).toEqual({ x: 3, y: 24 });
    });

    it("clamps positive and negative look-ahead at both axis limits", () => {
      expect(
        cameraTarget(makeState({ x: 10, y: 20 }, { x: 1000, y: 1000 })),
      ).toEqual({ x: 65, y: 54 });
      expect(
        cameraTarget(makeState({ x: 10, y: 20 }, { x: -1000, y: -1000 })),
      ).toEqual({ x: -45, y: 2 });
    });
  });

  it("snaps to the camera target and marks the camera ready", () => {
    const camera = createCamera();

    snapCamera(camera, makeState({ x: 5, y: 9 }, { x: 10, y: -10 }));

    expect(camera).toEqual({ x: 8.5, y: 15.4, ready: true });
  });

  it("snaps to the target on update while the camera is not ready", () => {
    const camera = createCamera();

    updateCamera(camera, makeState({ x: -3, y: 14 }, { x: 0, y: 0 }), 1 / 60);

    expect(camera).toEqual({ x: -3, y: 22, ready: true });
  });

  it("eases a ready camera toward the target using the capped time step", () => {
    const camera = { x: 0, y: 0, ready: true };
    const target = makeState({ x: 100, y: 50 }, { x: 0, y: 0 });
    const blend = 1 - Math.exp(-CAMERA_RESPONSE * Math.min(0.25, 0.1));

    updateCamera(camera, target, 0.25);

    expect(camera.x).toBeCloseTo(100 * blend, 12);
    expect(camera.y).toBeCloseTo(58 * blend, 12);
    expect(camera.x).toBeGreaterThan(0);
    expect(camera.x).toBeLessThan(100);
    expect(camera.y).toBeGreaterThan(0);
    expect(camera.y).toBeLessThan(58);
    expect(camera.ready).toBe(true);
  });

  describe("worldToScreen", () => {
    const viewport = { width: 800, height: 600, scale: 2.5, dpr: 1.5 };
    const camera = { x: 13, y: -7, ready: true };

    it("maps the camera center to the viewport center", () => {
      expect(worldToScreen(viewport, camera, 13, -7)).toEqual({ x: 400, y: 300 });
    });

    it("applies scale and camera offsets with the y axis inverted", () => {
      expect(worldToScreen(viewport, camera, 17, -1)).toEqual({ x: 410, y: 285 });
    });
  });
});
