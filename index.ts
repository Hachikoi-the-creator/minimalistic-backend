import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { appointmentRoutes } from "./routes/appointments.js";
import { createUserRoutes } from "./routes/users.js";

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
automobile.route("/", createUserRoutes("automobile", { allowDeactivate: true }));
automobile.route("/", appointmentRoutes);
app.route("/automobile", automobile);

app.route("/inmobiliary", createUserRoutes("inmobiliary"));
app.route("/internal-tool", createUserRoutes("internal-tool"));

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`);
});

export default app;
