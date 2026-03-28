import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { CardStyleInterpolators, createStackNavigator } from '@react-navigation/stack';
import { BlurView } from 'expo-blur';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Dimensions, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from './config/haptics';

const LL_BG = require('./assets/finalbg2.png');
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('screen');

const TransparentTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: 'transparent', card: 'transparent' },
};

// Import context
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { ViewingProvider, useViewing } from './context/ViewingContext';

// Import screens
import HealthDisclaimer from './components/HealthDisclaimer';
import AchievementsScreen from './screens/AchievementsScreen';
import AlertsScreen from './screens/AlertsScreen';
import AskLoopScreen from './screens/AskLoopScreen';
import CGMScreen from './screens/CGMScreen';
import CareCircleScreen from './screens/CareCircleScreen';
import ChallengesScreen from './screens/ChallengesScreen';
import ChatScreen from './screens/ChatScreen';
import DexcomConnectScreen from './screens/DexcomConnectScreen';
import GlucoseStoryScreen from './screens/GlucoseStoryScreen';
import GroupChatScreen from './screens/GroupChatScreen';
import HomeScreen from './screens/HomeScreen';
import InsightsScreen from './screens/InsightsScreen';
import LoginScreen from './screens/LoginScreen';
import MessagesScreen from './screens/MessagesScreen';
import MoodScreen from './screens/MoodScreen';
import ProfileScreen from './screens/ProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import SuppliesScreen from './screens/SuppliesScreen';
import WatchSyncScreen from './screens/WatchSyncScreen';
import WeeklyReportScreen from './screens/WeeklyReportScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();
const navigationRef = createNavigationContainerRef();

function MainTabs() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      sceneContainerStyle={{ backgroundColor: 'transparent' }}
      screenListeners={{ tabPress: () => haptic.light() }}
      screenOptions={{
        lazy: false,
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.65)',
        tabBarStyle: [styles.tabBar, { bottom: 12 + insets.bottom }],
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarBackground: () => (
          Platform.OS === 'ios' ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,20,0.88)' }]} />
          )
        ),
        headerStyle: {
          backgroundColor: 'transparent',
          shadowColor: 'transparent',
          elevation: 0,
        },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          headerShown: false,
          title: 'LinkLoop',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="CGM"
        component={CGMScreen}
        options={{
          title: 'My Glucose',
          tabBarLabel: 'CGM',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'pulse' : 'pulse-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Circle"
        component={CareCircleScreen}
        options={{
          title: 'Care Circle',
          tabBarLabel: 'Circle',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{
          title: 'Messages',
          tabBarLabel: 'Messages',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'My Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// Loop Member tab nav — sees the warrior's CGM data, can chat & get alerts
function LoopMemberTabs() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      sceneContainerStyle={{ backgroundColor: 'transparent' }}
      screenListeners={{ tabPress: () => haptic.light() }}
      screenOptions={{
        lazy: false,
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.65)',
        tabBarStyle: [styles.tabBar, { bottom: 12 + insets.bottom }],
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarBackground: () => (
          Platform.OS === 'ios' ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(12,20,42,0.92)' }]} />
          )
        ),
        headerStyle: {
          backgroundColor: 'transparent',
          shadowColor: 'transparent',
          elevation: 0,
        },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          headerShown: false,
          title: 'Dashboard',
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{
          title: 'CGM Alerts',
          tabBarLabel: 'Alerts',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'notifications' : 'notifications-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Circle"
        component={CareCircleScreen}
        options={{
          title: 'Care Circle',
          tabBarLabel: 'Circle',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{
          title: 'Messages',
          tabBarLabel: 'Messages',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'My Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { showMemberTabs } = useViewing();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingLogo}>∞ LinkLoop</Text>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{
      headerShown: false,
      cardStyle: { backgroundColor: 'transparent' },
      cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
      transitionSpec: {
        open: { animation: 'timing', config: { duration: 200 } },
        close: { animation: 'timing', config: { duration: 200 } },
      },
    }}>
      {isAuthenticated ? (
        <>
          <Stack.Screen
            name="Main"
            component={showMemberTabs ? LoopMemberTabs : MainTabs}
          />
          <Stack.Screen
            name="Messages"
            component={MessagesScreen}
            options={{
              headerShown: true,
              title: 'Messages',
              headerStyle: { backgroundColor: 'transparent' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: 'bold' },
            }}
          />
          <Stack.Screen
            name="Supplies"
            component={SuppliesScreen}
            options={{
              headerShown: true,
              title: 'My Supplies',
              headerStyle: { backgroundColor: 'transparent' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: 'bold' },
            }}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={{
              headerShown: true,
              headerStyle: { backgroundColor: 'transparent' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: 'bold' },
            }}
          />
          <Stack.Screen
            name="GroupChat"
            component={GroupChatScreen}
            options={{
              headerShown: true,
              title: 'Care Circle Group',
              headerStyle: { backgroundColor: 'transparent' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: 'bold' },
            }}
          />
          <Stack.Screen
            name="Alerts"
            component={AlertsScreen}
            options={{
              headerShown: true,
              title: 'CGM Alerts',
              headerStyle: { backgroundColor: 'transparent' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: 'bold' },
            }}
          />
          <Stack.Screen
            name="Insights"
            component={InsightsScreen}
            options={{
              headerShown: true,
              title: 'AI Insights',
              headerStyle: { backgroundColor: 'transparent' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: 'bold' },
            }}
          />
          <Stack.Screen
            name="Mood"
            component={MoodScreen}
            options={{
              headerShown: true,
              title: 'Mood & Notes',
              headerStyle: { backgroundColor: 'transparent' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: 'bold' },
            }}
          />
          <Stack.Screen
            name="DexcomConnect"
            component={DexcomConnectScreen}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="WatchSync"
            component={WatchSyncScreen}
            options={{
              headerShown: true,
              title: 'Apple Watch',
              headerStyle: { backgroundColor: 'transparent' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: 'bold' },
            }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              headerShown: true,
              title: 'Settings',
              headerStyle: { backgroundColor: 'transparent' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: 'bold' },
            }}
          />
          <Stack.Screen
            name="Achievements"
            component={AchievementsScreen}
            options={{
              headerShown: true,
              title: 'Achievements',
              headerStyle: { backgroundColor: 'transparent' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: 'bold' },
            }}
          />
          <Stack.Screen
            name="AskLoop"
            component={AskLoopScreen}
            options={{
              headerShown: true,
              title: 'Ask Loop',
              headerStyle: { backgroundColor: 'transparent' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: 'bold' },
            }}
          />
          <Stack.Screen
            name="WeeklyReport"
            component={WeeklyReportScreen}
            options={{
              headerShown: true,
              title: 'Weekly Report',
              headerStyle: { backgroundColor: 'transparent' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: 'bold' },
            }}
          />
          <Stack.Screen
            name="GlucoseStory"
            component={GlucoseStoryScreen}
            options={{
              headerShown: true,
              title: 'Glucose Story',
              headerStyle: { backgroundColor: 'transparent' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: 'bold' },
            }}
          />
          <Stack.Screen
            name="Challenges"
            component={ChallengesScreen}
            options={{
              headerShown: true,
              title: 'Challenges',
              headerStyle: { backgroundColor: 'transparent' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: 'bold' },
            }}
          />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  // Navigate to the right screen when user taps a push notification
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request?.content?.data;
      if (!navigationRef.isReady()) return;
      if (data?.type === 'daily_insight') {
        navigationRef.navigate('Insights');
      } else if (data?.type === 'new_message' || data?.type === 'group_message') {
        navigationRef.navigate('Messages');
      } else if (data?.type === 'glucose_alert' || data?.type === 'alert_acknowledged' || data?.type === 'alert_resolved') {
        navigationRef.navigate('Alerts');
      } else if (data?.type === 'supply_low') {
        navigationRef.navigate('Supplies');
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
    <ThemeProvider>
      <AuthProvider>
        <ViewingProvider>
          <View style={styles.root}>
            <Image source={LL_BG} style={styles.bgImage} resizeMode="contain" />
            <NavigationContainer ref={navigationRef} theme={TransparentTheme}>
              <StatusBar style="light" backgroundColor="#0F1F40" />
              <AppNavigator />
              <HealthDisclaimer />
            </NavigationContainer>
          </View>
        </ViewingProvider>
      </AuthProvider>
    </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F1F40' },
  bgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_W,
    height: SCREEN_H,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_W,
    height: SCREEN_H,
    backgroundColor: 'rgba(0,10,30,0.35)',
  },
  tabBar: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    height: 64,
    borderRadius: 22,
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'transparent',
    paddingBottom: 4,
    paddingTop: 4,
    shadowColor: '#4A90D9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.20,
    shadowRadius: 20,
    elevation: 12,
    overflow: 'hidden',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  loadingLogo: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
    letterSpacing: -0.5,
  },
});
