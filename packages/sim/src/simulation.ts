import {
  DAMAGE_SCALE,
  DAMAGE_SPEED_THRESHOLD,
  FIXED_DT,
  GATE_BONUS,
  GRAVITY,
  INITIAL_HULL,
  INVULNERABILITY_SECONDS,
  SHIP_INERTIA,
  SHIP_MASS,
  START_POSITION,
} from "./constants";
import {
  advanceWithCollisions,
  findGateCrossings,
  nearestGateObservation,
  nearestWallDistance,
} from "./collision";
import { createField } from "./field";
import { clamp } from "./geometry";
import { thrusterEffect } from "./physics";
import type {
  Action,
  Field,
  Observation,
  RunOutcome,
  ShipState,
  ShipStart,
  SimState,
  Simulation,
  SimulationOptions,
  Vec2,
} from "./types";

const DEFAULT_SEED = 1;
const INVULNERABILITY_TICKS = Math.round(INVULNERABILITY_SECONDS / FIXED_DT);

interface Current {
  tick: number;
  body: ShipState;
  hull: number;
  invulnerableTicksRemaining: number;
  thrusters: Action;
  outcome: RunOutcome;
  progress: number;
  gatesPassed: number;
  passedGateIds: ReadonlySet<string>;
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

function initialCurrent(body: ShipState, hull: number): Current {
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
    thrusters: { left: false, right: false },
    outcome: hull <= 0 ? "destroyed" : "flying",
    progress: 0,
    gatesPassed: 0,
    passedGateIds: new Set<string>(),
  };
}

function toSimState(current: Current, seed: number): SimState {
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
    },
    outcome: current.outcome,
    score: Math.floor(current.progress) + current.gatesPassed * GATE_BONUS,
    progress: current.progress,
    gatesPassed: current.gatesPassed,
  };
}

export function createSimulation(options: SimulationOptions = {}): Simulation {
  const pinnedField = options.field;
  let activeField: Field = pinnedField ?? createField(options.seed ?? DEFAULT_SEED);

  const bodyTemplate = initialBody(options.start);
  const hullTemplate = options.hull ?? INITIAL_HULL;
  const spawnPosition = copyVec(bodyTemplate.position);
  let current = initialCurrent(bodyTemplate, hullTemplate);

  const getState = (): SimState => toSimState(current, activeField.seed);

  const getObservation = (): Observation => {
    const gateObservation = nearestGateObservation(
      activeField,
      current.body.position,
      current.passedGateIds,
    );
    return {
      x: current.body.position.x,
      y: current.body.position.y,
      vx: current.body.velocity.x,
      vy: current.body.velocity.y,
      angle: current.body.angle,
      angularVelocity: current.body.angularVelocity,
      hull: current.hull,
      progress: current.progress,
      score: Math.floor(current.progress) + current.gatesPassed * GATE_BONUS,
      nearestWallDistance: nearestWallDistance(
        activeField,
        current.body.position,
        current.body.angle,
      ),
      nearestGateDistance: gateObservation.distance,
      nearestGateAngle: gateObservation.angle,
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
      const velocity: Vec2 = {
        x: current.body.velocity.x + (effect.force.x / SHIP_MASS) * FIXED_DT,
        y:
          current.body.velocity.y +
          (effect.force.y / SHIP_MASS - GRAVITY) * FIXED_DT,
      };
      const angularVelocity =
        current.body.angularVelocity +
        (effect.torque / SHIP_INERTIA) * FIXED_DT;

      const previousPosition = copyVec(current.body.position);
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

      const crossedGates = findGateCrossings(
        activeField,
        previousPosition,
        advanced.position,
        current.passedGateIds,
        advanced.collidedGateIds,
      );
      let passedGateIds = current.passedGateIds;
      let gatesPassed = current.gatesPassed;
      if (crossedGates.length > 0) {
        const nextPassed = new Set(current.passedGateIds);
        for (const gate of crossedGates) {
          nextPassed.add(gate.id);
        }
        passedGateIds = nextPassed;
        gatesPassed += crossedGates.length;
      }

      const distanceFromSpawn = Math.hypot(
        advanced.position.x - spawnPosition.x,
        advanced.position.y - spawnPosition.y,
      );
      const progress = Math.max(current.progress, distanceFromSpawn);

      current = {
        tick: current.tick + 1,
        body: {
          position: advanced.position,
          velocity: advanced.velocity,
          angle: advanced.angle,
          angularVelocity,
        },
        hull,
        invulnerableTicksRemaining,
        thrusters: { left: action.left, right: action.right },
        outcome: hull <= 0 ? "destroyed" : "flying",
        progress,
        gatesPassed,
        passedGateIds,
      };

      return getState();
    },
    reset: (seed?: number): SimState => {
      if (!pinnedField && seed !== undefined) {
        activeField = createField(seed);
      }
      current = initialCurrent(bodyTemplate, hullTemplate);
      return getState();
    },
  };
}
