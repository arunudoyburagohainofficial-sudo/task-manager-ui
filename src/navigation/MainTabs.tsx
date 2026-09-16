import React, { useMemo } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTasksQuery } from "../api/queries/useTasks";
import { HomeScreen } from "../screens/HomeScreen";
import { ScheduledScreen } from "../screens/ScheduledScreen";
import { ProgressScreen } from "../screens/ProgressScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { useTour } from "../state/TourContext";
import { isOverdue, todayKey } from "../utils/schedule";
import { DockedTabBar } from "./DockedTabBar";
import type { MainTabParamList, RootStackParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { advance: advanceTour } = useTour();

  /**
   * "Overdue" earns a badge rather than a place in the label: measured at this tab bar's
   * own style, "Upcoming/Overdue" is wider than the tab it would sit in on any phone. A count
   * badge says the same thing in less space, and says nothing at all on the common case where
   * nothing is overdue.
   *
   * Free to read here: this is the same cached "pending" query Home and Scheduled already
   * use, so it costs a cache read rather than a request.
   */
  const tasksQuery = useTasksQuery("pending");
  const overdueCount = useMemo(() => {
    const today = todayKey();
    return (tasksQuery.data ?? []).filter((task) => isOverdue(task, today)).length;
  }, [tasksQuery.data]);

  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <DockedTabBar
          {...props}
          onCapture={() => {
            advanceTour("capture");
            navigation.navigate("Capture");
          }}
        />
      )}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen
        name="Scheduled"
        component={ScheduledScreen}
        options={{
          tabBarBadge: overdueCount > 0 ? overdueCount : undefined,
          tabBarAccessibilityLabel:
            overdueCount > 0 ? `Scheduled, ${overdueCount} overdue` : "Scheduled",
        }}
      />
      <Tab.Screen name="Progress" component={ProgressScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
