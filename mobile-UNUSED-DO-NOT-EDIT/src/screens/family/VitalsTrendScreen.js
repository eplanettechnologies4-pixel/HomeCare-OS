import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FamilyPortalService } from '../../services/api';
import { colors, spacing, typography } from '../../theme';

export default function VitalsTrendScreen({ navigation }) {
  const [vitals, setVitals] = useState([]);

  useEffect(() => {
    FamilyPortalService.getVitalsTrend().then((res) => {
      if (res.success) setVitals(res.records);
    });
  }, []);

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.dateText}>{item.date}</Text>
        <View style={styles.stableBadge}>
          <Text style={styles.stableText}>✓ {item.status}</Text>
        </View>
      </View>

      <View style={styles.grid}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Blood Pressure</Text>
          <Text style={styles.statVal}>{item.bp}</Text>
          <Text style={styles.unit}>mmHg</Text>
        </View>

        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Pulse Rate</Text>
          <Text style={styles.statVal}>{item.pulse}</Text>
        </View>

        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Temperature</Text>
          <Text style={styles.statVal}>{item.temp}</Text>
        </View>

        <View style={styles.statBox}>
          <Text style={styles.statLabel}>SpO2 Oxygen</Text>
          <Text style={styles.statVal}>{item.spo2}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vitals Health Trend</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.banner}>
        <Text style={styles.bannerSub}>Clinical EMR Form B Logs for</Text>
        <Text style={styles.bannerTitle}>{data?.patient?.full_name || 'Patient EMR Records'}</Text>
      </View>

      <FlatList
        data={vitals}
        keyExtractor={(item, index) => index.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.screenPadding, paddingVertical: spacing.lg },
  backBtn: { width: 50 },
  backText: { color: colors.white, fontSize: 15, fontWeight: '600' },
  headerTitle: { color: colors.white, fontSize: 18, fontWeight: '700' },
  banner: { backgroundColor: colors.primaryLight, paddingHorizontal: spacing.screenPadding, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: '#DDD3F7' },
  bannerSub: { ...typography.caption, color: colors.textMuted },
  bannerTitle: { ...typography.h3, color: colors.textDark, marginTop: 2 },
  list: { padding: spacing.screenPadding },
  card: { backgroundColor: colors.white, borderRadius: spacing.cardRadiusLg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, shadowColor: colors.primary, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  dateText: { ...typography.mono, color: colors.textDark, fontWeight: '700' },
  stableBadge: { backgroundColor: colors.successBg, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: spacing.pillRadius },
  stableText: { color: colors.successText, fontSize: 11, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statBox: { width: '48%', backgroundColor: '#FAFAF8', padding: spacing.md, borderRadius: spacing.cardRadius, marginBottom: spacing.sm },
  statLabel: { ...typography.caption, color: colors.textMuted },
  statVal: { ...typography.h2, color: colors.primary, marginTop: 2 },
  unit: { ...typography.caption, color: colors.textFaint },
});
