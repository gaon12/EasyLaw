export function clientFingerprintHeaders(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  return {
    "X-EasyLaw-Screen": `${window.screen.width}x${window.screen.height}:${window.devicePixelRatio}`,
    "X-EasyLaw-Timezone":
      Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
  };
}
