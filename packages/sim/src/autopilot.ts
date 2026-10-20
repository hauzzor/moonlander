import { GRAVITY, REAR_THRUSTER_FORCE, SHIP_MASS } from "./constants";
import type { Action, Controller, Observation } from "./types";

const DEGREE_IN_RADIANS = Math.PI / 180;
const REAR_ACCELERATION = REAR_THRUSTER_FORCE / SHIP_MASS;
const TARGET_OFFSET = -2;
const OFFSET_GAIN = 0.5;
const LATERAL_SPEED_GAIN = 1.2;
const MAX_NORMAL_ACCELERATION = 8;
const MAX_ANGLE_BIAS = 30 * DEGREE_IN_RADIANS;
const DIVE_AUTHORITY_START = 0.25;
const DIVE_AUTHORITY_RANGE = 0.75;
const ANGLE_GAIN = 2.8;
const MAX_TARGET_ANGULAR_VELOCITY = 2;
const TURN_DEADBAND = 0.06;
const LIFT_THRESHOLD = 0.15;
const REAR_CUT_CLEARANCE = 7;
const REAR_CUT_FORWARD_EYE = 10;
const REAR_SPEED_MARGIN = 2;
const SPEED_RAMP_DISTANCE = 250;
const CRUISE_SPEED = 8;
const CRUISE_SPEED_GAIN = 4;
const STEEP_SPEED_REDUCTION = 0.45;
const HARD_LIFT_OFFSET_FRACTION = 0.35;
const HARD_LIFT_LATERAL_SPEED = -4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function eyeDistanceAt(observation: Observation, worldAngle: number): number {
  const eye = observation.sensors.eye;
  const index = ((Math.round(worldAngle / DEGREE_IN_RADIANS) % 360) + 360) % 360;
  return eye.distances[index] ?? eye.radius;
}

export function createAutopilot(): Controller {
  return {
    act(observation: Observation): Action {
      if (observation.hull <= 0) {
        return { left: false, right: false, rear: false };
      }

      const heading = observation.tunnelHeading;
      const direction = observation.sensors.direction.angle;
      const halfWidth = observation.tunnelHalfWidth;
      const clearance = observation.nearestWallDistance;
      const speed = observation.sensors.velocity.speed;
      const distance = observation.sensors.distanceToStart;
      const leftClearance = eyeDistanceAt(observation, heading + Math.PI / 2);
      const rightClearance = eyeDistanceAt(observation, heading - Math.PI / 2);
      const forwardEye = eyeDistanceAt(observation, heading);
      const sideSkew = clamp(
        (leftClearance - rightClearance) /
          Math.max(1, leftClearance + rightClearance),
        -1,
        1,
      );
      const targetOffset = clamp(
        TARGET_OFFSET + sideSkew * Math.min(6, halfWidth * 0.2),
        -Math.max(4, halfWidth * 0.3),
        0,
      );
      const desiredNormalAcceleration = clamp(
        OFFSET_GAIN * (targetOffset - observation.tunnelCenterOffset) -
          LATERAL_SPEED_GAIN * observation.lateralSpeed,
        -MAX_NORMAL_ACCELERATION,
        MAX_NORMAL_ACCELERATION,
      );
      const gravityNormal = -GRAVITY * Math.cos(heading);
      const requiredThrustNormal =
        desiredNormalAcceleration - gravityNormal;
      const steepness = Math.abs(Math.sin(heading));
      const diveAuthority = clamp(
        (-Math.sin(heading) - DIVE_AUTHORITY_START) / DIVE_AUTHORITY_RANGE,
        0,
        1,
      );

      // In a dive the bottom thrusters push toward the outside wall, so the
      // only inward actuator is rear thrust tilted below the tangent.
      let angleBias = 0;
      if (requiredThrustNormal < 0 && diveAuthority > 0) {
        const demandedBias = Math.asin(
          clamp(
            -requiredThrustNormal / REAR_ACCELERATION,
            0,
            Math.sin(MAX_ANGLE_BIAS) * diveAuthority,
          ),
        );
        angleBias = -demandedBias;
      }

      const targetAngle = heading + angleBias;
      const angleError = normalizeAngle(targetAngle - direction);
      const targetAngularVelocity = clamp(
        ANGLE_GAIN * angleError,
        -MAX_TARGET_ANGULAR_VELOCITY,
        MAX_TARGET_ANGULAR_VELOCITY,
      );
      const angularVelocityError =
        targetAngularVelocity - observation.angularVelocity;
      const turn =
        angularVelocityError > TURN_DEADBAND
          ? 1
          : angularVelocityError < -TURN_DEADBAND
            ? -1
            : 0;

      // Centripetal demand grows with speed, so bleed speed off as the tangent
      // approaches vertical and the corridor curvature dominates.
      const speedRamp = Math.min(1, distance / SPEED_RAMP_DISTANCE);
      const targetForwardSpeed =
        (CRUISE_SPEED + CRUISE_SPEED_GAIN * speedRamp) *
        (1 - STEEP_SPEED_REDUCTION * steepness);
      const rearSafe =
        clearance > REAR_CUT_CLEARANCE &&
        forwardEye > REAR_CUT_FORWARD_EYE &&
        speed < targetForwardSpeed + REAR_SPEED_MARGIN;
      const rearForControl =
        angleBias < -1e-6 &&
        observation.forwardSpeed < targetForwardSpeed + REAR_SPEED_MARGIN;
      const rear =
        rearSafe &&
        (observation.forwardSpeed < targetForwardSpeed || rearForControl);

      const hardLift =
        observation.tunnelCenterOffset <
          -halfWidth * HARD_LIFT_OFFSET_FRACTION ||
        observation.lateralSpeed < HARD_LIFT_LATERAL_SPEED;
      const lift = requiredThrustNormal > LIFT_THRESHOLD || hardLift;

      if (turn !== 0 && !hardLift) {
        return {
          left: turn < 0,
          right: turn > 0,
          rear,
        };
      }

      if (lift) {
        return { left: true, right: true, rear };
      }

      return { left: false, right: false, rear };
    },
  };
}
