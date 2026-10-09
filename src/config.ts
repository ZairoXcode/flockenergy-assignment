import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT ?? "3000", 10),
  portal: {
    baseUrl: requireEnv("PORTAL_BASE_URL").replace(/\/$/, ""),
    username: requireEnv("PORTAL_USERNAME"),
    password: requireEnv("PORTAL_PASSWORD"),
  },
};
