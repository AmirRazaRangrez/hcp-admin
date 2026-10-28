import { AppState, AppStateStatus } from 'react-native';
import { SERVER_URL, fetchCloudTunnelUrl } from '../config';

const FIREBASE_REST_URL = 'https://firestore.googleapis.com/v1/projects/hotelcitypark-crm/databases/(default)/documents';
const FIREBASE_API_KEY = 'AIzaSyCtZnkdk1_q8rWrISnD8P2Rhi-jcPn1QTI';

type Listener = (payload: { table: string; eventType: string; new: any; old: any }) => void;
const listeners = new Set<Listener>();

// Map table changes to related cache keys in the app
export const TABLE_CACHE_MAP: Record<string, string[]> = {
  active_occupancies: ['home', 'occupied', 'room:', 'roomOrders:', 'activity:all', 'activity:stay', 'activity:checkin'],
  room_charges_inbox: ['home', 'approvals', 'occupied', 'room:', 'roomOrders:', 'activity:all', 'activity:discounts', 'activity:approvals'],
  store_bills: ['home', 'store_bills_all', 'store_bills_live', 'store_bills_history', 'activity:all', 'activity:store'],
  store_vendor_payments: ['home', 'store_bills_all', 'store_bills_live', 'store_bills_history', 'activity:all', 'activity:payments', 'activity:store']
};

export function subscribeRealtimeUpdates(onUpdate: Listener): () => void {
  listeners.add(onUpdate);
  startRealtime();
  return () => {
    listeners.delete(onUpdate);
    if (listeners.size === 0) {
      stopRealtime();
    }
  };
}

export function broadcastLocalUpdate(table: string, payload: any = {}) {
  listeners.forEach(fn => {
    try {
      fn({ table, eventType: 'LOCAL_SYNC', new: payload, old: null });
    } catch {}
  });
}

function dispatchEvent(table: string, payload: any = {}) {
  const eventData = {
    table,
    eventType: payload.eventType || 'UPDATE',
    new: payload.new || null,
    old: payload.old || null
  };
  listeners.forEach(fn => {
    try {
      fn(eventData);
    } catch {}
  });
}

// =========================================================================
// Real-time WebSocket Client (Zero Firebase Reads, Instant <10ms Updates)
// =========================================================================
let ws: WebSocket | null = null;
let wsConnected = false;
let pingInterval: any = null;
let reconnectTimer: any = null;
let passivePollTimer: any = null;
let lastVersion = 0;

function getWsUrl(): string {
  const base = SERVER_URL || 'http://localhost:3000';
  if (base.startsWith('https://')) {
    return base.replace(/^https:\/\//, 'wss://').replace(/\/+$/, '') + '/ws';
  } else {
    return base.replace(/^http:\/\//, 'ws://').replace(/\/+$/, '') + '/ws';
  }
}

function initWebSocket() {
  if (ws || AppState.currentState !== 'active') return;

  try {
    const url = getWsUrl();
    ws = new WebSocket(url);

    ws.onopen = () => {
      wsConnected = true;
      console.log('⚡ [Admin WebSocket] Connected to CRM Realtime Gateway:', url);
      clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'ping' })); } catch (_) {}
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'pong') return;

        const ev = msg.event;
        if (ev === 'ROOMS_UPDATED') {
          dispatchEvent('active_occupancies', { eventType: 'UPDATE' });
        } else if (ev === 'FOLIO_UPDATED') {
          dispatchEvent('active_occupancies', { eventType: 'UPDATE' });
          dispatchEvent('room_charges_inbox', { eventType: 'UPDATE' });
        } else if (ev === 'STORE_UPDATED') {
          dispatchEvent('store_bills', { eventType: 'UPDATE' });
          dispatchEvent('store_vendor_payments', { eventType: 'UPDATE' });
        } else if (ev === 'GUEST_ORDERS_UPDATED' || ev === 'TABLES_UPDATED' || ev === 'BAR_UPDATED' || ev === 'EXPENSES_UPDATED' || ev === 'NOTIFICATION' || ev === 'APPROVAL_REQUEST') {
          dispatchEvent('active_occupancies', { eventType: 'UPDATE' });
          dispatchEvent('room_charges_inbox', { eventType: 'UPDATE' });
        }
      } catch (_) {}
    };

    ws.onerror = () => {
      wsConnected = false;
    };

    ws.onclose = () => {
      wsConnected = false;
      cleanupWs();
      scheduleReconnect();
    };
  } catch (err) {
    wsConnected = false;
    scheduleReconnect();
  }
}

function cleanupWs() {
  clearInterval(pingInterval);
  pingInterval = null;
  if (ws) {
    try {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
    } catch (_) {}
    ws = null;
  }
}

function scheduleReconnect() {
  if (reconnectTimer || AppState.currentState !== 'active') return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    initWebSocket();
  }, 4000);
}

// Single-document Firestore passive check (only when WS is not connected, at most once every 45s)
// Uses a single document read instead of querying 4 collections with 30 docs each (stops 55K read spikes)
async function checkFirebasePassiveFallback() {
  if (wsConnected) return; // Zero reads while WebSocket is active!
  try {
    const res = await fetch(`${FIREBASE_REST_URL}/sync_meta/live_state?key=${FIREBASE_API_KEY}`).then(r => r.json()).catch(() => null);
    const ver = res?.fields?.version?.integerValue || res?.fields?.version?.doubleValue || 0;
    if (ver && Number(ver) !== lastVersion) {
      if (lastVersion > 0) {
        dispatchEvent('active_occupancies', { eventType: 'UPDATE' });
        dispatchEvent('room_charges_inbox', { eventType: 'UPDATE' });
        dispatchEvent('store_bills', { eventType: 'UPDATE' });
      }
      lastVersion = Number(ver);
    }
  } catch (_) {}
}

function startRealtime() {
  initWebSocket();
  if (!passivePollTimer) {
    passivePollTimer = setInterval(() => {
      if (AppState.currentState === 'active' && !wsConnected) {
        checkFirebasePassiveFallback().catch(() => {});
      }
    }, 45000);
  }
}

function stopRealtime() {
  cleanupWs();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (passivePollTimer) {
    clearInterval(passivePollTimer);
    passivePollTimer = null;
  }
}

// Auto-reconnect & catch-up when mobile app wakes from background/lock screen
AppState.addEventListener('change', (state: AppStateStatus) => {
  if (state === 'active') {
    fetchCloudTunnelUrl().then(() => {
      initWebSocket();
    }).catch(() => {
      initWebSocket();
    });
    checkFirebasePassiveFallback().catch(() => {});
    dispatchEvent('app_wake', {});
  } else {
    stopRealtime();
  }
});

// Initialize right away
startRealtime();
