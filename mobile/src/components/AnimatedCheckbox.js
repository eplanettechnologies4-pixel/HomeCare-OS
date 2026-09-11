import React, { useRef, useEffect } from 'react';
import { Animated, TouchableOpacity, StyleSheet, Text, View } from 'react-native';

export default function AnimatedCheckbox({ checked, onPress, label, style }) {
  const scaleAnim = useRef(new Animated.Value(checked ? 1 : 0)).current;

  useEffect(() => {
    if (checked) {
      scaleAnim.setValue(0);
      Animated.sequence([
        Animated.spring(scaleAnim, { toValue: 1.2, useNativeDriver: true, friction: 4, tension: 80 }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 6 }),
      ]).start();
    } else {
      Animated.timing(scaleAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    }
  }, [checked]);

  return (
    <TouchableOpacity style={[styles.container, style]} activeOpacity={0.8} onPress={onPress}>
      <View style={[styles.box, checked && styles.boxChecked]}>
        <Animated.Text style={[styles.checkmark, { transform: [{ scale: scaleAnim }] }]}>
          ✓
        </Animated.Text>
      </View>
      {label && <Text style={styles.label}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#C4B8E8',
    backgroundColor: '#FAFAF8',
    alignItems: 'center',
    justify: 'center',
    marginRight: 12,
  },
  boxChecked: {
    backgroundColor: '#6D28D9',
    borderColor: '#6D28D9',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  label: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '600',
  },
});
