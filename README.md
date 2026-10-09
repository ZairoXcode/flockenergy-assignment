# Urja Meter Ops API

A REST API adapter over the internal Urja Meter Ops web portal.

## Overview

Urja Meter Ops is an internal utility portal built on SvelteKit (`https://urja-ops.flockenergy.tech`). It manages electricity meters and distribution network assets across an electrical grid, but does not provide an external public API for third-party consumers.

This service acts as an adapter layer sitting between API consumers and the legacy portal:

1. Authenticates against the portal's login form using credentials from environment variables.
2. Holds the resulting session cookie in memory and attaches it to subsequent requests.
3. Calls the portal's internal HTTP endpoints and SvelteKit data loaders.
4. Validates raw responses against Zod schemas at the boundary.
5. Transforms internal naming and structures into clean, consistent domain models.
6. Returns standard JSON responses with predictable HTTP status codes.

The legacy portal remains the single source of truth. API consumers interact only with this service and do not need to know anything about the upstream portal's session cookies, SvelteKit serialization formats, or internal field names.

## Architecture

```
API Consumer
    │
    ▼
Fastify HTTP Server
    │
    ▼
Route Handlers
    │  • Validates inputs using public schemas
    │  • Formats errors using consistent error handlers
    │
    ▼
Portal Fetchers
    │  • Calls internal portal paths
    │  • Validates raw responses using upstream schemas
    │
    ▼
Session Client
    │  • Submits login credentials to portal
    │  • Maintains session cookie in memory
    │  • Re-authenticates on session expiry
    │
    ▼
Legacy Urja Meter Ops Portal (https://urja-ops.flockenergy.tech)
    │
    ▼
Data Mappers
    │  • Maps portal summaries to public meter records
    │  • Builds network hierarchy objects
    │  • Converts string numbers to floats/integers
    │  • Normalizes field names
    │
    ▼
Clean JSON Response to Consumer
```

## Project Structure

```
flockenergy/
├── .env
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
├── PROTOCOL.md
├── REFLECTION.md
├── openapi.json
├── src/
│   ├── config.ts
│   ├── server.ts
│   ├── errors.ts
│   ├── portal/
│   │   ├── client.ts
│   │   ├── api.ts
│   │   └── types.ts
│   ├── mappers/
│   │   ├── meter.ts
│   │   └── energy.ts
│   ├── schemas/
│   │   ├── meter.ts
│   │   ├── energy.ts
│   │   └── transformer.ts
│   └── routes/
│       ├── meters.ts
│       └── transformers.ts
└── tests/
    ├── mappers.test.ts
    └── routes.test.ts
```

- `src/config.ts`: Reads environment variables (`PORTAL_BASE_URL`, `PORTAL_USERNAME`, `PORTAL_PASSWORD`, `PORT`) and fails fast at startup if required values are missing.
- `src/server.ts`: Configures Fastify, registers routes and Swagger UI, attaches the centralized error handler, and exposes the app factory.
- `src/errors.ts`: Centralizes application error classes (`BadRequestError`, `NotFoundError`, `PortalAuthError`, `PortalUpstreamError`) and ensures error responses always use the `{ error: { code, message } }` envelope.
- `src/portal/`: Isolated upstream integration layer. `client.ts` manages login and cookies, `api.ts` makes upstream requests, and `types.ts` defines Zod validation for raw portal data shapes.
- `src/mappers/`: Pure translation functions. Converts upstream data into domain representations without mixing in HTTP or network logic.
- `src/schemas/`: Public Zod schemas for validating request parameters and defining response models.
- `src/routes/`: Route definitions for meters and transformers.
- `openapi.json`: Static OpenAPI 3.0.3 specification documenting the public API.
- `PROTOCOL.md`: Notes and findings from reverse-engineering the legacy portal.
- `REFLECTION.md`: Design rationale, trade-offs, limitations, and future improvements.

## Tech Stack

- **Runtime**: Node.js (v20+, ES Modules)
- **Language**: TypeScript (strict mode, targeting ES2022 / NodeNext)
- **HTTP Framework**: Fastify v5
- **Documentation**: `@fastify/swagger` and `@fastify/swagger-ui` (Swagger UI served at `/docs`)
- **Validation**: Zod (used for upstream boundary validation and request validation)
- **Environment Management**: `dotenv`
- **Testing**: Vitest

## Endpoints

| Method | Endpoint                      | Description                                           |
| ------ | ----------------------------- | ----------------------------------------------------- |
| `GET`  | `/health`                     | Service health check                                  |
| `GET`  | `/api/meters?q=&page=`        | Search meters by ID or serial number with pagination  |
| `GET`  | `/api/meters/:id`             | Meter detail including distribution network hierarchy |
| `GET`  | `/api/meters/:id/consumption` | 30-minute interval energy telemetry readings          |
| `GET`  | `/api/meters/:id/location`    | Installation site GPS coordinates                     |
| `GET`  | `/api/transformers?page=`     | Paginated distribution transformer list               |
| `GET`  | `/docs`                       | Interactive Swagger UI documentation                  |

## Environment Variables

Configured in `.env` (a template is available in `.env.example`):

| Variable          | Required | Default                             | Description                        |
| ----------------- | -------- | ----------------------------------- | ---------------------------------- |
| `PORT`            | No       | `3000`                              | Port for the local HTTP server     |
| `PORTAL_BASE_URL` | Yes      | `https://urja-ops.flockenergy.tech` | Base URL of the legacy Urja portal |
| `PORTAL_USERNAME` | Yes      | —                                   | Username / email for portal login  |
| `PORTAL_PASSWORD` | Yes      | —                                   | Password for portal login          |

`.env` is listed in `.gitignore` and must never be committed.

## Setup

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Configure environment**:

   ```bash
   cp .env.example .env
   ```

   Open `.env` and fill in your portal credentials:

   ```env
   PORT=3000
   PORTAL_BASE_URL=https://urja-ops.flockenergy.tech
   PORTAL_USERNAME=your_username_here
   PORTAL_PASSWORD=your_password_here
   ```

3. **Run development server**:

   ```bash
   npm run dev
   ```

   The service will listen on `http://localhost:3000`.

4. **Build and run for production**:

   ```bash
   npm run build
   npm start
   ```

5. **Typecheck and run tests**:
   ```bash
   npm run typecheck
   npm test
   ```

## API Examples

### 1. Health Check

```bash
curl http://localhost:3000/health
```

Response:

```json
{
  "status": "ok"
}
```

### 2. Search Meters

```bash
curl "http://localhost:3000/api/meters?q=J100000&page=1"
```

Response:

```json
{
  "page": 1,
  "results": [
    {
      "meterId": "J100000",
      "serialNo": "SE33962",
      "make": "HPL",
      "phaseType": "single",
      "installationStatus": "Decommissioned",
      "dtCode": "DT-001"
    }
  ]
}
```

### 3. Meter Detail

```bash
curl http://localhost:3000/api/meters/J100000
```

Response:

```json
{
  "meterId": "J100000",
  "serialNo": "SE33962",
  "make": "HPL",
  "phaseType": "single",
  "installationStatus": "Decommissioned",
  "installationType": "Whole Current",
  "network": {
    "zone": "Jaipur Zone 1 (Z-01)",
    "circle": "Circle 1 (C-01)",
    "division": "Division 1 (D-01)",
    "subdivision": "Subdivision 1 (SD-01)",
    "substation": "Substation 1 (SS-01)",
    "feeder": "Feeder 1 (F-001)",
    "transformer": "Malviya Nagar DT 1 (DT-001)"
  }
}
```

## Error Responses

All error responses share a standard format:

```json
{
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "meterId must start with a letter and contain only alphanumeric characters (max 20 chars)"
  }
}
```

HTTP status codes mapped by the service:

- `400 Bad Request` (`INVALID_PARAMETER`): Query parameter or path parameter validation failed (e.g., negative page number, malformed meter ID).
- `404 Not Found` (`NOT_FOUND`): The requested meter, its energy consumption data, or its geolocation was not found on the upstream portal.
- `502 Bad Gateway` (`UPSTREAM_ERROR`): The legacy portal returned an unexpected HTTP status code, non-JSON response, or a payload that failed Zod schema validation.
- `503 Service Unavailable` (`PORTAL_AUTH_FAILED`): Upstream authentication failed (invalid credentials or inability to obtain a session cookie).
- `500 Internal Server Error` (`INTERNAL_ERROR`): Unhandled internal server error. Raw stack traces are never exposed to clients.

## Authentication and Session Handling

The legacy portal uses cookie-based session authentication tied to SvelteKit form actions:

- **Login Request**: `POST /login` with `Content-Type: application/x-www-form-urlencoded` and `Origin: https://urja-ops.flockenergy.tech` (required by SvelteKit's cross-site request validation). The form fields are `email` and `password`.
- **Session Cookie**: On successful authentication, the portal returns a `Set-Cookie` header. The adapter extracts the cookie value and holds it in memory.
- **Session Reuse**: Subsequent requests to portal endpoints reuse the cached session cookie in the `Cookie` request header.
- **Re-authentication**: If the portal returns an HTTP 302/303 redirect pointing to `/login`, the client marks the cached cookie as expired, performs a fresh login, and retries the original request once.
- **Security**: Credentials and session cookies are kept in memory only. They are never written to disk, output to logs, or returned in API responses.

## Design Decisions

- **Stateless adapter over database-backed system**: The legacy portal is the system of record. Creating a local database would introduce synchronization lag, replication complexity, and cache invalidation problems for an assignment where a clean proxy interface is needed.
- **Isolation under `src/portal/`**: All knowledge of portal URLs, session cookies, raw payload formats, and SvelteKit `__data.json` conventions lives strictly inside `src/portal/`. If the legacy portal changes its endpoints, only this directory needs modifications; routes and domain models remain untouched.
- **Zod validation at the upstream boundary**: Internal portal APIs are unversioned and can change without notice. Validating upstream responses with Zod ensures malformed or unexpected responses fail immediately with a clean `502 UPSTREAM_ERROR` rather than propagating corrupt data to consumers.
- **Explicit mapper functions**: Raw portal models are distinct from public API models. Mappers explicitly rename fields (such as `voltR` to `voltageR` and `installStatus` to `installationStatus`), convert string numerics to JavaScript numbers, and assemble nested network hierarchies so portal quirks never leak into the public API.
- **In-memory session management**: Session state is held in process memory. This avoids external dependencies while satisfying the needs of a single-instance service.

## Assumptions

1. **Meter ID Format**: Meter identifiers follow a letter followed by alphanumeric characters up to 20 characters (e.g., `J100000`).
2. **Timestamps**: The portal returns telemetry timestamps in `DD/MM/YYYY HH:mm` format without an explicit timezone offset. The adapter leaves this string unchanged rather than converting to UTC and guessing a timezone.
3. **Dataset Scale**: During initial investigation, the portal exposed roughly 400 meters. The service is structured around on-demand upstream queries rather than bulk prefetching.
4. **Single-Instance Deployment**: In-memory session storage assumes a single running instance of the adapter. Multi-instance horizontal scaling would require shared session storage.

## Intentionally Skipped

- **Caching Layer**: While an in-memory cache could reduce repeat portal requests, it was skipped to keep the implementation focused on core adapter responsibilities and avoid stale data issues.
- **Rate Limiting**: Not implemented at this stage to avoid adding extra middleware dependencies.
- **Background Prefetching / Polling**: The adapter works purely on-demand per incoming request rather than synchronizing the portal in the background.

## Testing

The test suite is built with Vitest and runs entirely without network access to the live portal:

```bash
npm test
```

- **`tests/mappers.test.ts`**: Unit tests verifying that raw portal search, detail, energy, and geolocation payloads are mapped correctly to public domain shapes, string numerics are converted, field renames work, and Zod schemas reject invalid inputs.
- **`tests/routes.test.ts`**: Route integration tests using Fastify's `inject()` method and mocked portal functions. Tests verify HTTP status codes, parameter validation (e.g., invalid meter IDs and page numbers returning 400), 404 responses, and upstream failure handling (502 for bad data, 503 for auth failure).

To verify TypeScript types without emitting code:

```bash
npm run typecheck
```

## Documentation

- **`README.md`**: Project overview, architecture, setup instructions, and endpoint examples.
- **`PROTOCOL.md`**: Investigation notes detailing reverse-engineered portal endpoints, SvelteKit `__data.json` structure, form login behavior, and data quirks.
- **`REFLECTION.md`**: Discussion of design decisions, implementation challenges, trade-offs, and future work.
- **`openapi.json`**: Static OpenAPI 3.0.3 specification describing the public API routes, parameters, and schemas.
- **Interactive Docs**: Available at `http://localhost:3000/docs` via Swagger UI when running the server.
