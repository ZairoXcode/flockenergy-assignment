import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  searchMeters,
  getMeterDetail,
  getMeterEnergy,
  getMeterGeo,
} from "../portal/api.js";
import { mapMeterListItem, mapMeterDetail } from "../mappers/meter.js";
import { mapEnergyReading } from "../mappers/energy.js";
import { handleApiError, NotFoundError, BadRequestError } from "../errors.js";
import { meterSearchQuerySchema } from "../schemas/meter.js";

// Validation for meter IDs as observed from the portal: letter + alphanumeric (max 20 chars)
const meterIdValidator = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9]{1,19}$/, {
    message:
      "meterId must start with a letter and contain only alphanumeric characters (max 20 chars)",
  });

export async function metersRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/meters?q=&page=
  fastify.get(
    "/api/meters",
    {
      schema: {
        tags: ["Meters"],
        summary: "Search meters",
        description:
          "Search for meters by ID or other attributes. Proxies the portal search with clean domain models.",
        querystring: {
          type: "object",
          properties: {
            q: { type: "string", description: "Search query", maxLength: 100 },
            page: { type: "string", description: "Page number (default: 1)" },
          },
        },
      },
    },
    async (request, reply) => {
      const queryParsed = meterSearchQuerySchema.safeParse(request.query);
      if (!queryParsed.success) {
        handleApiError(
          new BadRequestError(queryParsed.error.issues[0]?.message),
          reply
        );
        return;
      }

      const { q, page } = queryParsed.data;

      try {
        const { data } = await searchMeters(q, page);
        reply.send({ page, results: data.map(mapMeterListItem) });
      } catch (err) {
        handleApiError(err, reply);
      }
    }
  );

  // GET /api/meters/:id
  fastify.get(
    "/api/meters/:id",
    {
      schema: {
        tags: ["Meters"],
        summary: "Get meter detail",
        description:
          "Returns full meter detail including network hierarchy. Data is extracted from the portal's SvelteKit page data.",
        params: {
          type: "object",
          properties: { id: { type: "string", description: "Meter ID (e.g. J100000)" } },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id?: string; meterId?: string };
      const rawId = params.id ?? params.meterId ?? "";

      const idResult = meterIdValidator.safeParse(rawId);
      if (!idResult.success) {
        handleApiError(
          new BadRequestError(idResult.error.issues[0]?.message),
          reply
        );
        return;
      }

      const meterId = idResult.data;

      try {
        const detail = await getMeterDetail(meterId);
        if (detail === null) {
          handleApiError(new NotFoundError(`Meter ${meterId} not found`), reply);
          return;
        }
        reply.send(mapMeterDetail(detail));
      } catch (err) {
        handleApiError(err, reply);
      }
    }
  );

  // GET /api/meters/:id/consumption
  fastify.get(
    "/api/meters/:id/consumption",
    {
      schema: {
        tags: ["Meters"],
        summary: "Get meter energy consumption",
        description:
          "Returns 30-minute interval energy readings for the meter. Numeric values are normalized from strings.",
        params: {
          type: "object",
          properties: { id: { type: "string", description: "Meter ID (e.g. J100000)" } },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id?: string; meterId?: string };
      const rawId = params.id ?? params.meterId ?? "";

      const idResult = meterIdValidator.safeParse(rawId);
      if (!idResult.success) {
        handleApiError(
          new BadRequestError(idResult.error.issues[0]?.message),
          reply
        );
        return;
      }

      const meterId = idResult.data;

      try {
        const energy = await getMeterEnergy(meterId);
        if (energy === null) {
          handleApiError(new NotFoundError(`Meter ${meterId} not found`), reply);
          return;
        }
        reply.send({ meterId, readings: energy.data.map(mapEnergyReading) });
      } catch (err) {
        handleApiError(err, reply);
      }
    }
  );

  // GET /api/meters/:id/location
  fastify.get(
    "/api/meters/:id/location",
    {
      schema: {
        tags: ["Meters"],
        summary: "Get meter geolocation",
        description: "Returns GPS coordinates for the meter installation site.",
        params: {
          type: "object",
          properties: { id: { type: "string", description: "Meter ID (e.g. J100000)" } },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id?: string; meterId?: string };
      const rawId = params.id ?? params.meterId ?? "";

      const idResult = meterIdValidator.safeParse(rawId);
      if (!idResult.success) {
        handleApiError(
          new BadRequestError(idResult.error.issues[0]?.message),
          reply
        );
        return;
      }

      const meterId = idResult.data;

      try {
        const geo = await getMeterGeo(meterId);
        if (geo === null) {
          handleApiError(
            new NotFoundError(`Geolocation for meter ${meterId} not found`),
            reply
          );
          return;
        }
        reply.send({ meterId, ...geo });
      } catch (err) {
        handleApiError(err, reply);
      }
    }
  );
}
