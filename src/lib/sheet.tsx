import React from 'react';
import {Modal, Pressable, View, Text} from 'react-native';
import {c} from './theme';

// Reusable bottom sheet. Tap the dimmed area or press back to close.
export function BottomSheet({visible, onClose, title, children}: {visible: boolean; onClose: () => void; title?: string; children: React.ReactNode}) {
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <Pressable style={{flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end'}} onPress={onClose}>
        <Pressable onPress={() => {}} style={{backgroundColor: '#fff', padding: 20, paddingBottom: 32, borderTopLeftRadius: 16, borderTopRightRadius: 16, gap: 12}}>
          <View style={{alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.line}} />
          {!!title && <Text style={{fontWeight: '700', fontSize: 16, color: c.ink}}>{title}</Text>}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// A pill row used inside sheets for single-choice options.
export function Choice({options, value, onChange}: {options: string[]; value: string; onChange: (v: string) => void}) {
  return (
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
      {options.map(o => (
        <Pressable key={o} onPress={() => onChange(o)} style={{paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: value === o ? c.ink : '#fff', borderWidth: 1, borderColor: c.line}}>
          <Text style={{color: value === o ? '#fff' : c.text}}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}
