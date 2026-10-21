import {
  DAMAGE_SCALE,
  DAMAGE_SPEED_THRESHOLD,
  DEFAULT_SEED,
  EYE_SENSOR_INTERVAL_SECONDS,
  EYE_SENSOR_VIEW_DEFAULT,
  FIXED_DT,
  GRAVITY,
  GRAVITY_SCALE_DEFAULT,
  GRAVITY_SCALE_MAX,
  GRAVITY_SCALE_MIN,
  INITIAL_HULL,
  INVULNERABILITY_SECONDS,
  SHIP_INERTIA,
  SHIP_MASS,
  START_POSITION,
  THRUSTER_SCALE_DEFAULT,
  THRUSTER_SCALE_MAX,
  THRUSTER_SCALE_MIN,
} from "./constants";
import {
  advanceWithCollisions,
  nearestWallDistance,
} from "./collision";
import { createField } from "./field";
import { clamp } from "./geometry";
import {
  applyAngularDrag,
  applyLinearDrag,
  thrusterEffect,
} from "./physics";
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

const INVULNERABILITY_TICKS = Math.round(
  INVULNERABILITY_SECONDS / FIXED_DT,
);
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

interface Scales {
  gravityScale: number;
  bottomThrusterScale: number;
  rearThrusterScale: number;
}

function copyVec(vector: Vec2): Vec2 {
  return { x: vector.x, y: vector.y };
}

function idleThrusters(): Action {
  return { left: false, right: false, rear: false };
}

function normalizeScale(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  return Number.isFinite(value) ? clamp(value, min, max) : fallback;
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
  const clampedHull = clamp(hull, 0, INITIAL_HULL);
  const position = copyVec(body.position);

  return {
    tick: 0,
    body: {
      position,
      velocity: copyVec(body.velocity),
      angle: body.angle,
      angularVelocity: body.angularVelocity,
    },
    hull: clampedHull,
    invulnerableTicksRemaining: 0,
    thrusters: idleThrusters(),
    outcome: clampedHull <= 0 ? "destroyed" : "flying",
    progress: 0,
    eyeSensorRadius,
    eyeSensor: scanEyeSensor(field, position, body.angle, eyeSensorRadius, 0),
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
    distanceToStart: Math.hypot(position.x - spawn.x, position.y - spawn.y),
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
  scales: Scales,
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
    gravityScale: scales.gravityScale,
    gravity: GRAVITY * scales.gravityScale,
    bottomThrusterScale: scales.bottomThrusterScale,
    rearThrusterScale: scales.rearThrusterScale,
    sensors: sensorSuiteFor(current, spawn),
  };
}

export function createSimulation(options: SimulationOptions = {}): Simulation {
  const pinnedField = options.field;
  let activeField: Field =
    pinnedField ?? createField(options.seed ?? DEFAULT_SEED);

  const bodyTemplate = initialBody(options.start);
  const hullTemplate = options.hull ?? INITIAL_HULL;
  const spawn = copyVec(bodyTemplate.position);
  const spawnX = spawn.x;
  let configuredEyeSensorRadius = clampEyeSensorRadius(
    options.eyeSensorRadius ?? EYE_SENSOR_VIEW_DEFAULT,
  );
  let current = initialCurrent(
    bodyTemplate,
    hullTemplate,
    configuredEyeSensorRadius,
    activeField,
  );

  const scales: Scales = {
    gravityScale: normalizeScale(
      options.gravityScale ?? GRAVITY_SCALE_DEFAULT,
      GRAVITY_SCALE_MIN,
      GRAVITY_SCALE_MAX,
      GRAVITY_SCALE_DEFAULT,
    ),
    bottomThrusterScale: normalizeScale(
      options.bottomThrusterScale ?? THRUSTER_SCALE_DEFAULT,
      THRUSTER_SCALE_MIN,
      THRUSTER_SCALE_MAX,
      THRUSTER_SCALE_DEFAULT,
    ),
    rearThrusterScale: normalizeScale(
      options.rearThrusterScale ?? THRUSTER_SCALE_DEFAULT,
      THRUSTER_SCALE_MIN,
      THRUSTER_SCALE_MAX,
      THRUSTER_SCALE_DEFAULT,
    ),
  };

  const getState = (): SimState =>
    toSimState(current, activeField.seed, spawn, scales);

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
      tunnelCenterOffset:
        (position.x - center.x) * normal.x +
        (position.y - center.y) * normal.y,
      tunnelHalfWidth: activeField.tunnel.halfWidthAt(position.x),
      tunnelHeading: heading,
      forwardSpeed: velocity.x * tangent.x + velocity.y * tangent.y,
      lateralSpeed: velocity.x * normal.x + velocity.y * normal.y,
      eyeSensorRadius: current.eyeSensorRadius,
      gravityScale: scales.gravityScale,
      gravity: GRAVITY * scales.gravityScale,
      bottomThrusterScale: scales.bottomThrusterScale,
      rearThrusterScale: scales.rearThrusterScale,
      sensors: sensorSuiteFor(current, spawn),
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

      const effect = thrusterEffect(
        current.body.angle,
        action,
        scales.bottomThrusterScale,
        scales.rearThrusterScale,
      );
      const gravity = GRAVITY * scales.gravityScale;
      const velocity = applyLinearDrag(
        {
          x:
            current.body.velocity.x +
            (effect.force.x / SHIP_MASS) * FIXED_DT,
          y:
            current.body.velocity.y +
            (effect.force.y / SHIP_MASS - gravity) * FIXED_DT,
        },
        FIXED_DT,
      );
      const angularVelocity = applyAngularDrag(
        current.body.angularVelocity +
          (effect.torque / SHIP_INERTIA) * FIXED_DT,
        FIXED_DT,
      );

      const advanced = advanceWithCollisions(
        activeField,
        current.body.position,
        velocity,
        current.body.angle,
        angularVelocity,
        FIXED_DT,
      );

      const wasInvulnerable = current.invulnerableTicksRemaining > 0;
      let invulnerableTicksRemaining = wasInvulnerable
        ? current.invulnerableTicksRemaining - 1
        : 0;
      let hull = current.hull;
      if (!wasInvulnerable && advanced.maxImpactSpeed > DAMAGE_SPEED_THRESHOLD) {
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
      const outcome: RunOutcome = hull <= 0 ? "destroyed" : "flying";
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
    setGravityScale: (scale: number): void => {
      scales.gravityScale = normalizeScale(
        scale,
        GRAVITY_SCALE_MIN,
        GRAVITY_SCALE_MAX,
        GRAVITY_SCALE_DEFAULT,
      );
    },
    setBottomThrusterScale: (scale: number): void => {
      scales.bottomThrusterScale = normalizeScale(
        scale,
        THRUSTER_SCALE_MIN,
        THRUSTER_SCALE_MAX,
        THRUSTER_SCALE_DEFAULT,
      );
    },
    setRearThrusterScale: (scale: number): void => {
      scales.rearThrusterScale = normalizeScale(
        scale,
        THRUSTER_SCALE_MIN,
        THRUSTER_SCALE_MAX,
        THRUSTER_SCALE_DEFAULT,
      );
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
