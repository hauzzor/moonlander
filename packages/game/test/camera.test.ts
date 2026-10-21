import { describe, expect, it } from "vitest";
import { GRAVITY, type SimState } from "@moonlander/sim";
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
    thrusters: { left: false, right: false, rear: false },
    outcome: "flying",
    score: 0,
    progress: 0,
      eyeSensorRadius: 120,
      gravityScale: 1,
      gravity: GRAVITY,
      bottomThrusterScale: 1,
      rearThrusterScale: 1,
      sensors: {
        eye: {
          radius: 120,
          tick: 0,
          origin: position,
          heading: 0,
          distances: Array.from({ length: 360 }, () => 120),
        },
      direction: { angle: 0 },
      distanceToStart: 0,
      velocity: {
        vx: velocity.x,
        vy: velocity.y,
        speed: Math.hypot(velocity.x, velocity.y),
        angle: Math.atan2(velocity.y, velocity.x),
      },
    },
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe("camera helpers", () => {
  it("creates an uninitialized camera at the origin", () => {
    expect(createCamera()).toEqual({ x: 0, y: 0, ready: false });
  });

  it("never stores or changes a rotation", () => {
    const camera = createCamera();
    expect(Object.keys(camera).sort()).toEqual(["ready", "x", "y"]);

    snapCamera(camera, makeState({ x: 10, y: 20 }, { x: 3, y: 4 }));
    expect(Object.keys(camera).sort()).toEqual(["ready", "x", "y"]);

    updateCamera(camera, makeState({ x: 30, y: 40 }, { x: -5, y: 6 }), 1 / 60);
    expect(Object.keys(camera).sort()).toEqual(["ready", "x", "y"]);
  });

  it("computes the camera target without mutating simulation state", () => {
    const state = makeState({ x: 10, y: 20 }, { x: 20, y: -25 });
    const snapshot = clone(state);

    cameraTarget(state);

    expect(state).toEqual(snapshot);
  });

  it("snaps without mutating simulation state", () => {
    const state = makeState({ x: 5, y: 9 }, { x: 10, y: -10 });
    const snapshot = clone(state);
    const camera = createCamera();

    snapCamera(camera, state);

    expect(state).toEqual(snapshot);
  });

  it("eases without mutating simulation state", () => {
    const state = makeState({ x: 100, y: 50 }, { x: 12, y: -4 });
    const snapshot = clone(state);
    const camera = { x: 0, y: 0, ready: true };

    updateCamera(camera, state, 1 / 60);

    expect(state).toEqual(snapshot);
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

  it.each([
    [0, 0],
    [1 / 120, 1 - Math.exp(-CAMERA_RESPONSE * (1 / 120))],
    [0.05, 1 - Math.exp(-CAMERA_RESPONSE * 0.05)],
    [0.1, 1 - Math.exp(-CAMERA_RESPONSE * 0.1)],
    [0.25, 1 - Math.exp(-CAMERA_RESPONSE * 0.1)],
    [10, 1 - Math.exp(-CAMERA_RESPONSE * 0.1)],
  ])("uses the exponential blend for a %s s step", (deltaSeconds, blend) => {
    const camera = { x: 0, y: 0, ready: true };
    const state = makeState({ x: 100, y: 50 });

    updateCamera(camera, state, deltaSeconds);

    expect(camera.x).toBeCloseTo(100 * blend, 12);
    expect(camera.y).toBeCloseTo(58 * blend, 12);
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

    it.each([
      [3, 4, 3, 4, 1, 200, 300],
      [5, 4, 3, 4, 2, 204, 300],
      [-3, 12, 2, 2, 2, 190, 280],
      [0, 0, 0, 0, 2, 200, 300],
    ])(
      "projects point (%s, %s) with camera (%s, %s) at scale %s",
      (pointX, pointY, cameraX, cameraY, scale, expectedX, expectedY) => {
        const point = worldToScreen(
          { width: 400, height: 600, scale, dpr: 2 },
          { x: cameraX, y: cameraY, ready: true },
          pointX,
          pointY,
        );

        expect(point).toEqual({ x: expectedX, y: expectedY });
      },
    );

    it("ignores device pixel ratio because it works in CSS pixels", () => {
      const point = worldToScreen(viewport, camera, 17, -1);
      const withOtherDpr = worldToScreen(
        { ...viewport, dpr: 2 },
        camera,
        17,
        -1,
      );

      expect(withOtherDpr).toEqual(point);
    });
  });
});
