import React, { useMemo } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTasksQuery } from "../api/queries/useTasks";
import { HomeTabIcon, ProgressTabIcon, ScheduledTabIcon, SettingsTabIcon } from "../components";
import { HomeScreen } from "../screens/HomeScreen";
import { ScheduledScreen } from "../screens/ScheduledScreen";
import { ProgressScreen } from "../screens/ProgressScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { color, font } from "../theme";
import { isOverdue, todayKey } from "../utils/schedule";
import type { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<keyof MainTabParamList, (props: { active: boolean }) => React.ReactElement> = {
  Home: HomeTabIcon,
  Scheduled: ScheduledTabIcon,
  Progress: ProgressTabIcon,
  Settings: SettingsTabIcon,
};

const LABEL_LINE_HEIGHT = 15;

/**
 * Content height a tab item actually occupies, from @react-navigation/bottom-tabs:
 *   5  tabVerticalUiKit paddingTop
 *  28  icon wrapper (ICON_SIZE_TALL — the wrapper, not our 22px glyph)
 *  15  label line box
 *   5  tabVerticalUiKit paddingBottom
 *  = 53
 *
 * The library's own default is 49, which overflows and clips the label's descenders.
 * 58 leaves headroom without drifting far from the platform norm.
 */
const TAB_CONTENT_HEIGHT = 58;

export function MainTabs() {
  // getTabBarHeight returns a numeric tabBarStyle.height verbatim and skips its own inset
  // math, so any explicit height has to carry the inset itself. paddingBottom is left
  // alone — the library already sets it to insets.bottom, and overriding it is what put
  // the labels under the system nav bar.
  const insets = useSafeAreaInsets();

  /**
   * "Overdue" earns a badge rather than a place in the label: measured at this tab bar's
   * own 11px/800 style, "Upcoming/Overdue" renders 103px wide against roughly 103px of
   * available tab width on a 412dp phone — it would clip on every device, and worse on
   * smaller ones. A count badge says the same thing in less space, and says nothing at
   * all on the common case where nothing is overdue.
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
      screenOptions={({ route }) => {
        const Icon = TAB_ICONS[route.name];
        return {
          headerShown: false,
          tabBarActiveTintColor: color.interactive,
          tabBarInactiveTintColor: color.textFaint,
          tabBarStyle: {
            backgroundColor: color.card,
            borderTopColor: color.border,
            height: TAB_CONTENT_HEIGHT + insets.bottom,
          },
          // lineHeight is not optional: the library's label style sets a font size and no
          // line height, which is fine for the system font but clips the descenders of
          // Plus Jakarta Sans ExtraBold.
          tabBarLabelStyle: {
            fontFamily: font.black,
            fontSize: 11,
            lineHeight: LABEL_LINE_HEIGHT,
            letterSpacing: 0.2,
          },
          tabBarIcon: ({ focused }) => <Icon active={focused} />,
        };
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen
        name="Scheduled"
        component={ScheduledScreen}
        options={{
          tabBarBadge: overdueCount > 0 ? overdueCount : undefined,
          tabBarBadgeStyle: { backgroundColor: color.danger, fontFamily: font.black, fontSize: 10 },
          tabBarAccessibilityLabel:
            overdueCount > 0 ? `Scheduled, ${overdueCount} overdue` : "Scheduled",
        }}
      />
      <Tab.Screen name="Progress" component={ProgressScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
