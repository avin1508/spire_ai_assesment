// Map tile configuration for the Opportunities map (Leaflet in a WebView).
//
// The default uses the public OpenStreetMap tile server, which is fine for
// development and demos but is NOT for production traffic: its usage policy
// (https://operations.osmfoundation.org/policies/tiles/) allows only light use,
// with no availability guarantee. For a production build, set these to a
// provider/plan whose terms allow your traffic (e.g. a paid MapTiler, Stadia
// Maps or Thunderforest plan, or self-hosted tiles), for example in `.env`:
//
//   EXPO_PUBLIC_MAP_TILE_URL=https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=YOUR_KEY
//   EXPO_PUBLIC_MAP_ATTRIBUTION=© MapTiler © OpenStreetMap contributors
//
// Attribution must stay visible on the map whichever provider is used.

export const MAP_TILE_URL =
  process.env.EXPO_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const MAP_ATTRIBUTION =
  process.env.EXPO_PUBLIC_MAP_ATTRIBUTION || '© OpenStreetMap contributors';

export const MAP_MAX_ZOOM = 19;

// Initial view: India, so city-level clusters are visible.
export const MAP_INITIAL_VIEW = { latitude: 21.5, longitude: 78.5, zoom: 5 };

// Sent with tile requests so the tile server can identify the app.
export const MAP_USER_AGENT = 'SpireAI-iExchangeClone/0.1 (demo; React Native WebView)';
