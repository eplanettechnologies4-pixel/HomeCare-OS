import React, { useRef } from 'react';
import { Animated, TouchableWithoutFeedback, StyleSheet, Text, View } from 'react-native';

export default function AnimatedButton({
  onPress,
  title,
  children,
  style,
  textStyle,
  disabled = false,
  scaleTo = 0.95,
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: scaleTo,
      useNativeDriver: true,
      tension: 100,
      friction: 5,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 5,
    }).start();
  };

  return (
    <TouchableWithoutFeedback
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      disabled={disabled}
    >
      <Animated.View style={[styles.defaultBtn, style, disabled && styles.disabled, { transform: [{ scale: scaleAnim }] }]}>
        {children ? (
          children
        ) : (
          <Text style={[styles.defaultText, textStyle]}>{title}</Text>
        )}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  defaultBtn: {
    backgroundColor: '#6D28D9',
    borderRadius: 100,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justify: 'center',
    shadowColor: '#6D28D9',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  defaultText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.6,
  },
});
