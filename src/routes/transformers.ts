import { FastifyInstance } from "fastify";
import { listTransformers } from "../portal/api.js";
import { mapTransformer } from "../mappers/meter.js";
import { handleApiError, BadRequestError } from "../errors.js";
import { transformerListQuerySchema } from "../schemas/transformer.js";

export async function transformersRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // GET /api/transformers?page=
  fastify.get(
    "/api/transformers",
    {
      schema: {
        tags: ["Transformers"],
        summary: "List distribution transformers",
        description:
          "Returns a paginated list of distribution transformers (DTs) from the portal.",
        querystring: {
          type: "object",
          properties: {
            page: { type: "string", description: "Page number (default: 1)" },
          },
        },
      },
    },
    async (request, reply) => {
      const queryParsed = transformerListQuerySchema.safeParse(request.query);
      if (!queryParsed.success) {
        handleApiError(
          new BadRequestError(queryParsed.error.issues[0]?.message),
          reply
        );
        return;
      }

      const { page } = queryParsed.data;

      try {
        const { data } = await listTransformers(page);
        reply.send({ page, transformers: data.map(mapTransformer) });
      } catch (err) {
        handleApiError(err, reply);
      }
    }
  );
}
