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

import { makeStyles, useTheme } from "../design/ThemeProvider";
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
  const th = useTheme();
  const styles = useStyles();
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
        <View style={[styles.sheet, { paddingBottom: insets.bottom + th.space.lg }]}>
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
            placeholderTextColor={th.c.muted}
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

const useStyles = makeStyles((th) => ({
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
    backgroundColor: th.c.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: th.c.line,
    paddingTop: th.space.sm,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: th.c.line,
    marginBottom: th.space.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: th.space.xl,
    paddingBottom: th.space.sm,
  },
  title: { color: th.c.ink, fontSize: 19, fontFamily: th.fonts.bodyBold },
  close: { color: th.c.muted, fontSize: 19, fontFamily: th.fonts.body },
  input: {
    marginHorizontal: th.space.xl,
    backgroundColor: th.c.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: th.c.line,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.sm,
    color: th.c.ink,
    fontSize: 15,
    fontFamily: th.fonts.body,
  },
  clearAll: {
    marginHorizontal: th.space.xl,
    marginTop: th.space.sm,
    paddingVertical: th.space.sm,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: th.c.line,
    backgroundColor: th.c.surface,
  },
  clearAllActive: { borderColor: th.c.olive, backgroundColor: th.c.surface2 },
  clearAllText: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold },
  body: { flex: 1, flexDirection: "row", marginTop: th.space.sm },
  listContent: { paddingHorizontal: th.space.lg, paddingBottom: th.space.xl },
  sectionHeader: {
    color: th.c.olive,
    fontSize: 12,
    fontFamily: th.fonts.bodyBold,
    textTransform: "uppercase",
    paddingVertical: th.space.xs,
    backgroundColor: th.c.bg,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: th.space.sm + 2,
    paddingHorizontal: th.space.sm,
    borderRadius: 8,
  },
  optionSelected: { backgroundColor: th.c.surface2 },
  optionLabel: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.body, flexShrink: 1 },
  optionLabelSelected: { color: th.c.olive, fontFamily: th.fonts.bodyBold },
  optionCount: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body, marginLeft: th.space.sm },
  empty: { color: th.c.muted, fontSize: 15, fontFamily: th.fonts.body, textAlign: "center", padding: th.space.xl },
  rail: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: th.space.sm,
  },
  railLetter: { color: th.c.olive, fontSize: 11, fontFamily: th.fonts.bodyBold, paddingVertical: 1 },
}));
