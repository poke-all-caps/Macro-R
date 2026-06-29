import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useFocusEffect } from "expo-router";
import { AlertTriangle, CheckSquare, Grid3X3, List, Play, PlayCircle, Plus, Square, Users } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccountCard } from "@/components/AccountCard";
import { AccountGridTile } from "@/components/AccountGridTile";
import { useCustomAlert } from "@/components/CustomAlert";
import { EmptyState } from "@/components/EmptyState";
import { StatsBar } from "@/components/StatsBar";
import Colors from "@/constants/colors";
import { Account, useAccounts } from "@/context/AccountsContext";
import { useLicense } from "@/context/LicenseContext";
import { formatTimeRemaining } from "@/utils/time";
import { useSettings } from "@/context/SettingsContext";
import { consumePendingRun } from "@/utils/notifications";

export default function HomeScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { accounts, isRunning, startRun, stopRun, updateAccount, refreshPoints } = useAccounts();
  const { licenseData, featureConfig } = useLicense();
  const { settings, updateSettings } = useSettings();
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const { showAlert, AlertComponent } = useCustomAlert();
  const maxAccounts = licenseData?.maxAccounts ?? featureConfig.maxAccounts;
  const maxSearches = featureConfig.maxSearches;
  const minDelay = featureConfig.minDelaySeconds;
  const dailySetAllowed = featureConfig.dailySetEnabled && settings.dailySetEnabled;

  const msUntilExpiry = licenseData
    ? new Date(licenseData.expiresAt).getTime() - Date.now()
    : null;
  const showExpiryWarning = msUntilExpiry !== null && msUntilExpiry > 0 && msUntilExpiry <= 7 * 24 * 60 * 60 * 1000;
  const lastPointsRefresh = React.useRef(0);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshPoints();
    lastPointsRefresh.current = Date.now();
    setRefreshing(false);
  }, [refreshPoints]);

  // Refresh points on focus if stale (>5 min since last refresh)
  useFocusEffect(
    useCallback(() => {
      const STALE_MS = 5 * 60 * 1000;
      if (!isRunning && Date.now() - lastPointsRefresh.current > STALE_MS) {
        refreshPoints();
        lastPointsRefresh.current = Date.now();
      }
    }, [isRunning, refreshPoints])
  );

  // Auto-start run on cold-start: home screen gains focus after app was launched from a notification tap
  useFocusEffect(
    useCallback(() => {
      let active = true;
      consumePendingRun().then((pending) => {
        const enabled = accounts.filter((a) => a.enabled ?? true);
        if (!active || !pending || isRunning || enabled.length === 0) return;
        startRun();
        router.push({
          pathname: "/search-runner",
          params: {
            accountIds: JSON.stringify(enabled.map((a) => a.id)),
            mode: settings.overnightDailySet ? "both" : "searchonly",
          },
        });
      });
      return () => { active = false; };
    }, [isRunning, accounts, settings.overnightDailySet, startRun])
  );

  const enabledAccounts = accounts.filter((a) => a.enabled ?? true);

  const handleRunAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (isRunning) {
      showAlert("Search Running", "Searches are in progress.", [
        { text: "Keep Running", style: "cancel" },
        { text: "Stop All", style: "destructive", onPress: stopRun },
      ]);
      return;
    }
    if (enabledAccounts.length === 0) {
      showAlert("No Accounts", accounts.length > 0 ? "All accounts are disabled. Enable at least one first." : "Add an account first to run automation.");
      return;
    }
    startRun();
    router.push({
      pathname: "/search-runner",
      params: { accountIds: JSON.stringify(enabledAccounts.map((a) => a.id)), mode: "searchonly" },
    });
  };

  const handleRunAccount = (id: string) => {
    if (isRunning) {
      showAlert("Search Running", "Stop the current run before starting another.");
      return;
    }
    startRun();
    router.push({
      pathname: "/search-runner",
      params: { accountIds: JSON.stringify([id]), mode: "searchonly" },
    });
  };

  const handleDailySetAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (isRunning) {
      showAlert("Already Running", "Stop the current run before starting another.");
      return;
    }
    if (enabledAccounts.length === 0) {
      showAlert("No Accounts", accounts.length > 0 ? "All accounts are disabled. Enable at least one first." : "Add an account first.");
      return;
    }
    startRun();
    router.push({
      pathname: "/search-runner",
      params: {
        accountIds: JSON.stringify(enabledAccounts.map((a) => a.id)),
        mode: "dailyset",
      },
    });
  };

  const handleDailySetAccount = (id: string) => {
    if (isRunning) {
      showAlert("Already Running", "Stop the current run before starting another.");
      return;
    }
    startRun();
    router.push({
      pathname: "/search-runner",
      params: { accountIds: JSON.stringify([id]), mode: "dailyset" },
    });
  };

  const handleRunBothAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (isRunning) {
      showAlert("Already Running", "Stop the current run before starting another.", [
        { text: "Keep Running", style: "cancel" },
        { text: "Stop All", style: "destructive", onPress: stopRun },
      ]);
      return;
    }
    if (enabledAccounts.length === 0) {
      showAlert("No Accounts", accounts.length > 0 ? "All accounts are disabled. Enable at least one first." : "Add an account first to run automation.");
      return;
    }
    startRun();
    router.push({
      pathname: "/search-runner",
      params: { accountIds: JSON.stringify(enabledAccounts.map((a) => a.id)) },
    });
  };

  const handleToggleEnabled = (id: string) => {
    const account = accounts.find((a) => a.id === id);
    if (!account) return;
    updateAccount(id, { enabled: !(account.enabled ?? true) });
  };

  const renderListItem = useCallback(
    ({ item }: { item: Account }) => (
      <AccountCard
        account={item}
        onPress={() =>
          router.push({ pathname: "/account/[id]", params: { id: item.id } })
        }
        onRun={() => handleRunAccount(item.id)}
        onDailySet={() => handleDailySetAccount(item.id)}
        onRefreshSession={() =>
          router.push({
            pathname: "/login-webview",
            params: { accountId: item.id },
          })
        }
        onToggleEnabled={() => handleToggleEnabled(item.id)}
        isRunningGlobal={isRunning}
        showDailySet={dailySetAllowed}
      />
    ),
    [isRunning, dailySetAllowed, accounts],
  );

  const { width: screenWidth } = Dimensions.get("window");
  const gridGutter = 8;
  const gridPadding = 12;
  const tileWidth = Math.floor((screenWidth - gridPadding * 2 - gridGutter) / 2);

  const renderGridItem = useCallback(
    ({ item, index }: { item: Account; index: number }) => (
      <AccountGridTile
        account={item}
        width={tileWidth}
        onPress={() =>
          router.push({ pathname: "/account/[id]", params: { id: item.id } })
        }
        onRun={() => handleRunAccount(item.id)}
        onDailySet={() => handleDailySetAccount(item.id)}
        onRefreshSession={() =>
          router.push({
            pathname: "/login-webview",
            params: { accountId: item.id },
          })
        }
        onToggleEnabled={() => handleToggleEnabled(item.id)}
        isRunningGlobal={isRunning}
        showDailySet={dailySetAllowed}
      />
    ),
    [isRunning, tileWidth, dailySetAllowed, accounts],
  );

  const ListHeader = (
    <View>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <Image
            source={require("@/assets/images/macro-rewards-logo.png")}
            style={styles.headerBrandLogo}
            resizeMode="contain"
          />
          <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
            {accounts.length} account{accounts.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setViewMode((m) => (m === "list" ? "grid" : "list"));
            }}
            style={({ pressed }) => [
              styles.headerBtn,
              {
                backgroundColor: colors.surfaceSecondary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            {viewMode === "list" ? (
              <Grid3X3 size={20} color={colors.text} />
            ) : (
              <List size={20} color={colors.text} />
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (accounts.length >= maxAccounts) {
                showAlert("Account Limit Reached", `Your license allows up to ${maxAccounts} account${maxAccounts > 1 ? "s" : ""}. Contact admin to increase your limit.`);
                return;
              }
              router.push("/add-account");
            }}
            style={({ pressed }) => [
              styles.headerBtn,
              {
                backgroundColor: colors.surfaceSecondary,
                opacity: accounts.length >= maxAccounts ? 0.35 : pressed ? 0.7 : 1,
              },
            ]}
          >
            <Plus size={20} color={accounts.length >= maxAccounts ? colors.textSecondary : colors.text} />
          </Pressable>
        </View>
      </View>

      {/* Inline settings card */}
      <View
        style={[
          styles.settingsCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.settingsRow}>
          {/* Searches per account */}
          <View style={styles.settingBlock}>
            <Text
              style={[
                styles.settingBlockLabel,
                { color: colors.textSecondary },
              ]}
            >
              Search Count
            </Text>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={() => {
                  const next = Math.max(1, settings.defaultSearchCount - 1);
                  updateSettings({ defaultSearchCount: next });
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={[
                  styles.stepBtn,
                  { backgroundColor: colors.surfaceSecondary },
                ]}
              >
                <Text style={[styles.stepBtnText, { color: colors.text }]}>
                  −
                </Text>
              </Pressable>
              <Text style={[styles.stepValue, { color: colors.text }]}>
                {settings.defaultSearchCount}
              </Text>
              <Pressable
                onPress={() => {
                  const next = Math.min(maxSearches, settings.defaultSearchCount + 1);
                  updateSettings({ defaultSearchCount: next });
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={[
                  styles.stepBtn,
                  { backgroundColor: colors.surfaceSecondary },
                ]}
              >
                <Text style={[styles.stepBtnText, { color: colors.text }]}>
                  +
                </Text>
              </Pressable>
            </View>
          </View>

          <View
            style={[
              styles.settingsCardDivider,
              { backgroundColor: colors.border },
            ]}
          />

          {/* Delay */}
          <View style={styles.settingBlock}>
            <Text
              style={[
                styles.settingBlockLabel,
                { color: colors.textSecondary },
              ]}
            >
              Delay (seconds)
            </Text>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={() => {
                  const next = Math.max(minDelay, settings.searchDelay - 1);
                  updateSettings({ searchDelay: next });
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={[
                  styles.stepBtn,
                  { backgroundColor: colors.surfaceSecondary },
                ]}
              >
                <Text style={[styles.stepBtnText, { color: colors.text }]}>
                  −
                </Text>
              </Pressable>
              <Text style={[styles.stepValue, { color: colors.text }]}>
                {settings.searchDelay}s
              </Text>
              <Pressable
                onPress={() => {
                  const next = Math.min(30, settings.searchDelay + 1);
                  updateSettings({ searchDelay: next });
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={[
                  styles.stepBtn,
                  { backgroundColor: colors.surfaceSecondary },
                ]}
              >
                <Text style={[styles.stepBtnText, { color: colors.text }]}>
                  +
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {showExpiryWarning && (
        <Pressable
          onPress={() => router.push("/(tabs)/settings")}
          style={[
            styles.expiryBanner,
            { backgroundColor: daysUntilExpiry === 0 ? "#7f1d1d" : "#78350f" },
          ]}
        >
          <AlertTriangle size={16} color="#fbbf24" />
          <Text style={styles.expiryBannerText}>
            {`License expires in ${formatTimeRemaining(licenseData!.expiresAt)} — tap to renew`}
          </Text>
        </Pressable>
      )}

      {accounts.length > 0 && <StatsBar accounts={accounts} />}
    </View>
  );

  const ListFooter = <View style={{ height: 120 }} />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {viewMode === "list" ? (
        <FlatList
          key="list"
          data={accounts}
          keyExtractor={(item) => item.id}
          renderItem={renderListItem}
          ListHeaderComponent={ListHeader}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={
            <EmptyState
              icon={Users}
              title="No accounts yet"
              subtitle="Tap the + button above to add your first account"
            />
          }
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.tint}
            />
          }
        />
      ) : (
        <FlatList
          key="grid"
          data={accounts}
          keyExtractor={(item) => item.id}
          renderItem={renderGridItem}
          numColumns={2}
          ListHeaderComponent={ListHeader}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={
            <EmptyState
              icon={Users}
              title="No accounts yet"
              subtitle="Tap the + button above to add your first account"
            />
          }
          columnWrapperStyle={{ paddingHorizontal: gridPadding, gap: gridGutter }}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.tint}
            />
          }
        />
      )}

      <View
        style={[
          styles.fab,
          { bottom: insets.bottom + (Platform.OS === "ios" ? 90 : 72) },
        ]}
      >
        {!isRunning && dailySetAllowed && (
          <Pressable
            onPress={handleDailySetAll}
            style={({ pressed }) => [
              {
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
            ]}
          >
            <LinearGradient
              colors={["#7C3AED", "#5B21B6"]}
              style={styles.fabBtn}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <CheckSquare size={18} color="#fff" />
              <Text style={styles.fabText}>Daily Set</Text>
            </LinearGradient>
          </Pressable>
        )}

        {!isRunning && dailySetAllowed && (
          <Pressable
            onPress={handleRunBothAll}
            style={({ pressed }) => [
              {
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
            ]}
          >
            <LinearGradient
              colors={["#059669", "#047857"]}
              style={styles.fabBtn}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <PlayCircle size={18} color="#fff" />
              <Text style={styles.fabText}>Run All</Text>
            </LinearGradient>
          </Pressable>
        )}

        <Pressable
          onPress={isRunning ? handleRunAll : handleRunAll}
          style={({ pressed }) => [
            {
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
              flex: !dailySetAllowed ? 1 : undefined,
            },
          ]}
        >
          <LinearGradient
            colors={isRunning ? ["#EF4444", "#DC2626"] : ["#3B82F6", "#1D4ED8"]}
            style={[styles.fabBtn, !dailySetAllowed && { justifyContent: "center" }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {isRunning ? (
              <Square size={18} color="#fff" />
            ) : (
              <Play size={18} color="#fff" />
            )}
            <Text style={styles.fabText}>
              {isRunning ? "Stop" : "Search"}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
      {AlertComponent}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  expiryBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  expiryBannerText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#fef3c7",
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: "column",
    justifyContent: "center",
    gap: 2,
  },
  headerBrandLogo: {
    width: 160,
    height: 48,
  },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2, paddingLeft: 4 },
  headerActions: { flexDirection: "row", gap: 8 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  settingsCardTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  settingBlock: {
    flex: 1,
    alignItems: "center",
    gap: 10,
  },
  settingBlockLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnText: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 22,
  },
  stepValue: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    minWidth: 52,
    textAlign: "center",
  },
  settingsCardDivider: {
    width: 1,
    height: 52,
    marginHorizontal: 8,
  },
  fab: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  fabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
