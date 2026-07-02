export function safeNextPath(value: string | null | undefined) {
  if (!value || value.length > 300) {
    return "/";
  }
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/";
  }
  if (hasControlCharacter(value)) {
    return "/";
  }

  const url = new URL(value, "https://easylaw.local");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function optionalSafeNextPath(value: string | null | undefined) {
  const path = safeNextPath(value);
  return path === "/" && value !== "/" ? undefined : path;
}

function hasControlCharacter(value: string) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}
