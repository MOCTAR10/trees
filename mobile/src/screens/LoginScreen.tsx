import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Eye, EyeOff, Fingerprint, LockKeyhole, LogIn } from "lucide-react-native";

import { checkEmail, EmailCheckResponse, getMe, login, setAuthToken } from "../api/client";
import { fr } from "../i18n/fr";
import { Session } from "../storage/session";
import { colors, spacing, type } from "../theme";

const LEAF_LOGO = require("../../assets/leaf_logo.jpg");
const GREENLEAVE_LOGO = require("../../assets/greenleave_logo.png");

interface Props {
  onLogin: (session: Session) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen({ onLogin }: Props) {
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(false);
  const [identity, setIdentity] = useState<EmailCheckResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cardWidth = Math.min(width - spacing.lg * 2, 360);

  const verifyEmail = async () => {
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setError(fr.auth.emailInvalid);
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const found = await checkEmail(value);
      setIdentity(found);
      setVerified(true);
    } catch (err) {
      console.error("check-email failed", err);
      setIdentity(null);
      setVerified(false);
      setError(fr.auth.emailNotFound);
    } finally {
      setChecking(false);
    }
  };

  const submit = async () => {
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await login(email.trim(), password);
      setAuthToken(resp.access_token);
      const user = await getMe();
      onLogin({ token: resp.access_token, user });
    } catch (err) {
      console.error("login failed", err);
      setAuthToken(null);
      setError(fr.auth.error);
    } finally {
      setBusy(false);
    }
  };

  const roleLabel = identity
    ? (fr.roles[identity.role as keyof typeof fr.roles] ?? identity.role)
    : null;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <View style={styles.officialSection}>
          <View style={styles.emblem}>
            <Image source={LEAF_LOGO} style={styles.emblemSeal} resizeMode="contain" />
          </View>
          <Text style={styles.republicText}>{fr.auth.republic}</Text>
          <Text style={styles.ministryText}>{fr.auth.official}</Text>
          <View style={styles.tricolor}>
            <View style={[styles.tricolorStripe, { backgroundColor: colors.flagGreen }]} />
            <View style={[styles.tricolorStripe, { backgroundColor: colors.flagGold }]} />
            <View style={[styles.tricolorStripe, { backgroundColor: colors.flagBlue }]} />
          </View>
        </View>

        <View style={[styles.card, { width: cardWidth }]}>
          <Text style={styles.title}>{fr.appTitle}</Text>
          <Text style={styles.subtitle}>{fr.auth.subtitle}</Text>

          <View style={styles.form}>
            <View style={styles.verifyRow}>
              <TextInput
                style={styles.input}
                placeholder={fr.auth.email}
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                value={email}
                onChangeText={setEmail}
                onSubmitEditing={verifyEmail}
                editable={!checking}
                accessibilityLabel={fr.auth.email}
              />
              <TouchableOpacity
                style={styles.verifyButton}
                testID="verify-button"
                onPress={verifyEmail}
                disabled={checking}
                accessibilityRole="button"
                accessibilityLabel={fr.auth.verify}
                accessibilityState={{ disabled: checking }}
              >
                {checking ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : identity ? (
                  <View style={styles.checkCircle}>
                    <Text style={styles.checkMark}>✓</Text>
                  </View>
                ) : (
                  <Fingerprint size={34} color={colors.primary} strokeWidth={2.25} />
                )}
              </TouchableOpacity>
            </View>

            {identity ? (
              <View style={styles.identityRow}>
                <View style={styles.checkCircle}>
                  <Text style={styles.checkMark}>✓</Text>
                </View>
                <View style={styles.identityTexts}>
                  <Text style={styles.identityText}>
                    {fr.auth.roleFound} · {roleLabel}
                  </Text>
                  {identity.organization ? (
                    <Text style={styles.identityOrg} testID="identity-organization">
                      {fr.auth.linkedTo} · {identity.organization}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {verified ? (
              <>
                <Text style={[styles.label, styles.passwordLabel]}>{fr.auth.password}</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder={fr.auth.password}
                    placeholderTextColor={colors.textDim}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="password"
                    value={password}
                    onChangeText={setPassword}
                    onSubmitEditing={submit}
                    accessibilityLabel={fr.auth.password}
                  />
                  <TouchableOpacity
                    style={styles.eye}
                    onPress={() => setShowPassword((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? fr.auth.hidePassword : fr.auth.showPassword}
                  >
                    {showPassword ? (
                      <EyeOff size={18} color={colors.accent} strokeWidth={2} />
                    ) : (
                      <Eye size={18} color={colors.accent} strokeWidth={2} />
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : null}

            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}

            {verified ? (
              <TouchableOpacity
                style={[styles.button, busy && styles.buttonDisabled]}
                onPress={submit}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={fr.auth.submit}
                accessibilityState={{ disabled: busy }}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <View style={styles.buttonRow}>
                    <LogIn size={18} color="#FFFFFF" strokeWidth={2} />
                    <Text style={styles.buttonText}>{fr.auth.submit}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={styles.notice}>
          <LockKeyhole size={18} color={colors.textDim} strokeWidth={2} />
          <Text style={styles.noticeText}>{fr.auth.footer}</Text>
        </View>

        <Text style={styles.version}>{fr.auth.version}</Text>

        <View style={styles.brandFooter}>
          <View style={styles.brandRow}>
            <Image source={GREENLEAVE_LOGO} style={styles.brandLogo} resizeMode="contain" />
            <Text style={styles.brandName}>Green Leave Gabon</Text>
          </View>
          <Text style={styles.copyright}>{fr.auth.copyright}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    paddingBottom: spacing.xl + 40,
  },
  officialSection: {
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  emblem: {
    backgroundColor: colors.surfaceAlt,
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  emblemSeal: { width: 128, height: 86 },
  republicText: {
    color: colors.textDim,
    fontSize: type.caption,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textAlign: "center",
  },
  ministryText: {
    color: colors.text,
    fontSize: type.heading,
    fontWeight: "800",
    textTransform: "uppercase",
    textAlign: "center",
    marginTop: spacing.xs,
  },
  tricolor: {
    flexDirection: "row",
    width: 132,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: spacing.md,
  },
  tricolorStripe: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.sm,
    alignItems: "stretch",
  },
  title: { color: colors.text, fontSize: type.title, fontWeight: "800", textAlign: "center" },
  subtitle: {
    color: colors.textDim,
    fontSize: type.body,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  form: { alignItems: "stretch" },
  label: {
    color: colors.text,
    fontSize: type.caption,
    fontWeight: "700",
    marginBottom: 2,
  },
  passwordLabel: { marginTop: spacing.md },
  verifyRow: { flexDirection: "row", alignItems: "stretch" },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: type.body,
  },
  verifyButton: {
    justifyContent: "center",
    alignItems: "center",
    marginLeft: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.flagGold,
    width: 48,
    height: 48,
    minWidth: 48,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark: { color: "#FFFFFF", fontSize: 13, fontWeight: "900", lineHeight: 15 },
  identityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 4,
    gap: 4,
  },
  identityTexts: { flex: 1 },
  identityText: { color: colors.success, fontSize: type.caption, fontWeight: "700" },
  identityOrg: { color: colors.textDim, fontSize: type.caption, marginTop: 2 },
  passwordRow: { flexDirection: "row", alignItems: "stretch" },
  passwordInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: type.body,
  },
  eye: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minWidth: 72,
  },
  error: {
    color: colors.error,
    fontSize: type.caption,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  button: {
    backgroundColor: colors.flagGreen,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  buttonText: { color: "#FFFFFF", fontSize: type.body, fontWeight: "800" },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "center",
    maxWidth: 340,
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  noticeText: {
    flex: 1,
    color: colors.textDim,
    fontSize: type.caption,
    lineHeight: 18,
  },
  version: {
    color: colors.textDim,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.md,
  },
  brandFooter: {
    marginTop: spacing.xl,
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    width: "100%",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  brandLogo: { width: 22, height: 22, marginRight: spacing.sm },
  brandName: { color: colors.textDim, fontSize: type.caption, fontWeight: "700" },
  copyright: { color: colors.textDim, fontSize: 11, textAlign: "center", lineHeight: 16 },
});