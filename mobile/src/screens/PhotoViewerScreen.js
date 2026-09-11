import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useToast } from '../components/Toast';

const { width, height } = Dimensions.get('window');

export default function PhotoViewerScreen({ route, navigation }) {
  const { showToast } = useToast();
  const { photos = [], initialIndex = 0 } = route.params || {
    photos: [require('../../assets/ehealth-logo.png')],
    initialIndex: 0,
  };

  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const handleScroll = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    if (idx !== currentIndex) {
      setCurrentIndex(idx);
    }
  };

  const handleDownload = () => {
    showToast('Photo saved to gallery / downloads folder', 'success');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {/* Top Overlay Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>

        <Text style={styles.counterText}>
          {photos.length > 0 ? `${currentIndex + 1} of ${photos.length}` : '1 of 1'}
        </Text>

        <TouchableOpacity style={styles.actionBtn} onPress={handleDownload}>
          <Text style={styles.actionText}>📥</Text>
        </TouchableOpacity>
      </View>

      {/* Full-Screen Scrollable Image Viewer */}
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {photos.map((p, index) => (
          <View key={index} style={styles.imageContainer}>
            {typeof p === 'number' || typeof p === 'object' ? (
              <Image source={p} style={styles.image} resizeMode="contain" />
            ) : (
              <View style={styles.placeholderBox}>
                <Text style={styles.placeholderIcon}>📷</Text>
                <Text style={styles.placeholderText}>Clinical Visit Attachment #{index + 1}</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justify: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    zIndex: 10,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justify: 'center',
  },
  closeText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  counterText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justify: 'center',
  },
  actionText: { fontSize: 18 },
  imageContainer: { width, height: height * 0.8, alignItems: 'center', justifyContent: 'center' },
  image: { width: width * 0.92, height: height * 0.75 },
  placeholderBox: { width: width * 0.85, height: width * 0.85, backgroundColor: '#1F2937', borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  placeholderIcon: { fontSize: 48, marginBottom: 12 },
  placeholderText: { color: '#9CA3AF', fontSize: 14, fontWeight: '600' },
});
