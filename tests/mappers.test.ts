import { describe, it, expect } from "vitest";
import { mapMeterListItem, mapMeterDetail } from "../src/mappers/meter.js";
import { mapEnergyReading } from "../src/mappers/energy.js";
import { PortalMeterDetailDataSchema, PortalMeterSearchResponseSchema, PortalEnergyResponseSchema, PortalGeoResponseSchema } from "../src/portal/types.js";

// ---------------------------------------------------------------------------
// Meter list mapper
// ---------------------------------------------------------------------------

describe("mapMeterListItem", () => {
  const raw = {
    meterId: "J100000",
    serialNo: "SE33962",
    make: "HPL",
    phaseType: "single",
    installStatus: "Decommissioned",
    dtCode: "DT-001",
  };

  it("maps portal fields to domain fields", () => {
    const result = mapMeterListItem(raw);
    expect(result.meterId).toBe("J100000");
    expect(result.serialNo).toBe("SE33962");
    expect(result.installationStatus).toBe("Decommissioned");
    expect(result.dtCode).toBe("DT-001");
  });

  it("renames installStatus to installationStatus", () => {
    const result = mapMeterListItem(raw);
    expect(result).not.toHaveProperty("installStatus");
    expect(result).toHaveProperty("installationStatus", "Decommissioned");
  });
});

// ---------------------------------------------------------------------------
// Meter detail mapper
// ---------------------------------------------------------------------------

describe("mapMeterDetail", () => {
  const raw = {
    meterId: "J100000",
    serialNo: "SE33962",
    make: "HPL",
    phaseType: "single",
    installStatus: "Decommissioned",
    installType: "Whole Current",
    zone: "Jaipur Zone 1 (Z-01)",
    circle: "Circle 1 (C-01)",
    division: "Division 1 (D-01)",
    subdivision: "Subdivision 1 (SD-01)",
    substation: "Substation 1 (SS-01)",
    feeder: "Feeder 1 (F-001)",
    dtName: "Malviya Nagar DT 1",
    dtCode: "DT-001",
  };

  it("maps all fields correctly", () => {
    const result = mapMeterDetail(raw);
    expect(result.meterId).toBe("J100000");
    expect(result.installationStatus).toBe("Decommissioned");
    expect(result.installationType).toBe("Whole Current");
  });

  it("builds the network hierarchy object", () => {
    const result = mapMeterDetail(raw);
    expect(result.network.zone).toBe("Jaipur Zone 1 (Z-01)");
    expect(result.network.circle).toBe("Circle 1 (C-01)");
    expect(result.network.division).toBe("Division 1 (D-01)");
    expect(result.network.subdivision).toBe("Subdivision 1 (SD-01)");
    expect(result.network.substation).toBe("Substation 1 (SS-01)");
    expect(result.network.feeder).toBe("Feeder 1 (F-001)");
  });

  it("combines dtName and dtCode into transformer field", () => {
    const result = mapMeterDetail(raw);
    expect(result.network.transformer).toBe("Malviya Nagar DT 1 (DT-001)");
  });

  it("does not expose raw portal field names", () => {
    const result = mapMeterDetail(raw);
    expect(result).not.toHaveProperty("installStatus");
    expect(result).not.toHaveProperty("installType");
    expect(result).not.toHaveProperty("dtName");
    expect(result).not.toHaveProperty("dtCode");
  });
});

// ---------------------------------------------------------------------------
// Energy mapper
// ---------------------------------------------------------------------------

describe("mapEnergyReading", () => {
  const raw = {
    timestamp: "24/06/2026 00:00",
    kwh: "48439.16",
    kvah: "52314.29",
    voltR: "229",
  };

  it("converts string numbers to actual numbers", () => {
    const result = mapEnergyReading(raw);
    expect(result.kwh).toBe(48439.16);
    expect(result.kvah).toBe(52314.29);
    expect(result.voltageR).toBe(229);
    expect(typeof result.kwh).toBe("number");
    expect(typeof result.kvah).toBe("number");
    expect(typeof result.voltageR).toBe("number");
  });

  it("renames voltR to voltageR", () => {
    const result = mapEnergyReading(raw);
    expect(result).not.toHaveProperty("voltR");
    expect(result).toHaveProperty("voltageR", 229);
  });

  it("passes timestamp through as a string", () => {
    const result = mapEnergyReading(raw);
    expect(result.timestamp).toBe("24/06/2026 00:00");
    expect(typeof result.timestamp).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Zod schema validation — portal boundary
// ---------------------------------------------------------------------------

describe("PortalMeterSearchResponseSchema", () => {
  it("accepts valid portal search response", () => {
    const data = {
      data: [
        {
          meterId: "J100000",
          serialNo: "SE33962",
          make: "HPL",
          phaseType: "single",
          installStatus: "Decommissioned",
          dtCode: "DT-001",
        },
      ],
    };
    expect(() => PortalMeterSearchResponseSchema.parse(data)).not.toThrow();
  });

  it("rejects response missing data array", () => {
    expect(() => PortalMeterSearchResponseSchema.parse({ items: [] })).toThrow();
  });

  it("rejects meter item missing required fields", () => {
    const data = { data: [{ meterId: "J100000" }] };
    expect(() => PortalMeterSearchResponseSchema.parse(data)).toThrow();
  });
});

describe("PortalMeterDetailDataSchema", () => {
  it("rejects partial meter detail", () => {
    const partial = {
      meterId: "J100000",
      serialNo: "SE33962",
      // missing all other required fields
    };
    expect(() => PortalMeterDetailDataSchema.parse(partial)).toThrow();
  });

  it("accepts a complete meter detail", () => {
    const complete = {
      meterId: "J100000",
      serialNo: "SE33962",
      make: "HPL",
      phaseType: "single",
      installStatus: "Decommissioned",
      installType: "Whole Current",
      zone: "Jaipur Zone 1 (Z-01)",
      circle: "Circle 1 (C-01)",
      division: "Division 1 (D-01)",
      subdivision: "Subdivision 1 (SD-01)",
      substation: "Substation 1 (SS-01)",
      feeder: "Feeder 1 (F-001)",
      dtName: "Malviya Nagar DT 1",
      dtCode: "DT-001",
    };
    expect(() => PortalMeterDetailDataSchema.parse(complete)).not.toThrow();
  });
});

describe("PortalEnergyResponseSchema", () => {
  it("accepts valid energy response", () => {
    const data = {
      data: [{ timestamp: "24/06/2026 00:00", kwh: "48439.16", kvah: "52314.29", voltR: "229" }],
    };
    expect(() => PortalEnergyResponseSchema.parse(data)).not.toThrow();
  });

  it("rejects response where kwh is already a number (portal always sends strings)", () => {
    const data = {
      data: [{ timestamp: "24/06/2026 00:00", kwh: 48439.16, kvah: "52314.29", voltR: "229" }],
    };
    expect(() => PortalEnergyResponseSchema.parse(data)).toThrow();
  });
});

describe("PortalGeoResponseSchema", () => {
  it("accepts valid geo response", () => {
    const data = { data: { latitude: "26.938961002479868", longitude: "75.83095696146852" } };
    expect(() => PortalGeoResponseSchema.parse(data)).not.toThrow();
  });

  it("rejects numeric lat/lng (portal sends strings)", () => {
    const data = { data: { latitude: 26.938961, longitude: 75.83095 } };
    expect(() => PortalGeoResponseSchema.parse(data)).toThrow();
  });
});
