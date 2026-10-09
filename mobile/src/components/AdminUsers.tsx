import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  adminCooperatives,
  AdminUser,
  Cooperation,
  createUser,
  listUsers,
  Role,
  setUserActive,
} from "../api/client";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

const ROLES: Role[] = ["operator", "company", "cooperative", "admin"];

const roleLabel = (role: Role) => fr.roles[role];

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [coops, setCoops] = useState<Cooperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, c] = await Promise.all([listUsers(), adminCooperatives()]);
      setUsers(u);
      setCoops(c);
    } catch (err) {
      console.error("admin users load failed", err);
      setError(fr.admin.error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (user: AdminUser, value: boolean) => {
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_active: value } : u)));
    try {
      await setUserActive(user.id, value);
    } catch (err) {
      console.error("toggle active failed", err);
      setError(fr.admin.updateError);
      await load();
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.newBtn} onPress={() => setCreating(true)}>
        <Text style={styles.newBtnText}>+ {fr.admin.newUser}</Text>
      </TouchableOpacity>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={styles.center} color={colors.accent} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardTexts}>
                  <Text style={styles.name}>{item.display_name}</Text>
                  <Text style={styles.email}>{item.email}</Text>
                  <Text style={styles.role}>{roleLabel(item.role)}</Text>
                </View>
                <View style={styles.switchCol}>
                  <Switch
                    value={item.is_active}
                    onValueChange={(v) => toggle(item, v)}
                    trackColor={{ true: colors.accent, false: colors.border }}
                  />
                  <Text style={styles.activeText}>
                    {item.is_active ? fr.admin.active : fr.admin.inactive}
                  </Text>
                </View>
              </View>
            </View>
          )}
        />
      )}

      <CreateUserModal
        visible={creating}
        coops={coops}
        onClose={() => setCreating(false)}
        onCreated={async () => {
          setCreating(false);
          await load();
        }}
      />
    </View>
  );
}

function CreateUserModal({
  visible,
  coops,
  onClose,
  onCreated,
}: {
  visible: boolean;
  coops: Cooperation[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("operator");
  const [coopId, setCoopId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEmail("");
    setName("");
    setPassword("");
    setRole("operator");
    setCoopId(null);
    setError(null);
  };

  const submit = async () => {
    if (busy) return;
    if (!email.trim() || !name.trim() || !password) return;
    if (role === "cooperative" && coopId == null) {
      setError(fr.admin.cooperativeField);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createUser({
        email: email.trim(),
        display_name: name.trim(),
        password,
        role,
        cooperative_id: role === "cooperative" ? coopId : null,
      });
      reset();
      onCreated();
    } catch (err) {
      console.error("create user failed", err);
      setError(fr.admin.createError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.admin.newUser}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            <TextInput
              style={styles.input}
              placeholder={fr.admin.nameField}
              placeholderTextColor={colors.textDim}
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={styles.input}
              placeholder={fr.admin.emailField}
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder={fr.admin.passwordField}
              placeholderTextColor={colors.textDim}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <Text style={styles.fieldLabel}>{fr.admin.roleField}</Text>
            <View style={styles.roleRow}>
              {ROLES.map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setRole(r)}
                  style={[styles.roleChip, role === r && styles.roleChipActive]}
                >
                  <Text style={[styles.roleChipText, role === r && styles.roleChipTextActive]}>
                    {roleLabel(r)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {role === "cooperative" ? (
              <>
                <Text style={styles.fieldLabel}>{fr.admin.cooperativeField}</Text>
                <ScrollView style={styles.coopList} nestedScrollEnabled>
                  {coops.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.coopRow}
                      onPress={() => setCoopId(c.id)}
                    >
                      <Text
                        style={[styles.coopName, coopId === c.id && styles.coopNameActive]}
                      >
                        {coopId === c.id ? "● " : "○ "}
                        {c.cooperative_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
                <Text style={styles.cancelText}>{fr.admin.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, busy && styles.submitDisabled]}
                onPress={submit}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.submitText}>{fr.admin.createBtn}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  newBtn: {
    margin: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  newBtnText: { color: colors.primary, fontSize: type.body, fontWeight: "800" },
  error: { color: colors.error, fontSize: type.caption, paddingHorizontal: spacing.md },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTexts: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontSize: type.body, fontWeight: "700" },
  email: { color: colors.textDim, fontSize: type.caption },
  role: { color: colors.accent, fontSize: type.caption, fontWeight: "700", marginTop: 2 },
  switchCol: { alignItems: "center", gap: 2 },
  activeText: { color: colors.textDim, fontSize: type.caption },
  backdrop: { flex: 1, backgroundColor: "rgba(14,21,18,0.8)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
    maxHeight: "85%",
  },
  modalTitle: {
    color: colors.text,
    fontSize: type.heading,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  form: { paddingBottom: spacing.sm },
  input: {
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: type.body,
    marginBottom: spacing.sm,
  },
  fieldLabel: { color: colors.textDim, fontSize: type.caption, marginBottom: spacing.xs },
  roleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  roleChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  roleChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  roleChipText: { color: colors.textDim, fontSize: type.caption, fontWeight: "600" },
  roleChipTextActive: { color: colors.primary },
  coopList: { maxHeight: 160, marginBottom: spacing.sm },
  coopRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  coopName: { color: colors.text, fontSize: type.caption },
  coopNameActive: { color: colors.accent, fontWeight: "700" },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: { color: colors.text, fontSize: type.body, fontWeight: "700" },
  submitBtn: {
    flex: 2,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: colors.primary, fontSize: type.body, fontWeight: "800" },
});
