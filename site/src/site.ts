const root = document.documentElement;
const wide = matchMedia("(min-width: 1100px)");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const $ = <T extends Element>(selector: string, scope: ParentNode = document) => scope.querySelector<T>(selector);
const $$ = <T extends Element>(selector: string, scope: ParentNode = document) => [...scope.querySelectorAll<T>(selector)];

let top = 10;
function front(el: HTMLElement): void {
  el.style.zIndex = String(++top);
  if (!el.classList.contains("window")) return;
  for (const w of $$<HTMLElement>(".window.active")) w.classList.remove("active");
  el.classList.add("active");
}

async function zoom(from: DOMRect, to: DOMRect): Promise<void> {
  if (still.matches || !wide.matches) return;
  const frames = 9;
  const boxes: HTMLElement[] = [];
  for (let i = 1; i <= frames; i++) {
    const t = i / frames;
    const box = document.createElement("div");
    box.className = "zoom";
    Object.assign(box.style, {
      left: `${Math.round(from.left + (to.left - from.left) * t)}px`,
      top: `${Math.round(from.top + (to.top - from.top) * t)}px`,
      width: `${Math.round(from.width + (to.width - from.width) * t)}px`,
      height: `${Math.round(from.height + (to.height - from.height) * t)}px`,
    });
    document.body.append(box);
    boxes.push(box);
    boxes.at(-4)?.remove();
    await pause(18);
  }
  for (const box of boxes) box.remove();
}

function iconFor(id: string): HTMLElement | null {
  return $(`.icon[data-open="${id}"]`);
}

async function open(el: HTMLElement, from?: Element | null): Promise<void> {
  const wasHidden = el.hidden || getComputedStyle(el).visibility === "hidden";
  el.hidden = false;
  if (wasHidden && from) {
    el.style.visibility = "hidden";
    await zoom(from.getBoundingClientRect(), el.getBoundingClientRect());
  }
  el.style.visibility = "visible";
  front(el);
  if (el.classList.contains("paint") && !still.matches) {
    el.classList.remove("painting");
    void el.offsetWidth;
    el.classList.add("painting");
  }
}

async function close(el: HTMLElement): Promise<void> {
  const to = iconFor(el.id) ?? $(`[data-info="${el.id}"]`);
  const rect = el.getBoundingClientRect();
  el.hidden = true;
  if (to) await zoom(rect, to.getBoundingClientRect());
}

async function beep(): Promise<void> {
  if (still.matches) return;
  root.classList.add("flash");
  await pause(90);
  root.classList.remove("flash");
}

async function showHero(): Promise<void> {
  const hero = $<HTMLElement>("#hero");
  if (!hero) return;
  hero.style.visibility = "visible";
  front(hero);
  await beep();
  $<HTMLElement>(".button.default", hero)?.focus({ preventScroll: true });
}

async function boot(): Promise<void> {
  if (!root.classList.contains("booting")) return;
  const screen = $<HTMLElement>(".boot");
  let skipped = false;
  const skip = () => {
    skipped = true;
  };
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart"]) addEventListener(type, skip, { once: true, passive: true });
  const step = async (ms: number) => {
    if (!skipped) await pause(ms);
  };
  await step(500);
  screen?.classList.add("welcoming");
  await step(650);
  const windows = [$<HTMLElement>("#bill")].filter((w) => w !== null);
  for (const w of [...windows, $<HTMLElement>("#hero")]) if (w) w.style.visibility = "hidden";
  const icons = $$<HTMLElement>(".icons li");
  for (const li of icons) li.style.visibility = "hidden";
  root.classList.remove("booting");
  sessionStorage.setItem("booted", "1");
  for (const li of icons) {
    li.style.visibility = "visible";
    await step(40);
  }
  for (const w of windows) {
    if (skipped) w.style.visibility = "visible";
    else await open(w, iconFor(w.id));
    await step(120);
  }
  await step(220);
  await showHero();
}

function finishBoot(): void {
  root.classList.remove("booting");
  for (const el of $$<HTMLElement>(".window:not(.info), .alert, .icons li")) el.style.visibility = "visible";
}

const home = new Map<HTMLElement, { left: string; top: string }>();
function drag(win: HTMLElement, bar: HTMLElement): void {
  bar.addEventListener("pointerdown", (event) => {
    if (!wide.matches || (event.target as Element).closest("button")) return;
    front(win);
    const desk = win.offsetParent as HTMLElement | null;
    if (!desk) return;
    if (!home.has(win)) home.set(win, { left: win.style.left, top: win.style.top });
    const box = win.getBoundingClientRect();
    const deskBox = desk.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY, left: box.left - deskBox.left, top: box.top - deskBox.top };
    const outline = document.createElement("div");
    outline.className = "drag-outline";
    Object.assign(outline.style, {
      left: `${start.left}px`,
      top: `${start.top}px`,
      width: `${win.offsetWidth}px`,
      height: `${win.offsetHeight}px`,
    });
    desk.append(outline);
    bar.setPointerCapture(event.pointerId);
    let dx = 0;
    let dy = 0;
    const move = (e: PointerEvent) => {
      dx = Math.round((e.clientX - start.x) / 2) * 2;
      dy = Math.round((e.clientY - start.y) / 2) * 2;
      outline.style.translate = `${dx}px ${dy}px`;
    };
    const up = () => {
      bar.removeEventListener("pointermove", move);
      outline.remove();
      if (dx || dy) {
        Object.assign(win.style, {
          left: `${start.left + dx}px`,
          top: `${Math.max(0, start.top + dy)}px`,
          bottom: "auto",
          right: "auto",
          translate: "0 0",
        });
      }
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up, { once: true });
    bar.addEventListener("pointercancel", up, { once: true });
  });
}

function cleanUp(): void {
  for (const [win, pos] of home) Object.assign(win.style, { left: pos.left, top: pos.top, bottom: "", right: "", translate: "" });
  home.clear();
  finishBoot();
}

function placeInfo(info: HTMLElement, anchor: Element): void {
  if (!wide.matches) return;
  const rect = anchor.getBoundingClientRect();
  const width = 440;
  const left = Math.min(Math.max(12, rect.left + scrollX - 40), document.documentElement.clientWidth - width - 24);
  info.style.left = `${Math.round(left / 2) * 2}px`;
  info.style.top = `${Math.round((rect.bottom + scrollY + 14) / 2) * 2}px`;
}

async function openInfo(id: string, anchor: Element): Promise<void> {
  const info = $<HTMLElement>(`#${id}`);
  if (!info) return;
  placeInfo(info, anchor);
  await open(info, anchor);
  $<HTMLElement>(".close", info)?.focus({ preventScroll: true });
}

function menus(): void {
  const titles = $$<HTMLButtonElement>(".menu-title");
  const shut = () => {
    for (const t of titles) {
      t.setAttribute("aria-expanded", "false");
      const menu = t.nextElementSibling as HTMLElement | null;
      if (menu) menu.hidden = true;
    }
  };
  for (const title of titles) {
    title.addEventListener("click", (event) => {
      event.stopPropagation();
      const opening = title.getAttribute("aria-expanded") !== "true";
      shut();
      if (!opening) return;
      title.setAttribute("aria-expanded", "true");
      const menu = title.nextElementSibling as HTMLElement | null;
      if (menu) {
        menu.hidden = false;
        $<HTMLElement>("a, button", menu)?.focus();
      }
    });
  }
  document.addEventListener("click", shut);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") shut();
  });
}

function wire(): void {
  for (const win of $$<HTMLElement>(".window, .alert")) {
    win.addEventListener("pointerdown", () => front(win));
    const bar = $<HTMLElement>(".titlebar", win);
    if (bar) drag(win, bar);
    $<HTMLButtonElement>(".close", win)?.addEventListener("click", () => void close(win));
  }
  for (const opener of $$<HTMLButtonElement>("[data-open]")) {
    opener.addEventListener("click", () => {
      for (const i of $$(".icon.selected")) i.classList.remove("selected");
      if (opener.classList.contains("icon")) opener.classList.add("selected");
      const id = opener.dataset.open ?? "";
      if (id === "install") $<HTMLAnchorElement>(".hero .button.default")?.click();
      else if (id === "hero") void showHero();
      else {
        const win = $<HTMLElement>(`#${id}`);
        if (win) void open(win, iconFor(id) ?? opener);
      }
    });
  }
  for (const link of $$<HTMLAnchorElement>("[data-info]")) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      void openInfo(link.dataset.info ?? "", link);
    });
  }
  for (const button of $$<HTMLButtonElement>('[data-action="cleanup"]')) button.addEventListener("click", cleanUp);
  for (const link of $$<HTMLAnchorElement>("[data-zip]")) {
    link.addEventListener("click", () => {
      const note = $<HTMLElement>("#info-zip");
      if (note) setTimeout(() => void openInfo("info-zip", link), 250);
    });
  }
  addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const info = $$<HTMLElement>(".info").find((i) => !i.hidden);
    if (info) void close(info);
  });
  const target = location.hash.slice(1);
  if (target.startsWith("info-")) {
    const anchor = $(`[data-info="${target}"]`);
    if (anchor) void openInfo(target, anchor);
  }
}

wire();
menus();
if (root.classList.contains("booting")) void boot();
else finishBoot();
