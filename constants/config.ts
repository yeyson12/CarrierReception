export const DEFAULT_API_ROOT = "https://prontomowers.store:10443";

const rawApiBase = (
  process.env.EXPO_PUBLIC_API_BASE?.trim() || DEFAULT_API_ROOT
).replace(/\/+$/, "");

export const API_BASE = rawApiBase.endsWith("/api")
  ? rawApiBase
  : `${rawApiBase}/api`;

export const API_ROOT = API_BASE.replace(/\/api$/, "");
