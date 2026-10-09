import { PortalEnergyReading } from "../portal/types.js";

// ---------------------------------------------------------------------------
// Domain type for a single energy reading.
// ---------------------------------------------------------------------------

export type EnergyReading = {
  // Timestamp is passed through as a string. The portal provides timestamps
  // in "DD/MM/YYYY HH:mm" format without timezone information. We return them
  // as-is and document the assumption in PROTOCOL.md rather than silently
  // converting to UTC with a guessed timezone.
  timestamp: string;
  kwh: number;
  kvah: number;
  // Renamed from voltR to voltageR for clarity in the public API.
  voltageR: number;
};

export function mapEnergyReading(raw: PortalEnergyReading): EnergyReading {
  return {
    timestamp: raw.timestamp,
    kwh: parseFloat(raw.kwh),
    kvah: parseFloat(raw.kvah),
    voltageR: parseInt(raw.voltR, 10),
  };
}
