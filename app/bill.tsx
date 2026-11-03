import React from 'react';
import { View, Text, Pressable, Platform, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, billCache } from '../src/api/client';
import { Screen, Card, Badge, useLoad } from '../src/lib/ui';
import { c, money, when } from '../src/lib/theme';

export const parseLineItems = (raw: any): any[] => {
  if (!raw) return [];
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        return parseLineItems(JSON.parse(s));
      } catch {
        return [{ name: s, price: 0, qty: 1 }];
      }
    }
    return [{ name: s, price: 0, qty: 1 }];
  }

  if (Array.isArray(raw)) {
    return raw.flatMap(parseLineItems);
  }

  if (raw && typeof raw === 'object') {
    // If nested items array inside object (e.g. restaurant order JSON payload)
    if (Array.isArray(raw.items)) {
      return raw.items.flatMap(parseLineItems);
    }

    // Room Tariff Stay summary
    if (raw.roomCharge !== undefined) {
      const lines: any[] = [];
      const rc = Number(raw.roomCharge || 0);
      if (rc > 0) lines.push({ name: `Room Tariff (${raw.roomType || 'Stay'})`, qty: 1, price: rc });
      const ft = Number(raw.foodTotal || raw.restaurant || 0);
      if (ft > 0) lines.push({ name: 'Restaurant / Food Charges', qty: 1, price: ft });
      const bt = Number(raw.barTotal || raw.bar || 0);
      if (bt > 0) lines.push({ name: 'Bar Lounge Charges', qty: 1, price: bt });
      const ex = Number(raw.extra || 0);
      if (ex > 0) lines.push({ name: 'Extra Bed / Service', qty: 1, price: ex });
      if (lines.length > 0) return lines;
      return [{ name: `Room Tariff (${raw.roomType || 'Stay'})`, qty: 1, price: rc }];
    }

    let name = raw.name || raw.item_name || raw.title || '';
    let price = Number(raw.price ?? raw.rate ?? 0);
    let qty = Number(raw.qty ?? raw.quantity ?? 1);
    const notes = raw.notes || raw.instructions || '';
    const isParcel = !!raw.is_parcel;

    // Check if name is serialized JSON
    if (typeof name === 'string' && (name.trim().startsWith('{') || name.trim().startsWith('['))) {
      try {
        const inner = JSON.parse(name.trim());
        const innerParsed = parseLineItems(inner);
        if (innerParsed.length > 0) return innerParsed;
      } catch {}
    }

    if (!name && (raw.subtotal !== undefined || raw.grand_total !== undefined)) {
      return [];
    }

    return [{ name: name || 'Item', price, qty, notes, isParcel }];
  }

  return [];
};

const items = (o: any) => {
  if (!o) return [];
  try {
    const raw = o.items || o.items_json || o.items_summary;
    const list = parseLineItems(raw);
    if (list.length > 0) return list;
    if (Number(o.total || o.grand_total || 0) > 0) {
      return [{ name: `${o.dept || 'Bill'} Charges`, price: Number(o.total || o.grand_total || 0), qty: 1 }];
    }
    return [];
  } catch {
    return [];
  }
};

const formatPaymentMode = (mode: any) => {
  if (!mode) return 'Pending / Unpaid';
  const m = String(mode).toLowerCase().trim();
  if (m === 'room_folio' || m === 'room' || m.includes('folio')) return 'Room Folio';
  if (m === 'cash') return 'Cash';
  if (m === 'upi' || m === 'online' || m === 'qr') return 'UPI / Online';
  if (m === 'card') return 'Card';
  if (m === 'complimentary' || m === 'comp') return 'Complimentary';
  return String(mode).toUpperCase();
};

const getOrderHeaderInfo = (o: any, dept: string) => {
  if (!o) return { title: 'Bill', subtitle: dept || 'Bill', destBadge: '' };

  let meta: any = {};
  if (o.meta) {
    meta = o.meta;
  } else if (typeof o.items_summary === 'string' && o.items_summary.trim().startsWith('{')) {
    try { meta = JSON.parse(o.items_summary); } catch {}
  } else if (typeof o.items_json === 'string' && o.items_json.trim().startsWith('{')) {
    try { meta = JSON.parse(o.items_json); } catch {}
  }

  const isStayFolio = dept === 'Room' || dept === 'Room_folio';
  if (isStayFolio) {
    const guest = o.customer_name || meta.guestName || 'Room Stay Guest';
    const room = o.room_number || o.room_id || meta.roomNumber;
    return {
      title: guest,
      subtitle: `Room Stay Folio · ${when(o.created_at)}${room ? ` · Room ${room}` : ''}${o.nights ? ` · ${o.nights} night(s)` : ''}`,
      destBadge: room ? `Room ${room}` : ''
    };
  }

  const rawType = String(
    o.destination_type ||
    meta.destination_type ||
    o.order_type ||
    meta.order_type ||
    ''
  ).toLowerCase().trim();

  const destLabel = String(
    o.destination_label ||
    meta.destination_label ||
    o.table_label ||
    o.table_number ||
    meta.table_label ||
    meta.table_number ||
    ''
  ).trim();

  const rawRoom = String(
    o.room_number ||
    meta.room_number ||
    o.room_id ||
    meta.room_id ||
    ''
  ).trim();

  const deptLabel = dept === 'Bar' ? 'Bar & Lounge' : 'Restaurant POS';

  // 1. Parcel / Takeaway
  if (rawType.includes('parcel') || rawType.includes('takeaway') || destLabel.toLowerCase().includes('parcel')) {
    const pLabel = destLabel || 'Parcel';
    const guest = o.customer_name && o.customer_name !== 'Walk-in' ? o.customer_name : '';
    return {
      title: guest ? `${guest} · Parcel (${pLabel})` : `Takeaway Parcel (${pLabel})`,
      subtitle: `${deptLabel} · ${when(o.created_at)} · Parcel Takeaway`,
      destBadge: `Parcel ${pLabel}`
    };
  }

  // 2. Room Service
  const isNumericRoom = /^\d+$/.test(rawRoom) || (/^\d+$/.test(destLabel) && !destLabel.toUpperCase().startsWith('T'));
  const isRoomService = rawType.includes('room') || (isNumericRoom && !rawType.includes('table'));
  if (isRoomService) {
    const rNo = isNumericRoom ? (rawRoom || destLabel) : rawRoom;
    const guest = o.customer_name && !o.customer_name.startsWith('Room') ? o.customer_name : '';
    return {
      title: guest ? `${guest} · Room ${rNo}` : `Room Service · Room ${rNo}`,
      subtitle: `${deptLabel} · ${when(o.created_at)} · Room Service (Room ${rNo})`,
      destBadge: `Room ${rNo}`
    };
  }

  // 3. Walk-in / Table Dine-in
  const tLabel = destLabel || (rawRoom && !/^\d+$/.test(rawRoom) ? rawRoom : '') || 'Dine-in';
  const tableDisplay = tLabel.toUpperCase().startsWith('T') ? tLabel : `Table ${tLabel}`;
  const guest = o.customer_name && o.customer_name !== 'Walk-in' && !o.customer_name.startsWith('Room') ? o.customer_name : '';
  return {
    title: guest ? `${guest} (${tableDisplay})` : `Walk-in · ${tableDisplay}`,
    subtitle: `${deptLabel} · ${when(o.created_at)} · ${tableDisplay} (Dine-in)`,
    destBadge: tableDisplay
  };
};

export default function Bill() {
  const { dept, id } = useLocalSearchParams<{ dept: string; id: string }>();
  const router = useRouter();

  const { data, err, busy, at, reload } = useLoad(
    async () => {
      const isRoom = dept === 'Room' || dept === 'Room_folio';
      if (isRoom) {
        let o = billCache.get('Room:' + id) || billCache.get('Room_folio:' + id);
        if (!o) {
          await api.bills();
          o = billCache.get('Room:' + id) || billCache.get('Room_folio:' + id);
        }
        if (!o) {
          for (const b of billCache.values()) {
            if ((b.dept === 'Room' || b.dept === 'Room_folio') && (String(b.id) === String(id) || String(b.order_number) === String(id))) {
              o = b;
              break;
            }
          }
        }
        if (o) return { order: o, logs: [] };
      }
      return api.order(dept!, id!);
    },
    [dept, id],
    `bill:${dept}:${id}`
  );

  const o = data?.order;

  const R = ({ l, v, b }: any) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ color: c.mute }}>{l}</Text>
      <Text style={{ fontWeight: b ? '700' : '500' }}>{v}</Text>
    </View>
  );

  const headerInfo = o ? getOrderHeaderInfo(o, dept || '') : null;
  const lineItems = o ? items(o) : [];

  const subtotalVal = Number(o?.subtotal ?? o?.sub_total ?? 0);
  const taxVal = Number(o?.tax ?? o?.gst ?? 0);
  const discountVal = Number(o?.discount ?? 0);
  const grandTotalVal = Number(o?.total ?? o?.grand_total ?? 0);
  const effSubtotal = subtotalVal > 0 ? subtotalVal : (grandTotalVal - taxVal + discountVal);

  return (
    <Screen
      title={o ? `Bill ${o.order_number || `#${o.id}`}` : 'Bill'}
      subtitle={dept === 'Room' || dept === 'Room_folio' ? 'Room Stay Folio' : (dept || 'Folio')}
      back
      busy={busy}
      reload={reload}
      at={at}
      err={err}
    >
      {o && (
        <>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontWeight: '800', fontSize: 16 }}>{headerInfo?.title}</Text>
              </View>
              <Badge text={o.is_paid ? 'PAID' : 'PENDING'} color={o.is_paid ? c.ok : c.warn} />
            </View>
            <Text style={{ color: c.mute, marginTop: 4 }}>
              {headerInfo?.subtitle}
            </Text>
            {o.waiter_name ? (
              <Text style={{ color: c.mute, fontSize: 12, marginTop: 2 }}>
                Server: {o.waiter_name}
              </Text>
            ) : null}
            {o.notes ? (
              <Text style={{ color: '#0369A1', fontSize: 12, marginTop: 3, fontStyle: 'italic' }}>
                Note: {o.notes}
              </Text>
            ) : null}
          </Card>

          <Card>
            {lineItems.map((i: any, k: number) => (
              <View key={k} style={{ paddingVertical: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontWeight: '700', color: c.ink, fontSize: 14 }}>
                      {i.name}
                    </Text>
                    {i.notes ? (
                      <Text style={{ fontSize: 12, color: c.mute, fontStyle: 'italic', marginTop: 1 }}>
                        Note: {i.notes}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontWeight: '700', color: c.ink, fontSize: 14 }}>
                      {money((i.price || 0) * (i.qty || 1))}
                    </Text>
                    <Text style={{ fontSize: 12, color: c.mute }}>
                      {i.qty || 1} × {money(i.price || 0)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
            <View style={{ height: 1, backgroundColor: c.line, marginVertical: 8 }} />
            <R l="Subtotal" v={money(effSubtotal)} />
            {discountVal > 0 ? <R l="Discount" v={`-${money(discountVal)}`} /> : <R l="Discount" v={money(0)} />}
            <R l="Tax (GST)" v={money(taxVal)} />
            <View style={{ height: 1, backgroundColor: c.line, marginVertical: 4 }} />
            <R b l="Grand total" v={money(grandTotalVal)} />
            <R l="Paid via" v={formatPaymentMode(o.payment_mode)} />
          </Card>

          <Text style={{ fontWeight: '800', color: c.ink, fontSize: 16, marginTop: 4 }}>Modification history</Text>
          {!data?.logs?.length && (
            <Card>
              <Text style={{ color: c.mute }}>No changes recorded.</Text>
            </Card>
          )}
          {(data?.logs || []).map((l: any) => (
            <Card key={l.id}>
              <Text style={{ fontWeight: '700' }}>
                {l.action} · {l.staff_user}
              </Text>
              <Text style={{ marginTop: 2 }}>{l.change_summary}</Text>
              {l.previous_total != null && (
                <Text style={{ color: c.mute, fontSize: 12, marginTop: 4 }}>
                  {money(l.previous_total)} → {money(l.new_total)} · {when(l.timestamp)}
                </Text>
              )}
            </Card>
          ))}

          <View style={{ marginTop: 12 }}>
            <Pressable
              onPress={() => {
                const billLabel = o.order_number || `#${o.id}`;
                const confirmMsg = `Are you sure you want to permanently delete ${billLabel}? This will remove it from the system and cannot be undone.`;
                const doDelete = async () => {
                  try {
                    await api.deleteBill(dept!, o.id || o.order_number);
                    if (Platform.OS === 'web') {
                      window.alert('Bill deleted successfully.');
                    } else {
                      Alert.alert('Deleted', 'Bill deleted successfully.');
                    }
                    router.back();
                  } catch (err: any) {
                    if (Platform.OS === 'web') {
                      window.alert(err.message || 'Could not delete bill.');
                    } else {
                      Alert.alert('Error', err.message || 'Could not delete bill.');
                    }
                  }
                };

                if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
                  if (window.confirm(confirmMsg)) doDelete();
                } else {
                  Alert.alert('Delete Bill', confirmMsg, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Yes, Delete', style: 'destructive', onPress: doDelete }
                  ]);
                }
              }}
              style={({ pressed }) => ({
                backgroundColor: pressed ? '#FEE2E2' : '#FFFFFF',
                borderColor: '#F87171',
                borderWidth: 1.5,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8
              })}
            >
              <Text style={{ color: '#DC2626', fontSize: 14, fontWeight: '800' }}>🗑️ Delete This Bill</Text>
            </Pressable>
          </View>
        </>
      )}
    </Screen>
  );
}
