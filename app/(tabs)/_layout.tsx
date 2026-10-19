import React, { useState, useEffect, useRef } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, Pressable, StyleSheet, Platform, Animated, Modal, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/store/auth';
import { api, errMsg } from '../../src/api/client';
import { c, money, when } from '../../src/lib/theme';
import {
  HomeTabIcon,
  DiscountsTabIcon,
  ActivityTabIcon,
  StoreTabIcon,
  AnalyticsTabIcon
} from '../../src/lib/icons';

const getTabIcon = (name: string, focused: boolean, color: string) => {
  const size = focused ? 20 : 20;
  const strokeWidth = focused ? 2.5 : 1.8;
  switch (name) {
    case 'index':
      return <HomeTabIcon size={size} color={color} strokeWidth={strokeWidth} />;
    case 'approvals':
      return <DiscountsTabIcon size={size} color={color} strokeWidth={strokeWidth} />;
    case 'activity':
      return <ActivityTabIcon size={size} color={color} strokeWidth={strokeWidth} />;
    case 'store':
      return <StoreTabIcon size={size} color={color} strokeWidth={strokeWidth} />;
    case 'analytics':
      return <AnalyticsTabIcon size={size} color={color} strokeWidth={strokeWidth} />;
    default:
      return <HomeTabIcon size={size} color={color} strokeWidth={strokeWidth} />;
  }
};

const getTabLabel = (name: string, options: any) => {
  if (options?.title) return options.title;
  switch (name) {
    case 'index': return 'Home';
    case 'approvals': return 'Discounts';
    case 'activity': return 'Activity';
    case 'store': return 'Store';
    case 'analytics': return 'Analytics';
    default: return name;
  }
};

// Global High-Priority Permission Popup Modal for Admin Panel
function GlobalApprovalModal({ badges }: { badges: any }) {
  const [pendingItem, setPendingItem] = useState<any>(null);
  const [dismissedId, setDismissedId] = useState<any>(null);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchPending = async () => {
      try {
        const res = await api.approvals();
        const list = Array.isArray(res) ? res : (res?.pending || []);
        const firstPending = list.find((x: any) => (x.status || 'PENDING').toUpperCase() === 'PENDING');
        if (active) {
          if (firstPending && firstPending.id !== dismissedId) {
            setPendingItem(firstPending);
          } else if (!firstPending) {
            setPendingItem(null);
          }
        }
      } catch {}
    };

    if (badges?.approvals > 0) {
      fetchPending();
    } else {
      setPendingItem(null);
    }

    const interval = setInterval(fetchPending, 3500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [badges?.approvals, dismissedId]);

  if (!pendingItem) return null;

  const handleAction = async (kind: 'approve' | 'reject') => {
    setActing(true);
    try {
      if (kind === 'approve') {
        await api.approve(pendingItem.id);
      } else {
        await api.reject(pendingItem.id);
      }
      setPendingItem(null);
      const remaining = Math.max(0, (badges?.approvals || 1) - 1);
      useAuth.getState().setBadges({ approvals: remaining });
    } catch (e: any) {
      Alert.alert('Action Failed', errMsg(e));
    } finally {
      setActing(false);
    }
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible={!!pendingItem}
      onRequestClose={() => setDismissedId(pendingItem.id)}
    >
      <View style={modalStyles.backdrop}>
        <View style={modalStyles.modalCard}>
          {/* Header */}
          <View style={modalStyles.modalHeader}>
            <View style={modalStyles.headerTitleBox}>
              <Text style={modalStyles.headerBadge}>⚡ PERMISSION REQUEST</Text>
              <Text style={modalStyles.headerTitle}>
                {pendingItem.room_number ? `Room ${pendingItem.room_number}` : `Bill #${pendingItem.bill_number || pendingItem.bill_id || pendingItem.id}`}
              </Text>
            </View>
            <Pressable
              onPress={() => setDismissedId(pendingItem.id)}
              hitSlop={12}
              style={modalStyles.closeBtn}
            >
              <Text style={modalStyles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* Body with all details */}
          <View style={modalStyles.modalBody}>
            {pendingItem.guest_name ? (
              <View style={modalStyles.row}>
                <Text style={modalStyles.label}>Guest Name</Text>
                <Text style={modalStyles.valBold}>{pendingItem.guest_name}</Text>
              </View>
            ) : null}

            {pendingItem.members ? (
              <View style={modalStyles.row}>
                <Text style={modalStyles.label}>Guest Members</Text>
                <Text style={modalStyles.valBold}>{pendingItem.members}</Text>
              </View>
            ) : null}

            {pendingItem.expected_checkout ? (
              <View style={modalStyles.row}>
                <Text style={modalStyles.label}>Expected Checkout</Text>
                <Text style={[modalStyles.valBold, { color: '#8c5d77' }]}>
                  {pendingItem.expected_checkout}
                </Text>
              </View>
            ) : null}

            <View style={modalStyles.row}>
              <Text style={modalStyles.label}>Total Tariff</Text>
              <Text style={modalStyles.val}>{money(pendingItem.current_total)}</Text>
            </View>

            <View style={[modalStyles.row, modalStyles.highlightRow]}>
              <Text style={[modalStyles.label, { color: '#B45309', fontWeight: '700' }]}>
                Permission Discount %
              </Text>
              <Text style={modalStyles.valDiscount}>
                {pendingItem.discount_pct}% (− {money(pendingItem.discount)})
              </Text>
            </View>

            <View style={[modalStyles.row, { borderBottomWidth: 0, paddingTop: 6 }]}>
              <Text style={[modalStyles.label, { fontWeight: '800', color: '#8c5d77' }]}>
                Net Payable
              </Text>
              <Text style={modalStyles.valNet}>
                {money(pendingItem.final_amount)}
              </Text>
            </View>

            {pendingItem.reason ? (
              <View style={modalStyles.reasonBox}>
                <Text style={modalStyles.reasonText}>{pendingItem.reason}</Text>
              </View>
            ) : null}
          </View>

          {/* Action Buttons: Approve / Reject */}
          <View style={modalStyles.btnRow}>
            <Pressable
              disabled={acting}
              onPress={() => handleAction('reject')}
              style={({ pressed }) => [
                modalStyles.actionBtn,
                modalStyles.rejectBtn,
                pressed && { opacity: 0.85 }
              ]}
            >
              <Text style={modalStyles.rejectText}>✕ Reject</Text>
            </Pressable>

            <Pressable
              disabled={acting}
              onPress={() => handleAction('approve')}
              style={({ pressed }) => [
                modalStyles.actionBtn,
                modalStyles.approveBtn,
                pressed && { opacity: 0.85 }
              ]}
            >
              <Text style={modalStyles.approveText}>
                {acting ? 'Processing...' : `✓ Approve ${pendingItem.discount_pct ? pendingItem.discount_pct + '% ' : ''}Discount`}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Ultra-Modern Apple-Grade Bottom Tab Bar with Safe-Area Insets and Clean Sliding Animation
function CurvedBottomTabBar({ state, descriptors, navigation, badges }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 0 : Math.max(insets.bottom, 12);

  const visibleRoutes = state.routes.filter(
    (r: any) => r.name !== 'more' && descriptors[r.key]?.options?.href !== null
  );

  const activeIndex = visibleRoutes.findIndex(
    (r: any) => r.key === state.routes[state.index]?.key
  );
  const safeActiveIndex = activeIndex >= 0 ? activeIndex : 0;

  const [targetIndex, setTargetIndex] = useState(safeActiveIndex);

  useEffect(() => {
    setTargetIndex(safeActiveIndex);
  }, [safeActiveIndex]);

  const isWeb = Platform.OS === 'web';
  const tabPercent = visibleRoutes.length > 0 ? 100 / visibleRoutes.length : 20;

  const [barWidth, setBarWidth] = useState(390);
  const tabWidth = barWidth > 0 ? barWidth / visibleRoutes.length : 78;
  const slideAnim = useRef(new Animated.Value(safeActiveIndex)).current;

  useEffect(() => {
    if (!isWeb) {
      Animated.spring(slideAnim, {
        toValue: targetIndex,
        damping: 24,
        stiffness: 280,
        mass: 0.7,
        useNativeDriver: true
      }).start();
    }
  }, [targetIndex, isWeb]);

  return (
    <View
      style={[
        styles.barContainer,
        {
          height: (Platform.OS === 'web' ? 60 : 62) + bottomInset,
          paddingBottom: bottomInset
        }
      ]}
      onLayout={!isWeb ? (e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - barWidth) > 1) {
          setBarWidth(w);
        }
      } : undefined}
    >
      {/* Top Border Accent Line */}
      <View style={styles.topAccentLine} />

      {/* Fluid Sliding Active Indicator */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.slidingContainer,
          isWeb
            ? ({
                left: 0,
                width: `${tabPercent}%`,
                transform: [{ translateX: `${targetIndex * 100}%` as any }],
                transition: 'transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1)',
                willChange: 'transform'
              } as any)
            : {
                left: 0,
                width: tabWidth,
                transform: [
                  {
                    translateX: slideAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, tabWidth]
                    })
                  }
                ]
              }
        ]}
      >
        {/* Active Brass/Gold Circle Indicator (Centered directly behind the icon) */}
        <View style={styles.activeCircle} />
      </Animated.View>

      {/* 5 Equal Tabs Row */}
      <View style={styles.tabRow}>
        {visibleRoutes.map((route: any, idx: number) => {
          const { options } = descriptors[route.key];
          const isFocused = idx === targetIndex;
          const label = getTabLabel(route.name, options);
          const badge = route.name === 'approvals' ? badges?.approvals : options.tabBarBadge;

          const onPress = () => {
            if (idx === targetIndex) return;
            setTargetIndex(idx);

            const doNavigate = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            if (typeof React.startTransition === 'function') {
              React.startTransition(doNavigate);
            } else {
              requestAnimationFrame(doNavigate);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={({ pressed }) => [
                styles.tabItem,
                isWeb ? ({
                  cursor: 'pointer',
                  outline: 'none',
                  userSelect: 'none',
                  WebkitTapHighlightColor: 'transparent'
                } as any) : undefined
              ]}
            >
              <View style={styles.tabItemContent}>
                {/* Fixed Icon Position */}
                <View
                  style={[
                    styles.iconBox,
                    isWeb ? ({
                      transition: 'transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1)',
                      transform: isFocused ? 'scale(1.05)' : 'scale(1)'
                    } as any) : (
                      isFocused ? { transform: [{ scale: 1.05 }] } : undefined
                    )
                  ]}
                >
                  {getTabIcon(route.name, isFocused, isFocused ? '#FFFFFF' : '#64748B')}
                  {badge ? (
                    <View style={styles.badgePill}>
                      <Text style={styles.badgeText}>{badge}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Tab Label */}
                <Text
                  numberOfLines={1}
                  style={isFocused ? styles.activeLabel : styles.inactiveLabel}
                >
                  {label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const b = useAuth(s => s.badges);

  return (
    <>
      <Tabs
        tabBar={props => <CurvedBottomTabBar {...props} badges={b} />}
        screenOptions={{
          headerShown: false
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home'
          }}
        />
        <Tabs.Screen
          name="approvals"
          options={{
            title: 'Discounts',
            tabBarBadge: b.approvals ? b.approvals : undefined
          }}
        />
        <Tabs.Screen
          name="activity"
          options={{
            title: 'Activity'
          }}
        />
        <Tabs.Screen
          name="store"
          options={{
            title: 'Store'
          }}
        />
        <Tabs.Screen
          name="analytics"
          options={{
            title: 'Analytics'
          }}
        />
        {/* Hide legacy more tab from tab bar */}
        <Tabs.Screen
          name="more"
          options={{
            href: null
          }}
        />
      </Tabs>

      {/* Global Real-Time Approval Permission Popup */}
      <GlobalApprovalModal badges={b} />
    </>
  );
}

const styles = StyleSheet.create({
  barContainer: {
    position: 'relative',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#f2e6ee',
    shadowColor: '#0F2A2E',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
    zIndex: 100,
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)'
    } : {})
  },
  topAccentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: '#8c5d77',
    zIndex: 1
  },
  slidingContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 2,
    overflow: 'hidden'
  },
  activeCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#8c5d77',
    marginTop: 4,
    zIndex: 3,
    shadowColor: '#8c5d77',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 4
  },
  tabRow: {
    flexDirection: 'row',
    height: Platform.OS === 'web' ? 60 : 62,
    width: '100%',
    overflow: 'hidden',
    zIndex: 4
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    height: '100%'
  },
  tabItemContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    paddingBottom: 2,
    width: '100%'
  },
  iconBox: {
    height: 38,
    width: 38,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    zIndex: 10
  },
  activeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#8c5d77',
    marginTop: 2
  },
  inactiveLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2
  },
  badgePill: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: '#E11D48',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    zIndex: 15
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800'
  }
});

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
    zIndex: 99999
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 420,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  modalHeader: {
    backgroundColor: '#8c5d77',
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  headerTitleBox: {
    flex: 1
  },
  headerBadge: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 2
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800'
  },
  closeBtn: {
    padding: 6
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '700'
  },
  modalBody: {
    padding: 16
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  highlightRow: {
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 8,
    borderRadius: 8,
    marginVertical: 4,
    borderBottomWidth: 0
  },
  label: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '600',
    flex: 1,
    marginRight: 6
  },
  val: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '700'
  },
  valBold: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '800',
    textAlign: 'right',
    flexShrink: 1
  },
  valDiscount: {
    fontSize: 13.5,
    color: '#B45309',
    fontWeight: '800'
  },
  valNet: {
    fontSize: 15,
    color: '#2563EB',
    fontWeight: '900'
  },
  reasonBox: {
    marginTop: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  reasonText: {
    fontSize: 11.5,
    color: '#64748B',
    fontStyle: 'italic'
  },
  btnRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  rejectBtn: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5'
  },
  rejectText: {
    color: '#DC2626',
    fontWeight: '800',
    fontSize: 13
  },
  approveBtn: {
    backgroundColor: '#16A34A',
    flex: 1.4,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3
  },
  approveText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13
  }
});