import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AnimatedButton from '../components/AnimatedButton';

const { width } = Dimensions.get('window');
const PURPLE = '#6D28D9', WHITE = '#FFFFFF';

const slides = [
  {
    id: '1',
    icon: '📍',
    title: 'Automatic Visit Tracking',
    sub: 'Geofence auto-detects arrival within 100 meters. Zero manual location entry required.',
  },
  {
    id: '2',
    icon: '📊',
    title: 'Instant Vitals & EMR Notes',
    sub: 'Record patient vitals, care checklists, and immutable nurse notes directly from the field.',
  },
  {
    id: '3',
    icon: '🚨',
    title: 'Live Sync & Emergency SOS',
    sub: 'Stay connected with care managers and broadcast 1-tap emergency alerts in real-time.',
  },
];

export default function OnboardingScreen({ navigation }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef(null);

  const handleScroll = (e) => {
    const slide = Math.round(e.nativeEvent.contentOffset.x / width);
    if (slide !== activeIndex) {
      setActiveIndex(slide);
    }
  };

  const handleFinish = () => {
    navigation.replace('Login');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {/* Top Skip Button */}
      <View style={styles.topBar}>
        <View />
        <TouchableOpacity onPress={handleFinish} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Swipeable Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {slides.map((s) => (
          <View key={s.id} style={styles.slide}>
            <View style={styles.iconCircle}>
              <Text style={styles.icon}>{s.icon}</Text>
            </View>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.sub}>{s.sub}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Bottom Controls */}
      <View style={styles.bottomBar}>
        {/* Pagination Dots */}
        <View style={styles.pagination}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                activeIndex === i ? styles.activeDot : styles.inactiveDot,
              ]}
            />
          ))}
        </View>

        {activeIndex === slides.length - 1 ? (
          <AnimatedButton style={styles.startBtn} onPress={handleFinish}>
            <Text style={styles.startBtnText}>Get Started →</Text>
          </AnimatedButton>
        ) : (
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={() => {
              scrollRef.current?.scrollTo({ x: (activeIndex + 1) * width, animated: true });
            }}
          >
            <Text style={styles.nextBtnText}>Next →</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: WHITE },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 10 },
  skipBtn: { padding: 8 },
  skipText: { color: '#6B7280', fontSize: 14, fontWeight: '600' },
  slide: { width, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  iconCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  icon: { fontSize: 44 },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 12 },
  sub: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  bottomBar: { paddingHorizontal: 28, paddingBottom: 30, alignItems: 'center' },
  pagination: { flexDirection: 'row', marginBottom: 24 },
  dot: { height: 8, borderRadius: 4, marginHorizontal: 4 },
  activeDot: { width: 24, backgroundColor: PURPLE },
  inactiveDot: { width: 8, backgroundColor: '#E5E7EB' },
  startBtn: { width: '100%', backgroundColor: PURPLE, borderRadius: 100, paddingVertical: 16, alignItems: 'center' },
  startBtnText: { color: WHITE, fontSize: 16, fontWeight: '700' },
  nextBtn: { paddingVertical: 12, paddingHorizontal: 20 },
  nextBtnText: { color: PURPLE, fontSize: 15, fontWeight: '700' },
});
