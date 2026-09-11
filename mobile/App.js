import React, { useRef, useEffect } from 'react';
import { Animated } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ToastProvider } from './src/components/Toast';

import SplashScreen from './src/screens/SplashScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import PhotoViewerScreen from './src/screens/PhotoViewerScreen';

import HomeScreen from './src/screens/HomeScreen';
import TodayScheduleScreen from './src/screens/TodayScheduleScreen';
import VisitDetailScreen from './src/screens/VisitDetailScreen';
import VitalsEntryScreen from './src/screens/VitalsEntryScreen';
import DailyReportScreen from './src/screens/DailyReportScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import AttendanceScreen from './src/screens/AttendanceScreen';
import ProfileScreen from './src/screens/ProfileScreen';

import LeaveRequestScreen from './src/screens/LeaveRequestScreen';
import NursesNoteScreen from './src/screens/NursesNoteScreen';
import TodaysMedsScreen from './src/screens/TodaysMedsScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import ManagerViewScreen from './src/screens/ManagerViewScreen';

// Item 31: Family Portal Screens
import FamilyHomeScreen from './src/screens/family/FamilyHomeScreen';
import FamilyLiveTrackingScreen from './src/screens/family/FamilyLiveTrackingScreen';
import MyVisitsScreen from './src/screens/family/MyVisitsScreen';
import VitalsTrendScreen from './src/screens/family/VitalsTrendScreen';
import FamilyInvoicesScreen from './src/screens/family/FamilyInvoicesScreen';
import FamilyMessagesScreen from './src/screens/family/FamilyMessagesScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const PURPLE = '#6D28D9';
const INACTIVE = '#B0A8C7';

function AnimatedTabIcon({ name, focused, color }) {
  const scaleAnim = useRef(new Animated.Value(focused ? 1.2 : 1)).current;

  useEffect(() => {
    if (focused) {
      scaleAnim.setValue(0.85);
      Animated.spring(scaleAnim, {
        toValue: 1.2,
        useNativeDriver: true,
        friction: 4,
        tension: 100,
      }).start();
    } else {
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [focused]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Ionicons name={name} size={22} color={color} />
    </Animated.View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: PURPLE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          height: 64,
          paddingBottom: 10,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: '#EEE9FA',
          backgroundColor: '#fff',
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, focused }) => {
          let iconName;
          if (route.name === 'HomeTab') iconName = 'home';
          else if (route.name === 'ScheduleTab') iconName = 'calendar';
          else if (route.name === 'AttendanceTab') iconName = 'stats-chart';
          else if (route.name === 'ProfileTab') iconName = 'person';
          return <AnimatedTabIcon name={iconName} focused={focused} color={color} />;
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="ScheduleTab" component={TodayScheduleScreen} options={{ title: 'Schedule' }} />
      <Tab.Screen name="AttendanceTab" component={AttendanceScreen} options={{ title: 'Attendance' }} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Splash"
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
            <Stack.Screen name="Home" component={MainTabs} />
            <Stack.Screen name="ManagerView" component={ManagerViewScreen} />

            {/* Item 31: Family Portal Stack */}
            <Stack.Screen name="FamilyHome" component={FamilyHomeScreen} />
            <Stack.Screen name="FamilyLiveTracking" component={FamilyLiveTrackingScreen} />
            <Stack.Screen name="FamilyVisits" component={MyVisitsScreen} />
            <Stack.Screen name="VitalsTrend" component={VitalsTrendScreen} />
            <Stack.Screen name="FamilyInvoices" component={FamilyInvoicesScreen} />
            <Stack.Screen name="FamilyMessages" component={FamilyMessagesScreen} />

            <Stack.Screen name="VisitDetail" component={VisitDetailScreen} />
            <Stack.Screen name="VitalsEntry" component={VitalsEntryScreen} />
            <Stack.Screen name="DailyReport" component={DailyReportScreen} />
            <Stack.Screen name="Checkout" component={CheckoutScreen} />
            <Stack.Screen name="LeaveRequest" component={LeaveRequestScreen} />
            <Stack.Screen name="NursesNote" component={NursesNoteScreen} />
            <Stack.Screen name="TodaysMeds" component={TodaysMedsScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="PhotoViewer" component={PhotoViewerScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
