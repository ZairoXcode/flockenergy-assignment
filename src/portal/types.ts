import { z } from "zod";

// ---------------------------------------------------------------------------
// Portal: login response
// ---------------------------------------------------------------------------

export const PortalLoginResponseSchema = z.object({
  type: z.string(),
  status: z.number(),
  location: z.string(),
});

// ---------------------------------------------------------------------------
// Portal: meter search
// ---------------------------------------------------------------------------

export const PortalMeterSummarySchema = z.object({
  meterId: z.string(),
  serialNo: z.string(),
  make: z.string(),
  phaseType: z.string(),
  installStatus: z.string(),
  dtCode: z.string(),
});

export const PortalMeterSearchResponseSchema = z.object({
  data: z.array(PortalMeterSummarySchema),
});

export type PortalMeterSummary = z.infer<typeof PortalMeterSummarySchema>;

// ---------------------------------------------------------------------------
// Portal: meter detail (__data.json SvelteKit format)
//
// SvelteKit serialises page data as a node/reference graph. The outer
// envelope has a "nodes" array; the actual page data lands inside one of
// those nodes under a "data" key. The shape observed from the portal is:
//
//   { nodes: [ null, { type: "data", data: { ... meter fields ... } } ] }
//
// We parse the inner data object rather than relying on the node graph
// walk, because the portal is not a public SvelteKit API and the node
// format is an implementation detail we should not surface.
// ---------------------------------------------------------------------------

export const PortalMeterDetailDataSchema = z.object({
  meterId: z.string(),
  serialNo: z.string(),
  make: z.string(),
  phaseType: z.string(),
  installStatus: z.string(),
  installType: z.string(),
  zone: z.string(),
  circle: z.string(),
  division: z.string(),
  subdivision: z.string(),
  substation: z.string(),
  feeder: z.string(),
  dtName: z.string(),
  dtCode: z.string(),
});

// The SvelteKit __data.json envelope. We only care about the data node.
export const PortalSvelteKitDataSchema = z.object({
  nodes: z.array(
    z
      .object({
        type: z.string().optional(),
        data: z.unknown().optional(),
      })
      .nullable()
  ),
});

export type PortalMeterDetailData = z.infer<typeof PortalMeterDetailDataSchema>;

// ---------------------------------------------------------------------------
// Portal: energy readings
// ---------------------------------------------------------------------------

export const PortalEnergyReadingSchema = z.object({
  timestamp: z.string(),
  kwh: z.string(),
  kvah: z.string(),
  voltR: z.string(),
});

export const PortalEnergyResponseSchema = z.object({
  data: z.array(PortalEnergyReadingSchema),
});

export type PortalEnergyReading = z.infer<typeof PortalEnergyReadingSchema>;

// ---------------------------------------------------------------------------
// Portal: geolocation
// ---------------------------------------------------------------------------

export const PortalGeoDataSchema = z.object({
  latitude: z.string(),
  longitude: z.string(),
});

export const PortalGeoResponseSchema = z.object({
  data: PortalGeoDataSchema,
});

// ---------------------------------------------------------------------------
// Portal: transformers / DTs
// ---------------------------------------------------------------------------

export const PortalDtSchema = z.object({
  code: z.string(),
  name: z.string(),
  feederCode: z.string(),
  capacityKva: z.number(),
});

export const PortalDtResponseSchema = z.object({
  data: z.array(PortalDtSchema),
});

export type PortalDt = z.infer<typeof PortalDtSchema>;
