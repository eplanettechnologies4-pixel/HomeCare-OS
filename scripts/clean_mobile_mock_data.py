import os
import re
import sys

# Ensure UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

MOBILE_DIR = r"C:\Users\Administrator\Desktop\homecare-mobile\homecare-mobile-v2"

def clean_file(rel_path, regex_subs):
    full_path = os.path.join(MOBILE_DIR, rel_path)
    if not os.path.exists(full_path):
        print(f"Not found: {full_path}")
        return
    with open(full_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    modified = content
    for pattern, replacement in regex_subs:
        new_content, count = re.subn(pattern, replacement, modified, flags=re.DOTALL)
        if count > 0:
            print(f"Applied {count} sub(s) to {rel_path} for pattern: {pattern[:40]}")
            modified = new_content
        else:
            print(f"No match in {rel_path} for pattern: {pattern[:40]}")
            
    if modified != content:
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(modified)
        print(f"Successfully updated {rel_path}")

# 1. LoginScreen.js: Remove demo hint box
clean_file(r"src\screens\LoginScreen.js", [
    (r"<View style=\{styles\.hintBox\}>.*?</View>", "")
])

# 2. HomeScreen.js: replace next visit card
clean_file(r"src\screens\HomeScreen.js", [
    (
        r"<Text style=\{styles\.sectionTitle\}>Next Scheduled Visit</Text>\s*<TouchableOpacity\s*style=\{styles\.nextVisitCard\}.*?</TouchableOpacity>",
        """<Text style={styles.sectionTitle}>Next Scheduled Visit</Text>
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
          )}"""
    )
])

# 3. NotificationsScreen.js: empty initial notifications
clean_file(r"src\screens\NotificationsScreen.js", [
    (
        r"const initialNotifications = \[.*?\];\s*export default function NotificationsScreen",
        "export default function NotificationsScreen"
    ),
    (
        r"const \[notifications, setNotifications\] = useState\(initialNotifications\);",
        "const [notifications, setNotifications] = useState([]);"
    )
])

# 4. ManagerViewScreen.js: empty initial live visits
clean_file(r"src\screens\ManagerViewScreen.js", [
    (
        r"const liveVisits = \[.*?\];",
        "const initialLiveVisits = [];"
    ),
    (
        r"export default function ManagerViewScreen\(\{ navigation \}\) \{",
        "export default function ManagerViewScreen({ navigation }) {\n  const [liveVisits, setLiveVisits] = useState(initialLiveVisits);"
    ),
    (
        r"\{liveVisits\.map\(\(item\) => \(",
        """{liveVisits.length === 0 ? (
          <View style={[styles.visitCard, { paddingVertical: 24, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: '#6B7280', fontStyle: 'italic', fontSize: 13 }}>No active field operations in progress</Text>
          </View>
        ) : liveVisits.map((item) => ("""
    )
])

# 5. api.js - FamilyPortalService.getLinkedPatientOverview fallback
clean_file(r"src\services\api.js", [
    (
        r"getLinkedPatientOverview: async \(\) => \{\s*try \{.*?\} catch \(err\) \{\s*return \{.*?\}\s*\}",
        """getLinkedPatientOverview: async () => {
    try {
      console.log('[API GET] /api/portal/my/patient/');
      const res = await api.get('/api/portal/my/patient/');
      return { success: true, status: res.status, data: res.data };
    } catch (err) {
      return { success: false, error: err.message, patient: null, assignedNurse: null, nextBooking: null, weeklyStats: null };
    }
  }"""
    )
])

# 6. Clinical screens: remove Ahmed Khan default
clean_file(r"src\screens\NursesNoteScreen.js", [
    (r"patientName = 'Ahmed Khan'", "patientName = 'Patient'")
])
clean_file(r"src\screens\TodaysMedsScreen.js", [
    (r"patientName = 'Ahmed Khan'", "patientName = 'Patient'")
])
clean_file(r"src\screens\VitalsEntryScreen.js", [
    (r"const \{ visit \} = route\.params \|\| \{ id: 'bkg-101', patient: 'Ahmed Khan' \};", "const { visit } = route.params || { id: null, patient: 'Patient' };")
])

# 7. Family screens
clean_file(r"src\screens\family\FamilyHomeScreen.js", [
    (r"const patient = data\?\.patient \|\| \{ full_name: 'Ahmed Khan', mr_number: 'MR-2026-0089' \};", "const patient = data?.patient || { full_name: 'Patient Profile', mr_number: '—' };"),
    (r"const nurse = data\?\.assignedNurse \|\| \{ name: 'Nurse Ayesha K\.', rating: '4\.9 .*?', phone: '0300-1234567' \};", "const nurse = data?.assignedNurse || { name: 'Assigned Caregiver', rating: '5.0 ★', phone: '—' };"),
    (r"const next = data\?\.nextBooking \|\| \{ service: 'Nursing Care & Vitals Log', date: 'Today, Sep 2', time: '10:00 AM', eta: '12 min ETA', status: 'En Route' \};", "const next = data?.nextBooking || null;")
])
clean_file(r"src\screens\family\FamilyLiveTrackingScreen.js", [
    (r"filtered exclusively for patient Ahmed Khan's active visit\.", "filtered exclusively for your active care visit.")
])
clean_file(r"src\screens\family\MyVisitsScreen.js", [
    (r"<Text style=\{styles\.val\}>Ahmed Khan \(MR-2026-0089\)</Text>", "<Text style={styles.val}>{selectedVisit?.patient || 'Patient'}</Text>")
])
clean_file(r"src\screens\family\VitalsTrendScreen.js", [
    (r"<Text style=\{styles\.bannerTitle\}>Ahmed Khan \(MR-2026-0089\)</Text>", "<Text style={styles.bannerTitle}>{data?.patient?.full_name || 'Patient EMR Records'}</Text>")
])

print("All regex cleanups complete.")
