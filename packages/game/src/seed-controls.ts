import { parseSeed } from "./seed";

export interface SeedControlsOptions {
  getCurrentSeed(): number;
  onLoadSeed(seed: number): void;
}

export interface SeedControlsController {
  applySeed(seed: number): void;
}

function requireElement<T extends Element>(
  selector: string,
  constructor: { new (): T },
): T {
  const element = document.querySelector(selector);

  if (element === null || !(element instanceof constructor)) {
    throw new Error(`Missing or invalid element: ${selector}`);
  }

  return element;
}

function optionalElement(selector: string): HTMLElement | null {
  const element = document.querySelector(selector);
  return element === null ? null : (element as HTMLElement);
}

export function createSeedControls(
  options: SeedControlsOptions,
): SeedControlsController {
  const seedInput = requireElement(
    '[data-testid="seed-input"]',
    HTMLInputElement,
  );
  const seedLoad = requireElement(
    '[data-testid="seed-load"]',
    HTMLElement,
  );
  const seedCopy = optionalElement("#seed-copy");

  const markInvalid = (invalid: boolean): void => {
    if (invalid) {
      seedInput.setAttribute("aria-invalid", "true");
      seedInput.classList.add("invalid");
    } else {
      seedInput.removeAttribute("aria-invalid");
      seedInput.classList.remove("invalid");
    }
  };

  const loadSeedFromInput = (): void => {
    const parsed = parseSeed(seedInput.value);

    if (parsed === null) {
      markInvalid(true);
      return;
    }

    markInvalid(false);
    options.onLoadSeed(parsed);
  };

  const copySeed = async (): Promise<void> => {
    if (seedCopy === null) {
      return;
    }

    const seed = String(options.getCurrentSeed());
    const clipboard =
      typeof navigator === "undefined" ? undefined : navigator.clipboard;

    if (clipboard === undefined) {
      return;
    }

    try {
      await clipboard.writeText(seed);
    } catch {
      seedCopy.textContent = "COPY";
      return;
    }

    seedCopy.textContent = "COPIED";
    setTimeout(() => {
      seedCopy.textContent = "COPY";
    }, 1200);
  };

  seedLoad.addEventListener("click", loadSeedFromInput);
  seedCopy?.addEventListener("click", () => {
    void copySeed();
  });
  seedInput.addEventListener("input", () => {
    markInvalid(false);
  });
  seedInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadSeedFromInput();
    }
  });

  return {
    applySeed(seed: number): void {
      seedInput.value = String(seed >>> 0);
      markInvalid(false);
    },
  };
}
