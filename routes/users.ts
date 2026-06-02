import { Hono } from "hono";
import { isPhoneTaken, normalizePhone } from "../lib/guards.js";
import { readStore, withStore } from "../lib/store.js";
import type {
  CreateUserBody,
  Prefix,
  UpdateUserBody,
  User,
} from "../lib/types.js";

const notFound = (c: { json: (body: unknown, status: number) => Response }) =>
  c.json({ error: "Not found" }, 404);

const badRequest = (
  c: { json: (body: unknown, status: number) => Response },
  message: string,
) => c.json({ error: message }, 400);

export const createUserRoutes = (
  prefix: Prefix,
  options: { allowDeactivate?: boolean } = {},
) => {
  const app = new Hono();

  app.post("/users", async (c) => {
    const body = (await c.req.json()) as CreateUserBody;
    if (!body.name?.trim() || !body.phone?.trim()) {
      return badRequest(c, "name and phone are required");
    }

    const phone = normalizePhone(body.phone);
    if (!phone) return badRequest(c, "phone must contain digits");

    const user = await withStore((store) => {
      const section = store[prefix];
      if (isPhoneTaken(store, phone)) {
        return null;
      }
      const now = new Date().toISOString();
      const created: User = {
        id: crypto.randomUUID(),
        name: body.name.trim(),
        phone,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      section.users.push(created);
      return created;
    });

    if (!user) return c.json({ error: "Phone already in use" }, 409);
    return c.json(user, 201);
  });

  app.patch("/users/:id", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json()) as UpdateUserBody;

    const user = await withStore((store) => {
      const section = store[prefix];
      const index = section.users.findIndex((u) => u.id === id);
      if (index === -1) return undefined;

      const current = section.users[index];
      const phone =
        body.phone !== undefined ? normalizePhone(body.phone) : current.phone;

      if (body.phone !== undefined && !phone) {
        return "invalid-phone";
      }

      if (body.phone !== undefined && phone !== current.phone) {
        if (isPhoneTaken(store, phone, id)) {
          return null;
        }
      }

      const updated: User = {
        ...current,
        name: body.name?.trim() ?? current.name,
        phone,
        updatedAt: new Date().toISOString(),
      };
      section.users[index] = updated;
      return updated;
    });

    if (user === "invalid-phone") {
      return badRequest(c, "phone must contain digits");
    }
    if (user === null) return c.json({ error: "Phone already in use" }, 409);
    if (!user) return notFound(c);
    return c.json(user);
  });

  if (options.allowDeactivate) {
    app.post("/users/:id/deactivate", async (c) => {
      const id = c.req.param("id");

      const user = await withStore((store) => {
        const section = store[prefix];
        const index = section.users.findIndex((u) => u.id === id);
        if (index === -1) return undefined;

        const updated: User = {
          ...section.users[index],
          active: false,
          updatedAt: new Date().toISOString(),
        };
        section.users[index] = updated;
        return updated;
      });

      if (!user) return notFound(c);
      return c.json(user);
    });
  }

  app.get("/users", async (c) => {
    const store = await readStore();
    return c.json(store[prefix].users);
  });

  app.get("/users/search", async (c) => {
    const raw = c.req.query("phone");
    if (!raw?.trim()) {
      return badRequest(c, "phone query parameter is required");
    }

    const phone = normalizePhone(raw);
    if (!phone) return badRequest(c, "phone must contain digits");

    const store = await readStore();
    const user = store[prefix].users.find((u) => u.phone === phone);
    if (!user) return notFound(c);
    return c.json(user);
  });

  app.get("/users/:id", async (c) => {
    const store = await readStore();
    const user = store[prefix].users.find((u) => u.id === c.req.param("id"));
    if (!user) return notFound(c);
    return c.json(user);
  });

  return app;
};
