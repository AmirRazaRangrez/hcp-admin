import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../src/api/client';
import { Screen, Card, Badge, useLoad } from '../src/lib/ui';
import { c, money } from '../src/lib/theme';
import { ReceiptIcon } from '../src/lib/icons';

export default function ExpensesScreen() {
  const router = useRouter();

  const { data, err, busy, reload } = useLoad(async () => {
    try {
      const res = await api.expenses();
      return Array.isArray(res) ? res : (res?.data || res?.expenses || []);
    } catch {
      return [];
    }
  }, [], 'expenses-log');

  const expenses: any[] = data || [];

  const totalAmount = useMemo(() => {
    return expenses.reduce((sum, item) => sum + (Number(item.actual_used_amount || item.amount) || 0), 0);
  }, [expenses]);

  const cashAmount = useMemo(() => {
    return expenses
      .filter(item => String(item.payment_mode || 'cash').toLowerCase() === 'cash')
      .reduce((sum, item) => sum + (Number(item.actual_used_amount || item.amount) || 0), 0);
  }, [expenses]);

  return (
    <Screen
      title="Hotel Expenses"
      subtitle="Petty Cash & Operating Vouchers"
      back
      busy={busy}
      reload={reload}
      err={err}
    >
      {/* Header Metric Cards */}
      <View style={styles.metricsRow}>
        <View style={[styles.metricCard, { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }]}>
          <Text style={styles.metricLabel}>TOTAL EXPENSES</Text>
          <Text style={[styles.metricValue, { color: '#E11D48' }]}>{money(totalAmount)}</Text>
          <Text style={styles.metricSub}>{expenses.length} voucher(s) recorded</Text>
        </View>

        <View style={[styles.metricCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
          <Text style={styles.metricLabel}>PAID IN CASH</Text>
          <Text style={[styles.metricValue, { color: '#16A34A' }]}>{money(cashAmount)}</Text>
          <Text style={styles.metricSub}>Deducted from cash drawer</Text>
        </View>
      </View>

      {/* Expenses List */}
      {expenses.length === 0 && !busy ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No Expenses Recorded</Text>
          <Text style={styles.emptySub}>Operating expenses recorded in CRM will appear here.</Text>
        </Card>
      ) : (
        <View style={{ gap: 10, marginTop: 4 }}>
          {expenses.map((exp: any, idx: number) => {
            const amt = Number(exp.actual_used_amount || exp.amount) || 0;
            const category = String(exp.category || 'General').toUpperCase();
            return (
              <Card key={exp.id || idx} style={styles.expenseItem}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Text style={styles.voucherNo}>#{exp.voucher_no || exp.voucherNo || exp.id}</Text>
                      <Badge text={category} color="#E11D48" />
                    </View>
                    <Text style={styles.paidTo}>Paid to: {exp.paid_to || exp.paidTo || 'Bearer / Vendor'}</Text>
                    <Text style={styles.purpose}>{exp.purpose_details || exp.description || exp.notes || 'Operating Expense'}</Text>
                    <Text style={styles.meta}>
                      Logged by {exp.cashier_name || exp.logged_by || 'Front Desk'} • {exp.created_at ? new Date(exp.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : 'Today'}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.amountText}>{money(amt)}</Text>
                    <Badge text={exp.payment_mode || 'Cash'} color="#64748B" />
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12
  },
  metricCard: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '900',
    marginVertical: 2
  },
  metricSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B'
  },
  expenseItem: {
    padding: 14,
    borderRadius: 14
  },
  voucherNo: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F2A2E'
  },
  paidTo: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 2
  },
  purpose: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2
  },
  meta: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4
  },
  amountText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#E11D48',
    marginBottom: 4
  },
  emptyCard: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF'
  },
  emptyTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: c.ink,
    marginBottom: 4
  },
  emptySub: {
    color: c.mute,
    fontSize: 13,
    textAlign: 'center'
  }
});
