import React from 'react';
import {View, Text} from 'react-native';
import {c, money} from './theme';

export type Slice = {label: string; value: number; color?: string};
const PALETTE = [c.ink, c.brass, c.ok, c.warn, '#5B7C99'];

// Horizontal bars, scaled to the largest value.
export function BarChart({data}: {data: Slice[]}) {
  const max = Math.max(1, ...data.map(d => d.value || 0));
  return (
    <View>
      {data.map((d, i) => (
        <View key={d.label} style={{marginBottom: 10}}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
            <Text>{d.label}</Text>
            <Text style={{fontWeight: '600'}}>{money(d.value)}</Text>
          </View>
          <View style={{height: 10, backgroundColor: c.line, borderRadius: 5, marginTop: 4}}>
            <View style={{height: 10, width: `${((d.value || 0) / max) * 100}%`, backgroundColor: d.color || PALETTE[i % PALETTE.length], borderRadius: 5}} />
          </View>
        </View>
      ))}
    </View>
  );
}

// One stacked bar showing each slice's share, with a legend underneath.
export function ShareBar({data}: {data: Slice[]}) {
  const total = data.reduce((a, d) => a + (d.value || 0), 0);
  if (!total) return <Text style={{color: c.mute}}>No collections in this period.</Text>;
  return (
    <View>
      <View style={{flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: c.line}}>
        {data.map((d, i) => (d.value > 0 ? <View key={d.label} style={{flex: d.value, backgroundColor: d.color || PALETTE[i % PALETTE.length]}} /> : null))}
      </View>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8}}>
        {data.map((d, i) => (
          <View key={d.label} style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
            <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: d.color || PALETTE[i % PALETTE.length]}} />
            <Text style={{color: c.text}}>{d.label} {Math.round(((d.value || 0) / total) * 100)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
