import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FamilyPortalService } from '../../services/api';
import StatusBadge from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { colors, spacing, typography } from '../../theme';

export default function FamilyInvoicesScreen({ navigation }) {
  const { showToast } = useToast();
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    FamilyPortalService.getFamilyInvoices().then((res) => {
      if (res.success) setInvoices(res.invoices);
    });
  }, []);

  const handleDownload = (item) => {
    showToast(`Downloading PDF for ${item.invoice_number}...`, 'success');
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.invNumber}>{item.invoice_number}</Text>
        <StatusBadge status={item.status === 'Paid' ? 'Approved' : 'Pending'} label={item.status} />
      </View>

      <Text style={styles.amountText}>{item.amount}</Text>
      <Text style={styles.dateText}>Due / Date: {item.date}</Text>

      <TouchableOpacity style={styles.pdfBtn} onPress={() => handleDownload(item)}>
        <Text style={styles.pdfBtnText}>📥 Download PDF Invoice</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Family Invoices</Text>
        <View style={{ width: 50 }} />
      </View>

      <FlatList
        data={invoices}
        keyExtractor={(item) => item.id}
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
  list: { padding: spacing.screenPadding },
  card: { backgroundColor: colors.white, borderRadius: spacing.cardRadiusLg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, shadowColor: colors.primary, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  invNumber: { ...typography.mono, color: colors.textDark, fontWeight: '800' },
  amountText: { ...typography.h1, color: colors.primary, marginTop: spacing.xs },
  dateText: { ...typography.bodyMuted, marginTop: 2 },
  pdfBtn: { backgroundColor: colors.primaryLight, borderRadius: spacing.pillRadius, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md },
  pdfBtnText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
});
