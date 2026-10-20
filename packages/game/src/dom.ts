export const MAX_DEVICE_PIXEL_RATIO = 2;

export interface CanvasMetrics {
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  dpr: number;
}

function isElementLike(value: Element | null): value is Element {
  return value !== null && typeof value.setAttribute === "function";
}

function clampDevicePixelRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 1;
  }

  return Math.min(MAX_DEVICE_PIXEL_RATIO, Math.max(1, ratio));
}

export function readDevicePixelRatio(): number {
  const ratio =
    typeof window === "undefined" ? 1 : window.devicePixelRatio;
  return clampDevicePixelRatio(ratio);
}

export function getHudElement(testId: string): HTMLElement {
  const element = document.querySelector(
    `[data-testid="${testId}"]`,
  );

  if (!isElementLike(element)) {
    throw new Error(`Missing HUD element with data-testid="${testId}"`);
  }

  return element as HTMLElement;
}

export function getElement<T extends Element>(
  selector: string,
  constructor: { new (): T },
): T {
  const element = document.querySelector(selector);

  if (element === null) {
    throw new Error(`Missing or invalid element: ${selector}`);
  }

  if (
    typeof constructor === "function" &&
    !(element instanceof constructor)
  ) {
    throw new Error(`Missing or invalid element: ${selector}`);
  }

  return element as T;
}

export function getCanvas(): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const element = document.querySelector('[data-testid="game-canvas"]');

  if (
    element === null ||
    typeof (element as HTMLCanvasElement).getContext !== "function"
  ) {
    throw new Error('Missing canvas element with data-testid="game-canvas"');
  }

  const canvas = element as HTMLCanvasElement;
  const ctx = canvas.getContext("2d");

  if (ctx === null) {
    throw new Error("Could not acquire 2D canvas context");
  }

  return { canvas, ctx };
}

export function resizeCanvasToDisplay(
  canvas: HTMLCanvasElement,
  dpr: number = readDevicePixelRatio(),
): CanvasMetrics {
  const safeDpr = clampDevicePixelRatio(dpr);
  const cssWidth = Math.max(1, canvas.clientWidth || 1);
  const cssHeight = Math.max(1, canvas.clientHeight || 1);
  const pixelWidth = Math.max(1, Math.round(cssWidth * safeDpr));
  const pixelHeight = Math.max(1, Math.round(cssHeight * safeDpr));

  if (canvas.width !== pixelWidth) {
    canvas.width = pixelWidth;
  }

  if (canvas.height !== pixelHeight) {
    canvas.height = pixelHeight;
  }

  return {
    cssWidth,
    cssHeight,
    pixelWidth,
    pixelHeight,
    dpr: safeDpr,
  };
}
