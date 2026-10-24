import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import ScreenHeader from '../components/ScreenHeader';
import RoundIconButton from '../components/RoundIconButton';
import Button from '../components/Button';
import useResumeUpload from '../hooks/useResumeUpload';
import useRequireAuth from '../hooks/useRequireAuth';
import { selectProfile, selectResume, selectResumeFileMissing } from '../store/profileSlice';
import { formatDateRange, getInitials } from '../utils/format';
import { colors, radius, spacing } from '../theme';

const PREVIEW_EXPERIENCES = 2;

// Profile tab home. Shows the confirmed profile from Redux (filled by the
// resume flow); before that, an empty state that starts the resume flow.
export default function ProfileScreen({ navigation }) {
  const profile = useSelector(selectProfile);
  const resume = useSelector(selectResume);
  const resumeFileMissing = useSelector(selectResumeFileMissing);
  const uploadResume = useResumeUpload({ returnTo: 'Profile' });
  // Settings and resume download need an account; guests get the login sheet.
  const { requireAuth } = useRequireAuth();
  const backToProfile = { name: 'Main', params: { screen: 'Profile' } };

  const settingsButton = (
    <Pressable
      onPress={() =>
        requireAuth(
          () => Alert.alert('Coming soon', 'Settings are not available yet.'),
          backToProfile
        )
      }
      accessibilityRole="button"
      style={styles.settings}
    >
      <Ionicons name="settings-outline" size={22} color={colors.primary} />
      <Text style={styles.settingsText}>Settings</Text>
    </Pressable>
  );

  if (!profile) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Profile" right={settingsButton} />
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="person-outline" size={32} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Build your profile</Text>
          <Text style={styles.emptyText}>
            Upload your resume and Agent Sigma will fill in your profile for you.
          </Text>
          <Button label="Upload Resume" icon="cloud-upload-outline" onPress={uploadResume} />
        </View>
      </View>
    );
  }

  const experiences = profile.experiences ?? [];
  const education = profile.education ?? [];

  return (
    <View style={styles.container}>
      <ScreenHeader title="Profile" right={settingsButton} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(profile.fullName)}</Text>
            </View>
            <View style={styles.identityText}>
              <Text style={styles.name}>{profile.fullName}</Text>
              <ContactRow icon="mail" text={profile.email} />
              <ContactRow icon="call" text={profile.phone} />
            </View>
            <RoundIconButton icon="pencil" label="Edit profile" />
          </View>

          <View style={styles.details}>
            {profile.currentRole ? (
              <DetailRow icon="briefcase-outline" text={profile.currentRole} />
            ) : null}
            <DetailRow icon="location-outline" text={profile.currentLocation} />
            <DetailRow
              icon="navigate-circle-outline"
              label="Preferred work locations :"
              text={profile.preferredLocations.join('\n')}
            />
            <DetailRow
              icon="calendar-outline"
              text={`${profile.experienceYears} Years ${profile.experienceMonths} Months`}
            />
            {profile.skills?.length > 0 && (
              <DetailRow icon="construct-outline" label="Skills :" text={profile.skills.join(', ')} />
            )}
          </View>
        </View>

        <View style={styles.resumeCard}>
          <View style={styles.pdfIcon}>
            <Text style={styles.pdfText}>{resume ? 'PDF' : '—'}</Text>
          </View>
          <View style={styles.resumeText}>
            <Text style={styles.resumeName} numberOfLines={1}>
              {resume ? resume.name : 'No resume uploaded'}
            </Text>
            {resume && resumeFileMissing && (
              <Text style={styles.resumeWarning}>File missing — please upload it again</Text>
            )}
          </View>
          <RoundIconButton
            icon="arrow-up"
            label={resume ? 'Replace resume' : 'Upload resume'}
            variant="solid"
            onPress={uploadResume}
          />
          {resume && !resumeFileMissing && (
            <View style={styles.resumeAction}>
              <RoundIconButton
                icon="arrow-down"
                label="Download resume"
                variant="solid"
                onPress={() =>
                  requireAuth(
                    () =>
                      Alert.alert(
                        'Not available yet',
                        'Downloading will work once resumes are stored on the server.'
                      ),
                    backToProfile
                  )
                }
              />
            </View>
          )}
        </View>

        <SectionCard title="Experience">
          {experiences.length === 0 ? (
            <Text style={styles.sectionEmpty}>No experience added yet.</Text>
          ) : (
            experiences.slice(0, PREVIEW_EXPERIENCES).map((item, index) => (
              <View key={item.id} style={[styles.entry, index > 0 && styles.entryDivider]}>
                <Text style={styles.entryTitle}>{item.title}</Text>
                <Text style={styles.entrySub}>{item.company}</Text>
                <Text style={styles.entryMeta}>{formatDateRange(item.startDate, item.endDate)}</Text>
              </View>
            ))
          )}
          {experiences.length > PREVIEW_EXPERIENCES && (
            <Pressable
              onPress={() => navigation.navigate('Experience')}
              accessibilityRole="button"
              style={styles.showAll}
            >
              <Text style={styles.showAllText}>
                Show all {experiences.length} experiences
              </Text>
              <Ionicons name="arrow-forward" size={18} color={colors.primary} />
            </Pressable>
          )}
        </SectionCard>

        <SectionCard title="Education">
          {education.length === 0 ? (
            <Text style={styles.sectionEmpty}>No education added yet.</Text>
          ) : (
            education.map((item, index) => (
              <View key={item.id} style={[styles.entry, index > 0 && styles.entryDivider]}>
                <Text style={styles.entryTitle}>{item.institution}</Text>
                <Text style={styles.entrySub}>
                  {[item.degree, item.field].filter(Boolean).join(', ')}
                </Text>
                {item.startYear || item.endYear ? (
                  <Text style={styles.entryMeta}>
                    {[item.startYear, item.endYear].filter(Boolean).join(' – ')}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </SectionCard>
      </ScrollView>
    </View>
  );
}

function ContactRow({ icon, text }) {
  return (
    <View style={styles.contactRow}>
      <Ionicons name={icon} size={16} color="#9AA1AB" />
      <Text style={styles.contactText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function DetailRow({ icon, label, text }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={16} color={colors.textMuted} />
      </View>
      <View style={styles.detailTextBlock}>
        {label ? <Text style={styles.detailLabel}>{label}</Text> : null}
        <Text style={styles.detailText}>{text}</Text>
      </View>
    </View>
  );
}

// The add / edit icons in the section header are display-only (not clickable).
function SectionCard({ title, children }) {
  return (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <RoundIconButton icon="add" label={`Add ${title.toLowerCase()}`} />
        <View style={styles.sectionGap} />
        <RoundIconButton icon="pencil" label={`Edit ${title.toLowerCase()}`} />
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },
  settings: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
  },
  settingsText: {
    fontSize: 17,
    fontWeight: '500',
    color: colors.primary,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
  },
  avatarText: {
    fontSize: 26,
    color: colors.surface,
  },
  identityText: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  name: {
    marginBottom: spacing.xs,
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  contactText: {
    flexShrink: 1,
    marginLeft: spacing.sm,
    fontSize: 15,
    color: colors.text,
  },
  details: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
  },
  detailIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  detailTextBlock: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'center',
  },
  detailLabel: {
    marginBottom: spacing.xs,
    fontSize: 15,
    color: colors.textMuted,
  },
  detailText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  resumeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DCE6F8',
    backgroundColor: '#EEF3FD',
  },
  pdfIcon: {
    width: 40,
    height: 48,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 6,
    backgroundColor: '#F05252',
  },
  pdfText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.surface,
  },
  resumeText: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  resumeName: {
    fontSize: 16,
    color: colors.text,
  },
  resumeWarning: {
    marginTop: 2,
    fontSize: 13,
    color: colors.danger,
  },
  resumeAction: {
    marginLeft: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  sectionGap: {
    width: spacing.md,
  },
  sectionBody: {
    paddingHorizontal: spacing.lg,
  },
  sectionEmpty: {
    paddingVertical: spacing.lg,
    fontSize: 15,
    color: colors.textMuted,
  },
  entry: {
    paddingVertical: spacing.lg,
  },
  entryDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  entryTitle: {
    fontSize: 17,
    fontWeight: '500',
    color: colors.text,
  },
  entrySub: {
    marginTop: spacing.xs,
    fontSize: 15,
    color: colors.text,
  },
  entryMeta: {
    marginTop: spacing.xs,
    fontSize: 15,
    color: colors.textMuted,
  },
  showAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 56,
    marginHorizontal: -spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  showAllText: {
    fontSize: 16,
    color: colors.primary,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  emptyText: {
    marginBottom: spacing.sm,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: colors.textMuted,
  },
});
