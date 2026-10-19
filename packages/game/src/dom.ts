export function getHudElement(testId: string): HTMLElement {
  const element = document.querySelector(`[data-testid="${testId}"]`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing HUD element with data-testid="${testId}"`);
  }
  return element;
}

export function getElement<T extends Element>(
  selector: string,
  constructor: { new (): T },
): T {
  const element = document.querySelector(selector);
  if (!(element instanceof constructor)) {
    throw new Error(`Missing or invalid element: ${selector}`);
  }
  return element;
}

export function getCanvas(): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = getElement('[data-testid="game-canvas"]', HTMLCanvasElement);
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Could not acquire 2D canvas context");
  }
  return { canvas, ctx: context };
}
