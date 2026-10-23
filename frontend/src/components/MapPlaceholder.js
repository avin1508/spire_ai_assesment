import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

// Static, locally drawn map-style background. No real map provider is used;
// every position comes from percentage coordinates in the mock data.
export default function MapPlaceholder({
  cities,
  regionLabels,
  roads,
  stateBorders,
  landPatches,
  jobMarkers,
  companyMarkers,
  style,
}) {
  const [size, setSize] = useState(null);

  const toPoint = ([x, y]) => ({
    left: (x / 100) * size.width,
    top: (y / 100) * size.height,
  });

  return (
    <View
      style={[styles.container, style]}
      onLayout={(event) => setSize(event.nativeEvent.layout)}
      pointerEvents="box-none"
    >
      {landPatches.map((patch, index) => (
        <View
          key={`patch-${index}`}
          style={[
            styles.patch,
            patch.dark && styles.patchDark,
            {
              left: `${patch.x}%`,
              top: `${patch.y}%`,
              width: `${patch.w}%`,
              height: `${patch.h}%`,
              transform: [{ rotate: `${patch.rotate}deg` }],
            },
          ]}
        />
      ))}

      <View style={[styles.water, styles.bayOfBengal]} />
      <View style={[styles.water, styles.arabianSea]} />

      {size && (
        <>
          {roads.map((points, index) => (
            <Polyline key={`road-${index}`} points={points.map(toPoint)} variant="road" />
          ))}
          {stateBorders.map((points, index) => (
            <Polyline key={`border-${index}`} points={points.map(toPoint)} variant="border" />
          ))}

          {regionLabels.map((label) => {
            const point = toPoint([label.x, label.y]);
            const isCountry = label.type === 'country';
            return (
              <Text
                key={label.id}
                pointerEvents="none"
                style={[
                  isCountry ? styles.countryLabel : styles.regionLabel,
                  {
                    left: point.left - LABEL_WIDTH / 2,
                    top: point.top - (isCountry ? 16 : 9),
                  },
                ]}
              >
                {label.name}
              </Text>
            );
          })}

          {cities.map((city) => {
            const point = toPoint([city.x, city.y]);
            return (
              <View key={city.id} style={[styles.city, point]} pointerEvents="none">
                <View style={styles.cityDot} />
                <Text style={styles.cityLabel}>{city.name}</Text>
              </View>
            );
          })}

          {companyMarkers.map((marker) => (
            <CompanyMarker
              key={marker.id}
              name={marker.name}
              count={marker.count}
              point={toPoint([marker.x, marker.y])}
            />
          ))}

          {jobMarkers.map((marker) => (
            <JobPin key={marker.id} count={marker.count} point={toPoint([marker.x, marker.y])} />
          ))}
        </>
      )}
    </View>
  );
}

// Draws a polyline as rotated straight segments between consecutive points.
function Polyline({ points, variant }) {
  return points.slice(1).map((to, index) => {
    const from = points[index];
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    const length = Math.sqrt(dx * dx + dy * dy);
    const thickness = variant === 'road' ? ROAD_WIDTH : BORDER_WIDTH;

    return (
      <View
        key={index}
        pointerEvents="none"
        style={[
          variant === 'road' ? styles.road : styles.borderLine,
          {
            width: length,
            left: (from.left + to.left) / 2 - length / 2,
            top: (from.top + to.top) / 2 - thickness / 2,
            transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
          },
        ]}
      >
        {/* Android only dashes full borders, so clip a dashed box to its top edge. */}
        {variant === 'border' && <View style={styles.borderDash} />}
      </View>
    );
  });
}

function JobPin({ count, point }) {
  return (
    <View
      style={[styles.pin, { left: point.left - PIN_SIZE / 2, top: point.top - PIN_SIZE * 1.2 }]}
      accessible
      accessibilityLabel={`${count} jobs`}
    >
      <View style={styles.pinShape} />
      {/* Raised above the elevated shape so Android draws the number on top. */}
      <View style={styles.pinLabel}>
        <Text style={styles.pinText}>{count}</Text>
      </View>
    </View>
  );
}

function CompanyMarker({ name, count, point }) {
  return (
    <View
      style={[styles.company, { left: point.left - CALLOUT_TAIL_X, top: point.top - CALLOUT_HEIGHT }]}
      accessible
      accessibilityLabel={`${name}, ${count} jobs`}
    >
      <View>
        <View style={styles.calloutBubble}>
          <Ionicons name="briefcase" size={14} color={colors.primary} />
          <Text style={styles.calloutCount}>{count}</Text>
        </View>
        <View style={styles.calloutTail} />
      </View>
      <Text style={styles.companyName} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

const ROAD_WIDTH = 1.5;
const BORDER_WIDTH = 1;
const LABEL_WIDTH = 160;
const PIN_SIZE = 28;
const CALLOUT_HEIGHT = 36;
const CALLOUT_TAIL_X = 22;

const styles = StyleSheet.create({
  container: {
    // Explicit absolute fill: `StyleSheet.absoluteFillObject` did not apply in RN 0.88.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    backgroundColor: colors.map.land,
  },
  patch: {
    position: 'absolute',
    borderRadius: 60,
    backgroundColor: colors.map.landLight,
    opacity: 0.65,
  },
  patchDark: {
    backgroundColor: colors.map.landDark,
    opacity: 1,
  },
  water: {
    position: 'absolute',
    backgroundColor: colors.map.water,
    borderRadius: 400,
  },
  bayOfBengal: {
    left: '74%',
    top: '46%',
    width: '60%',
    height: '75%',
    transform: [{ rotate: '12deg' }],
  },
  arabianSea: {
    left: '-25%',
    top: '82%',
    width: '35%',
    height: '40%',
  },
  road: {
    position: 'absolute',
    height: ROAD_WIDTH,
    backgroundColor: colors.map.road,
  },
  borderLine: {
    position: 'absolute',
    height: BORDER_WIDTH,
    overflow: 'hidden',
  },
  borderDash: {
    height: 4,
    borderWidth: BORDER_WIDTH,
    borderStyle: 'dashed',
    borderColor: colors.map.border,
  },
  countryLabel: {
    position: 'absolute',
    width: LABEL_WIDTH,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    color: colors.map.city,
  },
  regionLabel: {
    position: 'absolute',
    width: LABEL_WIDTH,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    letterSpacing: 1.5,
    color: colors.map.region,
  },
  city: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -4,
    marginTop: -4,
  },
  cityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.map.city,
    backgroundColor: colors.surface,
  },
  cityLabel: {
    marginLeft: 3,
    fontSize: 14,
    fontWeight: '500',
    color: colors.map.city,
    textShadowColor: colors.surface,
    textShadowRadius: 4,
  },
  pin: {
    position: 'absolute',
    width: PIN_SIZE,
    height: PIN_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A square with one sharp corner, rotated 45° so the sharp corner points down.
  pinShape: {
    position: 'absolute',
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderTopLeftRadius: PIN_SIZE / 2,
    borderTopRightRadius: PIN_SIZE / 2,
    borderBottomLeftRadius: PIN_SIZE / 2,
    backgroundColor: colors.pin,
    borderWidth: 1.5,
    borderColor: colors.surface,
    transform: [{ rotate: '45deg' }],
    elevation: 3,
    shadowColor: '#0B1B3F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
  pinLabel: {
    elevation: 4,
  },
  pinText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.surface,
  },
  company: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  calloutBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: colors.surface,
    elevation: 3,
    shadowColor: '#0B1B3F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  calloutCount: {
    marginLeft: 5,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  calloutTail: {
    width: 0,
    height: 0,
    marginLeft: CALLOUT_TAIL_X - 6,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.surface,
  },
  companyName: {
    marginLeft: 6,
    marginTop: 5,
    maxWidth: 140,
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    textShadowColor: colors.surface,
    textShadowRadius: 4,
  },
});
