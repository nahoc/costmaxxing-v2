import { APP_ICON, type Grid } from "./app-icon.ts";

type Ink = "b" | "w" | undefined;

class Bitmap {
  readonly size: number;
  readonly cells: Ink[][];

  constructor(size: number) {
    this.size = size;
    this.cells = Array.from({ length: size }, () => Array<Ink>(size).fill(undefined));
  }

  set(x: number, y: number, ink: Ink = "b"): this {
    if (x >= 0 && y >= 0 && x < this.size && y < this.size) this.cells[y]![x] = ink;
    return this;
  }

  fill(x0: number, y0: number, x1: number, y1: number, ink: Ink = "b"): this {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, ink);
    return this;
  }

  box(x0: number, y0: number, x1: number, y1: number): this {
    return this.fill(x0, y0, x1, y1, "w").fill(x0, y0, x1, y0).fill(x0, y1, x1, y1).fill(x0, y0, x0, y1).fill(x1, y0, x1, y1);
  }

  art(x0: number, y0: number, rows: string[]): this {
    rows.forEach((row, y) => [...row].forEach((c, x) => c !== "." && this.set(x0 + x, y0 + y, c === "#" ? "b" : "w")));
    return this;
  }

  paths(): string {
    return (["p", "i"] as const)
      .map((cls) => {
        const ink = cls === "i" ? "b" : "w";
        let d = "";
        this.cells.forEach((row, y) => {
          let start = -1;
          for (let x = 0; x <= this.size; x++) {
            if (x < this.size && row[x] === ink) {
              if (start < 0) start = x;
            } else if (start >= 0) {
              d += `M${start} ${y}h${x - start}v1h${start - x}z`;
              start = -1;
            }
          }
        });
        return d ? `<path ${cls === "i" ? 'fill="currentColor"' : 'style="fill:var(--icon-paper,#fff)"'} d="${d}"/>` : "";
      })
      .join("");
  }
}

function page(): Bitmap {
  const b = new Bitmap(24).box(5, 2, 18, 21);
  for (let i = 0; i < 4; i++) b.fill(18 - i, 2, 18, 2 + i, undefined);
  return b.fill(14, 2, 14, 6).fill(14, 6, 18, 6).set(15, 3).set(16, 4).set(17, 5).fill(15, 5, 16, 5, "w").set(15, 4, "w");
}

const readMe = page().fill(8, 9, 15, 9).fill(8, 11, 13, 11).fill(8, 13, 15, 13).fill(8, 15, 12, 15).fill(8, 17, 14, 17);

const bill = page().art(9, 7, [
  "..#..",
  ".####",
  "#.#..",
  "#.#..",
  ".###.",
  "..#.#",
  "..#.#",
  "####.",
  "..#..",
]);

const paint = page().box(7, 9, 16, 18).art(8, 10, [
  "........",
  "......#.",
  ".....##.",
  "..#.###.",
  ".#######",
  "########",
  "########",
  "########",
]);

const floppy = new Bitmap(24)
  .box(3, 3, 20, 20)
  .fill(19, 3, 20, 4, undefined)
  .set(19, 4)
  .set(20, 5)
  .fill(7, 3, 15, 8)
  .fill(12, 4, 13, 7, "w")
  .box(6, 12, 17, 20)
  .fill(8, 15, 15, 15)
  .fill(8, 17, 13, 17);

function fromGrid(grid: Grid): Bitmap {
  const b = new Bitmap(grid.length);
  grid.forEach((row, y) => row.forEach((ink, x) => ink && b.set(x, y, ink === "i" ? "b" : "w")));
  return b;
}

const logo = fromGrid(APP_ICON.small());
const computer = fromGrid(APP_ICON.medium());

const BITMAPS = { computer, readMe, bill, paint, floppy, logo };
export type IconName = keyof typeof BITMAPS;

export const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${Object.entries(BITMAPS)
  .map(([name, b]) => `<symbol id="i-${name}" viewBox="0 0 ${b.size} ${b.size}">${b.paths()}</symbol>`)
  .join("")}</svg>`;

export function icon(name: IconName): string {
  return `<svg class="px" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

export const INK = "#2e1065";

function dataUri(b: Bitmap, size: number): string {
  const paths = b.paths().replaceAll("currentColor", INK).replaceAll("var(--icon-paper,#fff)", "#fff");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${b.size} ${b.size}" shape-rendering="crispEdges">${paths}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const ARROW = [
  "#...............",
  "##..............",
  "#w#.............",
  "#ww#............",
  "#www#...........",
  "#wwww#..........",
  "#wwwww#.........",
  "#wwwwww#........",
  "#wwwwwww#.......",
  "#wwwww#####.....",
  "#ww#ww#.........",
  "#w#.#ww#........",
  "##..#ww#........",
  "#....#ww#.......",
  ".....#ww#.......",
  "......##........",
];

export function cursor(): string {
  return `url("${dataUri(new Bitmap(16).art(0, 0, ARROW), 32)}") 1 1, default`;
}
