import React,{useEffect} from 'react';
import {Stack, useRouter} from 'expo-router';
import {Platform} from 'react-native';
import * as N from 'expo-notifications';
import Constants from 'expo-constants';
import {useAuth} from '../src/store/auth';
import {api} from '../src/api/client';

if(Platform.OS!=='web'){
 N.setNotificationHandler({handleNotification:async()=>({shouldShowAlert:true,shouldPlaySound:true,shouldSetBadge:true})});
 if(Platform.OS==='android'){
  N.setNotificationChannelAsync('high_importance_channel',{
   name:'High Importance Notifications',
   importance:N.AndroidImportance.MAX,
   vibrationPattern:[0,250,250,250],
   lightColor:'#0F2A2E',
   sound:'default',
  });
 }
}

function handleNotificationNavigation(router: any, response: any) {
  try {
    const data = response?.notification?.request?.content?.data || {};
    const title = response?.notification?.request?.content?.title || '';
    const body = response?.notification?.request?.content?.body || '';
    const notifType = String(data.type || (data as any)?.notifType || '').toLowerCase();
    console.log('[Push DeepLink] Routing for notification type:', notifType, data);

    if (notifType.includes('discount') || notifType.includes('approval')) {
      // 1. Discount Permission: open Discounts tab (Pending review)
      router.push('/(tabs)/approvals');
    } else if (notifType.includes('checkin') || notifType.includes('stay') || title.toLowerCase().includes('check-in')) {
      // 2. Check-In: open the checked-in room directly
      const titleMatch = (title + ' ' + body).match(/Room\s*([0-9A-Za-z]+)/i);
      const titleRoom = titleMatch ? titleMatch[1].trim() : '';
      const room = String(
        data.room_number ||
        data.room ||
        (Array.isArray(data.roomNumbers) ? data.roomNumbers[0] : '') ||
        titleRoom ||
        data.bookingId ||
        ''
      ).trim();
      if (room) {
        router.push({
          pathname: '/room',
          params: {
            id: room,
            room: room,
            guest: data.guestName || data.guest || '',
            total: String(data.totalPaid || data.total || ''),
            paid: String(data.totalPaid || ''),
            phone: data.phone || data.mobile || '',
            bookingId: String(data.bookingId || '')
          }
        });
      } else {
        router.push('/occupied');
      }
    } else if (notifType.includes('checkout')) {
      // 3. Check-Out: go to last payment / settled bill or Activity feed
      if (data.bookingId) {
        router.push({ pathname: '/bill', params: { dept: 'Room', id: String(data.bookingId) } });
      } else {
        router.push('/(tabs)/activity');
      }
    } else if (notifType.includes('store') || notifType.includes('vendor')) {
      router.push('/(tabs)/store');
    } else if (notifType.includes('restaurant') || notifType.includes('bar')) {
      router.push('/(tabs)/activity');
    } else {
      // Default to Home if notification type is unknown or general
      router.push('/(tabs)');
    }
  } catch (err) {
    console.warn('[Push DeepLink] Navigation error:', err);
  }
}

export default function Root(){
  const router = useRouter();
  const {ready,token,load}=useAuth();
  useEffect(()=>{
    load();
    if(Platform.OS==='web' && typeof document !== 'undefined'){
      const fontLinkId = 'google-font-merriweather-sans';
      if(!document.getElementById(fontLinkId)){
        const pre1 = document.createElement('link');
        pre1.rel = 'preconnect';
        pre1.href = 'https://fonts.googleapis.com';
        document.head.appendChild(pre1);

        const pre2 = document.createElement('link');
        pre2.rel = 'preconnect';
        pre2.href = 'https://fonts.gstatic.com';
        pre2.crossOrigin = 'anonymous';
        document.head.appendChild(pre2);

        const link = document.createElement('link');
        link.id = fontLinkId;
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Merriweather+Sans:ital,wght@0,300..800;1,300..800&display=swap';
        document.head.appendChild(link);
      }

      const styleId = 'global-admin-web-styles';
      if(!document.getElementById(styleId)){
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
          *:focus, *:focus-visible { outline: none !important; box-shadow: none !important; }
          html, body, #root, * {
            font-family: 'Merriweather Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          }
          html, body, #root {
            height: 100%;
            height: 100dvh;
            max-height: 100%;
            margin: 0;
            padding: 0;
            -webkit-user-select: none !important;
            user-select: none !important;
            cursor: default !important;
            caret-color: transparent !important;
          }
          *, *::before, *::after {
            box-sizing: border-box;
            -webkit-user-select: none;
            user-select: none;
            caret-color: transparent;
          }
          input, textarea, [contenteditable="true"] {
            -webkit-user-select: text !important;
            user-select: text !important;
            cursor: text !important;
            caret-color: auto !important;
          }
          button, a, [role="button"], [role="tab"] {
            cursor: pointer !important;
          }
        `;
        document.head.appendChild(style);
      }
    }
  },[]);
  useEffect(() => {
    if (Platform.OS === 'web') return;

    let isMounted = true;
    let tokenSub: N.Subscription | null = null;
    let notifSub: N.Subscription | null = null;
    let responseSub: N.Subscription | null = null;

    (async () => {
      try {
        if (Platform.OS === 'android') {
          await N.setNotificationChannelAsync('high_importance_channel', {
            name: 'High Importance Notifications',
            importance: N.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#0F2A2E',
            sound: 'default',
            enableVibrate: true,
            showBadge: true,
          });
        }

        const { status: existingStatus } = await N.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await N.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          console.warn('[Push] Notification permission not granted');
          return;
        }

        // 1. Primary: Native FCM Device Token for Android
        try {
          const devToken = await N.getDevicePushTokenAsync();
          if (devToken?.data && isMounted) {
            console.log('[Push] Registered FCM Device Token:', devToken.data.slice(0, 16) + '...');
            await api.pushToken(devToken.data);
          }
        } catch (e) {
          console.warn('[Push] Device push token error:', e);
        }

        // 2. Secondary fallback: Expo Push Token
        try {
          const t = await N.getExpoPushTokenAsync({
            projectId: Constants.expoConfig?.extra?.eas?.projectId
          });
          if (t?.data && isMounted) {
            await api.pushToken(t.data);
          }
        } catch (e) {
          // EAS project id optional in local APK
        }

        tokenSub = N.addPushTokenListener((token) => {
          if (token?.data) api.pushToken(token.data);
        });

        notifSub = N.addNotificationReceivedListener((notification) => {
          console.log('[Push] Notification received in app:', notification.request.content.title);
        });

        responseSub = N.addNotificationResponseReceivedListener((response) => {
          handleNotificationNavigation(router, response);
        });

        // Handle cold-start launch when app is opened directly by tapping a notification
        N.getLastNotificationResponseAsync().then((response) => {
          if (response && isMounted) {
            const notifDate = response?.notification?.date ? (typeof response.notification.date === 'number' ? response.notification.date : new Date(response.notification.date).getTime()) : 0;
            const ageMs = notifDate > 0 ? (Date.now() - notifDate) : 0;
            // Only navigate if notification response was received in the last 15 seconds (prevents stale cached intent redirects)
            if (notifDate === 0 || ageMs < 15000) {
              handleNotificationNavigation(router, response);
            }
          }
        }).catch(() => {});

      } catch (err) {
        console.warn('[Push] Push registration lifecycle error:', err);
      }
    })();

    return () => {
      isMounted = false;
      tokenSub?.remove();
      notifSub?.remove();
      responseSub?.remove();
    };
  }, [ready, token]);
 return <Stack screenOptions={{headerShown:false}}/>;
}
