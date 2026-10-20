import { describe, expect, it } from "vitest";
import type { Action, Controller } from "../src/index";
import { sim } from "./helpers";

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
});
