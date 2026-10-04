export type Ink = "i" | "p" | undefined;
export type Grid = Ink[][];

function canvas(size: number) {
  const cells: Grid = Array.from({ length: size }, () => Array<Ink>(size).fill(undefined));
  const set = (x: number, y: number, ink: Ink = "i") => {
    if (x >= 0 && y >= 0 && x < size && y < size) cells[y]![x] = ink;
  };
  const fill = (x0: number, y0: number, x1: number, y1: number, ink: Ink = "i") => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, ink);
  };
  const frame = (x0: number, y0: number, x1: number, y1: number) => {
    fill(x0, y0, x1, y1, "p");
    fill(x0 + 1, y0, x1 - 1, y0);
    fill(x0 + 1, y1, x1 - 1, y1);
    fill(x0, y0 + 1, x0, y1 - 1);
    fill(x1, y0 + 1, x1, y1 - 1);
  };
  const dither = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, (x + y) % 2 === 0 ? "i" : "p");
  };
  const zebra = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, (x + y) % 4 === 0 ? "p" : "i");
  };
  return { cells, fill, frame, dither, zebra };
}

function large(): Grid {
  const { cells, fill, frame, dither, zebra } = canvas(64);
  fill(15, 10, 53, 50);
  fill(17, 51, 51, 55);
  frame(13, 8, 51, 48);
  frame(15, 49, 49, 53);
  dither(16, 50, 48, 52);
  dither(14, 42, 50, 47);
  fill(14, 41, 50, 41);
  frame(18, 12, 46, 35);
  frame(20, 14, 44, 33);
  frame(23, 16, 29, 30);
  zebra(24, 17, 28, 29);
  fill(31, 23, 35, 30);
  fill(37, 27, 41, 30);
  fill(22, 31, 42, 31);
  fill(35, 38, 45, 38);
  fill(36, 39, 45, 39, "p");
  fill(19, 38, 21, 38);
  return cells;
}

function medium(): Grid {
  const { cells, fill, frame, dither } = canvas(24);
  fill(5, 3, 22, 20);
  fill(6, 21, 21, 22);
  frame(4, 2, 20, 19);
  frame(6, 4, 18, 13);
  frame(8, 6, 10, 12);
  fill(12, 9, 13, 12);
  fill(15, 11, 16, 12);
  fill(7, 12, 17, 12);
  fill(13, 15, 17, 15);
  fill(6, 15, 7, 15);
  dither(5, 17, 19, 18);
  frame(6, 20, 18, 21);
  return cells;
}

function small(): Grid {
  const { cells, fill, frame } = canvas(16);
  fill(2, 2, 14, 13);
  frame(1, 1, 13, 12);
  frame(3, 3, 11, 8);
  fill(5, 5, 5, 7);
  fill(7, 6, 7, 7);
  fill(9, 7, 9, 7);
  fill(8, 10, 11, 10);
  return cells;
}

export const APP_ICON = { large, medium, small };
