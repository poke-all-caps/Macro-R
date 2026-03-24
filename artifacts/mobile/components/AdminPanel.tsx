import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { ArrowLeft, Copy, Key, LogOut, Minus, Plus, Power, PowerOff, RefreshCw, Shield, Smartphone, Trash2 } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";

import Colors from "@/constants/colors";
import { useLicense } from "@/context/LicenseContext";

const API_BASE = process.env.EXPO_PUBLIC_API_URL || "";
const OWNER_ADMIN_SECRET = process.env.EXPO_PUBLIC_ADMIN_SECRET || "";

const KEY_TYPES = ["basic", "premium", "unlimited", "admin"] as const;
type KeyType = typeof KEY_TYPES[number];

const KEY_TYPE_COLORS: Record<KeyType, { color: string; bg: string }> = {
  basic: { color: "#94a3b8", bg: "#64748b22" },
  premium: { color: "#a78bfa", bg: "#7c3aed22" },
  unlimited: { color: "#fbbf24", bg: "#d9770622" },
  admin: { color: "#f87171", bg: "#dc262622" },
};

interface LicenseKey {
  id: string;
  key: string;
  label: string | null;
  keyType: KeyType;
  maxAccounts: number;
  isActive: boolean;
  boundDeviceId: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export function AdminPanel() {
  const scheme = useColorScheme() ?? "dark";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { adminSecret, removeLicense, isOwnerMode } = useLicense();

  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newMaxAccounts, setNewMaxAccounts] = useState("3");
  const [newExpDays, setNewExpDays] = useState("30");
  const [newKeyType, setNewKeyType] = useState<KeyType>("basic");

  const effectiveSecret = isOwnerMode ? OWNER_ADMIN_SECRET : (adminSecret || "");

  const apiCall = useCallback(async (method: string, path: string, body?: any) => {
    const opts: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Secret": effectiveSecret,
      },
    };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(`${API_BASE}${path}`, opts);
    if (!resp.ok) {
      const text = await resp.text().catch(() => "Request failed");
      throw new Error(text);
    }
    return resp.json();
  }, [effectiveSecret]);

  const loadKeys = useCallback(async () => {
    try {
      const data = await apiCall("GET", "/admin/keys");
      setKeys(data.keys || []);
    } catch {
      Alert.alert("Error", "Failed to load keys");
    }
    setLoading(false);
  }, [apiCall]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const createKey = async () => {
    if (creating) return;
    setCreating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const maxAccounts = Math.max(1, parseInt(newMaxAccounts) || 3);
      const days = Math.max(1, parseInt(newExpDays) || 30);
      const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
      const result = await apiCall("POST", "/admin/keys", {
        label: newLabel.trim() || null,
        maxAccounts,
        expiresAt,
        keyType: newKeyType,
      });
      if (result.key) {
        setNewLabel("");
        setNewMaxAccounts("3");
        setNewExpDays("30");
        setNewKeyType("basic");
        await loadKeys();
        Alert.alert("Key Created", result.key.key, [
          {
            text: "Copy",
            onPress: () => {
              Clipboard.setStringAsync(result.key.key);
            },
          },
          { text: "OK" },
        ]);
      }
    } catch {
      Alert.alert("Error", "Failed to create key");
    }
    setCreating(false);
  };

  const extendKey = async (item: LicenseKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = new Date(item.expiresAt);
    const base = current > new Date() ? current : new Date();
    const newExp = new Date(base.getTime() + 30 * 86400000).toISOString();
    await apiCall("PUT", `/admin/keys/${item.id}`, { expiresAt: newExp });
    await loadKeys();
  };

  const editLimit = async (item: LicenseKey) => {
    if (Platform.OS === "web") {
      const val = prompt(`Set account limit (current: ${item.maxAccounts}):`, String(item.maxAccounts));
      if (val === null) return;
      const n = parseInt(val);
      if (isNaN(n) || n < 1) return;
      await apiCall("PUT", `/admin/keys/${item.id}`, { maxAccounts: n });
      await loadKeys();
    } else if (Alert.prompt) {
      Alert.prompt("Edit Account Limit", `Current: ${item.maxAccounts}`, async (val) => {
        const n = parseInt(val);
        if (isNaN(n) || n < 1) return;
        await apiCall("PUT", `/admin/keys/${item.id}`, { maxAccounts: n });
        await loadKeys();
      }, "plain-text", String(item.maxAccounts));
    } else {
      const buttons = [1, 2, 3, 5, 10, 20, 50].map((n) => ({
        text: `${n} account${n > 1 ? "s" : ""}`,
        onPress: async () => {
          await apiCall("PUT", `/admin/keys/${item.id}`, { maxAccounts: n });
          await loadKeys();
        },
      }));
      Alert.alert("Set Account Limit", `Current: ${item.maxAccounts}`, [
        ...buttons,
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  const changeKeyType = async (item: LicenseKey) => {
    if (Platform.OS === "web") {
      const types = KEY_TYPES.map((t, i) => `${i + 1}. ${t.charAt(0).toUpperCase() + t.slice(1)}`).join("\n");
      const val = prompt(`Change key type (current: ${item.keyType}):\n${types}\nEnter number:`, String(KEY_TYPES.indexOf(item.keyType) + 1));
      if (val === null) return;
      const idx = parseInt(val) - 1;
      if (idx < 0 || idx >= KEY_TYPES.length || KEY_TYPES[idx] === item.keyType) return;
      await apiCall("PUT", `/admin/keys/${item.id}`, { keyType: KEY_TYPES[idx] });
      await loadKeys();
    } else {
      const buttons = KEY_TYPES.map((t) => ({
        text: t.charAt(0).toUpperCase() + t.slice(1),
        onPress: async () => {
          if (t === item.keyType) return;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          await apiCall("PUT", `/admin/keys/${item.id}`, { keyType: t });
          await loadKeys();
        },
      }));
      Alert.alert("Change Key Type", `Current: ${item.keyType}`, [
        ...buttons,
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  const resetDevice = async (item: LicenseKey) => {
    if (!item.boundDeviceId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await apiCall("PUT", `/admin/keys/${item.id}/reset-device`);
    await loadKeys();
  };

  const toggleKey = async (item: LicenseKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await apiCall("PUT", `/admin/keys/${item.id}`, { isActive: !item.isActive });
    await loadKeys();
  };

  const deleteKey = async (item: LicenseKey) => {
    if (Platform.OS === "web") {
      if (!confirm(`Delete ${item.key} permanently?`)) return;
      await apiCall("DELETE", `/admin/keys/${item.id}`);
      await loadKeys();
    } else {
      Alert.alert("Delete Key", `Delete ${item.key} permanently?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await apiCall("DELETE", `/admin/keys/${item.id}`);
            await loadKeys();
          },
        },
      ]);
    }
  };

  const copyKey = (key: string) => {
    Clipboard.setStringAsync(key);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const getStatus = (item: LicenseKey) => {
    if (!item.isActive) return { label: "Inactive", color: "#64748b", bg: "#64748b22" };
    if (new Date(item.expiresAt) < new Date()) return { label: "Expired", color: "#f87171", bg: "#dc262622" };
    const days = Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / 86400000);
    return { label: `${days}d left`, color: "#4ade80", bg: "#16a34a22" };
  };

  const renderKey = ({ item }: { item: LicenseKey }) => {
    const status = getStatus(item);
    const typeColor = KEY_TYPE_COLORS[item.keyType] || KEY_TYPE_COLORS.basic;
    return (
      <View style={[styles.keyCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: !item.isActive ? 0.5 : 1 }]}>
        <View style={styles.keyHeader}>
          <Pressable onPress={() => copyKey(item.key)} style={styles.keyTextRow}>
            <Text style={[styles.keyText, { color: "#3b82f6" }]}>{item.key}</Text>
            <Copy size={14} color={colors.textSecondary} />
          </Pressable>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Pressable onPress={() => changeKeyType(item)} style={[styles.badge, { backgroundColor: typeColor.bg }]}>
              <Text style={[styles.badgeText, { color: typeColor.color }]}>{item.keyType.toUpperCase()}</Text>
            </Pressable>
            <View style={[styles.badge, { backgroundColor: status.bg }]}>
              <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
        </View>

        <View style={styles.metaRow}>
          {item.label && <Text style={[styles.metaText, { color: colors.textSecondary }]}>{item.label}</Text>}
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {item.maxAccounts} account{item.maxAccounts > 1 ? "s" : ""}
          </Text>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            Exp: {new Date(item.expiresAt).toLocaleDateString()}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Smartphone size={11} color={item.boundDeviceId ? "#f59e0b" : "#64748b"} />
            <Text style={[styles.metaText, { color: item.boundDeviceId ? "#f59e0b" : "#64748b" }]}>
              {item.boundDeviceId ? "Bound" : "Unbound"}
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable onPress={() => extendKey(item)} style={[styles.actionBtn, { backgroundColor: colors.surfaceSecondary }]}>
            <Plus size={14} color={colors.text} />
            <Text style={[styles.actionText, { color: colors.text }]}>30 Days</Text>
          </Pressable>

          <Pressable onPress={() => editLimit(item)} style={[styles.actionBtn, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.actionText, { color: colors.text }]}>Edit Limit</Text>
          </Pressable>

          {item.boundDeviceId && (
            <Pressable onPress={() => resetDevice(item)} style={[styles.actionBtn, { backgroundColor: "#f59e0b22" }]}>
              <Smartphone size={14} color="#f59e0b" />
              <Text style={[styles.actionText, { color: "#f59e0b" }]}>Reset</Text>
            </Pressable>
          )}

          <Pressable onPress={() => toggleKey(item)} style={[styles.actionBtn, { backgroundColor: item.isActive ? "#dc262622" : "#16a34a22" }]}>
            {item.isActive ? <PowerOff size={14} color="#f87171" /> : <Power size={14} color="#4ade80" />}
          </Pressable>

          <Pressable onPress={() => deleteKey(item)} style={[styles.actionBtn, { backgroundColor: "#dc262622" }]}>
            <Trash2 size={14} color="#f87171" />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {isOwnerMode && (
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <ArrowLeft size={22} color={colors.text} />
              </Pressable>
            )}
            <Shield size={24} color="#3b82f6" />
            <Text style={[styles.title, { color: colors.text }]}>Admin Panel</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              onPress={loadKeys}
              style={[styles.headerBtn, { backgroundColor: colors.surfaceSecondary }]}
            >
              <RefreshCw size={18} color={colors.text} />
            </Pressable>
            {!isOwnerMode && (
              <Pressable
                onPress={async () => {
                  if (Platform.OS === "web") {
                    if (confirm("Leave admin panel?")) {
                      await removeLicense();
                    }
                  } else {
                    Alert.alert("Sign Out", "Leave admin panel?", [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Sign Out",
                        style: "destructive",
                        onPress: async () => {
                          await removeLicense();
                        },
                      },
                    ]);
                  }
                }}
                style={[styles.headerBtn, { backgroundColor: "#dc262622" }]}
              >
                <LogOut size={18} color="#f87171" />
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <View style={[styles.createSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.createTitle, { color: colors.text }]}>Create New Key</Text>
        <View style={styles.createRow}>
          <View style={styles.createField}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Label</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder="e.g. User name"
              placeholderTextColor={colors.textSecondary}
              value={newLabel}
              onChangeText={setNewLabel}
            />
          </View>
          <View style={styles.createFieldSmall}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Accounts</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              keyboardType="number-pad"
              value={newMaxAccounts}
              onChangeText={setNewMaxAccounts}
            />
          </View>
          <View style={styles.createFieldSmall}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Days</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              keyboardType="number-pad"
              value={newExpDays}
              onChangeText={setNewExpDays}
            />
          </View>
        </View>
        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Key Type</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {KEY_TYPES.map((t) => {
              const tc = KEY_TYPE_COLORS[t];
              const selected = newKeyType === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => setNewKeyType(t)}
                  style={[
                    styles.typeChip,
                    {
                      backgroundColor: selected ? tc.bg : colors.background,
                      borderColor: selected ? tc.color : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.typeChipText, { color: selected ? tc.color : colors.textSecondary }]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Pressable
          onPress={createKey}
          disabled={creating}
          style={({ pressed }) => [styles.createBtn, { opacity: creating ? 0.5 : pressed ? 0.85 : 1 }]}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Key size={16} color="#fff" />
              <Text style={styles.createBtnText}>Generate Key</Text>
            </>
          )}
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : keys.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Key size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No keys created yet</Text>
        </View>
      ) : (
        <FlatList
          data={keys}
          keyExtractor={(item) => item.id}
          renderItem={renderKey}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerRight: { flexDirection: "row", gap: 8 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  createSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  createTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  createRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  createField: { flex: 2 },
  createFieldSmall: { flex: 1 },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 4 },
  fieldInput: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  createBtn: {
    backgroundColor: "#3b82f6",
    height: 44,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  createBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  keyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  keyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  keyTextRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  keyText: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  metaRow: { flexDirection: "row", gap: 12, marginBottom: 10, flexWrap: "wrap" },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  typeChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
