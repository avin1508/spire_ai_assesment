// UI constants for the Jobs screens. All Jobs data comes from the backend
// (services/jobsService.js); mockJobs.js is no longer used by the app.

export const filterOptions = [
  { id: 'recommended', label: 'Recommended', icon: 'sparkles', iconColor: '#E3A21A' },
  { id: 'verified', label: 'Verified', dot: true },
  { id: 'last24h', label: 'Last 24 hours', dot: true },
];

export const jobTabCounts = {
  saved: 0,
  applied: 0,
};

export const unreadNotifications = 0;
