import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Button, Eyebrow, Field, IconButton, errMsg } from "@/src/components/ui";
import { fonts, makeStyles, space } from "@/src/theme";
import { useToast } from "@/src/toast";

type Mode = "signin" | "signup" | "forgot" | "reset";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");

  const close = () => (router.canGoBack() ? router.back() : router.replace("/shelf"));

  const submit = async () => {
    const e: Record<string, string> = {};
    if (mode !== "reset" && !EMAIL.test(email.trim())) e.email = "Enter a valid email address";
    if (mode === "signup" && !name.trim()) e.name = "Enter your display name";
    if ((mode === "signin" && !password) || ((mode === "signup" || mode === "reset") && password.length < 8)) e.password = "Password must be at least 8 characters";
    if (mode === "reset" && code.trim().length < 10) e.code = "Enter the reset code from your email";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (mode === "signin") { await login(email.trim(), password); toast("Welcome back", "success"); close(); }
      else if (mode === "signup") { await register(name.trim(), email.trim(), password); toast("Your library card is ready", "success"); close(); }
      else if (mode === "forgot") {
        const r = await api<{ message: string; email_configured: boolean }>("/auth/forgot-password", { method: "POST", body: { email: email.trim() } });
        setInfo(r.email_configured ? r.message : "Password-reset emails are not switched on yet for this library. Please contact the library team via Help Centre; an administrator can help you regain access.");
      } else {
        await api("/auth/reset-password", { method: "POST", body: { token: code.trim(), password } });
        toast("Password updated — please sign in", "success"); setMode("signin"); setPassword("");
      }
    } catch (err) { toast(errMsg(err), "error"); } finally { setBusy(false); }
  };

  const titles: Record<Mode, string> = { signin: "Welcome back", signup: "Create your library card", forgot: "Reset your password", reset: "Choose a new password" };

  return (
    <View style={styles.root} testID="auth-screen">
      <View style={[styles.top, { paddingTop: insets.top + space.xs }]}>
        <IconButton testID="auth-close-button" name="x" onPress={close} />
      </View>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: insets.bottom + space.xxl }}>
        <Eyebrow>OpenBook Library</Eyebrow>
        <Text style={styles.title} testID="auth-title">{titles[mode]}</Text>
        <Text style={styles.sub}>
          {mode === "signin" || mode === "signup" ? "An account syncs your reading progress, bookmarks, saved books and preferences. Browsing never needs one." : mode === "forgot" ? "Enter your account email and we'll send a reset code." : "Paste the code from your email and set a new password."}
        </Text>
        {mode === "signup" && <Field testID="auth-name-input" label="Display name" value={name} onChangeText={setName} error={errors.name} maxLength={60} autoComplete="name" />}
        {mode !== "reset" && <Field testID="auth-email-input" label="Email" value={email} onChangeText={setEmail} error={errors.email} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />}
        {mode === "reset" && <Field testID="auth-code-input" label="Reset code" value={code} onChangeText={setCode} error={errors.code} autoCapitalize="none" />}
        {mode !== "forgot" && <Field testID="auth-password-input" label={mode === "reset" ? "New password" : "Password"} value={password} onChangeText={setPassword} error={errors.password} secureTextEntry autoCapitalize="none" onSubmitEditing={submit} />}
        {!!info && <Text style={styles.info} testID="auth-info">{info}</Text>}
        <Button testID="auth-submit-button" label={{ signin: "Sign in", signup: "Create account", forgot: "Send reset code", reset: "Update password" }[mode]} loading={busy} onPress={submit} style={{ marginTop: space.sm }} />

        <View style={styles.links}>
          {mode === "signin" && <>
            <Link testID="auth-to-signup" label="New here? Create an account" onPress={() => { setMode("signup"); setErrors({}); }} />
            <Link testID="auth-to-forgot" label="Forgot your password?" onPress={() => { setMode("forgot"); setErrors({}); setInfo(""); }} />
          </>}
          {mode === "signup" && <Link testID="auth-to-signin" label="Already have an account? Sign in" onPress={() => { setMode("signin"); setErrors({}); }} />}
          {mode === "forgot" && <>
            <Link testID="auth-to-reset" label="I already have a reset code" onPress={() => { setMode("reset"); setErrors({}); }} />
            <Link testID="auth-back-signin" label="Back to sign in" onPress={() => { setMode("signin"); setErrors({}); }} />
          </>}
          {mode === "reset" && <Link testID="auth-back-signin" label="Back to sign in" onPress={() => { setMode("signin"); setErrors({}); }} />}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

function Link({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  const styles = useStyles();
  return <Pressable testID={testID} onPress={onPress} style={styles.link}><Text style={styles.linkText}>{label}</Text></Pressable>;
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  top: { paddingHorizontal: space.sm, alignItems: "flex-end" },
  title: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, color: c.onSurface, marginTop: space.sm },
  sub: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: c.muted, marginTop: space.sm, marginBottom: space.xl },
  info: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: c.onSurface, backgroundColor: c.brandTertiary, padding: space.md, borderRadius: 8, marginBottom: space.lg },
  links: { marginTop: space.xl, gap: space.xs },
  link: { minHeight: 44, justifyContent: "center" },
  linkText: { fontFamily: fonts.medium, fontSize: 14, color: c.brandPrimary },
}));
