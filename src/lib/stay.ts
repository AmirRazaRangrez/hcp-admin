// Turns a CRM booking row (from /hospitality/history) into the summary shown for an occupied room.
const n = (x: any) => Number(x) || 0;

export type Stay = {
  id: string;
  room: string;
  guest: string;
  checkIn?: string;
  checkOut?: string;
  approxCheckOut?: string;
  roomCharge: number;
  restaurant: number;
  bar: number;
  extra: number;
  discount: number;
  total: number;
  paid: number;
  pending: number;
  mobile?: string;
  email?: string;
  address?: string;
  dob?: string;
  roomType?: string;
  adults?: number;
  children?: number;
  extraBeds?: number;
  source?: string;
  checkedInBy?: string;
  mealPlan?: string;
  voucherNumber?: string;
  advanceReceiptNo?: string;
  paymentMode?: string;
  splitCash?: number;
  splitCard?: number;
  splitOnline?: number;
  splitCheque?: number;
  stayDuration?: string;
  raw?: any;
};

// A guest is "in house" when checked in and not yet checked out.
export const isInHouse = (b: any) => {
  const st = String(b.status || b.booking_status || '').toLowerCase().trim();
  if (b.actual_checkout_time || ['checked_out', 'cancelled', 'canceled', 'no_show', 'settled', 'completed'].includes(st)) return false;
  return st === 'active' || st === 'checked_in' || st === 'occupied' || (Boolean(b.checkin_time) && !['reserved', 'booked', 'confirmed', 'pending', 'checked_out', 'cancelled'].includes(st));
};

// Damage / extra expense. The CRM field name is not verified, so several likely names are tried (first one with an amount wins).
const EXTRA_KEYS = ['damage_charges', 'damage_charge', 'damage_amount', 'damage_total', 'damages_total', 'damages', 'damage', 'extra_charges', 'extra_charge', 'extra_expense', 'extra_expenses', 'other_charges'];
export const extraOf = (b: any) => {
  for (const k of EXTRA_KEYS) {
    const v = b?.[k];
    if (v == null || v === '') continue;
    let t = 0;
    if (Array.isArray(v)) t = v.reduce((s: number, i: any) => s + n(i?.amount ?? i?.charge ?? i?.price ?? i?.cost), 0);
    else if (typeof v === 'string' && v.trim().startsWith('[')) {
      try { t = (JSON.parse(v) || []).reduce((s: number, i: any) => s + n(i?.amount ?? i?.charge ?? i?.price ?? i?.cost), 0); } catch {}
    } else t = n(v);
    if (t > 0) return t;
  }
  return 0;
};

export const toStay = (b: any): Stay => {
  const roomCharge = n(b.total_room_charge || b.room_charge);
  const restaurant = n(b.food_total || b.restaurant_total);
  const bar = n(b.bar_total);
  const extra = extraOf(b);
  const discount = n(b.discount_amount);
  const total = n(b.grand_total) || Math.max(roomCharge + restaurant + bar + extra - discount, 0);
  const paid = n(b.total_paid || b.advance_payment);

  const totalAdults = n(b.adults_male) + n(b.adults_female) + n(b.adults_other) || n(b.adults) || 1;

  return {
    id: String(b.id ?? b.booking_id),
    room: String(b.room_number || (b.rooms || []).join(', ') || '-'),
    guest: b.guest_name || b.name || 'Guest',
    checkIn: b.checkin_time,
    checkOut: b.actual_checkout_time || b.checkout_time,
    approxCheckOut: b.approx_checkout_time,
    roomCharge,
    restaurant,
    bar,
    extra,
    discount,
    total,
    paid,
    pending: Math.max(total - paid, 0),
    mobile: b.mobile || b.phone || '',
    email: b.email || '',
    address: b.address || '',
    dob: b.dob || '',
    roomType: b.room_type || (b.room_types || []).join(', ') || 'Standard Room',
    adults: totalAdults,
    children: n(b.children),
    extraBeds: n(b.extra_beds),
    source: b.booking_source || (b.ota_platform ? `OTA (${b.ota_platform})` : '') || b.btc_company_name || 'Walk-in',
    checkedInBy: b.checked_in_by || 'Front Desk',
    mealPlan: b.meal_plan ? String(b.meal_plan).replace(/_/g, ' ') : 'EP (Room Only)',
    voucherNumber: b.voucher_number || '',
    advanceReceiptNo: b.advance_receipt_no || '',
    paymentMode: b.advance_payment_mode || b.final_payment_mode || 'Cash',
    splitCash: n(b.split_cash),
    splitCard: n(b.split_card),
    splitOnline: n(b.split_online),
    splitCheque: n(b.split_cheque),
    stayDuration: b.stay_duration_str || b.expected_stay_str || '',
    raw: b
  };
};