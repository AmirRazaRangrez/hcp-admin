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
import { useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { api } from '../src/api/client';
import { Screen, Card, Badge, useLoad } from '../src/lib/ui';
import { c, money, when } from '../src/lib/theme';
import { BillCard, BillSheet } from '../src/lib/billsheet';
import {
  UserIcon,
  PhoneIcon,
  HotelIcon,
  CreditCardIcon,
  RestaurantIcon
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
  const grandTotal = Number(s?.total || (roomCharge + foodTotal + barTotal + extraBedCharge - discountAmount + taxAmount));
  const paid = Number(s?.paid || r.advance_amount || r.total_paid || 0);
  const pending = Math.max(0, grandTotal - paid);

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
  const params = useLocalSearchParams<{ id: string; room?: string; guest?: string; total?: string; paid?: string; phone?: string; bookingId?: string }>();
  const id = params.id;
  const [openBill, setOpenBill] = useState<any>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: stayData, err, busy, at, reload } = useLoad(async () => {
    let found: any = null;
    const cleanId = String(id || '').trim().toLowerCase();

    // 0. Fetch live Folio first for exact F&B orders, room charge, advance paid, pending, email & aadhar
    try {
      const folio = await api.roomFolio(id);
      if (folio && folio.room) {
        const fr = folio.room;
        const fs = folio.summary || {};
        found = {
          id: String(fr.id || id),
          room: String(fr.room_number || id),
          guest: fr.guest_name || 'In-House Guest',
          mobile: fr.mobile || '',
          email: fr.email || '',
          aadharNumber: fr.aadhar_number || '',
          aadhar_number: fr.aadhar_number || '',
          docType: fr.doc_type || 'Aadhaar Card',
          doc_type: fr.doc_type || 'Aadhaar Card',
          address: fr.address || '',
          dob: fr.dob || '',
          roomType: fr.room_type || 'Executive Room',
          checkIn: fr.checkin_time || new Date().toISOString(),
          checkOut: fr.approx_checkout_time || '',
          approxCheckOut: fr.approx_checkout_time || '',
          roomCharge: Number(fs.roomCharge ?? fr.total_room_charge ?? 2993),
          restaurant: Number(fs.foodTotal ?? 0),
          bar: Number(fs.barTotal ?? 0),
          extra: 0,
          discount: 0,
          total: Number(fs.grandTotal ?? (Number(fs.roomCharge || 2993) + Number(fs.foodTotal || 0) + Number(fs.barTotal || 0))),
          paid: Number(fs.advancePaid ?? fr.total_paid ?? 1500),
          pending: Number(fs.balanceDue ?? 0),
          source: fr.booking_source || 'Walk-in',
          checkedInBy: fr.checked_in_by || 'Front Desk',
          mealPlan: 'EP (Room Only)',
          voucherNumber: fr.voucher_number || '',
          advanceReceiptNo: fr.advance_receipt_no || '',
          paymentMode: fr.advance_payment_mode || 'Cash',
          folioRestaurantOrders: folio.restaurantOrders || [],
          folioBarOrders: folio.barOrders || [],
          raw: fr
        };
      }
    } catch (e) {
      console.warn('[Room Details] live folio fetch error:', e);
    }

    // 1. Try to fetch from occupied list
    try {
      const list = await api.occupied();
      found = list.find((x: any) =>
        String(x.id || '').trim().toLowerCase() === cleanId ||
        String(x.room || '').trim().toLowerCase() === cleanId ||
        String(x.room_number || '').trim().toLowerCase() === cleanId ||
        String(x.booking_id || '').trim().toLowerCase() === cleanId
      );
    } catch {}

    // 2. ALWAYS fetch full booking details from CRM backend to get full folio, payments, guest ID proof, address, voucher number
    try {
      const targetBookingId = params.bookingId || found?.booking_id || found?.id || id;
      const full = await api.booking(targetBookingId);
      if (full) {
        const rType = String(full.room_type || found?.roomType || '').toLowerCase();
        const fallbackRate = rType.includes('pent') ? 4500 : (rType.includes('suit') ? 3500 : (rType.includes('deluxe') ? 2200 : 2400));
        const roomCharge = Number(full.total_room_charge || full.room_charge || full.daily_rate || found?.roomCharge || params.total || fallbackRate);
        const fnb = Number(full.food_total || found?.restaurant || 0);
        const bar = Number(full.bar_total || found?.bar || 0);
        const extra = Number(full.extra || full.extra_bed_charge || found?.extra || 0);
        const discount = Number(full.discount_amount || found?.discount || 0);
        const tax = Number(full.tax_amount || Math.round(roomCharge * 0.05));
        const total = Number(full.grand_total || full.total || found?.total || (roomCharge + fnb + bar + extra - discount + tax));
        const paid = Number(full.total_paid || full.paid || full.advance_payment || full.advance_amount || found?.paid || params.paid || total);
        const pending = Math.max(0, total - paid);

        found = {
          ...(found || {}),
          id: String(full.id ?? full.booking_id ?? found?.id ?? id),
          room: String(full.room_number || full.room || found?.room || id),
          guest: full.guest_name || full.name || found?.guest || params.guest || 'In-House Guest',
          mobile: full.mobile || full.phone || found?.mobile || params.phone || '',
          email: found?.email || full.email || '',
          aadharNumber: found?.aadharNumber || full.aadhar_number || full.id_number || '',
          aadhar_number: found?.aadhar_number || full.aadhar_number || full.id_number || '',
          docType: found?.docType || full.doc_type || 'Aadhaar Card',
          doc_type: found?.doc_type || full.doc_type || 'Aadhaar Card',
          address: found?.address || full.address || '',
          dob: found?.dob || full.dob || '',
          roomType: full.room_type || full.room_types || found?.roomType || 'Standard Room',
          checkIn: full.checkin_time || found?.checkIn || new Date().toISOString(),
          checkOut: full.actual_checkout_time || full.checkout_time || found?.checkOut,
          approxCheckOut: full.approx_checkout_time || found?.approxCheckOut,
          roomCharge: found?.roomCharge || roomCharge,
          restaurant: found?.restaurant !== undefined && found?.restaurant > 0 ? found.restaurant : fnb,
          bar: found?.bar !== undefined && found?.bar > 0 ? found.bar : bar,
          extra,
          discount,
          total: found?.total || total,
          paid: found?.paid || paid,
          pending: found?.pending !== undefined ? found.pending : pending,
          source: full.booking_source || found?.source || 'Walk-in',
          checkedInBy: full.checked_in_by || found?.checkedInBy || 'Front Desk',
          mealPlan: full.meal_plan || found?.mealPlan || 'EP (Room Only)',
          voucherNumber: full.voucher_number || found?.voucherNumber || '',
          advanceReceiptNo: full.advance_receipt_no || found?.advanceReceiptNo || '',
          paymentMode: full.advance_payment_mode || full.final_payment_mode || found?.paymentMode || 'Cash',
          splitCash: Number(full.split_cash || found?.splitCash || 0),
          splitCard: Number(full.split_card || found?.splitCard || 0),
          splitOnline: Number(full.split_online || found?.splitOnline || 0),
          splitCheque: Number(full.split_cheque || found?.splitCheque || 0),
          stayDuration: full.stay_duration_str || found?.stayDuration || '',
          raw: full
        };
      }
    } catch (e) {
      console.warn('[Room Details] full booking fetch fallback:', e);
    }

    // 3. Fallback to notification payload params if available
    if (!found && params.guest) {
      const pTotal = Number(params.total || params.paid || 0);
      const pPaid = Number(params.paid || 0);
      found = {
        id: String(params.bookingId || id),
        room: String(params.room || id),
        guest: String(params.guest),
        mobile: String(params.phone || ''),
        email: '',
        address: '',
        dob: '',
        roomType: 'Executive / Deluxe Room',
        checkIn: new Date().toISOString(),
        roomCharge: pTotal,
        restaurant: 0,
        bar: 0,
        extra: 0,
        discount: 0,
        total: pTotal,
        paid: pPaid,
        pending: Math.max(0, pTotal - pPaid),
        source: 'Front Desk',
        checkedInBy: 'Front Desk',
        mealPlan: 'EP (Room Only)',
        voucherNumber: '',
        advanceReceiptNo: '',
        paymentMode: 'Cash'
      };
    }

    if (!found) throw new Error(`Room ${id} details could not be found.`);
    return found;
  }, [id], 'room:' + id);

  const s: any = stayData;

  const { data: ordersData, busy: ordersBusy, reload: reloadOrders } = useLoad(
    async () => {
      if (!s) return [];
      const orders = await api.roomOrders(s);
      if (Array.isArray(orders) && orders.length > 0) return orders;
      if (s?.folioRestaurantOrders || s?.folioBarOrders) {
        return [...(s.folioRestaurantOrders || []), ...(s.folioBarOrders || [])];
      }
      return [];
    },
    [s?.id, s?.room],
    'roomOrders:' + (s?.id || '')
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

  return (
    <Screen
      title={s ? `Room ${s.room}` : 'Room Details'}
      subtitle={s?.roomType || 'Stay Folio'}
      back
      busy={busy || ordersBusy}
      reload={() => { reload(); reloadOrders(); }}
      at={at}
      err={err}
    >
      {s ? (
        <>
          {/* Top Room Banner Card */}
          <Card style={styles.heroCard}>
            <View style={styles.heroHeader}>
              <View>
                <Text style={styles.heroRoomNumber}>Room {s.room}</Text>
                <Text style={styles.heroRoomType}>{s.roomType || 'Standard Room'}</Text>
              </View>
              <Badge
                text={s.pending > 0 ? `DUE ${money(s.pending)}` : 'SETTLED / PAID'}
                color={s.pending > 0 ? c.warn : c.ok}
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
                <Text style={styles.heroStatLabel}>Due Balance</Text>
                <Text style={[styles.heroStatVal, { color: s.pending > 0 ? c.bad : c.ok }]}>
                  {money(s.pending)}
                </Text>
              </View>
            </View>
          </Card>

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
              value={`${s.adults || 1} Adult(s)${s.children ? `, ${s.children} Child` : ''}${s.extraBeds ? `, ${s.extraBeds} Extra Bed` : ''}`}
            />
          </Card>

          {/* Section: Stay & Booking Details */}
          <View style={styles.sectionHeaderRow}>
            <HotelIcon size={16} color={c.ink} />
            <Text style={styles.sectionTitle}>Stay & Booking Details</Text>
          </View>
          <Card>
            <DetailRow label="Check-in Time" value={when(s.checkIn)} bold />
            <DetailRow label="Expected Checkout" value={s.approxCheckOut ? when(s.approxCheckOut) : when(s.checkOut)} />
            <DetailRow label="Stay Duration" value={s.stayDuration || 'In-House'} />
            <DetailRow label="Booking Source" value={s.source || 'Walk-in'} bold />
            <DetailRow label="Meal Plan" value={s.mealPlan} />
            <DetailRow label="Checked-in By" value={s.checkedInBy || 'Front Desk Staff'} />
            {s.voucherNumber ? <DetailRow label="Bill No" value={s.voucherNumber} bold /> : null}
          </Card>

          {/* Section: All Receipts & Payment Collections */}
          <View style={styles.sectionHeaderRow}>
            <CreditCardIcon size={16} color={c.ink} />
            <Text style={styles.sectionTitle}>Payment Receipts & Collections</Text>
          </View>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '800', color: c.ink }}>
                  Advance Receipt: {s.advanceReceiptNo || ('RCP-' + s.id)}
                </Text>
                <Text style={{ fontSize: 11, color: c.mute, marginTop: 2 }}>
                  Collected at check-in · {when(s.checkIn)}
                </Text>
              </View>
              <Badge text="REALIZED" color={c.ok} />
            </View>

            <View style={styles.rowDivider} />

            <DetailRow label="Total Paid Amount" value={money(s.paid)} color={c.ok} bold />
            <DetailRow label="Payment Mode" value={s.paymentMode || 'Cash'} bold />
            {s.splitCash > 0 ? <DetailRow label="Paid via Cash" value={money(s.splitCash)} /> : null}
            {s.splitOnline > 0 ? <DetailRow label="Paid via Online UPI" value={money(s.splitOnline)} /> : null}
            {s.splitCard > 0 ? <DetailRow label="Paid via Card POS" value={money(s.splitCard)} /> : null}
            {s.splitCheque > 0 ? <DetailRow label="Paid via Cheque" value={money(s.splitCheque)} /> : null}

            <View style={{ marginTop: 8 }}>
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
          </Card>

          {/* Section: Complete Financial Summary */}
          <View style={styles.sectionHeaderRow}>
            <CreditCardIcon size={16} color={c.ink} />
            <Text style={styles.sectionTitle}>Financial & Billing Summary</Text>
          </View>
          <Card>
            <DetailRow label="Room Charges" value={money(s.roomCharge)} />
            <DetailRow label="Restaurant Charges" value={money(s.restaurant)} />
            <DetailRow label="Bar Lounge Charges" value={money(s.bar)} />
            {s.extra > 0 ? (
              <DetailRow label="Extra Expense (Damages/Services)" value={money(s.extra)} color={c.bad} bold />
            ) : null}
            {s.discount > 0 ? (
              <DetailRow label="Discount Applied" value={`− ${money(s.discount)}`} color={c.ok} bold />
            ) : null}

            <View style={styles.rowDivider} />

            <DetailRow label="Total Bill" value={money(s.total)} bold />
            <DetailRow label="Total Paid" value={money(s.paid)} color={c.ok} bold />
            <DetailRow
              label="Pending Balance Due"
              value={money(s.pending)}
              color={s.pending > 0 ? c.bad : c.ok}
              bold
            />
          </Card>

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
      ) : null}

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
  }
});