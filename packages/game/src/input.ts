import type { Action } from "@moonlander/sim";

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

export function createInput(onRestart: () => void): InputController {
  const keys: Action = { left: false, right: false };
  const release = (): void => {
    keys.left = false;
    keys.right = false;
  };

  window.addEventListener("keydown", (event) => {
    if (isEditableTarget(event.target)) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === "q") {
      keys.left = true;
      event.preventDefault();
    } else if (key === "w") {
      keys.right = true;
      event.preventDefault();
    } else if (key === "r") {
      if (!event.repeat) {
        onRestart();
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
