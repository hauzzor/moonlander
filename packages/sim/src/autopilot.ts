import type { Action, Controller, Observation } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function createAutopilot(): Controller {
  return {
    act(observation: Observation): Action {
      const direction = observation.sensors.direction.angle;
      const forwardAngleIndex =
        ((Math.round(observation.tunnelHeading * (180 / Math.PI)) % 360) + 360) %
        360;
      const eyeForward =
        observation.sensors.eye.distances[forwardAngleIndex] ??
        observation.sensors.eye.radius;
      const clearance = observation.nearestWallDistance;
      const offset = observation.tunnelCenterOffset;
      const speed = observation.sensors.velocity.speed;
      const distance = observation.sensors.distanceToStart;

      if (clearance > 6) {
        const angleError = normalizeAngle(
          observation.tunnelHeading - direction,
        );
        const targetAngularVelocity = clamp(
          2.6 * angleError - 0.35 * observation.angularVelocity,
          -1.4,
          1.4,
        );
        const angularVelocityError =
          targetAngularVelocity - observation.angularVelocity;
        const targetOffset = -2;
        const targetLateralSpeed = clamp(
          -0.9 * (offset - targetOffset),
          -3.5,
          3.5,
        );
        const lateralSpeedError =
          targetLateralSpeed - observation.lateralSpeed;
        const hardLift = offset < -14 || observation.lateralSpeed < -6;
        const lift = hardLift || lateralSpeedError > 0.35;
        const drop = lateralSpeedError < -0.5;
        const turn = angularVelocityError > 0.06
          ? 1
          : angularVelocityError < -0.06
            ? -1
            : 0;
        const targetForwardSpeed = 11 + Math.min(1.5, distance / 300);
        const safeToAccelerate =
          clearance > 9 && eyeForward > 16 && speed < 18;
        const rear =
          safeToAccelerate && observation.forwardSpeed < targetForwardSpeed;

        if (turn !== 0 && !hardLift) {
          return {
            left: turn < 0,
            right: turn > 0,
            rear,
          };
        }

        if (lift && !drop) {
          return { left: true, right: true, rear };
        }

        return { left: false, right: false, rear };
      }

      return {
        left: offset < 0,
        right: offset < 0,
        rear: false,
      };
    },
  };
}
