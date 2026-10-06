import React, { useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

export default function NoInternetBanner({ isOffline = false }) {
  if (!isOffline) return null;

  return (
    <Animated.View style={styles.banner}>
      <Text style={styles.text}>⚠️ Offline Mode — Connect to Internet to sync visits</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#DC2626', // Red offline alert
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justify: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
