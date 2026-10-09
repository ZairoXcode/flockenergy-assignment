import { z } from "zod";

// ---------------------------------------------------------------------------
// Public API Parameter / Query Schemas
// ---------------------------------------------------------------------------

export const meterSearchQuerySchema = z.object({
  q: z
    .string()
    .max(100, "Search query must be 100 characters or fewer")
    .default(""),
  page: z.preprocess(
    (v) => (v === undefined || v === "" ? 1 : Number(v)),
    z.number().int().min(1, "page must be a positive integer")
  ),
});

export const meterIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9]{1,19}$/, {
      message:
        "meterId must start with a letter and contain only alphanumeric characters (max 20 chars)",
    }),
});

// ---------------------------------------------------------------------------
// Public API Response Schemas
// ---------------------------------------------------------------------------

export const MeterSummarySchema = z.object({
  meterId: z.string(),
  serialNo: z.string(),
  make: z.string(),
  phaseType: z.string(),
  installationStatus: z.string(),
  dtCode: z.string(),
});

export const MeterSearchResponseSchema = z.object({
  page: z.number().int().min(1),
  results: z.array(MeterSummarySchema),
});

export const NetworkHierarchySchema = z.object({
  zone: z.string(),
  circle: z.string(),
  division: z.string(),
  subdivision: z.string(),
  substation: z.string(),
  feeder: z.string(),
  transformer: z.string(),
});

export const MeterDetailResponseSchema = z.object({
  meterId: z.string(),
  serialNo: z.string(),
  make: z.string(),
  phaseType: z.string(),
  installationStatus: z.string(),
  installationType: z.string(),
  network: NetworkHierarchySchema,
});

export const MeterLocationResponseSchema = z.object({
  meterId: z.string(),
  latitude: z.number(),
  longitude: z.number(),
});

// Types inferred from schemas
export type MeterSearchQuery = z.infer<typeof meterSearchQuerySchema>;
export type MeterIdParam = z.infer<typeof meterIdParamSchema>;
export type MeterSummary = z.infer<typeof MeterSummarySchema>;
export type MeterSearchResponse = z.infer<typeof MeterSearchResponseSchema>;
export type NetworkHierarchy = z.infer<typeof NetworkHierarchySchema>;
export type MeterDetailResponse = z.infer<typeof MeterDetailResponseSchema>;
export type MeterLocationResponse = z.infer<typeof MeterLocationResponseSchema>;
