import { createHash, randomBytes } from "node:crypto";

export const sessionHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const loginChallenge = (value: string) => createHash("sha256").update(value).digest("base64url");
export const opaqueCode = () => randomBytes(32).toString("base64url");
export const validChallenge = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);

export function frontendUrls(): string[] {
  const configured = process.env.FRONTEND_URLS;
  const urls = configured ? configured.split(",").map(value => value.trim()).filter(Boolean) :
    process.env.REPLIT_DEV_DOMAIN ? [`https://${process.env.REPLIT_DEV_DOMAIN}/`] : ["http://localhost:24596/"];
  return urls.map(value => {
    const url = new URL(value);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) ||
      url.username || url.password || url.search || url.hash || !url.pathname.endsWith("/")) {
      throw new Error("FRONTEND_URLS must contain complete HTTPS frontend base URLs ending in /.");
    }
    return url.href;
  });
}

export function safeFrontend(value: unknown, allowed: readonly string[]): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return allowed.includes(url.href) ? url.href : null; }
  catch { return null; }
}

export function publicApiOrigin(): string {
  const value = process.env.AUTH_PUBLIC_ORIGIN ||
    (process.env.REPLIT_DEPLOYMENT === "1" ? "" :
      process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:8080");
  if (!value) throw new Error("Set AUTH_PUBLIC_ORIGIN to the published Replit API origin.");
  const url = new URL(value);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) ||
    url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("AUTH_PUBLIC_ORIGIN must be an HTTPS origin without a path.");
  }
  return url.origin;
}
