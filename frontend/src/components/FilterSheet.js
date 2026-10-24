import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from './BottomSheet';
import {
  EMPTY_FILTERS,
  FILTER_SECTIONS,
  describeSelection,
  getSectionOptions,
} from '../utils/jobFilters';
import { colors, radius, spacing } from '../theme';

// "All Filters" sheet. Edits a draft copy of the filters; "Show N jobs"
// applies it. `countFor(draft)` returns how many jobs the draft would show.
export default function FilterSheet({ visible, jobs, filters, countFor, onApply, onClose }) {
  const [draft, setDraft] = useState(filters);
  const [expanded, setExpanded] = useState(null);

  // Start from the applied filters each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setDraft(filters);
      setExpanded(null);
    }
  }, [visible, filters]);

  const toggleValue = (section, value) => {
    setDraft((current) => {
      if (section.single) {
        return { ...current, [section.id]: current[section.id] === value ? null : value };
      }
      const selected = current[section.id];
      return {
        ...current,
        [section.id]: selected.includes(value)
          ? selected.filter((item) => item !== value)
          : [...selected, value],
      };
    });
  };

  const resultCount = countFor(draft);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="All Filters"
      headerAction={
        <Pressable
          onPress={() => setDraft(EMPTY_FILTERS)}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={styles.clear}>Clear all</Text>
        </Pressable>
      }
      footer={
        <Pressable
          onPress={() => onApply(draft)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.apply, pressed && styles.pressed]}
        >
          <Text style={styles.applyText}>
            Show {resultCount} {resultCount === 1 ? 'job' : 'jobs'}
          </Text>
        </Pressable>
      }
    >
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        {FILTER_SECTIONS.map((section) => (
          <FilterSection
            key={section.id}
            section={section}
            summary={describeSelection(section, draft)}
            options={getSectionOptions(section, jobs)}
            selected={draft[section.id]}
            expanded={expanded === section.id}
            onToggleExpanded={() =>
              setExpanded((current) => (current === section.id ? null : section.id))
            }
            onToggleValue={(value) => toggleValue(section, value)}
          />
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

function FilterSection({
  section,
  summary,
  options,
  selected,
  expanded,
  onToggleExpanded,
  onToggleValue,
}) {
  const [search, setSearch] = useState('');
  const text = search.trim().toLowerCase();
  const visibleOptions = text
    ? options.filter((option) => option.label.toLowerCase().includes(text))
    : options;

  return (
    <View style={styles.section}>
      <Pressable
        onPress={onToggleExpanded}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.sectionHeader}
      >
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.summary} numberOfLines={1}>
          {summary}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.text}
        />
      </Pressable>

      {expanded && (
        <View style={styles.sectionBody}>
          {section.searchable && (
            <View style={styles.search}>
              <Ionicons name="search-outline" size={20} color={colors.primary} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder={`Search ${section.title.toLowerCase()}`}
                placeholderTextColor="#9AA1AB"
              />
            </View>
          )}
          {visibleOptions.length === 0 ? (
            <Text style={styles.empty}>No options</Text>
          ) : (
            visibleOptions.map((option) => {
              const checked = section.single
                ? selected === option.value
                : selected.includes(option.value);
              return (
                <Pressable
                  key={option.value}
                  onPress={() => onToggleValue(option.value)}
                  accessibilityRole={section.single ? 'radio' : 'checkbox'}
                  accessibilityState={{ checked }}
                  style={styles.option}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked && <Ionicons name="checkmark" size={16} color={colors.surface} />}
                  </View>
                  <Text style={styles.optionLabel} numberOfLines={1}>
                    {option.label}
                  </Text>
                  <Text style={styles.optionCount}>{option.count}</Text>
                </Pressable>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  clear: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  section: {
    marginHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  summary: {
    maxWidth: '45%',
    marginRight: spacing.md,
    fontSize: 16,
    color: colors.textMuted,
  },
  sectionBody: {
    paddingBottom: spacing.md,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    marginLeft: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#C4C9D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  optionLabel: {
    flex: 1,
    marginHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  optionCount: {
    fontSize: 15,
    color: colors.textMuted,
  },
  empty: {
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.textMuted,
  },
  apply: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.cta,
  },
  pressed: {
    opacity: 0.85,
  },
  applyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.surface,
  },
});
