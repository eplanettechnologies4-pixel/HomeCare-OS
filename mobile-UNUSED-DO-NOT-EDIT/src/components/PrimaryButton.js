import React from 'react';
import { StyleSheet, Text } from 'react-native';
import AnimatedButton from './AnimatedButton';
import { colors, spacing } from '../theme';

export default function PrimaryButton({ title, onPress, disabled, style, textStyle, children }) {
  return (
    <AnimatedButton
      style={[styles.button, style]}
      onPress={onPress}
      disabled={disabled}
    >
      {children ? children : <Text style={[styles.buttonText, textStyle]}>{title}</Text>}
    </AnimatedButton>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.primary,
    borderRadius: spacing.pillRadius,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    justify: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  buttonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
});
