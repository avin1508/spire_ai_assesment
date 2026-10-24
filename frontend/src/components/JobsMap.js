import { forwardRef, useImperativeHandle, useMemo, useRef, useState, useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  MAP_ATTRIBUTION,
  MAP_INITIAL_VIEW,
  MAP_MAX_ZOOM,
  MAP_TILE_URL,
  MAP_USER_AGENT,
} from '../config/map';
import { colors, spacing } from '../theme';

// Pinned CDN version of Leaflet.
const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';

// The page that runs inside the WebView. It owns the Leaflet map; React Native
// talks to it through `window.app.*` (injectJavaScript) and listens to the
// messages it posts back (ready / viewport / jobPress / clusterPress /
// officePress / mapPress / error). Clustering is done by the backend: the
// page only draws the markers it is given — a numbered pin for a cluster of
// company offices, and a white bubble (job count + company name) for one
// company office.
function buildHtml() {
  const config = JSON.stringify({
    tileUrl: MAP_TILE_URL,
    attribution: MAP_ATTRIBUTION,
    maxZoom: MAP_MAX_ZOOM,
    view: MAP_INITIAL_VIEW,
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="${LEAFLET}/leaflet.css" />
<style>
  html, body, #map { margin: 0; height: 100%; width: 100%; background: #e8eef0; }
  /* Markers are drawn above their location: the pointer tip sits on it. */
  .marker { position: absolute; left: 0; bottom: 0; transform: translateX(-50%); }
  /* Cluster of offices: blue numbered pin. */
  .pin { position: relative; min-width: 34px; height: 34px; margin-bottom: 7px; padding: 0 6px;
    box-sizing: border-box; border-radius: 17px; border: 2px solid #fff; background: ${colors.pin};
    color: #fff; font: 700 14px sans-serif; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 1px 4px rgba(0,0,0,.35); }
  .pin::after { content: ''; position: absolute; left: 50%; bottom: -8px; margin-left: -6px;
    border-style: solid; border-width: 7px 6px 0; border-color: ${colors.pin} transparent transparent; }
  /* One company office: white bubble (briefcase + job count) and the company name. */
  .bubble { position: relative; display: flex; align-items: center; gap: 5px; margin-bottom: 7px;
    padding: 5px 10px 5px 8px; border-radius: 16px; background: #fff; color: ${colors.text};
    font: 700 14px sans-serif; white-space: nowrap; box-shadow: 0 1px 4px rgba(0,0,0,.3); }
  .bubble::after { content: ''; position: absolute; left: 50%; bottom: -6px; margin-left: -6px;
    border-style: solid; border-width: 6px 6px 0; border-color: #fff transparent transparent; }
  .bubble svg { width: 16px; height: 16px; fill: ${colors.primary}; }
  .label { position: absolute; left: calc(100% + 6px); top: 50%; transform: translateY(-50%);
    max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    color: ${colors.primary}; font: 600 13px sans-serif;
    text-shadow: 0 0 2px #fff, 0 0 2px #fff, 0 0 3px #fff, 0 0 4px #fff; }
  .selected .bubble { background: ${colors.primary}; color: #fff; }
  .selected .bubble svg { fill: #fff; }
  .selected .bubble::after { border-top-color: ${colors.primary}; }
  .leaflet-control-attribution { font-size: 10px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="${LEAFLET}/leaflet.js"></script>
<script>
(function () {
  var send = function (message) { window.ReactNativeWebView.postMessage(JSON.stringify(message)); };
  if (!window.L) { send({ type: 'error' }); return; }

  var config = ${config};
  var map = L.map('map', { zoomControl: false }).setView([config.view.latitude, config.view.longitude], config.view.zoom);
  map.attributionControl.setPrefix(false);
  L.tileLayer(config.tileUrl, { maxZoom: config.maxZoom, attribution: config.attribution }).addTo(map);

  var layer = L.layerGroup().addTo(map);
  var BRIEFCASE = '<svg viewBox="0 0 24 24"><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/></svg>';
  var escapeHtml = function (text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var icon = function (html) { return L.divIcon({ html: html, className: '', iconSize: [0, 0] }); };
  // Cluster: the number of company offices it groups.
  var clusterIcon = function (cluster) {
    return icon('<div class="marker"><div class="pin">' + cluster.officeCount + '</div></div>');
  };
  // Office: its job count and company name.
  var officeIcon = function (office, selected) {
    return icon('<div class="marker' + (selected ? ' selected' : '') + '"><div class="bubble">' + BRIEFCASE +
      '<span>' + office.count + '</span><div class="label">' + escapeHtml(office.companyName) + '</div></div></div>');
  };
  var markers = {}; // job id → { marker, office } for one-job offices (selectable)
  var selectedId = null;
  var userMarker = null;
  var round = function (value) { return Math.round(value * 1e6) / 1e6; };
  var toBounds = function (b) { return L.latLngBounds([b.south, b.west], [b.north, b.east]); };

  // Visible area (clamped to valid coordinates) and whole-number zoom.
  var sendViewport = function () {
    var b = map.getBounds();
    var bbox = {
      west: round(Math.max(-180, b.getWest())),
      south: round(Math.max(-90, b.getSouth())),
      east: round(Math.min(180, b.getEast())),
      north: round(Math.min(90, b.getNorth()))
    };
    if (bbox.west > bbox.east) { bbox.west = -180; bbox.east = 180; }
    send({ type: 'viewport', bbox: bbox, zoom: Math.max(0, Math.min(20, Math.round(map.getZoom()))) });
  };
  map.on('moveend', sendViewport);
  map.on('click', function () { send({ type: 'mapPress' }); });

  window.app = {
    // Replace the markers with the server's clusters and individual jobs.
    setMarkers: function (data) {
      layer.clearLayers();
      markers = {};
      data.clusters.forEach(function (cluster) {
        var marker = L.marker([cluster.latitude, cluster.longitude], { icon: clusterIcon(cluster) });
        marker.on('click', function () { send({ type: 'clusterPress', id: cluster.id }); });
        layer.addLayer(marker);
      });
      data.offices.forEach(function (office) {
        var selected = Boolean(office.jobId) && office.jobId === selectedId;
        var marker = L.marker([office.latitude, office.longitude], { icon: officeIcon(office, selected) });
        marker.on('click', function () {
          // One job: open its preview. Several: the office card.
          if (office.jobId) send({ type: 'jobPress', id: office.jobId });
          else send({ type: 'officePress', id: office.id });
        });
        if (office.jobId) markers[office.jobId] = { marker: marker, office: office };
        layer.addLayer(marker);
      });
    },
    select: function (id) {
      var previous = selectedId && markers[selectedId];
      if (previous) previous.marker.setIcon(officeIcon(previous.office, false));
      selectedId = id;
      var next = id && markers[id];
      if (next) {
        next.marker.setIcon(officeIcon(next.office, true));
        next.marker.setZIndexOffset(1000);
      }
    },
    zoomIn: function () { map.zoomIn(); },
    zoomOut: function () { map.zoomOut(); },
    // Zoom into a cluster's area.
    zoomToBounds: function (b) { map.fitBounds(toBounds(b), { padding: [60, 60], maxZoom: 16 }); },
    // Fit the map to the area containing the results.
    fitToBounds: function (b) { map.fitBounds(toBounds(b), { padding: [60, 60], maxZoom: 13 }); },
    showUserLocation: function (lat, lng) {
      if (userMarker) map.removeLayer(userMarker);
      userMarker = L.circleMarker([lat, lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(map);
      map.setView([lat, lng], 12);
    }
  };
  send({ type: 'ready' });
  sendViewport();
})();
</script>
</body>
</html>`;
}

// Interactive OpenStreetMap-tile map (Leaflet in a WebView) showing the
// clusters and company offices returned by the backend for the visible area.
// `markers` is the map API response ({ clusters, offices }) or null.
// onClusterPress(marker) receives a cluster, or an office with several jobs.
// onViewportChange({ bbox, zoom }) fires after every pan / zoom.
const JobsMap = forwardRef(function JobsMap(
  { markers, selectedJobId, onJobPress, onClusterPress, onMapPress, onViewportChange, style },
  ref
) {
  const webRef = useRef(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const html = useMemo(buildHtml, []);

  const run = (script) => webRef.current?.injectJavaScript(`${script}; true;`);

  useImperativeHandle(ref, () => ({
    zoomIn: () => run('window.app && app.zoomIn()'),
    zoomOut: () => run('window.app && app.zoomOut()'),
    zoomToBounds: (bounds) => run(`window.app && app.zoomToBounds(${JSON.stringify(bounds)})`),
    fitToBounds: (bounds) => run(`window.app && app.fitToBounds(${JSON.stringify(bounds)})`),
    showUserLocation: (lat, lng) => run(`window.app && app.showUserLocation(${lat}, ${lng})`),
  }));

  // Only what the page draws: positions, counts and ids.
  const markerData = useMemo(
    () =>
      markers && {
        clusters: markers.clusters.map(({ id, latitude, longitude, officeCount }) => ({
          id,
          latitude,
          longitude,
          officeCount,
        })),
        offices: markers.offices.map(({ id, latitude, longitude, count, companyName, jobId }) => ({
          id,
          latitude,
          longitude,
          count,
          companyName,
          jobId,
        })),
      },
    [markers]
  );
  const markersById = useMemo(
    () => new Map([...(markers?.clusters ?? []), ...(markers?.offices ?? [])].map((marker) => [marker.id, marker])),
    [markers]
  );

  useEffect(() => {
    if (status === 'ready' && markerData) run(`app.setMarkers(${JSON.stringify(markerData)})`);
  }, [status, markerData]);

  useEffect(() => {
    if (status === 'ready') run(`app.select(${JSON.stringify(selectedJobId ?? null)})`);
  }, [status, selectedJobId, markerData]);

  const handleMessage = (event) => {
    let message;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message.type === 'ready') setStatus('ready');
    else if (message.type === 'error') setStatus('error');
    else if (message.type === 'viewport') onViewportChange?.({ bbox: message.bbox, zoom: message.zoom });
    else if (message.type === 'jobPress') onJobPress?.(message.id);
    else if (message.type === 'clusterPress' || message.type === 'officePress') {
      const marker = markersById.get(message.id);
      if (marker) onClusterPress?.(marker);
    } else if (message.type === 'mapPress') onMapPress?.();
  };

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webRef}
        source={{ html, baseUrl: 'https://localhost/' }}
        originWhitelist={['*']}
        onMessage={handleMessage}
        onError={() => setStatus('error')}
        userAgent={MAP_USER_AGENT}
        setSupportMultipleWindows={false}
        overScrollMode="never"
        style={styles.webview}
      />
      {status !== 'ready' && (
        <View style={styles.overlay} pointerEvents="none">
          {status === 'loading' ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.error}>
              The map couldn't load. Check your internet connection and try again.
            </Text>
          )}
        </View>
      )}
    </View>
  );
});

export default JobsMap;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#E8EEF0',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  error: {
    fontSize: 15,
    textAlign: 'center',
    color: colors.textMuted,
  },
});
