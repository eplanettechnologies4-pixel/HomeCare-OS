import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, ScrollView, Modal, TextInput, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthService } from '../services/api';
import AnimatedButton from '../components/AnimatedButton';
import { useToast } from '../components/Toast';

const PURPLE = '#6D28D9', PURPLE_LIGHT = '#EDE9FE', WHITE = '#FFFFFF';
const defaultSkills = ['Elderly Care', 'BP Monitoring', 'Medication', 'Injection', 'Dressing'];

export default function ProfileScreen({ navigation }) {
  const { showToast } = useToast();
  const user = AuthService.getCurrentUser() || {
    name: 'Nurse Ayesha K.',
    email: 'nurse@ehealthhospital.com',
    role: 'Nurse',
    staff_id: 'EH-N-000123',
  };

  const [showChangePassModal, setShowChangePassModal] = useState(false);
  const [currPass, setCurrPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogout = () => {
    AuthService.logout();
    showToast('Logged out successfully', 'info');
    navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
  };

  const handleChangePassword = async () => {
    if (!currPass || !newPass) {
      showToast('Please enter your current and new password', 'error');
      return;
    }
    if (newPass.length < 6) {
      showToast('New password must be at least 6 characters', 'error');
      return;
    }

    setLoading(true);
    const res = await AuthService.changePassword(currPass, newPass);
    setLoading(false);

    if (res.success) {
      setShowChangePassModal(false);
      setCurrPass('');
      setNewPass('');
      showToast('Password changed successfully!', 'success');
    } else {
      showToast(res.error, 'error');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={PURPLE} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Profile</Text>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          {/* Swapped text-avatar circle with downloaded nurse.png icon asset */}
          <View style={styles.avatarContainer}>
            <Image
              source={require('../../assets/images/nurse.png')}
              style={styles.avatarImage}
              resizeMode="contain"
            />
          </View>

          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.role}>{user.role} · {user.staff_id || 'EH-ST-000123'}</Text>
          <View style={styles.ratingBadge}><Text style={styles.ratingText}>⭐ 4.9 Rating</Text></View>
        </View>

        <Text style={styles.sectionTitle}>Skills & Specializations</Text>
        <View style={styles.skillsRow}>
          {defaultSkills.map((s) => <View key={s} style={styles.skillChip}><Text style={styles.skillText}>{s}</Text></View>)}
        </View>

        <Text style={styles.sectionTitle}>Account & Contact Info</Text>
        <View style={styles.card}>
          <InfoRow label="Email (Unified Auth)" value={user.email} />
          <InfoRow label="Organization" value="eHealth Hospital At Home" />
          <InfoRow label="Assigned Role" value={user.role} />
          <InfoRow label="Platform Allowed" value="Mobile App" />
        </View>

        <TouchableOpacity style={styles.changePassBtn} onPress={() => setShowChangePassModal(true)} activeOpacity={0.8}>
          <Text style={styles.changePassText}>🔒 Change Password</Text>
        </TouchableOpacity>

        <AnimatedButton style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </AnimatedButton>
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Password Change Modal */}
      <Modal visible={showChangePassModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <Text style={styles.label}>Current Password</Text>
            <TextInput style={styles.input} secureTextEntry value={currPass} onChangeText={setCurrPass} placeholder="Current Password" />

            <Text style={styles.label}>New Password</Text>
            <TextInput style={styles.input} secureTextEntry value={newPass} onChangeText={setNewPass} placeholder="New Password" />

            <AnimatedButton style={styles.submitBtn} onPress={handleChangePassword} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Update Password</Text>}
            </AnimatedButton>

            <TouchableOpacity style={{ marginTop: 14, alignItems: 'center' }} onPress={() => setShowChangePassModal(false)}>
              <Text style={{ color: '#666', fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: WHITE },
  header: { backgroundColor: PURPLE, paddingHorizontal: 20, paddingVertical: 18 },
  headerTitle: { color: WHITE, fontSize: 20, fontWeight: '800' },
  body: { flex: 1, paddingHorizontal: 20, marginTop: 20 },
  profileCard: { alignItems: 'center', marginBottom: 24 },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: PURPLE_LIGHT,
    alignItems: 'center',
    justify: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: PURPLE,
    overflow: 'hidden',
  },
  avatarImage: { width: 60, height: 60 },
  name: { fontSize: 19, fontWeight: '800', color: '#111827' },
  role: { fontSize: 13, color: '#6B7280', marginTop: 3 },
  ratingBadge: { backgroundColor: PURPLE_LIGHT, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 100, marginTop: 10 },
  ratingText: { fontSize: 12, fontWeight: '700', color: PURPLE },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 10 },
  skillsRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
  skillChip: { backgroundColor: PURPLE_LIGHT, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 100, marginRight: 8, marginBottom: 8 },
  skillText: { fontSize: 12, fontWeight: '600', color: PURPLE },
  card: { backgroundColor: WHITE, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#EEE9FA', marginBottom: 20 },
  infoRow: { paddingVertical: 8 },
  infoLabel: { fontSize: 12, color: '#9CA3AF' },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#111827', marginTop: 2 },
  changePassBtn: { backgroundColor: PURPLE_LIGHT, borderRadius: 100, paddingVertical: 14, alignItems: 'center', marginBottom: 14 },
  changePassText: { color: PURPLE, fontSize: 14, fontWeight: '700' },
  logoutBtn: { backgroundColor: '#FEE2E2', borderRadius: 100, paddingVertical: 14, alignItems: 'center' },
  logoutText: { color: '#EF4444', fontSize: 14, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24 },
  modalContent: { backgroundColor: WHITE, borderRadius: 18, padding: 22 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#4B5563', marginBottom: 4, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' },
  submitBtn: { backgroundColor: PURPLE, borderRadius: 100, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  btnText: { color: WHITE, fontSize: 15, fontWeight: '700' },
});
