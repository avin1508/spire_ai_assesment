// Static mock data for the Opportunities map placeholder.
// All x / y values are percentages of the map area (0–100), not real coordinates.
// The layout loosely follows central/south India so the illustration reads as a map.

export const cities = [
  { id: 'ahmedabad', name: 'Ahmedabad', x: 1, y: 20 },
  { id: 'surat', name: 'Surat', x: 1, y: 32 },
  { id: 'nagpur', name: 'Nagpur', x: 57.6, y: 34 },
  { id: 'pune', name: 'Pune', x: 5.7, y: 50.5 },
  { id: 'bengaluru', name: 'Bengaluru', x: 42.4, y: 80 },
  { id: 'chennai', name: 'Chennai', x: 68.8, y: 79.5 },
];

// Country / state names drawn as map labels (x / y is the label centre).
export const regionLabels = [
  { id: 'india', name: 'India', x: 62, y: 22, type: 'country' },
  { id: 'mp', name: 'MADHYA\nPRADESH', x: 38.6, y: 18 },
  { id: 'mh', name: 'MAHARASHTRA', x: 24, y: 44 },
  { id: 'tg', name: 'TELANGANA', x: 64, y: 55 },
  { id: 'ka', name: 'KARNATAKA', x: 24, y: 72 },
  { id: 'ap', name: 'ANDHRA\nPRADESH', x: 57.6, y: 69 },
  { id: 'goa', name: 'GOA', x: 5, y: 70.9 },
  { id: 'cg', name: 'CHHATTISGARH', x: 84, y: 45 },
];

// Polylines drawn as thin grey roads.
export const roads = [
  [[1, 20], [12, 24], [26, 25], [40, 28], [57.6, 34], [70, 35], [90, 32], [100, 30]],
  [[1, 32], [5.7, 50.5]],
  [[5.7, 50.5], [20, 52], [35, 55], [51, 57.4], [68, 62], [80, 58]],
  [[57.6, 34], [54, 45], [51, 57.4], [46, 72], [42.4, 80]],
  [[42.4, 80], [55, 86], [68.8, 79.5]],
  [[51, 57.4], [60, 70], [68.8, 79.5]],
  [[26, 25], [30, 10], [35, 0]],
  [[5.7, 50.5], [15, 65], [25, 75], [42.4, 80]],
  [[57.6, 34], [70, 20], [85, 10]],
  [[40, 28], [38, 40], [35, 55]],
  [[42.4, 80], [35, 95], [30, 100]],
];

// Polylines drawn as dashed state borders.
export const stateBorders = [
  [[0, 38], [12, 36], [22, 39], [35, 35], [45, 30], [55, 28], [66, 30]],
  [[66, 30], [62, 38], [58, 45], [50, 50], [48, 58]],
  [[2, 62], [15, 60], [28, 61], [40, 64], [48, 58]],
  [[48, 58], [55, 66], [66, 64], [76, 57]],
  [[40, 64], [42, 72], [38, 80], [44, 88], [50, 93]],
  [[50, 93], [60, 91], [70, 93]],
  [[66, 30], [70, 20], [76, 10], [80, 0]],
  [[66, 30], [72, 40], [80, 44], [92, 40]],
  [[0, 67], [8, 67.5], [8.5, 73], [1, 74]],
];

// Lighter / darker land patches that give the map its mottled look.
// x / y is the top-left corner; w / h are percentages of the map size.
export const landPatches = [
  { x: 5, y: 6, w: 22, h: 10, rotate: -15 },
  { x: 30, y: 2, w: 18, h: 8, rotate: 20 },
  { x: 55, y: 8, w: 25, h: 9, rotate: -10 },
  { x: 46, y: 26, w: 20, h: 12, rotate: 15 },
  { x: 8, y: 37, w: 28, h: 10, rotate: -20 },
  { x: 35, y: 43, w: 18, h: 9, rotate: 10 },
  { x: 60, y: 40, w: 14, h: 8, rotate: -25 },
  { x: -2, y: 55, w: 20, h: 12, rotate: 30 },
  { x: 40, y: 60, w: 24, h: 9, rotate: -10 },
  { x: 18, y: 66, w: 22, h: 9, rotate: 15 },
  { x: 50, y: 76, w: 16, h: 7, rotate: -20 },
  { x: 26, y: 79, w: 26, h: 9, rotate: 5 },
  { x: 54, y: 90, w: 18, h: 7, rotate: -15 },
  { x: 6, y: 86, w: 16, h: 8, rotate: 20 },
  { x: 80, y: 18, w: 18, h: 10, rotate: 10 },
  { x: 70, y: 31, w: 12, h: 7, rotate: 0 },
  { x: 64, y: 13, w: 14, h: 9, rotate: 25, dark: true },
  { x: 14, y: 21, w: 12, h: 8, rotate: -10, dark: true },
  { x: 66, y: 47, w: 10, h: 10, rotate: 0, dark: true },
  { x: 30, y: 91, w: 12, h: 6, rotate: 10, dark: true },
];

// Blue job-count pins; the pin tip points at (x, y).
export const jobMarkers = [
  { id: 'm1', x: 25.6, y: 22.7, count: 5 },
  { id: 'm2', x: 5.1, y: 49.2, count: 6 },
  { id: 'm3', x: 50.8, y: 57, count: 7 },
  { id: 'm4', x: 42.8, y: 79.8, count: 23 },
  { id: 'm5', x: 68.8, y: 79.3, count: 7 },
];

// White company callouts with a job count; the tail points at (x, y).
export const companyMarkers = [
  { id: 'c1', x: 57.6, y: 31.5, count: 285, name: 'Kotak Mahindra' },
  { id: 'c2', x: 36.6, y: 98.5, count: 294, name: 'Accenture' },
];

export const filterOptions = [
  { id: 'recommended', label: 'Recommended', icon: 'sparkles', iconColor: '#E3A21A' },
  { id: 'verified', label: 'Verified', dot: true },
  { id: 'last24h', label: 'Last 24 hours', dot: true },
];

export const mapSummary = {
  companies: 86,
  jobs: 186445,
};

export const jobTabCounts = {
  recommended: 0,
  saved: 0,
  applied: 0,
};

export const unreadNotifications = 0;
