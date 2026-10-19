import "./style.css";

const canvas = document.getElementById("game-canvas");

if (canvas instanceof HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");

  if (ctx !== null) {
    const render = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      ctx.fillStyle = "#080a14";
      ctx.fillRect(0, 0, width, height);

      drawStars(ctx, width, height);
      drawHorizon(ctx, width, height);
      drawPad(ctx, width, height);
    };

    const resize = () => {
      const dpr = window.devicePixelRatio ?? 1;
      canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render();
    };

    window.addEventListener("resize", resize);
    resize();
  }
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const rng = mulberry32(12345);
  const count = Math.max(50, Math.floor((width * height) / 4000));

  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < count; i++) {
    const x = rng() * width;
    const y = rng() * height * 0.75;
    const r = rng() * 1.5 + 0.5;
    const a = rng() * 0.5 + 0.5;

    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawHorizon(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const base = height * 0.82;
  const rng = mulberry32(2025);
  const segments = 30;
  const padStart = width * 0.42;
  const padEnd = width * 0.58;

  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, base);

  for (let i = 1; i <= segments; i++) {
    const x = (width * i) / segments;
    let y = base + (rng() - 0.5) * height * 0.04;
    if (x > padStart && x < padEnd) {
      y = base;
    }
    ctx.lineTo(x, y);
  }

  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fillStyle = "#262a36";
  ctx.fill();
}

function drawPad(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const base = height * 0.82;
  const padX = width * 0.42;
  const padW = width * 0.16;
  const padH = height * 0.025;

  ctx.fillStyle = "#4a4f61";
  ctx.fillRect(padX, base, padW, padH);

  ctx.strokeStyle = "#8c93a8";
  ctx.lineWidth = 2;
  ctx.strokeRect(padX, base, padW, padH);
}
