import type { LevelId } from "@moonlander/sim";

export interface LevelDefinition {
  id: LevelId;
  name: string;
  description: string;
}

export const LEVELS: readonly LevelDefinition[] = [
  {
    id: "sandworm",
    name: "Inside the Sandworm's Gut",
    description: "Bending tunnel, wall damage, bottom thrusters.",
  },
  {
    id: "gravity",
    name: "Gravity",
    description: "Open space, planet gravity, no walls or ground.",
  },
  {
    id: "anti-gravity",
    name: "Anti Gravity",
    description: "Repulsive planet fields and slow drifting obstacles.",
  },
];

export const LEVEL_NAMES: Record<LevelId, string> = {
  sandworm: "Inside the Sandworm's Gut",
  gravity: "Gravity",
  "anti-gravity": "Anti Gravity",
};

export const LEVEL_IDS: readonly LevelId[] = LEVELS.map((level) => level.id);

export function isLevelId(value: unknown): value is LevelId {
  return (
    value === "sandworm" ||
    value === "gravity" ||
    value === "anti-gravity"
  );
}

export function parseLevel(raw: string | null | undefined): LevelId | null {
  if (typeof raw !== "string") {
    return null;
  }

  const normalized = raw.trim();
  return isLevelId(normalized) ? normalized : null;
}

export function levelName(level: LevelId): string {
  return LEVEL_NAMES[level];
}

export interface MenuOptions {
  root?: Document;
  onStartLevel(level: LevelId): void;
  onResume?(): void;
  onRestart?(): void;
  onReturn?(): void;
  onPauseChange?(open: boolean): void;
  onStartChange?(open: boolean): void;
  isOtherModalOpen?(): boolean;
}

export interface MenuController {
  hasStartMenu(): boolean;
  isStartOpen(): boolean;
  isPauseOpen(): boolean;
  blocksGameKeys(): boolean;
  openStart(): void;
  closeStart(): void;
  openPause(): void;
  closePause(restoreFocus?: boolean): void;
  togglePause(): void;
  focusMenuButton(): void;
  setActiveLevel(level: LevelId): void;
  dispose(): void;
}

function query<T extends Element>(
  root: Document | null,
  selector: string,
): T | null {
  if (root === null || typeof root.querySelector !== "function") {
    return null;
  }
  return root.querySelector(selector) as T | null;
}

function byTestId<T extends Element>(
  root: Document | null,
  testId: string,
): T | null {
  return query<T>(root, `[data-testid="${testId}"]`);
}

function setHidden(element: HTMLElement, hidden: boolean): void {
  element.hidden = hidden;
  if (hidden) {
    element.setAttribute("hidden", "");
  } else {
    element.removeAttribute("hidden");
  }
}

function setInert(element: HTMLElement, inert: boolean): void {
  if (inert) {
    element.setAttribute("inert", "");
  } else {
    element.removeAttribute("inert");
  }
}

function focusElement(element: HTMLElement | null): void {
  if (element !== null && typeof element.focus === "function") {
    element.focus();
  }
}

function preventDefault(event: KeyboardEvent): void {
  if (typeof event.preventDefault === "function") {
    event.preventDefault();
  }
}

function isEscape(event: KeyboardEvent): boolean {
  if (typeof event.key !== "string") {
    return false;
  }
  const key = event.key.toLowerCase();
  return key === "escape" || key === "esc";
}

export function createMenu(options: MenuOptions): MenuController {
  const root =
    options.root ?? (typeof document === "undefined" ? null : document);
  const startMenu = byTestId<HTMLElement>(root, "start-menu");
  const gameMenu = byTestId<HTMLElement>(root, "game-menu");
  const menuButton = byTestId<HTMLButtonElement>(root, "game-menu-button");
  const resumeButton = byTestId<HTMLButtonElement>(root, "menu-resume");
  const restartButton = byTestId<HTMLButtonElement>(root, "menu-restart");
  const returnButton = byTestId<HTMLButtonElement>(root, "menu-return");
  const levelStartButton = byTestId<HTMLButtonElement>(root, "level-start");
  const gameMenuLevel = byTestId<HTMLElement>(root, "game-menu-level");

  const levelCards = LEVELS.map((level) => ({
    id: level.id,
    element: byTestId<HTMLButtonElement>(root, `level-card-${level.id}`),
  }));

  const body = root?.body ?? null;

  let startOpen = false;
  let pauseOpen = false;
  let selectedLevel: LevelId = "sandworm";

  const setBodyClass = (name: string, active: boolean): void => {
    body?.classList?.toggle(name, active);
  };

  const applyStart = (open: boolean): void => {
    if (startMenu !== null) {
      startMenu.setAttribute("data-open", String(open));
      startMenu.setAttribute("aria-hidden", String(!open));
      startMenu.classList.toggle("hidden", !open);
      setInert(startMenu, !open);
      setHidden(startMenu, !open);
    }
    setBodyClass("start-menu-open", open);
  };

  const applyPause = (open: boolean): void => {
    if (gameMenu !== null) {
      gameMenu.setAttribute("data-open", String(open));
      gameMenu.setAttribute("aria-hidden", String(!open));
      gameMenu.classList.toggle("hidden", !open);
      setInert(gameMenu, !open);
      setHidden(gameMenu, !open);
    }
    if (menuButton !== null) {
      menuButton.setAttribute("aria-expanded", String(open));
      menuButton.setAttribute("data-open", String(open));
    }
    setBodyClass("game-menu-open", open);
  };

  const applySelection = (level: LevelId): void => {
    selectedLevel = level;
    for (const card of levelCards) {
      const selected = card.id === level;
      card.element?.setAttribute("data-selected", String(selected));
      card.element?.setAttribute("data-active", String(selected));
    }
    levelStartButton?.setAttribute("data-level", level);
  };

  const focusSelectedCard = (): void => {
    const selected = levelCards.find(
      (card) => card.id === selectedLevel && card.element !== null,
    );
    const first = levelCards.find((card) => card.element !== null);
    focusElement(selected?.element ?? first?.element ?? null);
  };

  const focusMenuButton = (): void => {
    focusElement(menuButton);
  };

  const notifyStart = (open: boolean): void => {
    options.onStartChange?.(open);
  };

  const notifyPause = (open: boolean): void => {
    options.onPauseChange?.(open);
  };

  const openStart = (): void => {
    if (startMenu === null || startOpen) {
      return;
    }

    if (pauseOpen) {
      closePause(false);
    }

    startOpen = true;
    applySelection(selectedLevel);
    applyStart(true);
    notifyStart(true);
    focusSelectedCard();
  };

  const closeStart = (): void => {
    if (!startOpen) {
      return;
    }
    startOpen = false;
    applyStart(false);
    notifyStart(false);
  };

  const openPause = (): void => {
    if (gameMenu === null || startOpen || pauseOpen) {
      return;
    }
    pauseOpen = true;
    applyPause(true);
    notifyPause(true);
    focusElement(resumeButton ?? gameMenu);
  };

  const closePause = (restoreFocus = true): void => {
    if (!pauseOpen) {
      return;
    }
    pauseOpen = false;
    applyPause(false);
    notifyPause(false);
    if (restoreFocus) {
      focusMenuButton();
    }
  };

  const togglePause = (): void => {
    if (startOpen) {
      return;
    }
    if (pauseOpen) {
      closePause();
    } else {
      openPause();
    }
  };

  const handleMenuButton = (): void => {
    togglePause();
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat === true || !isEscape(event)) {
      return;
    }

    if (options.isOtherModalOpen?.() === true) {
      return;
    }

    if (startOpen) {
      return;
    }

    if (pauseOpen) {
      preventDefault(event);
      closePause();
      return;
    }

    if (gameMenu === null) {
      return;
    }

    preventDefault(event);
    openPause();
  };

  const startSelectedLevel = (): void => {
    if (!startOpen) {
      return;
    }
    closeStart();
    options.onStartLevel(selectedLevel);
  };

  const cardHandlers: { element: HTMLButtonElement | null; handler: () => void }[] =
    levelCards.map((card) => ({
      element: card.element,
      handler: (): void => {
        if (!startOpen) {
          return;
        }
        applySelection(card.id);
        if (levelStartButton === null) {
          startSelectedLevel();
        }
      },
    }));

  const handleLevelStart = (): void => {
    startSelectedLevel();
  };

  const handleResume = (): void => {
    closePause();
    options.onResume?.();
  };

  const handleRestart = (): void => {
    options.onRestart?.();
  };

  const handleReturn = (): void => {
    options.onReturn?.();
  };

  for (const card of cardHandlers) {
    card.element?.addEventListener("click", card.handler);
  }
  levelStartButton?.addEventListener("click", handleLevelStart);
  menuButton?.addEventListener("click", handleMenuButton);
  resumeButton?.addEventListener("click", handleResume);
  restartButton?.addEventListener("click", handleRestart);
  returnButton?.addEventListener("click", handleReturn);

  const view =
    typeof window !== "undefined"
      ? window
      : (root?.defaultView ?? null);
  view?.addEventListener("keydown", handleKeyDown);

  applySelection(selectedLevel);
  applyStart(false);
  applyPause(false);

  const setActiveLevel = (level: LevelId): void => {
    applySelection(level);

    if (gameMenuLevel !== null) {
      gameMenuLevel.textContent = levelName(level);
      gameMenuLevel.setAttribute("data-level", level);
    }
  };

  return {
    hasStartMenu: () => startMenu !== null,
    isStartOpen: () => startOpen,
    isPauseOpen: () => pauseOpen,
    blocksGameKeys: () => startOpen || pauseOpen,
    openStart,
    closeStart,
    openPause,
    closePause,
    togglePause,
    focusMenuButton,
    setActiveLevel,
    dispose(): void {
      for (const card of cardHandlers) {
        card.element?.removeEventListener("click", card.handler);
      }
      levelStartButton?.removeEventListener("click", handleLevelStart);
      menuButton?.removeEventListener("click", handleMenuButton);
      resumeButton?.removeEventListener("click", handleResume);
      restartButton?.removeEventListener("click", handleRestart);
      returnButton?.removeEventListener("click", handleReturn);
      view?.removeEventListener("keydown", handleKeyDown);
      closeStart();
      closePause(false);
    },
  };
}
