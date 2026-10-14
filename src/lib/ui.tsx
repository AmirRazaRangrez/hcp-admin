import React, { useCallback, useEffect, useState, useRef } from 'react';
import { View, Text, Image, ScrollView, RefreshControl, Pressable, StyleSheet, Animated, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { c, when } from './theme';
import { useAuth } from '../store/auth';
import { DEMO_MODE } from '../config';
import { errMsg, NotConnected } from '../api/client';
import { ChevronLeftIcon } from './icons';

export function useLoad<T>(fn: () => Promise<T>, deps: any[] = [], key?: string, pollMs: number = 8000) {
  const [data, set] = useState<T | null>(null);
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState<string>();

  // 1. Instant Cache Load on Mount (0ms delay)
  useEffect(() => {
    if (!key) return;
    let active = true;
    AsyncStorage.getItem('c:' + key).then(j => {
      if (active && j) {
        try {
          const x = JSON.parse(j);
          if (x?.d !== undefined) {
            set(p => p === null ? x.d : p);
            if (x.t) setAt(p => p || x.t);
          }
        } catch {}
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [key]);

  // 2. Fetch fresh data in background & update cache
  const run = useCallback(async (silent = false) => {
    if (!silent) setBusy(true);
    try {
      const d = await fn();
      set(d);
      setErr(null);
      const t = new Date().toISOString();
      setAt(t);
      if (key) AsyncStorage.setItem('c:' + key, JSON.stringify({ d, t })).catch(() => {});
    } catch (e: any) {
      setErr(e);
      if (key) {
        try {
          const j = await AsyncStorage.getItem('c:' + key);
          if (j) {
            const x = JSON.parse(j);
            set(x.d);
            setAt(x.t);
          }
        } catch {}
      }
    } finally {
      if (!silent) setBusy(false);
    }
  }, deps);

  useEffect(() => { run(false); }, [run]);

  // 3. Automatic background poll (real-time reflection of CRM changes)
  useEffect(() => {
    if (pollMs <= 0) return;
    const tm = setInterval(() => run(true), pollMs);
    return () => clearInterval(tm);
  }, [run, pollMs]);

  return { data, err, busy, at, reload: () => run(false) };
}

// Ultra-Modern Dark Animated Back Button with spring click feedback
export function AnimatedBackButton({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.90,
      useNativeDriver: Platform.OS !== 'web',
      speed: 60,
      bounciness: 4
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: Platform.OS !== 'web',
      speed: 40,
      bounciness: 6
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={Platform.OS === 'web' ? ({ cursor: 'pointer', outline: 'none', userSelect: 'none' } as any) : undefined}
    >
      <Animated.View style={[s.backBtn, { transform: [{ scale }] }]}>
        <ChevronLeftIcon size={19} color="#FFFFFF" strokeWidth={2.8} />
      </Animated.View>
    </Pressable>
  );
}

export function Screen({ title, subtitle, logo, busy, reload, err, at, back, rightAction, children, scrollable = true }: any) {
  const router = useRouter();
  const isScroll = scrollable !== false;

  const handleBack = () => {
    if (typeof back === 'function') {
      back();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, ...(Platform.OS === 'web' && !isScroll ? { overflow: 'hidden' as any } : {}) }}>
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
          paddingTop: logo ? (Platform.OS === 'android' ? 12 : 8) : back ? 14 : (Platform.OS === 'android' ? 36 : (Platform.OS === 'ios' ? 44 : 16)),
          gap: logo ? 6 : 12,
          paddingBottom: isScroll ? 100 : 8,
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
  <Text style={{
    color,
    borderColor: color,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
    backgroundColor: color + '15'
  }}>
    {text}
  </Text>
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
    width: 140,
    height: 42
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
    backgroundColor: '#0F2A2E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1D3B40',
    shadowColor: '#0F2A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3
  },
  title: {
    color: '#0F2A2E',
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
  }
});