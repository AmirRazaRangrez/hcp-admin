import React from 'react';import {useRouter} from 'expo-router';import {Text,Pressable,View} from 'react-native';import {api} from '../../src/api/client';import {Screen,Card,useLoad} from '../../src/lib/ui';import {useAuth} from '../../src/store/auth';import {c,when} from '../../src/lib/theme';
export default function More(){const{user}=useAuth();const r=useRouter();const{data,err,busy,at,reload}=useLoad(async()=>{const n=await api.notifications();useAuth.getState().setBadges({unread:n.filter((x:any)=>!x.read).length});return n},[],'notifications');
 return <Screen title="More" {...{busy,reload,at,err:err&&err.message.includes('endpoint')?null:err}}>
  <Card><Text style={{fontWeight:'700'}}>{user?.full_name||user?.username||'Hotel Admin'}</Text><Text style={{color:c.mute,fontSize:12,marginTop:2}}>Hotel City Park · Management Portal</Text></Card>
  <Text style={{fontWeight:'700',color:c.ink,fontSize:16}}>Notifications</Text>
  {data?.length?<Pressable onPress={async()=>{await api.markRead();reload()}}><Text style={{color:c.ink,fontWeight:'700'}}>Mark all read</Text></Pressable>:null}
  {!data&&<Card><Text style={{color:c.mute}}>No notifications yet.</Text></Card>}
  {(data||[]).map((n:any)=><Pressable key={n.id} onPress={async()=>{await api.markRead(n.id);reload()}}><Card style={{opacity:n.read?.6:1}}><Text style={{fontWeight:n.read?'400':'700'}}>{n.title}</Text><Text>{n.body}</Text><Text style={{color:c.mute,fontSize:12}}>{n.type} · {when(n.created_at)}</Text></Card></Pressable>)}
  <Card>
    <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
      <View style={{flex:1}}>
        <Text style={{fontWeight:'700',color:c.ink}}>Push Notifications</Text>
        <Text style={{color:c.mute,fontSize:12,marginTop:2}}>Active · Google FCM & Cloud Sync</Text>
      </View>
      <Pressable
        onPress={async()=>{
          try {
            const res = await api.sendTestPush();
            if (res?.success) alert('Test notification sent! Check your notification bar in a moment.');
            else alert('Test notification queued. Note: ' + (res?.error || 'Delivered to FCM'));
          } catch (e: any) {
            alert('Push test error: ' + e.message);
          }
        }}
        style={({pressed})=>({
          backgroundColor: pressed ? '#0F2A2ECC' : '#0F2A2E',
          paddingVertical: 7,
          paddingHorizontal: 12,
          borderRadius: 8
        })}>
        <Text style={{color:'#FFF',fontSize:12,fontWeight:'700'}}>Send Test</Text>
      </Pressable>
    </View>
  </Card>
  <Pressable onPress={()=>r.push('/bills')}><Card><Text style={{fontWeight:'700',color:c.ink}}>CRM Bills</Text><Text style={{color:c.mute,fontSize:12}}>Room Stays, Restaurant & Bar Guest Folios</Text></Card></Pressable>
  <Pressable onPress={()=>r.push('/analytics')}><Card><Text style={{fontWeight:'700',color:c.ink}}>Analytics</Text></Card></Pressable><Pressable onPress={()=>r.push('/settings')}><Card><Text style={{fontWeight:'700',color:c.ink}}>Settings</Text></Card></Pressable></Screen>}