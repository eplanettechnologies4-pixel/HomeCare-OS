import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import PulsingDot from '../components/PulsingDot';

const PURPLE = '#6D28D9', WHITE = '#FFFFFF';

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);

  const handlePress = (item) => {
    // Mark as read
    setNotifications(notifications.map((n) => (n.id === item.id ? { ...n, unread: false } : n)));
    if (item.route) {
      navigation.navigate(item.route);
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.row, item.unread && styles.rowUnread]}
      activeOpacity={0.8}
      onPress={() => handlePress(item)}
    >
      <View style={styles.iconCircle}>
        <Text style={styles.iconText}>{item.icon}</Text>
      </View>

      <View style={styles.contentCol}>
        <View style={styles.topLine}>
          <Text style={[styles.title, item.unread && styles.titleUnread]}>{item.title}</Text>
          <Text style={styles.timeText}>{item.time}</Text>
        </View>
        <Text style={styles.messageText}>{item.message}</Text>
      </View>

      {item.unread && (
        <View style={styles.dotBox}>
          <PulsingDot size={8} color={PURPLE} />
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 50 }} />
      </View>

      {notifications.length === 0 ? (
        <EmptyState icon="🔔" title="No Notifications" message="You're all caught up! Check back later." />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: WHITE },
  header: { backgroundColor: PURPLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 },
  backBtn: { width: 50 },
  backText: { color: WHITE, fontSize: 15, fontWeight: '600' },
  headerTitle: { color: WHITE, fontSize: 18, fontWeight: '700' },
  list: { paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F0FB' },
  rowUnread: { backgroundColor: '#F9F5FF' },
  iconCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  iconText: { fontSize: 20 },
  contentCol: { flex: 1 },
  topLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 14, fontWeight: '600', color: '#374151' },
  titleUnread: { fontWeight: '800', color: '#111827' },
  timeText: { fontSize: 11, color: '#9CA3AF' },
  messageText: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
  dotBox: { marginLeft: 10 },
});
