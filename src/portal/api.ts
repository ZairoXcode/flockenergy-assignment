import { ZodError } from "zod";
import { portalClient, PortalUpstreamError } from "./client.js";
import {
  PortalMeterSearchResponseSchema,
  PortalSvelteKitDataSchema,
  PortalMeterDetailDataSchema,
  PortalEnergyResponseSchema,
  PortalGeoResponseSchema,
  PortalDtResponseSchema,
  PortalMeterSummary,
  PortalMeterDetailData,
  PortalEnergyReading,
} from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJson(path: string): Promise<unknown> {
  let response: Response;
  try {
    response = await portalClient.get(path);
  } catch (err) {
    if (err instanceof Error && err.name === "PortalAuthError") throw err;
    throw new PortalUpstreamError(`Portal request failed: ${path}`);
  }

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new PortalUpstreamError(
      `Portal returned HTTP ${response.status} for ${path}`
    );
  }

  try {
    return await response.json();
  } catch {
    throw new PortalUpstreamError(`Portal returned non-JSON response for ${path}`);
  }
}

function parseOrUpstreamError<T>(schema: { parse: (data: unknown) => T }, data: unknown, context: string): T {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new PortalUpstreamError(
        `Unexpected portal response shape for ${context}: ${err.issues[0]?.message ?? "validation failed"}`
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Portal API functions
// ---------------------------------------------------------------------------

export async function searchMeters(
  query: string,
  page: number
): Promise<{ data: PortalMeterSummary[] }> {
  const raw = await fetchJson(
    `/portal/meters/search?q=${encodeURIComponent(query)}&page=${page}`
  );
  const parsed = parseOrUpstreamError(
    PortalMeterSearchResponseSchema,
    raw,
    "meter search"
  );
  return parsed;
}

// Fetches the SvelteKit __data.json for a meter detail page and extracts
// the actual meter data from the node graph.
export async function getMeterDetail(
  meterId: string
): Promise<PortalMeterDetailData | null> {
  const raw = await fetchJson(
    `/meters/${encodeURIComponent(meterId)}/__data.json?x-sveltekit-invalidated=001`
  );
  if (raw === null) return null;

  const envelope = parseOrUpstreamError(
    PortalSvelteKitDataSchema,
    raw,
    "meter detail envelope"
  );

  // Walk the SvelteKit node graph to find the data node. SvelteKit emits a
  // nodes array where index 0 is null and index 1 contains the page data.
  // We look for the first non-null node that has a "data" object.
  const dataNode = envelope.nodes.find(
    (node) => node !== null && node.type === "data" && node.data !== null
  );

  if (!dataNode?.data) {
    throw new PortalUpstreamError(
      "Meter detail response did not contain a data node"
    );
  }

  return parseOrUpstreamError(
    PortalMeterDetailDataSchema,
    dataNode.data,
    "meter detail data"
  );
}

export async function getMeterEnergy(
  meterId: string
): Promise<{ data: PortalEnergyReading[] } | null> {
  const raw = await fetchJson(
    `/portal/meters/${encodeURIComponent(meterId)}/energy`
  );
  if (raw === null) return null;
  return parseOrUpstreamError(PortalEnergyResponseSchema, raw, "meter energy");
}

export async function getMeterGeo(
  meterId: string
): Promise<{ latitude: number; longitude: number } | null> {
  const raw = await fetchJson(
    `/portal/meters/${encodeURIComponent(meterId)}/geo`
  );
  if (raw === null) return null;

  const parsed = parseOrUpstreamError(PortalGeoResponseSchema, raw, "meter geo");
  return {
    latitude: parseFloat(parsed.data.latitude),
    longitude: parseFloat(parsed.data.longitude),
  };
}

export async function listTransformers(
  page: number
): Promise<{ data: import("./types.js").PortalDt[] }> {
  const raw = await fetchJson(`/portal/dts?page=${page}`);
  if (raw === null) {
    return { data: [] };
  }
  return parseOrUpstreamError(PortalDtResponseSchema, raw, "transformers");
}
