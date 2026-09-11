import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthService, FamilyPortalService } from '../../services/api';
import PulsingDot from '../../components/PulsingDot';
import { colors, spacing, typography } from '../../theme';

export default function FamilyHomeScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const user = AuthService.getCurrentUser() || { name: 'Tariq Khan', role: 'FAMILY' };

  const loadData = async () => {
    const res = await FamilyPortalService.getLinkedPatientOverview();
    if (res.success) {
      setData(res);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const patient = data?.patient || { full_name: 'Patient Profile', mr_number: '—' };
  const nurse = data?.assignedNurse || { name: 'Assigned Caregiver', rating: '5.0 ★', phone: '—' };
  const next = data?.nextBooking || null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header with Family Account & Linked Patient */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>LINKED PATIENT PORTAL</Text>
            </View>
            <Text style={styles.patientName}>{patient.full_name}</Text>
            <Text style={styles.mrText}>{patient.mr_number} · Family Account ({user.name})</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={() => { AuthService.logout(); navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] }); }}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {/* Next Visit Countdown & Live Tracking Bar */}
        <TouchableOpacity
          style={styles.nextCard}
          activeOpacity={0.88}
          onPress={() => navigation.navigate('FamilyLiveTracking')}
        >
          <View style={styles.nextHeader}>
            <View style={styles.liveTag}>
              <PulsingDot size={6} color="#10B981" style={{ marginRight: 6 }} />
              <Text style={styles.liveText}>{next.status} · {next.eta}</Text>
            </View>
            <Text style={styles.nextTime}>{next.time}</Text>
          </View>

          <Text style={styles.nextTitle}>{next.service}</Text>
          <Text style={styles.nextSub}>Tap to view nurse live GPS position on map →</Text>
        </TouchableOpacity>

        {/* Assigned Nurse Card */}
        <Text style={styles.sectionTitle}>Assigned Clinical Caregiver</Text>
        <View style={styles.nurseCard}>
          <Image source={require('../../../assets/images/nurse.png')} style={styles.nurseImage} resizeMode="contain" />
          <View style={styles.nurseInfo}>
            <Text style={styles.nurseName}>{nurse.name}</Text>
            <Text style={styles.nurseRole}>{nurse.role} · {nurse.rating}</Text>
            <Text style={styles.nursePhone}>📞 {nurse.phone}</Text>
          </View>
        </View>

        {/* Quick Links Grid */}
        <Text style={styles.sectionTitle}>Family Quick Links</Text>
        <View style={styles.grid}>
          <TouchableOpacity style={styles.gridCard} onPress={() => navigation.navigate('FamilyVisits')}>
            <Text style={styles.gridIcon}>📋</Text>
            <Text style={styles.gridTitle}>Visit History</Text>
            <Text style={styles.gridSub}>Past reports & notes</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.gridCard} onPress={() => navigation.navigate('VitalsTrend')}>
            <Text style={styles.gridIcon}>📈</Text>
            <Text style={styles.gridTitle}>Vitals Trend</Text>
            <Text style={styles.gridSub}>BP, Pulse & SpO2 logs</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.gridCard} onPress={() => navigation.navigate('FamilyInvoices')}>
            <Text style={styles.gridIcon}>🧾</Text>
            <Text style={styles.gridTitle}>Invoices</Text>
            <Text style={styles.gridSub}>Statements & PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.gridCard} onPress={() => navigation.navigate('FamilyMessages')}>
            <Text style={styles.gridIcon}>💬</Text>
            <Text style={styles.gridTitle}>Care Manager</Text>
            <Text style={styles.gridSub}>Direct chat thread</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { backgroundColor: colors.primary, paddingHorizontal: spacing.screenPadding, paddingTop: spacing.lg, paddingBottom: spacing.xxl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  badge: { backgroundColor: colors.gold, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: spacing.pillRadius, alignSelf: 'flex-start', marginBottom: 6 },
  badgeText: { color: '#1E1B4B', fontSize: 10, fontWeight: '800' },
  patientName: { ...typography.h1, color: colors.white },
  mrText: { ...typography.mono, color: colors.primarySoft, marginTop: 2 },
  logoutBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: spacing.pillRadius },
  logoutText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  body: { flex: 1, paddingHorizontal: spacing.screenPadding, paddingTop: spacing.xl },
  nextCard: { backgroundColor: colors.primaryLight, borderRadius: spacing.cardRadiusLg, padding: spacing.lg, marginBottom: spacing.xl, borderWidth: 1, borderColor: '#DDD3F7' },
  nextHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  liveTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: spacing.pillRadius },
  liveText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  nextTime: { ...typography.mono, color: colors.primaryDark, fontWeight: '800' },
  nextTitle: { ...typography.h2, color: colors.textDark, marginTop: spacing.xs },
  nextSub: { ...typography.bodyMuted, marginTop: spacing.xs, fontStyle: 'italic' },
  sectionTitle: { ...typography.h3, color: colors.textDark, marginBottom: spacing.md },
  nurseCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: spacing.cardRadius, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl },
  nurseImage: { width: 54, height: 54, marginRight: spacing.md },
  nurseInfo: { flex: 1 },
  nurseName: { ...typography.h3, color: colors.textDark },
  nurseRole: { ...typography.bodyMuted, marginTop: 2 },
  nursePhone: { ...typography.mono, color: colors.primary, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridCard: { width: '48%', backgroundColor: colors.white, borderRadius: spacing.cardRadius, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, shadowColor: colors.primary, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  gridIcon: { fontSize: 26, marginBottom: spacing.xs },
  gridTitle: { ...typography.h3, fontSize: 14, color: colors.textDark },
  gridSub: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});
