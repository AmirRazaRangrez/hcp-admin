import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../../src/api/client';
import { Screen, useLoad } from '../../src/lib/ui';
import { c, money } from '../../src/lib/theme';
import {
  HotelIcon,
  RestaurantIcon,
  BarIcon,
  ChequeIcon,
  CheckinIcon,
  CheckoutIcon,
  DiscountIcon,
  OccupancyIcon,
  AvailableRoomsIcon,
  OccupiedRoomsIcon
} from '../../src/lib/icons';

const day = () => new Date().toLocaleDateString('en-CA');

const Tile = ({ l, v, m, go, highlight, icon }: any) => {
  const content = (
    <View style={[styles.tileCard, highlight && styles.tileHighlight]}>
      <View style={styles.tileHeader}>
        <Text style={styles.tileLabel} numberOfLines={1}>{l}</Text>
        {icon ? (
          <View style={[styles.tileIconBox, highlight && { backgroundColor: '#FDF6E9' }]}>
            {icon}
          </View>
        ) : null}
      </View>
      <View style={styles.tileBottomRow}>
        <Text style={[styles.tileValue, highlight && styles.tileValueHighlight]} numberOfLines={1}>
          {v === undefined ? '—' : m ? money(v) : String(v)}
        </Text>
      </View>
    </View>
  );

  const wrapStyle = styles.tileWrap;

  if (go) {
    return (
      <Pressable
        onPress={go}
        style={({ pressed }) => [wrapStyle, pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 }]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={wrapStyle}>{content}</View>;
};

export default function Home() {
  const nav = useRouter();

  const { data, err, busy, at, reload } = useLoad(
    async () => {
      const s = await api.stats();
      const a = await api.analytics(day(), day()).catch(() => null);
      const ev = await api.activity('all').catch(() => null);
      return { s, a: a?.analytics?.stats ?? a?.stats, ev };
    },
    [],
    'home'
  );

  const isToday = (x: any) => x && new Date(String(x).replace(' ', 'T')).toLocaleDateString('en-CA') === day();
  const evs: any[] = (data as any)?.ev || [];
  const cin = data?.ev ? evs.filter(e => e.type === 'checkin' && isToday(e.created_at)).length : undefined;
  const cout = data?.ev ? evs.filter(e => e.type === 'checkout' && isToday(e.created_at)).length : undefined;
  const disc = data?.ev ? evs.filter(e => isToday(e.created_at)).reduce((t, e) => t + (Number(e.discount) || 0), 0) : undefined;

  const r = data?.s?.rooms;
  const v = data?.s?.revenue;
  const a = data?.a;
  const occ = r && r.total ? Math.round((r.occupied / r.total) * 100) + '%' : undefined;

  return (
    <Screen logo={require('../../assets/hcp-logo-with-name-transparent.png')} scrollable={false} busy={busy} reload={reload} at={at} err={err}>
      {/* Hero Revenue Card - Shows Only Today's Paid Hospitality Revenue (LIVE badge removed) */}
      <Pressable
        onPress={() => nav.push({ pathname: '/(tabs)/analytics', params: { dept: 'hospitality' } })}
        style={({ pressed }) => [styles.heroRevenue, pressed && { opacity: 0.94 }]}
      >
        <View style={styles.heroTop}>
          <Text style={styles.heroLabel}>TODAY'S REVENUE (HOSPITALITY)</Text>
        </View>
        <Text style={styles.heroAmount}>{v ? money(v?.hospitality ?? 0) : '—'}</Text>
        <Text style={styles.heroSub}>Room Hospitality &amp; Front Desk Settlements</Text>
      </Pressable>

      {/* Grid of Key Hotel Metrics - 5 compact rows fitting without scroll on mobile */}
      <View style={styles.metricsGrid}>
        {/* Row 1: Hospitality & F&B */}
        <Tile
          m
          l="Room Hospitality"
          v={v?.hospitality}
          icon={<HotelIcon size={14} color="#2563EB" />}
          go={() => nav.push({ pathname: '/(tabs)/analytics', params: { dept: 'hospitality' } })}
        />
        <Tile
          m
          l="Restaurant F&B"
          v={v?.restaurant}
          icon={<RestaurantIcon size={14} color="#E11D48" />}
          go={() => nav.push({ pathname: '/(tabs)/analytics', params: { dept: 'restaurant' } })}
        />

        {/* Row 2: Bar Lounge & Pending Cheques */}
        <Tile
          m
          l="Bar Lounge"
          v={v?.bar}
          icon={<BarIcon size={14} color="#7C3AED" />}
          go={() => nav.push({ pathname: '/(tabs)/analytics', params: { dept: 'bar' } })}
        />
        <Tile m l="Pending Cheques" v={a?.pendingChequesAmount} icon={<ChequeIcon size={14} color="#0284C7" />} />

        {/* Row 3: Check-ins & Check-outs Today */}
        <Tile l="Check-ins Today" v={cin} icon={<CheckinIcon size={14} color="#16A34A" />} />
        <Tile l="Check-outs Today" v={cout} icon={<CheckoutIcon size={14} color="#EA580C" />} />

        {/* Row 4: Discounts Today & Occupancy Rate */}
        <Tile m l="Discounts Today" v={disc} icon={<DiscountIcon size={14} color="#D97706" />} />
        <Tile l="Occupancy Rate" v={occ} icon={<OccupancyIcon size={14} color="#4F46E5" />} />

        {/* Row 5: Occupied Rooms (links to /occupied) & Available Rooms */}
        <Tile
          go={() => nav.push('/occupied')}
          l="Occupied Rooms"
          v={r?.occupied}
          highlight
          icon={<OccupiedRoomsIcon size={14} color="#B8893B" />}
        />
        <Tile l="Available Rooms" v={r?.ready} icon={<AvailableRoomsIcon size={14} color="#10B981" />} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroRevenue: {
    backgroundColor: '#0F2A2E',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#0F2A2E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  heroLabel: {
    color: '#8EAAA4',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6
  },
  heroAmount: {
    color: '#FFFFFF',
    fontSize: 29,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginVertical: 3
  },
  heroSub: {
    color: '#95ABA6',
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 1
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    paddingBottom: 4
  },
  tileWrap: {
    flexBasis: '48%',
    flexGrow: 1
  },
  tileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    minHeight: 63,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1.5
  },
  tileHighlight: {
    borderColor: '#C79A4B',
    backgroundColor: '#FFFDF9'
  },
  tileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  tileLabel: {
    color: '#374151',
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 4
  },
  tileIconBox: {
    width: 25,
    height: 25,
    borderRadius: 7,
    backgroundColor: '#F3F6F4',
    alignItems: 'center',
    justifyContent: 'center'
  },
  tileBottomRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 3
  },
  tileValue: {
    color: c.ink,
    fontSize: 18,
    fontWeight: '800'
  },
  tileValueHighlight: {
    color: '#92400E'
  }
});