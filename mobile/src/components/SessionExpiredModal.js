import React from 'react';
import { View, Text, Modal, StyleSheet } from 'react-native';
import AnimatedButton from './AnimatedButton';
import { AuthService } from '../services/api';

export default function SessionExpiredModal({ visible, onConfirm }) {
  const handleLoginAgain = () => {
    AuthService.logout();
    if (onConfirm) onConfirm();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>⌛</Text>
          </View>
          <Text style={styles.title}>Session Expired</Text>
          <Text style={styles.sub}>Your JWT security token has expired. Please sign in again to access patient records.</Text>

          <AnimatedButton style={styles.btn} onPress={handleLoginAgain}>
            <Text style={styles.btnText}>Sign In Again</Text>
          </AnimatedButton>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', paddingHorizontal: 24 },
  content: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 24, alignItems: 'center' },
  iconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  icon: { fontSize: 28 },
  title: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 6 },
  sub: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  btn: { width: '100%', backgroundColor: '#6D28D9', borderRadius: 100, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
