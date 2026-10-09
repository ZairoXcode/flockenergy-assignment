import Fastify from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { config } from "./config.js";
import { metersRoutes } from "./routes/meters.js";
import { transformersRoutes } from "./routes/transformers.js";

import { handleApiError } from "./errors.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  // Centralized error handler ensuring uniform error JSON envelopes
  app.setErrorHandler((error, request, reply) => {
    handleApiError(error, reply);
  });

  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "Urja Meter Ops API",
        description:
          "A clean REST API adapter over the Urja Meter Ops legacy portal. " +
          "Consumers interact with this service without needing to know anything about the underlying portal.",
        version: "1.0.0",
      },
      servers: [{ url: `http://localhost:${config.port}`, description: "Local development" }],
      tags: [
        { name: "Meters", description: "Meter search, detail, consumption, and location" },
        { name: "Transformers", description: "Distribution transformer listing" },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list" },
  });

  await app.register(metersRoutes);
  await app.register(transformersRoutes);

  // Health check — useful for deployment smoke tests without touching the portal.
  app.get("/health", { schema: { hide: true } }, async () => ({ status: "ok" }));

  return app;
}

import { fileURLToPath } from "node:url";

async function start() {
  const app = await buildApp();
  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Only listen on port when executed directly, not when imported by tests
const isMain = process.argv[1] && (
  fileURLToPath(import.meta.url) === process.argv[1] ||
  process.argv[1].endsWith("server.ts") ||
  process.argv[1].endsWith("server.js")
);

if (isMain) {
  start();
}

