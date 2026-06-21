import React, { createContext, useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './screens/HomeScreen';
import ResultsScreen from './screens/ResultsScreen';
import DetailScreen from './screens/DetailScreen';
import { useSaved } from './hooks/useSaved';
import { RootStackParamList, ResultItem } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

interface SavedContextValue {
  saved: ResultItem[];
  isSaved: (id: string) => boolean;
  toggle: (item: ResultItem) => void;
  remove: (id: string) => void;
  loaded: boolean;
}

export const SavedContext = createContext<SavedContextValue>({
  saved: [],
  isSaved: () => false,
  toggle: () => {},
  remove: () => {},
  loaded: false,
});

export function useSavedContext() {
  return useContext(SavedContext);
}

export default function App() {
  const savedState = useSaved();

  return (
    <SavedContext.Provider value={savedState}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Results" component={ResultsScreen} />
          <Stack.Screen name="Detail" component={DetailScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SavedContext.Provider>
  );
}
