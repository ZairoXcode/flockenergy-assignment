import { z } from "zod";

// ---------------------------------------------------------------------------
// Public API Energy Schemas
// ---------------------------------------------------------------------------

export const EnergyReadingSchema = z.object({
  // Timestamp string as received from portal (DD/MM/YYYY HH:mm)
  timestamp: z.string(),
  // Normalized floating point numbers
  kwh: z.number(),
  kvah: z.number(),
  // Renamed from voltR to voltageR for clear domain naming
  voltageR: z.number(),
});

export const EnergyConsumptionResponseSchema = z.object({
  meterId: z.string(),
  readings: z.array(EnergyReadingSchema),
});

export type EnergyReading = z.infer<typeof EnergyReadingSchema>;
export type EnergyConsumptionResponse = z.infer<typeof EnergyConsumptionResponseSchema>;
