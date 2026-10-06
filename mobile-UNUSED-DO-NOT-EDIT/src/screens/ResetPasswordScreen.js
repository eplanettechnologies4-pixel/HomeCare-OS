import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthService } from '../services/api';
import AnimatedButton from '../components/AnimatedButton';
import { useToast } from '../components/Toast';

const PURPLE = '#6D28D9', WHITE = '#FFFFFF';

export default function ResetPasswordScreen({ route, navigation }) {
  const { showToast } = useToast();
  const { email = 'nurse@ehealthhospital.com', otp = '1234' } = route.params || {};

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const getPasswordStrength = (pwd) => {
    if (!pwd) return { score: 0, label: '', color: '#E5E7EB' };
    if (pwd.length < 6) return { score: 1, label: 'Weak (min 6 chars)', color: '#EF4444' };
    const hasNumbers = /\d/.test(pwd);
    const hasSpecial = /[!@#$%^&*]/.test(pwd);
    if (pwd.length >= 8 && hasNumbers && hasSpecial) return { score: 3, label: 'Strong', color: '#10B981' };
    if (pwd.length >= 6) return { score: 2, label: 'Medium', color: '#F59E0B' };
    return { score: 1, label: 'Weak', color: '#EF4444' };
  };

  const strength = getPasswordStrength(newPassword);
  const isValid = newPassword.length >= 6 && newPassword === confirmPassword;

  const handleResetPassword = async () => {
    if (!isValid) {
      if (newPassword !== confirmPassword) showToast('Passwords do not match', 'error');
      else showToast('Password must be at least 6 characters', 'error');
      return;
    }

    setLoading(true);
    const res = await AuthService.confirmPasswordReset(email, otp, newPassword);
    setLoading(false);

    if (res.success) {
      showToast('Password reset successfully! Please sign in with your new password.', 'success');
      navigation.replace('Login');
    } else {
      showToast(res.error, 'error');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reset Password</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* Swapped emoji placeholder with downloaded lock.png icon asset */}
        <View style={styles.iconCircle}>
          <Image
            source={require('../../assets/images/lock.png')}
            style={styles.lockImage}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.title}>Create New Password</Text>
        <Text style={styles.subtitle}>Set a strong password for {email}</Text>

        <View style={styles.card}>
          <Text style={styles.label}>New Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter new password"
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
          />

          {newPassword.length > 0 && (
            <View style={styles.strengthBox}>
              <View style={styles.meterTrack}>
                <View
                  style={[
                    styles.meterFill,
                    {
                      width: `${(strength.score / 3) * 100}%`,
                      backgroundColor: strength.color,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
            </View>
          )}

          <Text style={styles.label}>Confirm New Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Re-enter new password"
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          {confirmPassword.length > 0 && confirmPassword !== newPassword && (
            <Text style={styles.mismatchText}>⚠️ Passwords do not match</Text>
          )}

          <AnimatedButton
            style={[styles.submitBtn, !isValid && styles.btnDisabled]}
            onPress={handleResetPassword}
            disabled={!isValid || loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Update Password</Text>}
          </AnimatedButton>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: WHITE },
  header: { backgroundColor: PURPLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 },
  backBtn: { width: 50 },
  backText: { color: WHITE, fontSize: 15, fontWeight: '600' },
  headerTitle: { color: WHITE, fontSize: 18, fontWeight: '700' },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 },
  lockImage: { width: 36, height: 36 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 24 },
  card: { backgroundColor: WHITE, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: '#EEE9FA', shadowColor: PURPLE, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  label: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', backgroundColor: '#FAFAF8' },
  strengthBox: { marginTop: 8 },
  meterTrack: { height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontWeight: '700', marginTop: 4, textAlign: 'right' },
  mismatchText: { fontSize: 12, color: '#EF4444', marginTop: 4, fontWeight: '600' },
  submitBtn: { backgroundColor: PURPLE, borderRadius: 100, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  btnDisabled: { backgroundColor: '#9CA3AF' },
  submitBtnText: { color: WHITE, fontSize: 15, fontWeight: '700' },
});
