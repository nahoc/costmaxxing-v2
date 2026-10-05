import { priceBook, type PriceBook } from "@openmaxxing/core";
import { loadCatalog } from "./catalog.ts";
import type { Config } from "./config.ts";

export async function prices(config: Config, offline: boolean | undefined, vs: string[] = []): Promise<PriceBook> {
  const { prices } = await loadCatalog(Boolean(offline));
  const book = priceBook(prices, config.prices);
  for (const ref of vs) {
    if (!book.has(ref)) throw new Error(`no price for ${ref}. Use a models.dev provider/model ID, like togetherai/zai-org/GLM-5.3`);
  }
  return book;
}
