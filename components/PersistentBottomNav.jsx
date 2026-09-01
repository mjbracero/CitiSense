import { Ionicons } from "@expo/vector-icons";
import {
  Poppins_500Medium,
  Poppins_600SemiBold,
  useFonts,
} from "@expo-google-fonts/poppins";
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
import { getAndroidBlurFallbackColor } from "../lib/platformUi";

const GREEN = "#087A0D";
const WHITE = "#FFFFFF";
const RED = "#D71920";

/** Scroll/list padding so content clears the floating glass tab bar + fade. */
export const BOTTOM_NAV_CONTENT_INSET = 148;

/**
 * Absolute bottom clearance for floating CTAs above the glass pill
 * (safe-area floor + dock pad + pill height + gap). Safe-area is applied by callers.
 */
export const BOTTOM_NAV_PILL_HEIGHT = 66;
export const BOTTOM_NAV_DOCK_PAD = 8;
export const BOTTOM_NAV_ABOVE_GAP = 14;

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

const ROLE_TABS = {
  citizen: [
    {
      label: "Home",
      activeIcon: "home",
      inactiveIcon: "home-outline",
      route: "/citizen/dashboard",
      activePath: "citizen/dashboard",
    },
    {
      label: "Submit",
      activeIcon: "add-circle",
      inactiveIcon: "add-circle-outline",
      route: "/citizen/submit",
      activePath: "citizen/submit",
    },
    {
      label: "My Complaints",
      activeIcon: "document-text",
      inactiveIcon: "document-text-outline",
      route: "/citizen/complaints",
      activePath: "citizen/complaints",
    },
    {
      label: "Profile",
      activeIcon: "person",
      inactiveIcon: "person-outline",
      route: "/citizen/profile",
      activePath: "citizen/profile",
    },
  ],
  admin: [
    {
      label: "Home",
      activeIcon: "home",
      inactiveIcon: "home-outline",
      route: "/admin/dashboard",
      activePath: "admin/dashboard",
    },
    {
      label: "Complaints",
      activeIcon: "document-text",
      inactiveIcon: "document-text-outline",
      route: "/admin/complaints",
      activePath: "admin/complaints",
    },
    {
      label: "Analytics",
      activeIcon: "analytics",
      inactiveIcon: "analytics-outline",
      route: "/admin/analytics",
      activePath: "admin/analytics",
    },
    {
      label: "Notifications",
      activeIcon: "notifications",
      inactiveIcon: "notifications-outline",
      route: "/admin/notification",
      activePath: "admin/notification",
      showBadge: true,
    },
    {
      label: "Profile",
      activeIcon: "person",
      inactiveIcon: "person-outline",
      route: "/admin/profile",
      activePath: "admin/profile",
    },
  ],
  departmentHead: [
    {
      label: "Home",
      activeIcon: "home",
      inactiveIcon: "home-outline",
      route: "/departmentHead/dashboard",
      activePath: "departmentHead/dashboard",
    },
    {
      label: "Assigned",
      activeIcon: "document-text",
      inactiveIcon: "document-text-outline",
      route: "/departmentHead/assignedComplaints",
      activePath: "departmentHead/assignedComplaints",
    },
    {
      label: "Notifications",
      activeIcon: "notifications",
      inactiveIcon: "notifications-outline",
      route: "/departmentHead/notification",
      activePath: "departmentHead/notification",
      showBadge: true,
    },
    {
      label: "Profile",
      activeIcon: "person",
      inactiveIcon: "person-outline",
      route: "/departmentHead/profile",
      activePath: "departmentHead/profile",
    },
  ],
};

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

export default function PersistentBottomNav({
  role = "citizen",
  unreadNotificationCount = 0,
}) {
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

  const forceHidden = useSyncExternalStore(
    subscribeBottomNavHide,
    getBottomNavForceHidden,
    getBottomNavForceHidden
  );

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

  const navigateToTab = useCallback(
    (route, isActive) => {
      if (isActive || navigationLockRef.current) {
        return;
      }

      navigationLockRef.current = true;
      Keyboard.dismiss();

      requestAnimationFrame(() => {
        router.replace(route);
      });

      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current);
      }

      unlockTimerRef.current = setTimeout(() => {
        navigationLockRef.current = false;
      }, 400);
    },
    [router]
  );

  const shouldHide =
    forceHidden ||
    keyboardVisible ||
    HIDDEN_PATH_SNIPPETS.some((snippet) => pathname?.includes(snippet));

  if (shouldHide) {
    return null;
  }

  const tabs = ROLE_TABS[role] || ROLE_TABS.citizen;
  const bottomPad = Math.max(insets.bottom, 10) + BOTTOM_NAV_DOCK_PAD;

  return (
    <View style={styles.dock} pointerEvents="box-none">
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

      <View
        style={[styles.pillRow, { paddingBottom: bottomPad }]}
        pointerEvents="box-none"
      >
        {/* Outer shell keeps soft iOS-style shadow (not clipped) */}
        <View style={styles.pillShadow}>
          <View style={styles.pillClip}>
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                Platform.OS === "android" && styles.androidBlurFallback,
              ]}
            />

            <BlurView
              intensity={Platform.OS === "ios" ? 100 : 85}
              tint={
                Platform.OS === "ios" ? "systemMaterialLight" : "light"
              }
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

            <View style={styles.pillInner}>
              {tabs.map((tab) => {
                const isActive = isTabActive(pathname, tab, role);
                const showBadge =
                  tab.showBadge && Number(unreadNotificationCount) > 0;

                return (
                  <Pressable
                    key={tab.label}
                    style={styles.navItem}
                    android_ripple={{ color: "transparent" }}
                    onPress={() => navigateToTab(tab.route, isActive)}
                  >
                    <View style={styles.navIconBubble}>
                      <Ionicons
                        name={isActive ? tab.activeIcon : tab.inactiveIcon}
                        size={23}
                        color={isActive ? GREEN : "#3A403A"}
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
                          color: isActive ? GREEN : "#5A615A",
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

const styles = StyleSheet.create({
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

  pillRow: {
    paddingHorizontal: 18,
    paddingTop: 6,
  },

  pillShadow: {
    borderRadius: 36,
    backgroundColor: "transparent",
    shadowColor: "#000000",
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

  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
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
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.95)",
  },

  notificationNavBadgeText: {
    color: WHITE,
    fontSize: 8.5,
    fontFamily: "Poppins_600SemiBold",
    includeFontPadding: false,
  },
});
