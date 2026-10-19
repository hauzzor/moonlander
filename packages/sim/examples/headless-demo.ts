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
const WALL_CAUTION_DISTANCE = 60;
const GATE_CAUTION_DISTANCE = 50;

const coast: Action = { left: false, right: false };
const both: Action = { left: true, right: true };
const leftOnly: Action = { left: true, right: false };
const rightOnly: Action = { left: false, right: true };

// Scripted, deterministic autopilot. It holds a cruising altitude, levels
// the hull, climbs when walls approach, and steers away from gate frames.
const demoController: Controller = {
  act(observation: Observation): Action {
    if (observation.hull <= 0) {
      return coast;
    }

    if (observation.y < 110 && observation.vy < 0.5) {
      return both;
    }

    if (
      observation.nearestWallDistance < WALL_CAUTION_DISTANCE &&
      observation.vy < 2
    ) {
      return both;
    }

    if (
      observation.nearestGateDistance >= 0 &&
      observation.nearestGateDistance < GATE_CAUTION_DISTANCE &&
      Math.abs(observation.nearestGateAngle) < 1.3
    ) {
      return observation.nearestGateAngle > 0 ? rightOnly : leftOnly;
    }

    const predictedAngle =
      observation.angle + 0.35 * observation.angularVelocity;
    if (Math.abs(predictedAngle) > 0.08) {
      return predictedAngle > 0 ? leftOnly : rightOnly;
    }

    if (observation.vy < 0.6) {
      return both;
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
    observation.nearestGateDistance,
    observation.nearestGateAngle,
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
      `gate=${observation.nearestGateDistance.toFixed(1).padStart(7)}m`,
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
    `gates=${finalState.gatesPassed} score=${finalState.score}`,
);
