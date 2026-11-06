import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { api } from '../../src/api/client';
import { Screen, Card, Badge, useLoad, memCache } from '../../src/lib/ui';
import { c, when, cleanRoomNumber } from '../../src/lib/theme';
import {
  BellIcon,
  CheckoutIcon,
  ReceiptIcon,
  PaymentIcon,
  DiscountIcon,
  RestaurantIcon,
  EmptyInboxIcon,
  ClockIcon
} from '../../src/lib/icons';

const FILTERS = [
  { id: 'all', label: 'All Activity' },
  { id: 'checkin', label: 'Check-ins', Icon: BellIcon },
  { id: 'checkout', label: 'Check-outs', Icon: CheckoutIcon },
  { id: 'bills', label: 'Bills', Icon: ReceiptIcon },
  { id: 'payments', label: 'Payments', Icon: PaymentIcon },
  { id: 'discounts', label: 'Discounts', Icon: DiscountIcon },
  { id: 'fnb', label: 'Food & Beverage', Icon: RestaurantIcon }
];

const getEventTheme = (type?: string, title?: string) => {
  const combined = `${type || ''} ${title || ''}`.toLowerCase();
  if (combined.includes('checkin') || combined.includes('check-in') || (combined.includes('stay') && !combined.includes('out'))) {
    return { Icon: BellIcon, color: '#10B981', label: 'CHECK-IN' };
  }
  if (combined.includes('checkout') || combined.includes('check-out')) {
    return { Icon: CheckoutIcon, color: '#475569', label: 'CHECK-OUT' };
  }
  if (combined.includes('discount')) return { Icon: DiscountIcon, color: '#D97706', label: 'DISCOUNT' };
  if (combined.includes('payment') || combined.includes('paid')) return { Icon: PaymentIcon, color: '#0D9488', label: 'PAYMENT' };
  if (combined.includes('food') || combined.includes('restaurant') || combined.includes('bar') || combined.includes('fnb')) {
    return { Icon: RestaurantIcon, color: '#E11D48', label: 'F&B ORDER' };
  }
  if (combined.includes('store')) return { Icon: ReceiptIcon, color: '#8B5CF6', label: 'STORE' };
  if (combined.includes('expense')) return { Icon: PaymentIcon, color: '#DC2626', label: 'EXPENSE' };
  return { Icon: ReceiptIcon, color: '#4F46E5', label: 'EVENT' };
};

function formatActivityBody(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();

  // 1. JSON Array of line items: [{"id":30,"name":"Tandoori Roti","price":25,"qty":1...}] · ₹26
  if (trimmed.startsWith('[') || trimmed.includes('["') || trimmed.includes('[{"')) {
    try {
      const match = trimmed.match(/^(\[.*?\])(.*)$/s);
      if (match) {
        const parsed = JSON.parse(match[1]);
        const tail = match[2] ? match[2].trim() : '';
        if (Array.isArray(parsed)) {
          const itemsStr = parsed.map((i: any) => {
            let itemName = i.name || i.item_name || 'Item';
            if (typeof itemName === 'string' && itemName.trim().startsWith('{')) {
              try {
                const inner = JSON.parse(itemName);
                itemName = inner.name || inner.item_name || 'Item';
              } catch {}
            }
            return `${itemName} × ${i.qty || i.quantity || 1}`;
          }).join(', ');
          return itemsStr + (tail ? ' ' + tail : '');
        }
      }
    } catch {}
  }

  // 2. JSON Object of stay / folio metadata: {"roomCharge":1829...}
  if (trimmed.startsWith('{') || trimmed.includes('{"')) {
    try {
      const match = trimmed.match(/^(\{.*?\})(.*)$/s);
      if (match) {
        const parsed = JSON.parse(match[1]);
        const tail = match[2] ? match[2].trim() : '';
        const guest = parsed.guestName || parsed.name || parsed.customer_name || '';
        const roomType = parsed.roomType || '';
        const paid = parsed.paid !== undefined ? ` · Paid: ₹${Number(parsed.paid).toLocaleString('en-IN')}` : '';
        const pending = parsed.pending !== undefined && Number(parsed.pending) > 0 ? ` (Due: ₹${Number(parsed.pending).toLocaleString('en-IN')})` : '';
        const mode = parsed.paymentMode ? ` · ${String(parsed.paymentMode).toUpperCase()}` : '';
        if (guest) {
          return `${guest}${roomType ? ' · ' + roomType : ''}${paid}${pending}${mode}${tail ? ' ' + tail : ''}`;
        }
        return (parsed.items || parsed.description || 'Folio details') + (tail ? ' ' + tail : '');
      }
    } catch {}
  }
  return raw;
}

export default function Activity() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ filter?: string; today?: string }>();
  const [filter, setFilter] = useState(searchParams.filter || 'all');
  const [todayOnly, setTodayOnly] = useState(searchParams.today === 'true' || searchParams.today === '1');

  useEffect(() => {
    if (searchParams.filter) {
      setFilter(searchParams.filter);
    }
    if (searchParams.today !== undefined) {
      setTodayOnly(searchParams.today === 'true' || searchParams.today === '1');
    }
  }, [searchParams.filter, searchParams.today]);

  const { data, err, busy, isRefreshing, at, reload } = useLoad(() => api.activity(filter), [filter], 'activity:' + filter);
  const rawItems = data || [];

  const items = todayOnly
    ? rawItems.filter((a: any) => {
        try {
          const d = new Date(a.created_at || 0);
          const now = new Date();
          return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        } catch (_) {
          return true;
        }
      })
    : rawItems;

  return (
    <Screen
      title="Live Activity"
      subtitle="Audit trail & hotel operational logs"
      busy={busy}
      isRefreshing={isRefreshing}
      reload={reload}
      at={at}
      err={err}
    >
      {/* Filter Selector Pills */}
      <View style={styles.filterBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScrollView}
          contentContainerStyle={styles.filterScroll}
        >
          {FILTERS.map(f => {
            const active = filter === f.id;
            const IconComp = f.Icon;
            return (
              <Pressable
                key={f.id}
                onPress={() => setFilter(f.id)}
                style={({ pressed }) => [
                  styles.pill,
                  active && styles.pillActive,
                  pressed && { opacity: 0.8 }
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {IconComp ? <IconComp size={14} color={active ? '#fff' : c.ink} /> : null}
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {f.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Date Filter Status Badge */}
      {todayOnly ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FEF3C7', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: '#FDE68A' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#B45309' }}>
            📅 Showing Today's {filter === 'checkin' ? 'Check-ins' : (filter === 'checkout' ? 'Check-outs' : 'Activity')} Only ({items.length})
          </Text>
          <Pressable onPress={() => setTodayOnly(false)}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#0284C7' }}>Show All History →</Text>
          </Pressable>
        </View>
      ) : null}

      {/* If today has 0 items but historical items exist, provide an instant 1-tap view button */}
      {todayOnly && items.length === 0 && rawItems.length > 0 && !busy ? (
        <View style={{ backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, marginBottom: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 4 }}>
            No {filter === 'checkout' ? 'check-outs' : 'records'} logged yet today.
          </Text>
          <Text style={{ fontSize: 11.5, color: '#64748B', marginBottom: 10, textAlign: 'center' }}>
            There are {rawItems.length} recent {filter === 'checkout' ? 'check-outs' : 'records'} from previous days.
          </Text>
          <Pressable
            onPress={() => setTodayOnly(false)}
            style={{ backgroundColor: '#0284C7', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12.5 }}>
              View Recent {filter === 'checkout' ? 'Check-outs' : 'Activity'} ({rawItems.length})
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Empty State */}
      {items.length === 0 && !busy ? (
        <Card style={styles.emptyCard}>
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <EmptyInboxIcon size={44} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>
            {todayOnly ? 'No Activity Recorded Today' : 'No Activity Found'}
          </Text>
          <Text style={styles.emptySub}>
            {todayOnly
              ? `No ${filter === 'checkin' ? 'check-ins' : (filter === 'checkout' ? 'check-outs' : 'events')} recorded today so far.`
              : 'No events recorded in the last 7 days for this filter.'}
          </Text>
          {todayOnly ? (
            <Pressable onPress={() => setTodayOnly(false)} style={{ marginTop: 10, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#F1F5F9', borderRadius: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F2A2E' }}>View Earlier 7-Day Activity</Text>
            </Pressable>
          ) : null}
        </Card>
      ) : null}

      {/* Activity Timeline Cards */}
      {items.map((a: any, i: number) => {
        const meta = getEventTheme(a.type, a.title);
        const EventIcon = meta.Icon;
        const isCheckin = a.type === 'checkin' || (a.tags && a.tags.includes('checkin'));
        const isCheckout = a.type === 'checkout' || (a.tags && a.tags.includes('checkout'));
        const isApproval = a.type === 'discount' || (a.tags && a.tags.includes('approvals'));
        const isBill = Boolean(a.billId && a.dept);
        const isStayFolio = Boolean(a.tags && a.tags.includes('stay') && a.room);
        const clickable = Boolean(isCheckin || isCheckout || isApproval || isBill || isStayFolio);

        const handlePress = () => {
          if (isCheckout) {
            const cleanR = cleanRoomNumber(a.room);
            const meta = a.meta || {};
            const payments = Array.isArray(meta.payments) ? meta.payments : [];
            const checkoutStayData = {
              isCheckout: true,
              id: String(meta.bookingId || a.billId || a.id),
              bookingId: meta.bookingId,
              room: a.room,
              roomNumber: a.room,
              rooms: meta.roomNumbers || (a.room ? String(a.room).split(',').map((s: string) => s.trim()) : []),
              guest: a.guest || meta.guestName || 'Valued Guest',
              guestName: a.guest || meta.guestName || 'Valued Guest',
              mobile: meta.mobile || '',
              adults: Number(meta.adults || 1),
              children: Number(meta.children || 0),
              mealPlan: meta.mealPlan || 'without_breakfast',
              roomCount: Number(meta.roomCount || 1),
              checkIn: meta.checkinTime || a.created_at,
              checkOut: meta.checkoutTime || a.created_at,
              checkoutTime: meta.checkoutTime || a.created_at,
              checkedInBy: meta.checkedInBy || 'Front Desk',
              checkedOutBy: meta.checkedOutBy || a.by || 'Staff',
              total: Number(a.total || meta.netSettle || 0),
              paid: Number(a.total || meta.netSettle || 0),
              pending: 0,
              payments: payments,
              source: meta.source || 'Front Desk'
            };

            if (cleanR && memCache?.set) {
              memCache.set('room:' + cleanR, { d: checkoutStayData, t: new Date().toISOString() });
            }
            if (a.room && memCache?.set) {
              memCache.set('room:' + String(a.room).trim(), { d: checkoutStayData, t: new Date().toISOString() });
            }

            router.push({
              pathname: '/room',
              params: {
                id: String(a.room || a.billId || a.id),
                isCheckout: 'true',
                room: String(a.room || ''),
                guest: String(a.guest || meta.guestName || ''),
                total: String(a.total || 0),
                bookingId: String(meta.bookingId || a.billId || ''),
                payments: payments.length > 0 ? JSON.stringify(payments) : ''
              }
            });
          } else if ((isCheckin || isStayFolio) && a.room) {
            router.push({ pathname: '/room', params: { id: String(a.room) } });
          } else if (isApproval) {
            router.push('/(tabs)/approvals');
          } else if (isBill) {
            router.push({ pathname: '/bill', params: { dept: a.dept, id: String(a.billId) } });
          }
        };

        return (
          <Pressable
            key={a.id || i}
            disabled={!clickable}
            onPress={handlePress}
            style={({ pressed }) => [
              styles.cardWrap,
              clickable && pressed && styles.cardPressed
            ]}
          >
            <View style={styles.eventCard}>
              <View style={styles.eventTop}>
                <View style={styles.eventLeft}>
                  <View style={[styles.iconWrap, { backgroundColor: meta.color + '15' }]}>
                    <EventIcon size={18} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventTitle}>{a.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <ClockIcon size={12} color={c.mute} />
                      <Text style={styles.eventTime}>{when(a.created_at)}</Text>
                    </View>
                  </View>
                </View>
                <Badge text={meta.label} color={meta.color} />
              </View>

              {a.body ? (
                (() => {
                  const formatted = formatActivityBody(a.body);
                  if (!formatted.includes('·') && !formatted.includes('•')) {
                    return <Text style={styles.eventBody}>{formatted}</Text>;
                  }
                  const parts = formatted.split(/[·•]/).map(p => p.trim()).filter(Boolean);
                  const primaryText = parts[0];
                  const badges = parts.slice(1);
                  return (
                    <View style={styles.eventBodyWrap}>
                      <Text style={styles.eventGuestName}>{primaryText}</Text>
                      {badges.length > 0 ? (
                        <View style={styles.eventMetaChipsRow}>
                          {badges.map((badge, idx) => (
                            <View key={idx} style={styles.metaChip}>
                              <Text style={styles.metaChipText}>{badge}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })()
              ) : null}

              {clickable ? (
                <View style={styles.cardFooter}>
                  <Text style={styles.viewBillPrompt}>
                    {isCheckout ? 'View check-out folio details ›' : (isCheckin || isStayFolio ? 'View room folio details ›' : isApproval ? 'View discount approval ›' : 'View settled bill details ›')}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterBarContainer: {
    flexGrow: 0,
    flexShrink: 0,
    height: 40,
    marginBottom: 4
  },
  filterScrollView: {
    flexGrow: 0,
    flexShrink: 0,
    height: 40
  },
  filterScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 16
  },
  pill: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8E6',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center'
  },
  pillActive: {
    backgroundColor: c.ink,
    borderColor: c.ink
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text
  },
  pillTextActive: {
    color: '#FFFFFF'
  },
  emptyCard: {
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#FFFFFF',
    marginTop: 8
  },
  emptyIcon: {
    fontSize: 34,
    marginBottom: 8
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
  },
  cardWrap: {
    marginBottom: 2
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9
  },
  eventCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E8EDEA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2
  },
  eventTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8
  },
  eventLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  icon: {
    fontSize: 18
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: c.ink
  },
  eventTime: {
    fontSize: 11,
    color: c.mute,
    marginTop: 2,
    fontWeight: '600'
  },
  eventBody: {
    fontSize: 13,
    color: c.text,
    lineHeight: 18,
    marginTop: 10,
    backgroundColor: '#F8FAF9',
    padding: 10,
    borderRadius: 10
  },
  cardFooter: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2'
  },
  viewBillPrompt: {
    fontSize: 12,
    color: c.brass,
    fontWeight: '700'
  }
});
