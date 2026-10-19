import type { Action } from "@moonlander/sim";

export interface InputOptions {
  onRestart(): void;
  onToggleAutopilot(): void;
  isAutopilotActive(): boolean;
}

export interface InputController {
  readonly keys: Action;
  release(): void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function createInput(options: InputOptions): InputController {
  const keys: Action = { left: false, right: false, rear: false };
  const release = (): void => {
    keys.left = false;
    keys.right = false;
    keys.rear = false;
  };

  window.addEventListener("keydown", (event) => {
    if (isEditableTarget(event.target)) {
      return;
    }

    if (event.code === "Space" || event.key === " ") {
      if (!event.repeat && !options.isAutopilotActive()) {
        keys.rear = !keys.rear;
      }
      event.preventDefault();
      return;
    }

    const key = event.key.toLowerCase();

    if (key === "q") {
      if (!options.isAutopilotActive()) {
        keys.left = true;
      }
      event.preventDefault();
    } else if (key === "w") {
      if (!options.isAutopilotActive()) {
        keys.right = true;
      }
      event.preventDefault();
    } else if (key === "e") {
      if (!event.repeat) {
        options.onToggleAutopilot();
      }
      event.preventDefault();
    } else if (key === "r") {
      if (!event.repeat) {
        options.onRestart();
      }
      event.preventDefault();
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();

    if (key === "q") {
      keys.left = false;
      if (!isEditableTarget(event.target)) {
        event.preventDefault();
      }
    } else if (key === "w") {
      keys.right = false;
      if (!isEditableTarget(event.target)) {
        event.preventDefault();
      }
    } else if (event.code === "Space" || event.key === " ") {
      if (!isEditableTarget(event.target)) {
        event.preventDefault();
      }
    }
  });

  window.addEventListener("blur", release);
  window.addEventListener("pagehide", release);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      release();
    }
  });

  return { keys, release };
}
