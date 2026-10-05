import { SPRITE } from "../../world/icons.ts";
import { teamReport } from "./team.ts";
import { type Csv, loadingView, memoView, menubar, messageView } from "./view.ts";

const root = document.getElementById("root");
const full = document.body.dataset.page === "report";
const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector);
const $$ = <T extends Element>(selector: string) => [...document.querySelectorAll<T>(selector)];

function render(html: string, csv?: Csv): void {
  if (root) root.innerHTML = `${SPRITE}${full ? menubar(csv) : ""}<main class="desk">${html}</main>`;
}

function closeMenus(): void {
  for (const title of $$<HTMLButtonElement>(".menu-title")) {
    title.setAttribute("aria-expanded", "false");
    (title.nextElementSibling as HTMLElement).hidden = true;
  }
}

function closeInfo(): void {
  const info = $$<HTMLElement>(".info").find((el) => !el.hidden);
  if (!info) return;
  info.hidden = true;
  $<HTMLElement>(`[data-info="${info.id}"]`)?.focus();
}

function openInfo(anchor: HTMLElement): void {
  closeInfo();
  const info = document.getElementById(anchor.dataset.info ?? "");
  if (!info) return;
  info.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const left = Math.min(Math.max(12, rect.left + scrollX - 24), document.documentElement.clientWidth - info.offsetWidth - 12);
  info.style.left = `${Math.round(left / 2) * 2}px`;
  info.style.top = `${Math.round((rect.bottom + scrollY + 12) / 2) * 2}px`;
  $<HTMLElement>(`#${info.id} .close`)?.focus({ preventScroll: true });
}

document.addEventListener("click", (event) => {
  const target = event.target as Element;
  const menu = target.closest<HTMLButtonElement>(".menu-title");
  const opening = menu?.getAttribute("aria-expanded") === "false";
  closeMenus();
  if (menu && opening) {
    menu.setAttribute("aria-expanded", "true");
    const list = menu.nextElementSibling as HTMLElement;
    list.hidden = false;
    list.querySelector<HTMLElement>("a, button")?.focus();
    return;
  }
  const info = target.closest<HTMLElement>("[data-info]");
  if (info) {
    event.preventDefault();
    openInfo(info);
  } else if (target.closest(".info .close")) closeInfo();
  else if (!target.closest(".info")) $$<HTMLElement>(".info").forEach((el) => (el.hidden = true));
  const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
  if (action === "retry") void show();
  if (action === "more") {
    for (const row of $$<HTMLElement>(".sheet tr[hidden]")) row.hidden = false;
    target.closest(".more")?.remove();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeMenus();
  closeInfo();
});

async function show(): Promise<void> {
  document.body.classList.add("waiting");
  render(loadingView({ progress: 0.02, text: "Starting…" }));
  const result = await teamReport((url, init) => fetch(url, init), new Date(), (step) => {
    const text = $(".loading .step");
    const bar = $<HTMLElement>(".loading .progress");
    if (text) text.textContent = step.text;
    bar?.setAttribute("aria-valuenow", String(Math.round(step.progress * 100)));
    bar?.firstElementChild?.setAttribute("style", `transform:scaleX(${step.progress})`);
  });
  document.body.classList.remove("waiting");
  if (result.kind !== "report") {
    render(messageView(result));
    $<HTMLElement>(".state .button.default")?.focus();
    return;
  }
  const csv = { href: URL.createObjectURL(new Blob([result.csv], { type: "text/csv" })), filename: result.filename };
  if (result.report.org) document.title = `${result.report.org} · openmaxxing`;
  render(memoView(result.report, csv, full), csv);
}

void show();
