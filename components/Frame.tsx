import { usePathname, useRouter } from "expo-router";
import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { groundFor } from "../data/library";

const links = [
  { href: "/", label: "今日" },
  { href: "/taste", label: "好み" },
  { href: "/read", label: "読んだ詩" },
] as const;

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

let fadeOut: (() => Promise<void>) | null = null;

export const fadeToScreen = (go: () => void) => {
  const run = fadeOut;
  if (!run) {
    go();
    return;
  }
  void run().then(go).catch(() => undefined);
};

export const Frame = ({ children }: { children: ReactNode }) => {
  const ground = groundFor();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const router = useRouter();
  const fading = useRef(false);
  const pending = useRef(false);
  const opacityRef = useRef(1);
  const frameRef = useRef(0);
  const bodyRef = useRef<View>(null);
  const [opacity, setOpacity] = useState(1);

  const paint = (value: number) => {
    opacityRef.current = value;
    const node = bodyRef.current as unknown as {
      setNativeProps?: (props: { style: { opacity: number } }) => void;
      style?: { opacity: string };
    } | null;
    if (!node) return;
    if (typeof node.setNativeProps === "function") {
      node.setNativeProps({ style: { opacity: value } });
      return;
    }
    if (node.style) node.style.opacity = String(value);
  };

  const fade = (to: number, duration: number) =>
    new Promise<void>((resolve) => {
      const from = opacityRef.current;
      const start = performance.now();
      cancelAnimationFrame(frameRef.current);
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        paint(from + (to - from) * ease(t));
        if (t < 1) {
          frameRef.current = requestAnimationFrame(step);
          return;
        }
        setOpacity(to);
        resolve();
      };
      frameRef.current = requestAnimationFrame(step);
    });

  useLayoutEffect(() => {
    paint(opacityRef.current);
    fadeOut = () => {
      if (fading.current) return Promise.reject(new Error("fading"));
      fading.current = true;
      return fade(0, 280).then(() => {
        pending.current = true;
      });
    };
    return () => {
      fadeOut = null;
    };
  });

  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    void fade(1, 460).finally(() => {
      fading.current = false;
    });
  }, [path]);

  const go = (href: (typeof links)[number]["href"]) => {
    const here = href === "/" ? path === "/" : path === href;
    if (here || fading.current) return;
    fadeToScreen(() => router.push(href));
  };

  return (
    <View style={[styles.screen, { backgroundColor: ground.background, paddingTop: insets.top + 18 }]}>
      <Text style={[styles.name, { color: ground.faint }]}>表象</Text>
      <View ref={bodyRef} style={[styles.body, { opacity }]}>{children}</View>
      <View style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        {links.map((link) => {
          const current = link.href === "/" ? path === "/" : path === link.href;
          return (
            <Pressable key={link.href} onPress={() => go(link.href)}>
              <Text style={{ color: ground.color, opacity: current ? 0.85 : 0.35 }}>{link.label}</Text>
            </Pressable>
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
