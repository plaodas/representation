import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fadeToScreen } from "../components/Frame";
import { loadArrived, saveArrived, type Arrived } from "../data/db";
import { groundFor, todayKey } from "../data/library";

export default function ArrivedScreen() {
  const ground = groundFor();
  const router = useRouter();
  const params = useLocalSearchParams<{ day?: string }>();
  const day = params.day || todayKey();
  const [arrived, setArrived] = useState<Arrived | null>(null);

  useEffect(() => {
    let alive = true;
    loadArrived()
      .then((stored) => {
        const poem = stored.find((item) => item.day === day);
        if (!alive || !poem?.body) return;
        setArrived(poem);
        if (!poem.seen) void saveArrived({ ...poem, seen: true });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [day]);

  if (!arrived) return null;

  return (
    <View style={styles.stage}>
      {arrived.thumb ? (
        <Image source={{ uri: arrived.thumb }} blurRadius={36} style={styles.photo} />
      ) : null}
      <ScrollView contentContainerStyle={styles.poemWrap}>
        <Text
          style={[
            styles.body,
            {
              color: ground.color,
              fontFamily: arrived.lang === "ja" ? "ZenOldMincho_400Regular" : "EBGaramond_400Regular",
            },
          ]}
        >
          {arrived.body}
        </Text>
        <Pressable
          onPress={() => fadeToScreen(() => router.push("/memory"))}
          style={styles.memory}
        >
          <Text style={[styles.memoryWord, { color: ground.faint }]}>記憶</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1 },
  photo: {
    ...StyleSheet.absoluteFill,
    opacity: 0.72,
    transform: [{ scale: 1.2 }],
  },
  poemWrap: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 36,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  body: { fontSize: 22, lineHeight: 40 },
  memory: { marginTop: 28, alignSelf: "center" },
  memoryWord: { fontSize: 13, letterSpacing: 2 },
});
