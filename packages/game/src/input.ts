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

interface EditableTargetLike {
  tagName?: unknown;
  isContentEditable?: unknown;
  type?: unknown;
  getAttribute?: (name: string) => string | null;
}

const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "number",
  "email",
  "password",
  "url",
  "tel",
]);

function inputType(element: EditableTargetLike): string {
  let type: unknown = element.type;

  if (
    (typeof type !== "string" || type.length === 0) &&
    typeof element.getAttribute === "function"
  ) {
    type = element.getAttribute("type");
  }

  if (typeof type !== "string") {
    return "text";
  }

  const normalized = type.trim().toLowerCase();
  return normalized.length === 0 ? "text" : normalized;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (target === null || typeof target !== "object") {
    return false;
  }

  const element = target as EditableTargetLike;

  if (element.isContentEditable === true) {
    return true;
  }

  const tagName =
    typeof element.tagName === "string"
      ? element.tagName.toLowerCase()
      : "";

  if (tagName === "textarea") {
    return true;
  }

  if (tagName === "input") {
    return TEXT_INPUT_TYPES.has(inputType(element));
  }

  return false;
}

function preventDefault(event: KeyboardEvent): void {
  if (typeof event.preventDefault === "function") {
    event.preventDefault();
  }
}

function eventKey(event: KeyboardEvent): string {
  return typeof event.key === "string" ? event.key.toLowerCase() : "";
}

function eventCode(event: KeyboardEvent): string {
  return typeof event.code === "string" ? event.code : "";
}

const KEY_Q = "q";
const KEY_W = "w";
const KEY_E = "e";
const KEY_R = "r";
const CODE_Q = "KeyQ";
const CODE_W = "KeyW";
const CODE_E = "KeyE";
const CODE_R = "KeyR";
const CODE_SPACE = "Space";

function isSpace(key: string, code: string): boolean {
  return (
    code === CODE_SPACE ||
    key === " " ||
    key === "space" ||
    key === "spacebar"
  );
}

function isLeft(key: string, code: string): boolean {
  return key === KEY_Q || code === CODE_Q;
}

function isRight(key: string, code: string): boolean {
  return key === KEY_W || code === CODE_W;
}

function isAutopilotKey(key: string, code: string): boolean {
  return key === KEY_E || code === CODE_E;
}

function isRestartKey(key: string, code: string): boolean {
  return key === KEY_R || code === CODE_R;
}

export function createInput(options: InputOptions): InputController {
  const keys: Action = { left: false, right: false, rear: false };

  const release = (): void => {
    keys.left = false;
    keys.right = false;
    keys.rear = false;
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target)) {
      return;
    }

    const key = eventKey(event);
    const code = eventCode(event);

    if (isSpace(key, code)) {
      preventDefault(event);

      if (!event.repeat && !options.isAutopilotActive()) {
        keys.rear = !keys.rear;
      }

      return;
    }

    if (isLeft(key, code)) {
      preventDefault(event);

      if (!options.isAutopilotActive()) {
        keys.left = true;
      }

      return;
    }

    if (isRight(key, code)) {
      preventDefault(event);

      if (!options.isAutopilotActive()) {
        keys.right = true;
      }

      return;
    }

    if (isAutopilotKey(key, code)) {
      preventDefault(event);

      if (!event.repeat) {
        keys.rear = false;
        options.onToggleAutopilot();
      }

      return;
    }

    if (isRestartKey(key, code)) {
      preventDefault(event);

      if (!event.repeat) {
        release();
        options.onRestart();
      }
    }
  };

  const handleKeyUp = (event: KeyboardEvent): void => {
    const editable = isEditableTarget(event.target);
    const key = eventKey(event);
    const code = eventCode(event);

    if (isLeft(key, code)) {
      keys.left = false;

      if (!editable) {
        preventDefault(event);
      }

      return;
    }

    if (isRight(key, code)) {
      keys.right = false;

      if (!editable) {
        preventDefault(event);
      }

      return;
    }

    if (isSpace(key, code) && !editable) {
      preventDefault(event);
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", release);
  window.addEventListener("pagehide", release);

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        release();
      }
    });
  }

  return { keys, release };
}
