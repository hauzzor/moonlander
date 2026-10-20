import {
  EYE_SENSOR_VIEW_DEFAULT,
  EYE_SENSOR_VIEW_MIN,
  FIXED_DT,
  INITIAL_HULL,
  createAutopilot,
  createSimulation,
  type Observation,
  type RunOutcome,
} from "@moonlander/sim";

const REFERENCE_SEED = 7;
const BENCHMARK_SEEDS = [1, 7, 42, 1234, 2026, 5678, 99991, 314159] as const;
const BENCHMARK_SECONDS = 60;
const BENCHMARK_TICKS = Math.round(BENCHMARK_SECONDS / FIXED_DT);
const TELEMETRY_INTERVAL = 600;
const MIN_PROGRESS = 200;
const MIN_MEDIAN_PROGRESS = 300;
const MIN_AVERAGE_WORLD_X_SPEED = 4;
const REDUCED_EYE_RADIUS = EYE_SENSOR_VIEW_MIN;

interface BenchmarkResult {
  seed: number;
  ticks: number;
  outcome: RunOutcome;
  progress: number;
  hull: number;
  minWallDistance: number;
  averageWorldXSpeed: number;
}

function assertFinite(name: string, values: readonly number[]): void {
  if (!values.every(Number.isFinite)) {
    throw new Error(`Non-finite ${name}`);
  }
}

function assertFiniteObservation(observation: Observation): void {
  assertFinite("telemetry", [
    observation.x,
    observation.y,
    observation.vx,
    observation.vy,
    observation.angle,
    observation.angularVelocity,
    observation.hull,
    observation.progress,
    observation.score,
    observation.nearestWallDistance,
    observation.tunnelCenterOffset,
    observation.tunnelHalfWidth,
    observation.tunnelHeading,
    observation.forwardSpeed,
    observation.lateralSpeed,
    observation.eyeSensorRadius,
    observation.sensors.eye.radius,
    observation.sensors.eye.tick,
    observation.sensors.eye.origin.x,
    observation.sensors.eye.origin.y,
    observation.sensors.eye.heading,
    observation.sensors.direction.angle,
    observation.sensors.distanceToStart,
    observation.sensors.velocity.vx,
    observation.sensors.velocity.vy,
    observation.sensors.velocity.speed,
    observation.sensors.velocity.angle,
  ]);
  assertFinite("eye distances", observation.sensors.eye.distances);
}

function printTelemetry(tick: number, observation: Observation): void {
  assertFiniteObservation(observation);

  const eyeMinimum = Math.min(...observation.sensors.eye.distances);
  const forwardIndex =
    ((Math.round(observation.tunnelHeading * (180 / Math.PI)) % 360) + 360) %
    360;
  const eyeForward = observation.sensors.eye.distances[forwardIndex]!;

  console.log(
    `t=${(tick * FIXED_DT).toFixed(1).padStart(5)}s ` +
      `x=${observation.x.toFixed(1).padStart(8)}m ` +
      `y=${observation.y.toFixed(1).padStart(8)}m ` +
      `hull=${observation.hull.toFixed(0).padStart(3)} ` +
      `progress=${observation.progress.toFixed(1).padStart(7)}m ` +
      `score=${observation.score.toFixed(0).padStart(5)} ` +
      `wall=${observation.nearestWallDistance.toFixed(1).padStart(7)}m ` +
      `offset=${observation.tunnelCenterOffset.toFixed(1).padStart(6)}m ` +
      `fwd=${observation.forwardSpeed.toFixed(2).padStart(6)}m/s ` +
      `dir=${observation.sensors.direction.angle.toFixed(2).padStart(6)}rad ` +
      `dist=${observation.sensors.distanceToStart.toFixed(1).padStart(7)}m ` +
      `vel=${observation.sensors.velocity.speed.toFixed(2).padStart(6)}m/s ` +
      `eye=${observation.eyeSensorRadius.toFixed(0).padStart(3)}m ` +
      `scan=${observation.sensors.eye.tick.toFixed(0).padStart(4)} ` +
      `eyeMin=${eyeMinimum.toFixed(1).padStart(6)}m ` +
      `eyeFwd=${eyeForward.toFixed(1).padStart(6)}m`,
  );
}

function runBenchmark(
  seed: number,
  eyeSensorRadius: number,
): BenchmarkResult {
  const simulation = createSimulation({ seed, eyeSensorRadius });
  const autopilot = createAutopilot();
  let state = simulation.getState();
  let observation = simulation.getObservation();
  assertFiniteObservation(observation);
  let minWallDistance = observation.nearestWallDistance;
  let worldXVelocityTotal = 0;

  for (let tick = 0; tick < BENCHMARK_TICKS; tick += 1) {
    if (state.outcome !== "flying") {
      break;
    }
    state = simulation.step(autopilot.act(observation));
    observation = simulation.getObservation();
    assertFiniteObservation(observation);
    worldXVelocityTotal += observation.vx;
    minWallDistance = Math.min(
      minWallDistance,
      observation.nearestWallDistance,
    );
  }

  const averageWorldXSpeed =
    state.tick > 0 ? worldXVelocityTotal / state.tick : 0;
  assertFinite("benchmark result", [
    state.progress,
    state.hull,
    minWallDistance,
    averageWorldXSpeed,
  ]);

  return {
    seed,
    ticks: state.tick,
    outcome: state.outcome,
    progress: state.progress,
    hull: state.hull,
    minWallDistance,
    averageWorldXSpeed,
  };
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1]! + ordered[middle]!) / 2
    : ordered[middle]!;
}

function printBenchmark(
  label: string,
  eyeSensorRadius: number,
  results: readonly BenchmarkResult[],
): void {
  console.log(
    `${label}: seeds=${results.length} duration=${BENCHMARK_SECONDS.toFixed(1)}s ` +
      `radius=${eyeSensorRadius.toFixed(0)}m`,
  );
  console.log(
    "  seed    time   progress     hull    minWall   avgWorldX  outcome",
  );
  for (const result of results) {
    console.log(
      `${String(result.seed).padStart(6)} ` +
        `${(result.ticks * FIXED_DT).toFixed(1).padStart(5)}s ` +
        `${result.progress.toFixed(1).padStart(8)}m ` +
        `${result.hull.toFixed(0).padStart(6)} ` +
        `${result.minWallDistance.toFixed(2).padStart(8)}m ` +
        `${result.averageWorldXSpeed.toFixed(2).padStart(8)}m/s ` +
        `${result.outcome}`,
    );
  }
}

function reportBenchmark(results: readonly BenchmarkResult[]): void {
  const minProgress = Math.min(...results.map((result) => result.progress));
  const medianProgress = median(results.map((result) => result.progress));
  const averageWorldXSpeed =
    results.reduce(
      (total, result) => total + result.averageWorldXSpeed,
      0,
    ) / results.length;
  const minWallDistance = Math.min(
    ...results.map((result) => result.minWallDistance),
  );
  const minHull = Math.min(...results.map((result) => result.hull));
  assertFinite("benchmark summary", [
    minProgress,
    medianProgress,
    averageWorldXSpeed,
    minWallDistance,
    minHull,
  ]);

  console.log(
    `benchmark summary: minProgress=${minProgress.toFixed(1)}m ` +
      `medianProgress=${medianProgress.toFixed(1)}m ` +
      `avgWorldX=${averageWorldXSpeed.toFixed(2)}m/s ` +
      `minWall=${minWallDistance.toFixed(2)}m ` +
      `minHull=${minHull.toFixed(0)}`,
  );

  const passed =
    results.every(
      (result) =>
        result.ticks === BENCHMARK_TICKS &&
        result.outcome === "flying" &&
        result.hull === INITIAL_HULL &&
        result.minWallDistance > 0 &&
        result.progress >= MIN_PROGRESS,
    ) &&
    medianProgress >= MIN_MEDIAN_PROGRESS &&
    averageWorldXSpeed >= MIN_AVERAGE_WORLD_X_SPEED;
  console.log(`benchmark result: ${passed ? "PASS" : "FAIL"}`);
}

function reportReducedRadius(results: readonly BenchmarkResult[]): void {
  const minWallDistance = Math.min(
    ...results.map((result) => result.minWallDistance),
  );
  const minHull = Math.min(...results.map((result) => result.hull));
  assertFinite("reduced-radius summary", [minWallDistance, minHull]);

  console.log(
    `reduced-radius summary: minWall=${minWallDistance.toFixed(2)}m ` +
      `minHull=${minHull.toFixed(0)}`,
  );

  const passed = results.every(
    (result) =>
      result.ticks === BENCHMARK_TICKS &&
      result.outcome === "flying" &&
      result.hull === INITIAL_HULL &&
      result.minWallDistance > 0,
  );
  console.log(`reduced-radius result: ${passed ? "PASS" : "FAIL"}`);
}

const simulation = createSimulation({ seed: REFERENCE_SEED });
const autopilot = createAutopilot();

console.log(
  `starship headless demo seed=${REFERENCE_SEED} dt=${FIXED_DT} ` +
    `start=(${simulation.getState().ship.position.x}m, ` +
    `${simulation.getState().ship.position.y}m)`,
);

let tick = 0;
for (; tick < BENCHMARK_TICKS; tick += 1) {
  if (simulation.getState().outcome !== "flying") {
    break;
  }
  if (tick % TELEMETRY_INTERVAL === 0) {
    printTelemetry(tick, simulation.getObservation());
  }
  simulation.step(autopilot.act(simulation.getObservation()));
}

const finalObservation = simulation.getObservation();
printTelemetry(tick, finalObservation);
const finalState = simulation.getState();
console.log(
  `outcome: ${finalState.outcome} seed=${finalState.seed} ` +
    `progress=${finalState.progress.toFixed(1)} score=${finalState.score}`,
);

const benchmarkResults = BENCHMARK_SEEDS.map((seed) =>
  runBenchmark(seed, EYE_SENSOR_VIEW_DEFAULT),
);
printBenchmark("benchmark", EYE_SENSOR_VIEW_DEFAULT, benchmarkResults);
reportBenchmark(benchmarkResults);

const reducedRadiusResults = BENCHMARK_SEEDS.map((seed) =>
  runBenchmark(seed, REDUCED_EYE_RADIUS),
);
printBenchmark("reduced-radius", REDUCED_EYE_RADIUS, reducedRadiusResults);
reportReducedRadius(reducedRadiusResults);
