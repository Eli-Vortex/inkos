import type { InkosEndpoint } from "./providers/types.js";

/**
 * Provider `compat` flags, with the one URL-derived special case applied.
 *
 * Shared by the client factory and the service resolver; the two had byte-
 * identical private copies, so a new compat rule would have had to be added
 * twice to stay consistent.
 */
export function resolveProviderCompat(
  provider: InkosEndpoint | undefined,
  baseUrl: string,
): Record<string, unknown> | undefined {
  const compat = {
    ...(provider?.compat ?? {}),
    ...(baseUrl.includes("generativelanguage.googleapis.com") ? { supportsStore: false } : {}),
  };
  return Object.keys(compat).length > 0 ? compat : undefined;
}
