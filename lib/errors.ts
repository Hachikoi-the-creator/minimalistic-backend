import type { Context } from "hono";
import type { AppointmentType, Prefix } from "./types.js";

export type ApiErrorBody = {
  error: string;
  code: string;
};

type ApiErrorStatus = 400 | 404 | 409;

const prefixLabel: Record<Prefix, string> = {
  automobile: "automobile",
  inmobiliary: "inmobiliary",
  "internal-tool": "internal tool",
};

export const apiError = (
  c: Context,
  status: ApiErrorStatus,
  code: string,
  message: string,
) => c.json({ error: message, code } satisfies ApiErrorBody, status);

export const userErrors = {
  missingCreateFields: (c: Context) =>
    apiError(
      c,
      400,
      "USER_MISSING_FIELDS",
      "Provide both name and phone to create a user.",
    ),

  missingName: (c: Context) =>
    apiError(
      c,
      400,
      "USER_MISSING_NAME",
      "Provide a non-empty name to create or update a user.",
    ),

  missingPhone: (c: Context) =>
    apiError(
      c,
      400,
      "USER_MISSING_PHONE",
      "Provide a non-empty phone to create or update a user.",
    ),

  invalidPhone: (c: Context) =>
    apiError(
      c,
      400,
      "USER_INVALID_PHONE",
      "Phone must include at least one digit. Spaces, dashes, and parentheses are allowed.",
    ),

  phoneTaken: (c: Context) =>
    apiError(
      c,
      409,
      "USER_PHONE_TAKEN",
      "This phone number is already registered. Each phone can only be used once across all areas.",
    ),

  notFound: (c: Context, prefix: Prefix, id: string) =>
    apiError(
      c,
      404,
      "USER_NOT_FOUND",
      `No user found with id "${id}" in the ${prefixLabel[prefix]} area.`,
    ),

  searchPhoneRequired: (c: Context) =>
    apiError(
      c,
      400,
      "USER_SEARCH_PHONE_REQUIRED",
      'Provide a phone query parameter, for example: /users/search?phone=5551234567',
    ),

  searchNotFound: (c: Context, prefix: Prefix, phone: string) =>
    apiError(
      c,
      404,
      "USER_SEARCH_NOT_FOUND",
      `No user found with phone "${phone}" in the ${prefixLabel[prefix]} area.`,
    ),

  alreadyInactive: (c: Context, prefix: Prefix, id: string) =>
    apiError(
      c,
      400,
      "USER_ALREADY_INACTIVE",
      `User "${id}" in the ${prefixLabel[prefix]} area is already deactivated.`,
    ),
};

export const appointmentErrors = {
  missingFields: (c: Context, fields: string[]) =>
    apiError(
      c,
      400,
      "APPOINTMENT_MISSING_FIELDS",
      `Missing required fields: ${fields.join(", ")}. Provide userId or phone, type, scheduledAt, and notes.`,
    ),

  invalidType: (c: Context) =>
    apiError(
      c,
      400,
      "APPOINTMENT_INVALID_TYPE",
      'Appointment type must be "service" or "sale". You may also send "sales" or "services" as aliases.',
    ),

  scheduledAtPast: (c: Context) =>
    apiError(
      c,
      400,
      "APPOINTMENT_SCHEDULED_AT_PAST",
      "scheduledAt must be a future date and time in ISO 8601 format (for example: 2026-12-01T15:00:00).",
    ),

  notesEmpty: (c: Context) =>
    apiError(
      c,
      400,
      "APPOINTMENT_NOTES_EMPTY",
      "notes must be a non-empty string describing the appointment.",
    ),

  invalidPhone: (c: Context) =>
    apiError(
      c,
      400,
      "APPOINTMENT_INVALID_PHONE",
      "Phone must include at least one digit to look up a user for this appointment.",
    ),

  userIdPhoneMismatch: (c: Context) =>
    apiError(
      c,
      400,
      "APPOINTMENT_USER_ID_PHONE_MISMATCH",
      "The provided userId and phone do not belong to the same user.",
    ),

  userNotFound: (c: Context) =>
    apiError(
      c,
      400,
      "APPOINTMENT_USER_NOT_FOUND",
      "No user found with the provided userId or phone in the automobile area.",
    ),

  userInactive: (c: Context) =>
    apiError(
      c,
      400,
      "APPOINTMENT_USER_INACTIVE",
      "The user exists but is deactivated. Reactivate the user before creating an appointment.",
    ),

  activeSameType: (c: Context, type: AppointmentType) =>
    apiError(
      c,
      409,
      "APPOINTMENT_ACTIVE_SAME_TYPE",
      `This user already has an active ${type} appointment. Update it via PATCH /appointments/user/:userId or delete it before creating a new one.`,
    ),

  activeOtherType: (c: Context, existingType: AppointmentType) =>
    apiError(
      c,
      409,
      "APPOINTMENT_ACTIVE_OTHER_TYPE",
      `This user already has an active ${existingType} appointment. Only one appointment (service or sale) is allowed at a time.`,
    ),

  noActiveForUser: (c: Context, userId: string) =>
    apiError(
      c,
      404,
      "APPOINTMENT_NO_ACTIVE_FOR_USER",
      `No active appointment found for user id "${userId}". An appointment is active when its scheduledAt is in the future.`,
    ),

  notFoundById: (c: Context, id: string) =>
    apiError(
      c,
      404,
      "APPOINTMENT_NOT_FOUND",
      `No appointment found with id "${id}".`,
    ),
};
