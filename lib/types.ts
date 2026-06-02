export type Prefix = "automobile" | "inmobiliary" | "internal-tool";

export type User = {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AppointmentType = "service" | "sale";

export type Appointment = {
  id: string;
  userId: string;
  type: AppointmentType;
  scheduledAt: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type PrefixData = {
  users: User[];
  appointments?: Appointment[];
};

export type Store = Record<Prefix, PrefixData>;

export type CreateUserBody = {
  name: string;
  phone: string;
};

export type UpdateUserBody = Partial<CreateUserBody>;

export type CreateAppointmentBody = {
  userId: string;
  type: AppointmentType;
  scheduledAt: string;
  notes?: string;
};

export type UpdateAppointmentBody = Partial<
  Omit<CreateAppointmentBody, "userId">
>;
