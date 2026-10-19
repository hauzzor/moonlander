import {
  FIXED_DT,
  createAutopilot,
  createSimulation,
  type Observation,
} from "@moonlander/sim";

const SEED = 7;
const MAX_TICKS = 6000;
const TELEMETRY_INTERVAL = 600;

function printTelemetry(tick: number, observation: Observation): void {
  const eyeMinimum = Math.min(...observation.sensors.eye.distances);
  const forwardIndex =
    ((Math.round(observation.tunnelHeading * (180 / Math.PI)) % 360) + 360) %
    360;
  const eyeForward = observation.sensors.eye.distances[forwardIndex]!;
  const values = [
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
    eyeMinimum,
    eyeForward,
  ];
  if (!values.every(Number.isFinite)) {
    throw new Error("Non-finite telemetry");
  }

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

const simulation = createSimulation({ seed: SEED });
const autopilot = createAutopilot();

console.log(
  `starship headless demo seed=${SEED} dt=${FIXED_DT} ` +
    `start=(${simulation.getState().ship.position.x}m, ` +
    `${simulation.getState().ship.position.y}m)`,
);

let tick = 0;
for (; tick < MAX_TICKS; tick += 1) {
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
