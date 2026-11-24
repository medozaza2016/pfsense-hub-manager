import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, apiRequest } from "./api";

/**
 * Browser-side client for the page-scoped configuration contract (DEC-047).
 *
 * Only the Aliases area exists today. The request goes to a fixed manager route;
 * the browser never supplies a firewall path, and the manager never forwards a
 * caller-supplied URL.
 */

export type AliasType = "host" | "network" | "port";

export interface AliasView {
  name: string | null;
  type: AliasType | null;
  description: string | null;
  entries: string[];
  entryCount: number;
  entriesTruncated: boolean;
}

export interface AliasCollectionView {
  deviceId: string;
  collectedAt: string;
  aliases: AliasView[];
  truncated: boolean;
}

/** Server-side cache is 60s; this only prevents duplicate mounts within a view. */
export const CONFIGURATION_TTL_MS = 30_000;

interface CacheEntry { fetchedAt: number; promise: Promise<AliasCollectionView> }
const aliasCache = new Map<string, CacheEntry>();

export function invalidateDeviceAliases(deviceId: string): void {
  aliasCache.delete(deviceId);
}

export function clearDeviceConfigurationCache(): void {
  aliasCache.clear();
}

function loadAliases(deviceId: string, force: boolean): Promise<AliasCollectionView> {
  const now = Date.now();
  const existing = aliasCache.get(deviceId);
  if (existing && !force && now - existing.fetchedAt < CONFIGURATION_TTL_MS) return existing.promise;

  const promise = apiRequest<AliasCollectionView>(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/configuration/aliases`
  );
  aliasCache.set(deviceId, { fetchedAt: now, promise });
  promise.catch(() => {
    if (aliasCache.get(deviceId)?.promise === promise) aliasCache.delete(deviceId);
  });
  return promise;
}

export interface AliasState {
  data: AliasCollectionView | null;
  loading: boolean;
  error: string;
  /** Stable server error code, so a page can explain which check failed. */
  errorCode: string | null;
  refresh: () => void;
}

/** Set `enabled` to false for demo records and when no site is selected. */
export function useDeviceAliases(deviceId: string | null, enabled = true): AliasState {
  const [data, setData] = useState<AliasCollectionView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!deviceId || !enabled) {
      setData(null);
      setLoading(false);
      setError("");
      setErrorCode(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    setErrorCode(null);
    loadAliases(deviceId, nonce > 0)
      .then(value => { if (active) { setData(value); setLoading(false); } })
      .catch((cause: unknown) => {
        if (!active) return;
        setData(null);
        setLoading(false);
        setError(cause instanceof Error ? cause.message : "Unable to read firewall aliases.");
        setErrorCode(cause instanceof ApiRequestError ? cause.code : null);
      });
    return () => { active = false; };
  }, [deviceId, enabled, nonce]);

  const refresh = useCallback(() => {
    if (deviceId) invalidateDeviceAliases(deviceId);
    setNonce(value => value + 1);
  }, [deviceId]);

  return { data, loading, error, errorCode, refresh };
}
