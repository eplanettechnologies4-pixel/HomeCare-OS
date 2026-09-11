import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, Animated, Keyboard, Modal, Image, Dimensions, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthService } from '../services/api';
import AnimatedButton from '../components/AnimatedButton';
import { useToast } from '../components/Toast';
import { colors, spacing, typography } from '../theme';

const { width } = Dimensions.get('window');

export default function LoginScreen({ navigation }) {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Modals for Unified Auth Requirements (Item 21)
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  // Password Change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Forgot Password state
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  // Entrance animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const formSlide = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, friction: 6, tension: 40, useNativeDriver: true }),
      Animated.timing(formSlide, { toValue: 0, duration: 550, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleLogin = async () => {
    Keyboard.dismiss();
    if (!email.trim() || !password) {
      showToast('Please enter your username/email and password', 'error');
      return;
    }

    setLoading(true);
    const result = await AuthService.login(email, password);
    setLoading(false);

    if (!result.success) {
      showToast(result.error, 'error');
      return;
    }

    const { user } = result.data;
    showToast(`Welcome back, ${user.name}!`, 'success');

    // Role-based routing (handles both uppercase and lowercase DRF roles)
    const roleUpper = (user.role || '').toUpperCase();
    if (roleUpper === 'FAMILY' || roleUpper === 'PATIENT_FAMILY') {
      navigation.replace('FamilyHome');
    } else if (roleUpper === 'CARE_MANAGER' || roleUpper === 'BRANCH_MANAGER') {
      navigation.replace('ManagerView');
    } else if (user.must_change_password) {
      setShowChangePasswordModal(true);
    } else {
      navigation.replace('Home');
    }
  };

  const handleConfirmPasswordChange = async () => {
    if (!newPassword || newPassword.length < 6) {
      showToast('New password must be at least 6 characters', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'error');
      return;
    }

    setChangingPassword(true);
    const res = await AuthService.changePassword(password, newPassword);
    setChangingPassword(false);

    if (res.success) {
      setShowChangePasswordModal(false);
      showToast('Temporary password updated successfully!', 'success');
      navigation.replace('Home');
    } else {
      showToast(res.error, 'error');
    }
  };

  const handleRequestOtp = async () => {
    if (!forgotEmail || !forgotEmail.includes('@')) {
      showToast('Please enter a valid email address', 'error');
      return;
    }
    setResettingPassword(true);
    const res = await AuthService.requestPasswordReset(forgotEmail);
    setResettingPassword(false);

    if (res.success) {
      setForgotStep(2);
      showToast(res.message, 'info');
    } else {
      showToast(res.error, 'error');
    }
  };

  const handleResetPassword = async () => {
    if (!resetOtp || resetOtp.length < 4) {
      showToast('Please enter the 4-digit OTP code', 'error');
      return;
    }
    if (resetNewPassword && resetNewPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    setResettingPassword(true);
    const res = await AuthService.confirmPasswordReset(forgotEmail, resetOtp, resetNewPassword);
    setResettingPassword(false);

    if (res.success) {
      setShowForgotModal(false);
      setForgotStep(1);
      setForgotEmail('');
      setResetOtp('');
      setResetNewPassword('');
      showToast(res.message, 'success');
    } else {
      showToast(res.error, 'error');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Soft Purple Top Accent */}
      <View style={styles.softGlow} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.wrapper, { opacity: fadeAnim }]}>

          <Animated.View style={[styles.logoBox, { transform: [{ scale: logoScale }] }]}>
            <Image
              source={require('../../assets/ehealth-logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </Animated.View>

          <Animated.View style={[styles.formBox, { transform: [{ translateY: formSlide }] }]}>
            <View style={styles.titleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Account Sign In</Text>
                <Text style={styles.subtitle}>Clinical Staff, Managers & Family Accounts</Text>
              </View>
              <Image
                source={require('../../assets/images/dcotors.png')}
                style={styles.doctorIcon}
                resizeMode="contain"
              />
            </View>

            <Text style={styles.label}>Username or Email</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. nurse_ayesha or name@ehealth.com"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter password"
              placeholderTextColor={colors.textFaint}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!loading}
            />

            <AnimatedButton
              style={styles.button}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>Sign In to eHealth</Text>
              )}
            </AnimatedButton>

            <TouchableOpacity
              disabled={loading}
              onPress={() => {
                setForgotEmail(email);
                setForgotStep(1);
                setShowForgotModal(true);
              }}
            >
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            
          </Animated.View>

          <Text style={styles.footer}>© 2026 eHealth Hospital At Home</Text>
        </Animated.View>
      </ScrollView>

      {/* Item 21: First Login Temporary Password Change Modal */}
      <Modal visible={showChangePasswordModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Temporary Password</Text>
            <Text style={styles.modalSubtitle}>
              Your account was created with a temporary password. You must set a new password before continuing.
            </Text>

            <Text style={styles.label}>New Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Minimum 6 characters"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />

            <Text style={styles.label}>Confirm New Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Re-enter new password"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />

            <AnimatedButton
              style={styles.modalButton}
              onPress={handleConfirmPasswordChange}
              disabled={changingPassword}
            >
              {changingPassword ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>Save New Password</Text>}
            </AnimatedButton>
          </View>
        </View>
      </Modal>

      {/* Item 21: Password Reset Modal */}
      <Modal visible={showForgotModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            {forgotStep === 1 ? (
              <>
                <Text style={styles.modalSubtitle}>Enter your registered email to receive a password reset OTP.</Text>
                <Text style={styles.label}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="nurse@ehealthhospital.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                />
                <AnimatedButton
                  style={styles.modalButton}
                  onPress={handleRequestOtp}
                  disabled={resettingPassword}
                >
                  {resettingPassword ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>Send Reset Code</Text>}
                </AnimatedButton>
              </>
            ) : (
              <>
                <Text style={styles.modalSubtitle}>Enter the 4-digit code sent to {forgotEmail} and set your new password.</Text>
                <Text style={styles.label}>OTP Code</Text>
                <TextInput
                  style={styles.input}
                  placeholder="1234"
                  keyboardType="number-pad"
                  value={resetOtp}
                  onChangeText={setResetOtp}
                />
                <Text style={styles.label}>New Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="New password"
                  secureTextEntry
                  value={resetNewPassword}
                  onChangeText={setResetNewPassword}
                />
                <AnimatedButton
                  style={styles.modalButton}
                  onPress={handleResetPassword}
                  disabled={resettingPassword}
                >
                  {resettingPassword ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>Confirm Reset</Text>}
                </AnimatedButton>
              </>
            )}

            <TouchableOpacity style={{ marginTop: 16 }} onPress={() => setShowForgotModal(false)}>
              <Text style={[styles.forgotText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  softGlow: {
    position: 'absolute',
    top: -100,
    alignSelf: 'center',
    width: width * 1.3,
    height: width * 1.3,
    borderRadius: (width * 1.3) / 2,
    backgroundColor: '#F3F0FB',
  },
  scrollContent: {
    flexGrow: 1,
    justify: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.xl,
  },
  wrapper: { width: '100%', alignItems: 'center' },
  logoBox: { marginBottom: spacing.md, alignItems: 'center' },
  logoImage: { width: width * 0.52, height: width * 0.52 },
  formBox: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  doctorIcon: { width: 42, height: 42, marginLeft: spacing.sm },
  title: { ...typography.h1, color: colors.textDark, marginBottom: 4 },
  subtitle: { ...typography.bodyMuted, marginBottom: spacing.md },
  label: { ...typography.label, marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.textDark,
    backgroundColor: '#FAFAF8',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: spacing.pillRadius,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xxl,
    minHeight: 52,
    justify: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  forgotText: { textAlign: 'center', color: colors.primary, fontSize: 13, fontWeight: '700', marginTop: spacing.lg },
  hintBox: { marginTop: spacing.lg, backgroundColor: colors.primaryLight, borderRadius: 12, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  hintTitle: { fontSize: 11, fontWeight: '700', color: colors.primaryDark, textAlign: 'center', marginBottom: 4 },
  hintText: { fontSize: 11, color: colors.primary, textAlign: 'center', fontWeight: '500', lineHeight: 16 },
  footer: { textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: spacing.xxl },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: spacing.xxl },
  modalContent: { backgroundColor: colors.white, borderRadius: 22, padding: spacing.xxl, elevation: 8 },
  modalTitle: { ...typography.h2, color: colors.textDark, marginBottom: 6 },
  modalSubtitle: { ...typography.bodyMuted, lineHeight: 18, marginBottom: spacing.lg },
  modalButton: { backgroundColor: colors.primary, borderRadius: spacing.pillRadius, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xl },
  modalBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
});
