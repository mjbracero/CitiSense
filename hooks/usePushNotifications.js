import { useEffect, useRef } from "react";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import {
  getNotificationRouteFromResponse,
  registerPushTokenForCurrentUser,
  removeNotificationListeners,
  setupNotificationListeners,
} from "../lib/pushNotifications";

export default function usePushNotifications() {
  const listenersRef = useRef(null);

  useEffect(() => {
    listenersRef.current = setupNotificationListeners({
      onNotificationResponse: (response) => {
        const route = getNotificationRouteFromResponse(response);

        if (route) {
          router.push(route);
        }
      },
    });

    const registerForSession = async (userId) => {
      if (!userId) {
        return;
      }

      await registerPushTokenForCurrentUser();
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      registerForSession(session?.user?.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      registerForSession(session?.user?.id);
    });

    return () => {
      subscription.unsubscribe();
      removeNotificationListeners(listenersRef.current);
      listenersRef.current = null;
    };
  }, []);
}
