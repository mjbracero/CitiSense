import { usePathname, useRouter, useRootNavigationState } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ensureProfileAvatarLoaded } from "../lib/profileAvatarService";
import { hydratePageCache, setPageCacheUser } from "../lib/pageDataCache";
import {
  ensureHomeOnAppReopen,
  peekMediaPickerReturnRoute,
  restoreLastRouteOnce,
} from "../lib/navigationPersistence";
import { supabase } from "../lib/supabase";

export default function useRoleLayoutBootstrap(role) {
  const router = useRouter();
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState();
  const navigationReady = Boolean(rootNavigationState?.key);
  const pathnameRef = useRef(pathname);
  const userIdRef = useRef(null);
  const restoreStartedRef = useRef(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [startupSettled, setStartupSettled] = useState(false);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const userId = session?.user?.id || null;
        userIdRef.current = userId;

        await peekMediaPickerReturnRoute(role);

        if (userId) {
          setPageCacheUser(userId);
          await hydratePageCache(userId);
          ensureProfileAvatarLoaded(role);
        }
      } catch (error) {
        console.log("Role layout bootstrap error:", error);
      } finally {
        if (!cancelled) {
          setSessionReady(true);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [role]);

  useEffect(() => {
    if (!sessionReady || !navigationReady || restoreStartedRef.current) {
      return;
    }

    const userId = userIdRef.current;
    if (!userId) {
      setStartupSettled(true);
      router.replace("/auth/login");
      return;
    }

    restoreStartedRef.current = true;

    restoreLastRouteOnce(router, role, userId, pathnameRef.current)
      .catch((error) => {
        console.log("Restore home route error:", error);
      })
      .finally(() => {
        // Unlock navigation permanently after the one-time startup redirect.
        setStartupSettled(true);
      });
  }, [sessionReady, navigationReady, role, router]);

  useEffect(() => {
    return ensureHomeOnAppReopen(
      router,
      role,
      () => pathnameRef.current,
      () => userIdRef.current
    );
  }, [role, router]);

  // Only block the first paint on cold start. After that, tabs must stay usable.
  return sessionReady && startupSettled;
}
