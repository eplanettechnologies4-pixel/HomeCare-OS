import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FamilyPortalService } from '../../services/api';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import AnimatedButton from '../../components/AnimatedButton';
import { colors, spacing, typography } from '../../theme';

export default function MyVisitsScreen({ navigation }) {
  const [visits, setVisits] = useState([]);
  const [selectedVisit, setSelectedVisit] = useState(null);

  useEffect(() => {
    FamilyPortalService.getPatientVisits().then((res) => {
      if (res.success) setVisits(res.visits);
    });
  }, []);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.88}
      onPress={() => setSelectedVisit(item)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.dateText}>{item.date} · {item.time}</Text>
        <StatusBadge status={item.status} />
      </View>

      <Text style={styles.serviceText}>{item.service}</Text>
      <Text style={styles.nurseText}>Caregiver: {item.nurse}</Text>
      <Text style={styles.tapPrompt}>Tap to view visit report summary →</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Visit History</Text>
        <View style={{ width: 50 }} />
      </View>

      {visits.length === 0 ? (
        <EmptyState icon="📋" title="No Visit Records" message="Visit reports and clinical logs will appear here." />
      ) : (
        <FlatList
          data={visits}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}

      {/* Visit Summary Modal */}
      <Modal visible={!!selectedVisit} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Visit Report Summary</Text>
            {selectedVisit && (
              <>
                <Text style={styles.modalMeta}>{selectedVisit.date} · {selectedVisit.time}</Text>
                <View style={styles.divider} />

                <Text style={styles.label}>Patient</Text>
                <Text style={styles.val}>{selectedVisit?.patient || 'Patient'}</Text>

                <Text style={styles.label}>Attending Caregiver</Text>
                <Text style={styles.val}>{selectedVisit.nurse}</Text>

                <Text style={styles.label}>Clinical Notes & Care Items</Text>
                <Text style={styles.notesVal}>{selectedVisit.notes}</Text>

                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>✓ Verified & Signed by Attending Nurse</Text>
                </View>
              </>
            )}

            <AnimatedButton style={styles.closeBtn} onPress={() => setSelectedVisit(null)}>
              <Text style={styles.closeBtnText}>Close Summary</Text>
            </AnimatedButton>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.screenPadding, paddingVertical: spacing.lg },
  backBtn: { width: 50 },
  backText: { color: colors.white, fontSize: 15, fontWeight: '600' },
  headerTitle: { color: colors.white, fontSize: 18, fontWeight: '700' },
  list: { padding: spacing.screenPadding },
  card: { backgroundColor: colors.white, borderRadius: spacing.cardRadiusLg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, shadowColor: colors.primary, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  dateText: { ...typography.mono, color: colors.textDark, fontWeight: '700' },
  serviceText: { ...typography.h3, color: colors.textDark, marginTop: spacing.xs },
  nurseText: { ...typography.bodyMuted, marginTop: 2 },
  tapPrompt: { ...typography.caption, color: colors.primary, marginTop: spacing.sm, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: spacing.xxl },
  modalContent: { backgroundColor: colors.white, borderRadius: 22, padding: spacing.xxl, elevation: 8 },
  modalTitle: { ...typography.h2, color: colors.textDark },
  modalMeta: { ...typography.mono, color: colors.primary, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  label: { ...typography.caption, color: colors.textFaint, marginTop: spacing.sm },
  val: { ...typography.body, color: colors.textDark, fontWeight: '700', marginTop: 2 },
  notesVal: { ...typography.body, color: colors.textDark, lineHeight: 20, marginTop: 4, backgroundColor: '#FAFAF8', padding: spacing.md, borderRadius: spacing.cardRadius },
  verifiedBadge: { backgroundColor: colors.successBg, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: spacing.pillRadius, alignSelf: 'flex-start', marginTop: spacing.lg },
  verifiedText: { color: colors.successText, fontSize: 11, fontWeight: '700' },
  closeBtn: { backgroundColor: colors.primary, borderRadius: spacing.pillRadius, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xl },
  closeBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
});
