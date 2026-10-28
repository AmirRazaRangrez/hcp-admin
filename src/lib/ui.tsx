import React, { useCallback, useEffect, useState, useRef } from 'react';
import { View, Text, Image, ScrollView, RefreshControl, Pressable, StyleSheet, Animated, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { c, when } from './theme';
import { useAuth } from '../store/auth';
import { DEMO_MODE } from '../config';
import { errMsg, NotConnected } from '../api/client';
import { ChevronLeftIcon } from './icons';
import { subscribeRealtimeUpdates, TABLE_CACHE_MAP } from '../api/realtime';

// Global high-speed in-memory L1 cache for instant 0ms tab switches and state restores
export const memCache = new Map<string, { d: any; t: string }>();

// Exported so app initialization can warm the cache immediately on startup
export async function hydrateMemCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cKeys = keys.filter(k => k.startsWith('c:'));
    if (cKeys.length > 0) {
      const items = await AsyncStorage.multiGet(cKeys);
      for (const [k, v] of items) {
        if (v) {
          try {
            const parsed = JSON.parse(v);
            if (parsed && parsed.d !== undefined) {
              memCache.set(k.substring(2), parsed);
            }
          } catch {}
        }
      }
    }
  } catch {}
}

// Trigger hydration right away at module load time
hydrateMemCache().catch(() => {});

export function clearCache(key: string) {
  try {
    memCache.delete(key);
    AsyncStorage.removeItem('c:' + key).catch(() => {});
  } catch (_) {}
}

export function useLoad<T>(fn: () => Promise<T>, deps: any[] = [], key?: string, pollMs: number = 0) {
  const initialCache = key ? memCache.get(key) : undefined;
  const [data, set] = useState<T | null>(initialCache ? initialCache.d : null);
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(!initialCache);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [at, setAt] = useState<string | undefined>(initialCache ? initialCache.t : undefined);

  // 1. Instant Cache Load on Mount (Sync from memory if available, or async from disk)
  useEffect(() => {
    if (!key) return;
    const currentMem = memCache.get(key);
    if (currentMem) {
      set(p => (p === null ? currentMem.d : p));
      if (currentMem.t) setAt(p => p || currentMem.t);
      setBusy(false);
      return;
    }

    let active = true;
    AsyncStorage.getItem('c:' + key).then(j => {
      if (active && j) {
        try {
          const x = JSON.parse(j);
          if (x?.d !== undefined) {
            memCache.set(key, x);
            set(p => (p === null ? x.d : p));
            if (x.t) setAt(p => p || x.t);
            setBusy(false);
          }
        } catch {}
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [key]);

  // 2. Fetch fresh data in background & update cache
  const run = useCallback(async (silent = false) => {
    const hasData = (key ? memCache.has(key) : false) || data !== null;
    if (!silent) {
      if (!hasData) {
        setBusy(true);
      } else {
        setIsRefreshing(true);
      }
    }

    try {
      const d = await fn();
      set(d);
      setErr(null);
      const t = new Date().toISOString();
      setAt(t);
      if (key) {
        memCache.set(key, { d, t });
        AsyncStorage.setItem('c:' + key, JSON.stringify({ d, t })).catch(() => {});
      }
    } catch (e: any) {
      setErr(e);
      if (key) {
        const mem = memCache.get(key);
        if (mem) {
          set(mem.d);
          setAt(mem.t);
        } else {
          try {
            const j = await AsyncStorage.getItem('c:' + key);
            if (j) {
              const x = JSON.parse(j);
              memCache.set(key, x);
              set(x.d);
              setAt(x.t);
            }
          } catch {}
        }
      }
    } finally {
      setBusy(false);
      if (!silent) {
        setIsRefreshing(false);
      }
    }
  }, deps);

  // 3. Mount effect: if cache is fresh (< 60s and not partial), do NOT re-fetch. If empty, stale, or partial, fetch silently.
  useEffect(() => {
    const cached = key ? memCache.get(key) : undefined;
    const isFresh = cached && cached.t && !cached.d?.isPartial && (Date.now() - new Date(cached.t).getTime() < 60000);
    if (!isFresh) {
      run(Boolean(cached));
    }
  }, [run]);

  // 4. Supabase Realtime WebSocket listener:
  // When a table changes in Supabase, if that table affects this screen's key,
  // silently update the data immediately!
  useEffect(() => {
    if (!key) return;
    let timer: any = null;
    const unsub = subscribeRealtimeUpdates((event) => {
      const relevantKeys = TABLE_CACHE_MAP[event.table];
      const affectsUs = !relevantKeys || relevantKeys.some(k => key.startsWith(k) || k.startsWith(key));
      if (affectsUs || event.table === 'app_wake') {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          run(true); // Silent real-time update: NO indicator popup, instant data freshness!
        }, 1200); // 1.2s debounce ensures bursts of table updates only trigger a single fetch
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [key, run]);

  // 5. Optional fallback poll: only if explicitly requested (pollMs > 0)
  useEffect(() => {
    if (pollMs <= 0) return;
    const tm = setInterval(() => run(true), pollMs);
    return () => clearInterval(tm);
  }, [run, pollMs]);

  return { data, err, busy, isRefreshing, at, reload: () => run(false) };
}

// Ultra-Modern Dark Animated Back Button with instant reliable click feedback
export function AnimatedBackButton({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  const handleClick = (e?: any) => {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (onPress) onPress();
  };

  return (
    <Pressable
      onPress={handleClick}
      {...(Platform.OS === 'web' ? { onClick: handleClick, role: 'button', tabIndex: 0 } : {})}
      onPressIn={() => {
        if (Platform.OS !== 'web') {
          Animated.spring(scale, { toValue: 0.90, useNativeDriver: true, speed: 60, bounciness: 4 }).start();
        }
      }}
      onPressOut={() => {
        if (Platform.OS !== 'web') {
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
        }
      }}
      hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
      style={Platform.OS === 'web' ? ({ cursor: 'pointer', outline: 'none', userSelect: 'none', touchAction: 'manipulation' } as any) : undefined}
    >
      <Animated.View style={[s.backBtn, Platform.OS !== 'web' ? { transform: [{ scale }] } : null]}>
        <ChevronLeftIcon size={19} color="#FFFFFF" strokeWidth={2.8} />
      </Animated.View>
    </Pressable>
  );
}

// Smooth Continuous Top Progress Indicator
function SyncProgressBar() {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true
        })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <View style={s.syncTrack}>
      <Animated.View
        style={[
          s.syncThumb,
          {
            transform: [
              {
                translateX: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-180, 420]
                })
              }
            ]
          }
        ]}
      />
    </View>
  );
}

export function Screen({ title, subtitle, logo, busy, isRefreshing, reload, err, at, back, rightAction, children, scrollable = true }: any) {
  const router = useRouter();
  const isScroll = scrollable !== false;

  const handleBack = () => {
    if (typeof back === 'function') {
      back();
      return;
    }
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined' && window.history && window.history.length > 1) {
          window.history.back();
          return;
        }
      } catch (_) {}
      try {
        if (router.canGoBack()) {
          router.back();
          return;
        }
      } catch (_) {}
      try {
        router.replace('/(tabs)');
      } catch (_) {
        router.push('/(tabs)');
      }
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, ...(Platform.OS === 'web' && !isScroll ? { overflow: 'hidden' as any } : {}) }}>
      {/* Dynamic Animated Top Sync Loading Bar & Status Pill */}
      {isRefreshing ? (
        <View style={s.topSyncBarContainer} pointerEvents="none">
          <SyncProgressBar />
          <View style={s.syncPillWrap}>
            <View style={s.syncPill}>
              <View style={s.syncPillDot} />
              <Text style={s.syncPillText}>Updating live data...</Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Sticky Header - Rendered only on child/detail pages with a back button */}
      {!logo && back && (
        <View style={s.head}>
          <View style={s.headContent}>
            <View style={s.headBackRow}>
              <AnimatedBackButton onPress={handleBack} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.title} numberOfLines={1}>{title}</Text>
                {subtitle ? <Text style={s.sub}>{subtitle}</Text> : null}
              </View>
              {rightAction ? <View>{rightAction}</View> : null}
            </View>
          </View>
        </View>
      )}

      {/* Body Container (Scrollable or Fixed) */}
      <ScrollView
        scrollEnabled={isScroll}
        bounces={isScroll}
        alwaysBounceVertical={isScroll}
        nestedScrollEnabled={isScroll}
        showsVerticalScrollIndicator={false}
        style={{
          flex: 1,
          ...(Platform.OS === 'web' ? {
            overflow: isScroll ? undefined : ('hidden' as any),
            overflowY: isScroll ? ('auto' as any) : ('hidden' as any),
            WebkitOverflowScrolling: isScroll ? ('touch' as any) : undefined
          } : {})
        }}
        contentContainerStyle={{
          paddingHorizontal: logo ? 10 : 16,
          paddingTop: logo ? (Platform.OS === 'android' ? 6 : 4) : back ? 14 : (Platform.OS === 'android' ? 36 : (Platform.OS === 'ios' ? 44 : 16)),
          gap: logo ? 4 : 12,
          paddingBottom: isScroll ? 140 : 8,
          flexGrow: isScroll ? 1 : 0,
          ...(Platform.OS === 'web' && !isScroll ? {
            overflow: 'hidden' as any,
            overflowY: 'hidden' as any
          } : {})
        }}
        refreshControl={isScroll ? <RefreshControl refreshing={!!busy} onRefresh={reload} tintColor={c.ink} /> : undefined}
      >
        {logo ? (
          <View style={s.scrollLogoWrap}>
            <Image source={logo} resizeMode="contain" style={s.scrollLogoImg} />
          </View>
        ) : null}
        {err && (
          <View style={[s.card, { borderColor: c.bad, backgroundColor: '#FFF5F5' }]}>
            <Text style={{ color: c.bad, fontWeight: '600' }}>
              {errMsg(err)}{at && !(err instanceof NotConnected) ? ' Showing saved offline data.' : ''}
            </Text>
            <Pressable onPress={reload} style={{ marginTop: 8 }}>
              <Text style={{ color: c.ink, fontWeight: '700' }}>Retry</Text>
            </Pressable>
          </View>
        )}
        {children}
      </ScrollView>
    </View>
  );
}

export const Card = ({ children, style, onPress }: any) => {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          s.card,
          { transform: [{ scale: pressed ? 0.98 : 1 }], opacity: pressed ? 0.92 : 1 },
          style
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
};

export const Badge = ({ text, color }: { text: string; color: string }) => (
  <View style={{
    alignSelf: 'flex-start',
    borderColor: color,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: color + '15',
    justifyContent: 'center',
    alignItems: 'center'
  }}>
    <Text style={{
      color,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.4
    }}>
      {text}
    </Text>
  </View>
);

export const Btn = ({ label, onPress, kind = 'ink', disabled }: any) => (
  <Pressable
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      {
        flex: 1,
        padding: 14,
        borderRadius: 12,
        alignItems: 'center',
        backgroundColor: kind === 'bad' ? c.bad : kind === 'ok' ? c.ok : c.ink,
        opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }]
      }
    ]}
  >
    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{label}</Text>
  </Pressable>
);

export const s = StyleSheet.create({
  head: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingTop: Platform.OS === 'android' ? 38 : (Platform.OS === 'ios' ? 48 : 14),
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F0',
    shadowColor: '#0F2A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    zIndex: 10,
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)'
    } : {})
  },
  scrollLogoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
    marginTop: 0,
    marginBottom: 0
  },
  scrollLogoImg: {
    width: 120,
    height: 34
  },
  headContent: {
    justifyContent: 'center'
  },
  headBackRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  headDefaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.line,
    shadowColor: '#0F2A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3
  },
  title: {
    color: c.ink,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3
  },
  sub: {
    color: c.mute,
    fontSize: 12,
    marginTop: 2
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2
  },
  topSyncBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999
  },
  syncTrack: {
    height: 3,
    backgroundColor: '#E2E8F0',
    width: '100%',
    overflow: 'hidden'
  },
  syncThumb: {
    height: 3,
    width: 140,
    backgroundColor: '#8c5d77',
    borderRadius: 1.5
  },
  syncPillWrap: {
    alignItems: 'center',
    marginTop: 6
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8E6',
    shadowColor: '#0F2A2E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2
  },
  syncPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8c5d77'
  },
  syncPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#8c5d77',
    letterSpacing: 0.2
  }
});