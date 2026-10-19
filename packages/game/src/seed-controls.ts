import { getElement } from "./dom";
import { parseSeed } from "./seed";

export interface SeedControlsOptions {
  getCurrentSeed(): number;
  onLoadSeed(seed: number): void;
}

export interface SeedControlsController {
  applySeed(seed: number): void;
}

export function createSeedControls(
  options: SeedControlsOptions,
): SeedControlsController {
  const seedInput = getElement('[data-testid="seed-input"]', HTMLInputElement);
  const seedLoad = getElement('[data-testid="seed-load"]', HTMLButtonElement);
  const seedCopy = getElement("#seed-copy", HTMLButtonElement);

  const loadSeedFromInput = (): void => {
    const parsed = parseSeed(seedInput.value);
    if (parsed === null) {
      seedInput.setAttribute("aria-invalid", "true");
      seedInput.classList.add("invalid");
      return;
    }

    options.onLoadSeed(parsed);
  };

  const copySeed = async (): Promise<void> => {
    const seed = String(options.getCurrentSeed());
    try {
      await navigator.clipboard.writeText(seed);
      seedCopy.textContent = "COPIED";
    } catch {
      seedCopy.textContent = "COPY";
      return;
    }

    window.setTimeout(() => {
      seedCopy.textContent = "COPY";
    }, 1200);
  };

  seedLoad.addEventListener("click", loadSeedFromInput);
  seedCopy.addEventListener("click", () => {
    void copySeed();
  });
  seedInput.addEventListener("input", () => {
    seedInput.removeAttribute("aria-invalid");
    seedInput.classList.remove("invalid");
  });
  seedInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadSeedFromInput();
    }
  });

  return {
    applySeed(seed: number): void {
      seedInput.value = String(seed);
      seedInput.removeAttribute("aria-invalid");
      seedInput.classList.remove("invalid");
    },
  };
}
