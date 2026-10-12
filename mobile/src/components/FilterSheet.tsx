import React from "react";
import {
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, spacing, type } from "../theme";
import { normalize } from "../utils/text";

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

interface Props {
  visible: boolean;
  title: string;
  options: FilterOption[];
  selected: string | null;
  onSelect: (value: string | null) => void;
  onClose: () => void;
}

export default function FilterSheet({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const listRef = React.useRef<SectionList<FilterOption, { title: string }>>(null);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (visible) setQuery("");
  }, [visible]);

  const filtered = React.useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return options;
    return options.filter((o) => normalize(o.label).includes(q));
  }, [options, query]);

  const sections = React.useMemo(() => {
    const sorted = [...filtered].sort((a, b) => a.label.localeCompare(b.label, "fr"));
    const groups: Record<string, FilterOption[]> = {};
    for (const o of sorted) {
      const first = normalize(o.label).charAt(0).toUpperCase();
      const letter = /[A-Z]/.test(first) ? first : "#";
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(o);
    }
    return Object.keys(groups)
      .sort()
      .map((title) => ({ title, data: groups[title] }));
  }, [filtered]);

  const jumpTo = (letter: string) => {
    const index = sections.findIndex((s) => s.title === letter);
    if (index >= 0) {
      listRef.current?.scrollToLocation({ sectionIndex: index, itemIndex: 0, animated: true });
    }
  };

  const choose = (value: string | null) => {
    onSelect(value);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher…"
            placeholderTextColor={colors.textDim}
            style={styles.input}
          />

          <TouchableOpacity
            style={[styles.clearAll, selected === null && styles.clearAllActive]}
            onPress={() => choose(null)}
            accessibilityRole="button"
          >
            <Text style={styles.clearAllText}>Tous</Text>
          </TouchableOpacity>

          <View style={styles.body}>
            <SectionList
              ref={listRef}
              sections={sections}
              keyExtractor={(o) => o.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.option, selected === item.value && styles.optionSelected]}
                  onPress={() => choose(item.value)}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      selected === item.value && styles.optionLabelSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  <Text style={styles.optionCount}>{item.count}</Text>
                </TouchableOpacity>
              )}
              renderSectionHeader={({ section }) => (
                <Text style={styles.sectionHeader}>{section.title}</Text>
              )}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.empty}>Aucun résultat</Text>}
              contentContainerStyle={styles.listContent}
            />

            <View style={styles.rail}>
              {sections.map((s) => (
                <TouchableOpacity key={s.title} onPress={() => jumpTo(s.title)}>
                  <Text style={styles.railLetter}>{s.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    height: "82%",
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { color: colors.text, fontSize: type.heading, fontWeight: "800" },
  close: { color: colors.textDim, fontSize: type.heading },
  input: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: type.body,
  },
  clearAll: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  clearAllActive: { borderColor: colors.accent, backgroundColor: colors.surfaceAlt },
  clearAllText: { color: colors.text, fontSize: type.body, fontWeight: "700" },
  body: { flex: 1, flexDirection: "row", marginTop: spacing.sm },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  sectionHeader: {
    color: colors.accent,
    fontSize: type.caption,
    fontWeight: "800",
    textTransform: "uppercase",
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
  },
  optionSelected: { backgroundColor: colors.surfaceAlt },
  optionLabel: { color: colors.text, fontSize: type.body, flexShrink: 1 },
  optionLabelSelected: { color: colors.accent, fontWeight: "700" },
  optionCount: { color: colors.textDim, fontSize: type.caption, marginLeft: spacing.sm },
  empty: { color: colors.textDim, fontSize: type.body, textAlign: "center", padding: spacing.lg },
  rail: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  railLetter: { color: colors.accent, fontSize: 11, fontWeight: "700", paddingVertical: 1 },
});
