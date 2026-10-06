import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Image, ActivityIndicator, Alert, Platform, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { PatientsService, AuthService } from '../services/api';
import AnimatedButton from '../components/AnimatedButton';
import { useToast } from '../components/Toast';

const PURPLE = '#6D28D9', PURPLE_LIGHT = '#EDE9FE', WHITE = '#FFFFFF';

export default function AddPrescriptionScreen({ route, navigation }) {
  const { showToast } = useToast();
  const { visit, patientId, bookingId } = route.params || {};

  const resolvedPatientId = patientId || visit?.patient?.id || visit?.patient_id || '1';
  const resolvedBookingId = bookingId || visit?.id || null;
  const patientName = visit?.patient?.full_name || visit?.patient_name || 'Patient';

  const currentUser = AuthService.getCurrentUser() || { name: 'Dr. Attending / Nurse' };

  // Form Fields
  const [drugName, setDrugName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('Twice daily');
  const [daysPrescribed, setDaysPrescribed] = useState('7');
  const [prescribedBy, setPrescribedBy] = useState(currentUser.name || 'Attending Physician');
  const [notes, setNotes] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Take photo with camera
  const handleTakePhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Camera permission is required to capture prescription photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedPhoto(result.assets[0]);
        showToast('Prescription photo captured', 'info');
      }
    } catch (err) {
      console.warn('Camera error:', err);
      Alert.alert('Error', 'Unable to open camera: ' + err.message);
    }
  };

  // Pick photo from gallery
  const handlePickFromGallery = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Gallery permission is required to choose prescription images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedPhoto(result.assets[0]);
        showToast('Prescription image selected', 'info');
      }
    } catch (err) {
      console.warn('Gallery picker error:', err);
      Alert.alert('Error', 'Unable to pick image: ' + err.message);
    }
  };

  const handleSubmit = async () => {
    if (!drugName.trim()) {
      Alert.alert('Validation Error', 'Please enter a drug or medication name.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('drug_name', drugName.trim());
      formData.append('dosage', dosage.trim() || 'Standard');
      formData.append('frequency', frequency.trim());
      formData.append('days_prescribed', daysPrescribed || '7');
      formData.append('prescribed_by', prescribedBy.trim() || 'Attending Physician');
      formData.append('notes', notes.trim());

      if (resolvedBookingId) {
        formData.append('booking', String(resolvedBookingId));
      }

      if (selectedPhoto) {
        const uri = selectedPhoto.uri;
        const uriParts = uri.split('.');
        const fileType = uriParts[uriParts.length - 1] || 'jpg';

        formData.append('prescription_file', {
          uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
          name: `prescription_${Date.now()}.${fileType}`,
          type: `image/${fileType === 'png' ? 'png' : 'jpeg'}`,
        });
      }

      const res = await PatientsService.addPrescription(resolvedPatientId, formData);

      if (res.success || res.status === 201) {
        showToast('Prescription recorded successfully!', 'success');
        navigation.goBack();
      } else {
        Alert.alert('Submission Error', res.error || 'Failed to submit prescription.');
      }
    } catch (err) {
      console.warn('Submit prescription exception:', err);
      Alert.alert('Error', err.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={WHITE} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Prescription</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          {/* Patient Header Banner */}
          <View style={styles.patientBanner}>
            <Ionicons name="person-circle-outline" size={28} color={PURPLE} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.bannerPatientName}>{patientName}</Text>
              <Text style={styles.bannerSubtitle}>Patient ID #{resolvedPatientId}</Text>
            </View>
          </View>

          {/* Form Card */}
          <Text style={styles.sectionTitle}>Medication Details</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Drug / Medicine Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Augmentin 625mg / Concor 5mg"
              placeholderTextColor="#9CA3AF"
              value={drugName}
              onChangeText={setDrugName}
            />

            <View style={styles.row}>
              <View style={[styles.col, { marginRight: 8 }]}>
                <Text style={styles.label}>Dosage</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 1 Tab, 500mg"
                  placeholderTextColor="#9CA3AF"
                  value={dosage}
                  onChangeText={setDosage}
                />
              </View>
              <View style={[styles.col, { marginLeft: 8 }]}>
                <Text style={styles.label}>Duration (Days)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="7"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  value={daysPrescribed}
                  onChangeText={setDaysPrescribed}
                />
              </View>
            </View>

            <Text style={styles.label}>Frequency</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Twice daily, Every 8 hours"
              placeholderTextColor="#9CA3AF"
              value={frequency}
              onChangeText={setFrequency}
            />

            <Text style={styles.label}>Prescribed By (Doctor)</Text>
            <TextInput
              style={styles.input}
              placeholder="Doctor's name"
              placeholderTextColor="#9CA3AF"
              value={prescribedBy}
              onChangeText={setPrescribedBy}
            />

            <Text style={styles.label}>Clinical Notes / Instructions</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Special instructions (e.g. Take with food, monitor BP)"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
            />
          </View>

          {/* Prescription Photo Attachment */}
          <Text style={styles.sectionTitle}>Physical Prescription Document / Photo</Text>
          <View style={styles.card}>
            <Text style={styles.cardSubtext}>
              Capture a photo of the paper prescription slip or select from device gallery.
            </Text>

            {selectedPhoto ? (
              <View style={styles.photoPreviewWrapper}>
                <Image source={{ uri: selectedPhoto.uri }} style={styles.photoPreview} />
                <TouchableOpacity
                  style={styles.removePhotoBtn}
                  onPress={() => setSelectedPhoto(null)}
                >
                  <Ionicons name="close-circle" size={26} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.photoActionsRow}>
                <TouchableOpacity style={styles.photoActionBtn} onPress={handleTakePhoto}>
                  <Ionicons name="camera-outline" size={24} color={PURPLE} />
                  <Text style={styles.photoActionText}>Take Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.photoActionBtn} onPress={handlePickFromGallery}>
                  <Ionicons name="image-outline" size={24} color={PURPLE} />
                  <Text style={styles.photoActionText}>From Gallery</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <AnimatedButton
          style={[styles.actionBtn, submitting && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={WHITE} />
          ) : (
            <Text style={styles.actionBtnText}>Save Prescription Record</Text>
          )}
        </AnimatedButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    backgroundColor: PURPLE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { width: 40 },
  headerTitle: { color: WHITE, fontSize: 17, fontWeight: '700' },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },
  patientBanner: {
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  bannerPatientName: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  bannerSubtitle: { fontSize: 12, color: PURPLE, marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 8, marginTop: 4 },
  card: {
    backgroundColor: WHITE,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardSubtext: { fontSize: 12, color: '#6B7280', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1F2937',
    marginBottom: 12,
  },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row' },
  col: { flex: 1 },
  photoActionsRow: { flexDirection: 'row', gap: 12 },
  photoActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PURPLE_LIGHT,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    gap: 8,
  },
  photoActionText: { color: PURPLE, fontSize: 13, fontWeight: '700' },
  photoPreviewWrapper: { position: 'relative', alignItems: 'center', marginVertical: 8 },
  photoPreview: { width: '100%', height: 200, borderRadius: 12, resizeMode: 'cover' },
  removePhotoBtn: { position: 'absolute', top: 6, right: 6, backgroundColor: WHITE, borderRadius: 14 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: WHITE,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  actionBtn: {
    backgroundColor: PURPLE,
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionBtnText: { color: WHITE, fontSize: 15, fontWeight: '700' },
});
