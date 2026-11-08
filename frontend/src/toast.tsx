import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, radius, useTheme } from "@/src/theme";

type Toast = { msg: string; kind: "info" | "error" | "success" };
const ToastCtx = createContext<(msg: string, kind?: Toast["kind"]) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const show = useCallback((msg: string, kind: Toast["kind"] = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, kind });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const bg = toast?.kind === "error" ? colors.error : toast?.kind === "success" ? colors.success : colors.surfaceInverse;
  const fg = toast?.kind === "error" ? colors.onError : toast?.kind === "success" ? colors.onSuccess : colors.onSurfaceInverse;

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOutDown.duration(180)}
          pointerEvents="none"
          testID="toast-message"
          style={[styles.toast, { top: insets.top + 12, backgroundColor: bg }]}
        >
          <Text style={[styles.text, { color: fg }]}>{toast.msg}</Text>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  text: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
});
