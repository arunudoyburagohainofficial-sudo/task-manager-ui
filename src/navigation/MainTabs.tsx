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

const LABEL_FONT_SIZE = 10;
const LABEL_LINE_HEIGHT = 14;

/**
 * Content height a tab item actually occupies, from @react-navigation/bottom-tabs:
 *   5  tabVerticalUiKit paddingTop
 *  25  icon wrapper (icons.tsx's TAB_ICON_SIZE, 20px, plus the library's own ~5px wrapper)
 *  14  label line box
 *   5  tabVerticalUiKit paddingBottom
 *  = 49
 *
 * The library's own default is 49, which overflows and clips the label's descenders at
 * this size too — 52 leaves the same headroom the previous, larger version had.
 *
 * Every text style on Home shrank by the theme's TYPE_SCALE, but this bar's label style
 * is a raw object passed straight to the navigator rather than going through theme's
 * text(), so it never got smaller with everything else — it was the one region still at
 * its original size. This brings it down by roughly the same ~10% by hand.
 */
const TAB_CONTENT_HEIGHT = 52;

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
            fontSize: LABEL_FONT_SIZE,
            lineHeight: LABEL_LINE_HEIGHT,
            letterSpacing: 0.2,
          },
          // The tab bar is a fixed-height strip, so a large OS font setting pushes these
          // labels into the icons rather than making the bar taller. Everything routed
          // through theme's text() is capped the same way.
          tabBarAllowFontScaling: false,
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
