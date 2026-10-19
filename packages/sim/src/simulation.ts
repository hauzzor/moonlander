import {
  ANGULAR_DRAG,
  DAMAGE_SCALE,
  DAMAGE_SPEED_THRESHOLD,
  DEFAULT_SEED,
  FIXED_DT,
  GRAVITY,
  INITIAL_HULL,
  EYE_SENSOR_INTERVAL_SECONDS,
  EYE_SENSOR_VIEW_DEFAULT,
  INVULNERABILITY_SECONDS,
  LINEAR_DRAG,
  SHIP_INERTIA,
  SHIP_MASS,
  START_POSITION,
} from "./constants";
import {
  advanceWithCollisions,
  nearestWallDistance,
} from "./collision";
import { createField } from "./field";
import { clamp } from "./geometry";
import { thrusterEffect } from "./physics";
import { clampEyeSensorRadius, scanEyeSensor } from "./sensor";
import type {
  Action,
  EyeSensorReading,
  Field,
  Observation,
  RunOutcome,
  SensorSuite,
  ShipState,
  ShipStart,
  SimState,
  Simulation,
  SimulationOptions,
  Vec2,
} from "./types";

const INVULNERABILITY_TICKS = Math.round(INVULNERABILITY_SECONDS / FIXED_DT);
const EYE_SENSOR_INTERVAL_TICKS = Math.round(
  EYE_SENSOR_INTERVAL_SECONDS / FIXED_DT,
);

interface Current {
  tick: number;
  body: ShipState;
  hull: number;
  invulnerableTicksRemaining: number;
  thrusters: Action;
  outcome: RunOutcome;
  progress: number;
  eyeSensorRadius: number;
  eyeSensor: EyeSensorReading;
}

function copyVec(vector: Vec2): Vec2 {
  return { x: vector.x, y: vector.y };
}

function initialBody(start: ShipStart | undefined): ShipState {
  return {
    position: start?.position ? copyVec(start.position) : copyVec(START_POSITION),
    velocity: start?.velocity ? copyVec(start.velocity) : { x: 0, y: 0 },
    angle: start?.angle ?? 0,
    angularVelocity: start?.angularVelocity ?? 0,
  };
}

function initialCurrent(
  body: ShipState,
  hull: number,
  eyeSensorRadius: number,
  field: Field,
): Current {
  return {
    tick: 0,
    body: {
      position: copyVec(body.position),
      velocity: copyVec(body.velocity),
      angle: body.angle,
      angularVelocity: body.angularVelocity,
    },
    hull: clamp(hull, 0, INITIAL_HULL),
    invulnerableTicksRemaining: 0,
    thrusters: { left: false, right: false, rear: false },
    outcome: hull <= 0 ? "destroyed" : "flying",
    progress: 0,
    eyeSensorRadius,
    eyeSensor: scanEyeSensor(
      field,
      body.position,
      body.angle,
      eyeSensorRadius,
      0,
    ),
  };
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function sensorSuiteFor(current: Current, spawn: Vec2): SensorSuite {
  const { position, velocity } = current.body;
  const speed = Math.hypot(velocity.x, velocity.y);

  return {
    eye: current.eyeSensor,
    direction: { angle: normalizeAngle(current.body.angle) },
    distanceToStart: Math.hypot(
      position.x - spawn.x,
      position.y - spawn.y,
    ),
    velocity: {
      vx: velocity.x,
      vy: velocity.y,
      speed,
      angle: speed === 0 ? 0 : Math.atan2(velocity.y, velocity.x),
    },
  };
}

function scoreFor(progress: number): number {
  return Math.floor(progress);
}

function toSimState(
  current: Current,
  seed: number,
  spawn: Vec2,
): SimState {
  return {
    tick: current.tick,
    time: current.tick * FIXED_DT,
    seed,
    ship: {
      position: copyVec(current.body.position),
      velocity: copyVec(current.body.velocity),
      angle: current.body.angle,
      angularVelocity: current.body.angularVelocity,
    },
    hull: clamp(current.hull, 0, INITIAL_HULL),
    invulnerable: current.invulnerableTicksRemaining > 0,
    thrusters: {
      left: current.thrusters.left,
      right: current.thrusters.right,
      rear: current.thrusters.rear,
    },
    outcome: current.outcome,
    score: scoreFor(current.progress),
    progress: current.progress,
    eyeSensorRadius: current.eyeSensorRadius,
    sensors: sensorSuiteFor(current, spawn),
  };
}

export function createSimulation(options: SimulationOptions = {}): Simulation {
  const pinnedField = options.field;
  let activeField: Field =
    pinnedField ?? createField(options.seed ?? DEFAULT_SEED);

  const bodyTemplate = initialBody(options.start);
  const hullTemplate = options.hull ?? INITIAL_HULL;
  const spawnPosition = copyVec(bodyTemplate.position);
  const spawnX = spawnPosition.x;
  let configuredEyeSensorRadius = clampEyeSensorRadius(
    options.eyeSensorRadius ?? EYE_SENSOR_VIEW_DEFAULT,
  );
  let current = initialCurrent(
    bodyTemplate,
    hullTemplate,
    configuredEyeSensorRadius,
    activeField,
  );

  const getState = (): SimState =>
    toSimState(current, activeField.seed, spawnPosition);

  const getObservation = (): Observation => {
    const { position, velocity } = current.body;
    const center = activeField.tunnel.centerAt(position.x);
    const heading = activeField.tunnel.headingAt(position.x);
    const tangent = { x: Math.cos(heading), y: Math.sin(heading) };
    const normal = { x: -Math.sin(heading), y: Math.cos(heading) };

    return {
      x: position.x,
      y: position.y,
      vx: velocity.x,
      vy: velocity.y,
      angle: current.body.angle,
      angularVelocity: current.body.angularVelocity,
      hull: current.hull,
      progress: current.progress,
      score: scoreFor(current.progress),
      nearestWallDistance: nearestWallDistance(
        activeField,
        position,
        current.body.angle,
      ),
      tunnelCenterOffset: position.y - center.y,
      tunnelHalfWidth: activeField.tunnel.halfWidth,
      tunnelHeading: heading,
      forwardSpeed: velocity.x * tangent.x + velocity.y * tangent.y,
      lateralSpeed: velocity.x * normal.x + velocity.y * normal.y,
      eyeSensorRadius: current.eyeSensorRadius,
      sensors: sensorSuiteFor(current, spawnPosition),
    };
  };

  return {
    getState,
    getObservation,
    get field(): Field {
      return activeField;
    },
    step: (action: Action): SimState => {
      if (current.outcome !== "flying") {
        return getState();
      }

      const effect = thrusterEffect(current.body.angle, action);
      const linearDamping = 1 + LINEAR_DRAG * FIXED_DT;
      const angularDamping = 1 + ANGULAR_DRAG * FIXED_DT;
      const velocity: Vec2 = {
        x:
          (current.body.velocity.x + (effect.force.x / SHIP_MASS) * FIXED_DT) /
          linearDamping,
        y:
          (current.body.velocity.y +
            (effect.force.y / SHIP_MASS - GRAVITY) * FIXED_DT) /
          linearDamping,
      };
      const angularVelocity =
        (current.body.angularVelocity +
          (effect.torque / SHIP_INERTIA) * FIXED_DT) /
        angularDamping;

      const advanced = advanceWithCollisions(
        activeField,
        current.body.position,
        velocity,
        current.body.angle,
        angularVelocity,
        FIXED_DT,
      );

      let invulnerableTicksRemaining = current.invulnerableTicksRemaining;
      const wasInvulnerable = invulnerableTicksRemaining > 0;
      if (wasInvulnerable) {
        invulnerableTicksRemaining -= 1;
      }

      let hull = current.hull;
      if (
        !wasInvulnerable &&
        advanced.maxImpactSpeed > DAMAGE_SPEED_THRESHOLD
      ) {
        const damage = Math.max(
          1,
          Math.round(
            (advanced.maxImpactSpeed - DAMAGE_SPEED_THRESHOLD) * DAMAGE_SCALE,
          ),
        );
        hull = clamp(hull - damage, 0, INITIAL_HULL);
        invulnerableTicksRemaining = INVULNERABILITY_TICKS;
      }

      const progress = Math.max(
        current.progress,
        Math.max(0, advanced.position.x - spawnX),
      );
      const tick = current.tick + 1;
      const outcome = hull <= 0 ? "destroyed" : "flying";
      const eyeSensor =
        outcome === "flying" && tick % EYE_SENSOR_INTERVAL_TICKS === 0
          ? scanEyeSensor(
              activeField,
              advanced.position,
              advanced.angle,
              current.eyeSensorRadius,
              tick,
            )
          : current.eyeSensor;

      current = {
        tick,
        body: {
          position: advanced.position,
          velocity: advanced.velocity,
          angle: advanced.angle,
          angularVelocity,
        },
        hull,
        invulnerableTicksRemaining,
        thrusters: { left: action.left, right: action.right, rear: action.rear },
        outcome,
        progress,
        eyeSensorRadius: current.eyeSensorRadius,
        eyeSensor,
      };

      return getState();
    },
    setEyeSensorRadius: (radius: number): void => {
      configuredEyeSensorRadius = clampEyeSensorRadius(radius);
      current = {
        ...current,
        eyeSensorRadius: configuredEyeSensorRadius,
      };
    },
    reset: (seed?: number): SimState => {
      if (!pinnedField && seed !== undefined) {
        activeField = createField(seed);
      }
      current = initialCurrent(
        bodyTemplate,
        hullTemplate,
        configuredEyeSensorRadius,
        activeField,
      );
      return getState();
    },
  };
}
