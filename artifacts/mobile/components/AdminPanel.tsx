import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { AlertTriangle, ArrowLeft, Calendar, Check, ChevronRight, Cookie, Copy, ExternalLink, Key, LogIn, Minus, Plus, Power, PowerOff, QrCode, RefreshCw, RotateCcw, Settings, Shield, Smartphone, Trash2, Users, X } from "lucide-react-native";
import { setCookieBrowserPayload } from "@/utils/cookieBrowserStore";
import QRCode from "react-native-qrcode-svg";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";

import Colors from "@/constants/colors";
import { useLicense } from "@/context/LicenseContext";
import { CustomAlert } from "@/components/CustomAlert";

import { API_BASE } from "@/utils/apiUrl";
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

interface FeatureConfig {
  keyType: string;
  maxAccounts: number;
  maxSearches: number;
  minDelaySeconds: number;
  backgroundEnabled: boolean;
  customQueriesEnabled: boolean;
  dailySetEnabled: boolean;
  pcSearchEnabled: boolean;
}

export function AdminPanel() {
  const scheme = useColorScheme() ?? "dark";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { adminSecret, licenseData, removeLicense } = useLicense();

  const [activeTab, setActiveTab] = useState<"keys" | "config">("keys");
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [featureConfigs, setFeatureConfigs] = useState<FeatureConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newMaxAccounts, setNewMaxAccounts] = useState("3");
  const [newExpAmount, setNewExpAmount] = useState("30");
  const [newExpUnit, setNewExpUnit] = useState<"days" | "months" | "years">("days");
  const [newKeyType, setNewKeyType] = useState<KeyType>("basic");
  const [selectedKey, setSelectedKey] = useState<LicenseKey | null>(null);
  const [profileCookies, setProfileCookies] = useState<any[]>([]);
  const [cookieLoading, setCookieLoading] = useState(false);
  const [showCookies, setShowCookies] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [deletePopup, setDeletePopup] = useState(false);
  const [errorPopup, setErrorPopup] = useState<{ visible: boolean; title: string; message: string }>({ visible: false, title: "", message: "" });
  const [successPopup, setSuccessPopup] = useState<{ visible: boolean; title: string; message: string; copyText?: string }>({ visible: false, title: "", message: "" });
  const [typePopup, setTypePopup] = useState(false);
  const [limitPopup, setLimitPopup] = useState(false);
  const [limitInput, setLimitInput] = useState("");
  const [expiryPopup, setExpiryPopup] = useState(false);
  const [expiryYear, setExpiryYear] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryDay, setExpiryDay] = useState("");

  const effectiveSecret = adminSecret || OWNER_ADMIN_SECRET;
  const adminLicenseKey = licenseData?.keyType === "admin" ? licenseData.key : null;

  const apiCall = useCallback(async (method: string, path: string, body?: any) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (effectiveSecret) {
      headers["X-Admin-Secret"] = effectiveSecret;
    }
    if (adminLicenseKey) {
      headers["X-Admin-Key"] = adminLicenseKey;
    }
    const opts: RequestInit = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(`${API_BASE}${path}`, opts);
    if (!resp.ok) {
      const text = await resp.text().catch(() => "Request failed");
      throw new Error(text);
    }
    return resp.json();
  }, [effectiveSecret, adminLicenseKey]);

  const showError = (title: string, message: string) => {
    setErrorPopup({ visible: true, title, message });
  };

  const showSuccess = (title: string, message: string, copyText?: string) => {
    setSuccessPopup({ visible: true, title, message, copyText });
  };

  const loadKeys = useCallback(async () => {
    try {
      const data = await apiCall("GET", "/admin/keys");
      setKeys(data.keys || []);
    } catch (e: any) {
      const authMode = effectiveSecret
        ? "secret"
        : adminLicenseKey
          ? `key:…${adminLicenseKey.slice(-6)}`
          : "none";
      showError(
        "Failed to Load Keys",
        `Auth: ${authMode}\nURL: ${API_BASE}\n\n${e?.message ?? "Unknown error"}`,
      );
    }
    setLoading(false);
  }, [apiCall, effectiveSecret, adminLicenseKey]);

  const loadFeatureConfigs = useCallback(async () => {
    try {
      const data = await apiCall("GET", "/admin/feature-config");
      setFeatureConfigs(data.configs || []);
    } catch {}
    setConfigLoading(false);
  }, [apiCall]);

  const updateFeatureConfig = useCallback(async (keyType: string, updates: any) => {
    try {
      await apiCall("PUT", `/admin/feature-config/${keyType}`, updates);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      loadFeatureConfigs();
    } catch {
      showError("Update Failed", "Could not update feature config. Try again.");
    }
  }, [apiCall, loadFeatureConfigs]);

  useEffect(() => {
    loadKeys();
    loadFeatureConfigs();
  }, [loadKeys, loadFeatureConfigs]);

  const createKey = async () => {
    if (creating) return;
    setCreating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const maxAccounts = Math.max(1, parseInt(newMaxAccounts) || 3);
      const amount = Math.max(1, parseInt(newExpAmount) || 30);
      const now = new Date();
      if (newExpUnit === "months") {
        now.setMonth(now.getMonth() + amount);
      } else if (newExpUnit === "years") {
        now.setFullYear(now.getFullYear() + amount);
      } else {
        now.setDate(now.getDate() + amount);
      }
      const expiresAt = now.toISOString();
      const result = await apiCall("POST", "/admin/keys", {
        label: newLabel.trim() || null,
        maxAccounts,
        expiresAt,
        keyType: newKeyType,
      });
      if (result.key) {
        setNewLabel("");
        setNewMaxAccounts("3");
        setNewExpAmount("30");
        setNewExpUnit("days");
        setNewKeyType("basic");
        await loadKeys();
        showSuccess("Key Created", result.key.key, result.key.key);
      }
    } catch {
      showError("Creation Failed", "Could not create the key. Try again.");
    }
    setCreating(false);
  };

  const getStatus = (item: LicenseKey) => {
    if (!item.isActive) return { label: "Inactive", color: "#64748b", bg: "#64748b22" };
    if (new Date(item.expiresAt) < new Date()) return { label: "Expired", color: "#f87171", bg: "#dc262622" };
    const days = Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / 86400000);
    let label: string;
    if (days >= 365) {
      const years = Math.floor(days / 365);
      const rem = Math.floor((days % 365) / 30);
      label = rem > 0 ? `${years}y ${rem}m` : `${years}y`;
    } else if (days >= 30) {
      const months = Math.floor(days / 30);
      const rem = days % 30;
      label = rem > 0 ? `${months}m ${rem}d` : `${months}m`;
    } else {
      label = `${days}d`;
    }
    return { label: `${label} left`, color: "#4ade80", bg: "#16a34a22" };
  };

  const openKeyProfile = (item: LicenseKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedKey(item);
    setProfileCookies([]);
    setCookieLoading(false);
    setShowQr(false);
  };

  const closeProfile = () => {
    setSelectedKey(null);
    setProfileCookies([]);
    setShowCookies(false);
    setShowQr(false);
    setDeletePopup(false);
    setTypePopup(false);
    setLimitPopup(false);
    setExpiryPopup(false);
  };

  const profileExtendKey = async () => {
    if (!selectedKey) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = new Date(selectedKey.expiresAt);
    const base = current > new Date() ? current : new Date();
    const newExp = new Date(base.getTime() + 30 * 86400000).toISOString();
    try {
      await apiCall("PUT", `/admin/keys/${selectedKey.id}`, { expiresAt: newExp });
      await loadKeys();
      setSelectedKey((prev) => prev ? { ...prev, expiresAt: newExp } : null);
    } catch {
      showError("Error", "Failed to extend expiry.");
    }
  };

  const openLimitPopup = () => {
    if (!selectedKey) return;
    setLimitInput(String(selectedKey.maxAccounts));
    setLimitPopup(true);
  };

  const submitLimit = async (n: number) => {
    if (!selectedKey) return;
    if (isNaN(n) || n < 1) {
      showError("Invalid Limit", "Please enter a number greater than 0.");
      return;
    }
    setLimitPopup(false);
    try {
      await apiCall("PUT", `/admin/keys/${selectedKey.id}`, { maxAccounts: n });
      await loadKeys();
      setSelectedKey((prev) => prev ? { ...prev, maxAccounts: n } : null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      showError("Error", "Failed to update account limit.");
    }
  };

  const openExpiryPopup = () => {
    if (!selectedKey) return;
    const d = new Date(selectedKey.expiresAt);
    setExpiryYear(String(d.getFullYear()));
    setExpiryMonth(String(d.getMonth() + 1).padStart(2, "0"));
    setExpiryDay(String(d.getDate()).padStart(2, "0"));
    setExpiryPopup(true);
  };

  const submitExpiry = async () => {
    if (!selectedKey) return;
    const y = parseInt(expiryYear);
    const m = parseInt(expiryMonth);
    const d = parseInt(expiryDay);
    if (isNaN(y) || isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31 || y < 2024) {
      showError("Invalid Date", "Please enter a valid date.");
      return;
    }
    const constructed = new Date(y, m - 1, d, 23, 59, 59);
    if (constructed.getFullYear() !== y || constructed.getMonth() !== m - 1 || constructed.getDate() !== d) {
      showError("Invalid Date", "That date doesn't exist. Please check the values.");
      return;
    }
    const newExp = constructed.toISOString();
    setExpiryPopup(false);
    try {
      await apiCall("PUT", `/admin/keys/${selectedKey.id}`, { expiresAt: newExp });
      await loadKeys();
      setSelectedKey((prev) => prev ? { ...prev, expiresAt: newExp } : null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      showError("Error", "Failed to update expiry date.");
    }
  };

  const openTypePopup = () => {
    if (!selectedKey) return;
    setTypePopup(true);
  };

  const submitType = async (t: KeyType) => {
    if (!selectedKey || t === selectedKey.keyType) {
      setTypePopup(false);
      return;
    }
    setTypePopup(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await apiCall("PUT", `/admin/keys/${selectedKey.id}`, { keyType: t });
      await loadKeys();
      setSelectedKey((prev) => prev ? { ...prev, keyType: t } : null);
    } catch {
      showError("Error", "Failed to change key type.");
    }
  };

  const profileResetDevice = async () => {
    if (!selectedKey?.boundDeviceId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiCall("PUT", `/admin/keys/${selectedKey.id}/reset-device`);
      await loadKeys();
      setSelectedKey((prev) => prev ? { ...prev, boundDeviceId: null } : null);
    } catch {
      showError("Error", "Failed to reset device binding.");
    }
  };

  const profileToggleActive = async () => {
    if (!selectedKey) return;
    const willDeactivate = selectedKey.isActive;
    if (willDeactivate) {
      Alert.alert(
        "Deactivate Key?",
        `This will immediately disable key ${selectedKey.key}. The user will lose access.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Deactivate",
            style: "destructive",
            onPress: async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              try {
                await apiCall("PUT", `/admin/keys/${selectedKey.id}`, { isActive: false });
                await loadKeys();
                setSelectedKey((prev) => prev ? { ...prev, isActive: false } : null);
              } catch {
                showError("Error", "Failed to deactivate key.");
              }
            },
          },
        ]
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiCall("PUT", `/admin/keys/${selectedKey.id}`, { isActive: true });
      await loadKeys();
      setSelectedKey((prev) => prev ? { ...prev, isActive: true } : null);
    } catch {
      showError("Error", "Failed to activate key.");
    }
  };

  const profileLoadCookies = async () => {
    if (!selectedKey) return;
    if (profileCookies.length > 0) {
      setShowCookies((prev) => !prev);
      return;
    }
    setCookieLoading(true);
    try {
      const data = await apiCall("GET", `/admin/keys/${selectedKey.id}/cookies`);
      setProfileCookies(data.cookies || []);
      setShowCookies(true);
    } catch {
      showError("Error", "Failed to load synced cookies.");
    }
    setCookieLoading(false);
  };

  const confirmDeleteKey = async () => {
    if (!selectedKey) return;
    setDeletePopup(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await apiCall("DELETE", `/admin/keys/${selectedKey.id}`);
      await loadKeys();
      closeProfile();
    } catch {
      showError("Error", "Failed to delete key.");
    }
  };

  const copyKey = (key: string) => {
    Clipboard.setStringAsync(key);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const renderKeyCard = ({ item }: { item: LicenseKey }) => {
    const status = getStatus(item);
    const typeColor = KEY_TYPE_COLORS[item.keyType] || KEY_TYPE_COLORS.basic;
    return (
      <Pressable
        onPress={() => openKeyProfile(item)}
        style={({ pressed }) => [
          styles.keyCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: !item.isActive ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <View style={styles.keyHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.keyText, { color: "#3b82f6" }]} numberOfLines={1}>{item.key}</Text>
          </View>
          <ChevronRight size={18} color={colors.textSecondary} />
        </View>
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
          <View style={[styles.badge, { backgroundColor: typeColor.bg }]}>
            <Text style={[styles.badgeText, { color: typeColor.color }]}>{item.keyType.toUpperCase()}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: status.bg }]}>
            <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
          </View>
          {item.boundDeviceId && (
            <View style={[styles.badge, { backgroundColor: "#f59e0b22" }]}>
              <Text style={[styles.badgeText, { color: "#f59e0b" }]}>Bound</Text>
            </View>
          )}
        </View>
        <View style={styles.metaRow}>
          {item.label && <Text style={[styles.metaText, { color: colors.textSecondary }]}>{item.label}</Text>}
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {item.maxAccounts} account{item.maxAccounts > 1 ? "s" : ""}
          </Text>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            Exp: {new Date(item.expiresAt).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
      </Pressable>
    );
  };

  const renderKeyProfile = () => {
    if (!selectedKey) return null;
    const status = getStatus(selectedKey);
    const typeColor = KEY_TYPE_COLORS[selectedKey.keyType] || KEY_TYPE_COLORS.basic;
    return (
      <Modal
        visible={!!selectedKey}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeProfile}
      >
        <View style={[styles.profileContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.profileHeader, { paddingTop: Platform.OS === "ios" ? 16 : insets.top + 8 }]}>
            <Pressable onPress={closeProfile} style={styles.profileCloseBtn}>
              <X size={22} color={colors.text} />
            </Pressable>
            <Text style={[styles.profileTitle, { color: colors.text }]}>Key Profile</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
            <View style={[styles.profileKeySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable onPress={() => copyKey(selectedKey.key)} style={styles.profileKeyRow}>
                <Text style={styles.profileKeyText}>{selectedKey.key}</Text>
                <Copy size={18} color="#3b82f680" />
              </Pressable>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <View style={[styles.badge, { backgroundColor: typeColor.bg, paddingHorizontal: 12, paddingVertical: 4 }]}>
                  <Text style={[styles.badgeText, { color: typeColor.color, fontSize: 13 }]}>{selectedKey.keyType.toUpperCase()}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: status.bg, paddingHorizontal: 12, paddingVertical: 4 }]}>
                  <Text style={[styles.badgeText, { color: status.color, fontSize: 13 }]}>{status.label}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: selectedKey.isActive ? "#16a34a22" : "#64748b22", paddingHorizontal: 12, paddingVertical: 4 }]}>
                  <Text style={[styles.badgeText, { color: selectedKey.isActive ? "#4ade80" : "#64748b", fontSize: 13 }]}>
                    {selectedKey.isActive ? "Active" : "Inactive"}
                  </Text>
                </View>
              </View>
            </View>

            <View style={[styles.profileInfoGrid, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.profileInfoItem}>
                <Text style={[styles.profileInfoLabel, { color: colors.textSecondary }]}>Label</Text>
                <Text style={[styles.profileInfoValue, { color: colors.text }]}>{selectedKey.label || "No label"}</Text>
              </View>
              <View style={styles.profileInfoItem}>
                <Text style={[styles.profileInfoLabel, { color: colors.textSecondary }]}>Accounts</Text>
                <Text style={[styles.profileInfoValue, { color: colors.text }]}>{selectedKey.maxAccounts}</Text>
              </View>
              <View style={styles.profileInfoItem}>
                <Text style={[styles.profileInfoLabel, { color: colors.textSecondary }]}>Expires</Text>
                <Text style={[styles.profileInfoValue, { color: colors.text }]}>{new Date(selectedKey.expiresAt).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>
              </View>
              <View style={styles.profileInfoItem}>
                <Text style={[styles.profileInfoLabel, { color: colors.textSecondary }]}>Device</Text>
                <Text style={[styles.profileInfoValue, { color: selectedKey.boundDeviceId ? "#f59e0b" : colors.textSecondary }]}>
                  {selectedKey.boundDeviceId ? `Bound` : "Unbound"}
                </Text>
              </View>
              <View style={styles.profileInfoItem}>
                <Text style={[styles.profileInfoLabel, { color: colors.textSecondary }]}>Created</Text>
                <Text style={[styles.profileInfoValue, { color: colors.text }]}>{new Date(selectedKey.createdAt).toLocaleDateString()}</Text>
              </View>
              {selectedKey.boundDeviceId && (
                <View style={styles.profileInfoItem}>
                  <Text style={[styles.profileInfoLabel, { color: colors.textSecondary }]}>Device ID</Text>
                  <Text style={[styles.profileInfoValue, { color: "#f59e0b", fontSize: 10 }]} numberOfLines={1}>{selectedKey.boundDeviceId}</Text>
                </View>
              )}
            </View>

            <View style={[styles.profileActionsSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.profileSectionTitle, { color: colors.text }]}>Actions</Text>

              <ProfileAction
                icon={<Calendar size={18} color="#10b981" />}
                label="Extend Expiry"
                sublabel={new Date(selectedKey.expiresAt).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                colors={colors}
                onPress={openExpiryPopup}
              />
              <ProfileAction
                icon={<Users size={18} color="#8b5cf6" />}
                label="Change Account Limit"
                sublabel={`Current: ${selectedKey.maxAccounts}`}
                colors={colors}
                onPress={openLimitPopup}
              />
              <ProfileAction
                icon={<Key size={18} color={typeColor.color} />}
                label="Change Key Type"
                sublabel={selectedKey.keyType.charAt(0).toUpperCase() + selectedKey.keyType.slice(1)}
                colors={colors}
                onPress={openTypePopup}
              />
              {selectedKey.boundDeviceId && (
                <ProfileAction
                  icon={<RotateCcw size={18} color="#f59e0b" />}
                  label="Reset Device Binding"
                  sublabel="Unbind current device"
                  colors={colors}
                  onPress={profileResetDevice}
                />
              )}
              <ProfileAction
                icon={selectedKey.isActive ? <PowerOff size={18} color="#f87171" /> : <Power size={18} color="#4ade80" />}
                label={selectedKey.isActive ? "Deactivate Key" : "Activate Key"}
                sublabel={selectedKey.isActive ? "Disable this license" : "Re-enable this license"}
                colors={colors}
                onPress={profileToggleActive}
              />
            </View>

            <View style={[styles.profileActionsSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.profileSectionTitle, { color: colors.text }]}>Data</Text>

              <ProfileAction
                icon={<QrCode size={18} color="#3b82f6" />}
                label="QR Code"
                sublabel={showQr ? "Hide QR code" : "Show scannable QR"}
                colors={colors}
                onPress={() => setShowQr(!showQr)}
              />
              {showQr && (
                <View style={{ alignItems: "center", paddingVertical: 16 }}>
                  <View style={{ backgroundColor: "#fff", padding: 20, borderRadius: 16 }}>
                    <QRCode value={selectedKey.key} size={200} backgroundColor="#fff" color="#000" />
                  </View>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.textSecondary, marginTop: 10 }}>
                    Scan to activate this key
                  </Text>
                </View>
              )}

              <ProfileAction
                icon={cookieLoading ? <ActivityIndicator size={18} color="#f59e0b" /> : <Cookie size={18} color="#f59e0b" />}
                label="Synced Cookies"
                sublabel={profileCookies.length > 0 ? (showCookies ? `${profileCookies.length} account${profileCookies.length > 1 ? "s" : ""} — tap to hide` : `${profileCookies.length} account${profileCookies.length > 1 ? "s" : ""} — tap to show`) : "Tap to load"}
                colors={colors}
                onPress={profileLoadCookies}
              />
              {showCookies && profileCookies.length > 0 && (
                <View style={{ paddingLeft: 8, gap: 8, marginTop: 4 }}>
                  {profileCookies.map((c: any, idx: number) => {
                    let parsedCookies: Record<string, string> = {};
                    try {
                      parsedCookies = typeof c.cookies === "string" ? JSON.parse(c.cookies) : c.cookies;
                    } catch {
                      parsedCookies = {};
                    }
                    const cookieStr = Object.entries(parsedCookies).map(([k, v]) => `${k}=${v}`).join("; ");
                    const hoursAgo = c.updatedAt ? Math.round((Date.now() - new Date(c.updatedAt).getTime()) / 3600000) : null;
                    const ageColor = hoursAgo === null ? colors.textMuted : hoursAgo < 12 ? "#4ade80" : hoursAgo < 48 ? "#fbbf24" : "#f87171";
                    const ageText = hoursAgo === null ? "" : hoursAgo < 1 ? "just now" : `${hoursAgo}h ago`;
                    return (
                      <View key={c.id || idx} style={{ backgroundColor: colors.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text }} numberOfLines={1}>
                              {c.accountName || c.accountEmail}
                            </Text>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textSecondary, flexShrink: 1 }} numberOfLines={1}>
                                {c.accountEmail}
                              </Text>
                              {ageText ? (
                                <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: ageColor }}>{ageText}</Text>
                              ) : null}
                            </View>
                          </View>
                          <View style={{ flexDirection: "row", gap: 6 }}>
                            <Pressable
                              onPress={() => {
                                const parsed = typeof c.cookies === "string" ? JSON.parse(c.cookies) : c.cookies;
                                setCookieBrowserPayload(parsed, c.accountName || c.accountEmail);
                                router.push("/cookie-browser");
                              }}
                              style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#4ade8022", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
                            >
                              <LogIn size={12} color="#4ade80" />
                              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#4ade80" }}>Login</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => {
                                Clipboard.setStringAsync(cookieStr);
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                              }}
                              style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#3b82f622", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
                            >
                              <Copy size={12} color="#3b82f6" />
                              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#3b82f6" }}>Copy</Text>
                            </Pressable>
                          </View>
                        </View>
                        <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.textSecondary }} numberOfLines={3}>
                          {cookieStr || "Empty cookies"}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
              <Pressable
                onPress={() => setDeletePopup(true)}
                style={({ pressed }) => [
                  styles.deleteBtn,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Trash2 size={18} color="#fff" />
                <Text style={styles.deleteBtnText}>Delete Key Permanently</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <ArrowLeft size={22} color={colors.text} />
            </Pressable>
            <Shield size={24} color="#3b82f6" />
            <Text style={[styles.title, { color: colors.text }]}>Admin Panel</Text>
          </View>
          <Pressable
              onPress={loadKeys}
              style={[styles.refreshBtn, { backgroundColor: colors.surfaceSecondary }]}
            >
              <RefreshCw size={20} color={colors.text} />
            </Pressable>
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <Pressable
            onPress={() => setActiveTab("keys")}
            style={[styles.tabBtn, { backgroundColor: activeTab === "keys" ? "#3b82f6" : colors.surfaceSecondary, borderColor: activeTab === "keys" ? "#3b82f6" : colors.border }]}
          >
            <Key size={14} color={activeTab === "keys" ? "#fff" : colors.textSecondary} />
            <Text style={[styles.tabBtnText, { color: activeTab === "keys" ? "#fff" : colors.textSecondary }]}>Keys</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("config")}
            style={[styles.tabBtn, { backgroundColor: activeTab === "config" ? "#3b82f6" : colors.surfaceSecondary, borderColor: activeTab === "config" ? "#3b82f6" : colors.border }]}
          >
            <Settings size={14} color={activeTab === "config" ? "#fff" : colors.textSecondary} />
            <Text style={[styles.tabBtnText, { color: activeTab === "config" ? "#fff" : colors.textSecondary }]}>Feature Config</Text>
          </Pressable>
        </View>
      </View>

      {activeTab === "keys" ? (
      <>
      <View style={[styles.createSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowCreateForm((p) => !p);
          }}
          style={styles.createToggle}
        >
          <View style={styles.createToggleLeft}>
            <Plus size={16} color={showCreateForm ? "#3b82f6" : colors.textSecondary} />
            <Text style={[styles.createTitle, { color: colors.text }]}>Create New Key</Text>
          </View>
          <ChevronRight
            size={16}
            color={colors.textSecondary}
            style={{ transform: [{ rotate: showCreateForm ? "90deg" : "0deg" }] }}
          />
        </Pressable>

        {showCreateForm && (
          <>
            <View style={[styles.createDivider, { backgroundColor: colors.border }]} />
            <View style={styles.createFormBody}>
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
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Duration</Text>
                  <TextInput
                    style={[styles.fieldInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                    keyboardType="number-pad"
                    value={newExpAmount}
                    onChangeText={setNewExpAmount}
                  />
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                {(["days", "months", "years"] as const).map((u) => {
                  const selected = newExpUnit === u;
                  return (
                    <Pressable
                      key={u}
                      onPress={() => setNewExpUnit(u)}
                      style={[
                        styles.typeChip,
                        {
                          backgroundColor: selected ? "#3b82f622" : colors.background,
                          borderColor: selected ? "#3b82f6" : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.typeChipText, { color: selected ? "#3b82f6" : colors.textSecondary }]}>
                        {u.charAt(0).toUpperCase() + u.slice(1)}
                      </Text>
                    </Pressable>
                  );
                })}
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
          </>
        )}
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
          renderItem={renderKeyCard}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}
      </>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20 }}
        >
          {configLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3b82f6" />
            </View>
          ) : (
            featureConfigs.map((cfg) => {
              const typeColor = KEY_TYPE_COLORS[cfg.keyType as KeyType] || KEY_TYPE_COLORS.basic;
              return (
                <View key={cfg.keyType} style={[styles.keyCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 12 }]}>
                  <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: typeColor.color, marginBottom: 12 }}>
                    {cfg.keyType.toUpperCase()}
                  </Text>
                  <View style={{ gap: 10 }}>
                    <ConfigRow
                      label="Max Accounts"
                      value={cfg.maxAccounts}
                      colors={colors}
                      onUpdate={(v) => updateFeatureConfig(cfg.keyType, { maxAccounts: v })}
                    />
                    <ConfigRow
                      label="Max Searches"
                      value={cfg.maxSearches}
                      colors={colors}
                      onUpdate={(v) => updateFeatureConfig(cfg.keyType, { maxSearches: v })}
                    />
                    <ConfigRow
                      label="Min Delay (sec)"
                      value={cfg.minDelaySeconds}
                      colors={colors}
                      onUpdate={(v) => updateFeatureConfig(cfg.keyType, { minDelaySeconds: v })}
                    />
                    <ConfigToggle
                      label="Background"
                      value={cfg.backgroundEnabled}
                      colors={colors}
                      onToggle={(v) => updateFeatureConfig(cfg.keyType, { backgroundEnabled: v })}
                    />
                    <ConfigToggle
                      label="Custom Queries"
                      value={cfg.customQueriesEnabled}
                      colors={colors}
                      onToggle={(v) => updateFeatureConfig(cfg.keyType, { customQueriesEnabled: v })}
                    />
                    <ConfigToggle
                      label="Daily Set"
                      value={cfg.dailySetEnabled}
                      colors={colors}
                      onToggle={(v) => updateFeatureConfig(cfg.keyType, { dailySetEnabled: v })}
                    />
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {renderKeyProfile()}

      <CustomAlert
        visible={deletePopup}
        title="Delete Key"
        message={`Are you sure you want to permanently delete this key?\n\n${selectedKey?.key ?? ""}`}
        icon={<View style={popupStyles.iconCircleRed}><Trash2 size={24} color="#fff" /></View>}
        onDismiss={() => setDeletePopup(false)}
        buttons={[
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: confirmDeleteKey },
        ]}
      />

      <CustomAlert
        visible={errorPopup.visible}
        title={errorPopup.title}
        message={errorPopup.message}
        icon={<View style={popupStyles.iconCircleOrange}><AlertTriangle size={24} color="#fff" /></View>}
        onDismiss={() => setErrorPopup({ visible: false, title: "", message: "" })}
        buttons={[{ text: "OK", style: "default" }]}
      />

      <CustomAlert
        visible={successPopup.visible}
        title={successPopup.title}
        icon={<View style={popupStyles.iconCircleGreen}><Check size={24} color="#fff" /></View>}
        onDismiss={() => setSuccessPopup({ visible: false, title: "", message: "" })}
        buttons={
          successPopup.copyText
            ? [
                { text: "Copy Key", style: "default", onPress: () => { if (successPopup.copyText) Clipboard.setStringAsync(successPopup.copyText); } },
                { text: "Done", style: "cancel" },
              ]
            : [{ text: "OK", style: "default" }]
        }
      >
        <View style={popupStyles.keyDisplay}>
          <Text style={popupStyles.keyDisplayText}>{successPopup.message}</Text>
        </View>
      </CustomAlert>

      <CustomAlert
        visible={typePopup}
        title="Change Key Type"
        message={`Current: ${selectedKey?.keyType?.toUpperCase() ?? ""}`}
        icon={<View style={popupStyles.iconCircleBlue}><Key size={24} color="#fff" /></View>}
        onDismiss={() => setTypePopup(false)}
        buttons={[]}
      >
        <View style={popupStyles.optionGrid}>
          {KEY_TYPES.map((t) => {
            const tc = KEY_TYPE_COLORS[t];
            const isSelected = selectedKey?.keyType === t;
            return (
              <Pressable
                key={t}
                onPress={() => submitType(t)}
                style={[
                  popupStyles.optionChip,
                  {
                    backgroundColor: isSelected ? tc.bg : "rgba(255,255,255,0.05)",
                    borderColor: isSelected ? tc.color : "rgba(255,255,255,0.1)",
                  },
                ]}
              >
                {isSelected && <Check size={14} color={tc.color} />}
                <Text style={[popupStyles.optionChipText, { color: isSelected ? tc.color : "#94a3b8" }]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </CustomAlert>

      <CustomAlert
        visible={limitPopup}
        title="Set Account Limit"
        message={`Current: ${selectedKey?.maxAccounts ?? 0} accounts`}
        icon={<View style={popupStyles.iconCirclePurple}><Users size={24} color="#fff" /></View>}
        onDismiss={() => setLimitPopup(false)}
        buttons={[
          { text: "Cancel", style: "cancel" },
          { text: "Save", style: "default", onPress: () => submitLimit(parseInt(limitInput)) },
        ]}
      >
        <View style={popupStyles.inputSection}>
          <View style={popupStyles.presetRow}>
            {[1, 2, 3, 5, 10, 20, 50].map((n) => (
              <Pressable
                key={n}
                onPress={() => setLimitInput(String(n))}
                style={[
                  popupStyles.presetChip,
                  limitInput === String(n) && popupStyles.presetChipActive,
                ]}
              >
                <Text style={[popupStyles.presetChipText, limitInput === String(n) && popupStyles.presetChipTextActive]}>
                  {n}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={popupStyles.customInputRow}>
            <Text style={popupStyles.customInputLabel}>Custom:</Text>
            <TextInput
              style={popupStyles.customInput}
              keyboardType="number-pad"
              value={limitInput}
              onChangeText={setLimitInput}
              placeholder="Enter number"
              placeholderTextColor="#64748b"
              selectTextOnFocus
            />
          </View>
        </View>
      </CustomAlert>

      <CustomAlert
        visible={expiryPopup}
        title="Set Expiry Date"
        message={selectedKey ? `Current: ${new Date(selectedKey.expiresAt).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}
        icon={<View style={popupStyles.iconCircleTeal}><Calendar size={24} color="#fff" /></View>}
        onDismiss={() => setExpiryPopup(false)}
        buttons={[
          { text: "Cancel", style: "cancel" },
          { text: "Save", style: "default", onPress: submitExpiry },
        ]}
      >
        <View style={popupStyles.inputSection}>
          <View style={popupStyles.dateRow}>
            <View style={popupStyles.dateField}>
              <Text style={popupStyles.dateLabel}>Year</Text>
              <TextInput
                style={popupStyles.dateInput}
                keyboardType="number-pad"
                value={expiryYear}
                onChangeText={setExpiryYear}
                maxLength={4}
                placeholder="2025"
                placeholderTextColor="#64748b"
                selectTextOnFocus
              />
            </View>
            <View style={popupStyles.dateField}>
              <Text style={popupStyles.dateLabel}>Month</Text>
              <TextInput
                style={popupStyles.dateInput}
                keyboardType="number-pad"
                value={expiryMonth}
                onChangeText={setExpiryMonth}
                maxLength={2}
                placeholder="01"
                placeholderTextColor="#64748b"
                selectTextOnFocus
              />
            </View>
            <View style={popupStyles.dateField}>
              <Text style={popupStyles.dateLabel}>Day</Text>
              <TextInput
                style={popupStyles.dateInput}
                keyboardType="number-pad"
                value={expiryDay}
                onChangeText={setExpiryDay}
                maxLength={2}
                placeholder="01"
                placeholderTextColor="#64748b"
                selectTextOnFocus
              />
            </View>
          </View>
          <View style={popupStyles.quickDateRow}>
            {[
              { label: "+30d", days: 30 },
              { label: "+90d", days: 90 },
              { label: "+6m", days: 180 },
              { label: "+1y", days: 365 },
              { label: "+2y", days: 730 },
            ].map((opt) => (
              <Pressable
                key={opt.label}
                onPress={() => {
                  const base = selectedKey ? new Date(selectedKey.expiresAt) : new Date();
                  const target = base > new Date() ? base : new Date();
                  target.setDate(target.getDate() + opt.days);
                  setExpiryYear(String(target.getFullYear()));
                  setExpiryMonth(String(target.getMonth() + 1).padStart(2, "0"));
                  setExpiryDay(String(target.getDate()).padStart(2, "0"));
                }}
                style={popupStyles.quickDateChip}
              >
                <Text style={popupStyles.quickDateText}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </CustomAlert>
    </View>
  );
}

function ProfileAction({ icon, label, sublabel, colors, onPress }: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  colors: any;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.profileAction,
        { backgroundColor: pressed ? colors.surfaceSecondary : "transparent" },
      ]}
    >
      <View style={styles.profileActionIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.profileActionLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.profileActionSublabel, { color: colors.textSecondary }]}>{sublabel}</Text>
      </View>
      <ChevronRight size={16} color={colors.textSecondary} />
    </Pressable>
  );
}

function ConfigRow({ label, value, colors, onUpdate }: { label: string; value: number; colors: any; onUpdate: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.textSecondary }}>{label}</Text>
      <TextInput
        style={{
          width: 70,
          height: 34,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
          color: colors.text,
          textAlign: "center",
          fontSize: 14,
          fontFamily: "Inter_600SemiBold",
        }}
        value={text}
        onChangeText={setText}
        onBlur={() => {
          const n = parseInt(text);
          if (!isNaN(n) && n > 0 && n !== value) onUpdate(n);
          else setText(String(value));
        }}
        keyboardType="number-pad"
        selectTextOnFocus
      />
    </View>
  );
}

function ConfigToggle({ label, value, colors, onToggle }: { label: string; value: boolean; colors: any; onToggle: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.textSecondary }}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: "#3b82f6" }}
        thumbColor="#fff"
      />
    </View>
  );
}

const popupStyles = StyleSheet.create({
  iconCircleRed: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleOrange: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#f59e0b",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleGreen: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleBlue: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCirclePurple: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#8b5cf6",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleTeal: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
  },
  keyDisplay: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.2)",
  },
  keyDisplayText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#3b82f6",
    letterSpacing: 2,
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    justifyContent: "center",
  },
  optionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  optionChipText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  inputSection: {
    marginTop: 8,
    gap: 12,
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  presetChipActive: {
    backgroundColor: "rgba(139, 92, 246, 0.15)",
    borderColor: "#8b5cf6",
  },
  presetChipText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#94a3b8",
  },
  presetChipTextActive: {
    color: "#8b5cf6",
  },
  customInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  customInputLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#94a3b8",
  },
  customInput: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    textAlign: "center",
  },
  dateRow: {
    flexDirection: "row",
    gap: 10,
  },
  dateField: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#94a3b8",
    marginBottom: 4,
    textAlign: "center",
  },
  dateInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 8,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    textAlign: "center",
  },
  quickDateRow: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
  },
  quickDateChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.25)",
  },
  quickDateText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#10b981",
  },
});

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
  refreshBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  tabBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  createSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  createToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  createToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  createDivider: { height: 1 },
  createFormBody: { padding: 16 },
  createTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
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
  keyText: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  metaRow: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
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
  profileContainer: { flex: 1 },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  profileCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  profileTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  profileKeySection: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
  },
  profileKeyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  profileKeyText: {
    fontSize: 20,
    fontFamily: "Inter_800ExtraBold",
    color: "#3b82f6",
    letterSpacing: 2,
  },
  profileInfoGrid: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  profileInfoItem: {
    width: "48%",
    paddingVertical: 8,
  },
  profileInfoLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginBottom: 2,
  },
  profileInfoValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  profileActionsSection: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  profileSectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  profileAction: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 14,
  },
  profileActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff08",
  },
  profileActionLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  profileActionSublabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  deleteBtn: {
    backgroundColor: "#dc2626",
    height: 48,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  deleteBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
