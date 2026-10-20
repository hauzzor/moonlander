import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { createInput, type InputController } from "../src/input";
import {
  FakeElement,
  FakeHTMLInputElement,
  FakeHTMLTextAreaElement,
  installFakeDom,
  type FakeDom,
} from "./fake-dom";

let dom: FakeDom;
let autopilotActive: boolean;
let restart: Mock<() => void>;
let toggleAutopilot: Mock<() => void>;

beforeEach(() => {
  dom = installFakeDom();
  autopilotActive = false;
  restart = vi.fn();
  toggleAutopilot = vi.fn(() => {
    autopilotActive = !autopilotActive;
  });
});

afterEach(() => {
  dom.restore();
});

function createTestInput(): InputController {
  return createInput({
    onRestart: restart,
    onToggleAutopilot: toggleAutopilot,
    isAutopilotActive: () => autopilotActive,
  });
}

const noLatches = { left: false, right: false, rear: false };

const textEntryInputTypes = [
  "text",
  "search",
  "number",
  "email",
  "password",
  "url",
  "tel",
] as const;

function createTypedInput(type: string): FakeHTMLInputElement {
  const element = new FakeHTMLInputElement();
  element.setAttribute("type", type);
  Object.defineProperty(element, "type", {
    configurable: true,
    enumerable: true,
    value: type,
    writable: true,
  });
  return element;
}

describe("input mapping", () => {
  it.each([
    ["lowercase q", "q", "left"],
    ["uppercase Q", "Q", "left"],
    ["lowercase w", "w", "right"],
    ["uppercase W", "W", "right"],
  ] as const)("maps %s to the %s thruster", (_description, key, latch) => {
    const input = createTestInput();

    const event = dom.window.dispatch("keydown", {
      key,
      target: dom.window,
    });

    expect(input.keys[latch]).toBe(true);
    expect(input.keys.left).toBe(latch === "left");
    expect(input.keys.right).toBe(latch === "right");
    expect(input.keys.rear).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([
    ["q", "left"],
    ["Q", "left"],
    ["w", "right"],
    ["W", "right"],
  ] as const)("releases the %s thruster on keyup", (key, latch) => {
    const input = createTestInput();
    dom.window.dispatch("keydown", { key, target: dom.window });

    const event = dom.window.dispatch("keyup", { key, target: dom.window });

    expect(input.keys[latch]).toBe(false);
    expect(input.keys).toEqual(noLatches);
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([
    ["KeyQ", "left"],
    ["KeyW", "right"],
  ] as const)("maps the %s code to the %s thruster", (code, latch) => {
    const input = createTestInput();

    const event = dom.window.dispatch("keydown", {
      key: "",
      code,
      target: dom.window,
    });

    expect(input.keys[latch]).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([
    ["KeyE", "toggle"],
    ["KeyR", "restart"],
  ] as const)("maps the %s code to its action", (code, action) => {
    createTestInput();

    dom.window.dispatch("keydown", {
      key: "",
      code,
      target: dom.window,
    });

    const callback = action === "toggle" ? toggleAutopilot : restart;
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("toggles the rear latch on Space keydown but not on keyup or auto-repeat", () => {
    const input = createTestInput();

    const pressed = dom.window.dispatch("keydown", {
      code: "Space",
      key: " ",
      target: dom.window,
    });
    expect(input.keys.rear).toBe(true);
    expect(pressed.defaultPrevented).toBe(true);

    const repeated = dom.window.dispatch("keydown", {
      code: "Space",
      key: " ",
      repeat: true,
      target: dom.window,
    });
    expect(input.keys.rear).toBe(true);
    expect(repeated.defaultPrevented).toBe(true);

    dom.window.dispatch("keyup", {
      code: "Space",
      key: " ",
      target: dom.window,
    });
    expect(input.keys.rear).toBe(true);

    dom.window.dispatch("keydown", {
      code: "Space",
      key: " ",
      target: dom.window,
    });
    expect(input.keys.rear).toBe(false);
  });

  it.each([
    ["e", "toggle"],
    ["E", "toggle"],
    ["r", "restart"],
    ["R", "restart"],
  ] as const)("handles %s keydown once and ignores auto-repeat", (key, action) => {
    createTestInput();
    const callback = action === "toggle" ? toggleAutopilot : restart;

    const pressed = dom.window.dispatch("keydown", {
      key,
      target: dom.window,
    });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(pressed.defaultPrevented).toBe(true);

    dom.window.dispatch("keydown", {
      key,
      repeat: true,
      target: dom.window,
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("ignores Q, W, and Space while autopilot is active", () => {
    autopilotActive = true;
    const input = createTestInput();

    dom.window.dispatch("keydown", { key: "q", target: dom.window });
    dom.window.dispatch("keydown", { key: "w", target: dom.window });
    dom.window.dispatch("keydown", {
      code: "Space",
      key: " ",
      target: dom.window,
    });

    expect(input.keys).toEqual(noLatches);
  });

  it("still toggles autopilot and restarts while autopilot is active", () => {
    autopilotActive = true;
    createTestInput();

    dom.window.dispatch("keydown", { key: "e", target: dom.window });
    expect(toggleAutopilot).toHaveBeenCalledTimes(1);

    dom.window.dispatch("keydown", { key: "r", target: dom.window });
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it("clears the rear latch when toggling autopilot", () => {
    const input = createTestInput();
    dom.window.dispatch("keydown", {
      code: "Space",
      key: " ",
      target: dom.window,
    });
    expect(input.keys.rear).toBe(true);

    dom.window.dispatch("keydown", { key: "e", target: dom.window });

    expect(input.keys.rear).toBe(false);
    expect(toggleAutopilot).toHaveBeenCalledTimes(1);
  });

  it("clears the rear latch when restarting", () => {
    const input = createTestInput();
    dom.window.dispatch("keydown", {
      code: "Space",
      key: " ",
      target: dom.window,
    });
    expect(input.keys.rear).toBe(true);

    dom.window.dispatch("keydown", { key: "r", target: dom.window });

    expect(input.keys).toEqual(noLatches);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it("clears every latch through release()", () => {
    const input = createTestInput();
    dom.window.dispatch("keydown", { key: "q", target: dom.window });
    dom.window.dispatch("keydown", { key: "w", target: dom.window });
    dom.window.dispatch("keydown", {
      code: "Space",
      key: " ",
      target: dom.window,
    });
    expect(input.keys).toEqual({ left: true, right: true, rear: true });

    input.release();

    expect(input.keys).toEqual(noLatches);
  });
});

describe("input latch releases", () => {
  type Trigger = (fakeDom: FakeDom) => void;

  const releaseCases: [string, Trigger][] = [
    [
      "window blur",
      (fakeDom) => {
        fakeDom.window.dispatch("blur");
      },
    ],
    [
      "page hide",
      (fakeDom) => {
        fakeDom.window.dispatch("pagehide");
      },
    ],
    [
      "a hidden document",
      (fakeDom) => {
        fakeDom.document.hidden = true;
        fakeDom.document.dispatch("visibilitychange");
      },
    ],
  ];

  it.each(releaseCases)("releases every latch on %s", (_description, trigger) => {
    const input = createTestInput();
    dom.window.dispatch("keydown", { key: "q", target: dom.window });
    dom.window.dispatch("keydown", { key: "w", target: dom.window });
    dom.window.dispatch("keydown", {
      code: "Space",
      key: " ",
      target: dom.window,
    });
    expect(input.keys).toEqual({ left: true, right: true, rear: true });

    trigger(dom);

    expect(input.keys).toEqual(noLatches);
  });

  it("keeps latches while the document is visible", () => {
    const input = createTestInput();
    dom.window.dispatch("keydown", { key: "q", target: dom.window });
    dom.window.dispatch("keydown", { key: "w", target: dom.window });
    dom.window.dispatch("keydown", {
      code: "Space",
      key: " ",
      target: dom.window,
    });

    dom.document.hidden = false;
    dom.document.dispatch("visibilitychange");

    expect(input.keys).toEqual({ left: true, right: true, rear: true });
  });
});

describe("input editable targets", () => {
  const editableTargets: [string, () => FakeElement][] = [
    ["input", () => new FakeHTMLInputElement()],
    ...textEntryInputTypes.map(
      (type): [string, () => FakeElement] => [
        `input[type="${type}"]`,
        () => createTypedInput(type),
      ],
    ),
    ["textarea", () => new FakeHTMLTextAreaElement()],
    [
      "contenteditable",
      () => {
        const element = new FakeElement("div");
        element.isContentEditable = true;
        return element;
      },
    ],
  ];

  it.each(editableTargets)(
    "ignores control keys typed into an editable %s",
    (_description, createTarget) => {
      const input = createTestInput();
      const target = createTarget();

      const q = dom.window.dispatch("keydown", { key: "q", target });
      const w = dom.window.dispatch("keydown", { key: "w", target });
      const space = dom.window.dispatch("keydown", {
        code: "Space",
        key: " ",
        target,
      });
      dom.window.dispatch("keydown", { key: "e", target });
      dom.window.dispatch("keydown", { key: "r", target });

      expect(input.keys).toEqual(noLatches);
      expect(q.defaultPrevented).toBe(false);
      expect(w.defaultPrevented).toBe(false);
      expect(space.defaultPrevented).toBe(false);
      expect(toggleAutopilot).not.toHaveBeenCalled();
      expect(restart).not.toHaveBeenCalled();
    },
  );

  it("still releases a held thruster when focus moves into an editable target", () => {
    const input = createTestInput();
    const target = new FakeHTMLInputElement();
    dom.window.dispatch("keydown", { key: "q", target: dom.window });
    expect(input.keys.left).toBe(true);

    const event = dom.window.dispatch("keyup", { key: "q", target });

    expect(input.keys.left).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it("keeps the Q and W thrusters responsive while a range slider is focused", () => {
    const input = createTestInput();
    const slider = createTypedInput("range");

    const left = dom.window.dispatch("keydown", { key: "q", target: slider });
    expect(input.keys.left).toBe(true);
    expect(input.keys).toEqual({ left: true, right: false, rear: false });
    expect(left.defaultPrevented).toBe(true);

    const right = dom.window.dispatch("keydown", { key: "w", target: slider });
    expect(input.keys).toEqual({ left: true, right: true, rear: false });
    expect(right.defaultPrevented).toBe(true);

    const leftUp = dom.window.dispatch("keyup", { key: "q", target: slider });
    expect(input.keys).toEqual({ left: false, right: true, rear: false });
    expect(leftUp.defaultPrevented).toBe(true);
  });

  it("keeps the Space rear latch responsive while a range slider is focused", () => {
    const input = createTestInput();
    const slider = createTypedInput("range");

    const pressed = dom.window.dispatch("keydown", {
      code: "Space",
      key: " ",
      target: slider,
    });
    expect(input.keys.rear).toBe(true);
    expect(pressed.defaultPrevented).toBe(true);

    const repeated = dom.window.dispatch("keydown", {
      code: "Space",
      key: " ",
      repeat: true,
      target: slider,
    });
    expect(input.keys.rear).toBe(true);
    expect(repeated.defaultPrevented).toBe(true);

    const keyup = dom.window.dispatch("keyup", {
      code: "Space",
      key: " ",
      target: slider,
    });
    expect(input.keys.rear).toBe(true);
    expect(keyup.defaultPrevented).toBe(true);

    const released = dom.window.dispatch("keydown", {
      code: "Space",
      key: " ",
      target: slider,
    });
    expect(input.keys.rear).toBe(false);
    expect(released.defaultPrevented).toBe(true);
  });

  it("toggles autopilot while a range slider is focused", () => {
    const input = createTestInput();
    const slider = createTypedInput("range");
    dom.window.dispatch("keydown", {
      code: "Space",
      key: " ",
      target: slider,
    });
    expect(input.keys.rear).toBe(true);

    const event = dom.window.dispatch("keydown", { key: "e", target: slider });

    expect(toggleAutopilot).toHaveBeenCalledTimes(1);
    expect(input.keys.rear).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it("restarts and releases latches while a range slider is focused", () => {
    const input = createTestInput();
    const slider = createTypedInput("range");
    dom.window.dispatch("keydown", { key: "q", target: slider });
    dom.window.dispatch("keydown", { key: "w", target: slider });
    dom.window.dispatch("keydown", {
      code: "Space",
      key: " ",
      target: slider,
    });
    expect(input.keys).toEqual({ left: true, right: true, rear: true });

    const event = dom.window.dispatch("keydown", { key: "r", target: slider });

    expect(restart).toHaveBeenCalledTimes(1);
    expect(input.keys).toEqual(noLatches);
    expect(event.defaultPrevented).toBe(true);
  });

  it("keeps autopilot and restart available with slider focus while autopilot is active", () => {
    autopilotActive = true;
    const input = createTestInput();
    const slider = createTypedInput("range");

    dom.window.dispatch("keydown", { key: "q", target: slider });
    dom.window.dispatch("keydown", { key: "w", target: slider });
    dom.window.dispatch("keydown", {
      code: "Space",
      key: " ",
      target: slider,
    });
    expect(input.keys).toEqual(noLatches);

    dom.window.dispatch("keydown", { key: "e", target: slider });
    expect(toggleAutopilot).toHaveBeenCalledTimes(1);

    dom.window.dispatch("keydown", { key: "r", target: slider });
    expect(restart).toHaveBeenCalledTimes(1);
    expect(input.keys).toEqual(noLatches);
  });
});
