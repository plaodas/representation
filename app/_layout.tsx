import { EBGaramond_400Regular } from "@expo-google-fonts/eb-garamond";
import { ZenOldMincho_400Regular } from "@expo-google-fonts/zen-old-mincho";
import { Slot } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [ready] = useFonts({
    ZenOldMincho_400Regular,
    EBGaramond_400Regular,
  });

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <Slot />
    </SafeAreaProvider>
  );
}
