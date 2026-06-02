import { Hono } from "hono";
import { hasValidAppointmentOfType } from "../lib/guards.js";
import { readStore, withStore } from "../lib/store.js";
import type {
  Appointment,
  CreateAppointmentBody,
  UpdateAppointmentBody,
} from "../lib/types.js";

const notFound = (c: { json: (body: unknown, status: number) => Response }) =>
  c.json({ error: "Not found" }, 404);

const badRequest = (
  c: { json: (body: unknown, status: number) => Response },
  message: string,
) => c.json({ error: message }, 400);

export const appointmentRoutes = new Hono();

appointmentRoutes.post("/appointments", async (c) => {
  const body = (await c.req.json()) as CreateAppointmentBody;
  if (!body.userId || !body.type || !body.scheduledAt || !body.notes) {
    return badRequest(c, "userId, type, scheduledAt, and notes are required");
  }
  if (body.type !== "service" && body.type !== "sale") {
    return badRequest(c, "type must be service or sale");
  }
  if (body.scheduledAt < new Date().toISOString()) {
    return badRequest(c, "scheduledAt must be in the future");
  }
  if (body.notes.trim().length === 0) {
    return badRequest(c, "notes must be a non-empty string");
  }

  const appointment = await withStore((store) => {
    const section = store.automobile;
    const user = section.users.find((u) => u.id === body.userId);
    if (!user?.active) return null;

    section.appointments ??= [];
    if (
      hasValidAppointmentOfType(
        section.appointments,
        body.userId,
        body.type,
      )
    ) {
      return "duplicate-type";
    }

    const now = new Date().toISOString();
    const created: Appointment = {
      id: crypto.randomUUID(),
      userId: body.userId,
      type: body.type,
      scheduledAt: body.scheduledAt,
      notes: body.notes?.trim(),
      createdAt: now,
      updatedAt: now,
    };
    section.appointments ??= [];
    section.appointments.push(created);
    return created;
  });

  if (appointment === "duplicate-type") {
    return c.json(
      {
        error: `User already has an active ${body.type} appointment`,
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

  if (body.type && body.type !== "service" && body.type !== "sale") {
    return badRequest(c, "type must be service or sale");
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
    const type = body.type ?? current.type;
    const scheduledAt = body.scheduledAt ?? current.scheduledAt;

    const updated: Appointment = {
      ...current,
      type,
      scheduledAt,
      notes: body.notes !== undefined ? body.notes?.trim() : current.notes,
      updatedAt: new Date().toISOString(),
    };

    if (
      scheduledAt >= new Date().toISOString() &&
      hasValidAppointmentOfType(
        section.appointments,
        current.userId,
        type,
        id,
      )
    ) {
      return { conflict: type };
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
