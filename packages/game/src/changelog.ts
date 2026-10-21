import type { ChangelogEntry } from "../build-info";

export type { ChangelogEntry } from "../build-info";

export interface ChangelogOptions {
  root?: Document;
  entries?: readonly ChangelogEntry[];
  onOpenChange?(open: boolean): void;
}

export interface ChangelogController {
  isOpen(): boolean;
  open(): void;
  close(): void;
  dispose(): void;
}

const CHANGELOG_PLACEHOLDER = "__CHANGELOG_JSON__";

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

function readBullets(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const bullets: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim().length > 0) {
      bullets.push(item.trim());
    }
  }
  return bullets;
}

function normalizeEntries(value: unknown): ChangelogEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries: ChangelogEntry[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const date = typeof record.date === "string" ? record.date.trim() : "";
    const title =
      typeof record.title === "string" ? record.title.trim() : "";
    if (date.length === 0 || title.length === 0) {
      continue;
    }

    const bullets = readBullets(record.bullets ?? record.items);
    entries.push({ date, title, bullets });
  }

  return entries.sort((left, right) => right.date.localeCompare(left.date));
}

export function decodeChangelog(raw: string | null | undefined): ChangelogEntry[] {
  if (typeof raw !== "string") {
    return [];
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed === CHANGELOG_PLACEHOLDER) {
    return [];
  }

  try {
    return normalizeEntries(JSON.parse(trimmed));
  } catch {
    return [];
  }
}

function setExpanded(
  entry: HTMLElement,
  summary: HTMLElement | null,
  expanded: boolean,
): void {
  entry.setAttribute("data-expanded", String(expanded));
  summary?.setAttribute("aria-expanded", String(expanded));
}

export function renderChangelogEntries(
  entries: readonly ChangelogEntry[],
  list: HTMLElement,
  root: Document,
): HTMLElement[] {
  if (typeof root.createElement !== "function") {
    return [];
  }

  list.textContent = "";
  const rendered: HTMLElement[] = [];

  entries.forEach((entry, index) => {
    const details = root.createElement("details");
    details.className = "changelog-entry";
    details.setAttribute("data-testid", "changelog-entry");
    details.setAttribute("data-expanded", "false");

    const summary = root.createElement("summary");
    summary.className = "changelog-entry-summary";
    summary.setAttribute("aria-expanded", "false");

    const date = root.createElement("span");
    date.className = "changelog-entry-date";
    date.textContent = entry.date;
    summary.appendChild(date);

    const title = root.createElement("span");
    title.className = "changelog-entry-title";
    title.textContent = entry.title;
    summary.appendChild(title);

    details.appendChild(summary);

    if (entry.bullets.length > 0) {
      const bullets = root.createElement("ul");
      bullets.className = "changelog-entry-list";
      for (const bullet of entry.bullets) {
        const item = root.createElement("li");
        item.textContent = bullet;
        bullets.appendChild(item);
      }
      details.appendChild(bullets);
    }

    const expanded = index === 0;
    (details as HTMLDetailsElement).open = expanded;
    setExpanded(details, summary, expanded);

    details.addEventListener("toggle", () => {
      const open = (details as HTMLDetailsElement).open;
      setExpanded(details, summary, open);
    });

    list.appendChild(details);
    rendered.push(details);
  });

  return rendered;
}

function readInjectedEntries(
  root: Document | null,
): ChangelogEntry[] {
  const script =
    query<HTMLScriptElement>(root, "#changelog-data") ??
    byTestId<HTMLScriptElement>(root, "changelog-data");

  if (script === null) {
    return [];
  }

  return decodeChangelog(script.textContent);
}

function readEntries(
  root: Document | null,
  options: ChangelogOptions,
): ChangelogEntry[] {
  if (options.entries !== undefined) {
    return normalizeEntries(options.entries);
  }

  return readInjectedEntries(root);
}

export function createChangelog(
  options: ChangelogOptions = {},
): ChangelogController {
  const root =
    options.root ??
    (typeof document === "undefined" ? null : document);
  const button = byTestId<HTMLButtonElement>(root, "changelog-button");
  const dialog = byTestId<HTMLDialogElement>(root, "changelog-dialog");
  const closeButton = byTestId<HTMLButtonElement>(root, "changelog-close");
  const list = byTestId<HTMLElement>(root, "changelog-list");

  let open = false;

  const body = root?.body ?? null;
  const setBodyClass = (active: boolean): void => {
    body?.classList?.toggle("changelog-open", active);
  };

  const focusButton = (): void => {
    if (button !== null && typeof button.focus === "function") {
      button.focus();
    }
  };

  const notify = (active: boolean): void => {
    options.onOpenChange?.(active);
  };

  const finalizeClose = (): void => {
    if (!open) {
      return;
    }

    open = false;
    setBodyClass(false);
    focusButton();
    notify(false);
  };

  const close = (): void => {
    if (!open) {
      return;
    }

    open = false;
    setBodyClass(false);

    if (dialog !== null) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }

    focusButton();
    notify(false);
  };

  const show = (): void => {
    if (open || dialog === null) {
      return;
    }

    open = true;
    setBodyClass(true);

    if (typeof dialog.showModal === "function") {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
      }
    } else {
      dialog.setAttribute("open", "");
    }

    notify(true);
  };

  if (list !== null && root !== null) {
    renderChangelogEntries(readEntries(root, options), list, root);
  }

  button?.addEventListener("click", () => {
    if (open) {
      close();
    } else {
      show();
    }
  });

  closeButton?.addEventListener("click", () => {
    close();
  });

  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) {
      close();
    }
  });

  dialog?.addEventListener("close", () => {
    finalizeClose();
  });

  return {
    isOpen: () => open,
    open: show,
    close,
    dispose(): void {
      close();
    },
  };
}
