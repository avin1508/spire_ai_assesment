import { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import RecommendedLanding from '../components/RecommendedLanding';
import RecommendationStatus from '../components/RecommendationStatus';
import SearchField from '../components/SearchField';
import FilterChip from '../components/FilterChip';
import JobCard from '../components/JobCard';
import Button from '../components/Button';
import SortSheet from '../components/SortSheet';
import FilterSheet from '../components/FilterSheet';
import { useDispatch, useSelector } from 'react-redux';
import { selectIsGuest } from '../store/sessionSlice';
import {
  loadRecommendations,
  selectProfile,
  selectRecommendations,
} from '../store/profileSlice';
import useResumeUpload from '../hooks/useResumeUpload';
import useRequireAuth from '../hooks/useRequireAuth';
import {
  EMPTY_FILTERS,
  countActiveFilters,
  filterJobs,
  isSortAvailable,
  sortJobs,
} from '../utils/jobFilters';
import { colors, spacing } from '../theme';

// Recommended tab: landing (no profile yet) → status (loading / empty /
// unavailable) → job list. Guest vs signed-in comes from the session.
export default function RecommendedScreen() {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const isGuest = useSelector(selectIsGuest);
  const profile = useSelector(selectProfile);
  const recommendations = useSelector(selectRecommendations);
  const startResumeUpload = useResumeUpload();

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('recommended');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [last24h, setLast24h] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [openSheet, setOpenSheet] = useState(null); // 'sort' | 'filters' | null

  const { openLogin } = useRequireAuth();
  const goToSignUp = () => openLogin();
  const promptSignUp = () => openLogin();

  const allJobs = recommendations.items;
  const jobs = useMemo(
    () => sortJobs(filterJobs(allJobs, { query, verifiedOnly, last24h, filters }), sortBy),
    [allJobs, query, verifiedOnly, last24h, filters, sortBy]
  );
  const activeFilterCount = countActiveFilters(filters);
  const shownCount = recommendations.status === 'ready' ? jobs.length : 0;

  // The tab label shows how many jobs the current search/filters leave.
  useEffect(() => {
    navigation.setOptions({ title: `Recommended (${shownCount})` });
  }, [navigation, shownCount]);

  const resetAll = () => {
    setQuery('');
    setVerifiedOnly(false);
    setLast24h(false);
    setFilters(EMPTY_FILTERS);
  };

  if (!profile) {
    return (
      <RecommendedLanding
        showSignUp={isGuest}
        onUploadResume={startResumeUpload}
        onSignUp={goToSignUp}
      />
    );
  }

  const hasResults = recommendations.status === 'ready' && recommendations.items.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.search}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Search Recommended Jobs, Skills, Location..."
          editable={hasResults}
        />
      </View>
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <FilterChip
            variant="outline"
            label="Sort"
            icon="swap-vertical"
            iconColor={colors.text}
            selected={sortBy !== 'recommended'}
            disabled={!hasResults}
            onPress={() => setOpenSheet('sort')}
          />
          <FilterChip
            variant="outline"
            label={activeFilterCount > 0 ? `All Filters (${activeFilterCount})` : 'All Filters'}
            icon="options-outline"
            labelColor={colors.primary}
            selected={activeFilterCount > 0}
            disabled={!hasResults}
            onPress={() => setOpenSheet('filters')}
          />
          <FilterChip
            variant="outline"
            label="Verified"
            dot
            selected={verifiedOnly}
            disabled={!hasResults}
            onPress={() => setVerifiedOnly((value) => !value)}
          />
          <FilterChip
            variant="outline"
            label="Last 24 hours"
            dot
            selected={last24h}
            disabled={!hasResults}
            onPress={() => setLast24h((value) => !value)}
          />
        </ScrollView>
      </View>

      {recommendations.status === 'ready' ? (
        <FlatList
          data={jobs}
          keyExtractor={(job) => job.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            allJobs.length === 0 ? (
              <RecommendationStatus status="empty" />
            ) : (
              <View style={styles.noMatches}>
                <Text style={styles.noMatchesTitle}>No jobs match your filters</Text>
                <Button label="Clear filters" variant="outline" onPress={resetAll} />
              </View>
            )
          }
          renderItem={({ item }) => (
            <JobCard
              job={item}
              locked={isGuest}
              onPress={() => navigation.navigate('JobDetails', { job: item })}
              onShare={() => Share.share({ message: `${item.title} at ${item.company}` })}
              onSave={isGuest ? promptSignUp : undefined}
              onLearnSkill={
                isGuest ? promptSignUp : (skill) => navigation.navigate('Learning', { skill })
              }
            />
          )}
        />
      ) : (
        <RecommendationStatus
          status={recommendations.status === 'idle' ? 'unavailable' : recommendations.status}
          message={
            recommendations.status === 'idle'
              ? 'Job recommendations are coming soon. Your profile has been saved.'
              : recommendations.message
          }
          onRetry={() => dispatch(loadRecommendations(profile))}
        />
      )}

      <SortSheet
        visible={openSheet === 'sort'}
        selected={sortBy}
        isAvailable={(sortId) => isSortAvailable(sortId, allJobs)}
        onSelect={(sortId) => {
          setSortBy(sortId);
          setOpenSheet(null);
        }}
        onClose={() => setOpenSheet(null)}
      />
      <FilterSheet
        visible={openSheet === 'filters'}
        jobs={allJobs}
        filters={filters}
        countFor={(draft) =>
          filterJobs(allJobs, { query, verifiedOnly, last24h, filters: draft }).length
        }
        onApply={(draft) => {
          setFilters(draft);
          setOpenSheet(null);
        }}
        onClose={() => setOpenSheet(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  search: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  chips: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  list: {
    paddingTop: spacing.xs,
    flexGrow: 1,
  },
  noMatches: {
    alignItems: 'center',
    paddingTop: spacing.xl * 2,
    gap: spacing.lg,
  },
  noMatchesTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
});
