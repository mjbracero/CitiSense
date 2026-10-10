import { useNetworkState } from "expo-network";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../lib/supabase";

const PROBE_URL = `${SUPABASE_URL}/auth/v1/health`;
const PROBE_INTERVAL_MS = 20000;
const PROBE_TIMEOUT_MS = 8000;
const SLOW_THRESHOLD_MS = 2500;

async function measureLatency() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(PROBE_URL, {
      method: "GET",
      headers: { apikey: SUPABASE_ANON_KEY },
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status >= 500) {
      return { ok: false, serverError: true };
    }
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, timedOut: error?.name === "AbortError" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns "online" | "slow" | "offline" | "server_down".
 * Offline comes from the OS network state; "slow" comes from timing a tiny
 * request to the Supabase backend the app depends on; "server_down" means the
 * device has internet but the backend keeps failing (outage / maintenance).
 */
export default function useConnectionQuality() {
  const network = useNetworkState();
  const [probeStatus, setProbeStatus] = useState("online");
  const failuresRef = useRef(0);
  const internetReachableRef = useRef(network.isInternetReachable);
  internetReachableRef.current = network.isInternetReachable;

  const osOffline =
    network.isConnected === false || network.isInternetReachable === false;

  useEffect(() => {
    if (osOffline) {
      failuresRef.current = 0;
      return undefined;
    }

    let cancelled = false;
    let intervalId = null;

    const runProbe = async () => {
      const result = await measureLatency();
      if (cancelled) return;

      if (result.ok) {
        failuresRef.current = 0;
        setProbeStatus(result.latencyMs > SLOW_THRESHOLD_MS ? "slow" : "online");
        return;
      }

      failuresRef.current += 1;
      if (failuresRef.current < 2) {
        setProbeStatus("slow");
      } else if (result.serverError || internetReachableRef.current === true) {
        setProbeStatus("server_down");
      } else {
        setProbeStatus(result.timedOut ? "slow" : "offline");
      }
    };

    const start = () => {
      if (intervalId) return;
      runProbe();
      intervalId = setInterval(runProbe, PROBE_INTERVAL_MS);
    };

    const stop = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
    };

    if (AppState.currentState === "active") start();

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") start();
      else stop();
    });

    return () => {
      cancelled = true;
      stop();
      appStateSub.remove();
    };
  }, [osOffline]);

  if (osOffline) return "offline";
  return probeStatus;
}
