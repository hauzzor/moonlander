import { createSimulation, FIXED_DT, type SimState } from "@moonlander/sim";
import { createCamera, snapCamera, updateCamera } from "./camera";
import { createHud } from "./hud";
import { createInput } from "./input";
import { createRenderer } from "./render";
import { DEFAULT_SEED, nextSeed, parseSeed } from "./seed";
import { createSeedControls } from "./seed-controls";

const MAX_FRAME_SECONDS = 0.25;

export function startGame(): void {
  const urlSeed = parseSeed(
    new URLSearchParams(window.location.search).get("seed"),
  );
  let currentSeed = urlSeed ?? DEFAULT_SEED;
  const sim = createSimulation({ seed: currentSeed });
  const camera = createCamera();
  const hud = createHud();
  const renderer = createRenderer();
  let accumulator = 0;
  let lastTime = performance.now();
  let animationId: number | null = null;

  const renderState = (state: SimState): void => {
    renderer.render(state, sim.field, camera);
  };

  function resetRun(seed: number): void {
    input.release();
    accumulator = 0;
    currentSeed = seed >>> 0;

    const state = sim.reset(currentSeed);
    currentSeed = state.seed >>> 0;
    seedControls.applySeed(currentSeed);

    snapCamera(camera, state);
    hud.update(state);
    renderState(state);
    lastTime = performance.now();
  }

  function restart(): void {
    resetRun(nextSeed(currentSeed));
  }

  const seedControls = createSeedControls({
    getCurrentSeed: () => currentSeed,
    onLoadSeed: (seed) => {
      resetRun(seed);
    },
  });
  const input = createInput(restart);

  function stepSimulation(): void {
    sim.step({ left: input.keys.left, right: input.keys.right });
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
    hud.update(state);
    renderState(state);

    animationId = requestAnimationFrame(frame);
  }

  window.addEventListener("resize", () => {
    renderer.resize();
    renderState(sim.getState());
  });

  renderer.resize();
  const initialState = sim.getState();
  currentSeed = initialState.seed >>> 0;
  seedControls.applySeed(currentSeed);
  snapCamera(camera, initialState);
  hud.update(initialState);
  renderState(initialState);
  lastTime = performance.now();
  animationId = requestAnimationFrame(frame);

  window.addEventListener("beforeunload", () => {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
    }
  });
}
