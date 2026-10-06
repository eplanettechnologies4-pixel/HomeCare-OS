import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import FadeInView from '../components/FadeInView';
import { BookingsService } from '../services/api';
import { SkeletonCard } from '../components/SkeletonLoader';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import { colors, spacing, typography } from '../theme';

export default function TodayScheduleScreen({ navigation }) {
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSchedule = async () => {
    const res = await BookingsService.getMySchedule();
    if (res.success) {
      setSchedule(res.data);
    }
    setLoading(false);
  };

  // A5: Refresh schedule every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchSchedule();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSchedule();
    setRefreshing(false);
  };

  const getServiceMeta = (item) => {
    const type = item.service_type || (item.service || '').toLowerCase();
    const cat = item.service_category;
    if (cat === 'pharmacy' || type.includes('medicine')) {
      return { icon: '💊', color: '#10B981', label: 'Medicine Delivery' };
    }
    if (cat === 'equipment' || type.includes('equipment')) {
      return { icon: '🦽', color: '#F59E0B', label: type.includes('pickup') ? 'Equipment Pickup' : 'Equipment Delivery' };
    }
    if (cat === 'lab' || type.includes('lab')) {
      return { icon: '🧪', color: '#6366F1', label: 'Lab Sample Collection' };
    }
    return { icon: '🩺', color: colors.primary, label: item.service || 'Clinical Visit' };
  };

  const renderItem = ({ item, index }) => {
    const meta = getServiceMeta(item);
    return (
      <FadeInView delay={index * 100}>
        <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => navigation.navigate('VisitDetail', { visit: item })}>
          <View style={styles.cardTop}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 18 }}>{meta.icon}</Text>
              <Text style={styles.patientName}>{item.patient || item.patient_name}</Text>
            </View>
            <StatusBadge status={item.status} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 4 }}>
            <View style={{ backgroundColor: `${meta.color}15`, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: meta.color }}>
                {meta.label}
              </Text>
            </View>
            <Text style={[styles.service, { marginTop: 0 }]}>{item.service}</Text>
          </View>
          <Text style={styles.time}>{item.time || item.scheduled_time} · {item.address}</Text>
        </TouchableOpacity>
      </FadeInView>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Today's Schedule</Text>
        <Text style={styles.headerSub}>{schedule.length} visits assigned for today</Text>
      </View>

      {loading ? (
        <View style={styles.list}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : schedule.length === 0 ? (
        <EmptyState icon="📅" title="No Visits Today" message="You have no assigned patient visits scheduled for today." />
      ) : (
        <FlatList
          data={schedule}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.screenPadding, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  headerTitle: { ...typography.h1, color: '#1E1B4B' },
  headerSub: { ...typography.bodyMuted, marginTop: spacing.xs },
  list: { paddingHorizontal: spacing.screenPadding, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.white,
    borderRadius: spacing.cardRadiusLg,
    padding: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.primary,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  patientName: { ...typography.h3, color: colors.textDark },
  service: { ...typography.body, color: colors.textDark, marginTop: spacing.xs },
  time: { ...typography.mono, color: colors.textMuted, marginTop: spacing.xs },
});
