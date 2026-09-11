import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';

const badgeStyles = {
  Assigned: { bg: colors.warningBg, text: colors.warningText },
  'En Route': { bg: colors.primaryLight, text: colors.primary },
  Arrived: { bg: colors.primaryLight, text: colors.primary },
  InProgress: { bg: colors.primaryLight, text: colors.primary },
  Completed: { bg: colors.successBg, text: colors.successText },
  Pending: { bg: colors.warningBg, text: colors.warningText },
  Approved: { bg: colors.successBg, text: colors.successText },
  Rejected: { bg: colors.dangerBg, text: colors.dangerText },
  Present: { bg: colors.successBg, text: colors.successText },
  Late: { bg: colors.warningBg, text: colors.warningText },
  Leave: { bg: '#F3F4F6', text: colors.textMuted },
  Overdue: { bg: colors.dangerBg, text: colors.dangerText },
};

export default function StatusBadge({ status = 'Assigned', label, style, textStyle }) {
  const badge = badgeStyles[status] || badgeStyles.Assigned;

  return (
    <View style={[styles.badge, { backgroundColor: badge.bg }, style]}>
      <Text style={[styles.badgeText, { color: badge.text }, textStyle]}>
        {label || status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.pillRadius,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
