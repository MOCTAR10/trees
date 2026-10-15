import React, { useRef, useState } from "react";
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
import { makeStyles, useTheme } from "../design/ThemeProvider";

/** Gabonese flag colours (fixed, not themed). */
const FLAG = { green: "#009E60", gold: "#FEED01", blue: "#4664B2" };

const LEAF_LOGO = require("../../assets/leaf_logo.jpg");
const FOREST = require("../../assets/login-forest.jpg");
const GREENLEAVE_LOGO = require("../../assets/greenleave_logo.png");

interface Props {
  onLogin: (session: Session) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen({ onLogin }: Props) {
  const th = useTheme();
  const styles = useStyles();
  const { width, height } = useWindowDimensions();
  // Fit the whole login (password step included) on screen without scrolling: the
  // official header keeps its full size; the notice and version sit right under the
  // form. Only small phones (< 700 px) get a compact header. The tallest height seen
  // is used, so the on-screen keyboard (which shrinks the window) changes nothing.
  const tallest = useRef(height);
  tallest.current = Math.max(tallest.current, height);
  // Landscape computer screens: the official header becomes a full-height panel on the
  // left (large seal and titles) and the form sits on the right — no shrinking needed.
  const split = width >= 900 && width > height;
  const compact = tallest.current < 700;
  const tight = tallest.current < 620;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(false);
  const [identity, setIdentity] = useState<EmailCheckResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cardWidth = Math.min(width - th.space.xl * 2, 360);

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

  const header = (
        <View
          style={[styles.officialSection, compact && !split && styles.officialCompact, split && styles.officialSplit]}
          testID="login-header"
        >
          {split ? (
            <Image source={FOREST} style={styles.forest} resizeMode="cover" accessibilityElementsHidden importantForAccessibility="no" />
          ) : null}
          <View style={[styles.emblem, compact && styles.emblemCompact]}>
            <Image
              source={LEAF_LOGO}
              style={[
                styles.emblemSeal,
                compact && !split && styles.emblemSealCompact,
                tight && !split && styles.emblemSealTight,
                split && styles.emblemSealSplit,
              ]}
              resizeMode="contain"
            />
          </View>
          <Text style={[styles.republicText, split && styles.republicSplit]}>{fr.auth.republic}</Text>
          <Text style={[styles.ministryText, compact && !split && styles.ministryCompact, split && styles.ministrySplit]}>
            {fr.auth.official}
          </Text>
          <View style={[styles.tricolor, compact && !split && styles.tricolorCompact, split && styles.tricolorSplit]}>
            <View style={[styles.tricolorStripe, { backgroundColor: FLAG.green }]} />
            <View style={[styles.tricolorStripe, { backgroundColor: FLAG.gold }]} />
            <View style={[styles.tricolorStripe, { backgroundColor: FLAG.blue }]} />
          </View>
          {split ? null : (
            <View style={styles.goldRule}>
              <View style={styles.goldLine} />
              <View style={styles.goldLine} />
            </View>
          )}
        </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.screen, split && styles.screenSplit]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {split ? header : null}
      <ScrollView
        contentContainerStyle={[styles.scroll, compact && styles.scrollCompact]}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        {split ? null : header}

        <View style={styles.middle}>
        <View style={[styles.card, compact && styles.cardCompact, { width: cardWidth }]}>
          <Text style={[styles.title, compact && styles.titleCompact]}>{fr.appTitle}</Text>
          <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>{fr.auth.subtitle}</Text>

          <View style={styles.form}>
            <View style={styles.verifyRow}>
              <TextInput
                style={styles.input}
                placeholder={fr.auth.email}
                placeholderTextColor={th.c.muted}
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
                  <ActivityIndicator color="#1B2114" size="small" />
                ) : identity ? (
                  <View style={styles.checkCircle}>
                    <Text style={styles.checkMark}>✓</Text>
                  </View>
                ) : (
                  <Fingerprint size={30} color="#1B2114" strokeWidth={2.25} />
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
                    placeholderTextColor={th.c.muted}
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
                      <EyeOff size={18} color={th.c.olive} strokeWidth={2} />
                    ) : (
                      <Eye size={18} color={th.c.olive} strokeWidth={2} />
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
                  <ActivityIndicator color={th.c.onOlive} />
                ) : (
                  <View style={styles.buttonRow}>
                    <LogIn size={18} color={th.c.onOlive} strokeWidth={2} />
                    <Text style={styles.buttonText}>{fr.auth.submit}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

          <View style={styles.footer} testID="login-footer">
              <View style={[styles.notice, compact && styles.noticeCompact]}>
                <LockKeyhole size={tight ? 14 : 16} color={th.c.muted} strokeWidth={2} />
                <Text style={[styles.noticeText, tight && styles.noticeTextTight]}>{fr.auth.footer}</Text>
              </View>
              <Text style={styles.version}>{`${fr.auth.version} · ${fr.auth.copyright}`}</Text>
            </View>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  scroll: {
    flexGrow: 1,
    alignItems: "center",
    paddingBottom: th.space.lg,
  },
  scrollCompact: { paddingBottom: th.space.sm },
  screenSplit: { flexDirection: "row" },
  forest: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%", opacity: 0.22 },
  officialSplit: {
    alignSelf: "stretch",
    width: "42%",
    maxWidth: 560,
    justifyContent: "center",
    marginBottom: 0,
    paddingHorizontal: th.space.xxl,
    borderRightWidth: 3,
    borderRightColor: th.c.gold,
    overflow: "hidden",
  },
  emblemSealSplit: { width: 220, height: 148 },
  republicSplit: { fontSize: 16, marginTop: th.space.md },
  ministrySplit: { fontSize: 38, lineHeight: 44 },
  tricolorSplit: { width: 180, height: 6, marginTop: th.space.xl },
  officialCompact: { paddingTop: th.space.lg, paddingBottom: th.space.lg, marginBottom: th.space.lg },
  emblemCompact: { marginBottom: th.space.sm },
  emblemSealCompact: { width: 84, height: 56 },
  emblemSealTight: { width: 60, height: 40 },
  ministryCompact: { fontSize: 20, lineHeight: 24 },
  tricolorCompact: { marginTop: th.space.sm, height: 4 },
  cardCompact: { paddingVertical: th.space.md },
  titleCompact: { fontSize: 22, lineHeight: 26 },
  subtitleCompact: { marginBottom: th.space.sm },
  middle: { flexGrow: 1, justifyContent: "center", alignItems: "center", alignSelf: "stretch" },
  footer: { alignItems: "center", alignSelf: "stretch", gap: th.space.xs, marginTop: th.space.md },
  noticeCompact: { paddingVertical: th.space.xs },
  noticeTextTight: { fontSize: 11 },
  versionCompact: { marginTop: th.space.sm },
  brandFooterCompact: { marginTop: th.space.sm },
  officialSection: {
    alignSelf: "stretch",
    alignItems: "center",
    backgroundColor: th.c.forest,
    paddingTop: th.space.xxl,
    paddingBottom: th.space.xl + 4,
    paddingHorizontal: th.space.xl,
    marginBottom: th.space.xl,
  },
  emblem: {
    borderRadius: th.radius.md,
    overflow: "hidden",
    marginBottom: th.space.lg,
  },
  emblemSeal: { width: 160, height: 108 },
  republicText: {
    color: th.c.gold,
    fontSize: 14,
    fontFamily: th.fonts.displaySemi,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    textAlign: "center",
  },
  ministryText: {
    color: th.c.onForest,
    fontSize: 30,
    lineHeight: 35,
    fontFamily: th.fonts.display,
    textAlign: "center",
    marginTop: th.space.xs,
  },
  tricolor: {
    flexDirection: "row",
    width: 132,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: th.space.lg,
  },
  tricolorStripe: { flex: 1 },
  goldRule: { position: "absolute", left: 0, right: 0, bottom: 0, height: 4, justifyContent: "space-between" },
  goldLine: { height: 1.5, backgroundColor: th.c.gold },
  card: {
    backgroundColor: th.c.surface,
    borderColor: th.c.line,
    borderWidth: 1,
    borderRadius: th.radius.xl,
    padding: th.space.lg,
    alignItems: "stretch",
    shadowColor: th.c.shadow,
    shadowOpacity: th.scheme === "dark" ? 0.4 : 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  title: { color: th.c.ink, fontSize: 26, lineHeight: 30, fontFamily: th.fonts.display, textAlign: "center" },
  subtitle: {
    color: th.c.muted,
    fontSize: 15,
    fontFamily: th.fonts.body,
    textAlign: "center",
    marginBottom: th.space.md,
  },
  form: { alignItems: "stretch" },
  label: {
    color: th.c.ink,
    fontSize: 12,
    fontFamily: th.fonts.bodyBold,
    marginBottom: 2,
  },
  passwordLabel: { marginTop: th.space.lg },
  verifyRow: { flexDirection: "row", alignItems: "stretch" },
  input: {
    flex: 1,
    minHeight: 52,
    backgroundColor: th.c.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: th.c.line,
    color: th.c.ink,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.sm,
    fontSize: 15,
    fontFamily: th.fonts.body,
  },
  verifyButton: {
    justifyContent: "center",
    alignItems: "center",
    marginLeft: th.space.sm,
    borderRadius: th.radius.md,
    backgroundColor: th.c.gold,
    width: 52,
    minHeight: 52,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: th.c.ok,
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark: { color: "#FFFFFF", fontSize: 13, fontFamily: th.fonts.bodyBold, lineHeight: 15 },
  identityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 4,
    gap: 4,
  },
  identityTexts: { flex: 1 },
  identityText: { color: th.c.ok, fontSize: 12, fontFamily: th.fonts.bodyBold },
  identityOrg: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body, marginTop: 2 },
  passwordRow: { flexDirection: "row", alignItems: "stretch" },
  passwordInput: {
    flex: 1,
    minHeight: 52,
    backgroundColor: th.c.bg,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: th.c.line,
    color: th.c.ink,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.sm,
    fontSize: 15,
    fontFamily: th.fonts.body,
  },
  eye: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: th.c.bg,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    borderColor: th.c.line,
    paddingHorizontal: th.space.lg,
    minWidth: 72,
  },
  error: {
    color: th.c.risk,
    fontSize: 12,
    fontFamily: th.fonts.body,
    textAlign: "center",
    marginTop: th.space.sm,
  },
  button: {
    backgroundColor: th.c.olive,
    borderRadius: th.radius.md,
    minHeight: 52,
    justifyContent: "center",
    alignItems: "center",
    marginTop: th.space.lg,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonRow: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  buttonText: { color: th.c.onOlive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.sm,
    alignSelf: "center",
    maxWidth: 340,
    marginHorizontal: th.space.xl,
    paddingVertical: th.space.sm,
    paddingHorizontal: th.space.lg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: th.c.line,
    backgroundColor: th.c.surface2,
  },
  noticeText: {
    flex: 1,
    color: th.c.muted,
    fontSize: 12,
    fontFamily: th.fonts.body,
    lineHeight: 18,
  },
  version: {
    color: th.c.muted,
    fontSize: 11,
    fontFamily: th.fonts.body,
    textAlign: "center",
  },
  brandFooter: {
    marginTop: th.space.xxl,
    alignItems: "center",
    paddingHorizontal: th.space.xl,
    width: "100%",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: th.space.xs,
  },
  brandLogo: { width: 22, height: 22, marginRight: th.space.sm },
  brandName: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.bodyBold },
  copyright: { color: th.c.muted, fontSize: 11, fontFamily: th.fonts.body, textAlign: "center", lineHeight: 16 },
}));