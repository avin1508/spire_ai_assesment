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

// Pinned CDN versions of Leaflet and its clustering plugin.
const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';
const CLUSTER = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist';

// The page that runs inside the WebView. It owns the Leaflet map; React Native
// talks to it through `window.app.*` (injectJavaScript) and listens to the
// messages it posts back (ready / jobPress / clusterPress / mapPress / error).
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
<link rel="stylesheet" href="${CLUSTER}/MarkerCluster.css" />
<style>
  html, body, #map { margin: 0; height: 100%; width: 100%; background: #e8eef0; }
  .cluster { width: 44px; height: 44px; border-radius: 22px; background: ${colors.pin};
    border: 3px solid #fff; box-sizing: border-box; color: #fff; font: 700 13px sans-serif;
    display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
  .pin { position: relative; width: 24px; height: 24px; border-radius: 12px 12px 12px 0; transform: rotate(-45deg);
    background: ${colors.pin}; border: 2px solid #fff; box-sizing: border-box; box-shadow: 0 1px 3px rgba(0,0,0,.35); }
  .pin::after { content: ''; position: absolute; width: 8px; height: 8px; border-radius: 4px;
    background: #fff; top: 6px; left: 6px; }
  .pin.selected { background: #f59e0b; }
  .leaflet-control-attribution { font-size: 10px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="${LEAFLET}/leaflet.js"></script>
<script src="${CLUSTER}/leaflet.markercluster.js"></script>
<script>
(function () {
  var send = function (message) { window.ReactNativeWebView.postMessage(JSON.stringify(message)); };
  if (!window.L || !L.markerClusterGroup) { send({ type: 'error' }); return; }

  var config = ${config};
  var map = L.map('map', { zoomControl: false }).setView([config.view.latitude, config.view.longitude], config.view.zoom);
  map.attributionControl.setPrefix(false);
  L.tileLayer(config.tileUrl, { maxZoom: config.maxZoom, attribution: config.attribution }).addTo(map);

  var clusters = L.markerClusterGroup({
    showCoverageOnHover: false,
    zoomToBoundsOnClick: false,
    spiderfyOnMaxZoom: true,
    maxClusterRadius: 60,
    iconCreateFunction: function (cluster) {
      return L.divIcon({ html: '<div class="cluster">' + cluster.getChildCount() + '</div>', className: '', iconSize: [44, 44] });
    }
  });
  map.addLayer(clusters);

  var pinIcon = function (selected) {
    return L.divIcon({ html: '<div class="pin' + (selected ? ' selected' : '') + '"></div>', className: '', iconSize: [24, 24], iconAnchor: [12, 28] });
  };
  var markers = {};
  var selectedId = null;
  var lastCluster = null;
  var userMarker = null;

  clusters.on('clusterclick', function (event) {
    lastCluster = event.layer;
    var ids = event.layer.getAllChildMarkers().map(function (m) { return m.options.jobId; });
    send({ type: 'clusterPress', ids: ids });
  });
  map.on('click', function () { send({ type: 'mapPress' }); });

  window.app = {
    setJobs: function (jobs) {
      clusters.clearLayers();
      markers = {};
      clusters.addLayers(jobs.map(function (job) {
        var marker = L.marker([job.lat, job.lng], { icon: pinIcon(job.id === selectedId), jobId: job.id });
        marker.on('click', function () { send({ type: 'jobPress', id: job.id }); });
        markers[job.id] = marker;
        return marker;
      }));
    },
    select: function (id) {
      if (selectedId && markers[selectedId]) markers[selectedId].setIcon(pinIcon(false));
      selectedId = id;
      if (id && markers[id]) markers[id].setIcon(pinIcon(true));
    },
    zoomIn: function () { map.zoomIn(); },
    zoomOut: function () { map.zoomOut(); },
    zoomToLastCluster: function () { if (lastCluster) lastCluster.zoomToBounds({ padding: [60, 60] }); },
    fitToJobs: function () {
      var bounds = clusters.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 13 });
    },
    showUserLocation: function (lat, lng) {
      if (userMarker) map.removeLayer(userMarker);
      userMarker = L.circleMarker([lat, lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(map);
      map.setView([lat, lng], 12);
    }
  };
  send({ type: 'ready' });
})();
</script>
</body>
</html>`;
}

// Interactive OpenStreetMap-tile map (Leaflet in a WebView) with clustered job
// markers placed at each job's latitude / longitude.
const JobsMap = forwardRef(function JobsMap(
  { jobs, selectedJobId, onJobPress, onClusterPress, onMapPress, style },
  ref
) {
  const webRef = useRef(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const html = useMemo(buildHtml, []);

  const run = (script) => webRef.current?.injectJavaScript(`${script}; true;`);

  useImperativeHandle(ref, () => ({
    zoomIn: () => run('window.app && app.zoomIn()'),
    zoomOut: () => run('window.app && app.zoomOut()'),
    zoomToLastCluster: () => run('window.app && app.zoomToLastCluster()'),
    fitToJobs: () => run('window.app && app.fitToJobs()'),
    showUserLocation: (lat, lng) => run(`window.app && app.showUserLocation(${lat}, ${lng})`),
  }));

  const markerData = useMemo(
    () => jobs.map((job) => ({ id: job.id, lat: job.latitude, lng: job.longitude })),
    [jobs]
  );

  useEffect(() => {
    if (status === 'ready') run(`app.setJobs(${JSON.stringify(markerData)})`);
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
    else if (message.type === 'jobPress') onJobPress?.(message.id);
    else if (message.type === 'clusterPress') onClusterPress?.(message.ids);
    else if (message.type === 'mapPress') onMapPress?.();
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
