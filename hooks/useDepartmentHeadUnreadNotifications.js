import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "../lib/supabase";

let cachedDepartmentHeadId = null;
let cachedUnreadCount = 0;
let cachedLoading = true;

let globalChannel = null;
let globalChannelDepartmentHeadId = null;
let globalIsSettingUp = false;
let refreshTimer = null;

const globalListeners = new Set();

function notifyListeners() {
  globalListeners.forEach((listener) => {
    listener({
      departmentHeadId: cachedDepartmentHeadId,
      unreadCount: cachedUnreadCount,
      loading: cachedLoading,
    });
  });
}

function setGlobalState(nextState = {}) {
  if (Object.prototype.hasOwnProperty.call(nextState, "departmentHeadId")) {
    cachedDepartmentHeadId = nextState.departmentHeadId;
  }

  if (Object.prototype.hasOwnProperty.call(nextState, "unreadCount")) {
    cachedUnreadCount = nextState.unreadCount;
  }

  if (Object.prototype.hasOwnProperty.call(nextState, "loading")) {
    cachedLoading = nextState.loading;
  }

  notifyListeners();
}

async function getCurrentDepartmentHeadId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    return null;
  }

  return user.id;
}

async function fetchUnreadCount(departmentHeadId) {
  if (!departmentHeadId) return 0;

  const { count, error } = await supabase
    .from("moderator_notifications")
    .select("*", { count: "exact", head: true })
    .eq("moderator_id", departmentHeadId)
    .eq("is_read", false);

  if (error) {
    console.log("Department head unread count error:", error);
    return cachedUnreadCount || 0;
  }

  return count || 0;
}

async function refreshUnreadCount(departmentHeadId = cachedDepartmentHeadId) {
  try {
    let targetDepartmentHeadId = departmentHeadId;

    if (!targetDepartmentHeadId) {
      targetDepartmentHeadId = await getCurrentDepartmentHeadId();
    }

    if (!targetDepartmentHeadId) {
      setGlobalState({
        departmentHeadId: null,
        unreadCount: 0,
        loading: false,
      });

      return 0;
    }

    const nextCount = await fetchUnreadCount(targetDepartmentHeadId);

    setGlobalState({
      departmentHeadId: targetDepartmentHeadId,
      unreadCount: nextCount,
      loading: false,
    });

    return nextCount;
  } catch (error) {
    console.log("Refresh department head unread count error:", error);

    setGlobalState({
      loading: false,
    });

    return cachedUnreadCount || 0;
  }
}

function scheduleUnreadRefresh(departmentHeadId) {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  refreshTimer = setTimeout(() => {
    refreshUnreadCount(departmentHeadId);
  }, 180);
}

async function removeGlobalChannel() {
  if (globalChannel) {
    try {
      await supabase.removeChannel(globalChannel);
    } catch (error) {
      console.log("Remove department head unread channel error:", error);
    }
  }

  globalChannel = null;
  globalChannelDepartmentHeadId = null;
}

async function setupGlobalDepartmentHeadUnreadChannel() {
  if (globalIsSettingUp) return;

  globalIsSettingUp = true;

  try {
    const departmentHeadId = await getCurrentDepartmentHeadId();

    if (!departmentHeadId) {
      await removeGlobalChannel();

      setGlobalState({
        departmentHeadId: null,
        unreadCount: 0,
        loading: false,
      });

      return;
    }

    setGlobalState({
      departmentHeadId,
      loading: false,
    });

    await refreshUnreadCount(departmentHeadId);

    if (globalChannel && globalChannelDepartmentHeadId === departmentHeadId) {
      return;
    }

    await removeGlobalChannel();

    const channelName = `department-head-unread-count-${departmentHeadId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "moderator_notifications",
          filter: `moderator_id=eq.${departmentHeadId}`,
        },
        () => {
          scheduleUnreadRefresh(departmentHeadId);
        }
      )
      .subscribe((status, error) => {
        console.log("Department head unread badge realtime status:", status);

        if (error) {
          console.log("Department head unread badge realtime error:", error);
        }
      });

    globalChannel = channel;
    globalChannelDepartmentHeadId = departmentHeadId;
  } catch (error) {
    console.log("Setup department head unread channel error:", error);
  } finally {
    globalIsSettingUp = false;
  }
}

export default function useDepartmentHeadUnreadNotifications() {
  const mountedRef = useRef(true);

  const [state, setState] = useState({
    departmentHeadId: cachedDepartmentHeadId,
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
      departmentHeadId: cachedDepartmentHeadId,
      unreadCount: cachedUnreadCount,
      loading: cachedLoading,
    });

    setupGlobalDepartmentHeadUnreadChannel();

    return () => {
      mountedRef.current = false;
      globalListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        setupGlobalDepartmentHeadUnreadChannel();
        refreshUnreadCount(cachedDepartmentHeadId);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const reloadUnreadNotificationCount = useCallback(async () => {
    return refreshUnreadCount(cachedDepartmentHeadId);
  }, []);

  const resetUnreadNotificationCount = useCallback(() => {
    setGlobalState({
      unreadCount: 0,
      loading: false,
    });
  }, []);

  return {
    departmentHeadId: state.departmentHeadId,
    unreadNotificationCount: state.unreadCount,
    loadingUnreadNotifications: state.loading,
    reloadUnreadNotificationCount,
    resetUnreadNotificationCount,
  };
}
