import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../src/api/client';
import { Screen, Card, Badge, useLoad, memCache } from '../src/lib/ui';
import { c, when, cleanRoomNumber } from '../src/lib/theme';
import { ClockIcon, CreditCardIcon } from '../src/lib/icons';

export default function Available() {
  const router = useRouter();
  const { data, err, busy, at, reload } = useLoad(() => api.available(), [], 'available');
  const rooms = data || [];

  const handleOpenRoom = (r: any) => {
    const ls = r.lastStay || {};
    const roomNum = cleanRoomNumber(r.room || r.room_number || r.id);
    const bookingId = String(ls.bookingId || '');

    // Prime cache for instantaneous transition
    try {
      memCache?.set('room:' + roomNum, {
        d: {
          isCheckout: true,
          id: roomNum,
          room: roomNum,
          roomNumber: roomNum,
          guest: ls.guestName || 'Previous Guest',
          mobile: ls.mobile || '',
          checkIn: ls.checkinTime || '',
          checkOut: ls.checkoutTime || '',
          total: Number(ls.totalPaid || ls.totalRoomCharge || 0),
          paid: Number(ls.totalPaid || 0),
          pending: 0,
          payments: ls.payments || [],
          paymentMode: ls.paymentMode || 'Cash',
          voucherNumber: ls.voucherNumber || '',
          checkedOutBy: ls.checkedOutBy || 'Staff'
        },
        t: new Date().toISOString()
      });
    } catch (_) {}

    router.push({
      pathname: '/room',
      params: {
        id: roomNum,
        room: roomNum,
        isCheckout: 'true',
        bookingId: bookingId,
        guest: String(ls.guestName || ''),
        total: String(ls.totalPaid || ls.totalRoomCharge || 0),
        phone: String(ls.mobile || '')
      }
    });
  };

  return (
    <Screen
      title="Available Rooms"
      back
      busy={busy}
      reload={reload}
      err={err}
    >
      {/* Top Available Summary Banner */}
      {rooms.length > 0 ? (
        <View style={styles.summaryBanner}>
          <View style={styles.summaryTopRow}>
            <View>
              <Text style={styles.summaryLabel}>TOTAL AVAILABLE ROOMS</Text>
              <Text style={styles.summaryValue}>{rooms.length} Rooms Ready</Text>
            </View>
            <View style={styles.summaryBadge}>
              <Text style={styles.summaryBadgeText}>VACANT / READY</Text>
            </View>
          </View>
          <View style={styles.summaryDivider} />
          <Text style={styles.summaryMetaText}>
            💡 Tap any available room to inspect its last guest checkout, bill & payment details.
          </Text>
        </View>
      ) : null}

      {rooms.length === 0 && !busy ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No Available Rooms</Text>
          <Text style={styles.emptySub}>All hotel rooms are currently occupied or under maintenance.</Text>
        </Card>
      ) : null}

      {/* Clean 2-Card Grid Layout with only room number */}
      <View style={styles.grid}>
        {rooms.map((r: any) => {
          const roomNum = cleanRoomNumber(r.room || r.room_number || r.id);
          return (
            <Pressable
              key={r.id || roomNum}
              onPress={() => handleOpenRoom(r)}
              style={({ pressed }) => [
                styles.roomCard,
                pressed && styles.roomCardPressed,
                Platform.OS === 'web' ? ({ cursor: 'pointer', userSelect: 'none' } as any) : undefined
              ]}
            >
              {/* Prominent Room Number Only */}
              <Text style={styles.roomNumber}>{roomNum}</Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryBanner: {
    backgroundColor: '#0F2A2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#0F2A2E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
    marginBottom: 2
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.5
  },
  summaryBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: '#10B981',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8
  },
  summaryBadgeText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '850',
    letterSpacing: 0.5
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 12
  },
  summaryMetaText: {
    fontSize: 12,
    color: '#CBD5E1',
    lineHeight: 17,
    fontWeight: '500'
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 4,
    paddingBottom: 24
  },
  roomCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E2E8E6',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 90,
    shadowColor: '#0F2A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2
  },
  roomCardPressed: {
    transform: [{ scale: 0.96 }],
    backgroundColor: '#F3F6F4',
    borderColor: '#0F2A2E'
  },
  roomNumber: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F2A2E',
    letterSpacing: -0.5,
    textAlign: 'center'
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
