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
      {/* Store Bills Aging Alert Strips: Below Logo */}
      <View style={styles.storeStripsContainer}>
        {/* Red Strip: 25-40+ Days */}
        <Pressable
          onPress={() => nav.push({ pathname: '/(tabs)/store', params: { filterStatus: 'red' } })}
          style={({ pressed }) => [
            styles.storeStripCard,
            styles.storeStripRed,
            pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] }
          ]}
        >
          <View style={styles.storeStripLeft}>
            <View style={[styles.storeStripDot, { backgroundColor: '#dc2626' }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.storeStripTitleRed}>
                🔴 {redBillsCount} Overdue Bill{redBillsCount === 1 ? '' : 's'} (25-40+ Days)
              </Text>
              <Text style={styles.storeStripSubRed}>
                {redBillsDue > 0 ? `Pending Due: ${money(redBillsDue)}` : 'No bills in critical overdue'}
              </Text>
            </View>
          </View>
          <Text style={styles.storeStripArrowRed}>View ➔</Text>
        </Pressable>

        {/* Yellow Strip: 15-25 Days */}
        <Pressable
          onPress={() => nav.push({ pathname: '/(tabs)/store', params: { filterStatus: 'yellow' } })}
          style={({ pressed }) => [
            styles.storeStripCard,
            styles.storeStripYellow,
            pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] }
          ]}
        >
          <View style={styles.storeStripLeft}>
            <View style={[styles.storeStripDot, { backgroundColor: '#d97706' }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.storeStripTitleYellow}>
                🟡 {yellowBillsCount} Pending Bill{yellowBillsCount === 1 ? '' : 's'} (15-25 Days)
              </Text>
              <Text style={styles.storeStripSubYellow}>
                {yellowBillsDue > 0 ? `Pending Due: ${money(yellowBillsDue)}` : 'No bills in warning range'}
              </Text>
            </View>
          </View>
          <Text style={styles.storeStripArrowYellow}>View ➔</Text>
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
          <Text style={styles.heroSub}>Room Hospitality &amp; Front Desk Settlements</Text>
          {todayExpenses > 0 ? (
            <Text style={styles.heroNetText}>Net: {money(netInflow)}</Text>
          ) : null}
        </View>
      </Pressable>

      {/* Grid of Key Hotel Metrics */}
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
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    shadowColor: '#0F2A2E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  heroLabel: {
    color: '#95ABA6',
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.6
  },
  expenseTag: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  expenseTagText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '800'
  },
  heroAmount: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginVertical: 4
  },
  heroBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2
  },
  heroSub: {
    color: '#95ABA6',
    fontSize: 12.5,
    fontWeight: '500',
    flex: 1
  },
  heroNetText: {
    color: '#6EE7B7',
    fontSize: 12.5,
    fontWeight: '800'
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
    paddingBottom: 16
  },
  tileWrap: {
    flexBasis: '47%',
    flexGrow: 1
  },
  tileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    minHeight: 84,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2
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
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '700',
    flex: 1,
    marginRight: 6
  },
  tileIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#F3F6F4',
    alignItems: 'center',
    justifyContent: 'center'
  },
  tileBottomRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 6
  },
  tileValue: {
    color: c.ink,
    fontSize: 22,
    fontWeight: '800'
  },
  tileValueHighlight: {
    color: '#92400E'
  },
  storeStripsContainer: {
    gap: 8,
    marginBottom: 12,
    marginTop: 4,
  },
  storeStripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  storeStripRed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  storeStripYellow: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
  },
  storeStripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  storeStripDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  storeStripTitleRed: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#991B1B',
  },
  storeStripSubRed: {
    fontSize: 11.5,
    color: '#B91C1C',
    fontWeight: '600',
    marginTop: 1,
  },
  storeStripArrowRed: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#DC2626',
    marginLeft: 8,
  },
  storeStripTitleYellow: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#92400E',
  },
  storeStripSubYellow: {
    fontSize: 11.5,
    color: '#B45309',
    fontWeight: '600',
    marginTop: 1,
  },
  storeStripArrowYellow: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#D97706',
    marginLeft: 8,
  },
});