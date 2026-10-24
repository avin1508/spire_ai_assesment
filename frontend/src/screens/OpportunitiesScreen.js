import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import LocationSearchBar from '../components/LocationSearchBar';
import FilterChip from '../components/FilterChip';
import JobsMap from '../components/JobsMap';
import MapControls from '../components/MapControls';
import AgentSigmaButton from '../components/AgentSigmaButton';
import BottomActionBar from '../components/BottomActionBar';
import JobListItem from '../components/JobListItem';
import Button from '../components/Button';
import SortSheet from '../components/SortSheet';
import FilterSheet from '../components/FilterSheet';
import CompanySheet from '../components/CompanySheet';
import { ALL_JOBS } from '../data/mockJobs';
import { filterOptions } from '../data/mockMap';
import {
  EMPTY_FILTERS,
  countActiveFilters,
  filterJobs,
  isSortAvailable,
  sortJobs,
} from '../utils/jobFilters';
import { distanceKm } from '../utils/geo';
import { colors, radius, shadow, spacing } from '../theme';

// "All Jobs" tab: interactive map + list over the same (mock) job dataset.
// Search, chips and the filter / sort sheets drive both views.
export default function OpportunitiesScreen() {
  const navigation = useNavigation();
  const mapRef = useRef(null);

  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState('map');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [last24h, setLast24h] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sortBy, setSortBy] = useState('recommended');
  const [openSheet, setOpenSheet] = useState(null); // 'filters' | 'sort' | 'companies' | null
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [clusterIds, setClusterIds] = useState(null); // ids in the tapped cluster
  const [areaIds, setAreaIds] = useState(null); // list restricted to a map cluster
  const [userLocation, setUserLocation] = useState(null);
  const [overlayHeight, setOverlayHeight] = useState(0);

  // Add distance from the user once their location is known.
  const jobs = useMemo(
    () =>
      userLocation
        ? ALL_JOBS.map((job) => ({
            ...job,
            distanceKm: distanceKm(userLocation.lat, userLocation.lng, job.latitude, job.longitude),
          }))
        : ALL_JOBS,
    [userLocation]
  );

  const filtered = useMemo(
    () => filterJobs(jobs, { query, verifiedOnly, last24h, filters }),
    [jobs, query, verifiedOnly, last24h, filters]
  );

  const listJobs = useMemo(() => {
    const scoped = areaIds ? filtered.filter((job) => areaIds.includes(job.id)) : filtered;
    return sortJobs(scoped, sortBy);
  }, [filtered, areaIds, sortBy]);

  const selectedJob = selectedJobId ? jobs.find((job) => job.id === selectedJobId) : null;
  const activeFilterCount = countActiveFilters(filters);

  // When the results change, drop the cluster card and any selection that was filtered out.
  useEffect(() => {
    setClusterIds(null);
    setSelectedJobId((id) => (id && filtered.some((job) => job.id === id) ? id : null));
  }, [filtered]);

  // Fit the map to the results when the search or sheet filters change.
  useEffect(() => {
    if (query === '' && activeFilterCount === 0) return undefined;
    const timer = setTimeout(() => mapRef.current?.fitToJobs(), 500);
    return () => clearTimeout(timer);
  }, [query, filters, activeFilterCount]);

  const openDetails = (job) =>
    navigation.navigate('JobDetails', {
      job: { ...job, location: `${job.area}, ${job.city}` },
    });

  const locate = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location not allowed', 'Allow location access to see jobs near you.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude: lat, longitude: lng } = position.coords;
      setUserLocation({ lat, lng });
      mapRef.current?.showUserLocation(lat, lng);
    } catch {
      Alert.alert("Couldn't get your location", 'Location services may be turned off. Please try again.');
    }
  };

  const toggleChip = (id) => {
    if (id === 'recommended') navigation.navigate('Recommended');
    if (id === 'verified') setVerifiedOnly((value) => !value);
    if (id === 'last24h') setLast24h((value) => !value);
  };

  const chipSelected = (id) =>
    (id === 'verified' && verifiedOnly) || (id === 'last24h' && last24h);

  const showList = (ids = null) => {
    setAreaIds(ids);
    setClusterIds(null);
    setSelectedJobId(null);
    setViewMode('list');
  };

  return (
    <View style={styles.container}>
      <JobsMap
        ref={mapRef}
        jobs={filtered}
        selectedJobId={selectedJobId}
        onJobPress={(id) => {
          setClusterIds(null);
          setSelectedJobId(id);
        }}
        onClusterPress={(ids) => {
          setSelectedJobId(null);
          setClusterIds(ids);
        }}
        onMapPress={() => {
          setSelectedJobId(null);
          setClusterIds(null);
        }}
      />

      {viewMode === 'list' && (
        <FlatList
          style={styles.list}
          data={listJobs}
          keyExtractor={(job) => job.id}
          contentContainerStyle={[styles.listContent, { paddingTop: overlayHeight + spacing.sm }]}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={styles.listCount}>
                {listJobs.length} {listJobs.length === 1 ? 'job' : 'jobs'}
                {areaIds ? ' in the selected map area' : ''}
              </Text>
              {areaIds && (
                <Pressable onPress={() => setAreaIds(null)} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.link}>Show all</Text>
                </Pressable>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No jobs match your search</Text>
              <Button
                label="Clear filters"
                variant="outline"
                onPress={() => {
                  setQuery('');
                  setVerifiedOnly(false);
                  setLast24h(false);
                  setFilters(EMPTY_FILTERS);
                  setAreaIds(null);
                }}
              />
            </View>
          }
          renderItem={({ item }) => (
            <JobListItem job={item} onPress={() => openDetails(item)} style={styles.listItem} />
          )}
        />
      )}

      <View
        style={styles.topOverlay}
        pointerEvents="box-none"
        onLayout={(event) => setOverlayHeight(event.nativeEvent.layout.height)}
      >
        <View style={styles.searchWrap}>
          <LocationSearchBar
            value={query}
            onChangeText={setQuery}
            viewMode={viewMode}
            onChangeViewMode={(mode) => (mode === 'list' ? showList() : setViewMode('map'))}
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chips}
          contentContainerStyle={styles.chipsContent}
          keyboardShouldPersistTaps="handled"
        >
          <FilterChip
            icon="options-outline"
            accessibilityLabel={
              activeFilterCount > 0 ? `All filters, ${activeFilterCount} active` : 'All filters'
            }
            selected={activeFilterCount > 0}
            onPress={() => setOpenSheet('filters')}
          />
          {viewMode === 'list' && (
            <FilterChip
              label="Sort"
              icon="swap-vertical"
              iconColor={colors.text}
              selected={sortBy !== 'recommended'}
              onPress={() => setOpenSheet('sort')}
            />
          )}
          {filterOptions.map((filter) => (
            <FilterChip
              key={filter.id}
              label={filter.label}
              icon={filter.icon}
              iconColor={filter.iconColor}
              dot={filter.dot}
              selected={chipSelected(filter.id)}
              onPress={() => toggleChip(filter.id)}
            />
          ))}
        </ScrollView>
      </View>

      {viewMode === 'map' && (
        <>
          <MapControls
            style={styles.mapControls}
            onZoomIn={() => mapRef.current?.zoomIn()}
            onZoomOut={() => mapRef.current?.zoomOut()}
            onLocate={locate}
          />

          {selectedJob ? (
            <View style={styles.preview}>
              <JobListItem
                job={selectedJob}
                onPress={() => openDetails(selectedJob)}
                onClose={() => setSelectedJobId(null)}
                style={styles.previewCard}
              />
            </View>
          ) : clusterIds ? (
            <View style={[styles.preview, styles.clusterCard]}>
              <View style={styles.clusterText}>
                <Text style={styles.clusterTitle}>{clusterIds.length} jobs in this area</Text>
                <Text style={styles.clusterSub}>
                  {new Set(jobs.filter((job) => clusterIds.includes(job.id)).map((job) => job.companyName)).size}{' '}
                  companies
                </Text>
              </View>
              <Button
                label="Zoom in"
                variant="outline"
                onPress={() => {
                  mapRef.current?.zoomToLastCluster();
                  setClusterIds(null);
                }}
                style={styles.clusterButton}
              />
              <Button label="View list" onPress={() => showList(clusterIds)} style={styles.clusterButton} />
            </View>
          ) : (
            <>
              <AgentSigmaButton style={styles.agentSigma} />
              <BottomActionBar
                style={styles.bottomActions}
                jobCount={filtered.length}
                onViewCompanies={() => setOpenSheet('companies')}
                onViewJobs={() => showList()}
              />
            </>
          )}
        </>
      )}

      <FilterSheet
        visible={openSheet === 'filters'}
        jobs={jobs}
        filters={filters}
        countFor={(draft) => filterJobs(jobs, { query, verifiedOnly, last24h, filters: draft }).length}
        onApply={(draft) => {
          setFilters(draft);
          setOpenSheet(null);
        }}
        onClose={() => setOpenSheet(null)}
      />
      <SortSheet
        visible={openSheet === 'sort'}
        selected={sortBy}
        isAvailable={(sortId) => isSortAvailable(sortId, jobs)}
        onSelect={(sortId) => {
          setSortBy(sortId);
          setOpenSheet(null);
        }}
        onClose={() => setOpenSheet(null)}
      />
      <CompanySheet
        visible={openSheet === 'companies'}
        jobs={filtered}
        onSelect={(name) => {
          setFilters((current) => ({ ...current, company: [name] }));
          setOpenSheet(null);
          showList();
        }}
        onClose={() => setOpenSheet(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  preview: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.xl,
  },
  previewCard: {
    ...shadow,
  },
  clusterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow,
  },
  clusterText: {
    flex: 1,
  },
  clusterTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  clusterSub: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textMuted,
  },
  clusterButton: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  list: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  listCount: {
    fontSize: 14,
    color: colors.textMuted,
  },
  link: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  listItem: {
    marginBottom: spacing.md,
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xl * 2,
    gap: spacing.lg,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
});
