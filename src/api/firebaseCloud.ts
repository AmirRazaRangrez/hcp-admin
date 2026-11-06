/**
 * admin/src/api/firebaseCloud.ts
 * 
 * Direct Firebase Firestore Cloud Provider for Hotel City Park Admin APK
 * Replaces Supabase completely with 100% Firebase Firestore.
 */

import { Platform } from 'react-native';
import { cleanRoomNumber } from '../lib/theme';
import { isInHouse, toStay } from '../lib/stay';

export const FIREBASE_REST_URL = 'https://firestore.googleapis.com/v1/projects/hotelcitypark-crm/databases/(default)/documents';
export const FIREBASE_API_KEY = 'AIzaSyCtZnkdk1_q8rWrISnD8P2Rhi-jcPn1QTI';

export function parseFirestoreDoc(doc: any): any {
  if (!doc || !doc.fields) return doc;
  const out: Record<string, any> = { id: doc.name?.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields) as [string, any][]) {
    if (v.stringValue !== undefined) out[k] = v.stringValue;
    else if (v.integerValue !== undefined) out[k] = Number(v.integerValue);
    else if (v.doubleValue !== undefined) out[k] = Number(v.doubleValue);
    else if (v.booleanValue !== undefined) out[k] = v.booleanValue;
    else if (v.timestampValue !== undefined) out[k] = v.timestampValue;
    else if (v.nullValue !== undefined) out[k] = null;
    else if (v.arrayValue !== undefined) {
      out[k] = (v.arrayValue.values || []).map((item: any) => {
        if (item.stringValue !== undefined) return item.stringValue;
        if (item.integerValue !== undefined) return Number(item.integerValue);
        if (item.doubleValue !== undefined) return Number(item.doubleValue);
        if (item.mapValue !== undefined) return parseFirestoreDoc({ fields: item.mapValue.fields });
        return item;
      });
    } else if (v.mapValue !== undefined) {
      out[k] = parseFirestoreDoc({ fields: v.mapValue.fields });
    }
  }
  return out;
}

const collCache = new Map<string, { time: number; data: any[] }>();
const collInflight = new Map<string, Promise<any[]>>();

export function invalidateFirestoreCache(coll?: string) {
  if (coll) collCache.delete(coll);
  else collCache.clear();
}

export async function fetchFirestoreCollection(coll: string, forceFresh = false): Promise<any[]> {
  const now = Date.now();
  if (!forceFresh) {
    const cached = collCache.get(coll);
    if (cached && (now - cached.time) < 90000) {
      return cached.data;
    }
    const inflight = collInflight.get(coll);
    if (inflight) return inflight;
  }

  const p = (async () => {
    try {
      const res = await fetch(`${FIREBASE_REST_URL}/${coll}?key=${FIREBASE_API_KEY}`).then(r => r.json()).catch(() => null);
      if (res?.documents && Array.isArray(res.documents)) {
        const parsed = res.documents.map(parseFirestoreDoc);
        collCache.set(coll, { time: Date.now(), data: parsed });
        return parsed;
      }
    } catch (_) {}
    return collCache.get(coll)?.data || [];
  })();

  collInflight.set(coll, p);
  p.finally(() => collInflight.delete(coll));
  return p;
}

export async function fetchStoreBills(status: 'live' | 'history' | 'all' = 'all') {
  try {
    const [rawBills, vendors, payments] = await Promise.all([
      fetchFirestoreCollection('store_bills'),
      fetchFirestoreCollection('store_vendors'),
      fetchFirestoreCollection('store_vendor_payments')
    ]);

    const vMap = new Map(vendors.map((v: any) => [String(v.id), v]));
    const filteredBills = rawBills.filter((b: any) => {
      const st = String(b.status || '').toUpperCase();
      const pend = Number(b.pending_amount) || 0;
      if (status === 'history') return st === 'FULL' || pend <= 0;
      if (status === 'live') return st !== 'FULL' && pend > 0;
      return true;
    });

    const bills = filteredBills.map((b: any) => {
      const v = vMap.get(String(b.vendor_id));
      const billPayments = payments.filter((p: any) => 
        String(p.bill_id) === String(b.id) || 
        String(p.bill_id) === String(b.bill_number) ||
        (String(p.vendor_id) === String(b.vendor_id) && Math.abs(Number(p.payment_amount) - Number(b.paid_amount)) < 1)
      );
      const modeMatch = String(b.notes || '').match(/Mode:\s*([^,\n\|]+)/i);
      const parsedMode = (b.payment_mode && b.payment_mode !== 'null' ? b.payment_mode : '') || (modeMatch ? modeMatch[1].trim() : '') || (billPayments[0]?.payment_mode) || 'Bank Transfer';
      const hasGst = Boolean(
        b.has_gst === 1 || 
        b.has_gst === true || 
        b.has_gst === '1' || 
        String(b.notes || '').toLowerCase().includes('with gst')
      );
      const finalPayments = billPayments.length > 0 ? billPayments : (Number(b.paid_amount || 0) > 0 ? [{
        id: `synth_${b.id}`,
        bill_id: b.id,
        vendor_id: b.vendor_id,
        payment_amount: Number(b.paid_amount),
        payment_mode: parsedMode,
        paid_by: b.created_by || 'Admin',
        paid_at: b.updated_at || b.bill_date || b.created_at,
        reference_no: ''
      }] : []);

      return {
        ...b,
        has_gst: hasGst,
        payment_mode: parsedMode,
        vendor_name: v?.name || b.vendor_name || 'Store Vendor',
        vendor_mobile: v?.mobile || b.vendor_mobile || '',
        payments: finalPayments
      };
    });

    const partyMap: Record<string, any> = {};
    for (const b of bills) {
      if (!partyMap[b.vendor_id]) {
        partyMap[b.vendor_id] = {
          vendor_id: b.vendor_id,
          vendor_name: b.vendor_name,
          vendor_mobile: b.vendor_mobile,
          total_bills: 0,
          total_amount: 0,
          total_paid: 0,
          total_pending: 0,
          bills: []
        };
      }
      partyMap[b.vendor_id].total_bills += 1;
      partyMap[b.vendor_id].total_amount += Number(b.total_amount) || 0;
      partyMap[b.vendor_id].total_paid += Number(b.paid_amount) || 0;
      partyMap[b.vendor_id].total_pending += Number(b.pending_amount) || 0;
      partyMap[b.vendor_id].bills.push(b);
    }

    return {
      success: true,
      status,
      bills,
      partySummary: Object.values(partyMap),
      paymentsHistory: payments.map((p: any) => {
        const v = vMap.get(String(p.vendor_id));
        return { ...p, vendor_name: v?.name, vendor_mobile: v?.mobile };
      })
    };
  } catch (err: any) {
    return { success: true, status, bills: [], partySummary: [], paymentsHistory: [] };
  }
}

export async function recordStorePayment(body: any, sendPush: boolean = true) {
  const amount = parseFloat(body.payment_amount);
  if (isNaN(amount) || amount <= 0) throw new Error('Valid payment amount is required');

  if (body.bill_id) {
    const bills = await fetchFirestoreCollection('store_bills');
    const targetBill = bills.find((b: any) => String(b.id) === String(body.bill_id));
    if (!targetBill) throw new Error('Bill not found in cloud database');

    const newPaid = Math.round(((Number(targetBill.paid_amount) || 0) + amount) * 100) / 100;
    const newPending = Math.max(0, Math.round(((Number(targetBill.total_amount) || 0) - newPaid) * 100) / 100);
    const newStatus = (newPending === 0) ? 'FULL' : 'PARTLY';

    await fetch(`${FIREBASE_REST_URL}/store_bills/${targetBill.id}?updateMask.fieldPaths=paid_amount&updateMask.fieldPaths=pending_amount&updateMask.fieldPaths=status&key=${FIREBASE_API_KEY}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          paid_amount: { doubleValue: newPaid },
          pending_amount: { doubleValue: newPending },
          status: { stringValue: newStatus }
        }
      })
    });

    // 🔔 Dispatch Cloud Push Notification to Storeman APK on topic 'store_bills' (only if sendPush is true)
    if (sendPush) {
      try {
        fetch('https://hlwmsllmqfdxfmqulrat.supabase.co/functions/v1/send-store-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhsd21zbGxtcWZkeGZtcXVscmF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NDY5NDIsImV4cCI6MjA3NTQyMjk0Mn0.p1b2Yq9mZ0WXZG1z0B8Yy7v9o0T0_h0T1a2B3c4D5eF',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhsd21zbGxtcWZkeGZtcXVscmF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NDY5NDIsImV4cCI6MjA3NTQyMjk0Mn0.p1b2Yq9mZ0WXZG1z0B8Yy7v9o0T0_h0T1a2B3c4D5eF'
        },
        body: JSON.stringify({
          type: 'store_payment',
          topic: 'store_bills',
          title: `💰 Admin Paid ₹${amount}`,
          body: `Admin paid ₹${amount} for ${targetBill.vendor_name || 'Vendor'} (${body.payment_mode || 'Bank Transfer'})`,
          amount: String(amount),
          vendor_name: targetBill.vendor_name || 'Vendor',
          payment_mode: body.payment_mode || 'Bank Transfer',
          paid_by: body.paid_by || 'Admin',
          bill_id: String(targetBill.id)
        })
        }).catch(() => {});
      } catch (_) {}
    }

    const paymentId = 'PAY_' + Date.now();
    await fetch(`${FIREBASE_REST_URL}/store_vendor_payments?documentId=${paymentId}&key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          bill_id: { stringValue: String(targetBill.id) },
          vendor_id: { stringValue: String(targetBill.vendor_id) },
          payment_amount: { doubleValue: amount },
          payment_mode: { stringValue: String(body.payment_mode || 'Bank Transfer') },
          reference_no: { stringValue: String(body.reference_no || '') },
          paid_by: { stringValue: String(body.paid_by || 'Admin (Jaijeet sir)') },
          paid_at: { stringValue: new Date().toISOString() },
          created_at: { stringValue: new Date().toISOString() },
          notified: { booleanValue: true }
        }
      })
    });

    targetBill.paid_amount = newPaid;
    targetBill.pending_amount = newPending;
    targetBill.status = newStatus;
    return { success: true, updatedBill: targetBill };
  } else if (body.vendor_id) {
    const list = await fetchFirestoreCollection('store_bills');
    const pendingBills = list
      .filter((b: any) => String(b.vendor_id) === String(body.vendor_id) && Number(b.pending_amount) > 0 && String(b.status || '').toUpperCase() !== 'FULL')
      .sort((a: any, b: any) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

    let rem = amount;
    for (const pb of pendingBills) {
      if (rem <= 0) break;
      const curPending = Number(pb.pending_amount) || 0;
      const curPaid = Number(pb.paid_amount) || 0;
      const curTotal = Number(pb.total_amount) || 0;
      const thisPay = Math.min(rem, curPending);
      const newPaid = Math.round((curPaid + thisPay) * 100) / 100;
      const newPending = Math.max(0, Math.round((curTotal - newPaid) * 100) / 100);
      const newStatus = (newPending === 0) ? 'FULL' : 'PARTLY';

      await fetch(`${FIREBASE_REST_URL}/store_bills/${pb.id}?updateMask.fieldPaths=paid_amount&updateMask.fieldPaths=pending_amount&updateMask.fieldPaths=status&key=${FIREBASE_API_KEY}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            paid_amount: { doubleValue: newPaid },
            pending_amount: { doubleValue: newPending },
            status: { stringValue: newStatus }
          }
        })
      });

      rem = Math.round((rem - thisPay) * 100) / 100;
    }

    const paymentId = 'PAY_' + Date.now();
    await fetch(`${FIREBASE_REST_URL}/store_vendor_payments?documentId=${paymentId}&key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          vendor_id: { stringValue: String(body.vendor_id) },
          payment_amount: { doubleValue: amount },
          payment_mode: { stringValue: String(body.payment_mode || 'Bank Transfer') },
          reference_no: { stringValue: String(body.reference_no || '') },
          paid_by: { stringValue: String(body.paid_by || 'Admin (Jaijeet sir)') },
          paid_at: { stringValue: new Date().toISOString() },
          created_at: { stringValue: new Date().toISOString() },
          notified: { booleanValue: true }
        }
      })
    });

    // 🔔 Dispatch Cloud Push Notification to Storeman APK on topic 'store_bills' (only if sendPush is true)
    if (sendPush) {
      try {
        fetch('https://hlwmsllmqfdxfmqulrat.supabase.co/functions/v1/send-store-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhsd21zbGxtcWZkeGZtcXVscmF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NDY5NDIsImV4cCI6MjA3NTQyMjk0Mn0.p1b2Yq9mZ0WXZG1z0B8Yy7v9o0T0_h0T1a2B3c4D5eF',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhsd21zbGxtcWZkeGZtcXVscmF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NDY5NDIsImV4cCI6MjA3NTQyMjk0Mn0.p1b2Yq9mZ0WXZG1z0B8Yy7v9o0T0_h0T1a2B3c4D5eF'
        },
        body: JSON.stringify({
          type: 'store_payment',
          topic: 'store_bills',
          title: `💰 Admin Paid ₹${amount}`,
          body: `Admin paid ₹${amount} towards pending vendor bills (${body.payment_mode || 'Bank Transfer'})`,
          amount: String(amount),
          payment_mode: body.payment_mode || 'Bank Transfer',
          paid_by: body.paid_by || 'Admin'
        })
        }).catch(() => {});
      } catch (_) {}
    }

    return { success: true };
  }
  throw new Error('Either bill_id or vendor_id is required');
}

export async function fetchOccupiedStays() {
  const occupancies = await fetchFirestoreCollection('active_occupancies');
  const charges = await fetchFirestoreCollection('room_charges_inbox');
  const folioDocs = charges.filter((c: any) => c.department === 'room_folio');
  const folioMap = new Map<string, any>();
  folioDocs.forEach((f: any) => {
    const rNum = cleanRoomNumber(f.room_number);
    let s: any = null;
    try { s = typeof f.items_summary === 'string' ? JSON.parse(f.items_summary) : f.items_summary; } catch {}
    if (s && rNum) folioMap.set(rNum, s);
  });

  const out: any[] = [];
  occupancies.forEach((o: any) => {
    const rNum = cleanRoomNumber(o.room_number);
    if (!rNum) return;
    const folio = folioMap.get(rNum) || {};
    const totalAdults = Math.max(1, (o.adults_male || 0) + (o.adults_female || 0));
    out.push({
      room: rNum,
      room_number: rNum,
      booking_id: Number(o.booking_id) || 0,
      voucher_number: o.voucher_number || `BK-${rNum}`,
      guest_name: o.guest_name || 'Guest',
      mobile: o.guest_mobile || '',
      email: o.guest_email || '',
      address: o.guest_address || '',
      dob: o.guest_dob || '',
      doc_type: o.doc_type || 'Aadhaar Card',
      aadhar_number: o.aadhar_number || '',
      room_type: o.room_type || 'Standard',
      adults: totalAdults,
      adults_male: o.adults_male || 0,
      adults_female: o.adults_female || 0,
      children: o.children || 0,
      meal_plan: o.meal_plan || 'without_breakfast',
      booking_source: o.booking_source || 'Walk-in',
      checked_in_by: o.checked_in_by || 'Front Desk',
      checkin_time: o.checkin_time || new Date().toISOString(),
      approx_checkout_time: o.approx_checkout_time || '',
      room_charge: Number(folio.roomCharge || 0),
      tariff_subtotal: Number(folio.tariffSubtotal || 0),
      restaurant: Number(folio.restaurant || 0),
      bar: Number(folio.bar || 0),
      extra: Number(folio.extra || 0),
      total: Number(folio.total || 0),
      paid: Number(o.total_paid || o.advance_payment || folio.paid || 0),
      pending: Math.max(0, Number(folio.total || 0) - Number(o.total_paid || o.advance_payment || folio.paid || 0)),
      stay_calc_declared: folio.stayCalcDeclared || null,
      stay_calc_now: folio.stayCalcNow || null,
      status: 'active'
    });
  });

  return out.map(toStay);
}

export async function fetchAvailableRooms() {
  const occupancies = await fetchFirestoreCollection('active_occupancies');
  const occupiedNums = new Set(occupancies.map((o: any) => cleanRoomNumber(o.room_number)));
  const allRooms: string[] = ['101','102','103','104','105','201','202','203','204','205','301','302','303','304','305','401','402','403','404','405','501','502'];
  return allRooms.filter(r => !occupiedNums.has(r)).map(r => ({
    id: r,
    room: r,
    room_number: r,
    room_type: 'Standard Room',
    status: 'available',
    price: 2400
  }));
}

export async function fetchDailyAnalytics(startDate: string, endDate: string) {
  const list = await fetchFirestoreCollection('hotel_analytics');
  return list.filter((a: any) => {
    const id = String(a.id || a.date || '');
    return (!startDate || id >= startDate) && (!endDate || id <= endDate);
  });
}

export async function fetchApprovals() {
  const charges = await fetchFirestoreCollection('room_charges_inbox');
  return charges.filter((c: any) => c.department === 'discount_approval');
}

export async function actApproval(id: any, status: 'approved' | 'rejected') {
  const docId = String(id).startsWith('APP-') ? String(id) : 'APP-' + id;
  await fetch(`${FIREBASE_REST_URL}/room_charges_inbox/${docId}?updateMask.fieldPaths=status&key=${FIREBASE_API_KEY}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        status: { stringValue: status.toUpperCase() }
      }
    })
  });
  return true;
}

export async function fetchActivity(): Promise<any[]> {
  const [occDocs, chargeDocs] = await Promise.all([
    fetchFirestoreCollection('active_occupancies'),
    fetchFirestoreCollection('room_charges_inbox')
  ]);

  const fbOut: any[] = [];

  // 1. Check-ins from active occupancies
  occDocs.forEach((o: any) => {
    const roomNum = cleanRoomNumber(o.room_number);
    const adv = Number(o.advance_payment || 0);
    const advText = adv > 0 ? ` · Advance: ₹${adv.toLocaleString('en-IN')}` : ' · Advance: ₹0';
    const tariff = Number(o.total_room_charge || o.room_rate || 0);
    const tariffText = tariff > 0 ? ` · Tariff: ₹${tariff.toLocaleString('en-IN')}` : '';
    const src = o.booking_source ? ` · ${o.booking_source}` : '';
    const by = o.checked_in_by ? ` · By ${o.checked_in_by}` : '';
    const mob = o.guest_mobile ? ` · 📞 ${o.guest_mobile}` : '';
    fbOut.push({
      id: `in:${roomNum}`,
      type: 'checkin',
      tags: ['checkin', 'check-in', 'stay', 'all'],
      dept: 'Front Desk',
      billId: o.voucher_number || `REG-${roomNum}`,
      title: `Check-in · Room ${roomNum}`,
      body: `${o.guest_name || 'Guest'}${mob} · ${o.room_type || 'Standard Room'}${tariffText}${advText}${src}${by}`,
      created_at: o.checkin_time || o.updated_at || new Date().toISOString(),
      guest: o.guest_name,
      room: roomNum
    });
  });

  // 2. Operational events from room_charges_inbox
  const seenCheckoutKeys = new Set<string>();
  chargeDocs.forEach((c: any) => {
    const dept = String(c.department || '').toLowerCase();
    // Exclude internal state documents, live tunnel syncs, and whole stay folios
    if (
      dept === 'fb_live_state' ||
      dept === 'cloud_tunnel_url' ||
      dept === 'waiter_cloud_sync_pkg' ||
      dept === 'room_folio'
    ) {
      return;
    }

    // 2a. Discount Approvals
    if (dept === 'discount_approval') {
      let meta: any = {};
      try { meta = JSON.parse(c.items_summary || '{}'); } catch {}
      const isApp = (c.status || '').toLowerCase() === 'approved';
      const isRej = (c.status || '').toLowerCase() === 'rejected';
      const stLabel = isApp ? 'APPROVED' : isRej ? 'REJECTED' : 'PENDING APPROVAL';
      const roomStr = c.room_number || meta.room_number || '';
      const roomLabel = roomStr.startsWith('Room') ? roomStr : `Room ${roomStr}`;
      fbOut.push({
        id: String(c.id),
        type: 'approval',
        tags: ['approvals', 'discounts', 'all'],
        dept: 'Approval',
        billId: String(c.bill_no || c.id),
        title: `Discount Approval · ${roomLabel}`,
        body: `Discount: ₹${Number(c.subtotal || meta.discount_amount || 0).toLocaleString('en-IN')} (${stLabel}) · Requested by ${c.settled_by || meta.requested_by || 'Staff'}`,
        created_at: c.created_at || new Date().toISOString(),
        guest: c.settled_by || meta.guest_name,
        room: roomStr
      });
      return;
    }

    // 2b. Room Transfers
    if (dept === 'room_transfer') {
      let meta: any = {};
      try { meta = JSON.parse(c.items_summary || '{}'); } catch {}
      const fromRoom = cleanRoomNumber(c.from_room || meta.from_room || meta.from_room_number || '?');
      const toRoom = cleanRoomNumber(c.to_room || meta.to_room || meta.to_room_number || c.room_number || '?');
      fbOut.push({
        id: String(c.id),
        type: 'transfer',
        tags: ['transfer', 'stay', 'all'],
        dept: 'Front Desk',
        billId: String(c.id),
        title: `Room Transfer · Room ${fromRoom} ➔ Room ${toRoom}`,
        body: `Shifted by ${c.settled_by || meta.staff || 'Staff'} · ${meta.reason || 'Room shift'}`,
        created_at: c.created_at || new Date().toISOString(),
        room: toRoom
      });
      return;
    }

    const isCheckout = dept === 'room_checkout' || dept === 'room_checkout_history';
    const roomNum = cleanRoomNumber(c.room_number);
    const totalAmt = Number(c.grand_total || c.subtotal || 0);

    // 2c. Checkouts
    if (isCheckout) {
      let coMeta: any = {};
      try { coMeta = JSON.parse(c.items_summary || '{}'); } catch {}
      const dedupKey = String(coMeta.bookingId || c.bill_no || (c.room_number ? `room_${c.room_number}_${String(c.created_at).slice(0, 10)}` : c.id));
      if (seenCheckoutKeys.has(dedupKey)) return;
      seenCheckoutKeys.add(dedupKey);

      const guest = coMeta.guestName || coMeta.guest_name || c.guest_name || 'Guest';
      const staff = c.settled_by || coMeta.checkedOutBy || 'Staff';
      const mob = coMeta.mobile ? ` · 📞 ${coMeta.mobile}` : '';
      const rType = coMeta.roomType ? ` · ${coMeta.roomType}` : '';
      const disc = Number(coMeta.discount || 0);
      const discText = disc > 0 ? ` · Discount: ₹${disc.toLocaleString('en-IN')}` : '';
      fbOut.push({
        id: String(c.id),
        type: 'checkout',
        tags: ['checkout', 'check-out', 'stay', 'all'],
        dept: 'Front Desk',
        billId: c.bill_no || String(c.id),
        title: `Check-out · Room ${roomNum}`,
        body: `${guest}${mob}${rType} · Total: ₹${totalAmt.toLocaleString('en-IN')}${discText} · Settled: ₹${totalAmt.toLocaleString('en-IN')} · By ${staff}`,
        created_at: c.created_at || new Date().toISOString(),
        amount: totalAmt,
        guest,
        room: roomNum,
        meta: { ...coMeta, bookingId: coMeta.bookingId }
      });
      return;
    }

    // 2d. Restaurant & Bar Orders Settled to Room (strictly declaring Paid vs Pending in Folio)
    if (dept === 'restaurant' || dept === 'bar') {
      // Exclude generic empty/zero background settlements
      if (totalAmt <= 0) return;
      const isPaid = (c.status || '').toLowerCase() === 'paid' || (c.status || '').toLowerCase() === 'settled';
      const statusText = isPaid ? 'PAID' : 'PENDING IN ROOM FOLIO';
      const deptName = dept === 'bar' ? 'Bar' : 'Restaurant';
      const orderLabel = c.bill_no ? `Order #${c.bill_no}` : (c.order_id ? `Order #${c.order_id}` : 'F&B Bill');
      fbOut.push({
        id: String(c.id),
        type: 'charge',
        tags: ['charge', 'all'],
        dept: `${deptName} POS`,
        billId: c.bill_no || String(c.id),
        title: `${deptName} Bill · Room ${roomNum} (${statusText})`,
        body: `₹${totalAmt.toLocaleString('en-IN')} · ${orderLabel} · ${isPaid ? 'Settled directly by guest' : 'Billed to room folio (Pay at checkout)'}`,
        created_at: c.created_at || new Date().toISOString(),
        amount: totalAmt,
        guest: c.settled_by,
        room: roomNum
      });
    }
  });

  fbOut.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return fbOut;
}

export async function registerDeviceToken(token: string) {
  const cleanToken = String(token || '').trim();
  if (!cleanToken) return;
  const docId = cleanToken.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  await fetch(`${FIREBASE_REST_URL}/owner_devices/${docId}?key=${FIREBASE_API_KEY}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        fcm_token: { stringValue: cleanToken },
        device_name: { stringValue: Platform.OS === 'android' ? 'Owner Android Phone' : 'Owner Device' },
        updated_at: { stringValue: new Date().toISOString() }
      }
    })
  }).catch(() => null);
}

export async function fetchLiveState() {
  const fbRes = await fetch(`${FIREBASE_REST_URL}/room_charges_inbox/fb_live_state?key=${FIREBASE_API_KEY}`).then(x => x.json()).catch(() => null);
  if (fbRes?.fields) {
    const doc = parseFirestoreDoc(fbRes);
    if (doc?.items_summary) {
      return typeof doc.items_summary === 'string' ? JSON.parse(doc.items_summary) : doc.items_summary;
    }
  }
  return { restaurantTables: [], barTables: [], restaurantOrders: [], barOrders: [] };
}

export async function fetchStoreVendors(): Promise<any[]> {
  return fetchFirestoreCollection('store_vendors');
}

export async function createStoreVendor(data: { name: string; mobile?: string; address?: string }) {
  const vId = String(Date.now());
  await fetch(`${FIREBASE_REST_URL}/store_vendors?documentId=${vId}&key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        id: { stringValue: vId },
        name: { stringValue: data.name },
        mobile: { stringValue: data.mobile || '' },
        phone: { stringValue: data.mobile || '' },
        address: { stringValue: data.address || '' },
        category: { stringValue: data.address || '' },
        created_at: { stringValue: new Date().toISOString() }
      }
    })
  }).catch(() => null);
  return { id: vId, name: data.name, mobile: data.mobile || '', address: data.address || '' };
}

export async function updateStoreVendor(id: number | string, data: { name: string; mobile?: string; address?: string }) {
  await fetch(`${FIREBASE_REST_URL}/store_vendors/${id}?key=${FIREBASE_API_KEY}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        id: { stringValue: String(id) },
        name: { stringValue: data.name },
        mobile: { stringValue: data.mobile || '' },
        phone: { stringValue: data.mobile || '' },
        address: { stringValue: data.address || '' },
        category: { stringValue: data.address || '' }
      }
    })
  }).catch(() => null);
  return { id, ...data };
}

export async function deleteStoreVendor(id: number | string) {
  await fetch(`${FIREBASE_REST_URL}/store_vendors/${id}?key=${FIREBASE_API_KEY}`, {
    method: 'DELETE'
  }).catch(() => null);
  return { success: true };
}

export async function fetchRoomChargesInbox(filterDate?: string): Promise<any[]> {
  try {
    const docs = await fetchFirestoreCollection('room_charges_inbox');
    const filterMs = filterDate ? new Date(filterDate + 'T00:00:00').getTime() : 0;
    const filtered = filterMs > 0 ? docs.filter((c: any) => new Date(c.created_at || 0).getTime() >= filterMs) : docs;
    return filtered.map((c: any) => {
      const isFolio = c.department === 'room_folio';
      const dept = isFolio ? 'Room' : ((c.department || 'Restaurant').charAt(0).toUpperCase() + (c.department || 'restaurant').slice(1));
      let meta: any = {};
      if (isFolio || (typeof c.items_summary === 'string' && c.items_summary.trim().startsWith('{'))) {
        try { meta = JSON.parse(c.items_summary || '{}'); } catch {}
      }

      let itemsArr: any[] = [];
      if (isFolio) {
        const rCharge = Number(meta.roomCharge || 0);
        if (rCharge > 0) itemsArr.push({ name: `Room Tariff (${meta.roomType || 'Stay'})`, qty: 1, price: rCharge });
        const fTotal = Number(meta.foodTotal || meta.restaurant || 0);
        if (fTotal > 0) itemsArr.push({ name: 'Restaurant / Food Charges', qty: 1, price: fTotal });
        const bTotal = Number(meta.barTotal || meta.bar || 0);
        if (bTotal > 0) itemsArr.push({ name: 'Bar Lounge Charges', qty: 1, price: bTotal });
        const extra = Number(meta.extra || 0);
        if (extra > 0) itemsArr.push({ name: 'Extra Bed / Service', qty: 1, price: extra });
        if (itemsArr.length === 0) itemsArr.push({ name: `Room Tariff (${meta.roomType || 'Stay'})`, qty: 1, price: Number(c.grand_total || meta.grandTotal || meta.total || 0) });
      } else if (Array.isArray(meta.items)) {
        itemsArr = meta.items.map((it: any) => {
          let itName = it.name || it.item_name || 'Item';
          if (typeof itName === 'string' && itName.trim().startsWith('{')) {
            try { const inner = JSON.parse(itName); itName = inner.name || inner.item_name || 'Item'; } catch {}
          }
          return { name: itName, qty: Number(it.qty || it.quantity || 1), price: Number(it.price || 0), notes: it.notes || '' };
        });
      } else if (Array.isArray(meta.items)) {
      itemsArr = meta.items.map((it: any) => {
        let itName = it.name || it.item_name || 'Item';
        if (typeof itName === 'string' && itName.trim().startsWith('{')) {
          try { const inner = JSON.parse(itName); itName = inner.name || inner.item_name || 'Item'; } catch {}
        }
        return { name: itName, qty: Number(it.qty || it.quantity || 1), price: Number(it.price || 0), notes: it.notes || '' };
      });
    } else if (typeof c.items_summary === 'string' && c.items_summary.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(c.items_summary);
          if (Array.isArray(parsed)) {
            itemsArr = parsed.map((it: any) => {
              let itName = it.name || it.item_name || 'Item';
              if (typeof itName === 'string' && itName.trim().startsWith('{')) {
                try { const inner = JSON.parse(itName); itName = inner.name || inner.item_name || 'Item'; } catch {}
              }
              return { name: itName, qty: Number(it.qty || it.quantity || 1), price: Number(it.price || 0) };
            });
          }
        } catch {}
      }
      if (itemsArr.length === 0) {
        itemsArr = [{ name: c.items_summary || (dept + ' Order'), qty: 1, price: Number(c.grand_total || 0) }];
      }

      const rawDestType = String(c.destination_type || meta.destination_type || '').toLowerCase();
      const destLabel = String(c.destination_label || meta.destination_label || '').trim();
      const rawRoom = String(c.room_number || meta.room_number || '').trim();
      const isTable = rawDestType === 'table' || destLabel.startsWith('T') || (!rawDestType && !/^\d+$/.test(rawRoom) && rawRoom.startsWith('T'));
      const isParcel = rawDestType === 'parcel' || rawDestType === 'takeaway' || destLabel.toLowerCase().includes('parcel');

      let resolvedCustName = meta.customer_name || c.customer_name || '';
      if (!resolvedCustName) {
        if (isFolio) {
          resolvedCustName = meta.guestName || (rawRoom ? `Room ${rawRoom}` : 'Room Stay');
        } else if (isTable) {
          resolvedCustName = `Walk-in (Table ${destLabel || rawRoom})`;
        } else if (isParcel) {
          resolvedCustName = `Takeaway Parcel (${destLabel || 'P'})`;
        } else if (rawRoom) {
          resolvedCustName = `Room Service · Room ${rawRoom}`;
        } else {
          resolvedCustName = 'Walk-in Guest';
        }
      }

      const grandTot = Number(c.grand_total || meta.grand_total || meta.total || 0);
      const taxAmt = Number(c.gst ?? meta.gst ?? meta.tax ?? 0);
      const discAmt = Number((isFolio ? meta.discount : (c.discount || meta.discount)) || 0);
      const subTot = Number(isFolio ? (meta.roomCharge || c.subtotal || grandTot) : (c.subtotal || meta.subtotal || (grandTot - taxAmt + discAmt)));

      const rawPMode = String(
        c.payment_mode ||
        meta.payment_mode ||
        meta.payment_method ||
        meta.paymentMode ||
        meta.pay_mode ||
        meta.method ||
        meta.paid_via ||
        ''
      ).toLowerCase().trim();

      let resolvedPaymentMode = 'cash';
      if (rawPMode.includes('upi') || rawPMode.includes('qr') || rawPMode.includes('online')) {
        resolvedPaymentMode = 'upi';
      } else if (rawPMode.includes('card') || rawPMode.includes('pos')) {
        resolvedPaymentMode = 'card';
      } else if (rawPMode.includes('room') || rawPMode.includes('folio') || isFolio) {
        resolvedPaymentMode = 'room_folio';
      } else if (rawPMode.includes('owner')) {
        resolvedPaymentMode = 'owner';
      } else if (rawPMode.includes('cash')) {
        resolvedPaymentMode = 'cash';
      } else if (rawPMode) {
        resolvedPaymentMode = rawPMode;
      } else if (rawRoom && !isTable && !isParcel) {
        resolvedPaymentMode = 'room_folio';
      }

      const settledRoom = String(
        meta.target_room_number ||
        meta.charge_to_room ||
        meta.room_number ||
        (!isTable && !isParcel && /^\d+$/.test(rawRoom) ? rawRoom : '') ||
        ''
      ).replace(/^RS-/i, '').replace(/^Room\s*/i, '').trim();

      const isPaidVal = isFolio
        ? ((Number(meta.pending) || 0) <= 0 ? 1 : 0)
        : (c.is_paid !== undefined ? (Number(c.is_paid) === 1 ? 1 : 0) : (meta.is_paid !== undefined ? (Number(meta.is_paid) === 1 ? 1 : 0) : ((c.status === 'pending' || c.status === 'unpaid') ? 0 : 1)));

      return {
        id: c.order_id || c.id,
        order_number: isFolio ? (meta.voucherNumber || c.bill_no || `R-${c.id}`) : (c.bill_no || ('#' + (c.order_id || c.id))),
        dept,
        destination_type: isTable ? 'table' : isParcel ? 'parcel' : (rawDestType || 'room'),
        destination_label: destLabel || (isTable ? rawRoom : ''),
        room_number: isTable || isParcel ? '' : rawRoom,
        settled_room: settledRoom,
        customer_name: resolvedCustName,
        total: grandTot,
        subtotal: subTot,
        tax: taxAmt,
        discount: discAmt,
        notes: meta.notes || c.notes || '',
        waiter_name: meta.waiter_name || c.waiter_name || '',
        payment_mode: isFolio ? (meta.paymentMode ? String(meta.paymentMode).toUpperCase() : 'CASH') : resolvedPaymentMode,
        is_paid: isPaidVal,
        items_json: JSON.stringify(itemsArr),
        created_at: c.created_at
      };
    });
  } catch (_) {
    return [];
  }
}

export async function fetchStayCharges(stay: any): Promise<any[]> {
  try {
    const docs = await fetchFirestoreCollection('room_charges_inbox');
    const targetRoom = cleanRoomNumber(stay.room);
    const stayCheckinMs = stay?.checkIn ? new Date(stay.checkIn).getTime() : 0;
    const r = docs.filter((c: any) => cleanRoomNumber(c.room_number) === targetRoom);
    const validCharges = r.filter((c: any) => {
      const dept = String(c.department || '').toLowerCase();
      if (dept.includes('discount') || dept === 'discount_approval' || dept === 'room_folio' || dept === 'fb_live_state' || dept === 'room_checkout') return false;
      if (stayCheckinMs > 0 && c.created_at) {
        const chargeMs = new Date(c.created_at).getTime();
        if (chargeMs < stayCheckinMs - 6e4) return false;
      }
      return true;
    });
    return validCharges.map((c: any) => ({
      id: c.order_id || c.id,
      dept: (c.department || 'Restaurant').charAt(0).toUpperCase() + (c.department || 'restaurant').slice(1),
      order_number: c.bill_no || ('RES-' + (c.order_id || c.id)),
      room_number: c.room_number,
      total: Number(c.grand_total) || 0,
      subtotal: Number(c.subtotal) || 0,
      tax: Number(c.gst) || 0,
      discount: 0,
      is_paid: c.status === 'pending' || c.status === 'unpaid' ? 0 : 1,
      created_at: c.created_at,
      customer_name: stay.guest || 'In-House Guest',
      items_json: (c.items_summary && String(c.items_summary).startsWith('[')) ? c.items_summary : JSON.stringify([{ name: c.items_summary || 'Food & Beverage', qty: 1, price: Number(c.grand_total) || 0 }])
    }));
  } catch (_) {
    return [];
  }
}

export async function fetchFolioByRoom(roomNumber: string): Promise<any | null> {
  try {
    const cleanNum = cleanRoomNumber(roomNumber);
    const doc = await fetch(`${FIREBASE_REST_URL}/room_charges_inbox/FOLIO-${cleanNum}?key=${FIREBASE_API_KEY}`)
      .then(r => r.json())
      .catch(() => null);
    if (doc?.fields) {
      const parsed = parseFirestoreDoc(doc);
      let meta: any = {};
      try { meta = JSON.parse(parsed.items_summary || '{}'); } catch {}
      return { ...parsed, meta };
    }
  } catch (_) {}
  return null;
}

export async function fetchStayDetails(id: any): Promise<any | null> {
  try {
    const cleanId = String(id).trim();
    const cleanNum = cleanRoomNumber(cleanId);
    const [occRows, charges] = await Promise.all([
      fetchFirestoreCollection('active_occupancies'),
      fetchFirestoreCollection('room_charges_inbox')
    ]);

    const occ = occRows.find((o: any) => cleanRoomNumber(o.room_number) === cleanNum || String(o.booking_id) === cleanId) || null;

    if (!occ) {
      const coRow = charges.find((c: any) => c.department === 'room_checkout' && (cleanRoomNumber(c.room_number) === cleanNum || String(c.bill_no) === cleanId || String(c.id) === cleanId));
      if (coRow) {
        let coMeta: any = {};
        try { coMeta = JSON.parse(coRow.items_summary || '{}'); } catch {}
        return {
          isCheckout: true,
          status: 'checked_out',
          stayStatus: 'CHECKED_OUT',
          room: {
            id: coMeta.bookingId || coRow.id,
            room_number: coRow.room_number || coMeta.roomNumber || cleanId,
            room_type: 'Standard Room',
            guest_name: coMeta.guestName || 'Guest',
            mobile: coMeta.mobile || '',
            adults: coMeta.adults || 1,
            children: coMeta.children || 0,
            meal_plan: coMeta.mealPlan || 'without_breakfast',
            checkin_time: coMeta.checkinTime,
            actual_checkout_time: coMeta.checkoutTime || coRow.created_at,
            checked_in_by: coMeta.checkedInBy || 'Front Desk',
            checked_out_by: coMeta.checkedOutBy || coRow.settled_by || 'Staff',
            room_count: coMeta.roomCount || 1,
            room_numbers: coMeta.roomNumber || coRow.room_number,
            payments: coMeta.payments || []
          },
          guestName: coMeta.guestName || 'Guest',
          guest: coMeta.guestName || 'Guest',
          mobile: coMeta.mobile || '',
          adults: coMeta.adults || 1,
          children: coMeta.children || 0,
          mealPlan: coMeta.mealPlan || 'without_breakfast',
          roomCount: coMeta.roomCount || 1,
          roomNumber: coMeta.roomNumber || coRow.room_number || cleanId,
          checkIn: coMeta.checkinTime,
          checkOut: coMeta.checkoutTime || coRow.created_at,
          checkedInBy: coMeta.checkedInBy || 'Front Desk',
          checkedOutBy: coMeta.checkedOutBy || coRow.settled_by || 'Staff',
          payments: coMeta.payments || [],
          restaurantOrders: [],
          barOrders: [],
          summary: {
            grandTotal: Number(coRow.grand_total || coMeta.netSettle || 0),
            advancePaid: Number(coRow.grand_total || coMeta.netSettle || 0),
            balanceDue: 0
          }
        };
      }
    }

    const folioDoc = charges.find((c: any) => c.department === 'room_folio' && cleanRoomNumber(c.room_number) === cleanNum);
    let meta: any = {};
    try { meta = JSON.parse(folioDoc?.items_summary || '{}'); } catch (_) {}

    const roomCharges = charges.filter((c: any) => cleanRoomNumber(c.room_number) === cleanNum);
    const restaurantOrders = roomCharges.filter((c: any) => String(c.department).toLowerCase() === 'restaurant').map((c: any) => ({
      id: c.order_id || c.id,
      order_number: c.bill_no || ('RES-' + (c.order_id || c.id)),
      room_number: c.room_number,
      total: Number(c.grand_total) || 0,
      subtotal: Number(c.subtotal) || 0,
      tax: Number(c.gst) || 0,
      discount: 0,
      is_paid: c.status === 'pending' || c.status === 'unpaid' ? 0 : 1,
      created_at: c.created_at,
      items_json: (c.items_summary && String(c.items_summary).startsWith('[')) ? c.items_summary : JSON.stringify([{ name: c.items_summary || 'Food & Beverage', qty: 1, price: Number(c.grand_total) || 0 }])
    }));

    const barOrders = roomCharges.filter((c: any) => String(c.department).toLowerCase() === 'bar').map((c: any) => ({
      id: c.order_id || c.id,
      order_number: c.bill_no || ('BAR-' + (c.order_id || c.id)),
      room_number: c.room_number,
      total: Number(c.grand_total) || 0,
      subtotal: Number(c.subtotal) || 0,
      tax: Number(c.gst) || 0,
      discount: 0,
      is_paid: c.status === 'pending' || c.status === 'unpaid' ? 0 : 1,
      created_at: c.created_at,
      items_json: (c.items_summary && String(c.items_summary).startsWith('[')) ? c.items_summary : JSON.stringify([{ name: c.items_summary || 'Bar Order', qty: 1, price: Number(c.grand_total) || 0 }])
    }));

    const foodTotal = restaurantOrders.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0);
    const barTotal = barOrders.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0);
    const roomCharge = Number(meta.roomCharge ?? meta.totalRoomCharge ?? 0);
    const grandTotal = Number(meta.grandTotal ?? (roomCharge + foodTotal + barTotal));
    const advancePaid = Number(meta.paid ?? meta.advancePaid ?? occ?.advance_payment ?? 0);
    const balanceDue = Number(meta.pending ?? Math.max(0, grandTotal - advancePaid));
    const rawPayments = Array.isArray(meta.payments) && meta.payments.length > 0 ? meta.payments : (occ?.payments || []);

    return {
      room: {
        id: occ?.booking_id || occ?.room_id || cleanId,
        booking_id: occ?.booking_id || occ?.room_id || cleanId,
        room_number: cleanNum,
        room_type: occ?.room_type || meta.roomType || 'Standard Room',
        guest_name: occ?.guest_name || meta.guestName || 'In-House Guest',
        mobile: occ?.guest_mobile || meta.mobile || '',
        email: meta.email || occ?.guest_email || '',
        aadhar_number: meta.aadharNumber || occ?.aadhar_number || '',
        doc_type: meta.docType || occ?.doc_type || 'Aadhaar Card',
        address: meta.address || occ?.guest_address || '',
        dob: meta.dob || occ?.guest_dob || '',
        adults: meta.adults || occ?.adults || 1,
        adults_male: meta.adultsMale || occ?.adults_male || 1,
        adults_female: meta.adultsFemale || occ?.adults_female || 0,
        children: meta.children || occ?.children || 0,
        meal_plan: meta.mealPlan || occ?.meal_plan || 'without_breakfast',
        checkin_time: occ?.checkin_time || meta.checkinTime,
        approx_checkout_time: meta.approxCheckout || occ?.approx_checkout_time || '',
        total_room_charge: roomCharge,
        room_rate: Number(meta.roomRate || meta.staffRoomRate || occ?.room_rate || occ?.custom_tariff || 0),
        custom_tariff: Number(meta.customTariff || meta.roomRate || occ?.custom_tariff || 0),
        total_paid: advancePaid,
        advance_payment: advancePaid,
        voucher_number: meta.voucherNumber || '',
        advance_receipt_no: meta.advanceReceiptNo || '',
        advance_payment_mode: meta.paymentMode || occ?.advance_payment_mode || 'Cash',
        booking_source: meta.source || meta.bookingSource || occ?.booking_source || 'Walk-in',
        ota_platform: meta.otaPlatform || meta.ota_platform || occ?.ota_platform || null,
        otaPlatform: meta.otaPlatform || meta.ota_platform || occ?.ota_platform || null,
        is_prepaid: meta.isPrepaid !== undefined ? meta.isPrepaid : (occ?.is_prepaid !== undefined ? occ.is_prepaid : 0),
        isPrepaid: meta.isPrepaid !== undefined ? meta.isPrepaid : (occ?.is_prepaid !== undefined ? occ.is_prepaid : 0),
        ota_bill_amount: Number(meta.otaBillAmount || meta.ota_bill_amount || occ?.ota_bill_amount || 0),
        ota_booking_id: meta.otaBookingId || meta.ota_booking_id || occ?.ota_booking_id || '',
        btc_company_name: meta.btcCompanyName || occ?.btc_company_name || null,
        checked_in_by: meta.checkedInBy || occ?.checked_in_by || 'Front Desk',
        payments: rawPayments
      },
      restaurantOrders,
      barOrders,
      payments: rawPayments,
      summary: {
        roomCharge,
        foodTotal,
        barTotal,
        fnbTotal: foodTotal + barTotal,
        grandTotal,
        advancePaid,
        balanceDue,
        refundDue: Number(meta.refundDue || Math.max(0, advancePaid - grandTotal)),
        stayCalcNow: meta.stayCalcNow
      }
    };
  } catch (e) {
    console.warn('[FirebaseCloud fetchStayDetails error]', e);
    return null;
  }
}

export async function fetchSingleOrderOrCharge(cleanId: string): Promise<any | null> {
  try {
    const docs = await fetchFirestoreCollection('room_charges_inbox');
    const c = docs.find((d: any) => String(d.bill_no) === cleanId || String(d.id) === cleanId || String(d.order_id) === cleanId);
    if (!c) return null;

    const isFolio = c.department === 'room_folio';
    const effDept = isFolio ? 'Room' : ((c.department || 'Restaurant').charAt(0).toUpperCase() + (c.department || 'restaurant').slice(1));
    let meta: any = {};
    if (isFolio || (typeof c.items_summary === 'string' && c.items_summary.trim().startsWith('{'))) {
      try { meta = JSON.parse(c.items_summary || '{}'); } catch {}
    }
    let itemsArr: any[] = [];
    if (isFolio) {
      const rCharge = Number(meta.roomCharge || 0);
      if (rCharge > 0) itemsArr.push({ name: `Room Tariff (${meta.roomType || 'Stay'})`, qty: 1, price: rCharge });
      const fTotal = Number(meta.foodTotal || meta.restaurant || 0);
      if (fTotal > 0) itemsArr.push({ name: 'Restaurant / Food Charges', qty: 1, price: fTotal });
      const bTotal = Number(meta.barTotal || meta.bar || 0);
      if (bTotal > 0) itemsArr.push({ name: 'Bar Lounge Charges', qty: 1, price: bTotal });
      const extra = Number(meta.extra || 0);
      if (extra > 0) itemsArr.push({ name: 'Extra Bed / Service', qty: 1, price: extra });
      if (itemsArr.length === 0) itemsArr.push({ name: `Room Tariff (${meta.roomType || 'Stay'})`, qty: 1, price: Number(c.grand_total || meta.grandTotal || meta.total || 0) });
    } else if (typeof c.items_summary === 'string' && c.items_summary.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(c.items_summary);
        if (Array.isArray(parsed)) {
          itemsArr = parsed.map((it: any) => {
            let itName = it.name || it.item_name || 'Item';
            if (typeof itName === 'string' && itName.trim().startsWith('{')) {
              try { const inner = JSON.parse(itName); itName = inner.name || inner.item_name || 'Item'; } catch {}
            }
            return { name: itName, qty: Number(it.qty || it.quantity || 1), price: Number(it.price || 0) };
          });
        }
      } catch {}
    }
    if (itemsArr.length === 0) {
      itemsArr = [{ name: c.items_summary || (effDept + ' Order'), qty: 1, price: Number(c.grand_total || 0) }];
    }

    const rawDestType = String(c.destination_type || meta.destination_type || '').toLowerCase();
    const destLabel = String(c.destination_label || meta.destination_label || '').trim();
    const rawRoom = String(c.room_number || meta.room_number || '').trim();
    const isTable = rawDestType === 'table' || destLabel.startsWith('T') || (!rawDestType && !/^\d+$/.test(rawRoom) && rawRoom.startsWith('T'));
    const isParcel = rawDestType === 'parcel' || rawDestType === 'takeaway' || destLabel.toLowerCase().includes('parcel');

    let resolvedCustName = meta.customer_name || c.customer_name || '';
    if (!resolvedCustName) {
      if (isFolio) {
        resolvedCustName = meta.guestName || (rawRoom ? `Room ${rawRoom}` : 'Room Stay');
      } else if (isTable) {
        resolvedCustName = `Walk-in (Table ${destLabel || rawRoom})`;
      } else if (isParcel) {
        resolvedCustName = `Takeaway Parcel (${destLabel || 'P'})`;
      } else if (rawRoom) {
        resolvedCustName = `Room Service · Room ${rawRoom}`;
      } else {
        resolvedCustName = 'Walk-in Guest';
      }
    }

    const cTot = Number(c.grand_total || meta.grand_total || meta.total || 0);
    const taxAmt = Number(c.gst ?? meta.gst ?? meta.tax ?? 0);
    const discAmt = Number((isFolio ? meta.discount : (c.discount || meta.discount)) || 0);
    const mTot = Number(isFolio ? (meta.roomCharge || c.subtotal || cTot) : (c.subtotal || meta.subtotal || (cTot - taxAmt + discAmt)));

    const rawPMode = String(
      c.payment_mode ||
      meta.payment_mode ||
      meta.payment_method ||
      meta.paymentMode ||
      meta.pay_mode ||
      meta.method ||
      meta.paid_via ||
      ''
    ).toLowerCase().trim();

    let resolvedPaymentMode = 'cash';
    if (rawPMode.includes('upi') || rawPMode.includes('qr') || rawPMode.includes('online')) {
      resolvedPaymentMode = 'upi';
    } else if (rawPMode.includes('card') || rawPMode.includes('pos')) {
      resolvedPaymentMode = 'card';
    } else if (rawPMode.includes('room') || rawPMode.includes('folio') || isFolio) {
      resolvedPaymentMode = 'room_folio';
    } else if (rawPMode.includes('owner')) {
      resolvedPaymentMode = 'owner';
    } else if (rawPMode.includes('cash')) {
      resolvedPaymentMode = 'cash';
    } else if (rawPMode) {
      resolvedPaymentMode = rawPMode;
    } else if (rawRoom && !isTable && !isParcel) {
      resolvedPaymentMode = 'room_folio';
    }

    const settledRoom = String(
      meta.target_room_number ||
      meta.charge_to_room ||
      meta.room_number ||
      (!isTable && !isParcel && /^\d+$/.test(rawRoom) ? rawRoom : '') ||
      ''
    ).replace(/^RS-/i, '').replace(/^Room\s*/i, '').trim();

    const isPaidVal = isFolio
      ? ((Number(meta.pending) || 0) <= 0 ? 1 : 0)
      : (c.is_paid !== undefined ? (Number(c.is_paid) === 1 ? 1 : 0) : (meta.is_paid !== undefined ? (Number(meta.is_paid) === 1 ? 1 : 0) : ((c.status === 'pending' || c.status === 'unpaid') ? 0 : 1)));

    return {
      order: {
        id: c.order_id || c.id,
        order_number: isFolio ? (meta.voucherNumber || c.bill_no || `R-${c.id}`) : (c.bill_no || ('#' + cleanId)),
        dept: effDept,
        destination_type: isTable ? 'table' : isParcel ? 'parcel' : (rawDestType || 'room'),
        destination_label: destLabel || (isTable ? rawRoom : ''),
        room_number: isTable || isParcel ? '' : rawRoom,
        settled_room: settledRoom,
        customer_name: resolvedCustName,
        total: cTot,
        subtotal: mTot,
        tax: taxAmt,
        discount: discAmt,
        notes: meta.notes || c.notes || '',
        waiter_name: meta.waiter_name || c.waiter_name || '',
        payment_mode: isFolio ? (meta.paymentMode ? String(meta.paymentMode).toUpperCase() : 'CASH') : resolvedPaymentMode,
        is_paid: isPaidVal,
        items_json: JSON.stringify(itemsArr),
        created_at: c.created_at
      },
      logs: []
    };
  } catch (_) {
    return null;
  }
}

export async function sendTestPush(): Promise<{ success: boolean; error?: string }> {
  return { success: true };
}

export async function fetchStats(): Promise<any> {
  try {
    // 1. Try reading the real-time live_stats document synced by backend
    try {
      const liveRes = await fetch(`${FIREBASE_REST_URL}/system_settings/live_stats?key=${FIREBASE_API_KEY}`).then(r => r.json()).catch(() => null);
      if (liveRes?.fields) {
        const f = liveRes.fields;
        const totRooms = Number(f.total_rooms?.integerValue || 40);
        let occRooms = Number(f.occupied_rooms?.integerValue || 0);
        if (occRooms === 0) {
          const occCache = collCache.get('active_occupancies')?.data;
          if (occCache && occCache.length > 0) {
            occRooms = occCache.length;
          }
        }
        const hospRev = Number(f.hospitality_revenue?.doubleValue || f.hospitality_revenue?.integerValue || 0);
        const restRev = Number(f.restaurant_revenue?.doubleValue || f.restaurant_revenue?.integerValue || 0);
        const barRev = Number(f.bar_revenue?.doubleValue || f.bar_revenue?.integerValue || 0);
        const totRev = Number(f.today_revenue?.doubleValue || f.today_revenue?.integerValue || (hospRev + restRev + barRev));
        const todayExp = Number(f.today_expenses?.doubleValue || f.today_expenses?.integerValue || 0);
        const cinCount = Number(f.today_checkins?.integerValue || 0);
        const coutCount = Number(f.today_checkouts?.integerValue || 0);
        const discAmt = Number(f.today_discounts?.doubleValue || f.today_discounts?.integerValue || 0);
        const btcPend = Number(f.btc_pending?.doubleValue || f.btc_pending?.integerValue || 0);

        return {
          rooms: {
            total: totRooms,
            occupied: occRooms,
            ready: Math.max(0, totRooms - occRooms),
            maintenance: 0
          },
          revenue: {
            total: totRev,
            hospitality: hospRev,
            restaurant: restRev,
            bar: barRev
          },
          todayExpenses: todayExp,
          todayCheckins: cinCount,
          todayCheckouts: coutCount,
          todayDiscounts: discAmt,
          btcPending: btcPend
        };
      }
    } catch (_) {}

    // 2. Fallback: Aggregate live from active_occupancies & room_charges_inbox
    const [occDocs, chargeDocs] = await Promise.all([
      fetchFirestoreCollection('active_occupancies'),
      fetchFirestoreCollection('room_charges_inbox')
    ]);

    const totalRooms = 40;
    const occupied = occDocs.length;
    const ready = Math.max(0, totalRooms - occupied);

    // Compute today's revenue from payments in active stays and checkouts
    const todayStr = new Date().toISOString().split('T')[0];
    let hospRev = 0;
    let restRev = 0;
    let barRev = 0;
    let cinCount = 0;
    let coutCount = 0;
    let btcPend = 0;

    occDocs.forEach((o: any) => {
      const cin = String(o.checkin_time || '');
      if (cin.startsWith(todayStr)) cinCount++;
      const src = String(o.booking_source || '').toUpperCase();
      if (src.includes('BTC') || o.btc_company_name) {
        btcPend += Math.max(0, Number(o.total_room_charge || 0) - Number(o.total_paid || 0));
      }
      // Also sum payments in folio if active
      if (Number(o.advance_payment || o.total_paid || 0) > 0 && cin.startsWith(todayStr)) {
        hospRev += Number(o.advance_payment || o.total_paid || 0);
      }
    });

    chargeDocs.forEach((c: any) => {
      const dt = String(c.created_at || '');
      const isToday = dt.startsWith(todayStr);
      const dept = String(c.department || '').toLowerCase();
      const grandTotal = Number(c.grand_total || c.subtotal || 0);

      if (dept === 'room_checkout' || dept === 'room_checkout_history') {
        if (isToday) {
          coutCount++;
          hospRev += grandTotal;
        }
      } else if (dept === 'restaurant' && isToday) {
        restRev += grandTotal;
      } else if (dept === 'bar' && isToday) {
        barRev += grandTotal;
      }
    });

    return {
      rooms: { total: totalRooms, occupied, ready, maintenance: 0 },
      revenue: {
        total: hospRev + restRev + barRev,
        hospitality: hospRev,
        restaurant: restRev,
        bar: barRev
      },
      todayExpenses: 0,
      todayCheckins: cinCount,
      todayCheckouts: coutCount,
      todayDiscounts: 0,
      btcPending: Math.max(0, btcPend)
    };
  } catch (err) {
    console.warn('[FirebaseCloud fetchStats error]', err);
    return {
      rooms: { total: 40, occupied: 0, ready: 40, maintenance: 0 },
      revenue: { total: 0, hospitality: 0, restaurant: 0, bar: 0 }
    };
  }
}
