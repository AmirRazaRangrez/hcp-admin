import React from 'react';
import { Text, Pressable, Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen, Card } from '../src/lib/ui';
import { useAuth } from '../src/store/auth';
import { c } from '../src/lib/theme';
import { TrashIcon, ReceiptIcon } from '../src/lib/icons';

export default function Settings() {
  const router = useRouter();
  const { user } = useAuth();

  const handleClearCache = async () => {
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter(x => x.startsWith('c:'));
      await AsyncStorage.multiRemove(keys);
      Alert.alert('Cache Cleared', 'Offline cached data has been successfully reset.');
    } catch {
      Alert.alert('Error', 'Could not clear cache.');
    }
  };

  return (
    <Screen title="Settings" back>
      <Card style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.userName}>
          {user?.full_name || user?.username || 'Hotel Admin'}
          {user?.role ? ` (${user.role})` : ''}
        </Text>
        <Text style={styles.statusText}>Connected to Hotel City Park Cloud Database</Text>
      </Card>

      <Pressable onPress={handleClearCache} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
        <Card style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TrashIcon size={18} color="#EF4444" />
            <Text style={styles.actionText}>Clear Saved Offline Data</Text>
          </View>
          <Text style={styles.actionSub}>Resets local cached pages so everything refetches fresh.</Text>
        </Card>
      </Pressable>

      <Pressable onPress={() => router.push('/bills')} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
        <Card style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ReceiptIcon size={18} color="#4F46E5" />
            <Text style={styles.actionText}>CRM Bills Directory</Text>
          </View>
          <Text style={styles.actionSub}>View room folios, restaurant settled bills, and bar receipts.</Text>
        </Card>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8EDEA'
  },
  label: {
    color: c.mute,
    fontSize: 12,
    fontWeight: '600'
  },
  userName: {
    fontWeight: '800',
    fontSize: 17,
    color: c.ink,
    marginTop: 4
  },
  statusText: {
    color: c.mute,
    fontSize: 12,
    marginTop: 6
  },
  actionText: {
    fontWeight: '800',
    fontSize: 15,
    color: c.ink
  },
  actionSub: {
    color: c.mute,
    fontSize: 12,
    marginTop: 3
  }
});