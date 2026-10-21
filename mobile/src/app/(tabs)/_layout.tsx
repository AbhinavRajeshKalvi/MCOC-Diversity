import { Tabs } from "expo-router/js-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { colors, fonts } from "@/lib/theme";
import { BrandMark } from "@/components/ui";
import { HeaderRight } from "@/components/HeaderButtons";

export const unstable_settings = { initialRouteName: "battlegroups" };

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

// Same sections and class-color accents as the website's sidebar.
// `label` is a shorter tab-bar label where the title doesn't fit six tabs.
const TABS: { name: string; title: string; label?: string; icon: IconName; accent: string }[] = [
  { name: "battlegroups", title: "Battlegroups", label: "BGs", icon: "account-group", accent: colors.cosmic },
  { name: "attack", title: "Attack", icon: "crosshairs-gps", accent: colors.mutant },
  { name: "counters", title: "Counters", icon: "sword-cross", accent: colors.skill },
  { name: "roster", title: "My Roster", icon: "shield-half-full", accent: colors.science },
  { name: "alliance", title: "Alliance", icon: "flag-variant", accent: colors.tech },
  { name: "chat", title: "Chat", icon: "forum", accent: colors.tealBright }
];

function HeaderTitle({ title }: { title: string }) {
  const { alliance } = useAuth();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <BrandMark size={30} />
      <View>
        <Text style={{ fontFamily: fonts.display, fontSize: 21, lineHeight: 23, color: colors.parchment, textTransform: "uppercase", letterSpacing: 1 }}>
          {title}
        </Text>
        {alliance && (
          <Text numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 11, color: colors.parchmentFaint }}>
            {alliance.name}
          </Text>
        )}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.line },
        headerShadowVisible: false,
        headerTintColor: colors.parchment,
        headerRight: () => <HeaderRight />,
        sceneStyle: { backgroundColor: colors.ink },
        tabBarStyle: {
          backgroundColor: colors.panel,
          borderTopColor: colors.line,
          height: 60 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Platform.OS === "android" ? Math.max(insets.bottom, 8) : insets.bottom
        },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 11 },
        tabBarInactiveTintColor: colors.parchmentFaint,
        // Keeps the chat composer right above the keyboard.
        tabBarHideOnKeyboard: true
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarLabel: tab.label ?? tab.title,
            headerTitle: () => <HeaderTitle title={tab.title} />,
            tabBarActiveTintColor: tab.accent,
            tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name={tab.icon} color={color} size={size} />
          }}
        />
      ))}
    </Tabs>
  );
}
