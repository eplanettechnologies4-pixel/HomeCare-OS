import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

export default function EmptyState({ icon, title = 'No Data Available', message = 'Nothing to show at the moment.' }) {
  return (
    <View style={styles.container}>
      <View style={styles.iconBox}>
        {/* Swapped placeholder emoji with downloaded empty.png icon asset */}
        <Image
          source={require('../../assets/images/empty.png')}
          style={styles.imageIcon}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justify: 'center',
    paddingVertical: 50,
    paddingHorizontal: 24,
  },
  iconBox: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justify: 'center',
    marginBottom: 14,
  },
  imageIcon: {
    width: 44,
    height: 44,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 6,
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
});
