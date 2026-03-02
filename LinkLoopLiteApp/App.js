import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { haptic } from './config/haptics';

// Import context
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';

// Import screens
import HealthDisclaimer from './components/HealthDisclaimer';
import AlertsScreen from './screens/AlertsScreen';
import CGMScreen from './screens/CGMScreen';
import CareCircleScreen from './screens/CareCircleScreen';
import ChatScreen from './screens/ChatScreen';
import DexcomConnectScreen from './screens/DexcomConnectScreen';
import GroupChatScreen from './screens/GroupChatScreen';
import HomeScreen from './screens/HomeScreen';
import InsightsScreen from './screens/InsightsScreen';
import LoginScreen from './screens/LoginScreen';
import MessagesScreen from './screens/MessagesScreen';
import MoodScreen from './screens/MoodScreen';
import ProfileScreen from './screens/ProfileScreen';
import SuppliesScreen from './screens/SuppliesScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function MainTabs() {
  const { palette } = useTheme();
  return (
    <Tab.Navigator
      screenListeners={{ tabPress: () => haptic.light() }}
      screenOptions={{
        tabBarActiveTintColor: palette.warrior,
        tabBarInactiveTintColor: '#555',
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => (
          Platform.OS === 'ios' ? (
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,15,0.94)' }]} />
          )
        ),
        headerStyle: {
          backgroundColor: '#0A0A0F',
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
        name="Supplies"
        component={SuppliesScreen}
        options={{
          title: 'My Supplies',
          tabBarLabel: 'Supplies',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'medkit' : 'medkit-outline'} size={22} color={color} />
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
  return (
    <Tab.Navigator
      screenListeners={{ tabPress: () => haptic.light() }}
      screenOptions={{
        tabBarActiveTintColor: palette.member,
        tabBarInactiveTintColor: '#555',
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => (
          Platform.OS === 'ios' ? (
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,15,0.94)' }]} />
          )
        ),
        headerStyle: {
          backgroundColor: '#0A0A0F',
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
          title: 'Their Loop',
          tabBarLabel: 'Loop',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'infinite' : 'infinite-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="CGM"
        component={CGMScreen}
        options={{
          title: 'Live Glucose',
          tabBarLabel: 'Glucose',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'pulse' : 'pulse-outline'} size={22} color={color} />
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
  const isMember = user?.role === 'member';

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingLogo}>∞ LinkLoop</Text>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <>
          <Stack.Screen
            name="Main"
            component={isMember ? LoopMemberTabs : MainTabs}
          />
          <Stack.Screen
            name="Messages"
            component={MessagesScreen}
            options={{
              headerShown: true,
              title: 'Messages',
              headerStyle: { backgroundColor: '#0A0A0F' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: 'bold' },
            }}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={{
              headerShown: true,
              headerStyle: { backgroundColor: '#0A0A0F' },
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
              headerStyle: { backgroundColor: '#0A0A0F' },
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
              headerStyle: { backgroundColor: '#0A0A0F' },
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
              headerStyle: { backgroundColor: '#0A0A0F' },
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
              headerStyle: { backgroundColor: '#0A0A0F' },
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
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NavigationContainer>
          <StatusBar style="light" backgroundColor="#4A90D9" />
          <AppNavigator />
          <HealthDisclaimer />
        </NavigationContainer>
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    height: 64,
    borderRadius: 22,
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'transparent',
    paddingBottom: 6,
    paddingTop: 6,
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
    backgroundColor: '#0A0A0F',
  },
  loadingLogo: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
    letterSpacing: -0.5,
  },
});
