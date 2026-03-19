import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useQueries } from "@/context/QueriesContext";

type SubTab = "pool" | "used";

export default function QueriesScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { unusedQueries, usedQueries, setUnusedQueries, moveToUnused, deleteUsedQuery, clearAllUsed, restoreAllUsed } =
    useQueries();

  const [subTab, setSubTab] = useState<SubTab>("pool");
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");

  const openEdit = () => {
    setEditText(unusedQueries.join(", "));
    setEditing(true);
  };

  const saveEdit = () => {
    const parsed = editText
      .split(/,|\n/)
      .map((q) => q.trim())
      .filter((q) => q.length > 0);
    const unique = [...new Set(parsed)];
    setUnusedQueries(unique);
    setEditing(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const handleRestore = (query: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    moveToUnused(query);
  };

  const handleDeleteUsed = (query: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    deleteUsedQuery(query);
  };

  const handleRestoreAll = () => {
    Alert.alert("Restore All", "Move all used queries back to the pool?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Restore All",
        onPress: () => {
          restoreAllUsed();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  const handleClearAll = () => {
    Alert.alert("Clear Used Queries", "Permanently delete all used queries?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete All",
        style: "destructive",
        onPress: () => {
          clearAllUsed();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  if (editing) {
    return (
      <View style={[styles.editContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.editHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
          <Pressable onPress={cancelEdit} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <Text style={[styles.editAction, { color: colors.textSecondary }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.editTitle, { color: colors.text }]}>Edit Queries</Text>
          <Pressable onPress={saveEdit} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <Text style={[styles.editAction, { color: colors.tint }]}>Save</Text>
          </Pressable>
        </View>
        <Text style={[styles.editHint, { color: colors.textMuted }]}>
          One query per line, or separate with commas.
        </Text>
        <TextInput
          value={editText}
          onChangeText={setEditText}
          multiline
          autoFocus
          style={[
            styles.editInput,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
          placeholderTextColor={colors.textMuted}
          placeholder="what is artificial intelligence, best laptops 2026, ..."
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Queries</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {unusedQueries.length} in pool · {usedQueries.length} used
          </Text>
        </View>
        {subTab === "pool" && (
          <Pressable
            onPress={openEdit}
            style={({ pressed }) => [
              styles.editBtn,
              { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Feather name="edit-2" size={14} color="#fff" />
            <Text style={styles.editBtnText}>Edit</Text>
          </Pressable>
        )}
        {subTab === "used" && usedQueries.length > 0 && (
          <View style={styles.bulkActions}>
            <Pressable
              onPress={handleRestoreAll}
              style={({ pressed }) => [
                styles.bulkBtn,
                { backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="rotate-ccw" size={13} color={colors.tint} />
              <Text style={[styles.bulkBtnText, { color: colors.tint }]}>Restore All</Text>
            </Pressable>
            <Pressable
              onPress={handleClearAll}
              style={({ pressed }) => [
                styles.bulkBtn,
                { backgroundColor: "#FEE2E2", opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="trash-2" size={13} color="#EF4444" />
              <Text style={[styles.bulkBtnText, { color: "#EF4444" }]}>Clear</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={[styles.segmented, { backgroundColor: colors.surfaceSecondary }]}>
        <Pressable
          onPress={() => {
            setSubTab("pool");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={[
            styles.segment,
            subTab === "pool" && { backgroundColor: colors.surface, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2 },
          ]}
        >
          <Feather name="list" size={14} color={subTab === "pool" ? colors.tint : colors.textMuted} />
          <Text
            style={[
              styles.segmentText,
              { color: subTab === "pool" ? colors.tint : colors.textMuted },
              subTab === "pool" && { fontFamily: "Inter_600SemiBold" },
            ]}
          >
            Queries ({unusedQueries.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setSubTab("used");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={[
            styles.segment,
            subTab === "used" && { backgroundColor: colors.surface, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2 },
          ]}
        >
          <Feather name="check-circle" size={14} color={subTab === "used" ? colors.tint : colors.textMuted} />
          <Text
            style={[
              styles.segmentText,
              { color: subTab === "used" ? colors.tint : colors.textMuted },
              subTab === "used" && { fontFamily: "Inter_600SemiBold" },
            ]}
          >
            Used ({usedQueries.length})
          </Text>
        </Pressable>
      </View>

      {subTab === "pool" ? (
        <FlatList
          data={unusedQueries}
          keyExtractor={(item, i) => `${item}-${i}`}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Feather name="inbox" size={36} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Query pool is empty</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Tap Edit to add your search queries.
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View
              style={[
                styles.queryRow,
                {
                  backgroundColor: colors.surface,
                  borderBottomColor: colors.border,
                  borderBottomWidth: index < unusedQueries.length - 1 ? StyleSheet.hairlineWidth : 0,
                },
              ]}
            >
              <View style={[styles.queryIndex, { backgroundColor: colors.surfaceSecondary }]}>
                <Text style={[styles.queryIndexText, { color: colors.textMuted }]}>{index + 1}</Text>
              </View>
              <Text style={[styles.queryText, { color: colors.text }]} numberOfLines={1}>
                {item}
              </Text>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={usedQueries}
          keyExtractor={(item, i) => `used-${item}-${i}`}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Feather name="check-circle" size={36} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No used queries yet</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Queries are moved here after a search run.
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View
              style={[
                styles.usedRow,
                {
                  backgroundColor: colors.surface,
                  borderBottomColor: colors.border,
                  borderBottomWidth: index < usedQueries.length - 1 ? StyleSheet.hairlineWidth : 0,
                },
              ]}
            >
              <Feather name="check" size={13} color={colors.success} style={{ marginTop: 1 }} />
              <Text style={[styles.queryText, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                {item}
              </Text>
              <Pressable
                onPress={() => handleRestore(item)}
                style={({ pressed }) => [styles.usedAction, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Feather name="rotate-ccw" size={14} color={colors.tint} />
              </Pressable>
              <Pressable
                onPress={() => handleDeleteUsed(item)}
                style={({ pressed }) => [styles.usedAction, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Feather name="trash-2" size={14} color={colors.error} />
              </Pressable>
            </View>
          )}
        />
      )}
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
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  editBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  bulkActions: {
    flexDirection: "row",
    gap: 8,
  },
  bulkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
  },
  bulkBtnText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  segmented: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 3,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
  },
  segmentText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  queryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 0,
  },
  queryIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  queryIndexText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  queryText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  usedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  usedAction: {
    padding: 6,
  },
  emptyWrap: {
    alignItems: "center",
    paddingTop: 60,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  emptySub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  editContainer: {
    flex: 1,
  },
  editHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  editTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  editAction: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  editHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  editInput: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    textAlignVertical: "top",
  },
});
