import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, StatusBar, Animated, Dimensions } from 'react-native';
import { AuthService } from '../services/api';

const { width } = Dimensions.get('window');

export default function SplashScreen({ navigation }) {
  const logoScale = useRef(new Animated.Value(0.75)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, friction: 6, tension: 40, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      const user = AuthService.getCurrentUser();
      if (user) {
        if (user.role === 'FAMILY' || user.role === 'patient_family' || user.role === 'Family') {
          navigation.replace('FamilyHome');
        } else if (user.role === 'CARE_MANAGER' || user.role === 'BRANCH_MANAGER' || user.role === 'Care Manager') {
          navigation.replace('ManagerView');
        } else {
          navigation.replace('Home');
        }
      } else {
        navigation.replace('Welcome');
      }
    }, 1600);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#2E1065" />
      <View style={styles.glowTop} />

      <Animated.View style={[styles.logoBox, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <Image
          source={require('../../assets/ehealth-logo.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <Text style={styles.appTitle}>eHealth Hospital At Home</Text>

        <View style={styles.taglineBox}>
          <Image
            source={require('../../assets/images/stehthoscope.png')}
            style={styles.stethIcon}
            resizeMode="contain"
          />
          <Text style={styles.tagline}>Hospital Care. Delivered at Home.</Text>
        </View>
      </Animated.View>

      <Text style={styles.versionText}>v2.4.0 · Powered by SimpleJWT</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2E1065',
    alignItems: 'center',
    justify: 'center',
    paddingHorizontal: 24,
  },
  glowTop: {
    position: 'absolute',
    top: -100,
    width: width * 1.2,
    height: width * 1.2,
    borderRadius: (width * 1.2) / 2,
    backgroundColor: 'rgba(109, 40, 217, 0.4)',
  },
  logoBox: {
    alignItems: 'center',
  },
  logoImage: {
    width: width * 0.65,
    height: width * 0.65,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 10,
    textAlign: 'center',
  },
  taglineBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  stethIcon: {
    width: 22,
    height: 22,
    marginRight: 6,
  },
  tagline: {
    fontSize: 13,
    color: '#F59E0B',
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  versionText: {
    position: 'absolute',
    bottom: 30,
    color: '#A78BFA',
    fontSize: 11,
  },
});
