import { describe, expect, it } from "vitest";
import type { Action, Controller, Observation } from "../src/index";
import { sim } from "./helpers";

interface LowEyeForward {
  distance: number;
  centerIndex?: number;
  spread?: number;
}

interface ObservationInput {
  angle?: number;
  angularVelocity?: number;
  tunnelHeading?: number;
  tunnelCenterOffset?: number;
  tunnelHalfWidth?: number;
  nearestWallDistance?: number;
  vx?: number;
  vy?: number;
  speed?: number;
  forwardSpeed?: number;
  lateralSpeed?: number;
  distanceToStart?: number;
  hull?: number;
  eyeRadius?: number;
  gravityScale?: number;
  gravity?: number;
  bottomThrusterScale?: number;
  rearThrusterScale?: number;
  lowEyeForward?: LowEyeForward;
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function wrapRayIndex(index: number): number {
  return (
    ((index % sim.EYE_SENSOR_RAY_COUNT) + sim.EYE_SENSOR_RAY_COUNT) %
    sim.EYE_SENSOR_RAY_COUNT
  );
}

function makeEyeDistances(
  radius: number,
  lowForward: LowEyeForward | undefined,
  heading: number,
): readonly number[] {
  const distances = new Array<number>(sim.EYE_SENSOR_RAY_COUNT).fill(radius);
  if (!lowForward) {
    return distances;
  }

  const centerIndex =
    lowForward.centerIndex ?? Math.round((heading * 180) / Math.PI);
  const spread = lowForward.spread ?? 20;
  for (let offset = -spread; offset <= spread; offset += 1) {
    const index = wrapRayIndex(centerIndex + offset);
    distances[index] = Math.min(distances[index]!, lowForward.distance);
  }
  return distances;
}

function makeObservation(input: ObservationInput = {}): Observation {
  const angle = input.angle ?? 0;
  const heading = input.tunnelHeading ?? 0;
  const eyeRadius = input.eyeRadius ?? sim.EYE_SENSOR_VIEW_DEFAULT;
  const gravityScale = input.gravityScale ?? sim.GRAVITY_SCALE_DEFAULT;
  const gravity = input.gravity ?? sim.GRAVITY * gravityScale;
  const vx = input.vx ?? 0;
  const vy = input.vy ?? 0;
  const speed = input.speed ?? Math.hypot(vx, vy);
  const forwardSpeed =
    input.forwardSpeed ?? vx * Math.cos(heading) + vy * Math.sin(heading);
  const lateralSpeed =
    input.lateralSpeed ?? -vx * Math.sin(heading) + vy * Math.cos(heading);

  return {
    x: 0,
    y: sim.TUNNEL_CENTER_Y,
    vx,
    vy,
    angle,
    angularVelocity: input.angularVelocity ?? 0,
    hull: input.hull ?? sim.INITIAL_HULL,
    progress: 0,
    score: 0,
    nearestWallDistance:
      input.nearestWallDistance ?? sim.TUNNEL_HALF_WIDTH,
    tunnelCenterOffset: input.tunnelCenterOffset ?? 0,
    tunnelHalfWidth: input.tunnelHalfWidth ?? sim.TUNNEL_HALF_WIDTH,
    tunnelHeading: heading,
    forwardSpeed,
    lateralSpeed,
    eyeSensorRadius: eyeRadius,
    gravityScale,
    gravity,
    bottomThrusterScale:
      input.bottomThrusterScale ?? sim.THRUSTER_SCALE_DEFAULT,
    rearThrusterScale:
      input.rearThrusterScale ?? sim.THRUSTER_SCALE_DEFAULT,
    sensors: {
      eye: {
        radius: eyeRadius,
        tick: 0,
        origin: { x: 0, y: sim.TUNNEL_CENTER_Y },
        heading: angle,
        distances: makeEyeDistances(eyeRadius, input.lowEyeForward, heading),
      },
      direction: { angle: normalizeAngle(angle) },
      distanceToStart: input.distanceToStart ?? 0,
      velocity: {
        vx,
        vy,
        speed,
        angle: speed === 0 ? 0 : Math.atan2(vy, vx),
      },
    },
  };
}

function expectThrusterAction(action: Action): void {
  expect(Object.keys(action).sort()).toEqual(["left", "rear", "right"]);
  expect(typeof action.left).toBe("boolean");
  expect(typeof action.right).toBe("boolean");
  expect(typeof action.rear).toBe("boolean");
}

describe("deterministic sim autopilot", () => {
  it("returns a Controller that emits all three thruster commands", () => {
    const autopilot: Controller = sim.createAutopilot();
    const observation = sim.createSimulation({ seed: 1 }).getObservation();
    const action = autopilot.act(observation);

    expectThrusterAction(action);
  });

  it("produces identical actions and states for identical observation replays", () => {
    const firstSimulation = sim.createSimulation({ seed: 42 });
    const secondSimulation = sim.createSimulation({ seed: 42 });
    const firstController = sim.createAutopilot();
    const secondController = sim.createAutopilot();

    for (let tick = 0; tick < 600; tick += 1) {
      const firstAction = firstController.act(firstSimulation.getObservation());
      const secondAction = secondController.act(secondSimulation.getObservation());
      expectThrusterAction(firstAction);
      expect(firstAction).toEqual(secondAction);
      expect(firstSimulation.step(firstAction)).toEqual(secondSimulation.step(secondAction));
    }
  });

  it("replays a varied synthetic observation sequence identically", () => {
    const observations: Observation[] = [];
    for (let index = 0; index < 60; index += 1) {
      const heading = Math.sin(index / 7) * (Math.PI / 3);
      const vx = Math.cos(index / 5) * 8;
      const vy = Math.sin(index / 5) * 4;
      observations.push(
        makeObservation({
          angle: Math.sin(index / 11) * 0.4,
          angularVelocity: Math.cos(index / 9) * 0.3,
          tunnelHeading: heading,
          tunnelCenterOffset: Math.sin(index / 13) * 10,
          nearestWallDistance:
            index % 5 === 0 ? 0.5 : 20 + Math.abs(Math.sin(index / 17)) * 15,
          vx,
          vy,
          speed: Math.hypot(vx, vy),
          distanceToStart: index,
        }),
      );
    }

    const firstController = sim.createAutopilot();
    const secondController = sim.createAutopilot();

    for (const observation of observations) {
      const firstAction = firstController.act(observation);
      const secondAction = secondController.act(observation);
      expectThrusterAction(firstAction);
      expect(firstAction).toEqual(secondAction);
    }

    const firstObservation = observations[0]!;
    expect(firstController.act(firstObservation)).toEqual(
      firstController.act(firstObservation),
    );
  });
});

describe("autopilot observation policy", () => {
  const apiObservations: ReadonlyArray<{
    name: string;
    observation: Observation;
  }> = [
    { name: "centered", observation: makeObservation() },
    {
      name: "near-wall",
      observation: makeObservation({
        tunnelCenterOffset: -12,
        nearestWallDistance: 1,
        lowEyeForward: { distance: 2, spread: 20 },
      }),
    },
    {
      name: "steep-heading",
      observation: makeObservation({
        angle: sim.TUNNEL_MAX_CLIMB_ANGLE,
        tunnelHeading: sim.TUNNEL_MAX_CLIMB_ANGLE,
      }),
    },
    { name: "zero-speed", observation: makeObservation({ vx: 0, vy: 0 }) },
    {
      name: "manual-flight / autopilot-off",
      observation: makeObservation({
        angle: 0.25,
        angularVelocity: 0.4,
        tunnelHeading: 0.1,
        tunnelCenterOffset: 4,
        nearestWallDistance: 25,
        vx: 12,
        vy: -3,
        forwardSpeed: 11,
        lateralSpeed: 5,
      }),
    },
    {
      name: "low-clearance",
      observation: makeObservation({
        nearestWallDistance: 0.5,
        lowEyeForward: { distance: 1, spread: 20 },
      }),
    },
    {
      name: "destroyed",
      observation: makeObservation({
        hull: 0,
        nearestWallDistance: 0.25,
        lowEyeForward: { distance: 1, spread: 20 },
      }),
    },
    {
      name: "minimum-width",
      observation: makeObservation({
        tunnelHalfWidth: sim.TUNNEL_MIN_HALF_WIDTH,
        nearestWallDistance: 1,
        lowEyeForward: { distance: 1, spread: 20 },
      }),
    },
  ];

  it.each(apiObservations)(
    "returns a complete thruster action for a $name observation",
    ({ observation }) => {
      const autopilot = sim.createAutopilot();
      expectThrusterAction(autopilot.act(observation));
    },
  );

  it("commands rear thrust for a centered ship at rest with clear space", () => {
    const autopilot = sim.createAutopilot();
    const action = autopilot.act(
      makeObservation({ nearestWallDistance: 40 }),
    );

    expect(action.rear).toBe(true);
  });

  it("cuts rear thrust when nearest-wall clearance is low even from rest", () => {
    const autopilot = sim.createAutopilot();
    const clear = autopilot.act(
      makeObservation({ nearestWallDistance: 40 }),
    );
    const low = autopilot.act(
      makeObservation({ nearestWallDistance: 0.5 }),
    );

    expect(clear.rear).toBe(true);
    expect(low.rear).toBe(false);
  });

  it("cuts rear thrust when the eye sensor sees a close forward wall", () => {
    const autopilot = sim.createAutopilot();
    const clear = autopilot.act(
      makeObservation({ nearestWallDistance: 40 }),
    );
    const blocked = autopilot.act(
      makeObservation({
        nearestWallDistance: 40,
        lowEyeForward: { distance: 3, spread: 30 },
      }),
    );

    expect(clear.rear).toBe(true);
    expect(blocked.rear).toBe(false);
  });

  it("prefers safety at a minimum-width section over forward speed", () => {
    const autopilot = sim.createAutopilot();
    const action = autopilot.act(
      makeObservation({
        tunnelHalfWidth: sim.TUNNEL_MIN_HALF_WIDTH,
        nearestWallDistance: 1,
        lowEyeForward: { distance: 1, spread: 30 },
      }),
    );

    expect(action.rear).toBe(false);
  });

  it("uses more bottom thrust when below the tunnel centerline than above it", () => {
    const autopilot = sim.createAutopilot();
    const above = autopilot.act(
      makeObservation({ tunnelCenterOffset: 12, nearestWallDistance: 40 }),
    );
    const below = autopilot.act(
      makeObservation({ tunnelCenterOffset: -12, nearestWallDistance: 40 }),
    );
    const bottomThrusters = (action: Action): number =>
      Number(action.left) + Number(action.right);

    expect(bottomThrusters(below)).toBeGreaterThan(bottomThrusters(above));
    expect(bottomThrusters(below)).toBeGreaterThan(0);
  });

  it("turns counter-clockwise toward a positive tunnel heading error", () => {
    const autopilot = sim.createAutopilot();
    const action = autopilot.act(
      makeObservation({
        angle: 0,
        tunnelHeading: Math.PI / 3,
        nearestWallDistance: 40,
      }),
    );

    expect(action.right).toBe(true);
    expect(action.left).toBe(false);
  });

  it("turns clockwise toward a negative tunnel heading error", () => {
    const autopilot = sim.createAutopilot();
    const action = autopilot.act(
      makeObservation({
        angle: 0,
        tunnelHeading: -Math.PI / 3,
        nearestWallDistance: 40,
      }),
    );

    expect(action.left).toBe(true);
    expect(action.right).toBe(false);
  });

  it("turns toward a near-vertical climb", () => {
    const autopilot = sim.createAutopilot();
    const action = autopilot.act(
      makeObservation({
        angle: 0,
        tunnelHeading: sim.TUNNEL_MAX_CLIMB_ANGLE,
        nearestWallDistance: 40,
      }),
    );

    expect(action.right).toBe(true);
    expect(action.left).toBe(false);
  });

  it("returns a complete action for a destroyed hull observation", () => {
    const autopilot = sim.createAutopilot();
    const action = autopilot.act(
      makeObservation({
        hull: 0,
        nearestWallDistance: 0.25,
        lowEyeForward: { distance: 1, spread: 30 },
      }),
    );

    expectThrusterAction(action);
    expect(action.rear).toBe(false);
  });

  it("uses the observed effective gravity when deciding to demand lift", () => {
    const autopilot = sim.createAutopilot();
    const steepDive = {
      angle: -sim.TUNNEL_MAX_CLIMB_ANGLE,
      tunnelHeading: -sim.TUNNEL_MAX_CLIMB_ANGLE,
      tunnelCenterOffset: 0,
      nearestWallDistance: 40,
      vx: 0,
      vy: 0,
    };

    const heavy = autopilot.act(
      makeObservation({ ...steepDive, gravityScale: 10 }),
    );
    const light = autopilot.act(
      makeObservation({ ...steepDive, gravityScale: 0.1 }),
    );

    expect(heavy.left).toBe(true);
    expect(heavy.right).toBe(true);
    expect(light.left && light.right).toBe(false);
    expect(heavy).not.toEqual(light);
  });

  it("uses the observed rear-thruster power for dive-steering authority", () => {
    const autopilot = sim.createAutopilot();
    const steepDive = {
      angle: -sim.TUNNEL_MAX_CLIMB_ANGLE,
      tunnelHeading: -sim.TUNNEL_MAX_CLIMB_ANGLE,
      tunnelCenterOffset: 0,
      nearestWallDistance: 40,
      vx: 0,
      vy: 0,
      lateralSpeed: -0.1,
      gravityScale: 0.1,
    };

    const weakRear = autopilot.act(
      makeObservation({ ...steepDive, rearThrusterScale: 0.1 }),
    );
    const strongRear = autopilot.act(
      makeObservation({ ...steepDive, rearThrusterScale: 10 }),
    );

    expect(weakRear.left || weakRear.right).toBe(true);
    expect(strongRear.left || strongRear.right).toBe(false);
    expect(weakRear).not.toEqual(strongRear);
  });

  it("consumes the observed bottom-thruster power somewhere in its policy", () => {
    const autopilot = sim.createAutopilot();
    const headings = [
      -sim.TUNNEL_MAX_CLIMB_ANGLE,
      -sim.TUNNEL_MAX_CLIMB_ANGLE / 2,
      0,
      sim.TUNNEL_MAX_CLIMB_ANGLE / 2,
      sim.TUNNEL_MAX_CLIMB_ANGLE,
    ];
    const offsets = [-20, 0, 20];
    const gravityScales = [0.1, 1, 10];
    const observations: Observation[] = [];

    for (const heading of headings) {
      for (const offset of offsets) {
        for (const gravityScale of gravityScales) {
          observations.push(
            makeObservation({
              angle: heading,
              tunnelHeading: heading,
              tunnelCenterOffset: offset,
              nearestWallDistance: 40,
              gravityScale,
            }),
          );
        }
      }
    }

    const actionsAt = (bottomThrusterScale: number): Action[] =>
      observations.map((observation) =>
        autopilot.act(makeObservation({ ...observation, bottomThrusterScale })),
      );

    const weakBottom = actionsAt(0.1);
    const strongBottom = actionsAt(10);

    for (const action of [...weakBottom, ...strongBottom]) {
      expectThrusterAction(action);
    }
    expect(weakBottom).not.toEqual(strongBottom);
  });

  it("keeps a short deterministic replay clear of walls", () => {
    const simulation = sim.createSimulation({ seed: 42 });
    const autopilot = sim.createAutopilot();
    let state = simulation.getState();

    for (let tick = 0; tick < 600 && state.outcome === "flying"; tick += 1) {
      state = simulation.step(autopilot.act(simulation.getObservation()));
      expect(state.outcome).toBe("flying");
      expect(state.hull).toBe(sim.INITIAL_HULL);
      expect(
        simulation.getObservation().nearestWallDistance,
      ).toBeGreaterThan(0);
    }

    expect(state.progress).toBeGreaterThan(0);
  });
});
