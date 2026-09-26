import { Link, usePathname } from "expo-router";
import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { groundFor } from "../data/library";

const links = [
  { href: "/", label: "今日" },
  { href: "/taste", label: "好み" },
  { href: "/read", label: "読んだ詩" },
] as const;

export const Frame = ({ children }: { children: ReactNode }) => {
  const ground = groundFor();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  return (
    <View style={[styles.screen, { backgroundColor: ground.background, paddingTop: insets.top + 18 }]}>
      <Text style={[styles.name, { color: ground.faint }]}>表象</Text>
      <View style={styles.body}>{children}</View>
      <View style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        {links.map((link) => {
          const current = link.href === "/" ? path === "/" : path === link.href;
          return (
            <Link key={link.href} href={link.href} asChild>
              <Pressable>
                <Text style={{ color: ground.color, opacity: current ? 0.85 : 0.35 }}>{link.label}</Text>
              </Pressable>
            </Link>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  name: { textAlign: "center", letterSpacing: 6, fontSize: 13 },
  body: { flex: 1 },
  nav: { flexDirection: "row", justifyContent: "center", gap: 28 },
});
