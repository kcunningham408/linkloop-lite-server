import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';

// Import context
import { AuthProvider, useAuth } from './context/AuthContext';

// Import screens
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import CGMScreen from './screens/CGMScreen';
import CareCircleScreen from './screens/CareCircleScreen';
import SuppliesScreen from './screens/SuppliesScreen';
import ProfileScreen from './screens/ProfileScreen';
import ChatScreen from './screens/ChatScreen';
import AlertsScreen from './screens/AlertsScreen';
import InsightsScreen from './screens/InsightsScreen';
import MoodScreen from './screens/MoodScreen';
import AchievementsScreen from './screens/AchievementsScreen';
import HealthDisclaimer from './components/HealthDisclaimer';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#4A90D9',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: styles.tabBar,
        headerStyle: {
          backgroundColor: '#1C1C1E',
          shadowColor: '#000',
          elevation: 0,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'LinkLoop',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>🏠</Text>,
        }}
      />
      <Tab.Screen
        name="CGM"
        component={CGMScreen}
        options={{
          title: 'My Glucose',
          tabBarLabel: 'CGM',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>📊</Text>,
        }}
      />
      <Tab.Screen
        name="Circle"
        component={CareCircleScreen}
        options={{
          title: 'Care Circle',
          tabBarLabel: 'Circle',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>👥</Text>,
        }}
      />
      <Tab.Screen
        name="Supplies"
        component={SuppliesScreen}
        options={{
          title: 'My Supplies',
          tabBarLabel: 'Supplies',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>📦</Text>,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'My Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>⚙️</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

// Loop Member tab nav — sees the warrior's CGM data, can chat & get alerts
function LoopMemberTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#34C759',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: styles.tabBar,
        headerStyle: {
          backgroundColor: '#1C1C1E',
          shadowColor: '#000',
          elevation: 0,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Their Loop',
          tabBarLabel: 'Loop',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>∞</Text>,
        }}
      />
      <Tab.Screen
        name="CGM"
        component={CGMScreen}
        options={{
          title: 'Live Glucose',
          tabBarLabel: 'Glucose',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>📊</Text>,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'My Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>👤</Text>,
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
            name="Chat"
            component={ChatScreen}
            options={{
              headerShown: true,
              headerStyle: { backgroundColor: '#1C1C1E' },
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
              headerStyle: { backgroundColor: '#1C1C1E' },
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
              headerStyle: { backgroundColor: '#1C1C1E' },
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
              headerStyle: { backgroundColor: '#1C1C1E' },
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
              headerStyle: { backgroundColor: '#1C1C1E' },
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
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="light" backgroundColor="#4A90D9" />
        <AppNavigator />
        <HealthDisclaimer />
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#1C1C1E',
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
    paddingBottom: 5,
    paddingTop: 5,
    height: 60,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111111',
  },
  loadingLogo: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#4A90D9',
    marginBottom: 20,
  },
});
