import {
  FIXED_DT,
  createSimulation,
  type Controller,
  type Observation,
} from "@moonlander/sim";

const SEED = 7;
const START = { position: { x: 296, y: 120 }, velocity: { x: 0, y: -4 } };
const MAX_TICKS = 6000;
const TELEMETRY_INTERVAL = 600;
const FOOT_CLEARANCE = 16;
const TERMINAL_ALTITUDE = 26;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const both = { left: true, right: true };
const coast = { left: false, right: false };

function singleThruster(left: boolean) {
  return left ? { left: true, right: false } : { left: false, right: true };
}

// Scripted bang-bang autopilot, pure function of the observation; no
// randomness. One-sided burns couple lateral impulse to angular momentum
// and tilt the body, and a safe touchdown needs both feet to contact in the
// same tick, which on the flat pad requires near-zero tilt. The autopilot
// therefore prefers symmetric burns: fired together the thrusters produce
// exactly zero net torque and zero lateral force, so a balanced descent
// holds the lander level. The one-sided rules below only fire as safety
// nets to arrest divergence, drift, or overspeed.
const scriptedController: Controller = {
  act(observation: Observation) {
    const heightAboveFeet = observation.altitude - FOOT_CLEARANCE;
    const desiredVy = -clamp(0.45 * heightAboveFeet, 1.4, 9);
    const padError = observation.padOffsetX;
    // Suicide-burn guard: both thrusters together net ~3.2 m/s^2 upward,
    // so when the remaining height no longer covers the stopping distance
    // (vy^2 / 2a) the only safe action is full symmetric thrust. Zero
    // margin: any margin would create a permanent hover lock just above
    // the ground, while this boundary guides vy to ~0 as h reaches 0.
    if (
      observation.vy < 0 &&
      heightAboveFeet < (observation.vy * observation.vy) / 6.4
    ) {
      return both;
    }
    if (heightAboveFeet < TERMINAL_ALTITUDE) {
      // Level out almost exactly: burn the thruster whose torque counters
      // the tilt (left clockwise, right counter-clockwise).
      const tiltError = observation.angle + 0.05 * observation.angularVelocity;
      if (Math.abs(tiltError) > 0.0001) {
        return singleThruster(tiltError > 0);
      }
      return observation.vy < desiredVy ? both : coast;
    }
    // Burn against the spin only while tilt is diverging; while tilt and
    // spin have opposite signs the lander is recovering on its own.
    const predictedTilt = observation.angle + 0.5 * observation.angularVelocity;
    const diverging =
      Math.sign(observation.angularVelocity) === Math.sign(observation.angle) &&
      Math.abs(predictedTilt) > 0.03;
    if (diverging) {
      return singleThruster(observation.angularVelocity > 0);
    }
    if (heightAboveFeet < 45 && Math.abs(observation.vx) > 1.2) {
      return singleThruster(observation.vx > 0);
    }
    if (observation.vy < desiredVy) {
      // Steer toward the pad only while drifting toward it slower than
      // 1 m/s, so the touchdown horizontal-speed limit stays reachable.
      const driftTowardPad = observation.vx * Math.sign(padError);
      if (padError > 5 && driftTowardPad < 1 && heightAboveFeet > 10) {
        return singleThruster(true);
      }
      if (padError < -5 && driftTowardPad < 1 && heightAboveFeet > 10) {
        return singleThruster(false);
      }
      return both;
    }
    return coast;
  },
};

function printTelemetry(tick: number, observation: Observation): void {
  console.log(
    `t=${(tick * FIXED_DT).toFixed(1).padStart(5)}s ` +
      `alt=${observation.altitude.toFixed(2).padStart(7)}m ` +
      `vx=${observation.vx.toFixed(3).padStart(7)}m/s ` +
      `vy=${observation.vy.toFixed(3).padStart(7)}m/s ` +
      `tilt=${((observation.angle * 180) / Math.PI)
        .toFixed(2)
        .padStart(6)}deg ` +
      `padDx=${observation.padOffsetX.toFixed(2).padStart(7)}m ` +
      `fuel=${observation.fuel.toFixed(2).padStart(6)}`,
  );
}

const simulation = createSimulation({ seed: SEED, start: START });

console.log(
  `moonlander headless demo seed=${SEED} ` +
    `start=(${START.position.x}m, ${START.position.y}m) dt=${FIXED_DT}`,
);

let tick = 0;
for (; tick < MAX_TICKS; tick += 1) {
  if (simulation.getState().outcome !== "flying") break;
  if (tick % TELEMETRY_INTERVAL === 0) {
    printTelemetry(tick, simulation.getObservation());
  }
  simulation.step(scriptedController.act(simulation.getObservation()));
}

const finalObservation = simulation.getObservation();
printTelemetry(tick, finalObservation);
console.log(`outcome: ${simulation.getState().outcome}`);
