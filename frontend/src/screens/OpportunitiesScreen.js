import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import Skeleton, { JobListItemSkeleton, LoadingDots } from '../components/Skeleton';
import useRemoteData from '../hooks/useRemoteData';
import useJobList from '../hooks/useJobList';
import useDebouncedValue from '../hooks/useDebouncedValue';
import {
  fetchFilterOptions,
  fetchJob,
  fetchJobMap,
  fetchJobSummary,
} from '../services/jobsService';
import { filterOptions } from '../data/mockMap';
import { EMPTY_FILTERS, countActiveFilters, filterJobs, isSortAvailable } from '../utils/jobFilters';
import { bboxParam, buildFilterParams, paramsKey } from '../utils/jobQueryParams';
import { loadingView } from '../utils/remoteData';
import { distanceKm } from '../utils/geo';
import { colors, radius, shadow, spacing } from '../theme';

const SEARCH_DEBOUNCE_MS = 300;
const VIEWPORT_DEBOUNCE_MS = 250;

// "All Jobs" tab: interactive map + list over the backend All Jobs API.
// Search, chips and the filter / sort sheets drive both views; the server
// filters, sorts, paginates and clusters (see backend/src/routes/jobs.routes.js).
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
  const [selectedCluster, setSelectedCluster] = useState(null); // tapped cluster or company office
  const [areaBounds, setAreaBounds] = useState(null); // list restricted to a map cluster / office
  const [areaCompany, setAreaCompany] = useState(null); // ...and to the office's company
  const [viewport, setViewport] = useState(null); // { bbox, zoom } of the visible map
  const [draftFilters, setDraftFilters] = useState(null); // All Filters sheet draft
  const [userLocation, setUserLocation] = useState(null);
  const [overlayHeight, setOverlayHeight] = useState(0);

  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const activeFilterCount = countActiveFilters(filters);

  // Search + chips + sheet filters as API parameters (shared by map, list and counts).
  const filterParams = useMemo(
    () => buildFilterParams({ query: debouncedQuery, verifiedOnly, last24h, filters }),
    [debouncedQuery, verifiedOnly, last24h, filters]
  );
  const filterKey = paramsKey(filterParams);

  // Map markers for the visible area.
  const mapParams = useMemo(
    () => viewport && { ...filterParams, bbox: bboxParam(viewport.bbox), zoom: viewport.zoom },
    [filterParams, viewport]
  );
  const mapKey = viewMode === 'map' && mapParams ? paramsKey(mapParams) : null;
  const map = useRemoteData(fetchJobMap, mapParams, mapKey, { debounceMs: VIEWPORT_DEBOUNCE_MS });
  const mapLoading = loadingView(map, mapKey);

  // Total and extent of all matching jobs ("View jobs (N)", fit to results).
  const summary = useRemoteData(fetchJobSummary, filterParams, filterKey);
  const summaryLoading = loadingView(summary, filterKey);
  const jobCount = summary.dataKey === filterKey ? summary.data.total : null;
  const companyCount = summary.dataKey === filterKey ? summary.data.companyCount : null;

  // List (infinite scroll), restricted to a cluster's area after "View list".
  const listParams = useMemo(
    () => ({
      ...filterParams,
      sort: sortBy,
      ...(userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : {}),
      ...(areaBounds ? { bbox: bboxParam(areaBounds) } : {}),
      ...(areaCompany ? { company: [areaCompany] } : {}),
    }),
    [filterParams, sortBy, userLocation, areaBounds, areaCompany]
  );
  const list = useJobList(listParams, { enabled: viewMode === 'list' });

  // Preview card for a tapped job marker.
  const selected = useRemoteData(fetchJob, selectedJobId, selectedJobId, { enabled: Boolean(selectedJobId) });
  const selectedJob = useMemo(() => {
    if (!selectedJobId || selected.dataKey !== selectedJobId) return null;
    const job = selected.data;
    return userLocation
      ? { ...job, distanceKm: distanceKm(userLocation.lat, userLocation.lng, job.latitude, job.longitude) }
      : job;
  }, [selectedJobId, selected.data, selected.dataKey, userLocation]);

  // All Filters sheet: options with counts over all jobs, and the draft's result count.
  const filterSheetOpen = openSheet === 'filters';
  const options = useRemoteData(fetchFilterOptions, {}, filterSheetOpen ? 'all' : null);
  const draftParams = useMemo(
    () => buildFilterParams({ query: debouncedQuery, verifiedOnly, last24h, filters: draftFilters ?? filters }),
    [debouncedQuery, verifiedOnly, last24h, draftFilters, filters]
  );
  const draftKey = filterSheetOpen ? paramsKey(draftParams) : null;
  const draftSummary = useRemoteData(fetchJobSummary, draftParams, draftKey, { debounceMs: 200 });
  const draftCount = draftKey !== null && draftSummary.dataKey === draftKey ? draftSummary.data.total : null;
  const handleDraftChange = useCallback((draft) => setDraftFilters(draft), []);

  // "View companies": companies within the current results.
  const companiesOpen = openSheet === 'companies';
  const companyOptions = useRemoteData(fetchFilterOptions, filterParams, companiesOpen ? filterKey : null);
  const companies =
    companiesOpen && companyOptions.dataKey === filterKey ? companyOptions.data.sections.company : null;

  // When the results change, drop the cluster card and any selection that is
  // filtered out. Runs only on filter changes (the other values are read as-is).
  const selectedJobRef = useRef(null);
  selectedJobRef.current = selectedJob;
  const firstFilterKey = useRef(true);
  useEffect(() => {
    if (firstFilterKey.current) {
      firstFilterKey.current = false;
      return;
    }
    setSelectedCluster(null);
    setSelectedJobId((id) => {
      const job = selectedJobRef.current;
      if (!id || !job) return null;
      const stillMatches =
        filterJobs([job], { query: debouncedQuery, verifiedOnly, last24h, filters }).length > 0;
      return stillMatches ? id : null;
    });
  }, [filterKey]);

  // Fit the map to the results when the search or sheet filters change.
  const fitKey = paramsKey(buildFilterParams({ query: debouncedQuery, filters }));
  const lastFitKey = useRef(fitKey);
  useEffect(() => {
    if (fitKey === lastFitKey.current || summary.dataKey !== filterKey) return;
    lastFitKey.current = fitKey;
    if (debouncedQuery === '' && activeFilterCount === 0) return;
    if (summary.data.bounds) mapRef.current?.fitToBounds(summary.data.bounds);
  }, [summary.data, summary.dataKey, filterKey, fitKey, debouncedQuery, activeFilterCount]);

  const openDetails = (job) =>
    navigation.navigate('JobDetails', {
      job: { ...job, location: `${job.area}, ${job.city}` },
      jobId: job.id,
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

  const showList = (bounds = null, company = null) => {
    setAreaBounds(bounds);
    setAreaCompany(company);
    setSelectedCluster(null);
    setSelectedJobId(null);
    setViewMode('list');
  };

  const clearAll = () => {
    setQuery('');
    setVerifiedOnly(false);
    setLast24h(false);
    setFilters(EMPTY_FILTERS);
    setAreaBounds(null);
    setAreaCompany(null);
  };

  const handleViewportChange = useCallback((next) => setViewport(next), []);

  // Distance needs the user's location; fitment needs fit data (All Jobs has none).
  const sortAvailable = (sortId) => {
    if (sortId === 'distance') return Boolean(userLocation);
    if (sortId === 'fitment') return isSortAvailable(sortId, list.items);
    return true;
  };

  const showMapSkeleton = viewMode === 'map' && mapLoading.initialSkeleton;
  const showBottomSkeleton = mapLoading.loadingIndicator || mapLoading.initialSkeleton || summaryLoading.loadingIndicator;

  const renderListHeader = () => (
    <View style={styles.listHeader}>
      {list.total == null ? (
        <Skeleton width={90} height={14} borderRadius={radius.sm} />
      ) : (
        <Text style={styles.listCount}>
          {list.total} {list.total === 1 ? 'job' : 'jobs'}
          {areaBounds ? ' in the selected map area' : ''}
        </Text>
      )}
      {areaBounds && (
        <Pressable
          onPress={() => {
            setAreaBounds(null);
            setAreaCompany(null);
          }}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={styles.link}>Show all</Text>
        </Pressable>
      )}
    </View>
  );

  const renderListEmpty = () => {
    if (list.firstPageLoading) {
      return (
        <>
          {[0, 1, 2].map((index) => (
            <JobListItemSkeleton key={index} style={styles.listItem} />
          ))}
        </>
      );
    }
    if (list.firstPageError) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Couldn't load jobs</Text>
          <Text style={styles.emptyText}>{list.error?.message}</Text>
          <Button label="Try again" variant="outline" onPress={list.retry} />
        </View>
      );
    }
    if (!list.empty) return null;
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No jobs match your search</Text>
        <Button label="Clear filters" variant="outline" onPress={clearAll} />
      </View>
    );
  };

  const renderListFooter = () => {
    if (list.nextPageLoading) {
      return (
        <>
          {[0, 1].map((index) => (
            <JobListItemSkeleton key={index} style={styles.listItem} />
          ))}
        </>
      );
    }
    if (list.nextPageError) {
      return (
        <Pressable onPress={list.retry} accessibilityRole="button" style={styles.footerError}>
          <Text style={styles.footerErrorText}>Couldn't load more jobs. Tap to retry.</Text>
        </Pressable>
      );
    }
    return null;
  };

  return (
    <View style={styles.container}>
      <JobsMap
        ref={mapRef}
        markers={map.data}
        selectedJobId={selectedJobId}
        onViewportChange={handleViewportChange}
        onJobPress={(id) => {
          setSelectedCluster(null);
          setSelectedJobId(id);
        }}
        onClusterPress={(cluster) => {
          setSelectedJobId(null);
          setSelectedCluster(cluster);
        }}
        onMapPress={() => {
          setSelectedJobId(null);
          setSelectedCluster(null);
        }}
      />

      {viewMode === 'list' && (
        <FlatList
          style={styles.list}
          data={list.items}
          keyExtractor={(job) => job.id}
          contentContainerStyle={[styles.listContent, { paddingTop: overlayHeight + spacing.sm }]}
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={renderListHeader()}
          ListEmptyComponent={renderListEmpty()}
          ListFooterComponent={renderListFooter()}
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
          {showMapSkeleton ? (
            <>
              <Skeleton width={40} height={34} borderRadius={10} style={styles.chipSkeleton} />
              <Skeleton width={120} height={34} style={styles.chipSkeleton} />
              <Skeleton width={92} height={34} style={styles.chipSkeleton} />
              <Skeleton width={118} height={34} style={styles.chipSkeleton} />
            </>
          ) : (
            <>
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
            </>
          )}
        </ScrollView>
      </View>

      {viewMode === 'map' && (
        <>
          <View style={[styles.mapStatus, { top: overlayHeight + spacing.md }]} pointerEvents="box-none">
            {mapLoading.loadingIndicator || mapLoading.initialSkeleton ? (
              <LoadingDots />
            ) : mapLoading.errorRetry ? (
              <Pressable
                onPress={map.retry}
                accessibilityRole="button"
                style={({ pressed }) => [styles.mapError, pressed && styles.pressed]}
              >
                <Ionicons name="refresh" size={16} color={colors.primary} />
                <Text style={styles.mapErrorText}>Couldn't load jobs. Tap to retry.</Text>
              </Pressable>
            ) : null}
          </View>

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
          ) : selectedCluster ? (
            <View style={[styles.preview, styles.clusterCard]}>
              <View style={styles.clusterText}>
                {selectedCluster.companyName ? (
                  <>
                    <Text style={styles.clusterTitle} numberOfLines={1}>
                      {selectedCluster.count} jobs at {selectedCluster.companyName}
                    </Text>
                    <Text style={styles.clusterSub} numberOfLines={1}>
                      {selectedCluster.area}, {selectedCluster.city}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.clusterTitle}>{selectedCluster.count} jobs in this area</Text>
                    <Text style={styles.clusterSub}>{selectedCluster.companyCount} companies</Text>
                  </>
                )}
              </View>
              <Button
                label="Zoom in"
                variant="outline"
                onPress={() => {
                  mapRef.current?.zoomToBounds(selectedCluster.bounds);
                  setSelectedCluster(null);
                }}
                style={styles.clusterButton}
              />
              <Button
                label="View list"
                onPress={() => showList(selectedCluster.bounds, selectedCluster.companyName ?? null)}
                style={styles.clusterButton}
              />
            </View>
          ) : (
            <>
              <AgentSigmaButton style={styles.agentSigma} />
              {showBottomSkeleton ? (
                <View style={[styles.bottomActions, styles.bottomSkeletonRow]} pointerEvents="none">
                  <View style={styles.bottomSkeleton}>
                    <Skeleton width={20} height={20} borderRadius={6} />
                    <Skeleton width={96} height={12} />
                  </View>
                </View>
              ) : (
                <BottomActionBar
                  style={styles.bottomActions}
                  jobCount={jobCount}
                  companyCount={companyCount}
                  onViewCompanies={() => setOpenSheet('companies')}
                  onViewJobs={() => showList()}
                />
              )}
            </>
          )}
        </>
      )}

      <FilterSheet
        visible={filterSheetOpen}
        filters={filters}
        options={options.dataKey === 'all' ? options.data.sections : null}
        optionsLoading={!options.hasData}
        resultCount={draftCount}
        onDraftChange={handleDraftChange}
        onApply={(draft) => {
          setFilters(draft);
          setDraftFilters(null);
          setOpenSheet(null);
        }}
        onClose={() => {
          setDraftFilters(null);
          setOpenSheet(null);
        }}
      />
      <SortSheet
        visible={openSheet === 'sort'}
        selected={sortBy}
        isAvailable={sortAvailable}
        onSelect={(sortId) => {
          setSortBy(sortId);
          setOpenSheet(null);
        }}
        onClose={() => setOpenSheet(null)}
      />
      <CompanySheet
        visible={companiesOpen}
        companies={companies}
        error={companyOptions.error}
        onRetry={companyOptions.retry}
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
  chipSkeleton: {
    marginRight: spacing.sm,
  },
  mapStatus: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  mapError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadow,
  },
  mapErrorText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  pressed: {
    opacity: 0.85,
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
  bottomSkeletonRow: {
    alignItems: 'center',
  },
  bottomSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadow,
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
    minHeight: 20,
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
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  footerError: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  footerErrorText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
});
