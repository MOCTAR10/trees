import React, { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { getMe, login, setAuthToken } from "../api/client";
import { fr } from "../i18n/fr";
import { Session } from "../storage/session";
import { colors, spacing, type } from "../theme";

interface Props {
  onLogin: (session: Session) => void;
}

export default function LoginScreen({ onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <View style={styles.container}>
      <Text style={styles.leaf}>🌳</Text>
      <Text style={styles.title}>{fr.appTitle}</Text>
      <Text style={styles.subtitle}>{fr.auth.subtitle}</Text>

      <TextInput
        style={styles.input}
        placeholder={fr.auth.email}
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder={fr.auth.password}
        placeholderTextColor={colors.textDim}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={submit}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={styles.buttonText}>{fr.auth.submit}</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.hint}>{fr.auth.hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  leaf: { fontSize: 56 },
  title: { color: colors.text, fontSize: type.title, fontWeight: "800" },
  subtitle: { color: colors.textDim, fontSize: type.body, textAlign: "center" },
  input: {
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: type.body,
  },
  button: {
    alignSelf: "stretch",
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.primary, fontSize: type.body, fontWeight: "800" },
  error: { color: colors.error, fontSize: type.caption, textAlign: "center" },
  hint: { color: colors.textDim, fontSize: type.caption, textAlign: "center" },
});
