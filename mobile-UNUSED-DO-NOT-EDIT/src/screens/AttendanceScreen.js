import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, StatusBar, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StaffService } from '../services/api';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import { colors, spacing, typography } from '../theme';

export default function AttendanceScreen({ navigation }) {
  const [summary, setSummary] = useState({ presentDays: 22, lateDays: 2, leaveDays: 1, totalFieldHours: '112h' });
  const [history, setHistory] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAttendance = async () => {
    const res = await StaffService.getAttendanceHistory('usr-101');
    if (res.success) {
      setSummary(res.summary);
      setHistory(res.history);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAttendance();
    setRefreshing(false);
  };

  const renderItem = ({ item }) => {
    return (
      <View style={styles.row}>
        <View>
          <Text style={styles.date}>{item.date}</Text>
          <Text style={styles.meta}>{item.visits} visits · {item.hours}</Text>
        </View>
        <StatusBadge status={item.status} />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Attendance</Text>
        <TouchableOpacity style={styles.leaveBtn} onPress={() => navigation.navigate('LeaveRequest')}>
          <Text style={styles.leaveBtnText}>+ Apply Leave</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.summaryStrip}>
        <View style={styles.summaryItem}><Text style={styles.summaryNum}>{summary.presentDays}</Text><Text style={styles.summaryLabel}>Present</Text></View>
        <View style={styles.summaryItem}><Text style={styles.summaryNum}>{summary.lateDays}</Text><Text style={styles.summaryLabel}>Late</Text></View>
        <View style={styles.summaryItem}><Text style={styles.summaryNum}>{summary.leaveDays}</Text><Text style={styles.summaryLabel}>Leave</Text></View>
        <View style={styles.summaryItem}><Text style={styles.summaryNum}>{summary.totalFieldHours}</Text><Text style={styles.summaryLabel}>Total Hrs</Text></View>
      </View>

      {history.length === 0 ? (
        <EmptyState icon="📊" title="No Attendance Logs" message="Your shift and visit attendance logs will appear here." />
      ) : (
        <FlatList
          data={history}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { backgroundColor: colors.primary, paddingHorizontal: spacing.screenPadding, paddingVertical: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { ...typography.h2, color: colors.white },
  leaveBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: spacing.pillRadius },
  leaveBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  summaryStrip: { flexDirection: 'row', backgroundColor: colors.primaryLight, margin: spacing.screenPadding, borderRadius: spacing.cardRadius, paddingVertical: spacing.lg },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryNum: { ...typography.h2, color: colors.primary },
  summaryLabel: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  list: { paddingHorizontal: spacing.screenPadding, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  date: { ...typography.body, fontWeight: '700', color: colors.textDark },
  meta: { ...typography.mono, color: colors.textMuted, marginTop: 2 },
});
