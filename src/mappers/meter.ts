import { z } from "zod";
import {
  PortalMeterSummary,
  PortalMeterDetailData,
  PortalDt,
} from "../portal/types.js";

// ---------------------------------------------------------------------------
// Domain types — these are what our API returns. Kept as plain types rather
// than classes to keep things simple.
// ---------------------------------------------------------------------------

export type MeterListItem = {
  meterId: string;
  serialNo: string;
  make: string;
  phaseType: string;
  installationStatus: string;
  dtCode: string;
};

export type MeterDetail = {
  meterId: string;
  serialNo: string;
  make: string;
  phaseType: string;
  installationStatus: string;
  installationType: string;
  network: {
    zone: string;
    circle: string;
    division: string;
    subdivision: string;
    substation: string;
    feeder: string;
    transformer: string;
  };
};

export type Transformer = {
  code: string;
  name: string;
  feederCode: string;
  capacityKva: number;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

export function mapMeterListItem(raw: PortalMeterSummary): MeterListItem {
  return {
    meterId: raw.meterId,
    serialNo: raw.serialNo,
    make: raw.make,
    phaseType: raw.phaseType,
    installationStatus: raw.installStatus,
    dtCode: raw.dtCode,
  };
}

// Maps the portal's meter detail (extracted from the SvelteKit __data.json
// node graph) into our clean domain model.
export function mapMeterDetail(raw: PortalMeterDetailData): MeterDetail {
  return {
    meterId: raw.meterId,
    serialNo: raw.serialNo,
    make: raw.make,
    phaseType: raw.phaseType,
    installationStatus: raw.installStatus,
    installationType: raw.installType,
    network: {
      zone: raw.zone,
      circle: raw.circle,
      division: raw.division,
      subdivision: raw.subdivision,
      substation: raw.substation,
      feeder: raw.feeder,
      // Combine name and code into a single readable string, matching the
      // pattern used throughout the portal UI.
      transformer: `${raw.dtName} (${raw.dtCode})`,
    },
  };
}

export function mapTransformer(raw: PortalDt): Transformer {
  return {
    code: raw.code,
    name: raw.name,
    feederCode: raw.feederCode,
    capacityKva: raw.capacityKva,
  };
}
