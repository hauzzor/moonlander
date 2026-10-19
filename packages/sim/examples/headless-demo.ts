import {
  FIXED_DT,
  createSimulation,
  type Action,
  type Controller,
  type Observation,
} from "@moonlander/sim";

const SEED = 7;
const MAX_TICKS = 6000;
const TELEMETRY_INTERVAL = 600;
const WALL_CAUTION_DISTANCE = 14;
const CENTER_DEADBAND = 4;
const LEVEL_DEADBAND = 0.05;

const coast: Action = { left: false, right: false };
const both: Action = { left: true, right: true };
const leftOnly: Action = { left: true, right: false };
const rightOnly: Action = { left: false, right: true };

const demoController: Controller = {
  act(observation: Observation): Action {
    if (observation.hull <= 0) {
      return coast;
    }

    if (observation.nearestWallDistance < WALL_CAUTION_DISTANCE) {
      return observation.tunnelCenterOffset < 0 ? both : coast;
    }

    if (observation.tunnelCenterOffset < -CENTER_DEADBAND) {
      return both;
    }

    if (
      observation.tunnelCenterOffset > CENTER_DEADBAND &&
      observation.lateralSpeed > 1
    ) {
      return coast;
    }

    const predictedAngle =
      observation.angle + 0.35 * observation.angularVelocity;
    if (Math.abs(predictedAngle) > LEVEL_DEADBAND) {
      return predictedAngle > 0 ? leftOnly : rightOnly;
    }

    if (observation.lateralSpeed < -1) {
      return both;
    }

    if (observation.forwardSpeed < 6) {
      return leftOnly;
    }

    return coast;
  },
};

function printTelemetry(tick: number, observation: Observation): void {
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
  ];
  if (!values.every(Number.isFinite)) {
    throw new Error("Non-finite telemetry");
  }

  console.log(
    `t=${(tick * FIXED_DT).toFixed(1).padStart(5)}s ` +
      `x=${observation.x.toFixed(1).padStart(8)}m ` +
      `y=${observation.y.toFixed(1).padStart(8)}m ` +
      `vx=${observation.vx.toFixed(2).padStart(7)}m/s ` +
      `vy=${observation.vy.toFixed(2).padStart(7)}m/s ` +
      `hull=${observation.hull.toFixed(0).padStart(3)} ` +
      `progress=${observation.progress.toFixed(1).padStart(7)}m ` +
      `score=${observation.score.toFixed(0).padStart(5)} ` +
      `wall=${observation.nearestWallDistance.toFixed(1).padStart(7)}m ` +
      `offset=${observation.tunnelCenterOffset.toFixed(1).padStart(6)}m ` +
      `fwd=${observation.forwardSpeed.toFixed(2).padStart(6)}m/s ` +
      `lat=${observation.lateralSpeed.toFixed(2).padStart(6)}m/s`,
  );
}

const simulation = createSimulation({ seed: SEED });

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
  simulation.step(demoController.act(simulation.getObservation()));
}

const finalObservation = simulation.getObservation();
printTelemetry(tick, finalObservation);
const finalState = simulation.getState();
console.log(
  `outcome: ${finalState.outcome} seed=${finalState.seed} ` +
    `progress=${finalState.progress.toFixed(1)} score=${finalState.score}`,
);
