import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { AppState, AppStateStatus } from 'react-native';

const SUPABASE_URL = 'https://hlwmsllmqfdxfmqulrat.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhsd21zbGxtcWZkeGZtcXVscmF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3Mzc4MzgsImV4cCI6MjEwNTMxMzgzOH0.r7Nb8rEJTrZvprpf4G023nMY0suq2OqVGetG0I8esjk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

type Listener = (payload: { table: string; eventType: string; new: any; old: any }) => void;
const listeners = new Set<Listener>();

// Map table changes to related cache keys in the app
export const TABLE_CACHE_MAP: Record<string, string[]> = {
  active_occupancies: ['home', 'occupied', 'activity:all', 'activity:stay', 'activity:checkin'],
  room_charges_inbox: ['home', 'approvals', 'activity:all', 'activity:discounts', 'activity:approvals'],
  store_bills: ['home', 'store_bills_all', 'store_bills_live', 'store_bills_history', 'activity:all', 'activity:store'],
  store_vendor_payments: ['home', 'store_bills_all', 'store_bills_live', 'store_bills_history', 'activity:all', 'activity:payments', 'activity:store']
};

let realtimeChannel: RealtimeChannel | null = null;
let isSubscribed = false;

export function subscribeRealtimeUpdates(onUpdate: Listener): () => void {
  listeners.add(onUpdate);
  ensureChannel();
  return () => {
    listeners.delete(onUpdate);
  };
}

export function broadcastLocalUpdate(table: string, payload: any = {}) {
  listeners.forEach(fn => {
    try {
      fn({ table, eventType: 'LOCAL_SYNC', new: payload, old: null });
    } catch {}
  });
}

function ensureChannel() {
  if (realtimeChannel && isSubscribed) return;

  try {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
    }

    realtimeChannel = supabase
      .channel('hcp-admin-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_occupancies' },
        payload => dispatchEvent('active_occupancies', payload)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_charges_inbox' },
        payload => dispatchEvent('room_charges_inbox', payload)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_bills' },
        payload => dispatchEvent('store_bills', payload)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_vendor_payments' },
        payload => dispatchEvent('store_vendor_payments', payload)
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isSubscribed = true;
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          isSubscribed = false;
        }
      });
  } catch (err) {
    // Graceful fallback: app will continue working normally
  }
}

function dispatchEvent(table: string, payload: any) {
  const eventData = {
    table,
    eventType: payload.eventType || 'UPDATE',
    new: payload.new,
    old: payload.old
  };
  listeners.forEach(fn => {
    try {
      fn(eventData);
    } catch {}
  });
}

// Auto-reconnect & catch-up when mobile app wakes from background/lock screen
AppState.addEventListener('change', (state: AppStateStatus) => {
  if (state === 'active') {
    ensureChannel();
    // Dispatch a wake event to allow active screens to do a quick silent sync
    dispatchEvent('app_wake', {});
  }
});

// Initialize right away
ensureChannel();
