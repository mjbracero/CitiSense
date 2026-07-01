import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "../lib/supabase";

let cachedAdminId = null;
let cachedUnreadCount = 0;
let cachedLoading = true;
let globalChannel = null;
let globalIsSettingUp = false;
const globalListeners = new Set();

function notifyGlobalListeners() {
  globalListeners.forEach((listener) => {
    listener({
      adminId: cachedAdminId,
      unreadCount: cachedUnreadCount,
      loading: cachedLoading,
    });
  });
}

function setGlobalState(nextState = {}) {
  if (Object.prototype.hasOwnProperty.call(nextState, "adminId")) {
    cachedAdminId = nextState.adminId;
  }

  if (Object.prototype.hasOwnProperty.call(nextState, "unreadCount")) {
    cachedUnreadCount = nextState.unreadCount;
  }

  if (Object.prototype.hasOwnProperty.call(nextState, "loading")) {
    cachedLoading = nextState.loading;
  }

  notifyGlobalListeners();
}

async function fetchUnreadCount(adminId) {
  if (!adminId) return 0;

  const { count, error } = await supabase
    .from("admin_notifications")
    .select("*", { count: "exact", head: true })
    .eq("admin_id", adminId)
    .eq("is_read", false);

  if (error) {
    console.log("Admin unread count error:", error);
    return cachedUnreadCount || 0;
  }

  return count || 0;
}

async function resolveCurrentAdminId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    return null;
  }

  return user.id;
}

async function refreshUnreadCount(adminId = cachedAdminId) {
  try {
    let targetAdminId = adminId;

    if (!targetAdminId) {
      targetAdminId = await resolveCurrentAdminId();
    }

    if (!targetAdminId) {
      setGlobalState({
        adminId: null,
        unreadCount: 0,
        loading: false,
      });
      return 0;
    }

    setGlobalState({
      adminId: targetAdminId,
    });

    const nextCount = await fetchUnreadCount(targetAdminId);

    setGlobalState({
      unreadCount: nextCount,
      loading: false,
    });

    return nextCount;
  } catch (error) {
    console.log("Refresh admin unread count error:", error);

    setGlobalState({
      loading: false,
    });

    return cachedUnreadCount || 0;
  }
}

async function setupGlobalAdminNotificationChannel() {
  if (globalIsSettingUp) return;

  globalIsSettingUp = true;

  try {
    const adminId = await resolveCurrentAdminId();

    if (!adminId) {
      setGlobalState({
        adminId: null,
        unreadCount: 0,
        loading: false,
      });
      return;
    }

    if (cachedAdminId !== adminId) {
      cachedAdminId = adminId;
      cachedUnreadCount = 0;
      cachedLoading = true;

      if (globalChannel) {
        await supabase.removeChannel(globalChannel);
        globalChannel = null;
      }

      notifyGlobalListeners();
    }

    await refreshUnreadCount(adminId);

    if (globalChannel) return;

    globalChannel = supabase
      .channel(`admin-unread-notifications-${adminId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "admin_notifications",
          filter: `admin_id=eq.${adminId}`,
        },
        () => {
          refreshUnreadCount(adminId);
        }
      )
      .subscribe((status) => {
        console.log("Admin unread badge realtime status:", status);
      });
  } catch (error) {
    console.log("Setup admin unread notification channel error:", error);
  } finally {
    globalIsSettingUp = false;
  }
}

export default function useAdminUnreadNotifications() {
  const mountedRef = useRef(true);

  const [state, setState] = useState({
    adminId: cachedAdminId,
    unreadCount: cachedUnreadCount,
    loading: cachedLoading,
  });

  useEffect(() => {
    mountedRef.current = true;

    const listener = (nextState) => {
      if (!mountedRef.current) return;
      setState(nextState);
    };

    globalListeners.add(listener);

    setState({
      adminId: cachedAdminId,
      unreadCount: cachedUnreadCount,
      loading: cachedLoading,
    });

    setupGlobalAdminNotificationChannel();

    return () => {
      mountedRef.current = false;
      globalListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        setupGlobalAdminNotificationChannel();
        refreshUnreadCount(cachedAdminId);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const reloadUnreadNotificationCount = useCallback(async () => {
    return refreshUnreadCount(cachedAdminId);
  }, []);

  const resetUnreadNotificationCount = useCallback(() => {
    setGlobalState({
      unreadCount: 0,
      loading: false,
    });
  }, []);

  return {
    adminId: state.adminId,
    unreadNotificationCount: state.unreadCount,
    loadingUnreadNotifications: state.loading,
    reloadUnreadNotificationCount,
    resetUnreadNotificationCount,
  };
}