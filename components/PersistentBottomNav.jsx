import { Ionicons } from "@expo/vector-icons";
import {
  Poppins_500Medium,
  Poppins_600SemiBold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const GREEN = "#087A0D";
const WHITE = "#FFFFFF";
const TEXT = "#171717";
const BORDER = "#E2E7E0";
const RED = "#D71920";

const ROLE_TABS = {
  citizen: [
    {
      label: "Home",
      activeIcon: "home",
      inactiveIcon: "home-outline",
      route: "/citizen/dashboard",
      activePath: "citizen/dashboard",
      flex: 0.9,
    },
    {
      label: "Submit",
      activeIcon: "add-circle",
      inactiveIcon: "add-circle-outline",
      route: "/citizen/submit",
      activePath: "citizen/submit",
      flex: 0.9,
    },
    {
      label: "My Complaints",
      activeIcon: "document-text",
      inactiveIcon: "document-text-outline",
      route: "/citizen/complaints",
      activePath: "citizen/complaints",
      flex: 1.45,
    },
    {
      label: "Profile",
      activeIcon: "person",
      inactiveIcon: "person-outline",
      route: "/citizen/profile",
      activePath: "citizen/profile",
      flex: 0.9,
    },
  ],
  admin: [
    {
      label: "Home",
      activeIcon: "home",
      inactiveIcon: "home-outline",
      route: "/admin/dashboard",
      activePath: "admin/dashboard",
      flex: 0.82,
    },
    {
      label: "Complaints",
      activeIcon: "document-text",
      inactiveIcon: "document-text-outline",
      route: "/admin/complaints",
      activePath: "admin/complaints",
      flex: 1.1,
    },
    {
      label: "Analytics",
      activeIcon: "analytics",
      inactiveIcon: "analytics-outline",
      route: "/admin/analytics",
      activePath: "admin/analytics",
      flex: 1,
    },
    {
      label: "Notifications",
      activeIcon: "notifications",
      inactiveIcon: "notifications-outline",
      route: "/admin/notification",
      activePath: "admin/notification",
      flex: 1.15,
      showBadge: true,
    },
    {
      label: "Profile",
      activeIcon: "person",
      inactiveIcon: "person-outline",
      route: "/admin/profile",
      activePath: "admin/profile",
      flex: 0.82,
    },
  ],
  departmentHead: [
    {
      label: "Home",
      activeIcon: "home",
      inactiveIcon: "home-outline",
      route: "/departmentHead/dashboard",
      activePath: "departmentHead/dashboard",
      flex: 0.82,
    },
    {
      label: "Assigned Complaints",
      activeIcon: "document-text",
      inactiveIcon: "document-text-outline",
      route: "/departmentHead/assignedComplaints",
      activePath: "departmentHead/assignedComplaints",
      flex: 1.55,
    },
    {
      label: "Notifications",
      activeIcon: "notifications",
      inactiveIcon: "notifications-outline",
      route: "/departmentHead/notification",
      activePath: "departmentHead/notification",
      flex: 1.15,
      showBadge: true,
    },
    {
      label: "Profile",
      activeIcon: "person",
      inactiveIcon: "person-outline",
      route: "/departmentHead/profile",
      activePath: "departmentHead/profile",
      flex: 0.82,
    },
  ],
};

const HIDDEN_PATH_SNIPPETS = [
  "editComplaintLocation",
  "manageUsers",
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
  const navigationLockRef = useRef(false);
  const unlockTimerRef = useRef(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const [fontsLoaded] = useFonts({
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

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
    keyboardVisible ||
    HIDDEN_PATH_SNIPPETS.some((snippet) => pathname?.includes(snippet));

  if (shouldHide) {
    return null;
  }

  const tabs = ROLE_TABS[role] || ROLE_TABS.citizen;

  return (
    <View style={styles.bottomNav} pointerEvents="box-none">
      <View style={styles.bottomNavInner}>
        {tabs.map((tab) => {
          const isActive = isTabActive(pathname, tab, role);
          const showBadge =
            tab.showBadge && Number(unreadNotificationCount) > 0;

          return (
            <TouchableOpacity
              key={tab.label}
              style={[styles.navItem, { flex: tab.flex }]}
              activeOpacity={0.7}
              onPress={() => navigateToTab(tab.route, isActive)}
            >
              <View style={styles.navIconWrap}>
                <Ionicons
                  name={isActive ? tab.activeIcon : tab.inactiveIcon}
                  size={role === "citizen" ? 26 : 25}
                  color={isActive ? GREEN : TEXT}
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
                    color: isActive ? GREEN : TEXT,
                    fontFamily: fontsLoaded
                      ? isActive
                        ? "Poppins_600SemiBold"
                        : "Poppins_500Medium"
                      : undefined,
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Platform.OS === "ios" ? -38 : -32,
    height: Platform.OS === "ios" ? 108 : 100,
    zIndex: 50,
    elevation: 12,
  },

  bottomNavInner: {
    flex: 1,
    backgroundColor: WHITE,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 },
    elevation: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: 12,
    paddingHorizontal: 6,
    paddingBottom: Platform.OS === "ios" ? 38 : 32,
  },

  navItem: {
    height: 58,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 2,
  },

  navIconWrap: {
    position: "relative",
    width: 30,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },

  navLabel: {
    fontSize: 9.4,
    marginTop: 2,
    textAlign: "center",
    width: "100%",
    includeFontPadding: false,
  },

  notificationNavBadge: {
    position: "absolute",
    top: -5,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },

  notificationNavBadgeText: {
    color: WHITE,
    fontSize: 9,
    fontFamily: "Poppins_600SemiBold",
    includeFontPadding: false,
  },
});
