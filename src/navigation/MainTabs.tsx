import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HomeTabIcon, ProgressTabIcon, SettingsTabIcon } from "../components";
import { HomeScreen } from "../screens/HomeScreen";
import { ProgressScreen } from "../screens/ProgressScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { color, font } from "../theme";
import type { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<keyof MainTabParamList, (props: { active: boolean }) => React.ReactElement> = {
  Home: HomeTabIcon,
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
      <Tab.Screen name="Progress" component={ProgressScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
