import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../src/api/client';
import { Screen, Card, Badge, useLoad, memCache } from '../src/lib/ui';
import { c, when, cleanRoomNumber } from '../src/lib/theme';
import { ClockIcon } from '../src/lib/icons';

export default function Occupied() {
  const router = useRouter();
  const { data, err, busy, at, reload } = useLoad(() => api.occupied(), [], 'occupied');
  
  // Sort rooms by last checked-in (most recent checkin first)
  const rooms = (data || []).slice().sort((x: any, y: any) => {
    const tX = x.checkIn ? new Date(x.checkIn).getTime() : 0;
    const tY = y.checkIn ? new Date(y.checkIn).getTime() : 0;
    return tY - tX;
  });

  // Calculate Aggregate Pending Due Balance Across In-House Guests
  const totalPendingBalance = rooms.reduce((sum: number, r: any) => sum + (Number(r.pending) > 0 ? Number(r.pending) : 0), 0);
  const roomsWithPendingCount = rooms.filter((r: any) => Number(r.pending) > 0).length;
  const fullyPaidCount = rooms.length - roomsWithPendingCount;

  const getValidRoom = (s: any) => {
    const candidates = [s.room_number, s.room, s.raw?.room_number, s.raw?.room, s.id];
    for (const item of candidates) {
      if (item && item !== '-' && String(item).trim() !== '') {
        const cleaned = cleanRoomNumber(item);
        if (cleaned && cleaned !== '-') return cleaned;
      }
    }
    return cleanRoomNumber(s.room || s.room_number || s.id);
  };

  const handleOpenRoom = (s: any) => {
    const roomNum = getValidRoom(s);
    const roomId = String(roomNum || s.room || s.id);
    // Prime in-memory cache with isPartial flag so room.tsx displays instantaneously with 0ms delay while triggering a fresh live fetch
    try {
      memCache?.set('room:' + roomId, { d: { ...s, isPartial: true }, t: new Date(0).toISOString() });
    } catch (_) {}
    router.push({
      pathname: '/room',
      params: {
        id: roomId,
        room: String(roomNum),
        bookingId: String(s.booking_id || s.id || ''),
        guest: String(s.guest || ''),
        total: String(s.total || s.roomCharge || ''),
        paid: String(s.paid || ''),
        phone: String(s.mobile || '')
      }
    });
  };

  return (
    <Screen
      title="Occupied Rooms"
      back
      busy={busy}
      reload={reload}
      err={err}
    >
      {/* Aggregate Financial Summary Banner on Top */}
      {rooms.length > 0 ? (
        <View style={styles.summaryBanner}>
          <View style={styles.summaryTopRow}>
            <View>
              <Text style={styles.summaryLabel}>TOTAL PENDING BALANCE</Text>
              <Text style={styles.summaryValue}>₹{totalPendingBalance.toLocaleString('en-IN')}</Text>
            </View>
            <View style={[styles.summaryBadge, totalPendingBalance > 0 ? styles.summaryBadgePending : styles.summaryBadgePaid]}>
              <Text style={[styles.summaryBadgeText, totalPendingBalance > 0 ? styles.summaryBadgeTextPending : styles.summaryBadgeTextPaid]}>
                {roomsWithPendingCount > 0 ? `${roomsWithPendingCount} ROOM${roomsWithPendingCount > 1 ? 'S' : ''} DUE` : 'ALL PAID'}
              </Text>
            </View>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryBottomRow}>
            <Text style={styles.summaryMetaText}>
              🏨 {rooms.length} In-House Room{rooms.length > 1 ? 's' : ''}
            </Text>
            <Text style={styles.summaryMetaText}>
              ✓ {fullyPaidCount} Cleared · ⚠️ {roomsWithPendingCount} With Due Balance
            </Text>
          </View>
        </View>
      ) : null}

      {rooms.length === 0 && !busy ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No Occupied Rooms</Text>
          <Text style={styles.emptySub}>All hotel rooms are currently available or checked out.</Text>
        </Card>
      ) : null}

      {/* Clean 2-Card Grid Layout with only room number */}
      <View style={styles.grid}>
        {rooms.map((s: any) => {
          const roomNum = getValidRoom(s);
          return (
            <Pressable
              key={s.id || roomNum}
              onPress={() => handleOpenRoom(s)}
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
    fontSize: 26,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.5
  },
  summaryBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8
  },
  summaryBadgePending: {
    backgroundColor: 'rgba(234, 88, 12, 0.2)',
    borderWidth: 1,
    borderColor: '#EA580C'
  },
  summaryBadgePaid: {
    backgroundColor: 'rgba(22, 163, 74, 0.2)',
    borderWidth: 1,
    borderColor: '#16A34A'
  },
  summaryBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  summaryBadgeTextPending: {
    color: '#FB923C'
  },
  summaryBadgeTextPaid: {
    color: '#4ADE80'
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 12
  },
  summaryBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  summaryMetaText: {
    fontSize: 11.5,
    color: '#CBD5E1',
    fontWeight: '600'
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