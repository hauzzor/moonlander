import {
  createAutopilot,
  createSimulation,
  FIXED_DT,
  type Controller,
  type SimState,
} from "@moonlander/sim";
import { createCamera, snapCamera, updateCamera } from "./camera";
import { createHud } from "./hud";
import { createInput } from "./input";
import { createRenderer } from "./render";
import { DEFAULT_SEED, nextSeed, parseSeed } from "./seed";
import { createSeedControls } from "./seed-controls";
import { createSensorConsole } from "./sensor-console";

const MAX_FRAME_SECONDS = 0.25;

export function startGame(): void {
  const urlSeed = parseSeed(
    new URLSearchParams(window.location.search).get("seed"),
  );
  let currentSeed = urlSeed ?? DEFAULT_SEED;
  const sim = createSimulation({ seed: currentSeed });
  let autopilot: Controller | null = null;
  let autopilotEnabled = false;
  const camera = createCamera();
  const hud = createHud();
  const renderer = createRenderer();
  const sensorConsole = createSensorConsole({
    getEyeSensorRadius: () => sim.getState().eyeSensorRadius,
    setEyeSensorRadius: (radius) => {
      sim.setEyeSensorRadius(radius);
    },
  });
  let accumulator = 0;
  let lastTime = performance.now();
  let animationId: number | null = null;

  const renderState = (state: SimState): void => {
    renderer.render(state, sim.field, camera);
  };

  function resetRun(seed: number): void {
    input.release();
    autopilot?.reset?.();
    accumulator = 0;
    currentSeed = seed >>> 0;

    const state = sim.reset(currentSeed);
    currentSeed = state.seed >>> 0;
    seedControls.applySeed(currentSeed);

    snapCamera(camera, state);
    hud.update(state, autopilotEnabled);
    sensorConsole.update(state);
    renderState(state);
    lastTime = performance.now();
  }

  function restart(): void {
    resetRun(nextSeed(currentSeed));
  }

  function getAutopilot(): Controller {
    if (autopilot === null) {
      autopilot = createAutopilot();
    }
    return autopilot;
  }

  function toggleAutopilot(): void {
    if (autopilotEnabled) {
      autopilotEnabled = false;
      input.release();
      autopilot?.reset?.();
    } else {
      const controller = getAutopilot();
      controller.reset?.();
      autopilotEnabled = true;
      input.release();
    }
    hud.update(sim.getState(), autopilotEnabled);
  }

  const seedControls = createSeedControls({
    getCurrentSeed: () => currentSeed,
    onLoadSeed: (seed) => {
      resetRun(seed);
    },
  });
  const input = createInput({
    onRestart: restart,
    onToggleAutopilot: toggleAutopilot,
    isAutopilotActive: () => autopilotEnabled,
  });

  function stepSimulation(): void {
    const action = autopilotEnabled
      ? getAutopilot().act(sim.getObservation())
      : {
          left: input.keys.left,
          right: input.keys.right,
          rear: input.keys.rear,
        };
    sim.step(action);
  }

  function frame(now: number): void {
    const elapsed = Math.max(0, (now - lastTime) / 1000);
    lastTime = now;
    const frameTime = Math.min(elapsed, MAX_FRAME_SECONDS);
    accumulator += frameTime;

    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 120) {
      stepSimulation();
      accumulator -= FIXED_DT;
      steps += 1;
    }

    if (steps === 120) {
      accumulator = 0;
    }

    const state = sim.getState();
    updateCamera(camera, state, frameTime);
    hud.update(state, autopilotEnabled);
    sensorConsole.update(state);
    renderState(state);

    animationId = requestAnimationFrame(frame);
  }

  window.addEventListener("resize", () => {
    renderer.resize();
    sensorConsole.resize();
    renderState(sim.getState());
  });

  renderer.resize();
  const initialState = sim.getState();
  currentSeed = initialState.seed >>> 0;
  seedControls.applySeed(currentSeed);
  snapCamera(camera, initialState);
  hud.update(initialState, autopilotEnabled);
  sensorConsole.update(initialState);
  renderState(initialState);
  lastTime = performance.now();
  animationId = requestAnimationFrame(frame);

  window.addEventListener("beforeunload", () => {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
    }
  });
}
