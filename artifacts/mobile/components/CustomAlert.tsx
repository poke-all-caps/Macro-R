import { LinearGradient } from "expo-linear-gradient";
import { X } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import Colors from "@/constants/colors";

export interface AlertButton {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  onDismiss?: () => void;
  children?: React.ReactNode;
  showCloseButton?: boolean;
  icon?: React.ReactNode;
}

export function CustomAlert({
  visible,
  title,
  message,
  buttons,
  onDismiss,
  children,
  showCloseButton = true,
  icon,
}: CustomAlertProps) {
  const scheme = useColorScheme() ?? "dark";
  const colors = Colors[scheme];
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          speed: 18,
          bounciness: 4,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const resolvedButtons = buttons ?? [{ text: "OK", style: "default" }];

  const getButtonColors = (style?: string): [string, string] => {
    if (style === "destructive") return ["#EF4444", "#DC2626"];
    if (style === "cancel") return [colors.surfaceSecondary, colors.surfaceSecondary];
    return ["#3B82F6", "#1D4ED8"];
  };

  const getButtonTextColor = (style?: string): string => {
    if (style === "cancel") return colors.textSecondary;
    return "#fff";
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
        <Pressable style={styles.overlayPress} onPress={onDismiss} />
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              transform: [{ scale: scaleAnim }],
              shadowColor: "#000",
            },
          ]}
        >
          {showCloseButton && (
            <Pressable
              onPress={onDismiss}
              style={[styles.closeButton, { backgroundColor: colors.surfaceSecondary }]}
              hitSlop={8}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <X size={16} color={colors.textSecondary} />
            </Pressable>
          )}

          <View style={styles.content}>
            {icon && <View style={styles.iconContainer}>{icon}</View>}
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            {message ? (
              <Text style={[styles.message, { color: colors.textSecondary }]}>
                {message}
              </Text>
            ) : null}
            {children}
          </View>

          {resolvedButtons.length > 0 && (
            <View style={styles.buttonRow}>
              {resolvedButtons.map((btn, i) => {
                const gradientColors = getButtonColors(btn.style);
                const textColor = getButtonTextColor(btn.style);
                const isGradient = btn.style !== "cancel";

                return (
                  <Pressable
                    key={i}
                    onPress={() => {
                      btn.onPress?.();
                      onDismiss?.();
                    }}
                    style={({ pressed }) => [
                      styles.button,
                      resolvedButtons.length === 1 && { flex: 1 },
                      { opacity: pressed ? 0.8 : 1 },
                    ]}
                  >
                    {isGradient ? (
                      <LinearGradient
                        colors={gradientColors}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.buttonGradient}
                      >
                        <Text style={[styles.buttonText, { color: textColor }]}>
                          {btn.text}
                        </Text>
                      </LinearGradient>
                    ) : (
                      <View
                        style={[
                          styles.buttonGradient,
                          { backgroundColor: gradientColors[0] },
                        ]}
                      >
                        <Text style={[styles.buttonText, { color: textColor }]}>
                          {btn.text}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

export function useCustomAlert() {
  const [alertState, setAlertState] = React.useState<{
    visible: boolean;
    title: string;
    message?: string;
    buttons?: AlertButton[];
    children?: React.ReactNode;
    icon?: React.ReactNode;
  }>({ visible: false, title: "" });

  const showAlert = (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    children?: React.ReactNode,
    icon?: React.ReactNode
  ) => {
    setAlertState({ visible: true, title, message, buttons, children, icon });
  };

  const hideAlert = () => {
    setAlertState((prev) => ({ ...prev, visible: false }));
  };

  const AlertComponent = (
    <CustomAlert
      visible={alertState.visible}
      title={alertState.title}
      message={alertState.message}
      buttons={alertState.buttons}
      onDismiss={hideAlert}
      icon={alertState.icon}
    >
      {alertState.children}
    </CustomAlert>
  );

  return { showAlert, hideAlert, AlertComponent };
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  overlayPress: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
    overflow: "hidden",
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  content: {
    padding: 24,
    paddingTop: 28,
    gap: 10,
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
  },
  buttonRow: {
    flexDirection: "row",
    padding: 16,
    paddingTop: 4,
    gap: 10,
  },
  button: {
    flex: 1,
  },
  buttonGradient: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
