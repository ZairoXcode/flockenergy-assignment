import { config } from "../config.js";
import { PortalAuthError, PortalUpstreamError } from "../errors.js";

// ---------------------------------------------------------------------------
// PortalClient manages a single authenticated session with the legacy portal.
//
// Session approach: login once, store the session cookie in memory, attach it
// to every subsequent request. If the portal returns a redirect to /login
// (HTTP 302 or a JSON redirect envelope) we attempt one re-login and retry.
//
// Limitation: this in-memory approach is intentionally simple and only works
// for a single service instance. A distributed deployment would require shared
// session state (e.g. Redis) or a different auth strategy such as per-request
// credentials.
// ---------------------------------------------------------------------------

export class PortalClient {
  private cookie: string | null = null;

  // Logs in to the portal and stores the resulting session cookie.
  // Credentials come from config (environment variables) — never hardcoded.
  private async login(): Promise<void> {
    const url = `${config.portal.baseUrl}/login`;

    const body = new URLSearchParams({
      email: config.portal.username,
      username: config.portal.username,
      password: config.portal.password,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: config.portal.baseUrl,
      },
      body: body.toString(),
      redirect: "manual",
    });

    // In Node 18+, getSetCookie() returns all Set-Cookie headers.
    const rawCookies: string[] =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie")].filter((c): c is string => Boolean(c));

    if (!rawCookies.length) {
      throw new PortalAuthError("Portal login did not return a session cookie");
    }

    // Extract cookie name=value pairs; join if multiple.
    this.cookie = rawCookies.map((c) => c.split(";")[0].trim()).join("; ");
  }

  // Sends an authenticated GET request to the portal.
  // If the response looks like a session expiry (redirect to login), attempts
  // one re-login and retries the request.
  async get(path: string): Promise<Response> {
    if (!this.cookie) {
      await this.login();
    }

    const response = await this.rawGet(path);

    if (this.isAuthRedirect(response)) {
      // Session expired — re-authenticate once and retry.
      this.cookie = null;
      await this.login();
      const retryResponse = await this.rawGet(path);
      if (this.isAuthRedirect(retryResponse)) {
        throw new PortalAuthError("Session expired and re-authentication was rejected");
      }
      return retryResponse;
    }

    return response;
  }

  private async rawGet(path: string): Promise<Response> {
    const url = `${config.portal.baseUrl}${path}`;
    return fetch(url, {
      headers: { cookie: this.cookie ?? "" },
      redirect: "manual",
    });
  }

  // The portal may signal an expired session via a 302 redirect to /login,
  // or via its JSON redirect envelope (as seen in the login response shape).
  private isAuthRedirect(response: Response): boolean {
    if (response.status === 302 || response.status === 303) {
      const location = response.headers.get("location") ?? "";
      return location.includes("/login");
    }
    return false;
  }
}

export { PortalAuthError, PortalUpstreamError } from "../errors.js";

// Single shared instance — reuses the session across all requests.
export const portalClient = new PortalClient();
