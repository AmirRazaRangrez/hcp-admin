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
  OccupiedRoomsIcon,
  BuildingIcon,
  ExpenseIcon
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
      const [s, a, ev, exp, occ, bills, store] = await Promise.all([
        api.stats().catch(() => null),
        api.analytics(day(), day()).catch(() => null),
        api.activity('all').catch(() => null),
        api.expenses().catch(() => []),
        api.occupied().catch(() => []),
        api.bills({ q: 'BTC' }).catch(() => []),
        api.storeBills('all').catch(() => ({ bills: [] }))
      ]);
      return { s, a: a?.analytics?.stats ?? a?.stats, ev, exp, occ, bills, store };
    },
    [],
    'home'
  );

  const isToday = (x: any) => x && new Date(String(x).replace(' ', 'T')).toLocaleDateString('en-CA') === day();
  const evs: any[] = (data as any)?.ev || [];
  const cin = data?.ev ? evs.filter(e => e.type === 'checkin' && isToday(e.created_at)).length : undefined;
  const cout = data?.ev ? evs.filter(e => e.type === 'checkout' && isToday(e.created_at)).length : undefined;
  const disc = data?.ev ? evs.filter(e => isToday(e.created_at)).reduce((t, e) => t + (Number(e.discount) || 0), 0) : undefined;

  const rawExpenses: any[] = Array.isArray((data as any)?.exp) ? (data as any).exp : ((data as any)?.exp?.expenses || []);
  const todayExpenses = rawExpenses
    .filter(e => isToday(e.created_at))
    .reduce((sum, e) => sum + (Number(e.actual_used_amount || e.amount) || 0), 0);

  // Compute BTC pending receivables
  const occList: any[] = (data as any)?.occ || [];
  const bList: any[] = (data as any)?.bills || [];
  let btcPendingTotal = 0;
  occList.forEach((r: any) => {
    const src = String(r.source || r.booking_source || '').toUpperCase();
    if (src.includes('BTC') || src.includes('COMPANY') || Boolean(r.btc_company_name)) {
      const tot = Number(r.total || r.roomCharge || 0);
      const pd = Number(r.paid || 0);
      btcPendingTotal += Math.max(0, tot - pd);
    }
  });
  bList.forEach((b: any) => {
    const src = String(b.booking_source || b.source || b.customer_name || '').toUpperCase();
    const mode = String(b.payment_mode || '').toUpperCase();
    const isSettled = b.is_paid === 1 || String(b.payment_status).toLowerCase() === 'settled';
    if (!isSettled && (src.includes('BTC') || src.includes('COMPANY') || mode.includes('BTC'))) {
      btcPendingTotal += Number(b.total || 0);
    }
  });

  // Compute Store Bills Red & Yellow Aging Counts
  const storeBillsList: any[] = (data as any)?.store?.bills || [];
  let redBillsCount = 0;
  let redBillsDue = 0;
  let yellowBillsCount = 0;
  let yellowBillsDue = 0;

  const now = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  storeBillsList.forEach((b: any) => {
    const pending = Number(b.pending_amount) || 0;
    const isFullPaid = pending <= 0 || b.status === 'FULL' || b.status === 'PAID';
    if (!isFullPaid && pending > 0) {
      const rawDate = b.bill_date || b.created_at;
      let diffDays = 0;
      if (rawDate) {
        try {
          const parts = String(rawDate).split('T')[0].split('-');
          const billDate = parts.length === 3
            ? new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
            : new Date(rawDate);
          const d1 = new Date(billDate.getFullYear(), billDate.getMonth(), billDate.getDate());
          diffDays = Math.max(0, Math.floor((todayDate.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
        } catch (_) {
          diffDays = 0;
        }
      }

      if (diffDays >= 25) {
        redBillsCount++;
        redBillsDue += pending;
      } else if (diffDays >= 15) {
        yellowBillsCount++;
        yellowBillsDue += pending;
      }
    }
  });

  const r = data?.s?.rooms;
  const v = data?.s?.revenue;
  const a = data?.a;
  const occ = r && r.total ? Math.round((r.occupied / r.total) * 100) + '%' : undefined;

  const hospRevenue = Number(v?.hospitality ?? 0);
  const netInflow = Math.max(0, hospRevenue - todayExpenses);

  return (
    <Screen logo={require('../../assets/hcp-logo-with-name-transparent.png')} scrollable={true} busy={busy} reload={reload} at={at} err={err}>
      {/* Compact Store Bills Aging Dual Strip: Key:Value within height of one strip */}
      <View style={styles.storeCompactDualStrip}>
        {/* Yellow Strip: 15-25 Days */}
        <Pressable
          onPress={() => nav.push({ pathname: '/(tabs)/store', params: { filterStatus: 'yellow' } })}
          style={({ pressed }) => [
            styles.storeChip,
            styles.storeChipYellow,
            pressed && { opacity: 0.82, transform: [{ scale: 0.98 }] }
          ]}
        >
          <View style={[styles.storeChipDot, { backgroundColor: '#D97706' }]} />
          <Text style={styles.storeChipTextYellow} numberOfLines={1}>
            15-25 days : <Text style={styles.storeChipValueYellow}>{yellowBillsCount} bills</Text>
          </Text>
        </Pressable>

        {/* Red Strip: 25-40 Days */}
        <Pressable
          onPress={() => nav.push({ pathname: '/(tabs)/store', params: { filterStatus: 'red' } })}
          style={({ pressed }) => [
            styles.storeChip,
            styles.storeChipRed,
            pressed && { opacity: 0.82, transform: [{ scale: 0.98 }] }
          ]}
        >
          <View style={[styles.storeChipDot, { backgroundColor: '#DC2626' }]} />
          <Text style={styles.storeChipTextRed} numberOfLines={1}>
            25-40 days : <Text style={styles.storeChipValueRed}>{redBillsCount} bills</Text>
          </Text>
        </Pressable>
      </View>

      {/* Hero Revenue Card - Shows Today's Paid Hospitality Revenue with Net Inflow */}
      <Pressable
        onPress={() => nav.push({ pathname: '/(tabs)/analytics', params: { dept: 'hospitality' } })}
        style={({ pressed }) => [styles.heroRevenue, pressed && { opacity: 0.94 }]}
      >
        <View style={styles.heroTop}>
          <Text style={styles.heroLabel}>TODAY'S REVENUE (HOSPITALITY)</Text>
          {todayExpenses > 0 ? (
            <View style={styles.expenseTag}>
              <Text style={styles.expenseTagText}>- {money(todayExpenses)} Exp.</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.heroAmount}>{v ? money(hospRevenue) : '—'}</Text>
        <View style={styles.heroBottomRow}>
          <Text style={styles.heroSub}>Room Hospitality &amp; Front Desk</Text>
          {todayExpenses > 0 ? (
            <Text style={styles.heroNetText}>Net: {money(netInflow)}</Text>
          ) : null}
        </View>
      </Pressable>

      {/* F&B Live Tables & Orders Quick Bar (Restaurant & Bar) */}
      <Pressable
        onPress={() => nav.push('/fb')}
        style={({ pressed }) => [styles.fbQuickBar, pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] }]}
      >
        <View style={styles.fbQuickLeft}>
          <View style={styles.fbIconCircle}>
            <RestaurantIcon size={13} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fbQuickTitle} numberOfLines={1}>🍽️ F&amp;B Operations (Restaurant &amp; Bar)</Text>
            <Text style={styles.fbQuickSub} numberOfLines={1}>Live Tables · Running KOTs · Settled Bills</Text>
          </View>
        </View>
        <View style={styles.fbQuickBadge}>
          <Text style={styles.fbQuickBadgeText}>Live ➔</Text>
        </View>
      </Pressable>

      {/* Grid of Key Hotel Metrics */}
      <View style={styles.metricsGrid}>
        {/* Row 1: Hospitality & F&B */}
        <Tile
          m
          l="Room Hospitality"
          v={v?.hospitality}
          icon={<HotelIcon size={13} color="#2563EB" />}
          go={() => nav.push({ pathname: '/(tabs)/analytics', params: { dept: 'hospitality' } })}
        />
        <Tile
          m
          l="Restaurant F&B"
          v={v?.restaurant}
          icon={<RestaurantIcon size={13} color="#E11D48" />}
          go={() => nav.push({ pathname: '/fb', params: { dept: 'restaurant' } })}
        />

        {/* Row 2: Bar Lounge & Pending Cheques */}
        <Tile
          m
          l="Bar Lounge"
          v={v?.bar}
          icon={<BarIcon size={13} color="#7C3AED" />}
          go={() => nav.push({ pathname: '/fb', params: { dept: 'bar' } })}
        />

        <Tile m l="Pending Cheques" v={a?.pendingChequesAmount} icon={<ChequeIcon size={14} color="#0284C7" />} />

        {/* Row 3: Corporate BTC (Right after Pending Cheques) & Hotel Expenses */}
        <Tile
          m
          l="Corporate BTC"
          v={btcPendingTotal}
          icon={<BuildingIcon size={14} color="#4F46E5" />}
          go={() => nav.push('/btc')}
        />
        <Tile
          m
          l="Hotel Expenses"
          v={todayExpenses}
          icon={<ExpenseIcon size={14} color="#DC2626" />}
          go={() => nav.push('/expenses')}
        />

        {/* Row 4: Check-ins & Check-outs Today */}
        <Tile l="Check-ins Today" v={cin} icon={<CheckinIcon size={14} color="#16A34A" />} />
        <Tile l="Check-outs Today" v={cout} icon={<CheckoutIcon size={14} color="#EA580C" />} />

        {/* Row 5: Discounts Today & Occupancy Rate */}
        <Tile m l="Discounts Today" v={disc} icon={<DiscountIcon size={14} color="#D97706" />} />
        <Tile l="Occupancy Rate" v={occ} icon={<OccupancyIcon size={14} color="#4F46E5" />} />

        {/* Row 6: Occupied Rooms (links to /occupied) & Available Rooms */}
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
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 12,
    shadowColor: '#0F2A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 5,
    elevation: 2.5
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  heroLabel: {
    color: '#95ABA6',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4
  },
  expenseTag: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4
  },
  expenseTagText: {
    color: '#DC2626',
    fontSize: 9.5,
    fontWeight: '800'
  },
  heroAmount: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginVertical: 1
  },
  heroBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 0.5
  },
  heroSub: {
    color: '#95ABA6',
    fontSize: 10,
    fontWeight: '500',
    flex: 1
  },
  heroNetText: {
    color: '#6EE7B7',
    fontSize: 10.5,
    fontWeight: '800'
  },
  fbQuickBar: {
    backgroundColor: '#0D2429',
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderWidth: 1.2,
    borderColor: '#1D3B40',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 2
  },
  fbQuickLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1
  },
  fbIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E11D48',
    alignItems: 'center',
    justifyContent: 'center'
  },
  fbQuickTitle: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '800'
  },
  fbQuickSub: {
    color: '#94A3B8',
    fontSize: 9.5,
    fontWeight: '500',
    marginTop: 0.5
  },
  fbQuickBadge: {
    backgroundColor: '#E2B25E',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  fbQuickBadgeText: {
    color: '#0A191C',
    fontSize: 9.5,
    fontWeight: '800'
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 2,
    paddingBottom: 4
  },
  tileWrap: {
    flexBasis: '48%',
    flexGrow: 1
  },
  tileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 4.5,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    minHeight: 46,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2.5,
    elevation: 1
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
    fontSize: 10.5,
    lineHeight: 13.5,
    fontWeight: '700',
    flex: 1,
    marginRight: 4
  },
  tileIconBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: '#F3F6F4',
    alignItems: 'center',
    justifyContent: 'center'
  },
  tileBottomRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 1.5
  },
  tileValue: {
    color: c.ink,
    fontSize: 15.5,
    fontWeight: '800'
  },
  tileValueHighlight: {
    color: '#92400E'
  },
  storeCompactDualStrip: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 1,
    marginBottom: 2
  },
  storeChip: {
    flex: 1,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1.2
  },
  storeChipRed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5'
  },
  storeChipYellow: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D'
  },
  storeChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4.5
  },
  storeChipTextRed: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#991B1B'
  },
  storeChipValueRed: {
    fontWeight: '900',
    color: '#DC2626'
  },
  storeChipTextYellow: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#92400E'
  },
  storeChipValueYellow: {
    fontWeight: '900',
    color: '#B45309'
  }
});