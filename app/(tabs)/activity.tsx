import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../../src/api/client';
import { Screen, Card, Badge, useLoad } from '../../src/lib/ui';
import { c, when } from '../../src/lib/theme';
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
  const t = (type || title || '').toLowerCase();
  if (t.includes('checkin') || t.includes('check-in')) return { Icon: BellIcon, color: '#10B981', label: 'CHECK-IN' };
  if (t.includes('checkout') || t.includes('check-out')) return { Icon: CheckoutIcon, color: '#64748B', label: 'CHECK-OUT' };
  if (t.includes('discount')) return { Icon: DiscountIcon, color: '#D97706', label: 'DISCOUNT' };
  if (t.includes('payment') || t.includes('paid')) return { Icon: PaymentIcon, color: '#0D9488', label: 'PAYMENT' };
  if (t.includes('food') || t.includes('restaurant') || t.includes('bar') || t.includes('fnb')) return { Icon: RestaurantIcon, color: '#E11D48', label: 'F&B ORDER' };
  return { Icon: ReceiptIcon, color: '#4F46E5', label: 'EVENT' };
};

function formatActivityBody(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.includes('{"')) {
    try {
      const match = trimmed.match(/^(\{.*\})(.*)$/s);
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
  const [filter, setFilter] = useState('all');
  const { data, err, busy, at, reload } = useLoad(() => api.activity(filter), [filter], 'activity:' + filter);
  const items = data || [];

  return (
    <Screen
      title="Live Activity"
      subtitle="Audit trail & hotel operational logs"
      busy={busy}
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

      {/* Empty State */}
      {items.length === 0 && !busy ? (
        <Card style={styles.emptyCard}>
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <EmptyInboxIcon size={44} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>No Activity Found</Text>
          <Text style={styles.emptySub}>No events recorded in the last 7 days for this filter.</Text>
        </Card>
      ) : null}

      {/* Activity Timeline Cards */}
      {items.map((a: any, i: number) => {
        const meta = getEventTheme(a.type, a.title);
        const EventIcon = meta.Icon;
        const isCheckin = a.type === 'checkin' || (a.tags && a.tags.includes('checkin'));
        const isApproval = a.type === 'discount' || (a.tags && a.tags.includes('approvals'));
        const isBill = Boolean(a.billId && a.dept);
        const isStayFolio = Boolean(a.tags && a.tags.includes('stay') && a.room);
        const clickable = Boolean(isCheckin || isApproval || isBill || isStayFolio);

        const handlePress = () => {
          if ((isCheckin || isStayFolio) && a.room) {
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
                <Text style={styles.eventBody}>{formatActivityBody(a.body)}</Text>
              ) : null}

              {clickable ? (
                <View style={styles.cardFooter}>
                  <Text style={styles.viewBillPrompt}>
                    {isCheckin || isStayFolio ? 'View room folio details ›' : isApproval ? 'View discount approval ›' : 'View settled bill details ›'}
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
