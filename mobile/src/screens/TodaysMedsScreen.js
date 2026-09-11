import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthService, PatientsService } from '../services/api';
import AnimatedCheckbox from '../components/AnimatedCheckbox';
import { useToast } from '../components/Toast';

const PURPLE = '#6D28D9', WHITE = '#FFFFFF';

const initialMeds = [
  { id: 'm-101', drugName: 'Inj. Clexane (Enoxaparin)', dose: '40 mg / 0.4 ml S/C', scheduledTime: '08:00 AM', status: 'overdue' },
  { id: 'm-102', drugName: 'Tab. Augmentin (Amoxicillin/Clavulanate)', dose: '1 gram P/O', scheduledTime: '10:00 AM', status: 'due' },
  { id: 'm-103', drugName: 'Tab. Glucophage (Metformin)', dose: '500 mg P/O', scheduledTime: '02:00 PM', status: 'due' },
  { id: 'm-104', drugName: 'Inj. Insulin Humulin R', dose: '8 Units S/C', scheduledTime: '08:00 PM', status: 'due' },
];

export default function TodaysMedsScreen({ route, navigation }) {
  const { visit, patientId = 'pat-201', patientName = 'Patient' } = route.params || {};
  const { showToast } = useToast();
  const currentUser = AuthService.getCurrentUser() || { name: 'Nurse Ayesha K.' };

  const [meds, setMeds] = useState(initialMeds);

  const handleAdminister = async (item) => {
    if (item.administered) return;

    const currentTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // POST /api/patients/{id}/mar/administer/
    const res = await PatientsService.administerMedication(patientId, item.id, 1);

    if (res.success) {
      setMeds(meds.map((m) => {
        if (m.id === item.id) {
          return {
            ...m,
            administered: true,
            administeredAt: currentTimestamp,
            administeredBy: currentUser.name,
          };
        }
        return m;
      }));
      showToast(`${item.drugName} marked as Administered!`, 'success');
    } else {
      showToast('Failed to record MAR administration', 'error');
    }
  };

  const renderItem = ({ item }) => {
    return (
      <View style={[styles.card, item.administered && styles.cardAdministered]}>
        <View style={styles.cardHeader}>
          {/* Swapped placeholder emoji with downloaded pill.png icon asset */}
          <Image
            source={require('../../assets/images/pill.png')}
            style={styles.pillIcon}
            resizeMode="contain"
          />
          <Text style={[styles.drugName, item.administered && styles.textMuted]}>{item.drugName}</Text>
          {item.administered ? (
            <View style={styles.doneBadge}>
              <Text style={styles.doneText}>✓ Administered</Text>
            </View>
          ) : item.status === 'overdue' ? (
            <View style={styles.overdueBadge}>
              <Text style={styles.overdueText}>🚨 Overdue</Text>
            </View>
          ) : (
            <View style={styles.dueBadge}>
              <Text style={styles.dueText}>Due {item.scheduledTime}</Text>
            </View>
          )}
        </View>

        <Text style={[styles.doseText, item.administered && styles.textMuted]}>{item.dose}</Text>

        {item.administered ? (
          <View style={styles.administeredMeta}>
            <Text style={styles.metaText}>Recorded by {item.administeredBy} at {item.administeredAt}</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.8} onPress={() => handleAdminister(item)}>
            <AnimatedCheckbox checked={false} onPress={() => handleAdminister(item)} />
            <Text style={styles.actionBtnText}>Tap to Mark Administered</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>MAR Daily Meds</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.banner}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerSub}>Medication Administration Record for</Text>
          <Text style={styles.bannerTitle}>{patientName}</Text>
        </View>
        <Image
          source={require('../../assets/images/icons8-pharmacy-shop-94.png')}
          style={styles.pharmacyIcon}
          resizeMode="contain"
        />
      </View>

      <FlatList
        data={meds}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: WHITE },
  header: { backgroundColor: PURPLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 },
  backBtn: { width: 50 },
  backText: { color: WHITE, fontSize: 15, fontWeight: '600' },
  headerTitle: { color: WHITE, fontSize: 18, fontWeight: '700' },
  banner: { backgroundColor: '#EDE9FE', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#DDD3F7', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pharmacyIcon: { width: 38, height: 38 },
  bannerSub: { fontSize: 12, color: '#6B7280' },
  bannerTitle: { fontSize: 17, fontWeight: '800', color: '#111827', marginTop: 2 },
  list: { padding: 20 },
  card: { backgroundColor: WHITE, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#EEE9FA', marginBottom: 14, shadowColor: '#6D28D9', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardAdministered: { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB', opacity: 0.8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  pillIcon: { width: 22, height: 22, marginRight: 8 },
  drugName: { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1, marginRight: 8 },
  doseText: { fontSize: 13, color: '#6D28D9', fontWeight: '600', marginBottom: 12, marginLeft: 30 },
  textMuted: { color: '#9CA3AF' },
  dueBadge: { backgroundColor: '#F3F0FB', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  dueText: { color: PURPLE, fontSize: 11, fontWeight: '700' },
  overdueBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  overdueText: { color: '#DC2626', fontSize: 11, fontWeight: '700' },
  doneBadge: { backgroundColor: '#DCFCE7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  doneText: { color: '#166534', fontSize: 11, fontWeight: '700' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F0FB', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, marginTop: 4 },
  actionBtnText: { color: PURPLE, fontSize: 13, fontWeight: '700' },
  administeredMeta: { borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 8, marginTop: 4 },
  metaText: { fontSize: 12, color: '#6B7280', fontStyle: 'italic' },
});
