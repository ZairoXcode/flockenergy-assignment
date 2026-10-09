# Urja Meter Ops — Legacy Portal Protocol & Reverse-Engineering Notes

This document details the internal behavior and wire formats of the legacy Urja Meter Ops portal (`https://urja-ops.flockenergy.tech`), discovered during browser investigation and network inspection. It explains how the API adapter interacts with the portal, handles authentication, and maps internal data to clean public REST endpoints.

---

## 1. Portal Overview

The Urja Meter Ops portal is a web application built with SvelteKit. It is used internally for operational monitoring of electricity meters and distribution network assets.

Key characteristics:
- **No external public API**: Endpoints are designed for the internal SvelteKit frontend rather than third-party consumers.
- **Session-cookie security**: All data routes require an active session cookie created through an HTML form login action.
- **No CORS or API keys**: The portal does not issue API tokens or define cross-origin access policies for programmatic clients.
- **Internal formats**: Data is served through a mix of internal JSON endpoints and SvelteKit `__data.json` page load envelopes.

The adapter acts as a translation layer: it authenticates, manages the session cookie in memory, calls the upstream endpoints, validates responses against Zod schemas, and returns standard JSON models.

---

## 2. Authentication

### Login Endpoint

The portal uses a standard SvelteKit form action for authentication:

```http
POST /login
Host: urja-ops.flockenergy.tech
Origin: https://urja-ops.flockenergy.tech
Content-Type: application/x-www-form-urlencoded

email=<portal_username_or_email>&password=<portal_password>
```

**Technical observations**:
- **Form encoding**: The login endpoint expects `application/x-www-form-urlencoded`. Sending JSON (`application/json`) causes SvelteKit to respond with `415 Unsupported Media Type`.
- **CSRF origin check**: SvelteKit validates the `Origin` header on form submissions. Omitting `Origin` results in `403 Cross-site POST form submissions are forbidden`.
- **Form fields**: The form input names are `email` and `password`.

### Login Response and Redirect Behavior

On successful authentication, the portal returns an HTTP 200 with a SvelteKit redirect envelope:

```json
{
  "type": "redirect",
  "status": 303,
  "location": "/meters"
}
```

If authentication fails (invalid credentials), the portal responds with a failure envelope:

```json
{
  "type": "failure",
  "status": 401,
  "data": "[{\"email\":1,\"error\":2},\"\",\"Invalid email or password.\"]"
}
```

### Session Cookie Usage

On successful login, the response includes one or more `Set-Cookie` headers containing the session cookie.
- The adapter extracts the `name=value` portion of the cookie (discarding attributes like `Path`, `HttpOnly`, and `SameSite`).
- The session cookie must be sent on every subsequent request via the standard `Cookie` header:
  ```http
  Cookie: <session_cookie_name>=<session_cookie_value>
  ```

### Session Maintenance and Refresh

- **In-Memory Storage**: The cookie is retained in process memory and reused across all incoming requests.
- **Re-authentication**: The portal signals an expired session by returning an HTTP 302 or 303 redirect with a `location` header containing `/login`.
- **Automatic Retry**: When the adapter detects a redirect to `/login`, it clears the in-memory cookie, performs a fresh login request, and retries the original request once. If the second attempt fails, it raises an authentication error (`503 PORTAL_AUTH_FAILED`).

---

## 3. Meter Search

Searches meters by query string with 1-based page pagination.

- **HTTP Method**: `GET`
- **Upstream Path**: `/portal/meters/search?q={query}&page={page}`
- **Query Parameters**:
  - `q`: Search query string (meter ID, serial number, etc.). Empty string returns all meters for the given page.
  - `page`: 1-based page index (e.g., `1`, `2`).

### Observed Response Structure

```json
{
  "data": [
    {
      "meterId": "J100000",
      "serialNo": "SE33962",
      "make": "HPL",
      "phaseType": "single",
      "installStatus": "Decommissioned",
      "dtCode": "DT-001"
    }
  ]
}
```

**Notes**:
- The portal contains roughly 400 meters in total based on initial investigation.
- The response does not provide a `total` count or total page count. The adapter forwards the `page` parameter as requested and returns the array in `{ page, results }`.

---

## 4. Meter Details

Detailed meter metadata and distribution network hierarchy are not served from a dedicated REST endpoint. Instead, the portal uses SvelteKit's client-side data loader route.

- **HTTP Method**: `GET`
- **Upstream Path**: `/meters/{meterId}/__data.json?x-sveltekit-invalidated=001`
- **Query Parameter**: `x-sveltekit-invalidated=001` (standard SvelteKit query flag requesting fresh page data).

### SvelteKit `__data.json` Behavior

SvelteKit page loaders serialize layout and page data as a node array:

```json
{
  "nodes": [
    null,
    {
      "type": "data",
      "data": {
        "meterId": "J100000",
        "serialNo": "SE33962",
        "make": "HPL",
        "phaseType": "single",
        "installStatus": "Decommissioned",
        "installType": "Whole Current",
        "zone": "Jaipur Zone 1 (Z-01)",
        "circle": "Circle 1 (C-01)",
        "division": "Division 1 (D-01)",
        "subdivision": "Subdivision 1 (SD-01)",
        "substation": "Substation 1 (SS-01)",
        "feeder": "Feeder 1 (F-001)",
        "dtName": "Malviya Nagar DT 1",
        "dtCode": "DT-001"
      }
    }
  ]
}
```

### Observed Fields
- Meter identity: `meterId`, `serialNo`, `make`, `phaseType`, `installStatus`, `installType`.
- Network hierarchy: `zone`, `circle`, `division`, `subdivision`, `substation`, `feeder`, `dtName`, `dtCode`.

### Adapter Extraction Strategy
- The adapter parses the outer envelope, scans `nodes`, and locates the first non-null node where `type === "data"`.
- It validates `node.data` against a Zod schema and packages the network fields into a structured `network` object.
- The internal SvelteKit node envelope (`nodes: [...]`) is completely hidden from public API consumers.

---

## 5. Energy Data

Returns 30-minute interval telemetry readings for a meter.

- **HTTP Method**: `GET`
- **Upstream Path**: `/portal/meters/{meterId}/energy`

### Observed Response Structure

```json
{
  "data": [
    {
      "timestamp": "24/06/2026 00:00",
      "kwh": "48439.16",
      "kvah": "52314.29",
      "voltR": "229"
    }
  ]
}
```

### Observations & Data Normalization
- **String Numerics**: The portal serializes numeric telemetry (`kwh`, `kvah`, `voltR`) as strings rather than numbers.
- **Conversion**: The adapter parses `kwh` and `kvah` into floating-point numbers (`parseFloat`) and `voltR` into an integer (`parseInt`).
- **Field Renaming**: The portal's abbreviated `voltR` (R-phase voltage) is mapped to `voltageR` in the public API for clarity.
- **Timestamps**: Returned in `DD/MM/YYYY HH:mm` format. The portal provides no timezone indicator.
- **Not Found Handling**: If the requested meter does not exist, the portal returns HTTP 404 on `/portal/meters/{meterId}/energy`, which the adapter maps to public `404 NOT_FOUND`.

---

## 6. Geo Data

Returns physical site coordinates for a meter.

- **HTTP Method**: `GET`
- **Upstream Path**: `/portal/meters/{meterId}/geo`

### Observed Response Structure

```json
{
  "data": {
    "latitude": "26.938961002479868",
    "longitude": "75.83095696146852"
  }
}
```

### Observations & Data Normalization
- Latitude and longitude are returned as high-precision strings.
- The adapter parses both coordinates into standard IEEE 754 floating-point numbers using `parseFloat`.
- If no geolocation record exists for the meter, the portal returns 404, which the adapter maps to `404 NOT_FOUND`.

---

## 7. Transformers / DT

Lists distribution transformers (DTs) connected across the electrical network.

- **HTTP Method**: `GET`
- **Upstream Path**: `/portal/dts?page={page}`
- **Query Parameter**: `page`: 1-based page index.

### Observed Response Structure

```json
{
  "data": [
    {
      "code": "DT-001",
      "name": "Malviya Nagar DT 1",
      "feederCode": "F-001",
      "capacityKva": 100
    },
    {
      "code": "DT-002",
      "name": "Mansarovar DT 2",
      "feederCode": "F-002",
      "capacityKva": 63
    }
  ]
}
```

### Observations
- Unlike the energy endpoint, `capacityKva` is already returned as a native number.
- The adapter maps each transformer into `{ code, name, feederCode, capacityKva }`.

---

## 8. Summary of Data Available Upstream

| Category | Available Fields from Portal | Notes |
|---|---|---|
| **Meter Summary** | `meterId`, `serialNo`, `make`, `phaseType`, `installStatus`, `dtCode` | Returned by search |
| **Meter Detail** | Above plus `installType`, `zone`, `circle`, `division`, `subdivision`, `substation`, `feeder`, `dtName` | Available inside `__data.json` |
| **Network Hierarchy** | Zone, Circle, Division, Subdivision, Substation, Feeder, Transformer Name & Code | Flat fields in portal; grouped by adapter |
| **Energy Telemetry** | `timestamp`, `kwh`, `kvah`, `voltR` | 30-min intervals; string numerics |
| **GPS Location** | `latitude`, `longitude` | High-precision coordinate strings |
| **Transformers** | `code`, `name`, `feederCode`, `capacityKva` | Transformer asset inventory |

No other fields are provided by the upstream portal. The adapter does not invent synthetic properties.

---

## 9. Portal Quirks and Technical Notes

1. **SvelteKit `__data.json` Format**:
   - The portal does not have a dedicated `/portal/meters/{id}` JSON endpoint. Detail data must be fetched from the SvelteKit loader route (`/meters/{id}/__data.json?x-sveltekit-invalidated=001`).
   - The adapter extracts the payload from the node array and shields consumers from this internal serialization format.

2. **Form Login with SvelteKit CSRF Rules**:
   - The login endpoint requires `application/x-www-form-urlencoded` and a valid `Origin` header matching the portal host (`https://urja-ops.flockenergy.tech`).
   - Standard JSON POST submissions fail with `415 Unsupported Media Type`, and missing `Origin` headers fail with `403 Forbidden`.

3. **String-Encoded Numerics**:
   - Energy readings (`kwh`, `kvah`, `voltR`) and GPS coordinates (`latitude`, `longitude`) are sent as strings.
   - The adapter explicitly parses these into numeric types before returning them to clients.

4. **Timestamp Format**:
   - Timestamps appear in `DD/MM/YYYY HH:mm` format (e.g., `24/06/2026 00:00`).
   - Because the upstream response does not include a timezone offset (e.g., `+05:30` or `Z`), the adapter passes the string through unchanged to avoid guessing or corrupting the timestamp.

5. **No Total Result Count in Search**:
   - The search endpoint `/portal/meters/search` returns matching items for the requested page but does not supply a `total_count` or `total_pages`.
   - The adapter returns `{ page, results: [...] }` without fabricating total counts.

6. **Session Expiry via HTTP Redirect**:
   - The portal indicates session expiration using HTTP 302/303 redirects pointing to `/login` rather than returning an HTTP 401 response.
   - The adapter inspects the response status and `location` header to trigger re-authentication.

---

## 10. Adapter Mapping Reference

The table below shows how raw portal fields map to public API fields:

### Meter Search Item
| Portal Field (`/portal/meters/search`) | Public API Field (`GET /api/meters`) | Type Conversion |
|---|---|---|
| `meterId` | `meterId` | String |
| `serialNo` | `serialNo` | String |
| `make` | `make` | String |
| `phaseType` | `phaseType` | String |
| `installStatus` | `installationStatus` | Renamed for consistency |
| `dtCode` | `dtCode` | String |

### Meter Detail
| Portal Field (`/meters/{id}/__data.json`) | Public API Field (`GET /api/meters/:id`) | Notes |
|---|---|---|
| `meterId` | `meterId` | String |
| `serialNo` | `serialNo` | String |
| `make` | `make` | String |
| `phaseType` | `phaseType` | String |
| `installStatus` | `installationStatus` | Renamed |
| `installType` | `installationType` | Renamed |
| `zone` | `network.zone` | Nested under `network` |
| `circle` | `network.circle` | Nested under `network` |
| `division` | `network.division` | Nested under `network` |
| `subdivision` | `network.subdivision` | Nested under `network` |
| `substation` | `network.substation` | Nested under `network` |
| `feeder` | `network.feeder` | Nested under `network` |
| `dtName` + `dtCode` | `network.transformer` | Combined into `"{dtName} ({dtCode})"` |

### Energy Reading
| Portal Field (`/portal/meters/{id}/energy`) | Public API Field (`GET /api/meters/:id/consumption`) | Type Conversion |
|---|---|---|
| `timestamp` | `timestamp` | String (`DD/MM/YYYY HH:mm` preserved) |
| `kwh` | `kwh` | `parseFloat(raw.kwh)` |
| `kvah` | `kvah` | `parseFloat(raw.kvah)` |
| `voltR` | `voltageR` | `parseInt(raw.voltR, 10)` (renamed) |

### Geolocation
| Portal Field (`/portal/meters/{id}/geo`) | Public API Field (`GET /api/meters/:id/location`) | Type Conversion |
|---|---|---|
| `latitude` | `latitude` | `parseFloat(raw.latitude)` |
| `longitude` | `longitude` | `parseFloat(raw.longitude)` |

### Transformer
| Portal Field (`/portal/dts`) | Public API Field (`GET /api/transformers`) | Type Conversion |
|---|---|---|
| `code` | `code` | String |
| `name` | `name` | String |
| `feederCode` | `feederCode` | String |
| `capacityKva` | `capacityKva` | Number (native) |
