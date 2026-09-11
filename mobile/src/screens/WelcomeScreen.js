import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Animated,
  Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');

export default function WelcomeScreen({ navigation }) {
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(0)).current;
  const buttonSlide = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(contentFade, {
          toValue: 1,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(buttonSlide, {
          toValue: 0,
          duration: 450,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#2E1065" />

      {/* Decorative Glow Circles */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <View style={styles.content}>
        {/* Animated eHealth Logo Badge */}
        <Animated.View
          style={[
            styles.logoWrapper,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Image
            source={require('../../assets/ehealth-logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Text Content */}
        <Animated.View style={[styles.textContainer, { opacity: contentFade }]}>
          <Text style={styles.badgeLabel}>HOSPITAL AT HOME</Text>
          <Text style={styles.heading}>World-Class Healthcare{'\n'}At Your Doorstep</Text>
          <Text style={styles.subheading}>
            Comprehensive home nursing, EMR vitals tracking, physiotherapy & 24/7 doctor oversight.
          </Text>
        </Animated.View>

        {/* Action Button: Exclusively Login Flow */}
        <Animated.View
          style={[
            styles.buttonContainer,
            {
              opacity: contentFade,
              transform: [{ translateY: buttonSlide }],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.loginButton}
            activeOpacity={0.88}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.loginButtonText}>Staff & Clinical Login →</Text>
          </TouchableOpacity>

          <Text style={styles.footerNote}>© 2026 eHealth Hospital At Home · SimpleJWT Secured</Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2E1065', // Deep luxurious purple background
  },
  glowTop: {
    position: 'absolute',
    top: -100,
    alignSelf: 'center',
    width: width * 1.2,
    height: width * 1.2,
    borderRadius: (width * 1.2) / 2,
    backgroundColor: 'rgba(109, 40, 217, 0.35)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -120,
    alignSelf: 'center',
    width: width * 1.1,
    height: width * 1.1,
    borderRadius: (width * 1.1) / 2,
    backgroundColor: 'rgba(124, 58, 237, 0.25)',
  },
  content: {
    flex: 1,
    justify: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 40,
    paddingBottom: 36,
  },
  logoWrapper: {
    marginTop: 20,
    shadowColor: '#A855F7',
    shadowOpacity: 0.5,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  logoImage: {
    width: width * 0.7,
    height: width * 0.7,
  },
  textContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  badgeLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F59E0B', // Gold accent from eHealth logo
    letterSpacing: 2.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 12,
  },
  subheading: {
    fontSize: 14,
    color: '#DDD6FE',
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 10,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
  },
  loginButton: {
    width: '100%',
    backgroundColor: '#F59E0B', // Gold gradient style matching logo "eHealth" text
    borderRadius: 100,
    paddingVertical: 18,
    alignItems: 'center',
    justify: 'center',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    marginBottom: 10,
  },
  loginButtonText: {
    color: '#1E1B4B', // Dark purple contrast
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  footerNote: {
    color: '#A78BFA',
    fontSize: 11,
    marginTop: 12,
    textAlign: 'center',
  },
});
