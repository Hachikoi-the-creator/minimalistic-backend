import { afterEach, beforeEach, describe, expect, it } from "vitest";
import app from "../app.js";
import type { Appointment, User } from "../lib/types.js";
import {
  futureScheduledAt,
  jsonRequest,
  parseApiError,
  parseJson,
  pastScheduledAt,
  setupTestStore,
  teardownTestStore,
} from "./helpers.js";

const base = "/automobile";

const createUser = async (overrides: Partial<{ name: string; phone: string }> = {}) => {
  const res = await jsonRequest(app, `${base}/users`, {
    method: "POST",
    body: JSON.stringify({
      name: "Test User",
      phone: "5550001000",
      ...overrides,
    }),
  });
  const user = res.status === 201 ? await parseJson<User>(res) : null;
  return { res, user };
};

const createAppointment = async (body: Record<string, unknown>) => {
  const res = await jsonRequest(app, `${base}/appointments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const appointment = res.status === 201 ? await parseJson<Appointment>(res) : null;
  return { res, appointment };
};

beforeEach(async () => {
  await setupTestStore();
});

afterEach(async () => {
  await teardownTestStore();
});

describe("automobile users", () => {
  it("creates a user with normalized phone", async () => {
    const { res, user } = await createUser({ phone: "555-111-2222" });

    expect(res.status).toBe(201);
    expect(user!.phone).toBe("5551112222");
    expect(user!.active).toBe(true);
    expect(user!.name).toBe("Test User");
  });

  it("rejects create without name or phone", async () => {
    const res = await jsonRequest(app, `${base}/users`, {
      method: "POST",
      body: JSON.stringify({ name: "Only Name" }),
    });

    expect(res.status).toBe(400);
    const err = await parseApiError(res);
    expect(err.code).toBe("USER_MISSING_PHONE");
    expect(err.error).toContain("phone");
  });

  it("rejects create with phone that has no digits", async () => {
    const res = await jsonRequest(app, `${base}/users`, {
      method: "POST",
      body: JSON.stringify({ name: "Test", phone: "---" }),
    });

    expect(res.status).toBe(400);
    const err = await parseApiError(res);
    expect(err.code).toBe("USER_INVALID_PHONE");
  });

  it("rejects duplicate phone in automobile", async () => {
    await createUser({ phone: "5550002000" });
    const { res } = await createUser({ name: "Other", phone: "555-000-2000" });

    expect(res.status).toBe(409);
    const err = await parseApiError(res);
    expect(err.code).toBe("USER_PHONE_TAKEN");
    expect(err.error).toContain("already registered");
  });

  it("rejects duplicate phone across prefixes", async () => {
    await jsonRequest(app, "/inmobiliary/users", {
      method: "POST",
      body: JSON.stringify({ name: "Inmo User", phone: "5550003000" }),
    });

    const { res } = await createUser({ phone: "5550003000" });
    expect(res.status).toBe(409);
  });

  it("updates user name and phone", async () => {
    const { user } = await createUser();
    const res = await jsonRequest(app, `${base}/users/${user!.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated", phone: "555-999-8888" }),
    });

    const updated = await parseJson<User>(res);
    expect(res.status).toBe(200);
    expect(updated.name).toBe("Updated");
    expect(updated.phone).toBe("5559998888");
  });

  it("rejects update when phone is already taken", async () => {
    await createUser({ phone: "5550004000" });
    const { user } = await createUser({ phone: "5550004001" });

    const res = await jsonRequest(app, `${base}/users/${user!.id}`, {
      method: "PATCH",
      body: JSON.stringify({ phone: "555-000-4000" }),
    });

    expect(res.status).toBe(409);
  });

  it("deactivates a user", async () => {
    const { user } = await createUser();
    const res = await jsonRequest(app, `${base}/users/${user!.id}/deactivate`, {
      method: "POST",
    });

    const deactivated = await parseJson<User>(res);
    expect(res.status).toBe(200);
    expect(deactivated.active).toBe(false);
  });

  it("searches user by phone", async () => {
    const { user } = await createUser({ phone: "5550005000" });
    const res = await app.request(`${base}/users/search?phone=555-000-5000`);

    expect(res.status).toBe(200);
    expect((await parseJson<User>(res)).id).toBe(user!.id);
  });

  it("returns 404 when search phone is not found", async () => {
    const res = await app.request(`${base}/users/search?phone=0000000000`);
    expect(res.status).toBe(404);
  });

  it("returns 400 when search phone param is missing", async () => {
    const res = await app.request(`${base}/users/search`);
    expect(res.status).toBe(400);
  });

  it("lists and gets user by id", async () => {
    const { user } = await createUser({ phone: "5550006000" });

    const listRes = await app.request(`${base}/users`);
    const users = await parseJson<User[]>(listRes);
    expect(listRes.status).toBe(200);
    expect(users).toHaveLength(1);

    const getRes = await app.request(`${base}/users/${user!.id}`);
    expect(getRes.status).toBe(200);
    expect((await parseJson<User>(getRes)).id).toBe(user!.id);
  });

  it("returns 404 for unknown user id", async () => {
    const res = await app.request(`${base}/users/unknown-id`);
    expect(res.status).toBe(404);
    const err = await parseApiError(res);
    expect(err.code).toBe("USER_NOT_FOUND");
    expect(err.error).toContain("unknown-id");
  });

  it("rejects deactivating an already inactive user", async () => {
    const { user } = await createUser({ phone: "5550006500" });
    await jsonRequest(app, `${base}/users/${user!.id}/deactivate`, {
      method: "POST",
    });

    const res = await jsonRequest(app, `${base}/users/${user!.id}/deactivate`, {
      method: "POST",
    });
    expect(res.status).toBe(400);
    const err = await parseApiError(res);
    expect(err.code).toBe("USER_ALREADY_INACTIVE");
  });
});

describe("automobile appointments", () => {
  it("creates appointment by userId", async () => {
    const { user } = await createUser({ phone: "5551001000" });
    const scheduledAt = futureScheduledAt();
    const { res, appointment } = await createAppointment({
      userId: user!.id,
      type: "service",
      scheduledAt,
      notes: "Oil change",
    });

    expect(res.status).toBe(201);
    expect(appointment!.userId).toBe(user!.id);
    expect(appointment!.type).toBe("service");
  });

  it("creates appointment by phone and accepts sales alias", async () => {
    await createUser({ phone: "5551002000" });
    const { res, appointment } = await createAppointment({
      phone: "555-100-2000",
      type: "sales",
      scheduledAt: futureScheduledAt(),
      notes: "Luxury model",
    });

    expect(res.status).toBe(201);
    expect(appointment!.type).toBe("sale");
  });

  it("rejects create when required fields are missing", async () => {
    const { res } = await createAppointment({
      phone: "5551003000",
      type: "service",
    });

    expect(res.status).toBe(400);
    expect((await parseJson<{ error: string }>(res)).error).toContain(
      "Missing required fields",
    );
  });

  it("rejects invalid appointment type", async () => {
    const { user } = await createUser({ phone: "5551004000" });
    const { res } = await createAppointment({
      userId: user!.id,
      type: "repair",
      scheduledAt: futureScheduledAt(),
      notes: "Nope",
    });

    expect(res.status).toBe(400);
  });

  it("rejects scheduledAt in the past", async () => {
    const { user } = await createUser({ phone: "5551005000" });
    const { res } = await createAppointment({
      userId: user!.id,
      type: "service",
      scheduledAt: pastScheduledAt(),
      notes: "Too late",
    });

    expect(res.status).toBe(400);
    const err = await parseApiError(res);
    expect(err.code).toBe("APPOINTMENT_SCHEDULED_AT_PAST");
  });

  it("rejects appointment for unknown user", async () => {
    const { res } = await createAppointment({
      phone: "5551006000",
      type: "service",
      scheduledAt: futureScheduledAt(),
      notes: "Nobody",
    });
    expect(res.status).toBe(400);
    const err = await parseApiError(res);
    expect(err.code).toBe("APPOINTMENT_USER_NOT_FOUND");
  });

  it("rejects appointment for inactive user", async () => {
    const { user } = await createUser({ phone: "5551007000" });
    await jsonRequest(app, `${base}/users/${user!.id}/deactivate`, {
      method: "POST",
    });

    const { res } = await createAppointment({
      phone: "5551007000",
      type: "service",
      scheduledAt: futureScheduledAt(),
      notes: "Inactive",
    });
    expect(res.status).toBe(400);
    const err = await parseApiError(res);
    expect(err.code).toBe("APPOINTMENT_USER_INACTIVE");
  });

  it("rejects userId and phone mismatch", async () => {
    const { user } = await createUser({ phone: "5551008000" });
    const { res } = await createAppointment({
      userId: user!.id,
      phone: "5551008001",
      type: "service",
      scheduledAt: futureScheduledAt(),
      notes: "Mismatch",
    });

    expect(res.status).toBe(400);
    const err = await parseApiError(res);
    expect(err.code).toBe("APPOINTMENT_USER_ID_PHONE_MISMATCH");
  });

  it("allows only one active appointment per user", async () => {
    const { user } = await createUser({ phone: "5551009000" });
    const scheduledAt = futureScheduledAt();

    const first = await createAppointment({
      userId: user!.id,
      type: "service",
      scheduledAt,
      notes: "First",
    });
    expect(first.res.status).toBe(201);

    const second = await createAppointment({
      userId: user!.id,
      type: "sale",
      scheduledAt,
      notes: "Second",
    });
    expect(second.res.status).toBe(409);
    const err = await parseApiError(second.res);
    expect(err.code).toBe("APPOINTMENT_ACTIVE_OTHER_TYPE");
    expect(err.error).toContain("active service");
  });

  it("rejects duplicate appointment of the same type", async () => {
    const { user } = await createUser({ phone: "5551009500" });
    const scheduledAt = futureScheduledAt();

    await createAppointment({
      userId: user!.id,
      type: "service",
      scheduledAt,
      notes: "Service",
    });

    const duplicate = await createAppointment({
      userId: user!.id,
      type: "service",
      scheduledAt,
      notes: "Another service",
    });
    expect(duplicate.res.status).toBe(409);
    const err = await parseApiError(duplicate.res);
    expect(err.code).toBe("APPOINTMENT_ACTIVE_SAME_TYPE");
    expect(err.error).toContain("active service");
  });

  it("updates appointment by user id", async () => {
    const { user } = await createUser({ phone: "5551010000" });
    await createAppointment({
      userId: user!.id,
      type: "service",
      scheduledAt: futureScheduledAt(),
      notes: "Original",
    });

    const patchRes = await jsonRequest(
      app,
      `${base}/appointments/user/${user!.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ notes: "Updated notes", type: "sale" }),
      },
    );
    expect(patchRes.status).toBe(200);
    const updated = await parseJson<Appointment>(patchRes);
    expect(updated.notes).toBe("Updated notes");
    expect(updated.type).toBe("sale");
  });

  it("returns 404 when patching user without active appointment", async () => {
    const { user } = await createUser({ phone: "5551010500" });
    const res = await jsonRequest(app, `${base}/appointments/user/${user!.id}`, {
      method: "PATCH",
      body: JSON.stringify({ notes: "Nothing to update" }),
    });
    expect(res.status).toBe(404);
    const err = await parseApiError(res);
    expect(err.code).toBe("APPOINTMENT_NO_ACTIVE_FOR_USER");
  });

  it("gets and deletes active appointment by user id", async () => {
    const { user } = await createUser({ phone: "5551011000" });
    const { appointment } = await createAppointment({
      userId: user!.id,
      type: "service",
      scheduledAt: futureScheduledAt(),
      notes: "To delete",
    });

    const getByUserRes = await app.request(
      `${base}/appointments/user/${user!.id}`,
    );
    expect(getByUserRes.status).toBe(200);
    expect((await parseJson<Appointment>(getByUserRes)).id).toBe(
      appointment!.id,
    );

    const deleteRes = await app.request(
      `${base}/appointments/user/${user!.id}`,
      { method: "DELETE" },
    );
    expect(deleteRes.status).toBe(204);

    const getAfterDelete = await app.request(
      `${base}/appointments/user/${user!.id}`,
    );
    expect(getAfterDelete.status).toBe(404);
  });

  it("returns 404 when deleting user without active appointment", async () => {
    const { user } = await createUser({ phone: "5551011500" });
    const res = await app.request(`${base}/appointments/user/${user!.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  it("lists and gets appointment by id", async () => {
    const { user } = await createUser({ phone: "5551012000" });
    const { appointment } = await createAppointment({
      userId: user!.id,
      type: "sale",
      scheduledAt: futureScheduledAt(),
      notes: "List me",
    });

    const listRes = await app.request(`${base}/appointments`);
    const list = await parseJson<Appointment[]>(listRes);
    expect(listRes.status).toBe(200);
    expect(list).toHaveLength(1);

    const getRes = await app.request(
      `${base}/appointments/${appointment!.id}`,
    );
    expect(getRes.status).toBe(200);
    expect((await parseJson<Appointment>(getRes)).id).toBe(appointment!.id);
  });
});
