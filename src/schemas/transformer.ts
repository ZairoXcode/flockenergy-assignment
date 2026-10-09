import { z } from "zod";

// ---------------------------------------------------------------------------
// Public API Transformer Schemas
// ---------------------------------------------------------------------------

export const transformerListQuerySchema = z.object({
  page: z.preprocess(
    (v) => (v === undefined || v === "" ? 1 : Number(v)),
    z.number().int().min(1, "page must be a positive integer")
  ),
});

export const TransformerSchema = z.object({
  code: z.string(),
  name: z.string(),
  feederCode: z.string(),
  capacityKva: z.number(),
});

export const TransformerListResponseSchema = z.object({
  page: z.number().int().min(1),
  transformers: z.array(TransformerSchema),
});

export type TransformerListQuery = z.infer<typeof transformerListQuerySchema>;
export type Transformer = z.infer<typeof TransformerSchema>;
export type TransformerListResponse = z.infer<typeof TransformerListResponseSchema>;
