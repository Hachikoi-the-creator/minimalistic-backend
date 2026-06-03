import type { Appointment, AppointmentType, Prefix, Store } from "./types.js";

export const normalizePhone = (phone: string) => phone.replace(/\D/g, "");

export const normalizeAppointmentType = (
  type: string | undefined,
): AppointmentType | undefined => {
  const value = type?.trim().toLowerCase();
  if (value === "service" || value === "services") return "service";
  if (value === "sale" || value === "sales") return "sale";
  return undefined;
};

export const isPhoneTaken = (
  store: Store,
  phone: string,
  excludeUserId?: string,
): boolean =>
  (Object.keys(store) as Prefix[]).some((prefix) =>
    store[prefix].users.some(
      (u) => u.phone === phone && u.id !== excludeUserId,
    ),
  );

export const isValidAppointment = (appointment: Appointment): boolean =>
  appointment.scheduledAt >= new Date().toISOString();

export const findValidAppointmentForUser = (
  appointments: Appointment[],
  userId: string,
): Appointment | undefined =>
  appointments.find((a) => a.userId === userId && isValidAppointment(a));

export const hasValidAppointmentOfType = (
  appointments: Appointment[],
  userId: string,
  type: AppointmentType,
  excludeId?: string,
): boolean =>
  appointments.some(
    (a) =>
      a.userId === userId &&
      a.type === type &&
      a.id !== excludeId &&
      isValidAppointment(a),
  );

export const getActiveAppointmentBlock = (
  appointments: Appointment[],
  userId: string,
  type: AppointmentType,
): "same-type" | "other-type" | undefined => {
  if (hasValidAppointmentOfType(appointments, userId, type)) {
    return "same-type";
  }
  if (findValidAppointmentForUser(appointments, userId)) {
    return "other-type";
  }
  return undefined;
};
