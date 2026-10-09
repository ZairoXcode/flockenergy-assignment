# Reflection — Technical Decisions, Trade-offs & Analysis

---

## 1. Key Architectural Decisions & Trade-offs

### Stateless Adapter (No Persistence Layer)

- **Decision**: Avoided database or message queues.
- **Rationale**: The legacy Urja portal is the source of truth for meters, distribution transformers, and interval telemetry. Introducing a database would require replicating upstream state and managing synchronization logic for an assignment whose primary goal is providing a clean REST adapter over an existing service.
- **Trade-off**: Every incoming request to this service triggers an upstream HTTP call. For the observed dataset of roughly 400 meters, direct proxying is straightforward, avoids state drift, and ensures consumers always see current portal data.

### In-Memory Single-Session Strategy

- **Decision**: Log in once against `/login`, store the session cookie in process memory, attach it to subsequent requests, and re-authenticate when session expiration is detected.
- **Rationale**: Keeps the implementation lightweight without requiring external infrastructure like Redis for a single-instance service.
- **Session Expiry & Retry**: When an upstream request returns an HTTP 302 or 303 redirect pointing to `/login`, the client clears its in-memory cookie, performs a fresh login, and retries the original request once. If the retried request still returns a redirect, it raises `PortalAuthError("Session expired and re-authentication was rejected")`, which maps to HTTP 503 `PORTAL_AUTH_FAILED` and prevents retry loops.
- **Limitation**: This design assumes a single service instance. If the service were horizontally scaled across multiple instances behind a load balancer, each replica would maintain its own independent session, or a shared session store would be needed.

### Upstream Boundary Validation with Zod

- **Decision**: Raw payloads returned by the legacy portal are parsed against Zod schemas in `src/portal/types.ts` before passing to domain mappers.
- **Rationale**: Internal portal responses are unversioned and can change unexpectedly. Validating upstream responses at the boundary ensures that malformed payloads fail fast with a structured `502 UPSTREAM_ERROR` rather than propagating corrupted data or causing runtime exceptions in business logic.

### Centralized Error Handling (`src/errors.ts`)

- **Decision**: Unified API error formatting across domain errors (`BadRequestError`, `NotFoundError`, `PortalAuthError`, `PortalUpstreamError`), Zod schema failures, and unhandled exceptions into a standard `{ error: { code, message } }` envelope.
- **Rationale**: Keeps responses consistent across all endpoints and ensures internal portal URLs, raw responses, and stack traces are never exposed to public API consumers.

---

## 2. Hardest Challenges & How They Were Solved

### Reverse Engineering the SvelteKit Portal

- **Challenge**: Meter detail data is not served through a dedicated JSON endpoint. The portal uses SvelteKit's client-side data loader route (`/meters/{meterId}/__data.json?x-sveltekit-invalidated=001`), which serializes layout and page data as a node array (`nodes: [null, { type: "data", data: { ... } }]`).
- **Solution**: Built extraction logic in `src/portal/api.ts` that inspects the `nodes` array, dynamically finds the node with `type === "data"`, and parses the underlying data object against a Zod schema. The internal SvelteKit envelope is mapped to a clean domain model and never exposed to public consumers.
- **Authentication Form Requirements**: Sending standard JSON POST requests to `/login` returned `415 Unsupported Media Type`, and omitting the `Origin` header returned `403 Forbidden` due to SvelteKit's CSRF protection. Inspecting the portal's HTML form revealed that it expects `application/x-www-form-urlencoded` with fields `email` and `password`, along with an `Origin: https://urja-ops.flockenergy.tech` header. Updating `src/portal/client.ts` to match these requirements established successful authentication.

### Handling Ambiguous Timestamps

- **Challenge**: The portal returns telemetry timestamps as strings in `DD/MM/YYYY HH:mm` format (e.g., `24/06/2026 00:00`) without a timezone offset.
- **Solution**: Passed the timestamp string through unchanged. Converting to UTC without an explicitly verified timezone offset would risk silently misrepresenting the actual timestamp.

---

## 3. What Was Intentionally Skipped

- **Database / Cache Layer**: The service reads on-demand from the legacy portal. Adding PostgreSQL or Redis was unnecessary for the scope of this assignment and would add operational dependencies.
- **Distributed Session Storage**: In-memory cookie storage is sufficient for a single running instance.
- **Request Rate Limiting**: Left out to keep dependencies minimal for local evaluation.
- **Docker Containerization**: Omitted since the application runs directly using standard npm scripts (`npm run dev`, `npm start`).

---

## 4. Future Improvements

1. **Short-TTL In-Memory Cache**: Add a short in-memory cache (e.g., 60 seconds) for meter detail and location data to reduce repetitive upstream calls for data that changes infrequently.
2. **Upstream Request Timeout**: Add an `AbortSignal` with a timeout (e.g., 10 seconds) to upstream fetch requests to prevent client connections from hanging if the legacy portal becomes unresponsive.
3. **Shared Session Storage**: Store session cookies in a distributed store like Redis if the service is deployed with multiple replicas behind a load balancer.
4. **Rate Limiting**: Integrate rate limiting (e.g., via `@fastify/rate-limit`) to protect both the adapter and the upstream portal from traffic spikes.
