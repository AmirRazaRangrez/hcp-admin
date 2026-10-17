import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../src/api/client';
import { Screen, Card, Badge, useLoad } from '../src/lib/ui';
import { c, money } from '../src/lib/theme';
import { HotelIcon, CheckIcon, ClockIcon } from '../src/lib/icons';

export default function BtcScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'pending' | 'paid'>('pending');

  const { data, err, busy, reload } = useLoad(async () => {
    try {
      // 1. Fetch bills / bookings
      const bills = await api.bills({ q: 'BTC' }).catch(() => []);
      // 2. Fetch occupied rooms
      const occupied = await api.occupied().catch(() => []);
      
      const btcList: any[] = [];
      const seen = new Set<string>();

      // Check occupied rooms for BTC
      occupied.forEach((r: any) => {
        const src = String(r.source || r.booking_source || '').toUpperCase();
        const isBtc = src.includes('BTC') || src.includes('COMPANY') || Boolean(r.btc_company_name) || Boolean(r.raw?.btc_company_name);
        if (isBtc) {
          const idStr = String(r.id || r.room);
          seen.add(idStr);
          btcList.push({
            id: idStr,
            booking_id: r.id,
            room: String(r.room || r.room_number || '-'),
            guest: r.guest || r.guest_name || 'Corporate Guest',
            company: r.btc_company_name || r.raw?.btc_company_name || r.company_name || 'Corporate Client',
            approvalRef: r.btc_approval_ref || r.raw?.btc_approval_ref || r.voucherNumber || '-',
            total: Number(r.total || r.roomCharge || 0),
            paid: Number(r.paid || 0),
            balance: Math.max(0, Number(r.total || r.roomCharge || 0) - Number(r.paid || 0)),
            isPaid: false,
            status: 'pending_from_company',
            checkIn: r.checkIn,
            date: r.checkIn ? String(r.checkIn).slice(0, 10) : ''
          });
        }
      });

      // Check settled bills for BTC
      if (Array.isArray(bills)) {
        bills.forEach((b: any) => {
          const src = String(b.booking_source || b.source || b.customer_name || '').toUpperCase();
          const mode = String(b.payment_mode || '').toUpperCase();
          const isBtc = src.includes('BTC') || src.includes('COMPANY') || mode.includes('BTC') || Boolean(b.btc_company_name);
          const idStr = String(b.id || b.order_number);
          if (isBtc && !seen.has(idStr)) {
            seen.add(idStr);
            const isSettled = b.is_paid === 1 || String(b.payment_status).toLowerCase() === 'settled';
            btcList.push({
              id: idStr,
              booking_id: b.id,
              room: String(b.room_number || '-'),
              guest: b.customer_name || 'Corporate Guest',
              company: b.btc_company_name || b.company_name || 'Corporate Client',
              approvalRef: b.btc_approval_ref || b.order_number || '-',
              total: Number(b.total || 0),
              paid: Number(b.total || 0),
              balance: isSettled ? 0 : Number(b.total || 0),
              isPaid: isSettled,
              status: isSettled ? 'settled' : 'pending_from_company',
              date: b.created_at ? String(b.created_at).slice(0, 10) : ''
            });
          }
        });
      }

      return btcList;
    } catch {
      return [];
    }
  }, [], 'btc-list');

  const allItems: any[] = data || [];

  const pendingItems = useMemo(() => allItems.filter(x => !x.isPaid), [allItems]);
  const paidItems = useMemo(() => allItems.filter(x => x.isPaid), [allItems]);

  const currentItems = activeTab === 'pending' ? pendingItems : paidItems;
  const pendingTotal = pendingItems.reduce((acc, curr) => acc + (curr.balance || curr.total || 0), 0);
  const paidTotal = paidItems.reduce((acc, curr) => acc + (curr.paid || curr.total || 0), 0);

  return (
    <Screen
      title="Corporate BTC Ledger"
      subtitle="Bill To Company Receivables"
      back
      busy={busy}
      reload={reload}
      err={err}
    >
      {/* Top 2 Tab Selector: BTC Pending vs BTC Paid */}
      <View style={styles.tabContainer}>
        <Pressable
          onPress={() => setActiveTab('pending')}
          style={[styles.tabButton, activeTab === 'pending' && styles.tabButtonActivePending]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ClockIcon size={16} color={activeTab === 'pending' ? '#B45309' : '#64748B'} />
            <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActivePending]}>
              BTC Pending ({pendingItems.length})
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('paid')}
          style={[styles.tabButton, activeTab === 'paid' && styles.tabButtonActivePaid]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <CheckIcon size={16} color={activeTab === 'paid' ? '#15803D' : '#64748B'} />
            <Text style={[styles.tabText, activeTab === 'paid' && styles.tabTextActivePaid]}>
              BTC Paid ({paidItems.length})
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Summary Banner */}
      <View style={[styles.summaryCard, activeTab === 'pending' ? styles.summaryPending : styles.summaryPaid]}>
        <Text style={styles.summaryLabel}>
          {activeTab === 'pending' ? 'TOTAL PENDING FROM CORPORATES' : 'TOTAL SETTLED CORPORATE REVENUE'}
        </Text>
        <Text style={styles.summaryAmount}>
          {money(activeTab === 'pending' ? pendingTotal : paidTotal)}
        </Text>
        <Text style={styles.summarySub}>
          {activeTab === 'pending'
            ? `${pendingItems.length} active booking(s) awaiting corporate clearance`
            : `${paidItems.length} corporate booking(s) successfully cleared`}
        </Text>
      </View>

      {/* Item List */}
      {currentItems.length === 0 && !busy ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            {activeTab === 'pending' ? 'No Pending BTC Invoices' : 'No Paid BTC Invoices'}
          </Text>
          <Text style={styles.emptySub}>
            {activeTab === 'pending'
              ? 'All corporate company stays are fully settled.'
              : 'Settled corporate payments will appear here.'}
          </Text>
        </Card>
      ) : (
        <View style={{ gap: 10, marginTop: 4 }}>
          {currentItems.map((item, idx) => (
            <Pressable
              key={item.id || idx}
              onPress={() => router.push({ pathname: '/room', params: { id: item.room, room: item.room, bookingId: item.booking_id } })}
              style={({ pressed }) => [
                styles.itemCard,
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined
              ]}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Text style={styles.companyName}>🏢 {item.company}</Text>
                  </View>
                  <Text style={styles.guestName}>Guest: {item.guest}</Text>
                  <Text style={styles.metaText}>
                    Room {item.room} {item.approvalRef && item.approvalRef !== '-' ? `• Ref: #${item.approvalRef}` : ''}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.amountText}>{money(item.total)}</Text>
                  <Badge
                    text={item.isPaid ? 'BTC SETTLED' : 'PENDING'}
                    color={item.isPaid ? '#15803D' : '#B45309'}
                  />
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 12
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10
  },
  tabButtonActivePending: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2
  },
  tabButtonActivePaid: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B'
  },
  tabTextActivePending: {
    color: '#B45309',
    fontWeight: '800'
  },
  tabTextActivePaid: {
    color: '#15803D',
    fontWeight: '800'
  },
  summaryCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    alignItems: 'center'
  },
  summaryPending: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#FCD34D'
  },
  summaryPaid: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1.5,
    borderColor: '#86EFAC'
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  summaryAmount: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A',
    marginVertical: 4
  },
  summarySub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569'
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1
  },
  companyName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#4C1D95'
  },
  guestName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 2
  },
  metaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2
  },
  amountText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4
  },
  emptyCard: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF'
  },
  emptyTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: c.ink,
    marginBottom: 4
  },
  emptySub: {
    color: c.mute,
    fontSize: 13,
    textAlign: 'center'
  }
});
