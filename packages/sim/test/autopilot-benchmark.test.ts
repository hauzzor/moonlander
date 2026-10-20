import { beforeAll, describe, expect, it } from "vitest";
import type {
  Action,
  Observation,
  RunOutcome,
  ShipStart,
  SimulationOptions,
} from "../src/index";
import { sim } from "./helpers";

const BENCHMARK_SEEDS = [1, 7, 42, 1234, 2026, 5678, 99991, 314159] as const;
const BENCHMARK_SECONDS = 60;
const BENCHMARK_TICKS = Math.round(BENCHMARK_SECONDS / sim.FIXED_DT);
const EXPECTED_HULL = 100;
const MIN_PROGRESS_METERS = 200;
const MIN_MEDIAN_PROGRESS_METERS = 300;
const MIN_AVERAGE_WORLD_X_SPEED = 4;
const REDUCED_EYE_RADIUS = 20;
const NEAR_WALL_START_OFFSET = 18;
const RUN_TIMEOUT_MS = 180_000;

interface BenchmarkRunOptions {
  seed: number;
  eyeSensorRadius?: number;
  start?: ShipStart;
  ticks?: number;
}

interface BenchmarkResult {
  seed: number;
  ticks: number;
  time: number;
  outcome: RunOutcome;
  eyeSensorRadius: number;
  progress: number;
  hull: number;
  hullViolationTicks: number;
  contactTicks: number;
  minNearestWallDistance: number;
  averageWorldXVelocity: number;
  worldXVelocityTotal: number;
  worldXVelocitySamples: number;
  initialX: number;
  finalX: number;
  finalY: number;
}

function runBenchmark(options: BenchmarkRunOptions): BenchmarkResult {
  const simulationOptions: SimulationOptions = { seed: options.seed };
  if (options.eyeSensorRadius !== undefined) {
    simulationOptions.eyeSensorRadius = options.eyeSensorRadius;
  }
  if (options.start !== undefined) {
    simulationOptions.start = options.start;
  }

  const simulation = sim.createSimulation(simulationOptions);
  const autopilot = sim.createAutopilot();
  const tickLimit = options.ticks ?? BENCHMARK_TICKS;
  let state = simulation.getState();
  let observation: Observation = simulation.getObservation();

  const initialX = observation.x;
  let minNearestWallDistance = observation.nearestWallDistance;
  let contactTicks = observation.nearestWallDistance > 0 ? 0 : 1;
  let hullViolationTicks = state.hull === EXPECTED_HULL ? 0 : 1;
  let worldXVelocityTotal = 0;
  let completedTicks = 0;

  for (let tick = 0; tick < tickLimit; tick += 1) {
    if (state.outcome !== "flying") {
      break;
    }

    const action: Action = autopilot.act(observation);
    state = simulation.step(action);
    observation = simulation.getObservation();
    completedTicks += 1;

    worldXVelocityTotal += observation.vx;
    minNearestWallDistance = Math.min(
      minNearestWallDistance,
      observation.nearestWallDistance,
    );
    if (!(observation.nearestWallDistance > 0)) {
      contactTicks += 1;
    }
    if (state.hull !== EXPECTED_HULL) {
      hullViolationTicks += 1;
    }
  }

  return {
    seed: options.seed,
    ticks: completedTicks,
    time: completedTicks * sim.FIXED_DT,
    outcome: state.outcome,
    eyeSensorRadius: observation.eyeSensorRadius,
    progress: state.progress,
    hull: state.hull,
    hullViolationTicks,
    contactTicks,
    minNearestWallDistance,
    averageWorldXVelocity:
      completedTicks === 0 ? 0 : worldXVelocityTotal / completedTicks,
    worldXVelocityTotal,
    worldXVelocitySamples: completedTicks,
    initialX,
    finalX: observation.x,
    finalY: observation.y,
  };
}

function expectFullSafeRun(result: BenchmarkResult): void {
  expect(result.ticks).toBe(BENCHMARK_TICKS);
  expect(result.time).toBeCloseTo(BENCHMARK_SECONDS, 9);
  expect(result.outcome).toBe("flying");
  expect(result.contactTicks).toBe(0);
  expect(result.minNearestWallDistance).toBeGreaterThan(0);
  expect(result.hullViolationTicks).toBe(0);
  expect(result.hull).toBe(EXPECTED_HULL);
}

describe("autopilot eight-seed benchmark", () => {
  let results: Map<number, BenchmarkResult>;

  beforeAll(() => {
    results = new Map(
      BENCHMARK_SEEDS.map((seed) => [seed, runBenchmark({ seed })]),
    );
  }, RUN_TIMEOUT_MS);

  it.each(BENCHMARK_SEEDS)(
    "seed %i flies 60 s with zero contact, hull 100, and at least 200 m of progress",
    (seed) => {
      const result = results.get(seed)!;
      expectFullSafeRun(result);
      expect(result.progress).toBeGreaterThanOrEqual(MIN_PROGRESS_METERS);
    },
  );

  it("has a median progress of at least 300 m", () => {
    const orderedProgress = BENCHMARK_SEEDS.map(
      (seed) => results.get(seed)!.progress,
    ).sort((first, second) => first - second);
    const medianProgress =
      (orderedProgress[3]! + orderedProgress[4]!) / 2;

    expect(medianProgress).toBeGreaterThanOrEqual(MIN_MEDIAN_PROGRESS_METERS);
  });

  it("averages at least 4 m/s of world-x speed across the fixed seeds", () => {
    let worldXVelocityTotal = 0;
    let worldXVelocitySamples = 0;
    for (const seed of BENCHMARK_SEEDS) {
      const result = results.get(seed)!;
      worldXVelocityTotal += result.worldXVelocityTotal;
      worldXVelocitySamples += result.worldXVelocitySamples;
    }

    expect(worldXVelocitySamples).toBe(
      BENCHMARK_SEEDS.length * BENCHMARK_TICKS,
    );
    expect(
      worldXVelocityTotal / worldXVelocitySamples,
    ).toBeGreaterThanOrEqual(MIN_AVERAGE_WORLD_X_SPEED);
  });

  it("produces identical results for repeated same-seed runs", () => {
    const replay = runBenchmark({ seed: 42 });

    expect(replay).toEqual(results.get(42));
  }, RUN_TIMEOUT_MS);
});

describe("reduced 20 m eye-sensor radius safety", () => {
  let results: Map<number, BenchmarkResult>;

  beforeAll(() => {
    results = new Map(
      BENCHMARK_SEEDS.map((seed) => [
        seed,
        runBenchmark({ seed, eyeSensorRadius: REDUCED_EYE_RADIUS }),
      ]),
    );
  }, RUN_TIMEOUT_MS);

  it.each(BENCHMARK_SEEDS)(
    "seed %i stays contact-free with hull 100 for 60 s at the 20 m eye radius",
    (seed) => {
      const result = results.get(seed)!;
      expect(result.eyeSensorRadius).toBe(REDUCED_EYE_RADIUS);
      expectFullSafeRun(result);
    },
  );

  it("stays safe from a near-wall start in the straight opening", () => {
    const result = runBenchmark({
      seed: 1,
      eyeSensorRadius: REDUCED_EYE_RADIUS,
      start: {
        position: {
          x: 0,
          y: sim.TUNNEL_CENTER_Y + NEAR_WALL_START_OFFSET,
        },
        velocity: { x: 0, y: 0 },
        angle: 0,
        angularVelocity: 0,
      },
    });

    expect(result.eyeSensorRadius).toBe(REDUCED_EYE_RADIUS);
    expectFullSafeRun(result);
  }, RUN_TIMEOUT_MS);
});
