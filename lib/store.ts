import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Store } from "./types.js";

const getStorePath = () =>
  process.env.STORE_PATH ??
  path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "data"), "store.json");

const emptyStore = (): Store => ({
  automobile: { users: [], appointments: [] },
  inmobiliary: { users: [] },
  "internal-tool": { users: [] },
});

let writeQueue: Promise<void> = Promise.resolve();

const persist = async (store: Store) => {
  const storePath = getStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2));
};

export const resetStoreForTests = async () => {
  writeQueue = Promise.resolve();
  await persist(emptyStore());
};

export const readStore = async (): Promise<Store> => {
  try {
    const raw = await readFile(getStorePath(), "utf-8");
    return { ...emptyStore(), ...JSON.parse(raw) } as Store;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      const store = emptyStore();
      await persist(store);
      return store;
    }
    throw err;
  }
};

export const withStore = async <T>(
  fn: (store: Store) => T | Promise<T>,
): Promise<T> => {
  const run = writeQueue.then(async () => {
    const store = await readStore();
    const result = await fn(store);
    await persist(store);
    return result;
  });
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
};
