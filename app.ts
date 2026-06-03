import { Hono } from "hono";
import { appointmentRoutes } from "./routes/appointments.js";
import { createUserRoutes } from "./routes/users.js";

export const createApp = () => {
  const app = new Hono();

  app.get("/", (c) =>
    c.json({
      prefixes: {
        automobile: "/automobile",
        inmobiliary: "/inmobiliary",
        internalTool: "/internal-tool",
      },
    }),
  );

  const automobile = new Hono();
  automobile.route(
    "/",
    createUserRoutes("automobile", { allowDeactivate: true }),
  );
  automobile.route("/", appointmentRoutes);
  app.route("/automobile", automobile);

  app.route("/inmobiliary", createUserRoutes("inmobiliary"));
  app.route("/internal-tool", createUserRoutes("internal-tool"));

  return app;
};

export default createApp();
