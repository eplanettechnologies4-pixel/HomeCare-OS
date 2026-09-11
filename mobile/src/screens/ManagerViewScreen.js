import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthService } from '../services/api';
import PulsingDot from '../components/PulsingDot';

const PURPLE = '#6D28D9', PURPLE_DARK = '#5B21B6', WHITE = '#FFFFFF';

const initialLiveVisits = [];

export default function ManagerViewScreen({ navigation }) {
  const [liveVisits, setLiveVisits] = useState(initialLiveVisits);
  const currentUser = AuthService.getCurrentUser() || { name: 'Care Manager Sarah', role: 'Care Manager' };

  const handleLogout = () => {
    AuthService.logout();
    navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Read-Only Manager Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <View style={styles.roleTag}>
              <Text style={styles.roleTagText}>READ-ONLY MONITORING</Text>
            </View>
            <Text style={styles.managerName}>{currentUser.name}</Text>
            <Text style={styles.managerRole}>{currentUser.role} Dashboard</Text>
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>18</Text>
            <Text style={styles.statLabel}>Active Visits</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>12</Text>
            <Text style={styles.statLabel}>Staff On Field</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Active SOS</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Live Field Operations (Real-Time)</Text>
        {liveVisits.length === 0 ? (
          <View style={[styles.visitCard, { paddingVertical: 24, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: '#6B7280', fontStyle: 'italic', fontSize: 13 }}>No active field operations in progress</Text>
          </View>
        ) : liveVisits.map((item) => (
          <View key={item.id} style={styles.visitCard}>
            <View style={styles.cardHeader}>
              <View style={styles.patientRow}>
                <Text style={styles.patientName}>{item.patient}</Text>
                <Text style={styles.locationText}> · {item.location}</Text>
              </View>

              <View style={styles.statusBadge}>
                {item.status === 'In Progress' && <PulsingDot size={6} color="#10B981" style={{ marginRight: 6 }} />}
                <Text style={styles.statusText}>{item.status}</Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Assigned Staff:</Text>
              <Text style={styles.metaValue}>{item.nurse}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Service Type:</Text>
              <Text style={styles.metaValue}>{item.service}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>System Notices & Compliance</Text>
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>ℹ️ Read-Only Manager Access</Text>
          <Text style={styles.noticeText}>
            This view is configured strictly for Care Managers and Branch Managers. Action buttons, check-in, vitals logging, and report forms are restricted to field clinical staff.
          </Text>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: WHITE },
  header: { backgroundColor: PURPLE, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 24, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  roleTag: { backgroundColor: '#F59E0B', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, alignSelf: 'flex-start', marginBottom: 4 },
  roleTagText: { color: '#1E1B4B', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  managerName: { color: WHITE, fontSize: 20, fontWeight: '800' },
  managerRole: { color: '#E0D4FB', fontSize: 13, marginTop: 2 },
  logoutBtn: { backgroundColor: 'rgba(255, 255, 255, 0.2)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100 },
  logoutText: { color: WHITE, fontSize: 12, fontWeight: '700' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginHorizontal: 4 },
  statNumber: { color: WHITE, fontSize: 22, fontWeight: '800' },
  statLabel: { color: '#E0D4FB', fontSize: 11, marginTop: 4, textAlign: 'center' },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12 },
  visitCard: { backgroundColor: WHITE, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#EEE9FA', marginBottom: 12, shadowColor: PURPLE, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  patientRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  patientName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  locationText: { fontSize: 13, color: '#6B7280' },
  statusBadge: { backgroundColor: '#EDE9FE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, flexDirection: 'row', alignItems: 'center' },
  statusText: { fontSize: 11, fontWeight: '700', color: PURPLE },
  metaRow: { flexDirection: 'row', marginTop: 4 },
  metaLabel: { fontSize: 12, color: '#6B7280', width: 100 },
  metaValue: { fontSize: 13, fontWeight: '700', color: '#374151' },
  noticeCard: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 14, padding: 16, marginTop: 10 },
  noticeTitle: { fontSize: 13, fontWeight: '800', color: '#92400E', marginBottom: 4 },
  noticeText: { fontSize: 12, color: '#B45309', lineHeight: 18 },
});
