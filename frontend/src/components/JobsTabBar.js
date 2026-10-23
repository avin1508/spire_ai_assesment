import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, TOUCH_TARGET } from '../theme';

// Custom, horizontally scrollable tab bar for the nested Jobs navigator
// (rendered at the top). Receives the standard React Navigation `tabBar` props.
export default function JobsTabBar({ state, descriptors, navigation }) {
  const scrollRef = useRef(null);
  const tabLayouts = useRef({});
  const viewport = useRef({ x: 0, width: 0 });

  // Scroll only when the active tab is partly hidden, so the bar starts unscrolled.
  useEffect(() => {
    const tab = tabLayouts.current[state.index];
    const { x: scrollX, width } = viewport.current;
    if (!tab || !width) return;

    if (tab.x + tab.width > scrollX + width) {
      scrollRef.current?.scrollTo({ x: tab.x + tab.width - width + spacing.lg, animated: true });
    } else if (tab.x < scrollX) {
      scrollRef.current?.scrollTo({ x: Math.max(0, tab.x - spacing.lg), animated: true });
    }
  }, [state.index]);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(event) => {
          viewport.current.width = event.nativeEvent.layout.width;
        }}
        onScroll={(event) => {
          viewport.current.x = event.nativeEvent.contentOffset.x;
        }}
        scrollEventThrottle={32}
        contentContainerStyle={styles.content}
        accessibilityRole="tablist"
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel ?? options.title ?? route.name;
          const focused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLayout={(event) => {
                const { x, width } = event.nativeEvent.layout;
                tabLayouts.current[index] = { x, width };
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              style={styles.tab}
            >
              <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
                {label}
              </Text>
              <View style={[styles.indicator, focused && styles.indicatorActive]} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  content: {
    paddingHorizontal: spacing.xs,
  },
  tab: {
    minHeight: TOUCH_TARGET + spacing.sm,
    paddingHorizontal: spacing.md,
    justifyContent: 'flex-end',
  },
  label: {
    fontSize: 16,
    color: colors.textMuted,
    paddingBottom: spacing.md,
  },
  labelActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  indicator: {
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    backgroundColor: 'transparent',
  },
  indicatorActive: {
    backgroundColor: colors.primary,
  },
});
