import { getSiteUrl } from "./metadata";

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function isLocalHost(hostname: string) {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
}

export function getPublicRequestOrigin(request: Request) {
  const configured = getSiteUrl();
  if (!isLocalHost(configured.hostname)) {
    return configured;
  }

  const requestUrl = new URL(request.url);
  const forwardedHost =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ??
    firstHeaderValue(request.headers.get("host"));
  const forwardedProto =
    firstHeaderValue(request.headers.get("x-forwarded-proto")) ??
    requestUrl.protocol.replace(":", "");

  if (!forwardedHost) {
    return requestUrl;
  }

  return new URL(`${forwardedProto}://${forwardedHost}`);
}
