import { PLANET_GRAVITY_RANGE } from "./constants";
import type { Planet, Vec2 } from "./types";

const DIRECTION_EPSILON = 1e-9;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function gravityMagnitudeAtDistance(
  planet: Planet,
  distance: number,
): number {
  if (!(distance > 0)) {
    return 0;
  }

  if (distance < planet.radius) {
    return planet.surfaceGravity * (distance / planet.radius);
  }

  const outerRadius = planet.radius + PLANET_GRAVITY_RANGE;
  if (distance >= outerRadius) {
    return 0;
  }

  const cutoff = 1 - smoothstep((distance - planet.radius) / PLANET_GRAVITY_RANGE);
  return planet.surfaceGravity * (planet.radius / distance) ** 2 * cutoff;
}

export function planetGravityAt(
  planet: Planet,
  position: Vec2,
  gravityScale = 1,
): Vec2 {
  const dx = planet.position.x - position.x;
  const dy = planet.position.y - position.y;
  const distance = Math.hypot(dx, dy);
  if (!(distance > DIRECTION_EPSILON)) {
    return { x: 0, y: 0 };
  }

  const magnitude =
    gravityMagnitudeAtDistance(planet, distance) * gravityScale;
  if (!(magnitude > 0)) {
    return { x: 0, y: 0 };
  }

  const sign = planet.polarity === "repel" ? -1 : 1;
  return {
    x: (dx / distance) * magnitude * sign,
    y: (dy / distance) * magnitude * sign,
  };
}

export function gravityAccelerationAt(
  position: Vec2,
  planets: readonly Planet[],
  gravityScale = 1,
): Vec2 {
  let x = 0;
  let y = 0;

  for (const planet of planets) {
    const acceleration = planetGravityAt(planet, position, gravityScale);
    x += acceleration.x;
    y += acceleration.y;
  }

  return { x, y };
}
