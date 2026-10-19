import { describe, expect, it } from "vitest";
import type { Action, Controller } from "../src/index";
import { sim } from "./helpers";

const BENCHMARK_SEEDS = [1, 7, 42, 1234, 2026, 5678, 99991, 314159] as const;
const BENCHMARK_TICKS = 60 * 120;

function expectThrusterAction(action: Action): void {
  expect(Object.keys(action).sort()).toEqual(["left", "rear", "right"]);
  expect(typeof action.left).toBe("boolean");
  expect(typeof action.right).toBe("boolean");
  expect(typeof action.rear).toBe("boolean");
}

describe("deterministic sim autopilot", () => {
  it("returns a Controller that emits all three thruster commands", () => {
    const autopilot: Controller = sim.createAutopilot();
    const observation = sim.createSimulation({ seed: 1 }).getObservation();
    const action = autopilot.act(observation);

    expectThrusterAction(action);
  });

  it("produces identical actions and states for identical observation replays", () => {
    const firstSimulation = sim.createSimulation({ seed: 42 });
    const secondSimulation = sim.createSimulation({ seed: 42 });
    const firstController = sim.createAutopilot();
    const secondController = sim.createAutopilot();

    for (let tick = 0; tick < 600; tick += 1) {
      const firstAction = firstController.act(firstSimulation.getObservation());
      const secondAction = secondController.act(secondSimulation.getObservation());
      expectThrusterAction(firstAction);
      expect(firstAction).toEqual(secondAction);
      expect(firstSimulation.step(firstAction)).toEqual(secondSimulation.step(secondAction));
    }
  });

  it("meets the confirmed eight-seed, 60-second zero-contact flight benchmark", () => {
    const progressBySeed: number[] = [];
    let forwardSpeedTotal = 0;

    for (const seed of BENCHMARK_SEEDS) {
      const simulation = sim.createSimulation({ seed });
      const autopilot = sim.createAutopilot();
      let state = simulation.getState();

      for (let tick = 0; tick < BENCHMARK_TICKS; tick += 1) {
        const observation = simulation.getObservation();
        expect(observation.nearestWallDistance).toBeGreaterThan(0);
        expect(state.hull).toBe(100);

        const action = autopilot.act(observation);
        expectThrusterAction(action);
        state = simulation.step(action);

        expect(state.hull).toBe(100);
        const afterStep = simulation.getObservation();
        expect(afterStep.nearestWallDistance).toBeGreaterThan(0);
        forwardSpeedTotal += afterStep.forwardSpeed;
      }

      expect(state.tick).toBe(BENCHMARK_TICKS);
      expect(state.time).toBeCloseTo(60, 10);
      expect(state.progress).toBeGreaterThanOrEqual(400);
      progressBySeed.push(state.progress);
    }

    const orderedProgress = [...progressBySeed].sort((a, b) => a - b);
    const medianProgress = (orderedProgress[3]! + orderedProgress[4]!) / 2;
    const averageForwardSpeed = forwardSpeedTotal / (BENCHMARK_SEEDS.length * BENCHMARK_TICKS);

    expect(medianProgress).toBeGreaterThanOrEqual(500);
    expect(averageForwardSpeed).toBeGreaterThanOrEqual(8);
  }, 30_000);
});
