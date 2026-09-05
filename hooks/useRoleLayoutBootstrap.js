import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ensureProfileAvatarLoaded } from "../lib/profileAvatarService";
import { hydratePageCache, setPageCacheUser } from "../lib/pageDataCache";
import { restoreLastRouteOnce } from "../lib/navigationPersistence";
import { supabase } from "../lib/supabase";

export default function useRoleLayoutBootstrap(role) {
  const router = useRouter();
  const pathname = usePathname();
  const initialPathnameRef = useRef(pathname);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const userId = session?.user?.id || null;

        if (userId) {
          setPageCacheUser(userId);
          await hydratePageCache(userId);
          ensureProfileAvatarLoaded(role);
          await restoreLastRouteOnce(
            router,
            role,
            userId,
            initialPathnameRef.current
          );
        }
      } catch (error) {
        console.log("Role layout bootstrap error:", error);
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [role, router]);

  return ready;
}
