import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the portal API module before importing the app.
// This ensures route tests never make real HTTP calls.
vi.mock("../src/portal/api.js", () => ({
  searchMeters: vi.fn(),
  getMeterDetail: vi.fn(),
  getMeterEnergy: vi.fn(),
  getMeterGeo: vi.fn(),
  listTransformers: vi.fn(),
}));

// Mock config so the app doesn't need a real .env in tests.
vi.mock("../src/config.js", () => ({
  config: {
    port: 3000,
    portal: {
      baseUrl: "http://portal.test",
      username: "test",
      password: "test",
    },
  },
}));

import * as portalApi from "../src/portal/api.js";
import { buildApp } from "../src/server.js";
import { PortalUpstreamError, PortalAuthError, PortalClient } from "../src/portal/client.js";

const mockPortalApi = portalApi as {
  searchMeters: ReturnType<typeof vi.fn>;
  getMeterDetail: ReturnType<typeof vi.fn>;
  getMeterEnergy: ReturnType<typeof vi.fn>;
  getMeterGeo: ReturnType<typeof vi.fn>;
  listTransformers: ReturnType<typeof vi.fn>;
};

describe("Route: GET /api/meters", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
    vi.clearAllMocks();
  });

  it("returns 200 with mapped meter list", async () => {
    mockPortalApi.searchMeters.mockResolvedValue({
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
    });

    const res = await app.inject({ method: "GET", url: "/api/meters?q=J100000&page=1" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.page).toBe(1);
    expect(body.results[0].meterId).toBe("J100000");
    expect(body.results[0].installationStatus).toBe("Decommissioned");
    // Should not leak portal field names
    expect(body.results[0]).not.toHaveProperty("installStatus");
  });

  it("defaults page to 1 when not provided", async () => {
    mockPortalApi.searchMeters.mockResolvedValue({ data: [] });
    const res = await app.inject({ method: "GET", url: "/api/meters?q=test" });
    expect(res.statusCode).toBe(200);
    expect(res.json().page).toBe(1);
    expect(mockPortalApi.searchMeters).toHaveBeenCalledWith("test", 1);
  });

  it("returns 400 for invalid page", async () => {
    const res = await app.inject({ method: "GET", url: "/api/meters?page=0" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_PARAMETER");
  });

  it("returns 502 on upstream error", async () => {
    mockPortalApi.searchMeters.mockRejectedValue(new PortalUpstreamError("Portal down"));
    const res = await app.inject({ method: "GET", url: "/api/meters?q=test" });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe("UPSTREAM_ERROR");
  });

  it("returns 503 on auth failure", async () => {
    mockPortalApi.searchMeters.mockRejectedValue(new PortalAuthError("Not authenticated"));
    const res = await app.inject({ method: "GET", url: "/api/meters?q=test" });
    expect(res.statusCode).toBe(503);
  });
});

describe("Route: GET /api/meters/:meterId", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
    vi.clearAllMocks();
  });

  const rawDetail = {
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

  it("returns 200 with full meter detail including network", async () => {
    mockPortalApi.getMeterDetail.mockResolvedValue(rawDetail);
    const res = await app.inject({ method: "GET", url: "/api/meters/J100000" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meterId).toBe("J100000");
    expect(body.network.transformer).toBe("Malviya Nagar DT 1 (DT-001)");
    expect(body.network.zone).toBe("Jaipur Zone 1 (Z-01)");
  });

  it("returns 404 when meter not found", async () => {
    mockPortalApi.getMeterDetail.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/api/meters/J999999" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for invalid meterId format", async () => {
    const res = await app.inject({ method: "GET", url: "/api/meters/!!bad!!" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_PARAMETER");
  });

  it("returns 502 with sanitized message and does not leak upstream URLs", async () => {
    mockPortalApi.getMeterDetail.mockRejectedValue(
      new PortalUpstreamError("Portal request failed: /meters/J100000/__data.json?x-sveltekit-invalidated=001")
    );
    const res = await app.inject({ method: "GET", url: "/api/meters/J100000" });
    expect(res.statusCode).toBe(502);
    const body = res.json();
    expect(body.error.code).toBe("UPSTREAM_ERROR");
    expect(body.error.message).toBe("Unable to retrieve data from the upstream portal.");
    expect(body.error.message).not.toContain("__data.json");
  });
});

describe("Route: GET /api/meters/:meterId/consumption", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
    vi.clearAllMocks();
  });

  it("returns 200 with normalized readings", async () => {
    mockPortalApi.getMeterEnergy.mockResolvedValue({
      data: [
        { timestamp: "24/06/2026 00:00", kwh: "48439.16", kvah: "52314.29", voltR: "229" },
      ],
    });

    const res = await app.inject({ method: "GET", url: "/api/meters/J100000/consumption" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meterId).toBe("J100000");
    expect(body.readings[0].kwh).toBe(48439.16);
    expect(body.readings[0].voltageR).toBe(229);
    expect(body.readings[0]).not.toHaveProperty("voltR");
  });

  it("returns 404 when meter energy is not found (upstream returns null)", async () => {
    mockPortalApi.getMeterEnergy.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/api/meters/J100000/consumption" });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Meter J100000 not found");
  });
});

describe("Route: GET /api/meters/:meterId/location", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
    vi.clearAllMocks();
  });

  it("returns 200 with numeric coordinates", async () => {
    mockPortalApi.getMeterGeo.mockResolvedValue({
      latitude: 26.938961002479868,
      longitude: 75.83095696146852,
    });

    const res = await app.inject({ method: "GET", url: "/api/meters/J100000/location" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.latitude).toBeCloseTo(26.938961, 4);
    expect(body.longitude).toBeCloseTo(75.83095, 4);
    expect(typeof body.latitude).toBe("number");
  });

  it("returns 404 when geo not available", async () => {
    mockPortalApi.getMeterGeo.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/api/meters/J100000/location" });
    expect(res.statusCode).toBe(404);
  });
});

describe("Route: GET /api/transformers", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
    vi.clearAllMocks();
  });

  it("returns 200 with transformer list", async () => {
    mockPortalApi.listTransformers.mockResolvedValue({
      data: [
        { code: "DT-001", name: "Malviya Nagar DT 1", feederCode: "F-001", capacityKva: 100 },
      ],
    });

    const res = await app.inject({ method: "GET", url: "/api/transformers" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.transformers[0].code).toBe("DT-001");
    expect(body.transformers[0].capacityKva).toBe(100);
  });

  it("returns 400 for invalid page", async () => {
    const res = await app.inject({ method: "GET", url: "/api/transformers?page=abc" });
    expect(res.statusCode).toBe(400);
  });
});

describe("PortalClient: session expiry, retry limit and auth failure", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("re-authenticates and retries the original request once on session expiry", async () => {
    const client = new PortalClient();
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // 1. Initial request requires login
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ type: "redirect", status: 303, location: "/meters" }), {
        status: 200,
        headers: { "set-cookie": "session=abc; Path=/;" },
      })
    );
    // 2. Initial GET returns 302 redirect to /login (session expired)
    mockFetch.mockResolvedValueOnce(
      new Response("", {
        status: 302,
        headers: { location: "/login" },
      })
    );
    // 3. Re-login
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ type: "redirect", status: 303, location: "/meters" }), {
        status: 200,
        headers: { "set-cookie": "session=def; Path=/;" },
      })
    );
    // 4. Retried request succeeds
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
      })
    );

    const res = await client.get("/portal/test");
    expect(res.status).toBe(200);
    // Verified: initial login (1) + first get (2) + re-login (3) + retried get (4) = 4 calls total
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("throws PortalAuthError when retried request is redirected to login again, avoiding infinite loops", async () => {
    const client = new PortalClient();
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // 1. Initial login
    mockFetch.mockResolvedValueOnce(
      new Response("", {
        status: 200,
        headers: { "set-cookie": "session=abc; Path=/;" },
      })
    );
    // 2. Initial GET redirected to login
    mockFetch.mockResolvedValueOnce(
      new Response("", {
        status: 302,
        headers: { location: "/login" },
      })
    );
    // 3. Re-login succeeds
    mockFetch.mockResolvedValueOnce(
      new Response("", {
        status: 200,
        headers: { "set-cookie": "session=def; Path=/;" },
      })
    );
    // 4. Retried request STILL returns redirect to login
    mockFetch.mockResolvedValueOnce(
      new Response("", {
        status: 302,
        headers: { location: "/login" },
      })
    );

    await expect(client.get("/portal/test")).rejects.toThrowError(
      "Session expired and re-authentication was rejected"
    );
    // Verified: Exactly 4 fetch calls on the attempt, no infinite loop
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});

