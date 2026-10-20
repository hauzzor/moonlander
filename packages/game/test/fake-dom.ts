export type FakeListener = (event: FakeEvent) => void;

export interface FakeEventInit {
  target?: unknown;
  key?: string;
  code?: string;
  repeat?: boolean;
}

export interface FakeEvent {
  type: string;
  target: unknown;
  key: string;
  code: string;
  repeat: boolean;
  defaultPrevented: boolean;
  preventDefault(): void;
}

export function createFakeEvent(
  type: string,
  init: FakeEventInit = {},
): FakeEvent {
  const event: FakeEvent = {
    type,
    target: init.target ?? null,
    key: init.key ?? "",
    code: init.code ?? "",
    repeat: init.repeat ?? false,
    defaultPrevented: false,
    preventDefault(): void {
      event.defaultPrevented = true;
    },
  };
  return event;
}

export class FakeEventTarget {
  private readonly listeners = new Map<string, FakeListener[]>();

  addEventListener(type: string, listener: FakeListener): void {
    const existing = this.listeners.get(type);
    if (existing === undefined) {
      this.listeners.set(type, [listener]);
      return;
    }
    existing.push(listener);
  }

  removeEventListener(type: string, listener: FakeListener): void {
    const existing = this.listeners.get(type);
    if (existing === undefined) {
      return;
    }
    const index = existing.indexOf(listener);
    if (index >= 0) {
      existing.splice(index, 1);
    }
  }

  dispatch(type: string, init: FakeEventInit = {}): FakeEvent {
    const event = createFakeEvent(type, init);
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event);
    }
    return event;
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.length ?? 0;
  }
}

export class FakeClassList {
  private readonly tokens = new Set<string>();

  add(...tokens: string[]): void {
    for (const token of tokens) {
      this.tokens.add(token);
    }
  }

  remove(...tokens: string[]): void {
    for (const token of tokens) {
      this.tokens.delete(token);
    }
  }

  contains(token: string): boolean {
    return this.tokens.has(token);
  }

  toggle(token: string, force?: boolean): boolean {
    const active = force ?? !this.tokens.has(token);
    if (active) {
      this.tokens.add(token);
    } else {
      this.tokens.delete(token);
    }
    return active;
  }

  values(): readonly string[] {
    return [...this.tokens];
  }
}

export class FakeStyle {
  private readonly properties = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.properties.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.properties.get(name) ?? "";
  }
}

export class FakeElement extends FakeEventTarget {
  readonly attributes = new Map<string, string>();
  readonly classList = new FakeClassList();
  readonly children: FakeElement[] = [];
  readonly style = new FakeStyle();
  textContent = "";
  value = "";
  isContentEditable = false;
  clientWidth = 0;
  clientHeight = 0;
  width = 0;
  height = 0;

  constructor(readonly tagName: string) {
    super();
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  appendChild<T extends FakeElement>(child: T): T {
    this.children.push(child);
    return child;
  }

  matches(selector: string): boolean {
    if (selector.startsWith(".")) {
      return this.classList.contains(selector.slice(1));
    }

    const attribute = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
    if (attribute !== null) {
      const name = attribute[1]!;
      const expected = attribute[2];
      const actual = this.attributes.get(name);
      if (actual === undefined) {
        return false;
      }
      return expected === undefined || actual === expected;
    }

    if (selector.startsWith("#")) {
      return this.attributes.get("id") === selector.slice(1);
    }

    return this.tagName === selector;
  }

  querySelector(selector: string): FakeElement | null {
    for (const child of this.children) {
      if (child.matches(selector)) {
        return child;
      }
      const nested = child.querySelector(selector);
      if (nested !== null) {
        return nested;
      }
    }
    return null;
  }
}

export class FakeHTMLInputElement extends FakeElement {
  constructor(tagName = "input") {
    super(tagName);
  }
}

export class FakeHTMLTextAreaElement extends FakeElement {
  constructor(tagName = "textarea") {
    super(tagName);
  }
}

export interface CanvasCall {
  name: string;
  args: readonly unknown[];
}

export class FakeCanvasGradient {
  readonly stops: { offset: number; color: string }[] = [];

  addColorStop(offset: number, color: string): void {
    this.stops.push({ offset, color });
  }
}

export class FakeCanvasContext {
  readonly calls: CanvasCall[] = [];
  fillStyle: unknown = "";
  strokeStyle: unknown = "";
  lineWidth = 1;
  lineCap = "butt";
  lineJoin = "miter";
  shadowColor = "";
  shadowBlur = 0;
  font = "";
  textAlign = "start";
  textBaseline = "alphabetic";

  callsNamed(name: string): readonly CanvasCall[] {
    return this.calls.filter((call) => call.name === name);
  }

  private record(name: string, args: readonly unknown[] = []): void {
    this.calls.push({ name, args });
  }

  setTransform(...args: unknown[]): void {
    this.record("setTransform", args);
  }

  clearRect(...args: unknown[]): void {
    this.record("clearRect", args);
  }

  save(): void {
    this.record("save");
  }

  restore(): void {
    this.record("restore");
  }

  beginPath(): void {
    this.record("beginPath");
  }

  closePath(): void {
    this.record("closePath");
  }

  moveTo(...args: unknown[]): void {
    this.record("moveTo", args);
  }

  lineTo(...args: unknown[]): void {
    this.record("lineTo", args);
  }

  quadraticCurveTo(...args: unknown[]): void {
    this.record("quadraticCurveTo", args);
  }

  rect(...args: unknown[]): void {
    this.record("rect", args);
  }

  arc(...args: unknown[]): void {
    this.record("arc", args);
  }

  ellipse(...args: unknown[]): void {
    this.record("ellipse", args);
  }

  fill(...args: unknown[]): void {
    this.record("fill", args);
  }

  stroke(...args: unknown[]): void {
    this.record("stroke", args);
  }

  fillRect(...args: unknown[]): void {
    this.record("fillRect", args);
  }

  clip(...args: unknown[]): void {
    this.record("clip", args);
  }

  fillText(...args: unknown[]): void {
    this.record("fillText", args);
  }

  translate(...args: unknown[]): void {
    this.record("translate", args);
  }

  rotate(...args: unknown[]): void {
    this.record("rotate", args);
  }

  scale(...args: unknown[]): void {
    this.record("scale", args);
  }

  createLinearGradient(...args: unknown[]): FakeCanvasGradient {
    this.record("createLinearGradient", args);
    return new FakeCanvasGradient();
  }

  createRadialGradient(...args: unknown[]): FakeCanvasGradient {
    this.record("createRadialGradient", args);
    return new FakeCanvasGradient();
  }
}

export class FakeCanvasElement extends FakeElement {
  readonly context = new FakeCanvasContext();

  constructor(tagName = "canvas") {
    super(tagName);
  }

  getContext(kind: string): FakeCanvasContext | null {
    return kind === "2d" ? this.context : null;
  }
}

export class FakeWindow extends FakeEventTarget {
  devicePixelRatio = 1;
}

export class FakeDocument extends FakeEventTarget {
  hidden = false;
  private readonly registry = new Map<string, FakeElement>();

  register(testId: string, element: FakeElement): void {
    this.registry.set(testId, element);
  }

  element(testId: string): FakeElement | undefined {
    return this.registry.get(testId);
  }

  querySelector(selector: string): FakeElement | null {
    const testId = /^\[data-testid="([^"]+)"\]$/.exec(selector);
    if (testId === null) {
      return null;
    }
    return this.registry.get(testId[1]!) ?? null;
  }
}

export interface FakeDomOptions {
  dpr?: number;
  width?: number;
  height?: number;
}

export interface FakeDom {
  document: FakeDocument;
  window: FakeWindow;
  canvas: FakeCanvasElement;
  ctx: FakeCanvasContext;
  addElement(testId: string, tagName?: string): FakeElement;
  addInput(testId: string): FakeHTMLInputElement;
  addCanvas(testId: string): FakeCanvasElement;
  restore(): void;
}

const INSTALLED_GLOBALS = [
  "window",
  "document",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLCanvasElement",
] as const;

function defineGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

export function installFakeDom(options: FakeDomOptions = {}): FakeDom {
  const window = new FakeWindow();
  window.devicePixelRatio = options.dpr ?? 1;
  const document = new FakeDocument();
  const canvas = new FakeCanvasElement();
  canvas.clientWidth = options.width ?? 800;
  canvas.clientHeight = options.height ?? 600;
  document.register("game-canvas", canvas);

  defineGlobal("window", window);
  defineGlobal("document", document);
  defineGlobal("HTMLElement", FakeElement);
  defineGlobal("HTMLInputElement", FakeHTMLInputElement);
  defineGlobal("HTMLTextAreaElement", FakeHTMLTextAreaElement);
  defineGlobal("HTMLCanvasElement", FakeCanvasElement);

  const register = (testId: string, element: FakeElement): void => {
    element.setAttribute("data-testid", testId);
    document.register(testId, element);
  };

  return {
    document,
    window,
    canvas,
    ctx: canvas.context,
    addElement(testId: string, tagName = "div"): FakeElement {
      const element = new FakeElement(tagName);
      register(testId, element);
      return element;
    },
    addInput(testId: string): FakeHTMLInputElement {
      const element = new FakeHTMLInputElement();
      register(testId, element);
      return element;
    },
    addCanvas(testId: string): FakeCanvasElement {
      const element = new FakeCanvasElement();
      register(testId, element);
      return element;
    },
    restore(): void {
      for (const name of INSTALLED_GLOBALS) {
        Reflect.deleteProperty(globalThis, name);
      }
    },
  };
}
