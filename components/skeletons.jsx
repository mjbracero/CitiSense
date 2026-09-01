import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Skeleton from "./Skeleton";

const WHITE = "#FFFFFF";
const BG = "#F7FAF6";
const BORDER = "#E2E7E0";

export function ComplaintCardSkeleton() {
  return (
    <View style={styles.complaintCard}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Skeleton width="78%" height={15} borderRadius={7} />
          <Skeleton width="92%" height={11} borderRadius={6} style={styles.mt8} />
        </View>
        <Skeleton width={72} height={22} borderRadius={11} />
      </View>
      <Skeleton width="64%" height={11} borderRadius={6} style={styles.mt10} />
      <View style={styles.row}>
        <Skeleton width={88} height={11} borderRadius={6} />
        <Skeleton width={70} height={22} borderRadius={11} />
      </View>
    </View>
  );
}

export function ComplaintListSkeleton({ count = 4 }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <ComplaintCardSkeleton key={index} />
      ))}
    </View>
  );
}

export function NotificationCardSkeleton() {
  return (
    <View style={styles.notificationCard}>
      <Skeleton width={46} height={46} borderRadius={23} />
      <View style={styles.notificationBody}>
        <View style={styles.row}>
          <Skeleton width="70%" height={14} borderRadius={7} />
          <Skeleton width={8} height={8} borderRadius={4} />
        </View>
        <Skeleton width="94%" height={11} borderRadius={6} style={styles.mt8} />
        <Skeleton width="58%" height={11} borderRadius={6} style={styles.mt8} />
        <View style={[styles.row, styles.mt10]}>
          <Skeleton width={72} height={20} borderRadius={10} />
          <Skeleton width={90} height={11} borderRadius={6} />
        </View>
      </View>
    </View>
  );
}

export function NotificationListSkeleton({ count = 5 }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <NotificationCardSkeleton key={index} />
      ))}
    </View>
  );
}

export function UserCardSkeleton() {
  return (
    <View style={styles.userCard}>
      <View style={styles.row}>
        <Skeleton width={54} height={54} borderRadius={27} />
        <View style={[styles.flex, styles.ml12]}>
          <Skeleton width="72%" height={15} borderRadius={7} />
          <Skeleton width="88%" height={12} borderRadius={6} style={styles.mt8} />
        </View>
        <Skeleton width={76} height={27} borderRadius={14} />
      </View>
      <View style={styles.detailsBox}>
        <Skeleton width="62%" height={12} borderRadius={6} />
        <Skeleton width="78%" height={12} borderRadius={6} />
        <Skeleton width="54%" height={12} borderRadius={6} />
      </View>
      <View style={styles.actionRow}>
        <Skeleton height={42} borderRadius={21} style={styles.flex} />
        <Skeleton height={42} borderRadius={21} style={styles.flex} />
      </View>
      <Skeleton height={42} borderRadius={21} style={styles.mt8} />
    </View>
  );
}

export function UserListSkeleton({ count = 4 }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <UserCardSkeleton key={index} />
      ))}
    </View>
  );
}

export function DashboardStatsSkeleton() {
  return (
    <View style={styles.statsRow}>
      {Array.from({ length: 4 }).map((_, index) => (
        <View key={index} style={styles.statCard}>
          <Skeleton width={38} height={38} borderRadius={19} />
          <Skeleton width="80%" height={10} borderRadius={5} style={styles.mt10} />
          <Skeleton width={36} height={18} borderRadius={6} style={styles.mt8} />
        </View>
      ))}
    </View>
  );
}

export function DashboardHomeSkeleton() {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.pagePad}
    >
      <Skeleton width={120} height={12} borderRadius={6} />
      <Skeleton width={180} height={26} borderRadius={8} style={styles.mt8} />
      <Skeleton width={140} height={12} borderRadius={6} style={styles.mt8} />
      <Skeleton width={110} height={18} borderRadius={7} style={styles.sectionGap} />
      <DashboardStatsSkeleton />
      <Skeleton width={150} height={18} borderRadius={7} style={styles.sectionGap} />
      <ComplaintListSkeleton count={3} />
    </ScrollView>
  );
}

export function ProfileScreenSkeleton() {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.pagePad}
    >
      <View style={styles.profileHero}>
        <Skeleton width={86} height={86} borderRadius={43} />
        <View style={[styles.flex, styles.ml12]}>
          <Skeleton width="70%" height={18} borderRadius={7} />
          <Skeleton width="46%" height={12} borderRadius={6} style={styles.mt8} />
          <Skeleton width="82%" height={12} borderRadius={6} style={styles.mt8} />
        </View>
      </View>
      <Skeleton width={140} height={14} borderRadius={6} style={styles.sectionGap} />
      <View style={styles.infoCard}>
        <Skeleton width="88%" height={14} borderRadius={6} />
        <Skeleton width="74%" height={14} borderRadius={6} />
        <Skeleton width="66%" height={14} borderRadius={6} />
      </View>
      <Skeleton width={120} height={14} borderRadius={6} style={styles.sectionGap} />
      <View style={styles.infoCard}>
        <Skeleton width="80%" height={14} borderRadius={6} />
        <Skeleton width="70%" height={14} borderRadius={6} />
      </View>
    </ScrollView>
  );
}

export function AnalyticsReportSkeleton({ hideIntro = false }) {
  const Wrapper = hideIntro ? View : ScrollView;
  const wrapperProps = hideIntro
    ? { style: styles.compactPad }
    : {
        showsVerticalScrollIndicator: false,
        contentContainerStyle: styles.pagePad,
      };

  return (
    <Wrapper {...wrapperProps}>
      {hideIntro ? null : (
        <>
          <Skeleton width={150} height={24} borderRadius={8} />
          <Skeleton width="90%" height={12} borderRadius={6} style={styles.mt8} />
        </>
      )}
      <View style={styles.reportCard}>
        <Skeleton width="55%" height={16} borderRadius={7} />
        <View style={styles.insightRow}>
          <Skeleton height={72} borderRadius={14} style={styles.flex} />
          <Skeleton height={72} borderRadius={14} style={styles.flex} />
        </View>
        <Skeleton height={160} borderRadius={16} style={styles.mt12} />
      </View>
      <View style={styles.reportCard}>
        <Skeleton width="48%" height={16} borderRadius={7} />
        <Skeleton height={140} borderRadius={16} style={styles.mt12} />
      </View>
    </Wrapper>
  );
}

export function AuditLogListSkeleton({ count = 8 }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.auditRow}>
          <Skeleton width={36} height={36} borderRadius={18} />
          <View style={[styles.flex, styles.ml12]}>
            <Skeleton width="72%" height={13} borderRadius={6} />
            <Skeleton width="90%" height={11} borderRadius={6} style={styles.mt8} />
            <Skeleton width={110} height={10} borderRadius={5} style={styles.mt8} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function AnalysisResultSkeleton() {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.pagePad}
    >
      <View style={styles.stepRow}>
        <Skeleton width={28} height={28} borderRadius={14} />
        <Skeleton height={3} style={styles.flex} />
        <Skeleton width={28} height={28} borderRadius={14} />
        <Skeleton height={3} style={styles.flex} />
        <Skeleton width={28} height={28} borderRadius={14} />
      </View>
      <View style={styles.reportCard}>
        <Skeleton width={140} height={16} borderRadius={7} />
        <View style={[styles.row, styles.mt12]}>
          <Skeleton width={72} height={72} borderRadius={14} />
          <View style={[styles.flex, styles.ml12]}>
            <Skeleton width="80%" height={14} borderRadius={6} />
            <Skeleton width="94%" height={11} borderRadius={6} style={styles.mt8} />
            <Skeleton width="70%" height={11} borderRadius={6} style={styles.mt8} />
          </View>
        </View>
      </View>
      <View style={styles.reportCard}>
        <Skeleton width="60%" height={16} borderRadius={7} />
        <Skeleton height={18} borderRadius={9} style={styles.mt12} />
        <Skeleton height={18} borderRadius={9} style={styles.mt8} />
      </View>
    </ScrollView>
  );
}

export function MapBlockSkeleton({ style }) {
  return (
    <View style={[styles.mapBlock, style]}>
      <Skeleton borderRadius={0} style={styles.fill} />
    </View>
  );
}

export function SubmitScreenSkeleton() {
  return (
    <View style={styles.submitWrap}>
      <View style={styles.pagePad}>
        <Skeleton width={180} height={22} borderRadius={8} />
        <Skeleton width="70%" height={12} borderRadius={6} style={styles.mt8} />
      </View>
      <View style={styles.chatPad}>
        <Skeleton width="68%" height={54} borderRadius={16} />
        <Skeleton
          width="74%"
          height={64}
          borderRadius={16}
          style={styles.chatRight}
        />
        <Skeleton width="60%" height={48} borderRadius={16} />
      </View>
      <View style={styles.composerBar}>
        <Skeleton height={44} borderRadius={22} style={styles.flex} />
        <Skeleton width={44} height={44} borderRadius={22} />
      </View>
    </View>
  );
}

export function AuthFormSkeleton() {
  return (
    <View style={styles.authWrap}>
      <Skeleton width={120} height={72} borderRadius={16} />
      <Skeleton width={180} height={18} borderRadius={7} style={styles.mt16} />
      <Skeleton height={48} borderRadius={14} style={styles.mt20} />
      <Skeleton height={48} borderRadius={14} style={styles.mt12} />
      <Skeleton height={48} borderRadius={24} style={styles.mt20} />
    </View>
  );
}

export function PageSkeleton({ variant = "list" }) {
  const content =
    variant === "dashboard" ? (
      <DashboardHomeSkeleton />
    ) : variant === "profile" ? (
      <ProfileScreenSkeleton />
    ) : variant === "analytics" ? (
      <AnalyticsReportSkeleton />
    ) : variant === "analysis" ? (
      <AnalysisResultSkeleton />
    ) : variant === "submit" ? (
      <SubmitScreenSkeleton />
    ) : variant === "auth" ? (
      <AuthFormSkeleton />
    ) : variant === "notifications" ? (
      <View style={styles.pagePad}>
        <Skeleton width={160} height={22} borderRadius={8} />
        <Skeleton width={120} height={12} borderRadius={6} style={styles.mt8} />
        <View style={styles.mt16}>
          <NotificationListSkeleton count={5} />
        </View>
      </View>
    ) : variant === "users" ? (
      <View style={styles.pagePad}>
        <Skeleton width={170} height={22} borderRadius={8} />
        <Skeleton height={48} borderRadius={16} style={styles.mt16} />
        <View style={styles.mt16}>
          <UserListSkeleton count={4} />
        </View>
      </View>
    ) : variant === "map" ? (
      <View style={styles.flex}>
        <View style={styles.pagePad}>
          <Skeleton width={160} height={22} borderRadius={8} />
        </View>
        <MapBlockSkeleton style={styles.flex} />
      </View>
    ) : (
      <View style={styles.pagePad}>
        <Skeleton width={170} height={22} borderRadius={8} />
        <Skeleton width="80%" height={12} borderRadius={6} style={styles.mt8} />
        <View style={styles.filterRow}>
          <Skeleton height={34} borderRadius={17} style={styles.flex} />
          <Skeleton height={34} borderRadius={17} style={styles.flex} />
        </View>
        <ComplaintListSkeleton count={4} />
      </View>
    );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: WHITE,
  },
  flex: {
    flex: 1,
  },
  fill: {
    flex: 1,
    width: "100%",
    minHeight: 220,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  mt8: { marginTop: 8 },
  mt10: { marginTop: 10 },
  mt12: { marginTop: 12 },
  mt16: { marginTop: 16 },
  mt20: { marginTop: 20 },
  ml12: { marginLeft: 12 },
  sectionGap: {
    marginTop: 22,
    marginBottom: 12,
  },
  pagePad: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  compactPad: {
    paddingBottom: 24,
  },
  complaintCard: {
    borderRadius: 18,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 12,
  },
  notificationCard: {
    flexDirection: "row",
    borderRadius: 18,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 12,
  },
  notificationBody: {
    flex: 1,
    marginLeft: 12,
  },
  userCard: {
    borderRadius: 18,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 12,
  },
  detailsBox: {
    borderRadius: 14,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: "#EDF1EC",
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
  },
  profileHero: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
  },
  infoCard: {
    borderRadius: 16,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 12,
  },
  reportCard: {
    borderRadius: 18,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginTop: 16,
  },
  insightRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  auditRow: {
    flexDirection: "row",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 18,
  },
  mapBlock: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: BG,
  },
  submitWrap: {
    flex: 1,
    backgroundColor: WHITE,
  },
  chatPad: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  chatRight: {
    alignSelf: "flex-end",
  },
  composerBar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  authWrap: {
    flex: 1,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    marginBottom: 16,
  },
});
