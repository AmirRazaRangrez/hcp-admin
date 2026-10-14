import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../src/api/client';
import { Screen, Card, Badge, useLoad } from '../src/lib/ui';
import { c } from '../src/lib/theme';

export default function Occupied() {
  const router = useRouter();
  const { data, err, busy, at, reload } = useLoad(() => api.occupied(), [], 'occupied');
  const rooms = data || [];

  return (
    <Screen
      title="Occupied Rooms"
      back
      busy={busy}
      reload={reload}
      err={err}
    >
      {rooms.length === 0 && !busy ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No Occupied Rooms</Text>
          <Text style={styles.emptySub}>All hotel rooms are currently available or checked out.</Text>
        </Card>
      ) : null}

      {/* Modern 2-Card Grid Layout (2 cards per row) with only room number */}
      <View style={styles.grid}>
        {rooms.map((s: any) => (
          <Pressable
            key={s.id}
            onPress={() => router.push({ pathname: '/room', params: { id: String(s.room || s.id), room: String(s.room || s.id), bookingId: String(s.id) } })}
            style={({ pressed }) => [
              styles.roomCard,
              pressed && styles.roomCardPressed,
              Platform.OS === 'web' ? ({ cursor: 'pointer', userSelect: 'none' } as any) : undefined
            ]}
          >
            {/* Prominent Room Number Only */}
            <Text style={styles.roomNumber}>{s.room}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    paddingTop: 4
  },
  roomCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 20,
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