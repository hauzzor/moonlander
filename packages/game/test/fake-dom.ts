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
  parentElement: FakeElement | null = null;
  value = "";
  isContentEditable = false;
  disabled = false;
  hidden = false;
  inert = false;
  clientWidth = 0;
  clientHeight = 0;
  width = 0;
  height = 0;
  private text = "";

  constructor(readonly tagName: string) {
    super();
  }

  get textContent(): string {
    if (this.text.length > 0) {
      return this.text;
    }
    return this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.text = String(value);
    this.children.length = 0;
  }

  get className(): string {
    return this.classList.values().join(" ");
  }

  set className(value: string) {
    for (const token of this.classList.values()) {
      this.classList.remove(token);
    }
    for (const token of String(value).split(/\s+/)) {
      if (token.length > 0) {
        this.classList.add(token);
      }
    }
  }

  focus(): void {
    const root = (globalThis as unknown as { document?: FakeDocument }).document;
    if (root !== undefined) {
      root.activeElement = this;
    }
  }

  contains(node: unknown): boolean {
    if (node === this) {
      return true;
    }
    for (const child of this.children) {
      if (child.contains(node)) {
        return true;
      }
    }
    return false;
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
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  toggleAttribute(name: string, force?: boolean): boolean {
    const active = force ?? !this.attributes.has(name);
    if (active) {
      this.setAttribute(name, "");
    } else {
      this.removeAttribute(name);
    }
    return active;
  }

  closest(selector: string): FakeElement | null {
    let node: FakeElement | null = this;

    while (node !== null) {
      if (node.matches(selector)) {
        return node;
      }
      node = node.parentElement;
    }

    return null;
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

    return this.tagName.toLowerCase() === selector.toLowerCase();
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
  type = "text";
  min = "";
  max = "";
  step = "";

  constructor(tagName = "input") {
    super(tagName);
  }

  get valueAsNumber(): number {
    const trimmed = this.value.trim();
    return trimmed.length === 0 ? Number.NaN : Number(trimmed);
  }

  set valueAsNumber(value: number) {
    this.value = String(value);
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

export class FakeDialogElement extends FakeElement {
  open = false;

  constructor(tagName = "dialog") {
    super(tagName);
  }

  showModal(): void {
    this.open = true;
    this.setAttribute("open", "");
  }

  show(): void {
    this.showModal();
  }

  close(): void {
    this.open = false;
    this.removeAttribute("open");
    this.dispatch("close");
  }
}

export class FakeWindow extends FakeEventTarget {
  devicePixelRatio = 1;
  readonly localStorage = new FakeStorage();
  readonly sessionStorage = new FakeStorage();
  readonly location = new FakeLocation();
  readonly history = new FakeHistory(this.location);
}

export class FakeStorage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

export class FakeLocation {
  href = "http://localhost/";

  get search(): string {
    return new URL(this.href).search;
  }

  set search(value: string) {
    const url = new URL(this.href);
    url.search = value;
    this.href = url.href;
  }

  get pathname(): string {
    return new URL(this.href).pathname;
  }

  get hash(): string {
    return new URL(this.href).hash;
  }

  set hash(value: string) {
    const url = new URL(this.href);
    url.hash = value;
    this.href = url.href;
  }
}

export interface HistoryCall {
  url: string | null;
}

export class FakeHistory {
  readonly replaceStateCalls: HistoryCall[] = [];

  constructor(private readonly location: FakeLocation) {}

  replaceState(
    _data: unknown,
    _title: string,
    url?: string | URL | null,
  ): void {
    const next = url === undefined || url === null ? null : String(url);
    this.replaceStateCalls.push({ url: next });

    if (next !== null) {
      this.location.href = new URL(next, this.location.href).href;
    }
  }

  pushState(_data: unknown, _title: string, url?: string | URL | null): void {
    this.replaceState(_data, _title, url);
  }
}

export class FakeDocument extends FakeEventTarget {
  hidden = false;
  activeElement: FakeElement | null = null;
  readonly body = new FakeElement("body");
  private readonly registry = new Map<string, FakeElement>();

  register(testId: string, element: FakeElement): void {
    this.registry.set(testId, element);
  }

  element(testId: string): FakeElement | undefined {
    return this.registry.get(testId);
  }

  createElement(tagName: string): FakeElement {
    const normalized = tagName.toLowerCase();

    if (normalized === "dialog") {
      return new FakeDialogElement();
    }

    if (normalized === "input") {
      return new FakeHTMLInputElement();
    }

    if (normalized === "textarea") {
      return new FakeHTMLTextAreaElement();
    }

    if (normalized === "canvas") {
      return new FakeCanvasElement();
    }

    return new FakeElement(normalized);
  }

  querySelector(selector: string): FakeElement | null {
    const testId = /^\[data-testid="([^"]+)"\]$/.exec(selector);
    if (testId !== null) {
      return this.registry.get(testId[1]!) ?? null;
    }

    if (selector.startsWith("#")) {
      const id = selector.slice(1);
      for (const element of this.registry.values()) {
        if (element.getAttribute("id") === id) {
          return element;
        }
      }
      return this.body.querySelector(selector);
    }

    return this.body.querySelector(selector);
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
  addDialog(testId: string): FakeDialogElement;
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
    addDialog(testId: string): FakeDialogElement {
      const element = new FakeDialogElement();
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
