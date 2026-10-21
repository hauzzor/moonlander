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
  PLANET_GRAVITY_RANGE,
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
import { createEmptyField, createField } from "./field";
import { clamp } from "./geometry";
import {
  applyAngularDrag,
  applyLinearDrag,
  thrusterEffect,
} from "./physics";
import { clampEyeSensorRadius, scanEyeSensor } from "./sensor";
import { createSpaceField } from "./space-field";
import { createTunnelWorld } from "./world";
import type {
  Action,
  EyeSensorReading,
  Field,
  LevelId,
  Observation,
  Planet,
  RunOutcome,
  SensorSuite,
  ShipState,
  ShipStart,
  SimState,
  Simulation,
  SimulationOptions,
  ThrusterState,
  Vec2,
  World,
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
  thrusters: ThrusterState;
  outcome: RunOutcome;
  progress: number;
  eyeSensorRadius: number;
  eyeSensor: EyeSensorReading;
}

interface Scales {
  gravityScale: number;
  bottomThrusterScale: number;
  topThrusterScale: number;
  rearThrusterScale: number;
}

interface BuiltWorld {
  field: Field;
  world: World;
}

function copyVec(vector: Vec2): Vec2 {
  return { x: vector.x, y: vector.y };
}

function idleThrusters(): ThrusterState {
  return { left: false, right: false, rear: false, top: false };
}

function normalizeThrusters(action: Action): ThrusterState {
  return {
    left: action.left,
    right: action.right,
    rear: action.rear,
    top: action.top ?? false,
  };
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
  world: World,
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
    eyeSensor: scanEyeSensor(world, position, body.angle, eyeSensorRadius, 0),
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

function gravityAccelerationAt(world: World, position: Vec2): Vec2 {
  const acceleration = world.gravityAt(position);
  return { x: acceleration.x, y: acceleration.y };
}

function planetsNear(world: World, position: Vec2): readonly Planet[] {
  return world.planetsInView(position, PLANET_GRAVITY_RANGE);
}

function toSimState(
  current: Current,
  seed: number,
  level: LevelId,
  spawn: Vec2,
  scales: Scales,
  world: World,
): SimState {
  return {
    tick: current.tick,
    time: current.tick * FIXED_DT,
    seed,
    level,
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
      top: current.thrusters.top,
    },
    outcome: current.outcome,
    score: scoreFor(current.progress),
    progress: current.progress,
    eyeSensorRadius: current.eyeSensorRadius,
    gravityScale: scales.gravityScale,
    gravity: level === "sandworm" ? GRAVITY * scales.gravityScale : 0,
    gravityAcceleration: gravityAccelerationAt(world, current.body.position),
    bottomThrusterScale: scales.bottomThrusterScale,
    topThrusterScale: scales.topThrusterScale,
    rearThrusterScale: scales.rearThrusterScale,
    planets: planetsNear(world, current.body.position),
    sensors: sensorSuiteFor(current, spawn),
  };
}

function tunnelFrame(
  world: World,
  position: Vec2,
  velocity: Vec2,
): {
  tunnelCenterOffset: number;
  tunnelHalfWidth: number;
  tunnelHeading: number;
  forwardSpeed: number;
  lateralSpeed: number;
} {
  if (world.kind !== "tunnel") {
    return {
      tunnelCenterOffset: 0,
      tunnelHalfWidth: 0,
      tunnelHeading: 0,
      forwardSpeed: velocity.x,
      lateralSpeed: velocity.y,
    };
  }

  const { tunnel } = world.field;
  const center = tunnel.centerAt(position.x);
  const heading = tunnel.headingAt(position.x);
  const tangent = { x: Math.cos(heading), y: Math.sin(heading) };
  const normal = { x: -Math.sin(heading), y: Math.cos(heading) };

  return {
    tunnelCenterOffset:
      (position.x - center.x) * normal.x +
      (position.y - center.y) * normal.y,
    tunnelHalfWidth: tunnel.halfWidthAt(position.x),
    tunnelHeading: heading,
    forwardSpeed: velocity.x * tangent.x + velocity.y * tangent.y,
    lateralSpeed: velocity.x * normal.x + velocity.y * normal.y,
  };
}

export function createSimulation(options: SimulationOptions = {}): Simulation {
  const level: LevelId = options.level ?? "sandworm";
  const pinnedField = options.field;
  const bodyTemplate = initialBody(options.start);
  const hullTemplate = options.hull ?? INITIAL_HULL;
  const spawn = copyVec(bodyTemplate.position);
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
    topThrusterScale: normalizeScale(
      options.topThrusterScale ?? THRUSTER_SCALE_DEFAULT,
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

  function buildWorld(seed: number): BuiltWorld {
    if (level === "sandworm") {
      const field = pinnedField ?? createField(seed);
      return {
        field,
        world: createTunnelWorld(field, spawn, () => scales.gravityScale),
      };
    }

    return {
      field: createEmptyField(seed),
      world: createSpaceField(level, seed, spawn, () => scales.gravityScale),
    };
  }

  const built = buildWorld(options.seed ?? DEFAULT_SEED);
  let activeField = built.field;
  let activeWorld = built.world;

  let configuredEyeSensorRadius = clampEyeSensorRadius(
    options.eyeSensorRadius ?? EYE_SENSOR_VIEW_DEFAULT,
  );
  let current = initialCurrent(
    bodyTemplate,
    hullTemplate,
    configuredEyeSensorRadius,
    activeWorld,
  );

  const getState = (): SimState =>
    toSimState(
      current,
      activeWorld.seed,
      level,
      spawn,
      scales,
      activeWorld,
    );

  const getObservation = (): Observation => {
    const { position, velocity } = current.body;
    const frame = tunnelFrame(activeWorld, position, velocity);

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
      level,
      nearestWallDistance: nearestWallDistance(
        activeWorld,
        position,
        current.body.angle,
      ),
      tunnelCenterOffset: frame.tunnelCenterOffset,
      tunnelHalfWidth: frame.tunnelHalfWidth,
      tunnelHeading: frame.tunnelHeading,
      forwardSpeed: frame.forwardSpeed,
      lateralSpeed: frame.lateralSpeed,
      eyeSensorRadius: current.eyeSensorRadius,
      gravityScale: scales.gravityScale,
      gravity: level === "sandworm" ? GRAVITY * scales.gravityScale : 0,
      gravityAcceleration: gravityAccelerationAt(activeWorld, position),
      bottomThrusterScale: scales.bottomThrusterScale,
      topThrusterScale: scales.topThrusterScale,
      rearThrusterScale: scales.rearThrusterScale,
      planets: planetsNear(activeWorld, position),
      sensors: sensorSuiteFor(current, spawn),
    };
  };

  return {
    getState,
    getObservation,
    get level(): LevelId {
      return level;
    },
    get world(): World {
      return activeWorld;
    },
    get field(): Field {
      return activeField;
    },
    step: (action: Action): SimState => {
      if (current.outcome !== "flying") {
        return getState();
      }

      activeWorld.stepBodies(FIXED_DT);

      const thrusters = normalizeThrusters(action);
      const effect = thrusterEffect(
        current.body.angle,
        action,
        scales.bottomThrusterScale,
        scales.rearThrusterScale,
      );
      const gravityAcceleration = gravityAccelerationAt(
        activeWorld,
        current.body.position,
      );
      const velocity = applyLinearDrag(
        {
          x:
            current.body.velocity.x +
            (effect.force.x / SHIP_MASS + gravityAcceleration.x) * FIXED_DT,
          y:
            current.body.velocity.y +
            (effect.force.y / SHIP_MASS + gravityAcceleration.y) * FIXED_DT,
        },
        FIXED_DT,
      );
      const angularVelocity = applyAngularDrag(
        current.body.angularVelocity +
          (effect.torque / SHIP_INERTIA) * FIXED_DT,
        FIXED_DT,
      );

      const advanced = advanceWithCollisions(
        activeWorld,
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
        Math.max(0, activeWorld.progressAt(advanced.position)),
      );
      const tick = current.tick + 1;
      const outcome: RunOutcome = hull <= 0 ? "destroyed" : "flying";
      const eyeSensor =
        outcome === "flying" && tick % EYE_SENSOR_INTERVAL_TICKS === 0
          ? scanEyeSensor(
              activeWorld,
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
        thrusters,
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
    setTopThrusterScale: (scale: number): void => {
      scales.topThrusterScale = normalizeScale(
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
      if (level === "sandworm") {
        if (!pinnedField && seed !== undefined) {
          const field = createField(seed);
          activeField = field;
          activeWorld = createTunnelWorld(
            field,
            spawn,
            () => scales.gravityScale,
          );
        }
      } else if (seed !== undefined) {
        activeField = createEmptyField(seed);
        activeWorld = createSpaceField(
          level,
          seed,
          spawn,
          () => scales.gravityScale,
        );
      }

      current = initialCurrent(
        bodyTemplate,
        hullTemplate,
        configuredEyeSensorRadius,
        activeWorld,
      );
      return getState();
    },
  };
}
