import { Hono } from "hono";
import {
  hasValidAppointmentOfType,
  normalizeAppointmentType,
  normalizePhone,
} from "../lib/guards.js";
import { readStore, withStore } from "../lib/store.js";
import type {
  Appointment,
  CreateAppointmentBody,
  UpdateAppointmentBody,
  User,
} from "../lib/types.js";

const resolveUser = (
  users: User[],
  body: CreateAppointmentBody,
): User | "invalid-phone" | "mismatch" | undefined => {
  const byId = body.userId
    ? users.find((u) => u.id === body.userId)
    : undefined;
  const phone = body.phone ? normalizePhone(body.phone) : undefined;

  if (body.userId && body.phone) {
    if (!phone) return "invalid-phone";
    if (!byId || byId.phone !== phone) return "mismatch";
    return byId;
  }
  if (body.userId) return byId;
  if (body.phone) {
    if (!phone) return "invalid-phone";
    return users.find((u) => u.phone === phone);
  }
  return undefined;
};

const notFound = (c: { json: (body: unknown, status: number) => Response }) =>
  c.json({ error: "Not found" }, 404);

const badRequest = (
  c: { json: (body: unknown, status: number) => Response },
  message: string,
) => c.json({ error: message }, 400);

export const appointmentRoutes = new Hono();

appointmentRoutes.post("/appointments", async (c) => {
  const body = (await c.req.json()) as CreateAppointmentBody;

  const missing: string[] = [];
  if (!body.userId && !body.phone) missing.push("userId or phone");
  if (!body.type) missing.push("type");
  if (!body.scheduledAt) missing.push("scheduledAt");
  if (!body.notes) missing.push("notes");
  if (missing.length > 0) {
    return badRequest(c, `Missing required fields: ${missing.join(", ")}`);
  }

  const type = normalizeAppointmentType(body.type);
  if (!type) {
    return badRequest(c, 'type must be "service" or "sale" (sales is also accepted)');
  }
  if (body.scheduledAt! < new Date().toISOString()) {
    return badRequest(c, "scheduledAt must be in the future");
  }
  if (body.notes!.trim().length === 0) {
    return badRequest(c, "notes must be a non-empty string");
  }

  const appointment = await withStore((store) => {
    const section = store.automobile;
    const resolved = resolveUser(section.users, body);

    if (resolved === "invalid-phone") return "invalid-phone";
    if (resolved === "mismatch") return "mismatch";
    if (!resolved?.active) return null;

    section.appointments ??= [];
    if (hasValidAppointmentOfType(section.appointments, resolved.id, type)) {
      return "duplicate-type";
    }

    const now = new Date().toISOString();
    const created: Appointment = {
      id: crypto.randomUUID(),
      userId: resolved.id,
      type,
      scheduledAt: body.scheduledAt!,
      notes: body.notes!.trim(),
      createdAt: now,
      updatedAt: now,
    };
    section.appointments.push(created);
    return created;
  });

  if (appointment === "invalid-phone") {
    return badRequest(c, "phone must contain digits");
  }
  if (appointment === "mismatch") {
    return badRequest(c, "userId does not match phone");
  }

  if (appointment === "duplicate-type") {
    return c.json(
      {
        error: `User already has an active ${type} appointment`,
      },
      409,
    );
  }
  if (!appointment) return c.json({ error: "User not found or inactive" }, 400);
  return c.json(appointment, 201);
});

appointmentRoutes.patch("/appointments/:id", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json()) as UpdateAppointmentBody;

  const type = body.type ? normalizeAppointmentType(body.type) : undefined;
  if (body.type && !type) {
    return badRequest(c, 'type must be "service" or "sale" (sales is also accepted)');
  }
  if (
    body.scheduledAt !== undefined &&
    body.scheduledAt < new Date().toISOString()
  ) {
    return badRequest(c, "scheduledAt must be in the future");
  }

  const appointment = await withStore((store) => {
    const section = store.automobile;
    section.appointments ??= [];
    const index = section.appointments.findIndex((a) => a.id === id);
    if (index === -1) return undefined;

    const current = section.appointments[index];
    const resolvedType = type ?? current.type;
    const scheduledAt = body.scheduledAt ?? current.scheduledAt;

    const updated: Appointment = {
      ...current,
      type: resolvedType,
      scheduledAt,
      notes: body.notes !== undefined ? body.notes?.trim() : current.notes,
      updatedAt: new Date().toISOString(),
    };

    if (
      scheduledAt >= new Date().toISOString() &&
      hasValidAppointmentOfType(
        section.appointments,
        current.userId,
        resolvedType,
        id,
      )
    ) {
      return { conflict: resolvedType };
    }

    section.appointments[index] = updated;
    return updated;
  });

  if (
    appointment &&
    typeof appointment === "object" &&
    "conflict" in appointment
  ) {
    return c.json(
      {
        error: `User already has an active ${appointment.conflict} appointment`,
      },
      409,
    );
  }
  if (!appointment) return notFound(c);
  return c.json(appointment);
});

appointmentRoutes.delete("/appointments/:id", async (c) => {
  const id = c.req.param("id");

  const removed = await withStore((store) => {
    const section = store.automobile;
    section.appointments ??= [];
    const index = section.appointments.findIndex((a) => a.id === id);
    if (index === -1) return false;
    section.appointments.splice(index, 1);
    return true;
  });

  if (!removed) return notFound(c);
  return c.body(null, 204);
});

appointmentRoutes.get("/appointments", async (c) => {
  const store = await readStore();
  return c.json(store.automobile.appointments ?? []);
});

appointmentRoutes.get("/appointments/:id", async (c) => {
  const store = await readStore();
  const appointment = store.automobile.appointments?.find(
    (a) => a.id === c.req.param("id"),
  );
  if (!appointment) return notFound(c);
  return c.json(appointment);
});
