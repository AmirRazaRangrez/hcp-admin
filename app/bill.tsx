import React, { useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { api, billCache } from '../src/api/client';
import { BottomSheet } from '../src/lib/sheet';
import { Screen, Card, Btn, Badge, useLoad } from '../src/lib/ui';
import { c, money, when } from '../src/lib/theme';

const items = (o: any) => {
  try {
    const x = JSON.parse(o.items_json || '[]');
    return Array.isArray(x) ? x : [];
  } catch {
    return [];
  }
};

const html = (o: any, d: string) => `<html><body style="font-family:sans-serif;padding:24px"><h2>Hotel City Park</h2><p>${d} bill ${o.order_number}<br/>${when(o.created_at)}<br/>${o.customer_name || 'Walk-in'}</p><table width="100%" style="border-collapse:collapse">${items(o).map((i: any) => `<tr><td>${i.name || i.item_name || ''}</td><td>x${i.qty || i.quantity || 1}</td><td align="right">${money((i.price || 0) * (i.qty || i.quantity || 1))}</td></tr>`).join('')}</table><hr/><p>Subtotal ${money(o.subtotal)}<br/>Tax ${money(o.tax)}<br/>Discount ${money(o.discount)}<br/><b>Total ${money(o.total)}</b><br/>${o.is_paid ? 'Paid' : 'Unpaid'} (${o.payment_mode || '-'})</p></body></html>`;

export default function Bill() {
  const { dept, id } = useLocalSearchParams<{ dept: string; id: string }>();
  const router = useRouter();
  const [sheet, setSheet] = useState(false);

  const { data, err, busy, at, reload } = useLoad(
    async () =>
      dept === 'Room'
        ? (async () => {
            if (!billCache.get('Room:' + id)) await api.bills();
            const o = billCache.get('Room:' + id);
            if (!o) throw new Error('This stay is not in the recent checked-out list.');
            return { order: o, logs: [] };
          })()
        : api.order(dept!, id!),
    [dept, id],
    `bill:${dept}:${id}`
  );

  const o = data?.order;

  const share = async () => {
    if (Platform.OS === 'web') {
      await Print.printAsync({ html: html(o, dept!) });
      return;
    }
    const f = await Print.printToFileAsync({ html: html(o, dept!) });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(f.uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Bill ${o.order_number}`
      });
    }
  };

  const R = ({ l, v, b }: any) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ color: c.mute }}>{l}</Text>
      <Text style={{ fontWeight: b ? '700' : '500' }}>{v}</Text>
    </View>
  );

  return (
    <>
      <Screen
        title={o ? `Bill ${o.order_number}` : 'Bill'}
        subtitle={dept || 'Folio'}
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
                <Text style={{ fontWeight: '800', fontSize: 16 }}>{o.customer_name || 'Walk-in'}</Text>
                <Badge text={o.is_paid ? 'PAID' : 'PENDING'} color={o.is_paid ? c.ok : c.warn} />
              </View>
              <Text style={{ color: c.mute, marginTop: 4 }}>
                {dept} · {when(o.created_at)}
                {o.room_number || o.room_id ? ` · Room ${o.room_number || o.room_id}` : ''}
                {o.nights ? ` · ${o.nights} night(s)` : ''}
              </Text>
            </Card>

            <Card>
              {items(o).map((i: any, k: number) => (
                <R
                  key={k}
                  l={`${i.name || i.item_name} × ${i.qty || i.quantity || 1}`}
                  v={money((i.price || 0) * (i.qty || i.quantity || 1))}
                />
              ))}
              <View style={{ height: 1, backgroundColor: c.line, marginVertical: 8 }} />
              <R l="Subtotal" v={money(o.subtotal)} />
              <R l="Discount" v={money(o.discount)} />
              <R l="Tax" v={money(o.tax)} />
              <R b l="Grand total" v={money(o.total)} />
              <R l="Paid via" v={o.payment_mode || '-'} />
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

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              <Btn label="View PDF" onPress={() => Print.printAsync({ html: html(o, dept!) })} />
              <Btn label="Share / Download" onPress={() => setSheet(true)} />
            </View>
          </>
        )}
      </Screen>

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="Bill PDF">
        <Text style={{ color: c.mute, marginBottom: 12 }}>
          Created on this phone from the bill data. The layout matches the CRM standard receipt.
        </Text>
        <View style={{ flexDirection: 'row' }}>
          <Btn
            label="Share or save PDF"
            onPress={() => {
              setSheet(false);
              share();
            }}
          />
        </View>
      </BottomSheet>
    </>
  );
}
