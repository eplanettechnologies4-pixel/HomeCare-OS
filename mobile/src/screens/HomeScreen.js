import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import FadeInView from '../components/FadeInView';
import { AuthService, BookingsService, ReportsService } from '../services/api';
import PulsingDot from '../components/PulsingDot';
import { colors, spacing, typography } from '../theme';

export default function HomeScreen({ navigation }) {
  const [user, setUser] = useState(AuthService.getCurrentUser() || { name: 'Clinical Staff', role: 'Staff' });
  const [stats, setStats] = useState({ todaysVisits: 0, completedVisits: 0, pendingVisits: 0, weeklyVisitsCompleted: 0, weeklyFieldHours: '0h', rating: '5.0' });
  const [nextVisit, setNextVisit] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    const currentUser = AuthService.getCurrentUser();
    if (currentUser) setUser(currentUser);

    const reportsRes = await ReportsService.getOverview();
    if (reportsRes.success) setStats(reportsRes.data);

    const scheduleRes = await BookingsService.getMySchedule();
    if (scheduleRes.success && scheduleRes.data?.length > 0) {
      setNextVisit(scheduleRes.data[0]);
    } else {
      setNextVisit(null);
    }
  };

  // A5: Re-fetch overview stats and my-schedule every time screen gets focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const initial = user?.name ? user.name[0].toUpperCase() : 'S';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <FadeInView delay={0}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>Good Morning,</Text>
              <Text style={styles.nurseName}>{user.name}</Text>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('Notifications')}>
                <Text style={styles.notifIcon}>🔔</Text>
                <View style={styles.notifDot}>
                  <PulsingDot size={6} color={colors.gold} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.avatar} onPress={() => navigation.navigate('ProfileTab')}>
                <Text style={styles.avatarText}>{initial}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}><Text style={styles.statNumber}>{stats.todaysVisits}</Text><Text style={styles.statLabel}>Today's Visits</Text></View>
            <View style={styles.statCard}><Text style={styles.statNumber}>{stats.completedVisits}</Text><Text style={styles.statLabel}>Completed</Text></View>
            <View style={styles.statCard}><Text style={styles.statNumber}>{stats.pendingVisits}</Text><Text style={styles.statLabel}>Pending</Text></View>
          </View>
        </View>
      </FadeInView>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}>
        <FadeInView delay={120}>
          <Text style={styles.sectionTitle}>Next Scheduled Visit</Text>
          {nextVisit ? (
            <TouchableOpacity
              style={styles.nextVisitCard}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('VisitDetail', { visit: nextVisit })}
            >
              <View style={styles.nextVisitLeft}>
                <View style={styles.timeBadge}><Text style={styles.timeBadgeText}>{nextVisit.time || 'Scheduled'}</Text></View>
                <Text style={styles.patientName}>{nextVisit.patient || nextVisit.patient_name}</Text>
                <Text style={styles.serviceText}>{nextVisit.service || nextVisit.service_type_display || 'Care Visit'} • {nextVisit.address || 'Address on file'}</Text>
              </View>
              <View style={styles.arrowCircle}><Text style={styles.arrowText}>→</Text></View>
            </TouchableOpacity>
          ) : (
            <View style={[styles.nextVisitCard, { paddingVertical: 18, justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={[styles.serviceText, { fontStyle: 'italic', color: colors.textFaint }]}>No visits scheduled for today</Text>
            </View>
          )}
        </FadeInView>

        <FadeInView delay={220}>
          <Text style={styles.sectionTitle}>Quick Clinical Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actionCard} activeOpacity={0.85} onPress={() => navigation.navigate('ScheduleTab')}>
              <View style={styles.actionIconBox}><Text style={styles.actionIcon}>📋</Text></View>
              <Text style={styles.actionLabel}>Today's{'\n'}Schedule</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} activeOpacity={0.85} onPress={() => navigation.navigate('TodaysMeds', { visit: nextVisit })}>
              <View style={styles.actionIconBox}><Text style={styles.actionIcon}>💊</Text></View>
              <Text style={styles.actionLabel}>MAR Meds{'\n'}Record</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} activeOpacity={0.85} onPress={() => navigation.navigate('NursesNote', { visit: nextVisit })}>
              <View style={styles.actionIconBox}><Text style={styles.actionIcon}>📝</Text></View>
              <Text style={styles.actionLabel}>Nurse Note{'\n'}Entry</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} activeOpacity={0.85} onPress={() => navigation.navigate('LeaveRequest')}>
              <View style={styles.actionIconBox}><Text style={styles.actionIcon}>📅</Text></View>
              <Text style={styles.actionLabel}>Apply{'\n'}Leave</Text>
            </TouchableOpacity>
          </View>
        </FadeInView>

        <FadeInView delay={320}>
          <Text style={styles.sectionTitle}>Weekly Field Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Visits Completed</Text><Text style={styles.summaryValue}>{stats.weeklyVisitsCompleted}</Text></View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Field Hours</Text><Text style={styles.summaryValue}>{stats.weeklyFieldHours}</Text></View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Patient Rating</Text><Text style={styles.summaryValue}>⭐ {stats.rating}</Text></View>
          </View>
        </FadeInView>
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { backgroundColor: colors.primary, paddingHorizontal: spacing.screenPadding, paddingTop: spacing.md, paddingBottom: spacing.xxl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  greeting: { color: colors.primarySoft, fontSize: 13 },
  nurseName: { ...typography.h1, color: colors.white, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  notifBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  notifIcon: { fontSize: 18 },
  notifDot: { position: 'absolute', top: 6, right: 6 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  avatarText: { color: colors.white, fontWeight: '800', fontSize: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginHorizontal: 4 },
  statNumber: { ...typography.h1, color: colors.white },
  statLabel: { color: colors.primarySoft, fontSize: 11, marginTop: 4, textAlign: 'center' },
  body: { flex: 1, paddingHorizontal: spacing.screenPadding, marginTop: spacing.xl },
  sectionTitle: { ...typography.h3, color: colors.textDark, marginBottom: spacing.md, marginTop: spacing.xs },
  nextVisitCard: { backgroundColor: colors.primaryLight, borderRadius: spacing.cardRadiusLg, padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#DDD3F7' },
  nextVisitLeft: { flex: 1 },
  timeBadge: { backgroundColor: colors.primary, alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: spacing.pillRadius, marginBottom: spacing.sm },
  timeBadgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  patientName: { ...typography.h2, color: colors.textDark },
  serviceText: { ...typography.bodyMuted, marginTop: 3 },
  arrowCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 20, color: colors.primary, fontWeight: '700' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  actionCard: { width: '48%', backgroundColor: colors.white, borderRadius: spacing.cardRadiusLg, padding: spacing.lg, marginBottom: spacing.md, alignItems: 'flex-start', borderWidth: 1, borderColor: colors.border, shadowColor: colors.primary, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  actionIconBox: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  actionIcon: { fontSize: 20 },
  actionLabel: { ...typography.label, color: colors.textDark, lineHeight: 18 },
  summaryCard: { backgroundColor: colors.white, borderRadius: spacing.cardRadiusLg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  summaryLabel: { ...typography.bodyMuted },
  summaryValue: { ...typography.mono, color: colors.primaryDark, fontWeight: '800' },
  summaryDivider: { height: 1, backgroundColor: '#F0EDFA' },
});
