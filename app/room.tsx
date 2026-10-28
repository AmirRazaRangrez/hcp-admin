import {
  buildGuestRegistrationHTML,
  buildGuestPaymentSummaryHTML,
  buildGuestActivitiesSummaryHTML,
  buildFinalBillA4HTML,
  wrapFullA4Html,
  formatTaxInvoiceNumber,
  cleanVoucherNumber
} from '../src/lib/crmPrintTemplates';
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Platform, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { api } from '../src/api/client';
import { Screen, Card, Badge, useLoad, memCache, clearCache } from '../src/lib/ui';
import { c, money, when, cleanRoomNumber, formatDT } from '../src/lib/theme';
import { BillCard, BillSheet } from '../src/lib/billsheet';
import {
  UserIcon,
  PhoneIcon,
  HotelIcon,
  CreditCardIcon,
  RestaurantIcon,
  ClockIcon,
  CheckoutIcon
} from '../src/lib/icons';

const DetailRow = ({ label, value, bold, color, onPress }: any) => {
  if (value === undefined || value === null || value === '') return null;
  const content = (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, bold && styles.detailValueBold, color ? { color } : null]}>
        {value}
      </Text>
    </View>
  );
  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }
  return content;
};

function getPaymentStageNote(p: any, idx: number, checkInTime?: string): { label: string; bg: string; color: string; border: string } {
  const type = String(p?.payment_type || p?.type || '').toLowerCase();
  const notes = String(p?.notes || p?.purpose || '').toLowerCase();

  if (
    type.includes('checkout') ||
    type.includes('settle') ||
    notes.includes('checkout') ||
    notes.includes('check-out') ||
    notes.includes('settlement') ||
    notes.includes('final')
  ) {
    return {
      label: 'for checkout',
      bg: '#ECFDF5',
      color: '#059669',
      border: '#A7F3D0'
    };
  }

  if (
    notes.includes('in-stay') ||
    notes.includes('while staying') ||
    notes.includes('during stay') ||
    type === 'fnb_settlement'
  ) {
    return {
      label: 'while staying',
      bg: '#FEF3C7',
      color: '#D97706',
      border: '#FDE68A'
    };
  }

  if (
    notes.includes('checkin') ||
    notes.includes('check-in') ||
    notes.includes('advance at checkin')
  ) {
    return {
      label: 'for check in',
      bg: '#EFF6FF',
      color: '#2563EB',
      border: '#BFDBFE'
    };
  }

  // If first payment and advance
  if (idx === 0 && (type === 'advance' || !type)) {
    return {
      label: 'for check in',
      bg: '#EFF6FF',
      color: '#2563EB',
      border: '#BFDBFE'
    };
  }

  // If timestamp is more than 15 minutes after check-in
  if (checkInTime && (p?.created_at || p?.date)) {
    try {
      const pTime = new Date(p.created_at || p.date).getTime();
      const cTime = new Date(checkInTime).getTime();
      if (!isNaN(pTime) && !isNaN(cTime) && (pTime - cTime > 15 * 60 * 1000)) {
        return {
          label: 'while staying',
          bg: '#FEF3C7',
          color: '#D97706',
          border: '#FDE68A'
        };
      }
    } catch (_) {}
  }

  return {
    label: idx > 0 ? 'while staying' : 'for check in',
    bg: idx > 0 ? '#FEF3C7' : '#EFF6FF',
    color: idx > 0 ? '#D97706' : '#2563EB',
    border: idx > 0 ? '#FDE68A' : '#BFDBFE'
  };
}

function buildCrmPayload(s: any, bills: any[]) {
  const r = s?.raw || {};
  const restaurantOrders = (bills || []).filter((b: any) => {
    const t = String(b.type || b.department || b.dept || '').toLowerCase();
    return t.includes('rest') || t.includes('food') || t.includes('f&b');
  });
  const barOrders = (bills || []).filter((b: any) => {
    const t = String(b.type || b.department || b.dept || '').toLowerCase();
    return t.includes('bar') || t.includes('liquor');
  });

  const checkinTime = s?.checkIn || r.checkin_time || r.check_in || new Date().toISOString();
  const checkoutTime = s?.checkOut || s?.approxCheckOut || r.actual_checkout_time || r.checkout_time || r.approx_checkout_time || '';

  let stayNights = 1;
  try {
    const d1 = new Date(checkinTime);
    const d2 = checkoutTime ? new Date(checkoutTime) : new Date();
    const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    stayNights = Math.max(1, diff);
  } catch {}

  const voucherNo = s?.voucherNumber || r.voucher_number || r.voucher_no || (s?.id ? `260920-${s.id}` : '260920-001');
  const invoiceNo = formatTaxInvoiceNumber(voucherNo);

  const roomCharge = Number(s?.roomCharge || r.total_room_charge || r.room_charge || 0);
  const foodTotal = restaurantOrders.reduce((sum: number, o: any) => sum + (Number(o.total || o.amount) || 0), 0) || Number(s?.restaurant || r.food_total || 0);
  const barTotal = barOrders.reduce((sum: number, o: any) => sum + (Number(o.total || o.amount) || 0), 0) || Number(s?.bar || r.bar_total || 0);
  const extraBedCharge = Number(s?.extra || r.extra_bed_charge || 0);
  const discountAmount = Number(s?.discount || r.discount_amount || 0);
  const taxAmount = Number(r.tax_amount || Math.round(roomCharge * 0.05));
  const grandTotal = Number(s?.total || s?.grandTotal || r.grand_total || (roomCharge + foodTotal + barTotal + extraBedCharge));
  const paid = Number(s?.paid || r.advance_amount || r.total_paid || 0);
  const pending = Math.max(0, grandTotal - paid);
  const tariffSubtotal = Number(s?.tariffSubtotal || r.room_rate || (discountAmount > 0 ? (roomCharge + discountAmount) : roomCharge));

  const payments = Array.isArray(r.payments) && r.payments.length > 0
    ? r.payments
    : (paid > 0 ? [{
        id: s?.id || 1,
        receipt_no: s?.advanceReceiptNo || r.advance_receipt_no || (voucherNo ? `RCP-${voucherNo}` : 'RCP-001'),
        amount: paid,
        payment_mode: s?.paymentMode || r.advance_payment_mode || 'Cash',
        created_at: checkinTime,
        cashier: s?.checkedInBy || r.checked_in_by || 'Cashier_1',
        purpose: 'paid while checkin : checkin',
        utr_number: r.advance_utr_number || r.online_utr || ''
      }] : []);

  return {
    ...r,
    ...s,
    room: r,
    isOccupiedStay: true,
    stayStatus: 'OCCUPIED',
    stayNights,
    guestName: s?.guest || r.guest_name || 'Valued Guest',
    guest_name: s?.guest || r.guest_name || 'Valued Guest',
    roomNumber: s?.room || r.room_number,
    room_number: s?.room || r.room_number,
    room_numbers: s?.room || r.room_number,
    roomType: s?.roomType || r.room_type || 'Executive Deluxe',
    room_type: s?.roomType || r.room_type || 'Executive Deluxe',
    bookingSource: s?.source || r.booking_source || 'Walk-in',
    booking_source: s?.source || r.booking_source || 'Walk-in',
    otaPlatform: r.ota_platform,
    ota_platform: r.ota_platform,
    otaBookingId: r.ota_booking_id || r.ota_voucher_no,
    ota_voucher_no: r.ota_booking_id || r.ota_voucher_no,
    voucherNumber: voucherNo,
    voucher_number: voucherNo,
    voucher_no: voucherNo,
    invoiceNo,
    invoice_no: invoiceNo,
    checkIn: checkinTime,
    checkinTime,
    checkin_time: checkinTime,
    checkOut: checkoutTime,
    checkoutTime,
    checkout_time: checkoutTime,
    mobile: s?.mobile || r.mobile || r.guest_phone || '',
    phone: s?.mobile || r.mobile || r.guest_phone || '',
    email: s?.email || s?.guest_email || r.email || r.guest_email || '',
    guest_email: s?.email || s?.guest_email || r.email || r.guest_email || '',
    address: s?.address || r.address || 'Solapur',
    dob: s?.dob || r.dob || '',
    checkedInBy: s?.checkedInBy || r.checked_in_by || 'Cashier_1',
    checked_in_by: s?.checkedInBy || r.checked_in_by || 'Cashier_1',
    mealPlan: s?.mealPlan || r.meal_plan || 'EP (Room Only)',
    meal_plan: s?.mealPlan || r.meal_plan || 'EP (Room Only)',
    docType: s?.docType || s?.doc_type || r.doc_type || r.docType || 'Aadhaar Card',
    doc_type: s?.docType || s?.doc_type || r.doc_type || r.docType || 'Aadhaar Card',
    aadharNumber: s?.aadharNumber || s?.aadhar_number || s?.id_number || r.aadhar_number || r.id_number || '',
    aadhar_number: s?.aadharNumber || s?.aadhar_number || s?.id_number || r.aadhar_number || r.id_number || '',
    id_number: s?.aadharNumber || s?.aadhar_number || s?.id_number || r.aadhar_number || r.id_number || '',
    docFront: r.doc_front || r.id_front || r.front_image || '',
    docBack: r.doc_back || r.id_back || r.back_image || '',
    guestPhoto: r.guest_photo || r.photo || r.live_photo || '',
    roomMembers: r.room_members || r.companions || [],
    roomCharge,
    room_charge: roomCharge,
    foodTotal,
    food_total: foodTotal,
    barTotal,
    bar_total: barTotal,
    extraBedCharge,
    extra_bed_charge: extraBedCharge,
    discountAmount,
    discount_amount: discountAmount,
    taxAmount,
    tax_amount: taxAmount,
    grandTotal,
    grand_total: grandTotal,
    advancePaid: paid,
    totalPaid: paid,
    total_paid: paid,
    paid,
    balanceDue: pending,
    pending,
    payments,
    restaurantOrders,
    barOrders
  };
}

export default function RoomDetails() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    room?: string;
    guest?: string;
    total?: string;
    paid?: string;
    phone?: string;
    bookingId?: string;
    isCheckout?: string;
    checkoutId?: string;
  }>();
  const cleanRoomParam = cleanRoomNumber(params.room);
  const id = cleanRoomParam || params.room || params.id;
  const isCheckoutParam = params.isCheckout === 'true' || params.isCheckout === '1';
  const [openBill, setOpenBill] = useState<any>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: stayData, err, busy, at, reload } = useLoad(async () => {
    const targetRoomNum = cleanRoomParam || cleanRoomNumber(params.room || id);
    const cleanId = String(targetRoomNum || id || '').trim().toLowerCase();

    // 0. Checkout View Bypass:
    // When viewing a checked-out / available room, NEVER call api.roomFolio(id) because
    // roomFolio is strictly for active rooms and numeric IDs can clash with SQLite internal room IDs!
    if (isCheckoutParam || String(id).startsWith('CO-') || String(id).startsWith('out:')) {
      let paramPayments: any[] = [];
      try {
        if ((params as any).payments) {
          const parsed = JSON.parse((params as any).payments);
          if (Array.isArray(parsed)) paramPayments = parsed;
        }
      } catch (_) {}

      // 0a. Check in-memory cache first (populated by available.tsx / activity.tsx)
      if (targetRoomNum && memCache?.get) {
        const cached = memCache.get('room:' + targetRoomNum)?.d;
        if (cached && (cached.guest || cached.guestName)) {
          return {
            isCheckout: true,
            ...cached,
            room: targetRoomNum,
            roomNumber: targetRoomNum,
            payments: (Array.isArray(cached.payments) && cached.payments.length > 0) ? cached.payments : paramPayments
          };
        }
      }

      // 0b. Try fetching from live CRM / cloud tunnel API if bookingId is known
      const targetBookingId = (params as any).bookingId || (!isNaN(Number(id)) && Number(id) < 5000 ? id : null);
      if (targetBookingId) {
        try {
          const b = await api.booking(targetBookingId);
          if (b && (b.guest_name || b.guest) && (b.actual_checkout_time || b.payments)) {
            const rTotal = Number(b.total_room_charge || b.grand_total || b.total || 0);
            const rPaid = Number(b.total_paid || b.paid || b.advance_payment || rTotal);
            const bPayments = Array.isArray(b.payments) && b.payments.length > 0 ? b.payments : paramPayments;
            return {
              isCheckout: true,
              id: String(b.id || targetBookingId),
              bookingId: b.id,
              room: cleanRoomNumber(b.room_number || targetRoomNum || id),
              roomNumber: cleanRoomNumber(b.room_number || targetRoomNum || id),
              guest: b.guest_name || b.guest || 'Valued Guest',
              guestName: b.guest_name || b.guest || 'Valued Guest',
              mobile: b.mobile || '',
              adults: Number((b.adults_male || 0) + (b.adults_female || 0) + (b.adults_other || 0)) || 1,
              children: Number(b.children || 0),
              mealPlan: b.meal_plan || 'without_breakfast',
              roomCount: Number(b.room_count || 1),
              checkIn: b.checkin_time || b.created_at,
              checkOut: b.actual_checkout_time || b.checkout_time || new Date().toISOString(),
              checkoutTime: b.actual_checkout_time || b.checkout_time || new Date().toISOString(),
              checkedInBy: b.checked_in_by || 'Front Desk',
              checkedOutBy: b.checked_out_by || 'Staff',
              total: rTotal,
              paid: rPaid,
              pending: 0,
              payments: bPayments,
              source: b.booking_source || 'Front Desk',
              roomCharge: Number(b.total_room_charge || rTotal)
            };
          }
        } catch (_) {}
      }

      // 0c. Query Firebase Firestore / Supabase for checkout record of THIS room
      try {
        const targetRoom = targetRoomNum || String(params.room || id).replace(/^out:/, '').replace(/^in:/, '').trim();
        const cleanRoom = cleanRoomNumber(targetRoom);

        // 1. Check Firebase Firestore direct doc first
        try {
          const FIREBASE_REST_URL = 'https://firestore.googleapis.com/v1/projects/hotelcitypark-crm/databases/(default)/documents';
          const FIREBASE_API_KEY = 'AIzaSyCtZnkdk1_q8rWrISnD8P2Rhi-jcPn1QTI';
          const fbRes = await fetch(`${FIREBASE_REST_URL}/room_charges_inbox/co_${encodeURIComponent(cleanRoom)}?key=${FIREBASE_API_KEY}`).then(r => r.json()).catch(() => null);
          if (fbRes?.fields) {
            const f = fbRes.fields;
            let meta: any = {};
            try { meta = JSON.parse(f.items_summary?.stringValue || '{}'); } catch {}
            const grandTotal = Number(f.grand_total?.doubleValue || f.grand_total?.integerValue || meta.netSettle || meta.total || 0);
            const fbPayments = Array.isArray(meta.payments) && meta.payments.length > 0 ? meta.payments : paramPayments;
            return {
              isCheckout: true,
              id: String(f.id?.stringValue || `co_${cleanRoom}`),
              room: targetRoom,
              roomNumber: targetRoom,
              guest: meta.guestName || meta.guest_name || f.guest_name?.stringValue || params.guest || 'Valued Guest',
              guestName: meta.guestName || meta.guest_name || f.guest_name?.stringValue || params.guest || 'Valued Guest',
              mobile: meta.mobile || f.guest_mobile?.stringValue || params.phone || '',
              adults: Number(meta.adults || 1),
              children: Number(meta.children || 0),
              mealPlan: meta.mealPlan || 'without_breakfast',
              roomCount: Number(meta.roomCount || 1),
              checkIn: meta.checkinTime || meta.checkin_time || f.created_at?.stringValue,
              checkOut: meta.checkoutTime || meta.checkout_time || f.created_at?.stringValue,
              checkoutTime: meta.checkoutTime || meta.checkout_time || f.created_at?.stringValue,
              checkedInBy: meta.checkedInBy || 'Front Desk',
              checkedOutBy: meta.checkedOutBy || f.settled_by?.stringValue || 'Staff',
              total: grandTotal,
              paid: grandTotal,
              pending: 0,
              payments: fbPayments,
              source: meta.source || 'Front Desk',
              roomCharge: Number(f.subtotal?.doubleValue || f.subtotal?.integerValue || grandTotal),
              restaurant: 0,
              bar: 0,
              extra: 0,
              discount: 0
            };
          }
        } catch (_) {}

        // 2. Query Firebase Firestore room_charges_inbox collection for matching checkout
        try {
          const FIREBASE_REST_URL = 'https://firestore.googleapis.com/v1/projects/hotelcitypark-crm/databases/(default)/documents';
          const FIREBASE_API_KEY = 'AIzaSyCtZnkdk1_q8rWrISnD8P2Rhi-jcPn1QTI';
          const listRes = await fetch(`${FIREBASE_REST_URL}/room_charges_inbox?key=${FIREBASE_API_KEY}&pageSize=50`).then(r => r.json()).catch(() => null);
          if (listRes?.documents && Array.isArray(listRes.documents)) {
            const matchDoc = listRes.documents.find((d: any) => {
              const dept = d.fields?.department?.stringValue;
              const rNum = d.fields?.room_number?.stringValue || '';
              const docName = String(d.name?.split('/').pop() || '');
              if (dept !== 'room_checkout') return false;
              if (docName === `co_${cleanRoom}` || docName === `checkout_${cleanRoom}`) return true;
              if (rNum === cleanRoom || rNum === targetRoom) return true;
              if (rNum.split(',').map((x: any) => cleanRoomNumber(x)).includes(cleanRoom)) return true;
              return false;
            });
            if (matchDoc?.fields) {
              const f = matchDoc.fields;
              let meta: any = {};
              try { meta = JSON.parse(f.items_summary?.stringValue || '{}'); } catch {}
              const grandTotal = Number(f.grand_total?.doubleValue || f.grand_total?.integerValue || meta.netSettle || meta.total || 0);
              const listPayments = Array.isArray(meta.payments) && meta.payments.length > 0 ? meta.payments : paramPayments;
              return {
                isCheckout: true,
                id: String(matchDoc.name?.split('/').pop() || f.id?.stringValue || `co_${cleanRoom}`),
                room: targetRoom,
                roomNumber: targetRoom,
                guest: meta.guestName || meta.guest_name || f.guest_name?.stringValue || params.guest || 'Valued Guest',
                guestName: meta.guestName || meta.guest_name || f.guest_name?.stringValue || params.guest || 'Valued Guest',
                mobile: meta.mobile || f.guest_mobile?.stringValue || params.phone || '',
                adults: Number(meta.adults || 1),
                children: Number(meta.children || 0),
                mealPlan: meta.mealPlan || 'without_breakfast',
                roomCount: Number(meta.roomCount || 1),
                checkIn: meta.checkinTime || meta.checkin_time || f.created_at?.stringValue,
                checkOut: meta.checkoutTime || meta.checkout_time || f.created_at?.stringValue,
                checkoutTime: meta.checkoutTime || meta.checkout_time || f.created_at?.stringValue,
                checkedInBy: meta.checkedInBy || 'Front Desk',
                checkedOutBy: meta.checkedOutBy || f.settled_by?.stringValue || 'Staff',
                total: grandTotal,
                paid: grandTotal,
                pending: 0,
                payments: listPayments,
                source: meta.source || 'Front Desk',
                roomCharge: Number(f.subtotal?.doubleValue || f.subtotal?.integerValue || grandTotal),
                restaurant: 0,
                bar: 0,
                extra: 0,
                discount: 0
              };
            }
          }
        } catch (_) {}
      } catch (cloudErr) {
        console.warn('Firebase checkout fetch notice:', cloudErr);
      }

      // 0d. Fallback for checked-out room from params
      const pTotal = Number(params.total || params.paid || 0);
      const pPaid = Number(params.paid || pTotal);
      return {
        isCheckout: true,
        id: String((params as any).bookingId || id),
        room: targetRoomNum || String(params.room || id),
        roomNumber: targetRoomNum || String(params.room || id),
        guest: params.guest || 'Valued Guest',
        guestName: params.guest || 'Valued Guest',
        mobile: params.phone || '',
        total: pTotal,
        paid: pPaid,
        pending: 0,
        payments: paramPayments,
        source: 'Front Desk',
        checkIn: new Date().toISOString(),
        checkOut: new Date().toISOString(),
        checkoutTime: new Date().toISOString()
      };
    }

    // 1. For Active In-House Rooms:
    // Check in-memory cache
    let found: any = null;
    try {
      const cachedRoom = memCache?.get ? memCache.get('room:' + cleanId)?.d : null;
      if (cachedRoom) found = cachedRoom;
      if (!found && memCache?.get) {
        const occCached = memCache.get('occupied')?.d;
        if (Array.isArray(occCached)) {
          found = occCached.find((x: any) =>
            String(x.room || '').trim().toLowerCase() === cleanId ||
            String(x.id || '').trim().toLowerCase() === cleanId ||
            String(x.booking_id || '').trim().toLowerCase() === cleanId
          );
        }
      }
    } catch (_) {}

    // Live CRM room folio for active in-house room
    try {
      const folio = await api.roomFolio(cleanRoomParam || id);
      if (folio && (folio.room || folio.isCheckout)) {
        // Validation: Ensure folio room matches requested target room
        const fetchedRoom = cleanRoomNumber(
          folio.roomNumber ||
          folio.room_number ||
          folio.room?.room_number ||
          folio.room?.room_numbers ||
          folio.room?.roomNumber ||
          (typeof folio.room === 'string' || typeof folio.room === 'number' ? folio.room : '')
        );
        if (cleanRoomParam && fetchedRoom && fetchedRoom !== cleanRoomParam) {
          console.warn(`[Room Details] Folio room (${fetchedRoom}) does not match requested room (${cleanRoomParam}). Ignoring mismatched active folio.`);
        } else if (folio.isCheckout) {
          const fr = folio.room || {};
          return {
            isCheckout: true,
            id: String(fr.id || id),
            room: String(folio.roomNumber || folio.room || fr.room_numbers || fr.room_number || id),
            roomNumber: String(folio.roomNumber || folio.room || fr.room_numbers || fr.room_number || id),
            guest: fr.guest_name || folio.guest || folio.guestName || 'Valued Guest',
            guestName: fr.guest_name || folio.guest || folio.guestName || 'Valued Guest',
            mobile: fr.mobile || folio.mobile || params.phone || '',
            adults: Number(fr.adults || folio.adults || 1),
            children: Number(fr.children ?? folio.children ?? 0),
            mealPlan: fr.meal_plan || folio.mealPlan || 'without_breakfast',
            roomCount: Number(fr.room_count || folio.roomCount || 1),
            checkIn: fr.checkin_time || folio.checkIn || new Date().toISOString(),
            checkOut: fr.actual_checkout_time || folio.checkOut || new Date().toISOString(),
            checkoutTime: fr.actual_checkout_time || folio.checkOut || new Date().toISOString(),
            checkedInBy: fr.checked_in_by || folio.checkedInBy || 'Front Desk',
            checkedOutBy: fr.checked_out_by || folio.checkedOutBy || 'Staff',
            payments: folio.payments || fr.payments || [],
            total: Number(folio.summary?.grandTotal ?? folio.total ?? 0),
            paid: Number(folio.summary?.advancePaid ?? folio.paid ?? 0),
            pending: 0,
            transferHistory: folio.transferHistory || fr.transferHistory || fr.transfer_history || [],
            raw: fr
          };
        } else {
          const fr = folio.room;
          const fs = folio.summary || {};
          const mergedOrders = [
            ...(folio.restaurantOrders || []).map((o: any) => ({ ...o, dept: 'Restaurant' })),
            ...(folio.barOrders || []).map((o: any) => ({ ...o, dept: 'Bar' }))
          ];

          const sc = fs.stayCalcDeclared || fs.stayCalcNow || null;
          const roomCharge = Number(sc?.roomCharge ?? fs.roomCharge ?? fr.total_room_charge ?? (found?.roomCharge || 0));
          const foodTotal = Number(fs.foodTotal ?? sc?.fnbTotal ?? (found?.restaurant || 0));
          const barTotal = Number(fs.barTotal ?? (found?.bar || 0));
          const extra = Number(fs.hotelExtrasCharge ?? fs.extra ?? (found?.extra || 0));
          const discount = Number(sc?.discountAmount ?? fs.discountAmount ?? fs.discount ?? (found?.discount || 0));
          const tariffSubtotal = Number(sc?.baseRoomTotal ?? sc?.baseRoomTariff ?? (roomCharge + discount));
          const total = Number(sc?.grandTotal ?? fs.grandTotal ?? (roomCharge + foodTotal + barTotal + extra - discount));
          const paid = Number(fs.advancePaid ?? sc?.paid ?? fr.total_paid ?? (found?.paid || 0));
          const refundDue = Number(sc?.refundDue ?? (paid > total ? paid - total : 0));
          const pending = Number(sc?.balanceDue ?? fs.balanceDue ?? (total > paid ? total - paid : 0));

          return {
            isCheckout: isCheckoutParam,
            ...(found || {}),
            id: String(fr.id || fr.booking_id || id),
            room: cleanRoomNumber(fr.room_number || id),
            roomNumber: cleanRoomNumber(fr.room_number || id),
            roomType: fr.room_type || folio.roomType || found?.roomType || 'Executive Room',
            room_type: fr.room_type || folio.roomType || found?.roomType || 'Executive Room',
            guest: fr.guest_name || found?.guest || 'In-House Guest',
            guestName: fr.guest_name || found?.guest || 'In-House Guest',
            mobile: fr.mobile || found?.mobile || '',
            email: fr.email || found?.email || '',
            aadharNumber: fr.aadhar_number || found?.aadharNumber || '',
            aadhar_number: fr.aadhar_number || found?.aadhar_number || '',
            docType: fr.doc_type || found?.docType || 'Aadhaar Card',
            doc_type: fr.doc_type || found?.doc_type || 'Aadhaar Card',
            address: fr.address || found?.address || '',
            dob: fr.dob || found?.dob || '',
            adults: Number(fr.adults || (Number(fr.adults_male || 0) + Number(fr.adults_female || 0)) || found?.adults || 1),
            adults_male: fr.adults_male ?? found?.adults_male ?? 1,
            adults_female: fr.adults_female ?? found?.adults_female ?? 0,
            children: Number(fr.children ?? found?.children ?? 0),
            checkIn: (() => {
              return fr.checkin_time || found?.checkIn || new Date().toISOString();
            })(),
            checkOut: (() => {
              let exp = fr.approx_checkout_time || fr.expected_checkout_time || fr.checkout_time || found?.approxCheckOut || found?.checkOut || '';
              if (!exp) {
                const cin = fr.checkin_time || found?.checkIn;
                if (cin) {
                  try {
                    const dIn = new Date(String(cin).includes('T') ? cin : String(cin).replace(' ', 'T') + '+05:30').getTime();
                    if (!isNaN(dIn)) exp = new Date(dIn + 24 * 3600 * 1000).toISOString();
                  } catch (_) {}
                }
              }
              return exp;
            })(),
            approxCheckOut: (() => {
              let exp = fr.approx_checkout_time || fr.expected_checkout_time || fr.checkout_time || found?.approxCheckOut || found?.checkOut || '';
              if (!exp) {
                const cin = fr.checkin_time || found?.checkIn;
                if (cin) {
                  try {
                    const dIn = new Date(String(cin).includes('T') ? cin : String(cin).replace(' ', 'T') + '+05:30').getTime();
                    if (!isNaN(dIn)) exp = new Date(dIn + 24 * 3600 * 1000).toISOString();
                  } catch (_) {}
                }
              }
              return exp;
            })(),
            restaurant: foodTotal,
            bar: barTotal,
            extra,
            discount,
            total,
            tariffSubtotal,
            paid,
            pending,
            refundDue,
            source: fr.booking_source || found?.source || 'Walk-in',
            checkedInBy: fr.checked_in_by || found?.checkedInBy || 'Front Desk',
            mealPlan: fr.meal_plan || found?.mealPlan || 'EP (Room Only)',
            voucherNumber: fr.voucher_number || found?.voucherNumber || '',
            advanceReceiptNo: fr.advance_receipt_no || found?.advanceReceiptNo || '',
            paymentMode: fr.advance_payment_mode || found?.paymentMode || 'Cash',
            folioRestaurantOrders: folio.restaurantOrders || [],
            folioBarOrders: folio.barOrders || [],
            folioOrders: mergedOrders,
            folioExtraExpenses: folio.extraExpenses || folio.expenses || fr.extraExpenses || fr.expenses || [],
            payments: folio.payments || [],
            transferHistory: folio.transferHistory || fr.transferHistory || fr.transfer_history || (fr.extension_logs_json ? (() => { try { return JSON.parse(fr.extension_logs_json).filter((l: any) => l.type === 'room_transfer'); } catch (_) { return []; } })() : (found?.transferHistory || [])),
            raw: fr
          };
        }
      }
    } catch (e) {
      console.warn('[Room Details] live folio fetch error:', e);
    }

    // Return cached room immediately if folio was not reachable
    if (found) {
      if (!found.transferHistory && found.raw?.extension_logs_json) {
        try {
          found.transferHistory = JSON.parse(found.raw.extension_logs_json).filter((l: any) => l.type === 'room_transfer');
        } catch (_) {}
      }
      return found;
    }

    // 2. Fallback: fetch from api.occupied()
    try {
      const list = await api.occupied();
      found = list.find((x: any) =>
        String(x.id || '').trim().toLowerCase() === cleanId ||
        String(x.room || '').trim().toLowerCase() === cleanId ||
        String(x.room_number || '').trim().toLowerCase() === cleanId ||
        String(x.booking_id || '').trim().toLowerCase() === cleanId
      );
      if (found) return found;
    } catch {}

    // 3. Fallback: query params passed from parent view
    if (params.guest || params.total || params.room || isCheckoutParam) {
      const pTotal = Number(params.total || params.paid || 0);
      const pPaid = Number(params.paid || pTotal);
      return {
        isCheckout: isCheckoutParam,
        id: String(params.bookingId || id),
        room: String(params.room || id),
        roomNumber: String(params.room || id),
        guest: String(params.guest || 'Valued Guest'),
        guestName: String(params.guest || 'Valued Guest'),
        mobile: String(params.phone || ''),
        email: '',
        address: '',
        dob: '',
        checkIn: (params as any).checkIn || found?.checkIn || new Date().toISOString(),
        checkOut: (() => {
          let exp = (params as any).checkOut || (params as any).approxCheckOut || found?.approxCheckOut || found?.checkOut || '';
          if (!exp) {
            try {
              const cin = (params as any).checkIn || found?.checkIn || new Date().toISOString();
              const dIn = new Date(String(cin).includes('T') ? cin : String(cin).replace(' ', 'T') + '+05:30').getTime();
              if (!isNaN(dIn)) exp = new Date(dIn + 24 * 3600 * 1000).toISOString();
            } catch (_) {}
          }
          return exp;
        })(),
        approxCheckOut: (() => {
          let exp = (params as any).approxCheckOut || (params as any).checkOut || found?.approxCheckOut || found?.checkOut || '';
          if (!exp) {
            try {
              const cin = (params as any).checkIn || found?.checkIn || new Date().toISOString();
              const dIn = new Date(String(cin).includes('T') ? cin : String(cin).replace(' ', 'T') + '+05:30').getTime();
              if (!isNaN(dIn)) exp = new Date(dIn + 24 * 3600 * 1000).toISOString();
            } catch (_) {}
          }
          return exp;
        })(),
        checkoutTime: (params as any).checkOut || (params as any).approxCheckOut || '',
        roomCharge: pTotal,
        restaurant: 0,
        bar: 0,
        extra: 0,
        discount: 0,
        total: pTotal,
        paid: pPaid,
        pending: isCheckoutParam ? 0 : Math.max(0, pTotal - pPaid),
        source: 'Front Desk',
        checkedInBy: 'Front Desk',
        checkedOutBy: 'Staff',
        mealPlan: 'Without Breakfast',
        voucherNumber: '',
        advanceReceiptNo: '',
        paymentMode: 'Cash',
        payments: pPaid > 0 ? [{
          amount: pPaid,
          mode: 'Settled',
          date: new Date().toISOString(),
          cashier: 'Staff'
        }] : []
      };
    }

    throw new Error(`Room ${id} details could not be found.`);
  }, [id], 'room:' + id);

  const s: any = stayData;

  const { data: ordersData, busy: ordersBusy, reload: reloadOrders } = useLoad(
    async () => {
      if (!s) return [];
      if (s?.folioOrders && s.folioOrders.length > 0) return s.folioOrders;
      if (s?.folioRestaurantOrders || s?.folioBarOrders) {
        return [
          ...(s.folioRestaurantOrders || []).map((o: any) => ({ ...o, dept: 'Restaurant' })),
          ...(s.folioBarOrders || []).map((o: any) => ({ ...o, dept: 'Bar' }))
        ];
      }
      return [];
    },
    [s?.id, s?.room, s?.folioOrders?.length, s?.folioRestaurantOrders?.length, s?.folioBarOrders?.length],
    'roomOrders:' + (s?.id || id || '')
  );

  const bills: any[] = (ordersData as any) || [];

  const handleCall = (mobile: string) => {
    if (!mobile) return;
    Linking.openURL(`tel:${mobile}`).catch(() => {});
  };

  const printHtmlDocumentWeb = (htmlContent: string, title?: string) => {
    if (typeof document === 'undefined') return;
    const fullHtml = wrapFullA4Html(htmlContent, title);

    let iframe = document.getElementById('admin-print-iframe') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'admin-print-iframe';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.zIndex = '-9999';
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);
    }

    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) {
      const printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.open();
        printWin.document.write(fullHtml);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => {
          printWin.print();
        }, 500);
      }
      return;
    }

    iframeDoc.open();
    iframeDoc.write(fullHtml);
    iframeDoc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.warn('[Print iframe error]', e);
      }
    }, 400);
  };

  const handleDownloadDoc = async (type: 'checkin' | 'info' | 'payment' | 'activities' | 'invoice') => {
    if (!s) return;
    try {
      setDownloading(type);
      let html = '';
      let docTitle = '';
      let fileName = '';

      const payload = buildCrmPayload(s, bills);

      if (type === 'checkin') {
        html = buildGuestRegistrationHTML(payload, { includePhotos: false });
        docTitle = `Check-in Form - Room ${s.room}`;
        fileName = `Checkin_Form_Room_${s.room || s.id}.pdf`;
      } else if (type === 'info') {
        html = buildGuestRegistrationHTML(payload, { includePhotos: true });
        docTitle = `Stay Info - Room ${s.room}`;
        fileName = `Info_Summary_Room_${s.room || s.id}.pdf`;
      } else if (type === 'payment') {
        html = buildGuestPaymentSummaryHTML(payload);
        docTitle = `Payment Summary - Room ${s.room}`;
        fileName = `Payment_Summary_Room_${s.room || s.id}.pdf`;
      } else if (type === 'activities') {
        html = buildGuestActivitiesSummaryHTML(payload);
        docTitle = `Activities Summary - Room ${s.room}`;
        fileName = `Activities_Summary_Room_${s.room || s.id}.pdf`;
      } else if (type === 'invoice') {
        const cashierName = s.checkedInBy || 'Cashier_1';
        const invoiceRoom = {
          ...payload,
          invoice_no: payload.invoiceNo
        };
        const invoiceCalc = {
          ...payload,
          grossTariff: payload.roomCharge,
          roomCharge: payload.roomCharge,
          roomTariffNet: payload.roomCharge,
          tariffTax5Pct: payload.taxAmount,
          foodTotal: payload.foodTotal,
          barTotal: payload.barTotal,
          hotelExtrasCharge: payload.extraBedCharge,
          advancePaid: payload.paid,
          chargedDays: payload.stayNights,
          billableDays: payload.stayNights,
          discountPct: payload.discountPct || 0,
          discountAmount: payload.discountAmount,
          restaurantOrders: payload.restaurantOrders,
          barOrders: payload.barOrders
        };
        const invoiceSettlement = {
          settleAmt: payload.paid,
          refundAmt: 0,
          settled_at: payload.checkOut || new Date(),
          invoiceNo: payload.invoiceNo,
          checked_out_by: cashierName
        };
        html = buildFinalBillA4HTML(invoiceRoom, invoiceCalc, invoiceSettlement);
        docTitle = `Tax Invoice - Room ${s.room}`;
        fileName = `Tax_Invoice_Room_${s.room || s.id}.pdf`;
      }

      const fullHtml = wrapFullA4Html(html, docTitle);

      if (Platform.OS === 'web') {
        printHtmlDocumentWeb(html, docTitle);
        return;
      }

      // Android Native APK / iOS
      try {
        await Print.printAsync({ html: fullHtml });
      } catch (nativePrintErr) {
        console.warn('[Native Print] falling back to file share:', nativePrintErr);
        const file = await Print.printToFileAsync({ html: fullHtml });
        let shareUri = file.uri;
        try {
          const dest = `${FileSystem.cacheDirectory}${fileName}`;
          await FileSystem.copyAsync({ from: file.uri, to: dest });
          shareUri = dest;
        } catch {}

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(shareUri, {
            mimeType: 'application/pdf',
            dialogTitle: docTitle,
            UTI: 'com.adobe.pdf'
          });
        }
      }
    } catch (err: any) {
      Alert.alert('Download Notice', 'Unable to generate PDF: ' + err.message);
    } finally {
      setDownloading(null);
    }
  };

  const isCheckout = Boolean(
    s?.isCheckout ||
    isCheckoutParam ||
    s?.status === 'checked_out' ||
    s?.stayStatus === 'CHECKED_OUT' ||
    Boolean(s?.checkOut && s?.raw?.status === 'checked_out')
  );

  // User requirement for check out: show ONLY:
  // 1. Name
  const guestName = s?.guestName || s?.guest || s?.raw?.guest_name || 'Valued Guest';
  // 2. mob number
  const mobile = s?.mobile || s?.phone || s?.raw?.mobile || '';
  // 3. no of adults
  const adults = Number(s?.adults || s?.raw?.adults || (Number(s?.raw?.adults_male || 0) + Number(s?.raw?.adults_female || 0) + Number(s?.raw?.adults_other || 0)) || 1);
  // 4. children
  const children = Number(s?.children ?? s?.raw?.children ?? 0);
  // 5. with / withought breakfast
  const rawMealPlan = String(s?.mealPlan || s?.raw?.meal_plan || '').toLowerCase();
  const isWithBreakfast = rawMealPlan.includes('with_breakfast') || rawMealPlan.includes('with breakfast') || rawMealPlan.includes('breakfast');
  const mealPlanDisplay = isWithBreakfast ? 'With Breakfast' : 'Without Breakfast';
  // 6. number of rooms
  const roomCount = Number(s?.roomCount || s?.raw?.room_count || (Array.isArray(s?.rooms) ? s.rooms.length : (String(s?.room || s?.roomNumber || '').split(',').length || 1)));
  // 7. room number
  const roomNumberDisplay = cleanRoomNumber(String(s?.roomNumber || s?.room || (Array.isArray(s?.rooms) ? s.rooms.join(', ') : (s?.raw?.room_number || id))));
  // 8. checkin tmie
  const checkinTimeFormatted = formatDT(s?.checkIn || s?.checkinTime || s?.raw?.checkin_time);
  // 9. payment history with date & time
  const paymentsList: any[] = Array.isArray(s?.payments) && s.payments.length > 0
    ? s.payments
    : (Array.isArray(s?.raw?.payments) && s.raw.payments.length > 0
        ? s.raw.payments
        : (Number(s?.paid || s?.total || 0) > 0 ? [{
            id: s?.id || 1,
            amount: Number(s?.paid || s?.total || 0),
            payment_mode: s?.paymentMode || s?.raw?.final_settlement_mode || s?.raw?.advance_payment_mode || 'Cash',
            mode: s?.paymentMode || s?.raw?.final_settlement_mode || s?.raw?.advance_payment_mode || 'Cash',
            created_at: s?.checkIn || new Date().toISOString(),
            date: s?.checkIn || new Date().toISOString(),
            cashier_name: s?.checkedInBy || s?.checkedOutBy || 'Front Desk Staff',
            cashier: s?.checkedInBy || s?.checkedOutBy || 'Front Desk Staff',
            receipt_no: s?.advanceReceiptNo || s?.raw?.final_receipt_no || ('RCP-' + (s?.id || '001')),
            receiptNo: s?.advanceReceiptNo || s?.raw?.final_receipt_no || ('RCP-' + (s?.id || '001')),
            notes: 'paid while checkin : ' + (s?.paymentMode || 'Cash'),
            payment_type: 'advance',
            split_cash: s?.splitCash || 0,
            split_online: s?.splitOnline || 0,
            split_card: s?.splitCard || 0,
            split_cheque: s?.splitCheque || 0
          }] : []));
  const totalPaymentsPaid = paymentsList
    .filter((p: any) => !String(p.payment_type || p.type || '').toLowerCase().includes('refund'))
    .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0) || Number(s?.paid || 0);
  // 10. accept by (name of staff)
  const staffName = s?.checkedOutBy || s?.checkedInBy || s?.raw?.checked_out_by || s?.raw?.checked_in_by || 'Staff';
  // 11. checkout
  const checkoutTimeFormatted = formatDT(s?.checkOut || s?.checkoutTime || s?.raw?.actual_checkout_time || s?.raw?.checkout_time);

  return (
    <Screen
      title={
        isCheckout
          ? `Check-out · ${roomCount > 1 ? `Rooms ${roomNumberDisplay}` : `Room ${roomNumberDisplay}`}`
          : (s ? `Room ${cleanRoomNumber(s.room)}` : (params.room ? `Room ${cleanRoomNumber(params.room)}` : 'Room Details'))
      }
      subtitle={
        isCheckout
          ? `${guestName} · Completed Stay`
          : (s?.roomType || 'Stay Folio')
      }
      back={() => {
        if (Platform.OS === 'web') {
          try {
            if (typeof window !== 'undefined' && window.history && window.history.length > 1) {
              window.history.back();
              return;
            }
          } catch (_) {}
        }
        try {
          if (router.canGoBack()) {
            router.back();
            return;
          }
        } catch (_) {}
        try {
          router.replace(isCheckout ? '/(tabs)/activity' : '/occupied');
        } catch (_) {
          router.replace('/(tabs)');
        }
      }}
      reload={() => {
        try {
          const cleanId = String(id || '').trim().toLowerCase();
          clearCache('room:' + cleanId);
          clearCache('room:' + id);
          clearCache('occupied');
        } catch (_) {}
        reload();
        reloadOrders();
      }}
      at={at}
      err={err}
    >
      {s ? (
        isCheckout ? (
          /* Tailored Checkout View showing ONLY the 11 user-specified fields */
          <>
            <Card style={styles.checkoutCard}>
              <View style={styles.checkoutHeaderRow}>
                <View>
                  <Text style={styles.checkoutHeaderTitle}>
                    {roomCount > 1 ? `Rooms ${roomNumberDisplay}` : `Room ${roomNumberDisplay}`}
                  </Text>
                  <Text style={styles.checkoutHeaderSub}>Completed Stay · Check-out Details</Text>
                </View>
                <Badge text="CHECKED OUT" color="#EA580C" />
              </View>

              <View style={styles.rowDivider} />

              {/* 1. Name */}
              <DetailRow label="Name" value={guestName} bold />

              {/* 2. mob number */}
              <DetailRow
                label="Mobile Number"
                value={mobile || '—'}
                bold
                color={mobile ? c.brass : undefined}
                onPress={mobile ? () => handleCall(mobile) : undefined}
              />

              <View style={styles.rowDivider} />

              {/* 3. no of adults */}
              <DetailRow
                label="No. of Adults"
                value={`${adults} Adult${adults > 1 ? 's' : ''}`}
                bold
              />

              {/* 4. children */}
              <DetailRow
                label="Children"
                value={`${children} Child${children === 1 ? '' : 'ren'}`}
                bold
              />

              {/* 5. with / withought breakfast */}
              <DetailRow
                label="Breakfast"
                value={mealPlanDisplay}
                bold
                color={isWithBreakfast ? '#16A34A' : '#64748B'}
              />

              <View style={styles.rowDivider} />

              {/* 6. number of rooms */}
              <DetailRow
                label="Number of Rooms"
                value={`${roomCount} Room${roomCount > 1 ? 's' : ''}`}
                bold
              />

              {/* 7. room number */}
              <DetailRow
                label="Room Number"
                value={roomNumberDisplay}
                bold
              />

              <View style={styles.rowDivider} />

              {/* 8. checkin tmie */}
              <DetailRow
                label="Check-in Time"
                value={checkinTimeFormatted}
                bold
              />

              {/* 11. checkout */}
              <DetailRow
                label="Check-out Time"
                value={checkoutTimeFormatted}
                bold
                color="#EA580C"
              />

              <View style={styles.rowDivider} />

              {/* 10. accept by (name of staff) */}
              <DetailRow
                label="Accepted by (Staff)"
                value={staffName}
                bold
              />
            </Card>

            {/* 9. payment history with date & time */}
            <View style={styles.sectionHeaderRow}>
              <CreditCardIcon size={16} color={c.ink} />
              <Text style={styles.sectionTitle}>Payment History & Collections ({paymentsList.length})</Text>
            </View>

            {paymentsList.length === 0 ? (
              <Card>
                <Text style={{ color: c.mute, textAlign: 'center', paddingVertical: 12 }}>
                  No payment history records found.
                </Text>
              </Card>
            ) : (
              paymentsList.map((p: any, idx: number) => {
                const pAmt = Number(p.amount || 0);
                const pMode = String(p.mode || p.payment_mode || 'Cash').toUpperCase();
                const pDate = formatDT(p.date || p.created_at || p.realized_at || s?.checkIn);
                const pStaff = p.cashier || p.cashier_name || staffName || 'Staff';
                const pReceipt = p.receiptNo || p.receipt_no || ('RCP-' + (p.id || idx + 1));
                const isRefund = String(p.type || p.payment_type || '').toLowerCase().includes('refund') || pAmt < 0;

                const cardSurcharge = parseFloat(p.card_surcharge) || 0;
                const upiTax = parseFloat(p.upi_tax) || 0;
                const totalFee = cardSurcharge + upiTax;
                const baseAmount = p.base_amount !== undefined
                  ? parseFloat(p.base_amount)
                  : Math.max(0, pAmt - totalFee);

                let feePercentStr = '';
                if (totalFee > 0 && baseAmount > 0) {
                  const pct = (totalFee / baseAmount) * 100;
                  feePercentStr = `${pct.toFixed(1).replace(/\.0$/, '')}%`;
                }

                const stage = getPaymentStageNote(p, idx, s?.checkIn);
                const isPendingCheque = String(p.cheque_status || '').toLowerCase() === 'pending' || (pMode === 'CHEQUE' && !p.realized_at);

                return (
                  <Card key={p.id ? `pay-${p.id}` : (pReceipt || idx)} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, flex: 1, paddingRight: 8 }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: c.ink }}>
                          Receipt: {pReceipt}
                        </Text>
                        <View style={{
                          backgroundColor: stage.bg,
                          borderColor: stage.border,
                          borderWidth: 1,
                          borderRadius: 6,
                          paddingHorizontal: 8,
                          paddingVertical: 2
                        }}>
                          <Text style={{ color: stage.color, fontSize: 11, fontWeight: '700' }}>
                            {stage.label}
                          </Text>
                        </View>
                      </View>
                      <View style={{ flexShrink: 0 }}>
                        <Badge
                          text={isRefund ? 'REFUND' : (isPendingCheque ? 'PENDING' : 'REALIZED')}
                          color={isRefund ? c.bad : (isPendingCheque ? '#D97706' : c.ok)}
                        />
                      </View>
                    </View>

                    <View style={styles.rowDivider} />

                    <DetailRow label="Date & Time" value={pDate} bold />
                    <DetailRow label="Accepted By" value={pStaff} bold />
                    <DetailRow label="Payment Mode" value={pMode} bold />
                    {p.utr_number ? <DetailRow label="UTR / Ref No" value={p.utr_number} /> : null}
                    {p.cheque_no ? <DetailRow label="Cheque No" value={`${p.cheque_no} ${p.bank_name ? `(${p.bank_name})` : ''}`} /> : null}
                    {p.card_digits ? <DetailRow label="Card Digits" value={`**** **** **** ${p.card_digits}`} /> : null}

                    {totalFee > 0 ? (
                      <>
                        <DetailRow label="Amount (Without POS/MDR Fee)" value={money(baseAmount)} bold />
                        {cardSurcharge > 0 ? (
                          <DetailRow
                            label={feePercentStr ? `+ Card / POS Fee (${feePercentStr})` : '+ Card / POS Fee'}
                            value={`+ ${money(cardSurcharge)}`}
                            color="#D97706"
                            bold
                          />
                        ) : null}
                        {upiTax > 0 ? (
                          <DetailRow
                            label={feePercentStr ? `+ UPI / MDR Fee (${feePercentStr})` : '+ UPI / MDR Fee'}
                            value={`+ ${money(upiTax)}`}
                            color="#D97706"
                            bold
                          />
                        ) : null}
                        <DetailRow
                          label="Total Paid (With Fee)"
                          value={isRefund ? `- ${money(Math.abs(pAmt))}` : money(pAmt)}
                          color={isRefund ? c.bad : c.ok}
                          bold
                        />
                      </>
                    ) : (
                      <>
                        <DetailRow
                          label="Total Paid Amount"
                          value={isRefund ? `- ${money(Math.abs(pAmt))}` : money(pAmt)}
                          color={isRefund ? c.bad : c.ok}
                          bold
                        />
                        {p.split_cash > 0 && p.split_cash < pAmt ? (
                          <DetailRow label="Paid via Cash" value={money(p.split_cash)} />
                        ) : null}
                        {p.split_online > 0 && p.split_online < pAmt ? (
                          <DetailRow label="Paid via Online UPI" value={money(p.split_online)} />
                        ) : null}
                        {p.split_card > 0 && p.split_card < pAmt ? (
                          <DetailRow label="Paid via Card POS" value={money(p.split_card)} />
                        ) : null}
                        {p.split_cheque > 0 && p.split_cheque < pAmt ? (
                          <DetailRow label="Paid via Cheque" value={money(p.split_cheque)} />
                        ) : null}
                      </>
                    )}

                    {p.notes && !String(p.notes).toLowerCase().startsWith('paid while checkin : ' + String(p.payment_mode || p.mode || '').toLowerCase()) ? (
                      <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                        <Text style={{ fontSize: 11, color: c.mute, fontStyle: 'italic' }}>
                          Note: {p.notes}
                        </Text>
                      </View>
                    ) : null}
                  </Card>
                );
              })
            )}

            {paymentsList.length > 0 ? (
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#F0FDF4',
                padding: 12,
                borderRadius: 10,
                marginTop: 2,
                marginBottom: 10,
                borderWidth: 1,
                borderColor: '#BBF7D0'
              }}>
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#166534' }}>
                    Total Realized Payments ({paymentsList.length})
                  </Text>
                  <Text style={{ fontSize: 11, color: '#15803D', marginTop: 2 }}>
                    All receipts verified & realized
                  </Text>
                </View>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#15803D' }}>
                  {money(totalPaymentsPaid)}
                </Text>
              </View>
            ) : null}
          </>
        ) : (
        <>
          {/* Top Room Banner Card */}
          <Card style={styles.heroCard}>
            <View style={styles.heroHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.heroRoomNumber}>Room {cleanRoomNumber(s.room)}</Text>
                <Text style={styles.heroRoomType}>{s.roomType || 'Standard Room'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                  <ClockIcon size={13} color="#0284C7" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#0369A1' }}>
                    Expected Checkout: {s.approxCheckOut ? when(s.approxCheckOut) : (s.checkOut ? when(s.checkOut) : 'In-House')}
                  </Text>
                </View>
              </View>
              <Badge
                text={s.refundDue > 0 ? `REFUND ${money(s.refundDue)}` : (s.pending > 0 ? `DUE ${money(s.pending)}` : 'SETTLED / PAID')}
                color={s.refundDue > 0 ? c.ok : (s.pending > 0 ? c.warn : c.ok)}
              />
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatLabel}>Total Bill</Text>
                <Text style={styles.heroStatVal}>{money(s.total)}</Text>
              </View>
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatLabel}>Paid Advance</Text>
                <Text style={[styles.heroStatVal, { color: c.ok }]}>{money(s.paid)}</Text>
              </View>
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatLabel}>{s.refundDue > 0 ? 'Refund Due' : 'Due Balance'}</Text>
                <Text style={[styles.heroStatVal, { color: s.refundDue > 0 ? c.ok : (s.pending > 0 ? c.bad : c.ok) }]}>
                  {money(s.refundDue > 0 ? s.refundDue : s.pending)}
                </Text>
              </View>
            </View>
          </Card>

          {/* Room Transfer Audit Banner */}
          {Array.isArray(s.transferHistory) && s.transferHistory.length > 0 ? (
            <Card style={styles.transferCard}>
              <View style={styles.transferHeaderRow}>
                <View style={styles.transferBadge}>
                  <Text style={styles.transferBadgeText}>🔄 ROOM TRANSFERRED</Text>
                </View>
                <Text style={styles.transferCountText}>
                  {s.transferHistory.length > 1 ? `${s.transferHistory.length} Shifts` : 'Shift Log'}
                </Text>
              </View>

              {s.transferHistory.map((th: any, idx: number) => {
                const fromNum = cleanRoomNumber(th.from_room_number || th.from_room || th.from || '?');
                const toNum = cleanRoomNumber(th.to_room_number || th.to_room || th.to || s.room || '?');
                const staff = th.transferred_by || th.staff_name || th.staff || 'Staff';
                const timeStr = th.transferred_at || th.timestamp || th.created_at;
                const formattedTime = timeStr ? formatDT(timeStr) : 'Recently';
                const reason = th.reason || (th.rates_preserved ? 'Rate-preserved shift' : 'Room shift');

                return (
                  <View key={idx} style={[styles.transferItem, idx > 0 && styles.transferItemBorder]}>
                    <View style={styles.transferMainRow}>
                      <Text style={styles.transferMainText}>
                        Transferred from <Text style={styles.transferHighlight}>Room {fromNum}</Text> ➔ <Text style={styles.transferHighlight}>Room {toNum}</Text>
                      </Text>
                    </View>

                    <View style={styles.transferMetaRow}>
                      <Text style={styles.transferMetaText}>
                        👤 By: <Text style={styles.transferMetaBold}>{staff}</Text>
                      </Text>
                      <Text style={styles.transferMetaText}>
                        🕒 {formattedTime}
                      </Text>
                    </View>

                    {reason ? (
                      <View style={styles.transferReasonRow}>
                        <Text style={styles.transferReasonText}>
                          Reason: {reason}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          ) : null}

          {/* Official Folio Documents: 5 Download Buttons */}
          <View style={styles.actionSection}>
            <View style={styles.actionHeaderRow}>
              <Text style={styles.actionSectionTitle}>Official Folio Documents (PDF)</Text>
            </View>
            <View style={styles.docButtonsGrid}>
              <Pressable
                onPress={() => handleDownloadDoc('checkin')}
                disabled={downloading !== null}
                style={({ pressed }) => [styles.docBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.docBtnText}>
                  {downloading === 'checkin' ? '⏳ Generating…' : '📋 Check-In Form'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => handleDownloadDoc('info')}
                disabled={downloading !== null}
                style={({ pressed }) => [styles.docBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.docBtnText}>
                  {downloading === 'info' ? '⏳ Generating…' : '💾 Info'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => handleDownloadDoc('payment')}
                disabled={downloading !== null}
                style={({ pressed }) => [styles.docBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.docBtnText}>
                  {downloading === 'payment' ? '⏳ Generating…' : '📄 Payment Summary'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => handleDownloadDoc('activities')}
                disabled={downloading !== null}
                style={({ pressed }) => [styles.docBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.docBtnText}>
                  {downloading === 'activities' ? '⏳ Generating…' : '📑 Activities Summary'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => handleDownloadDoc('invoice')}
                disabled={downloading !== null}
                style={({ pressed }) => [styles.docBtn, styles.docBtnInvoice, pressed && { opacity: 0.85 }]}
              >
                <Text style={[styles.docBtnText, styles.docBtnInvoiceText]}>
                  {downloading === 'invoice' ? '⏳ Generating Invoice…' : '🧾 Tax Invoice'}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Section: Guest Details */}
          <View style={styles.sectionHeaderRow}>
            <UserIcon size={16} color={c.ink} />
            <Text style={styles.sectionTitle}>Guest Information</Text>
          </View>
          <Card>
            <DetailRow label="Guest Name" value={s.guest} bold />
            {s.mobile ? (
              <DetailRow
                label="Mobile Phone"
                value={s.mobile}
                color={c.brass}
                bold
                onPress={() => handleCall(s.mobile)}
              />
            ) : null}
            <DetailRow label="Email" value={s.email} />
            <DetailRow label="ID Proof Type" value={s.docType || s.doc_type || s.raw?.doc_type} />
            <DetailRow label="Aadhaar / ID No" value={s.aadharNumber || s.aadhar_number || s.raw?.aadhar_number || s.raw?.id_number} bold color={c.brass} />
            <DetailRow label="Date of Birth" value={s.dob} />
            <DetailRow label="Address" value={s.address} />
            <View style={styles.rowDivider} />
            <DetailRow
              label="Occupancy (Pax)"
              value={`${s.adults || 1} Adult(s)${s.adults_male !== undefined && s.adults_female !== undefined && (s.adults_male > 0 || s.adults_female > 0) ? ` (${s.adults_male || 0} Male, ${s.adults_female || 0} Female)` : ''}${s.children ? `, ${s.children} Child` : ''}${s.extraBeds ? `, ${s.extraBeds} Extra Bed` : ''}`}
            />
          </Card>

          {/* Section: Stay & Booking Details */}
          <View style={styles.sectionHeaderRow}>
            <HotelIcon size={16} color={c.ink} />
            <Text style={styles.sectionTitle}>Stay & Booking Details</Text>
          </View>
          <Card>
            <DetailRow label="Check-in Time" value={when(s.checkIn)} bold />
            <DetailRow
              label="Expected Checkout"
              value={(() => {
                const outVal = s.approxCheckOut || s.checkOut;
                if (outVal && outVal !== '-') return when(outVal);
                if (s.checkIn) {
                  try {
                    const dIn = new Date(String(s.checkIn).includes('T') ? s.checkIn : String(s.checkIn).replace(' ', 'T') + '+05:30').getTime();
                    if (!isNaN(dIn)) return when(new Date(dIn + 24 * 3600 * 1000).toISOString());
                  } catch (_) {}
                }
                return '-';
              })()}
            />
            <DetailRow label="Stay Duration" value={s.stayDuration || 'In-House'} />
            <DetailRow label="Booking Source" value={s.source || 'Walk-in'} bold />
            <DetailRow label="Meal Plan" value={s.mealPlan} />
            <DetailRow label="Checked-in By" value={s.checkedInBy || 'Front Desk Staff'} />
            {s.voucherNumber ? <DetailRow label="Bill No" value={s.voucherNumber} bold /> : null}
          </Card>

          {/* Section: All Receipts & Payment Collections */}
          <View style={styles.sectionHeaderRow}>
            <CreditCardIcon size={16} color={c.ink} />
            <Text style={styles.sectionTitle}>Payment History & Collections ({paymentsList.length})</Text>
          </View>

          {paymentsList.length === 0 ? (
            <Card>
              <Text style={{ color: c.mute, textAlign: 'center', paddingVertical: 12 }}>
                No payment history records found for this stay.
              </Text>
            </Card>
          ) : (
            paymentsList.map((p: any, idx: number) => {
              const pAmt = Number(p.amount || 0);
              const pMode = String(p.payment_mode || p.mode || 'Cash').toUpperCase();
              const pDate = formatDT(p.created_at || p.realized_at || p.date || s?.checkIn);
              const pCashier = p.cashier_name || p.cashier || staffName || s.checkedInBy || 'Front Desk Staff';
              const pReceipt = p.receipt_no || p.receiptNo || ('RCP-' + (p.id || idx + 1));
              const isRefund = String(p.payment_type || p.type || '').toLowerCase().includes('refund') || pAmt < 0;

              const cardSurcharge = parseFloat(p.card_surcharge) || 0;
              const upiTax = parseFloat(p.upi_tax) || 0;
              const totalFee = cardSurcharge + upiTax;
              const baseAmount = p.base_amount !== undefined
                ? parseFloat(p.base_amount)
                : Math.max(0, pAmt - totalFee);

              let feePercentStr = '';
              if (totalFee > 0 && baseAmount > 0) {
                const pct = (totalFee / baseAmount) * 100;
                feePercentStr = `${pct.toFixed(1).replace(/\.0$/, '')}%`;
              }

              const stage = getPaymentStageNote(p, idx, s?.checkIn);
              const isPendingCheque = String(p.cheque_status || '').toLowerCase() === 'pending' || (pMode === 'CHEQUE' && !p.realized_at);

              return (
                <Card key={p.id ? `pay-${p.id}` : (pReceipt || idx)} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, flex: 1, paddingRight: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: c.ink }}>
                        Receipt: {pReceipt}
                      </Text>
                      <View style={{
                        backgroundColor: stage.bg,
                        borderColor: stage.border,
                        borderWidth: 1,
                        borderRadius: 6,
                        paddingHorizontal: 8,
                        paddingVertical: 2
                      }}>
                        <Text style={{ color: stage.color, fontSize: 11, fontWeight: '700' }}>
                          {stage.label}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexShrink: 0 }}>
                      <Badge
                        text={isRefund ? 'REFUND' : (isPendingCheque ? 'PENDING' : 'REALIZED')}
                        color={isRefund ? c.bad : (isPendingCheque ? '#D97706' : c.ok)}
                      />
                    </View>
                  </View>

                  <View style={styles.rowDivider} />

                  <DetailRow label="Date & Time" value={pDate} bold />
                  <DetailRow label="Accepted By" value={pCashier} bold />
                  <DetailRow label="Payment Mode" value={pMode} bold />
                  {p.utr_number ? <DetailRow label="UTR / Ref No" value={p.utr_number} /> : null}
                  {p.cheque_no ? <DetailRow label="Cheque No" value={`${p.cheque_no} ${p.bank_name ? `(${p.bank_name})` : ''}`} /> : null}
                  {p.card_digits ? <DetailRow label="Card Digits" value={`**** **** **** ${p.card_digits}`} /> : null}

                  {totalFee > 0 ? (
                    <>
                      <DetailRow label="Amount (Without POS/MDR Fee)" value={money(baseAmount)} bold />
                      {cardSurcharge > 0 ? (
                        <DetailRow
                          label={feePercentStr ? `+ Card / POS Fee (${feePercentStr})` : '+ Card / POS Fee'}
                          value={`+ ${money(cardSurcharge)}`}
                          color="#D97706"
                          bold
                        />
                      ) : null}
                      {upiTax > 0 ? (
                        <DetailRow
                          label={feePercentStr ? `+ UPI / MDR Fee (${feePercentStr})` : '+ UPI / MDR Fee'}
                          value={`+ ${money(upiTax)}`}
                          color="#D97706"
                          bold
                        />
                      ) : null}
                      <DetailRow
                        label="Total Paid (With Fee)"
                        value={isRefund ? `- ${money(Math.abs(pAmt))}` : money(pAmt)}
                        color={isRefund ? c.bad : c.ok}
                        bold
                      />
                    </>
                  ) : (
                    <>
                      <DetailRow
                        label="Total Paid Amount"
                        value={isRefund ? `- ${money(Math.abs(pAmt))}` : money(pAmt)}
                        color={isRefund ? c.bad : c.ok}
                        bold
                      />
                      {p.split_cash > 0 && p.split_cash < pAmt ? (
                        <DetailRow label="Paid via Cash" value={money(p.split_cash)} />
                      ) : null}
                      {p.split_online > 0 && p.split_online < pAmt ? (
                        <DetailRow label="Paid via Online UPI" value={money(p.split_online)} />
                      ) : null}
                      {p.split_card > 0 && p.split_card < pAmt ? (
                        <DetailRow label="Paid via Card POS" value={money(p.split_card)} />
                      ) : null}
                      {p.split_cheque > 0 && p.split_cheque < pAmt ? (
                        <DetailRow label="Paid via Cheque" value={money(p.split_cheque)} />
                      ) : null}
                    </>
                  )}

                  {p.notes && !String(p.notes).toLowerCase().startsWith('paid while checkin : ' + String(p.payment_mode || p.mode || '').toLowerCase()) ? (
                    <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                      <Text style={{ fontSize: 11, color: c.mute, fontStyle: 'italic' }}>
                        Note: {p.notes}
                      </Text>
                    </View>
                  ) : null}
                </Card>
              );
            })
          )}

          {/* Total Realized Summary Banner */}
          {paymentsList.length > 0 ? (
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#F0FDF4',
              padding: 12,
              borderRadius: 10,
              marginTop: 2,
              marginBottom: 10,
              borderWidth: 1,
              borderColor: '#BBF7D0'
            }}>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#166534' }}>
                  Total Realized Payments ({paymentsList.length})
                </Text>
                <Text style={{ fontSize: 11, color: '#15803D', marginTop: 2 }}>
                  All receipts verified & realized
                </Text>
              </View>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#15803D' }}>
                {money(totalPaymentsPaid)}
              </Text>
            </View>
          ) : null}

          <View style={{ marginBottom: 16 }}>
            <Pressable
              onPress={() => handleDownloadDoc('payment')}
              style={({ pressed }) => [
                styles.receiptPillBtn,
                pressed && { opacity: 0.85 }
              ]}
            >
              <Text style={styles.receiptPillText}>📄 Download Payment Summary PDF</Text>
            </Pressable>
          </View>

          {/* Section: Complete Financial Summary */}
          <View style={styles.sectionHeaderRow}>
            <CreditCardIcon size={16} color={c.ink} />
            <Text style={styles.sectionTitle}>Financial & Billing Summary</Text>
          </View>
          <Card>
            {s.discount > 0 ? (
              <>
                <DetailRow label="Tariff Subtotal" value={money(s.tariffSubtotal || (s.roomCharge + s.discount))} />
                <DetailRow label="Discount Applied" value={`− ${money(s.discount)}`} color={c.ok} bold />
                <DetailRow label="Net Room Charges" value={money(s.roomCharge)} />
              </>
            ) : (
              <DetailRow label="Room Charges" value={money(s.roomCharge)} />
            )}
            <DetailRow label="Restaurant Charges" value={money(s.restaurant)} />
            <DetailRow label="Bar Lounge Charges" value={money(s.bar)} />
            {s.extra > 0 ? (
              <DetailRow label="Extra Expense (Damages/Services)" value={money(s.extra)} color={c.bad} bold />
            ) : null}

            <View style={styles.rowDivider} />

            <DetailRow label="Total Bill" value={money(s.total)} bold />
            <DetailRow label="Total Paid" value={money(s.paid)} color={c.ok} bold />
            {s.refundDue > 0 ? (
              <DetailRow
                label="Refund Due to Guest"
                value={money(s.refundDue)}
                color={c.ok}
                bold
              />
            ) : (
              <DetailRow
                label="Pending Balance Due"
                value={money(s.pending)}
                color={s.pending > 0 ? c.bad : c.ok}
                bold
              />
            )}
          </Card>

          {/* Section: Extra Expenses & Damages */}
          {Array.isArray(s.folioExtraExpenses) && s.folioExtraExpenses.length > 0 && (
            <View style={{ marginTop: 14 }}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>🛡️ Extra Expenses & Damages ({s.folioExtraExpenses.length})</Text>
                {s.extra > 0 && (
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#DC2626' }}>
                    Total: {money(s.extra)}
                  </Text>
                )}
              </View>
              {s.folioExtraExpenses.map((exp: any, idx: number) => (
                <Card key={exp.id || idx} style={{ marginBottom: 10, borderColor: '#FECACA', borderWidth: 1, backgroundColor: '#FFF5F5', padding: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ fontWeight: '800', fontSize: 15, color: '#1E293B' }}>{exp.reason || exp.title || 'Damage / Incidental'}</Text>
                      <Text style={{ color: '#64748B', fontSize: 12, marginTop: 2 }}>
                        {exp.category || 'Room Expense'} · Added by {exp.added_by || exp.created_by || 'Staff'}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        const confirmMsg = `Are you sure you want to remove "${exp.reason || exp.title}" (${money(exp.total_amount || exp.amount)}) from Room #${s.room}?`;
                        const doDelete = async () => {
                          try {
                            await api.deleteExtraExpense(s.booking_id || s.id, exp.id);
                            if (Platform.OS === 'web') {
                              window.alert('Extra expense removed successfully.');
                            } else {
                              Alert.alert('Deleted', 'Extra expense removed successfully.');
                            }
                            reload();
                          } catch (err: any) {
                            Alert.alert('Error', err.message || 'Could not delete expense.');
                          }
                        };
                        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
                          if (window.confirm(confirmMsg)) doDelete();
                        } else {
                          Alert.alert(
                            'Delete Extra Expense',
                            confirmMsg,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Delete Charge',
                                style: 'destructive',
                                onPress: doDelete
                              }
                            ]
                          );
                        }
                      }}
                      style={({ pressed }) => ({
                        backgroundColor: pressed ? '#FEE2E2' : '#FFFFFF',
                        borderColor: '#F87171',
                        borderWidth: 1,
                        paddingVertical: 5,
                        paddingHorizontal: 10,
                        borderRadius: 8
                      })}
                    >
                      <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '800' }}>🗑️ Delete</Text>
                    </Pressable>
                  </View>
                  <View style={{ height: 1, backgroundColor: '#FED7D7', marginVertical: 8 }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: '#64748B', fontSize: 12 }}>Taxable: {money(exp.amount)} (+{exp.gst_pct || 5}% GST)</Text>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#DC2626' }}>{money(exp.total_amount || exp.amount)}</Text>
                  </View>
                </Card>
              ))}
            </View>
          )}

          {/* Section: F&B Itemized Bills */}
          <View style={styles.sectionHeaderRow}>
            <RestaurantIcon size={16} color={c.ink} />
            <Text style={styles.sectionTitle}>Restaurant & Bar Orders ({bills.length})</Text>
          </View>
          {bills.length === 0 ? (
            <Card>
              <Text style={{ color: c.mute, textAlign: 'center', paddingVertical: 8 }}>
                {ordersBusy ? 'Checking recent orders…' : 'No separate restaurant or bar bills charged to this room.'}
              </Text>
            </Card>
          ) : (
            bills.map((b: any) => (
              <BillCard key={b.dept + b.id} o={b} onPress={() => setOpenBill(b)} />
            ))
          )}
        </>
      )) : null}

      <BillSheet visible={!!openBill} bill={openBill} onClose={() => setOpenBill(null)} onChanged={() => reloadOrders()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#fbd3e4',
    shadowColor: '#21181f',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  heroRoomNumber: {
    fontSize: 26,
    fontWeight: '900',
    color: c.ink,
    letterSpacing: -0.5
  },
  heroRoomType: {
    fontSize: 13,
    color: c.mute,
    marginTop: 2,
    fontWeight: '600'
  },
  heroDivider: {
    height: 1,
    backgroundColor: '#F0F4F2',
    marginVertical: 14
  },
  heroStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  heroStatItem: {
    flex: 1
  },
  heroStatLabel: {
    fontSize: 11,
    color: c.mute,
    fontWeight: '600',
    marginBottom: 4
  },
  heroStatVal: {
    fontSize: 18,
    fontWeight: '800',
    color: c.ink
  },
  actionSection: {
    marginTop: 4,
    marginBottom: 4
  },
  actionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 2
  },
  actionSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  docButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  docBtn: {
    flexBasis: '48%',
    flexGrow: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1
  },
  docBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#21181f'
  },
  docBtnInvoice: {
    flexBasis: '100%',
    backgroundColor: '#8c5d77',
    borderColor: '#8c5d77'
  },
  docBtnInvoiceText: {
    color: '#FFFFFF'
  },
  receiptPillBtn: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
    borderWidth: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center'
  },
  receiptPillText: {
    color: '#15803D',
    fontSize: 12,
    fontWeight: '800'
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 8,
    marginBottom: -2,
    paddingHorizontal: 4
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: c.ink,
    letterSpacing: -0.2
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6
  },
  detailLabel: {
    fontSize: 13,
    color: c.mute,
    fontWeight: '500',
    flex: 1
  },
  detailValue: {
    fontSize: 14,
    color: c.text,
    fontWeight: '600',
    textAlign: 'right',
    flex: 1.2
  },
  detailValueBold: {
    fontWeight: '800'
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#F0F4F2',
    marginVertical: 6
  },
  checkoutCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3
  },
  checkoutHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  checkoutHeaderTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: c.ink,
    letterSpacing: -0.4
  },
  checkoutHeaderSub: {
    fontSize: 12,
    color: c.mute,
    marginTop: 2,
    fontWeight: '600'
  },
  checkoutPaymentsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginTop: 6,
    marginBottom: 20
  },
  checkoutPaymentItem: {
    paddingVertical: 10
  },
  checkoutPaymentItemBorder: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9'
  },
  checkoutPaymentTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  checkoutPaymentBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  checkoutPaymentBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4F46E5',
    textTransform: 'uppercase'
  },
  checkoutPaymentAmount: {
    fontSize: 15,
    fontWeight: '900',
    color: '#16A34A'
  },
  checkoutPaymentMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2
  },
  checkoutPaymentDate: {
    fontSize: 12,
    color: '#64748B'
  },
  checkoutPaymentStaff: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155'
  },
  checkoutPaymentReceipt: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3
  },
  noPaymentsText: {
    textAlign: 'center',
    color: c.mute,
    fontSize: 13,
    paddingVertical: 12
  },
  transferCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    marginVertical: 4
  },
  transferHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  transferBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FCD34D'
  },
  transferBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 0.5
  },
  transferCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309'
  },
  transferItem: {
    paddingVertical: 4
  },
  transferItemBorder: {
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
    marginTop: 8,
    paddingTop: 8
  },
  transferMainRow: {
    marginBottom: 4
  },
  transferMainText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#78350F'
  },
  transferHighlight: {
    fontWeight: '900',
    color: '#92400E'
  },
  transferMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2
  },
  transferMetaText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '500'
  },
  transferMetaBold: {
    fontWeight: '700',
    color: '#78350F'
  },
  transferReasonRow: {
    marginTop: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  transferReasonText: {
    fontSize: 11.5,
    fontStyle: 'italic',
    color: '#92400E'
  }
});