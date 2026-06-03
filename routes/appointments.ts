import { Hono } from "hono";
import { appointmentErrors } from "../lib/errors.js";
import {
  findValidAppointmentForUser,
  getActiveAppointmentBlock,
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

const lookupUser = (
  users: User[],
  body: CreateAppointmentBody,
): User | undefined => {
  const resolved = resolveUser(users, body);
  if (
    resolved === "invalid-phone" ||
    resolved === "mismatch" ||
    resolved === undefined
  ) {
    return undefined;
  }
  return resolved;
};

export const appointmentRoutes = new Hono();

appointmentRoutes.post("/appointments", async (c) => {
  const body = (await c.req.json()) as CreateAppointmentBody;

  const missing: string[] = [];
  if (!body.userId && !body.phone) missing.push("userId or phone");
  if (!body.type) missing.push("type");
  if (!body.scheduledAt) missing.push("scheduledAt");
  if (!body.notes) missing.push("notes");
  if (missing.length > 0) {
    return appointmentErrors.missingFields(c, missing);
  }

  const type = normalizeAppointmentType(body.type);
  if (!type) return appointmentErrors.invalidType(c);
  if (body.scheduledAt! < new Date().toISOString()) {
    return appointmentErrors.scheduledAtPast(c);
  }
  if (body.notes!.trim().length === 0) {
    return appointmentErrors.notesEmpty(c);
  }

  const appointment = await withStore((store) => {
    const section = store.automobile;
    const resolved = resolveUser(section.users, body);

    if (resolved === "invalid-phone") return "invalid-phone";
    if (resolved === "mismatch") return "mismatch";

    const user = lookupUser(section.users, body);
    if (!user) return "not-found";
    if (!user.active) return "inactive";

    section.appointments ??= [];
    const block = getActiveAppointmentBlock(
      section.appointments,
      user.id,
      type,
    );
    if (block === "same-type") return "same-type";
    if (block === "other-type") {
      const existing = findValidAppointmentForUser(
        section.appointments,
        user.id,
      )!;
      return { kind: "other-type", existingType: existing.type };
    }

    const now = new Date().toISOString();
    const created: Appointment = {
      id: crypto.randomUUID(),
      userId: user.id,
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
    return appointmentErrors.invalidPhone(c);
  }
  if (appointment === "mismatch") {
    return appointmentErrors.userIdPhoneMismatch(c);
  }
  if (appointment === "not-found") {
    return appointmentErrors.userNotFound(c);
  }
  if (appointment === "inactive") {
    return appointmentErrors.userInactive(c);
  }
  if (appointment === "same-type") {
    return appointmentErrors.activeSameType(c, type);
  }
  if (
    appointment &&
    typeof appointment === "object" &&
    "kind" in appointment
  ) {
    return appointmentErrors.activeOtherType(c, appointment.existingType);
  }

  return c.json(appointment as Appointment, 201);
});

appointmentRoutes.patch("/appointments/user/:userId", async (c) => {
  const userId = c.req.param("userId");
  const body = (await c.req.json()) as UpdateAppointmentBody;

  const type = body.type ? normalizeAppointmentType(body.type) : undefined;
  if (body.type && !type) return appointmentErrors.invalidType(c);
  if (
    body.scheduledAt !== undefined &&
    body.scheduledAt < new Date().toISOString()
  ) {
    return appointmentErrors.scheduledAtPast(c);
  }
  if (body.notes !== undefined && body.notes.trim().length === 0) {
    return appointmentErrors.notesEmpty(c);
  }

  const appointment = await withStore((store) => {
    const section = store.automobile;
    section.appointments ??= [];

    const current = findValidAppointmentForUser(section.appointments, userId);
    if (!current) return undefined;

    const index = section.appointments.findIndex((a) => a.id === current.id);
    const updated: Appointment = {
      ...current,
      type: type ?? current.type,
      scheduledAt: body.scheduledAt ?? current.scheduledAt,
      notes: body.notes !== undefined ? body.notes.trim() : current.notes,
      updatedAt: new Date().toISOString(),
    };

    section.appointments[index] = updated;
    return updated;
  });

  if (!appointment) return appointmentErrors.noActiveForUser(c, userId);
  return c.json(appointment);
});

appointmentRoutes.get("/appointments/user/:userId", async (c) => {
  const userId = c.req.param("userId");
  const store = await readStore();
  const appointment = findValidAppointmentForUser(
    store.automobile.appointments ?? [],
    userId,
  );
  if (!appointment) return appointmentErrors.noActiveForUser(c, userId);
  return c.json(appointment);
});

appointmentRoutes.delete("/appointments/user/:userId", async (c) => {
  const userId = c.req.param("userId");

  const removed = await withStore((store) => {
    const section = store.automobile;
    section.appointments ??= [];
    const current = findValidAppointmentForUser(section.appointments, userId);
    if (!current) return false;

    const index = section.appointments.findIndex((a) => a.id === current.id);
    section.appointments.splice(index, 1);
    return true;
  });

  if (!removed) return appointmentErrors.noActiveForUser(c, userId);
  return c.body(null, 204);
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

  if (!removed) return appointmentErrors.notFoundById(c, id);
  return c.body(null, 204);
});

appointmentRoutes.get("/appointments", async (c) => {
  const store = await readStore();
  return c.json(store.automobile.appointments ?? []);
});

appointmentRoutes.get("/appointments/:id", async (c) => {
  const id = c.req.param("id");
  const store = await readStore();
  const appointment = store.automobile.appointments?.find((a) => a.id === id);
  if (!appointment) return appointmentErrors.notFoundById(c, id);
  return c.json(appointment);
});
