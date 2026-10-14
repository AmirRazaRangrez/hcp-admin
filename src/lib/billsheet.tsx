import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { api, errMsg } from '../api/client';
import { c, money, when } from './theme';
import {
  BarIcon,
  RestaurantIcon,
  CalendarIcon,
  KeyIcon,
  HotelIcon,
  ClockIcon,
  CloseIcon
} from './icons';

// ---------- helpers ----------
export const itemsOf = (o: any) => {
  try {
    const x = JSON.parse(o?.items_json || '[]');
    return Array.isArray(x) ? x : [];
  } catch {
    return [];
  }
};

const qtyOf = (i: any) => Number(i.qty ?? i.quantity ?? 1) || 1;
const priceOf = (i: any) => Number(i.price ?? i.rate ?? 0) || 0;
const nameOf = (i: any) => i.name || i.item_name || 'Item';
export const daysOld = (s?: string) => {
  const t = new Date(String(s || '').replace(' ', 'T')).getTime();
  return isNaN(t) ? 0 : Math.floor((Date.now() - t) / 864e5);
};

const DeptIcon = ({ d, size = 14, color }: any) =>
  d === 'Bar' ? <BarIcon size={size} color={color || '#7C3AED'} /> : <RestaurantIcon size={size} color={color || '#E11D48'} />;

const RED = '#B3261E', PINK = '#FDECEC', PINK_LINE = '#F2B8B8', GREEN_BG = '#EAF6EF', GREEN_LINE = '#BFE3CF';

const Pill = ({ children, solid, color = RED, icon }: any) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: color, backgroundColor: solid ? color : '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
    {icon}
    <Text style={{ color: solid ? '#fff' : color, fontWeight: '700', fontSize: 12 }}>{children}</Text>
  </View>
);

// ---------- card shown inside the room summary ----------
export function BillCard({ o, onPress }: { o: any; onPress: () => void }) {
  const paid = !!o.is_paid, col = paid ? c.ok : RED, od = !paid ? daysOld(o.created_at) : 0;
  return (
    <Pressable onPress={onPress} style={{ backgroundColor: paid ? GREEN_BG : PINK, borderColor: paid ? GREEN_LINE : PINK_LINE, borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pill color={col} icon={<DeptIcon d={o.dept} color={col} />}>{o.dept}</Pill>
        <Text style={{ color: col, fontWeight: '700' }}>{o.order_number}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <CalendarIcon size={14} color={c.mute} />
          <Text style={{ color: c.text, fontWeight: '600' }}>{when(o.created_at)}</Text>
        </View>
        {!!o.room_number && (
          <Pill color="#B8893B" icon={<KeyIcon size={13} color="#B8893B" />}>
            Room #{o.room_number}
          </Pill>
        )}
      </View>
      {od > 3 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: '#8E1B14', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
          <ClockIcon size={13} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>&gt;3d Overdue ({od}d) - Pay in Hospitality</Text>
        </View>
      )}
      <View style={{ height: 1, backgroundColor: paid ? GREEN_LINE : PINK_LINE }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View>
          <Text style={{ color: col, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>{paid ? 'PAID AMOUNT' : 'PENDING AMOUNT'}</Text>
          <Text style={{ color: col, fontSize: 26, fontWeight: '800' }}>{money(o.total)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {!!o.room_number && <Pill color={col} icon={<HotelIcon size={12} color={col} />}>ROOM FOLIO</Pill>}
          <Pill solid color={col}>{paid ? 'PAID' : 'PENDING'}</Pill>
        </View>
      </View>
    </Pressable>
  );
}

// ---------- full detail (opens when a card is tapped) ----------
export function BillSheet({ visible, bill, onClose, onChanged }: { visible: boolean; bill: any; onClose: () => void; onChanged: () => void }) {
  const [o, setO] = useState<any>(bill);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    setEdit(false);
    setConfirmDel(false);
    setMsg('');
    setO(bill);
    setLogs([]);
    if (!visible || !bill) return;
    let live = true;
    setLoading(true);
    api.order(bill.dept, bill.id).then((r: any) => {
      if (live && r?.order) {
        const d = r.order;
        setO({ ...bill, items_json: d.items_json ?? bill.items_json, subtotal: d.subtotal ?? bill.subtotal, tax: d.tax ?? bill.tax, discount: d.discount ?? bill.discount, total: d.total ?? bill.total });
        setLogs(r.logs || []);
      }
    }).catch(() => {}).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [visible, bill?.id, bill?.dept]);

  if (!bill || !o) return null;
  const paid = !!o.is_paid, col = paid ? c.ok : RED;
  const rows = edit ? draft : itemsOf(o);
  const sub = edit ? draft.reduce((t, i) => t + priceOf(i) * qtyOf(i), 0) : Number(o.subtotal) || rows.reduce((t, i) => t + priceOf(i) * qtyOf(i), 0);
  const rate = Number(o.subtotal) > 0 ? Number(o.tax || 0) / Number(o.subtotal) : 0;
  const tax = edit ? Math.round(sub * rate) : Number(o.tax) || 0;
  const disc = Number(o.discount) || 0;
  const total = edit ? Math.max(sub - disc + tax, 0) : Number(o.total) || 0;

  const startEdit = () => { setDraft(itemsOf(o).map((i: any) => ({ ...i }))); setMsg(''); setEdit(true); };
  const setQty = (k: number, d: number) => setDraft(x => x.map((i, j) => j === k ? { ...i, qty: Math.max(1, qtyOf(i) + d), quantity: Math.max(1, qtyOf(i) + d) } : i));
  const save = async () => {
    setSaving(true); setMsg('');
    try {
      await api.editBill(o.dept, o.id, { items: draft, subtotal: sub, tax, discount: disc, total });
      setEdit(false);
      onChanged();
      onClose();
    } catch (e: any) {
      setMsg(errMsg(e));
    } finally {
      setSaving(false);
    }
  };
  const doDel = async () => {
    try {
      await api.deleteBill(o.dept, o.id);
      onChanged();
      onClose();
    } catch (e: any) {
      setConfirmDel(false);
      setMsg(errMsg(e));
    }
  };

  const Info = ({ l, children }: any) => (
    <View style={{ flexBasis: '48%', flexGrow: 1, gap: 2 }}>
      <Text style={{ color: c.mute, fontSize: 12 }}>{l}</Text>
      {children}
    </View>
  );

  const T = ({ l, v, b, color }: any) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={{ color: color || c.mute, fontWeight: b ? '800' : '400' }}>{l}</Text>
      <Text style={{ color: color || c.text, fontWeight: b ? '800' : '600' }}>{v}</Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#0009', justifyContent: 'center', padding: 12 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', maxHeight: '92%' }}>
          <View style={{ backgroundColor: paid ? GREEN_BG : PINK, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: paid ? GREEN_LINE : PINK_LINE }}>
            <Pill color={col} icon={<DeptIcon d={o.dept} color={col} />}>{o.dept}</Pill>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', fontSize: 17, color: c.text }}>{o.order_number}</Text>
              <Text style={{ color: c.mute, fontSize: 12 }}>Full Order &amp; Itemized Bill Details</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.line }}>
              <CloseIcon size={16} color={c.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
            <View style={{ backgroundColor: '#F6F8FB', borderRadius: 12, borderWidth: 1, borderColor: c.line, padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              <Info l="Assigned Room">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <KeyIcon size={14} color="#B8893B" />
                  <Text style={{ fontWeight: '700', color: c.ink }}>{o.room_number ? `Room #${o.room_number}` : '—'}</Text>
                </View>
              </Info>
              <Info l="Date & Time">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <CalendarIcon size={14} color={c.mute} />
                  <Text style={{ fontWeight: '700', color: c.ink }}>{when(o.created_at)}</Text>
                </View>
              </Info>
              <Info l="Payment Mode">
                <Text style={{ fontWeight: '700', color: col }}>{o.room_number && !paid ? 'Room Folio (Pending Checkout)' : String(o.payment_mode || '-').replace('_', ' ')}</Text>
              </Info>
              <Info l="Payment Status">
                <Text style={{ fontWeight: '700', color: col }}>{paid ? 'PAID' : 'PENDING (Folio Due)'}</Text>
              </Info>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <DeptIcon d={o.dept} size={15} color={c.ink} />
              <Text style={{ fontWeight: '800', color: c.ink, fontSize: 12, letterSpacing: 0.5 }}>
                ITEMIZED {o.dept === 'Bar' ? 'DRINK' : 'FOOD / BEVERAGE'} ITEMS ({rows.length})
              </Text>
            </View>
            {loading && <ActivityIndicator />}
            <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 12, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', backgroundColor: '#F6F8FB', padding: 10 }}>
                {['#', 'Item Name', 'Qty', 'Rate', 'Total'].map((h, k) => (
                  <Text key={h} style={{ color: c.mute, fontWeight: '700', fontSize: 12, flex: k === 1 ? 3 : k === 0 ? 0.5 : 1.2, textAlign: k > 1 ? 'right' : 'left' }}>
                    {h}
                  </Text>
                ))}
              </View>
              {rows.map((i: any, k: number) => (
                <View key={k} style={{ flexDirection: 'row', padding: 10, borderTopWidth: 1, borderTopColor: c.line, alignItems: 'center' }}>
                  <Text style={{ flex: 0.5, color: c.mute }}>{k + 1}</Text>
                  <Text style={{ flex: 3, fontWeight: '700', color: c.text }}>{nameOf(i)} x{qtyOf(i)}</Text>
                  {edit ? (
                    <View style={{ flex: 1.2, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                      <Pressable onPress={() => setQty(k, -1)} style={{ width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}><Text>−</Text></Pressable>
                      <Text style={{ fontWeight: '800' }}>{qtyOf(i)}</Text>
                      <Pressable onPress={() => setQty(k, 1)} style={{ width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}><Text>+</Text></Pressable>
                    </View>
                  ) : (
                    <Text style={{ flex: 1.2, textAlign: 'right', fontWeight: '800' }}>{qtyOf(i)}</Text>
                  )}
                  <Text style={{ flex: 1.2, textAlign: 'right', color: c.mute }}>{money(priceOf(i))}</Text>
                  {edit ? (
                    <Pressable onPress={() => setDraft(x => x.filter((_, j) => j !== k))} style={{ flex: 1.2, alignItems: 'flex-end' }}>
                      <Text style={{ color: RED, fontWeight: '800' }}>Remove</Text>
                    </Pressable>
                  ) : (
                    <Text style={{ flex: 1.2, textAlign: 'right', fontWeight: '800' }}>{money(priceOf(i) * qtyOf(i))}</Text>
                  )}
                </View>
              ))}
              {!rows.length && <Text style={{ padding: 12, color: c.mute }}>No items recorded.</Text>}
            </View>
            <View style={{ backgroundColor: paid ? GREEN_BG : PINK, borderColor: paid ? GREEN_LINE : PINK_LINE, borderWidth: 1, borderRadius: 12, padding: 12 }}>
              <T l="Items Subtotal:" v={money(sub)} />
              {disc > 0 && <T l="Discount:" v={'− ' + money(disc)} />}
              <T l="GST / Taxes:" v={money(tax)} />
              <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderColor: PINK_LINE, marginVertical: 8 }} />
              <Text style={{ color: col, fontWeight: '800', fontSize: 12 }}>{paid ? 'TOTAL PAID AMOUNT' : 'TOTAL PENDING AMOUNT'}</Text>
              <Text style={{ color: col, fontWeight: '800', fontSize: 30 }}>{money(total)}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                {!!o.room_number && (
                  <Pill color={col} icon={<HotelIcon size={12} color={col} />}>
                    ROOM FOLIO{paid ? '' : ' (PENDING CHECKOUT)'}
                  </Pill>
                )}
                <Pill solid color={col}>{paid ? 'PAID' : 'PENDING'}</Pill>
              </View>
            </View>
            {logs.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontWeight: '800', color: c.ink, fontSize: 12, letterSpacing: 0.5 }}>MODIFICATION HISTORY</Text>
                {logs.map((l: any) => (
                  <View key={l.id} style={{ borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: 10 }}>
                    <Text style={{ fontWeight: '700' }}>{l.action} · {l.staff_user}</Text>
                    <Text>{l.change_summary}</Text>
                    <Text style={{ color: c.mute, fontSize: 12 }}>{when(l.timestamp)}</Text>
                  </View>
                ))}
              </View>
            )}
            {!!msg && <Text style={{ color: RED, fontWeight: '600' }}>{msg}</Text>}
            {confirmDel && (
              <View style={{ backgroundColor: PINK, borderColor: PINK_LINE, borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 }}>
                <Text style={{ color: RED, fontWeight: '700' }}>Delete {o.order_number}? It will be removed from the CRM and cannot be undone.</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable onPress={doDel} style={{ flex: 1, padding: 12, borderRadius: 10, alignItems: 'center', backgroundColor: RED }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Yes, delete</Text>
                  </Pressable>
                  <Pressable onPress={() => setConfirmDel(false)} style={{ flex: 1, padding: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: c.line, backgroundColor: '#fff' }}>
                    <Text style={{ fontWeight: '700' }}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            )}
            {!confirmDel && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {edit ? (
                  <>
                    <Pressable disabled={saving} onPress={save} style={{ flex: 1, padding: 13, borderRadius: 10, alignItems: 'center', backgroundColor: c.ok, opacity: saving ? 0.5 : 1 }}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Saving…' : 'Save changes'}</Text>
                    </Pressable>
                    <Pressable onPress={() => setEdit(false)} style={{ flex: 1, padding: 13, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: c.line }}>
                      <Text style={{ fontWeight: '700' }}>Cancel</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable onPress={startEdit} style={{ flex: 1, padding: 13, borderRadius: 10, alignItems: 'center', backgroundColor: c.ink }}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Edit bill</Text>
                    </Pressable>
                    <Pressable onPress={() => { setMsg(''); setConfirmDel(true); }} style={{ flex: 1, padding: 13, borderRadius: 10, alignItems: 'center', backgroundColor: RED }}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Delete bill</Text>
                    </Pressable>
                  </>
                )}
              </View>
            )}
          </ScrollView>
          <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: c.line, alignItems: 'flex-end' }}>
            <Pressable onPress={onClose} style={{ paddingHorizontal: 28, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: c.line }}>
              <Text style={{ fontWeight: '800' }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}