import {
  Poppins_500Medium,
  Poppins_600SemiBold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { usePathname, useRouter } from "expo-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isRouteInRole, saveLastRoute } from "../lib/navigationPersistence";
import { getAndroidBlurFallbackColor } from "../lib/platformUi";
import { supabase } from "../lib/supabase";

/** Scroll/list padding so content clears the floating glass tab bar + fade. */
export const BOTTOM_NAV_CONTENT_INSET = 148;

/**
 * Absolute bottom clearance for floating CTAs above the glass pill
 * (safe-area floor + dock pad + pill height + gap). Safe-area is applied by callers.
 */
export const BOTTOM_NAV_PILL_HEIGHT = 66;
export const BOTTOM_NAV_DOCK_PAD = 8;
export const BOTTOM_NAV_ABOVE_GAP = 14;

// ===== [BOTTOM NAV] Global hide store + useHideBottomNav hook =====
let bottomNavHideCount = 0;
const bottomNavHideListeners = new Set();

function emitBottomNavHide() {
  bottomNavHideListeners.forEach((listener) => listener());
}

function subscribeBottomNavHide(listener) {
  bottomNavHideListeners.add(listener);
  return () => bottomNavHideListeners.delete(listener);
}

function getBottomNavForceHidden() {
  return bottomNavHideCount > 0;
}

/** Hide the persistent tab bar while overlays / sheets with bottom CTAs are open. */
export function useHideBottomNav(hidden) {
  useEffect(() => {
    if (!hidden) return undefined;

    bottomNavHideCount += 1;
    emitBottomNavHide();

    return () => {
      bottomNavHideCount = Math.max(0, bottomNavHideCount - 1);
      emitBottomNavHide();
    };
  }, [hidden]);
}

// ===== [BOTTOM NAV] Tab config — one block per tab =====
// `enabled: false`  -> tab is removed from the bottom bar.
// `disabled: true`  -> tab stays visible but is greyed out and can't be tapped.
// `onPress`         -> runs when the tab is tapped; call goToTab() to open its route.

// --- [BOTTOM NAV] Citizen tabs ---
const CITIZEN_HOME_TAB = {
  enabled: true,
  disabled: false,
  onPress: (goToTab) => goToTab(),
  label: "Home",
  activeIcon: "home",
  inactiveIcon: "home-outline",
  route: "/citizen/dashboard",
  activePath: "citizen/dashboard",
};

const CITIZEN_SUBMIT_TAB = {
  enabled: true,
  disabled: false,
  onPress: (goToTab) => goToTab(),
  label: "Submit",
  activeIcon: "add-circle",
  inactiveIcon: "add-circle-outline",
  route: "/citizen/submit",
  activePath: "citizen/submit",
};

const CITIZEN_COMPLAINTS_TAB = {
  enabled: true,
  disabled: false,
  onPress: (goToTab) => goToTab(),
  label: "My Complaints",
  activeIcon: "document-text",
  inactiveIcon: "document-text-outline",
  route: "/citizen/complaints",
  activePath: "citizen/complaints",
};

const CITIZEN_PROFILE_TAB = {
  enabled: true,
  disabled: false,
  onPress: (goToTab) => goToTab(),
  label: "Profile",
  activeIcon: "person",
  inactiveIcon: "person-outline",
  route: "/citizen/profile",
  activePath: "citizen/profile",
};

// --- [BOTTOM NAV] Admin tabs ---
const ADMIN_HOME_TAB = {
  enabled: true,
  disabled: false,
  onPress: (goToTab) => goToTab(),
  label: "Home",
  activeIcon: "home",
  inactiveIcon: "home-outline",
  route: "/admin/dashboard",
  activePath: "admin/dashboard",
};

const ADMIN_COMPLAINTS_TAB = {
  enabled: true,
  disabled: false,
  onPress: (goToTab) => goToTab(),
  label: "Complaints",
  activeIcon: "document-text",
  inactiveIcon: "document-text-outline",
  route: "/admin/complaints",
  activePath: "admin/complaints",
};

const ADMIN_ANALYTICS_TAB = {
  enabled: true,
  disabled: false,
  onPress: (goToTab) => goToTab(),
  label: "Analytics",
  activeIcon: "analytics",
  inactiveIcon: "analytics-outline",
  route: "/admin/analytics",
  activePath: "admin/analytics",
};

const ADMIN_NOTIFICATIONS_TAB = {
  enabled: true,
  disabled: false,
  onPress: (goToTab) => goToTab(),
  label: "Notifications",
  activeIcon: "notifications",
  inactiveIcon: "notifications-outline",
  route: "/admin/notification",
  activePath: "admin/notification",
  showBadge: true,
};

const ADMIN_PROFILE_TAB = {
  enabled: true,
  disabled: false,
  onPress: (goToTab) => goToTab(),
  label: "Profile",
  activeIcon: "person",
  inactiveIcon: "person-outline",
  route: "/admin/profile",
  activePath: "admin/profile",
};

// --- [BOTTOM NAV] Department head tabs ---
const DEPT_HEAD_HOME_TAB = {
  enabled: true,
  disabled: false,
  onPress: (goToTab) => goToTab(),
  label: "Home",
  activeIcon: "home",
  inactiveIcon: "home-outline",
  route: "/departmentHead/dashboard",
  activePath: "departmentHead/dashboard",
};

const DEPT_HEAD_ASSIGNED_TAB = {
  enabled: true,
  disabled: false,
  onPress: (goToTab) => goToTab(),
  label: "Assigned",
  activeIcon: "document-text",
  inactiveIcon: "document-text-outline",
  route: "/departmentHead/assignedComplaints",
  activePath: "departmentHead/assignedComplaints",
};

const DEPT_HEAD_NOTIFICATIONS_TAB = {
  enabled: true,
  disabled: false,
  onPress: (goToTab) => goToTab(),
  label: "Notifications",
  activeIcon: "notifications",
  inactiveIcon: "notifications-outline",
  route: "/departmentHead/notification",
  activePath: "departmentHead/notification",
  showBadge: true,
};

const DEPT_HEAD_PROFILE_TAB = {
  enabled: true,
  disabled: false,
  onPress: (goToTab) => goToTab(),
  label: "Profile",
  activeIcon: "person",
  inactiveIcon: "person-outline",
  route: "/departmentHead/profile",
  activePath: "departmentHead/profile",
};

// --- [BOTTOM NAV] Tab order per role ---
const ROLE_TABS = {
  citizen: [
    CITIZEN_HOME_TAB,
    CITIZEN_SUBMIT_TAB,
    CITIZEN_COMPLAINTS_TAB,
    CITIZEN_PROFILE_TAB,
  ],
  admin: [
    ADMIN_HOME_TAB,
    ADMIN_COMPLAINTS_TAB,
    ADMIN_ANALYTICS_TAB,
    ADMIN_NOTIFICATIONS_TAB,
    ADMIN_PROFILE_TAB,
  ],
  departmentHead: [
    DEPT_HEAD_HOME_TAB,
    DEPT_HEAD_ASSIGNED_TAB,
    DEPT_HEAD_NOTIFICATIONS_TAB,
    DEPT_HEAD_PROFILE_TAB,
  ],
};

// ===== [BOTTOM NAV] Routes where the nav is hidden =====
const HIDDEN_PATH_SNIPPETS = [
  "login",
  "signup",
  "forgotPassword",
  "resetPassword",
  "aiAnalysisResult",
  "editComplaintLocation",
  "manageUsers",
  "citizen/notification",
  "citizen/submit",
];

// ===== [BOTTOM NAV] Helper: active tab detection =====
function isTabActive(pathname = "", tab, role) {
  if (pathname?.includes(tab.activePath)) {
    return true;
  }

  if (tab.label !== "Home") {
    return false;
  }

  if (pathname === "/") {
    return true;
  }

  if (role === "citizen") {
    return pathname?.includes("citizen/dashboard");
  }

  if (role === "admin") {
    return pathname?.includes("admin/dashboard");
  }

  return pathname?.includes("departmentHead/dashboard");
}

// ===== [BOTTOM NAV] Exported floating glass tab bar =====
export default function PersistentBottomNav({
  role = "citizen",
  unreadNotificationCount = 0,
}) {
  // --- [BOTTOM NAV] State, refs & fonts ---
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const navigationLockRef = useRef(false);
  const unlockTimerRef = useRef(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const [fontsLoaded] = useFonts({
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  // --- [BOTTOM NAV] Subscribe to global hide store ---
  const forceHidden = useSyncExternalStore(
    subscribeBottomNavHide,
    getBottomNavForceHidden,
    getBottomNavForceHidden,
  );

  // --- [BOTTOM NAV] Persist last visited route per role ---
  useEffect(() => {
    if (!pathname || !role || !isRouteInRole(pathname, role)) {
      return;
    }

    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user?.id) return;
      saveLastRoute(session.user.id, role, pathname);
    });

    return () => {
      cancelled = true;
    };
  }, [pathname, role]);

  // --- [BOTTOM NAV] Hide while keyboard is visible ---
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current);
      }
    };
  }, []);

  // --- [BOTTOM NAV] Tab navigation (debounced with lock) ---
  const navigateToTab = useCallback(
    (route, isActive) => {
      if (isActive || navigationLockRef.current) {
        return;
      }

      navigationLockRef.current = true;
      Keyboard.dismiss();

      requestAnimationFrame(() => {
        router.replace(route);
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user?.id) {
            saveLastRoute(session.user.id, role, route);
          }
        });
      });

      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current);
      }

      unlockTimerRef.current = setTimeout(() => {
        navigationLockRef.current = false;
      }, 400);
    },
    [router, role],
  );

  // --- [BOTTOM NAV] Visibility decision ---
  const shouldHide =
    forceHidden ||
    keyboardVisible ||
    HIDDEN_PATH_SNIPPETS.some((snippet) => pathname?.includes(snippet));

  if (shouldHide) {
    return null;
  }

  const tabs = (ROLE_TABS[role] || ROLE_TABS.citizen).filter(
    (tab) => tab.enabled !== false,
  );
  const bottomPad = Math.max(insets.bottom, 10) + BOTTOM_NAV_DOCK_PAD;

  // --- [BOTTOM NAV] Render ---
  return (
    <View style={styles.dock} pointerEvents="box-none">
      {/* [BOTTOM NAV UI] Scroll fade behind the pill */}
      {/* Soft scroll fade — rounded so it matches the glass pill, not a square slab */}
      <View style={styles.scrollFadeClip} pointerEvents="none">
        <LinearGradient
          colors={[
            "rgba(247,250,246,0)",
            "rgba(247,250,246,0.18)",
            "rgba(247,250,246,0.48)",
            "rgba(247,250,246,0.78)",
            "rgba(247,250,246,0.94)",
          ]}
          locations={[0, 0.22, 0.48, 0.74, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* [BOTTOM NAV UI] Glass pill container */}
      <View
        style={[styles.pillRow, { paddingBottom: bottomPad }]}
        pointerEvents="box-none"
      >
        {/* Outer shell keeps soft iOS-style shadow (not clipped) */}
        <View style={styles.pillShadow}>
          <View style={styles.pillClip}>
            {/* [BOTTOM NAV UI] Glass layers: blur, gradient, rim highlights */}
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                Platform.OS === "android" && styles.androidBlurFallback,
              ]}
            />

            <BlurView
              intensity={Platform.OS === "ios" ? 100 : 85}
              tint={Platform.OS === "ios" ? "systemMaterialLight" : "light"}
              experimentalBlurMethod={
                Platform.OS === "android" ? "dimezisBlurView" : undefined
              }
              style={StyleSheet.absoluteFill}
            />
            {Platform.OS === "ios" ? (
              <BlurView
                intensity={40}
                tint="systemUltraThinMaterialLight"
                style={styles.innerBlur}
              />
            ) : null}

            <LinearGradient
              pointerEvents="none"
              colors={[
                "rgba(255,255,255,0.72)",
                "rgba(255,255,255,0.28)",
                "rgba(255,255,255,0.10)",
                "rgba(255,255,255,0.16)",
              ]}
              locations={[0, 0.28, 0.7, 1]}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.glassRim} pointerEvents="none" />
            <View style={styles.glassSpec} pointerEvents="none" />

            {/* [BOTTOM NAV UI] Tab buttons (icon, badge, label) */}
            <View style={styles.pillInner}>
              {tabs.map((tab) => {
                const isActive = isTabActive(pathname, tab, role);
                const showBadge =
                  tab.showBadge && Number(unreadNotificationCount) > 0;

                return (
                  <Pressable
                    key={tab.label}
                    style={[styles.navItem, tab.disabled && styles.navItemDisabled]}
                    android_ripple={{ color: "transparent" }}
                    disabled={tab.disabled}
                    accessibilityState={{ disabled: Boolean(tab.disabled) }}
                    onPress={() => {
                      if (tab.disabled || typeof tab.onPress !== "function") return;
                      tab.onPress(() => navigateToTab(tab.route, isActive));
                    }}
                  >
                    <View style={styles.navIconBubble}>
                      <Ionicons
                        name={isActive ? tab.activeIcon : tab.inactiveIcon}
                        size={23}
                        color={
                          isActive
                            ? "rgba(8, 122, 13, 1)"
                            : "rgba(58, 64, 58, 1)"
                        }
                      />

                      {showBadge ? (
                        <View style={styles.notificationNavBadge}>
                          <Text style={styles.notificationNavBadgeText}>
                            {unreadNotificationCount > 99
                              ? "99+"
                              : unreadNotificationCount}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <Text
                      style={[
                        styles.navLabel,
                        {
                          color: isActive
                            ? "rgba(8, 122, 13, 1)"
                            : "rgba(90, 97, 90, 1)",
                          fontFamily: fontsLoaded
                            ? isActive
                              ? "Poppins_600SemiBold"
                              : "Poppins_500Medium"
                            : undefined,
                        },
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

// ===== [BOTTOM NAV] Styles =====
const styles = StyleSheet.create({
  // --- Dock & fade ---
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    elevation: 20,
    paddingTop: 52,
  },

  scrollFadeClip: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 0,
    bottom: 0,
    borderRadius: 36,
    overflow: "hidden",
  },

  // --- Glass pill ---
  pillRow: {
    paddingHorizontal: 18,
    paddingTop: 6,
  },

  pillShadow: {
    borderRadius: 36,
    backgroundColor: "transparent",
    shadowColor: "rgba(0, 0, 0, 1)",
    shadowOpacity: Platform.OS === "ios" ? 0.18 : 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 20,
  },

  pillClip: {
    borderRadius: 36,
    overflow: "hidden",
    minHeight: 66,
    backgroundColor:
      Platform.OS === "ios"
        ? "rgba(255,255,255,0.04)"
        : getAndroidBlurFallbackColor(0.9),
  },

  androidBlurFallback: {
    backgroundColor: getAndroidBlurFallbackColor(0.94),
  },

  innerBlur: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.55,
  },

  glassRim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 36,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: "rgba(255,255,255,0.78)",
  },

  glassSpec: {
    position: "absolute",
    top: 1,
    left: 18,
    right: 18,
    height: StyleSheet.hairlineWidth * 2,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.95)",
  },

  pillInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 9,
    minHeight: 66,
  },

  // --- Tab items & badge ---
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },

  navItemDisabled: {
    opacity: 0.35,
  },

  navIconBubble: {
    position: "relative",
    width: 46,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },

  navLabel: {
    fontSize: 9.2,
    marginTop: 2,
    textAlign: "center",
    width: "100%",
    includeFontPadding: false,
  },

  notificationNavBadge: {
    position: "absolute",
    top: -3,
    right: -2,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: "rgba(215, 25, 32, 1)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.95)",
  },

  notificationNavBadgeText: {
    color: "rgba(255, 255, 255, 1)",
    fontSize: 8.5,
    fontFamily: "Poppins_600SemiBold",
    includeFontPadding: false,
  },
});
