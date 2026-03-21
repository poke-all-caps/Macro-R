import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useFocusEffect } from "expo-router";
import { CheckSquare, Grid3X3, List, Play, PlayCircle, Plus, Square, Users } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
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
import { EmptyState } from "@/components/EmptyState";
import { StatsBar } from "@/components/StatsBar";
import Colors from "@/constants/colors";
import { Account, useAccounts } from "@/context/AccountsContext";
import { useSettings } from "@/context/SettingsContext";
import { consumePendingRun } from "@/utils/notifications";

export default function HomeScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { accounts, isRunning, startRun, stopRun } = useAccounts();
  const { settings, updateSettings } = useSettings();
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 500));
    setRefreshing(false);
  }, []);

  // Auto-start run when navigated here from a scheduled notification tap
  useFocusEffect(
    useCallback(() => {
      let active = true;
      consumePendingRun().then((pending) => {
        if (!active || !pending || isRunning || accounts.length === 0) return;
        startRun();
        router.push({
          pathname: "/search-runner",
          params: {
            accountIds: JSON.stringify(accounts.map((a) => a.id)),
            mode: settings.overnightDailySet ? "both" : "searchonly",
          },
        });
      });
      return () => { active = false; };
    }, [isRunning, accounts, settings.overnightDailySet])
  );

  const handleRunAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (isRunning) {
      Alert.alert("Search Running", "Searches are in progress.", [
        { text: "Keep Running", style: "cancel" },
        { text: "Stop All", style: "destructive", onPress: stopRun },
      ]);
      return;
    }
    if (accounts.length === 0) {
      Alert.alert("No Accounts", "Add an account first to run automation.");
      return;
    }
    startRun();
    router.push({
      pathname: "/search-runner",
      params: { accountIds: JSON.stringify(accounts.map((a) => a.id)), mode: "searchonly" },
    });
  };

  const handleRunAccount = (id: string) => {
    if (isRunning) {
      Alert.alert(
        "Search Running",
        "Stop the current run before starting another.",
      );
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
      Alert.alert(
        "Already Running",
        "Stop the current run before starting another.",
      );
      return;
    }
    if (accounts.length === 0) {
      Alert.alert("No Accounts", "Add an account first.");
      return;
    }
    startRun();
    router.push({
      pathname: "/search-runner",
      params: {
        accountIds: JSON.stringify(accounts.map((a) => a.id)),
        mode: "dailyset",
      },
    });
  };

  const handleDailySetAccount = (id: string) => {
    if (isRunning) {
      Alert.alert(
        "Already Running",
        "Stop the current run before starting another.",
      );
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
      Alert.alert("Already Running", "Stop the current run before starting another.", [
        { text: "Keep Running", style: "cancel" },
        { text: "Stop All", style: "destructive", onPress: stopRun },
      ]);
      return;
    }
    if (accounts.length === 0) {
      Alert.alert("No Accounts", "Add an account first to run automation.");
      return;
    }
    startRun();
    router.push({
      pathname: "/search-runner",
      params: { accountIds: JSON.stringify(accounts.map((a) => a.id)) },
    });
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
        isRunningGlobal={isRunning}
        showDailySet={settings.dailySetEnabled}
      />
    ),
    [isRunning, settings.dailySetEnabled],
  );

  const { width: screenWidth } = Dimensions.get("window");
  const gridGutter = 8;
  const gridPadding = 12;
  const tileWidth = Math.floor((screenWidth - gridPadding * 2 - gridGutter * 2) / 3);

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
        isRunningGlobal={isRunning}
        showDailySet={settings.dailySetEnabled}
      />
    ),
    [isRunning, tileWidth, settings.dailySetEnabled],
  );

  const ListHeader = (
    <View>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            MS Rewards
          </Text>
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
              router.push("/add-account");
            }}
            style={({ pressed }) => [
              styles.headerBtn,
              {
                backgroundColor: colors.surfaceSecondary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Plus size={20} color={colors.text} />
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
                  const next = Math.max(5, settings.defaultSearchCount - 1);
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
                  const next = Math.min(50, settings.defaultSearchCount + 1);
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
                  const next = Math.max(3, settings.searchDelay - 1);
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
          numColumns={3}
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
        {!isRunning && settings.dailySetEnabled && (
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

        {!isRunning && settings.dailySetEnabled && (
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
            },
          ]}
        >
          <LinearGradient
            colors={isRunning ? ["#EF4444", "#DC2626"] : ["#3B82F6", "#1D4ED8"]}
            style={styles.fabBtn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {isRunning ? (
              <Square size={18} color="#fff" />
            ) : (
              <Play size={18} color="#fff" />
            )}
            <Text style={styles.fabText}>
              {isRunning ? "Stop" : "Search All"}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
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
