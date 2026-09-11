import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FamilyPortalService } from '../../services/api';
import AnimatedButton from '../../components/AnimatedButton';
import { colors, spacing, typography } from '../../theme';

export default function FamilyMessagesScreen({ navigation }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [careManager, setCareManager] = useState('Care Manager Sarah');

  useEffect(() => {
    FamilyPortalService.getFamilyMessages().then((res) => {
      if (res.success) {
        setMessages(res.messages);
        setCareManager(res.careManager);
      }
    });
  }, []);

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const textToSend = inputText;
    setInputText('');

    const res = await FamilyPortalService.sendFamilyMessage(textToSend);
    if (res.success) {
      setMessages((prev) => [...prev, res.message]);
    }
  };

  const renderItem = ({ item }) => {
    const isMe = item.sender === 'You';
    return (
      <View style={[styles.msgWrapper, isMe ? styles.myMsgWrapper : styles.otherMsgWrapper]}>
        <View style={[styles.msgBubble, isMe ? styles.myMsgBubble : styles.otherMsgBubble]}>
          <Text style={[styles.senderText, isMe && styles.mySenderText]}>{item.sender}</Text>
          <Text style={[styles.msgText, isMe && styles.myMsgText]}>{item.text}</Text>
          <Text style={[styles.timeText, isMe && styles.myTimeText]}>{item.time}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{careManager}</Text>
          <Text style={styles.headerSub}>Assigned Care Manager</Text>
        </View>
        <View style={{ width: 50 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder={`Message ${careManager}...`}
            value={inputText}
            onChangeText={setInputText}
          />
          <AnimatedButton style={styles.sendBtn} onPress={handleSend}>
            <Text style={styles.sendBtnText}>Send</Text>
          </AnimatedButton>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.screenPadding, paddingVertical: spacing.lg },
  backBtn: { width: 50 },
  backText: { color: colors.white, fontSize: 15, fontWeight: '600' },
  headerTitle: { color: colors.white, fontSize: 17, fontWeight: '800' },
  headerSub: { color: colors.primarySoft, fontSize: 11 },
  list: { padding: spacing.screenPadding },
  msgWrapper: { marginBottom: spacing.md, maxWidth: '82%' },
  myMsgWrapper: { alignSelf: 'flex-end' },
  otherMsgWrapper: { alignSelf: 'flex-start' },
  msgBubble: { borderRadius: spacing.cardRadiusLg, padding: spacing.md },
  myMsgBubble: { backgroundColor: colors.primary },
  otherMsgBubble: { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: colors.border },
  senderText: { ...typography.caption, color: colors.primaryDark, marginBottom: 2 },
  mySenderText: { color: colors.gold },
  msgText: { ...typography.body, color: colors.textDark, lineHeight: 20 },
  myMsgText: { color: colors.white },
  timeText: { ...typography.caption, fontSize: 10, color: colors.textMuted, marginTop: 4, textAlign: 'right' },
  myTimeText: { color: colors.primarySoft },
  inputBar: { flexDirection: 'row', padding: spacing.md, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: spacing.pillRadius, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, fontSize: 14, color: colors.textDark, backgroundColor: '#FAFAF8', marginRight: spacing.sm },
  sendBtn: { backgroundColor: colors.primary, borderRadius: spacing.pillRadius, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  sendBtnText: { color: colors.white, fontSize: 14, fontWeight: '700' },
});
