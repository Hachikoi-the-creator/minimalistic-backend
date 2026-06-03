import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Hono } from "hono";
import { resetStoreForTests } from "../lib/store.js";

let testDir: string;

export const setupTestStore = async () => {
  testDir = await mkdtemp(path.join(tmpdir(), "demo-server-test-"));
  process.env.STORE_PATH = path.join(testDir, "store.json");
  await resetStoreForTests();
};

export const teardownTestStore = async () => {
  delete process.env.STORE_PATH;
  if (testDir) await rm(testDir, { recursive: true, force: true });
};

export const futureScheduledAt = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString();
};

export const pastScheduledAt = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  return date.toISOString();
};

export const jsonRequest = (
  app: Hono,
  path: string,
  init: RequestInit & { method: string },
) =>
  app.request(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

export const parseJson = async <T>(response: Response): Promise<T> =>
  response.json() as Promise<T>;

export type ApiErrorBody = { error: string; code: string };

export const parseApiError = async (response: Response) =>
  parseJson<ApiErrorBody>(response);
