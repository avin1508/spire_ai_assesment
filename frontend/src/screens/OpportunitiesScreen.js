import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LocationSearchBar from '../components/LocationSearchBar';
import FilterChip from '../components/FilterChip';
import MapPlaceholder from '../components/MapPlaceholder';
import MapControls from '../components/MapControls';
import AgentSigmaButton from '../components/AgentSigmaButton';
import BottomActionBar from '../components/BottomActionBar';
import {
  cities,
  companyMarkers,
  filterOptions,
  jobMarkers,
  landPatches,
  mapSummary,
  regionLabels,
  roads,
  stateBorders,
} from '../data/mockMap';
import { colors, spacing, typography } from '../theme';

// "All Jobs" tab: map-first Opportunities view. UI only — all data is local mock data.
export default function OpportunitiesScreen() {
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState('map');
  const [activeFilters, setActiveFilters] = useState([]);

  const toggleFilter = (id) => {
    setActiveFilters((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  return (
    <View style={styles.container}>
      {viewMode === 'map' ? (
        <MapPlaceholder
          cities={cities}
          regionLabels={regionLabels}
          roads={roads}
          stateBorders={stateBorders}
          landPatches={landPatches}
          jobMarkers={jobMarkers}
          companyMarkers={companyMarkers}
        />
      ) : (
        <View style={styles.listPlaceholder}>
          <Ionicons name="list" size={36} color={colors.textMuted} />
          <Text style={styles.listTitle}>List view</Text>
          <Text style={styles.listText}>Job listings will appear here.</Text>
        </View>
      )}

      <View style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.searchWrap}>
          <LocationSearchBar
            value={query}
            onChangeText={setQuery}
            viewMode={viewMode}
            onChangeViewMode={setViewMode}
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chips}
          contentContainerStyle={styles.chipsContent}
          keyboardShouldPersistTaps="handled"
        >
          <FilterChip icon="options-outline" accessibilityLabel="All filters" />
          {filterOptions.map((filter) => (
            <FilterChip
              key={filter.id}
              label={filter.label}
              icon={filter.icon}
              iconColor={filter.iconColor}
              dot={filter.dot}
              selected={activeFilters.includes(filter.id)}
              onPress={() => toggleFilter(filter.id)}
            />
          ))}
        </ScrollView>
      </View>

      {viewMode === 'map' && <MapControls style={styles.mapControls} />}

      <AgentSigmaButton style={styles.agentSigma} />

      <BottomActionBar style={styles.bottomActions} jobCount={mapSummary.jobs} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.map.land,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: spacing.md,
  },
  searchWrap: {
    paddingHorizontal: spacing.md,
  },
  chips: {
    marginTop: spacing.sm,
    flexGrow: 0,
  },
  chipsContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  mapControls: {
    position: 'absolute',
    right: spacing.md,
    top: 116,
  },
  agentSigma: {
    position: 'absolute',
    right: spacing.md,
    bottom: '22%',
  },
  bottomActions: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: '9%',
  },
  listPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  listTitle: {
    ...typography.label,
    fontSize: 16,
    marginTop: spacing.sm,
  },
  listText: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
});
