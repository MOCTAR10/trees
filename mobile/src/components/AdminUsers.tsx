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
import { DataTable, useDesktop, useDialog } from "../design/layout";
import { Txt } from "../design/ui";
import { makeStyles, useTheme } from "../design/ThemeProvider";

const ROLES: Role[] = ["operator", "company", "cooperative", "admin"];

const roleLabel = (role: Role) => fr.roles[role];

export default function AdminUsers() {
  const th = useTheme();
  const styles = useStyles();
  const desktop = useDesktop();
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
        <ActivityIndicator style={styles.center} color={th.c.olive} />
      ) : desktop ? (
        <ScrollView contentContainerStyle={styles.list}>
          <DataTable
            testID="users-table"
            rows={users}
            rowKey={(u) => String(u.id)}
            initialSort={{ key: "name" }}
            columns={[
              {
                key: "name",
                title: fr.admin.colName,
                flex: 2,
                sortValue: (u) => u.display_name,
                render: (u) => (
                  <Txt variant="small" bold numberOfLines={1}>
                    {u.display_name}
                  </Txt>
                ),
              },
              {
                key: "email",
                title: fr.admin.colEmail,
                flex: 2.4,
                sortValue: (u) => u.email,
                render: (u) => (
                  <Txt variant="small" tone="muted" numberOfLines={1}>
                    {u.email}
                  </Txt>
                ),
              },
              {
                key: "matricule",
                title: fr.admin.colMatricule,
                width: 140,
                sortValue: (u) => u.matricule,
                render: (u) => <Txt variant="small">{u.matricule ?? "—"}</Txt>,
              },
              {
                key: "role",
                title: fr.admin.colRole,
                width: 170,
                sortValue: (u) => roleLabel(u.role),
                render: (u) => <Txt variant="small">{roleLabel(u.role)}</Txt>,
              },
              {
                key: "active",
                title: fr.admin.colActive,
                width: 150,
                sortValue: (u) => (u.is_active ? 0 : 1),
                render: (u) => (
                  <View style={styles.tableSwitch}>
                    <Switch
                      value={u.is_active}
                      onValueChange={(v) => toggle(u, v)}
                      trackColor={{ true: th.c.olive, false: th.c.line }}
                    />
                    <Txt variant="caption" tone="muted">
                      {u.is_active ? fr.admin.active : fr.admin.inactive}
                    </Txt>
                  </View>
                ),
              },
            ]}
          />
        </ScrollView>
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
                  {item.matricule ? <Text style={styles.email}>{item.matricule}</Text> : null}
                  <Text style={styles.email}>{item.email}</Text>
                  <Text style={styles.role}>{roleLabel(item.role)}</Text>
                </View>
                <View style={styles.switchCol}>
                  <Switch
                    value={item.is_active}
                    onValueChange={(v) => toggle(item, v)}
                    trackColor={{ true: th.c.olive, false: th.c.line }}
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
  const dialog = useDialog();
  const th = useTheme();
  const styles = useStyles();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [matricule, setMatricule] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("operator");
  const [coopId, setCoopId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEmail("");
    setName("");
    setFirstName("");
    setLastName("");
    setMatricule("");
    setPassword("");
    setRole("operator");
    setCoopId(null);
    setError(null);
  };

  const submit = async () => {
    if (busy) return;
    const person = role === "operator";
    if (!email.trim() || !password) return;
    if (person ? !firstName.trim() || !lastName.trim() : !name.trim()) {
      setError(person ? fr.admin.personNameRequired : fr.admin.nameField);
      return;
    }
    if (role === "cooperative" && coopId == null) {
      setError(fr.admin.cooperativeField);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createUser({
        email: email.trim(),
        ...(person
          ? { first_name: firstName.trim(), last_name: lastName.trim(), matricule: matricule.trim() || undefined }
          : { display_name: name.trim() }),
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
    <Modal visible={visible} transparent animationType={dialog.animation} onRequestClose={onClose}>
      <View style={[styles.backdrop, dialog.backdrop]}>
        <View style={[styles.modal, dialog.sheet]}>
          <Text style={styles.modalTitle}>{fr.admin.newUser}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            {role === "operator" ? (
              <>
                <TextInput
                  testID="admin-first-name"
                  style={styles.input}
                  placeholder={fr.profile.firstName}
                  placeholderTextColor={th.c.muted}
                  autoCapitalize="words"
                  value={firstName}
                  onChangeText={setFirstName}
                />
                <TextInput
                  testID="admin-last-name"
                  style={styles.input}
                  placeholder={fr.profile.lastName}
                  placeholderTextColor={th.c.muted}
                  autoCapitalize="words"
                  value={lastName}
                  onChangeText={setLastName}
                />
                <TextInput
                  testID="admin-matricule"
                  style={styles.input}
                  placeholder={fr.admin.matriculeField}
                  placeholderTextColor={th.c.muted}
                  autoCapitalize="characters"
                  value={matricule}
                  onChangeText={setMatricule}
                />
              </>
            ) : (
              <TextInput
                style={styles.input}
                placeholder={fr.admin.nameField}
                placeholderTextColor={th.c.muted}
                value={name}
                onChangeText={setName}
              />
            )}
            <TextInput
              style={styles.input}
              placeholder={fr.admin.emailField}
              placeholderTextColor={th.c.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder={fr.admin.passwordField}
              placeholderTextColor={th.c.muted}
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
                  <ActivityIndicator color={th.c.onOlive} />
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

const useStyles = makeStyles((th) => ({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  newBtn: {
    margin: th.space.lg,
    backgroundColor: th.c.olive,
    borderRadius: 10,
    paddingVertical: th.space.sm,
    alignItems: "center",
  },
  newBtnText: { color: th.c.onOlive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  error: { color: th.c.risk, fontSize: 12, fontFamily: th.fonts.body, paddingHorizontal: th.space.lg },
  tableSwitch: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  list: { paddingHorizontal: th.space.lg, paddingBottom: th.space.xl, gap: th.space.sm },
  card: {
    backgroundColor: th.c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.lg,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTexts: { flex: 1, minWidth: 0 },
  name: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold },
  email: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  role: { color: th.c.olive, fontSize: 12, fontFamily: th.fonts.bodyBold, marginTop: 2 },
  switchCol: { alignItems: "center", gap: 2 },
  activeText: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  backdrop: { flex: 1, backgroundColor: "rgba(14,21,18,0.8)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: th.c.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: th.space.xl,
    maxHeight: "85%",
  },
  modalTitle: {
    color: th.c.ink,
    fontSize: 19,
    fontFamily: th.fonts.bodyBold,
    marginBottom: th.space.sm,
  },
  form: { paddingBottom: th.space.sm },
  input: {
    backgroundColor: th.c.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: th.c.line,
    color: th.c.ink,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.sm,
    fontSize: 15,
    fontFamily: th.fonts.body,
    marginBottom: th.space.sm,
  },
  fieldLabel: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body, marginBottom: th.space.xs },
  roleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: th.space.xs,
    marginBottom: th.space.sm,
  },
  roleChip: {
    borderWidth: 1,
    borderColor: th.c.line,
    borderRadius: 20,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.xs,
  },
  roleChipActive: { backgroundColor: th.c.olive, borderColor: th.c.olive },
  roleChipText: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.bodyBold },
  roleChipTextActive: { color: th.c.onOlive },
  coopList: { maxHeight: 160, marginBottom: th.space.sm },
  coopRow: { paddingVertical: th.space.sm, borderBottomWidth: 1, borderBottomColor: th.c.line },
  coopName: { color: th.c.ink, fontSize: 12, fontFamily: th.fonts.body },
  coopNameActive: { color: th.c.olive, fontFamily: th.fonts.bodyBold },
  actions: { flexDirection: "row", gap: th.space.sm, marginTop: th.space.sm },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: th.space.lg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: th.c.line,
  },
  cancelText: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold },
  submitBtn: {
    flex: 2,
    alignItems: "center",
    paddingVertical: th.space.lg,
    borderRadius: 10,
    backgroundColor: th.c.olive,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: th.c.onOlive, fontSize: 15, fontFamily: th.fonts.bodyBold },
}));
