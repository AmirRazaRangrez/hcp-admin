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

// Generates an official Guest Registration Card / Check-in Form HTML for PDF printing & sharing
function generateCheckinFormHtml(s: any): string {
  const checkinStr = s.checkIn ? new Date(s.checkIn).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const checkoutStr = s.approxCheckOut || s.checkOut ? new Date(s.approxCheckOut || s.checkOut).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const regNo = s.voucherNumber || ('GRC-' + s.id);
  const advReceipt = s.advanceReceiptNo || ('RCP-' + s.id);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Guest Registration Card - Room ${s.room}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; padding: 24px; margin: 0; background: #fff; font-size: 13px; line-height: 1.5; }
    .header { text-align: center; border-bottom: 2px solid #0f2a2e; padding-bottom: 14px; margin-bottom: 16px; }
    .hotel-title { font-size: 24px; font-weight: 900; color: #0f2a2e; letter-spacing: 1px; margin: 0; }
    .hotel-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
    .form-title { font-size: 14px; font-weight: 800; color: #b8893b; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .meta-bar { display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px; margin-bottom: 16px; font-weight: 600; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th, td { border: 1px solid #cbd5e1; padding: 7px 10px; text-align: left; }
    th { background: #f1f5f9; color: #0f2a2e; font-weight: 700; width: 28%; font-size: 12px; }
    .section-head { background: #0f2a2e; color: #fff; font-size: 12px; font-weight: 800; padding: 6px 10px; text-transform: uppercase; letter-spacing: 0.5px; border-radius: 4px 4px 0 0; }
    .signatures { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 16px; }
    .sig-box { width: 45%; text-align: center; border-top: 1px dashed #64748b; padding-top: 8px; font-size: 11px; color: #475569; font-weight: 600; }
    .footer { font-size: 10px; color: #94a3b8; text-align: center; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="hotel-title">HOTEL CITY PARK</h1>
    <div class="hotel-sub">Station Road, Bilaspur, Chhattisgarh - 495001 | Tel: +91 7752-408000</div>
    <div class="form-title">GUEST REGISTRATION CARD (CHECK-IN FORM)</div>
  </div>

  <div class="meta-bar">
    <div>Registration No: <b>${regNo}</b></div>
    <div>Room No: <b style="font-size: 15px; color: #0f2a2e;">${s.room}</b></div>
    <div>Date: <b>${checkinStr}</b></div>
  </div>

  <div class="section-head">1. Guest Details</div>
  <table>
    <tr><th>Full Guest Name</th><td><b>${s.guest}</b></td><th>Contact Phone</th><td><b>${s.mobile || '—'}</b></td></tr>
    <tr><th>Email Address</th><td>${s.email || '—'}</td><th>Date of Birth</th><td>${s.dob || '—'}</td></tr>
    <tr><th>Permanent Address</th><td colspan="3">${s.address || 'India'}</td></tr>
    <tr><th>ID Proof Document</th><td>${s.raw?.doc_type || 'Aadhaar / Gov ID'}</td><th>ID Number</th><td>${s.raw?.aadhar_number || 'Verified at desk'}</td></tr>
  </table>

  <div class="section-head">2. Stay &amp; Room Information</div>
  <table>
    <tr><th>Room Allocated</th><td><b>Room ${s.room} (${s.roomType || 'Standard'})</b></td><th>Occupancy (Pax)</th><td>${s.adults || 1} Adult(s)${s.children ? ', ' + s.children + ' Child' : ''}</td></tr>
    <tr><th>Check-In Date/Time</th><td><b>${checkinStr}</b></td><th>Expected Check-Out</th><td>${checkoutStr}</td></tr>
    <tr><th>Stay Duration</th><td>${s.stayDuration || 'In-House'}</td><th>Meal Plan</th><td>${s.mealPlan || 'EP (Room Only)'}</td></tr>
    <tr><th>Booking Source</th><td>${s.source || 'Walk-in'}</td><th>Checked-In By</th><td>${s.checkedInBy || 'Front Desk'}</td></tr>
  </table>

  <div class="section-head">3. Advance Payment &amp; Tariff</div>
  <table>
    <tr><th>Room Tariff</th><td>₹${Number(s.roomCharge || 0).toLocaleString('en-IN')}</td><th>Advance Received</th><td><b style="color: #16a34a;">₹${Number(s.paid || 0).toLocaleString('en-IN')}</b></td></tr>
    <tr><th>Advance Receipt No</th><td>${advReceipt}</td><th>Payment Mode</th><td>${s.paymentMode || 'Cash'}</td></tr>
    <tr><th>Estimated Total</th><td>₹${Number(s.total || s.roomCharge || 0).toLocaleString('en-IN')}</td><th>Balance Due</th><td><b>₹${Number(s.pending || 0).toLocaleString('en-IN')}</b></td></tr>
  </table>

  <p style="font-size: 10.5px; color: #64748b; margin-top: 16px;">
    <b>Declaration:</b> I/We hereby declare that all particulars given above are correct. I agree to abide by the rules and regulations of Hotel City Park and agree to clear all bills upon presentation or departure.
  </p>

  <div class="signatures">
    <div class="sig-box">Guest Signature</div>
    <div class="sig-box">Front Desk / Duty Manager (${s.checkedInBy || 'Authorized Staff'})</div>
  </div>

  <div class="footer">
    Generated from Hotel City Park Owner Mobile System • Computer Generated Document
  </div>
</body>
</html>`;
}

// Generates an official GST Tax Invoice HTML for PDF printing & sharing
function generateTaxInvoiceHtml(s: any, orders: any[] = []): string {
  const invNo = 'INV-' + (s.voucherNumber || s.id);
  const nowStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const checkinStr = s.checkIn ? new Date(s.checkIn).toLocaleDateString('en-IN') : '—';
  const checkoutStr = s.approxCheckOut || s.checkOut ? new Date(s.approxCheckOut || s.checkOut).toLocaleDateString('en-IN') : '—';
  
  const roomRent = Number(s.roomCharge || s.total || 0);
  const fnbTotal = Number(s.restaurant || 0);
  const barTotal = Number(s.bar || 0);
  const extraTotal = Number(s.extra || 0);
  const discountTotal = Number(s.discount || 0);
  
  const subtotal = Math.max(0, roomRent + fnbTotal + barTotal + extraTotal - discountTotal);
  const cgst = Math.round(subtotal * 0.025);
  const sgst = Math.round(subtotal * 0.025);
  const grandTotal = subtotal + cgst + sgst;
  const advancePaid = Number(s.paid || 0);
  const balanceDue = Math.max(0, grandTotal - advancePaid);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Tax Invoice - Room ${s.room}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; padding: 24px; margin: 0; background: #fff; font-size: 13px; line-height: 1.5; }
    .header { text-align: center; border-bottom: 2px solid #0f2a2e; padding-bottom: 12px; margin-bottom: 14px; }
    .hotel-title { font-size: 22px; font-weight: 900; color: #0f2a2e; letter-spacing: 1px; margin: 0; }
    .hotel-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
    .invoice-title { font-size: 14px; font-weight: 800; color: #0f2a2e; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .meta-grid { display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; }
    th { background: #f1f5f9; color: #0f2a2e; font-weight: 700; font-size: 12px; text-align: left; }
    .num { text-align: right; }
    .total-row { font-weight: 800; background: #f8fafc; }
    .highlight-row { font-size: 15px; font-weight: 900; background: #0f2a2e; color: #fff; }
    .highlight-row td { border-color: #0f2a2e; }
    .signatures { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 16px; }
    .sig-box { width: 45%; text-align: center; border-top: 1px dashed #64748b; padding-top: 8px; font-size: 11px; color: #475569; font-weight: 600; }
    .footer { font-size: 10px; color: #94a3b8; text-align: center; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="hotel-title">HOTEL CITY PARK</h1>
    <div class="hotel-sub">Station Road, Bilaspur, Chhattisgarh - 495001 | GSTIN: 22AAAAA0000A1Z5 | Tel: +91 7752-408000</div>
    <div class="invoice-title">TAX INVOICE (HOSPITALITY SERVICES)</div>
  </div>

  <div class="meta-grid">
    <div>
      <div>Invoice No: <b>${invNo}</b></div>
      <div>Invoice Date: <b>${nowStr}</b></div>
      <div>Room No: <b style="font-size: 14px;">${s.room} (${s.roomType || 'Standard'})</b></div>
      <div>Stay Period: <b>${checkinStr} to ${checkoutStr}</b></div>
    </div>
    <div style="text-align: right;">
      <div>Billed To: <b>${s.guest}</b></div>
      <div>Mobile: <b>${s.mobile || '—'}</b></div>
      <div>Address: ${s.address || 'India'}</div>
      <div>Payment Mode: <b>${s.paymentMode || 'Cash'}</b></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 8%;">S.No</th>
        <th>Description of Services</th>
        <th style="width: 15%;">SAC / HSN</th>
        <th style="width: 10%;" class="num">Qty</th>
        <th style="width: 20%;" class="num">Amount (₹)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td><b>Room Accommodation Charges</b><br/><span style="font-size: 11px; color: #64748b;">Room ${s.room} · ${s.stayDuration || 'Stay'}</span></td>
        <td>996311</td>
        <td class="num">1</td>
        <td class="num">₹${roomRent.toLocaleString('en-IN')}</td>
      </tr>
      ${fnbTotal > 0 ? `
      <tr>
        <td>2</td>
        <td><b>Food &amp; Beverage (Room Service)</b></td>
        <td>996331</td>
        <td class="num">1</td>
        <td class="num">₹${fnbTotal.toLocaleString('en-IN')}</td>
      </tr>` : ''}
      ${barTotal > 0 ? `
      <tr>
        <td>3</td>
        <td><b>Bar Lounge Service</b></td>
        <td>996332</td>
        <td class="num">1</td>
        <td class="num">₹${barTotal.toLocaleString('en-IN')}</td>
      </tr>` : ''}
      ${extraTotal > 0 ? `
      <tr>
        <td>4</td>
        <td><b>Other Extra Services / Facilities</b></td>
        <td>996311</td>
        <td class="num">1</td>
        <td class="num">₹${extraTotal.toLocaleString('en-IN')}</td>
      </tr>` : ''}
      ${discountTotal > 0 ? `
      <tr>
        <td colspan="4" class="num"><b>Special Discount Applied</b></td>
        <td class="num" style="color: #16a34a;"><b>− ₹${discountTotal.toLocaleString('en-IN')}</b></td>
      </tr>` : ''}
      <tr class="total-row">
        <td colspan="4" class="num">Taxable Value</td>
        <td class="num">₹${subtotal.toLocaleString('en-IN')}</td>
      </tr>
      <tr>
        <td colspan="4" class="num">CGST (2.5%)</td>
        <td class="num">₹${cgst.toLocaleString('en-IN')}</td>
      </tr>
      <tr>
        <td colspan="4" class="num">SGST (2.5%)</td>
        <td class="num">₹${sgst.toLocaleString('en-IN')}</td>
      </tr>
      <tr class="highlight-row">
        <td colspan="4" class="num" style="color: #fff;">TOTAL INVOICE AMOUNT</td>
        <td class="num" style="color: #fff;">₹${grandTotal.toLocaleString('en-IN')}</td>
      </tr>
      <tr class="total-row">
        <td colspan="4" class="num" style="color: #16a34a;">Less: Advance / Payments Received (${s.advanceReceiptNo || 'Desk Receipt'})</td>
        <td class="num" style="color: #16a34a;">₹${advancePaid.toLocaleString('en-IN')}</td>
      </tr>
      <tr class="total-row" style="background: #fff1f2;">
        <td colspan="4" class="num" style="color: #e11d48; font-size: 14px;">NET BALANCE DUE</td>
        <td class="num" style="color: #e11d48; font-size: 14px;">₹${balanceDue.toLocaleString('en-IN')}</td>
      </tr>
    </tbody>
  </table>

  <div class="signatures">
    <div class="sig-box">Guest Signature</div>
    <div class="sig-box">For Hotel City Park<br/><br/>(Authorized Signatory)</div>
  </div>

  <div class="footer">
    Thank you for staying with Hotel City Park Bilaspur! • Subject to Bilaspur Jurisdiction
  </div>
</body>
</html>`;
}

export default function RoomDetails() {
  const params = useLocalSearchParams<{ id: string; room?: string; guest?: string; total?: string; paid?: string; phone?: string; bookingId?: string }>();
  const id = params.id;
  const [openBill, setOpenBill] = useState<any>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: stayData, err, busy, at, reload } = useLoad(async () => {
    let found: any = null;
    const cleanId = String(id || '').trim().toLowerCase();

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

    // 2. If not found, fetch single booking details from API
    if (!found) {
      try {
        const full = await api.booking(id);
        if (full) {
          found = {
            id: String(full.id ?? full.booking_id ?? id),
            room: String(full.room_number || full.room || id),
            guest: full.guest_name || full.name || params.guest || 'In-House Guest',
            mobile: full.mobile || full.phone || params.phone || '',
            email: full.email || '',
            address: full.address || '',
            dob: full.dob || '',
            roomType: full.room_type || 'Standard Room',
            checkIn: full.checkin_time || new Date().toISOString(),
            checkOut: full.actual_checkout_time || full.checkout_time,
            approxCheckOut: full.approx_checkout_time,
            roomCharge: Number(full.total_room_charge || full.room_charge || params.total || 0),
            restaurant: Number(full.food_total || 0),
            bar: Number(full.bar_total || 0),
            extra: 0,
            discount: Number(full.discount_amount || 0),
            total: Number(full.grand_total || full.total_room_charge || params.total || 0),
            paid: Number(full.total_paid || full.advance_payment || params.paid || 0),
            pending: Math.max(0, Number(full.grand_total || full.total_room_charge || params.total || 0) - Number(full.total_paid || full.advance_payment || params.paid || 0)),
            source: full.booking_source || 'Walk-in',
            checkedInBy: full.checked_in_by || 'Front Desk',
            mealPlan: full.meal_plan || 'EP (Room Only)',
            voucherNumber: full.voucher_number || '',
            advanceReceiptNo: full.advance_receipt_no || '',
            paymentMode: full.advance_payment_mode || full.final_payment_mode || 'Cash',
            splitCash: Number(full.split_cash || 0),
            splitCard: Number(full.split_card || 0),
            splitOnline: Number(full.split_online || 0),
            splitCheque: Number(full.split_cheque || 0),
            stayDuration: full.stay_duration_str || '',
            raw: full
          };
        }
      } catch {}
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
    async () => (s ? api.roomOrders(s) : []),
    [s?.id],
    'roomOrders:' + (s?.id || '')
  );

  const bills: any[] = (ordersData as any) || [];

  const handleCall = (mobile: string) => {
    if (!mobile) return;
    Linking.openURL(`tel:${mobile}`).catch(() => {});
  };

  const handleDownloadCheckinForm = async () => {
    if (!s) return;
    try {
      setDownloading('form');
      const html = generateCheckinFormHtml(s);
      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
        return;
      }
      const file = await Print.printToFileAsync({ html });
      let shareUri = file.uri;
      try {
        const dest = `${FileSystem.cacheDirectory}Checkin_Form_Room_${s.room || s.id}.pdf`;
        await FileSystem.copyAsync({ from: file.uri, to: dest });
        shareUri = dest;
      } catch (copyErr) {
        console.warn('[PDF share] fallback to direct uri:', copyErr);
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(shareUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Check-in Form - Room ${s.room}`,
          UTI: 'com.adobe.pdf'
        });
      }
    } catch (err: any) {
      Alert.alert('Download Notice', 'Unable to generate PDF: ' + err.message);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadTaxInvoice = async () => {
    if (!s) return;
    try {
      setDownloading('invoice');
      const html = generateTaxInvoiceHtml(s, bills);
      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
        return;
      }
      const file = await Print.printToFileAsync({ html });
      let shareUri = file.uri;
      try {
        const dest = `${FileSystem.cacheDirectory}Tax_Invoice_Room_${s.room || s.id}.pdf`;
        await FileSystem.copyAsync({ from: file.uri, to: dest });
        shareUri = dest;
      } catch (copyErr) {
        console.warn('[PDF share] fallback to direct uri:', copyErr);
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(shareUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Tax Invoice - Room ${s.room}`,
          UTI: 'com.adobe.pdf'
        });
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
                <Text style={styles.heroStatLabel}>Total Folio</Text>
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

          {/* Quick PDF Action Buttons: Check-in Form & Tax Invoice */}
          <View style={styles.actionButtonsRow}>
            <Pressable
              onPress={handleDownloadCheckinForm}
              disabled={downloading !== null}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.actionBtnPrimary,
                pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] }
              ]}
            >
              <Text style={styles.actionBtnTextPrimary}>
                {downloading === 'form' ? 'Preparing Form…' : '📄 Check-in Form'}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleDownloadTaxInvoice}
              disabled={downloading !== null}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.actionBtnSecondary,
                pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] }
              ]}
            >
              <Text style={styles.actionBtnTextSecondary}>
                {downloading === 'invoice' ? 'Preparing Invoice…' : '🧾 Tax Invoice'}
              </Text>
            </Pressable>
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
            {s.voucherNumber ? <DetailRow label="Voucher / Reg No" value={s.voucherNumber} bold /> : null}
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
                onPress={handleDownloadTaxInvoice}
                style={({ pressed }) => [
                  styles.receiptPillBtn,
                  pressed && { opacity: 0.85 }
                ]}
              >
                <Text style={styles.receiptPillText}>Download Payment Receipt PDF</Text>
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

            <DetailRow label="Grand Total Folio" value={money(s.total)} bold />
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
    borderColor: '#E6ECE9',
    shadowColor: '#0F2A2E',
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
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
    marginBottom: 2
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1
  },
  actionBtnPrimary: {
    backgroundColor: '#0F2A2E',
    borderColor: '#0F2A2E'
  },
  actionBtnSecondary: {
    backgroundColor: '#FFFFFF',
    borderColor: '#C79A4B'
  },
  actionBtnTextPrimary: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13
  },
  actionBtnTextSecondary: {
    color: '#92400E',
    fontWeight: '800',
    fontSize: 13
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