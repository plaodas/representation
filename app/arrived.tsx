import { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { loadArrived, saveArrived, type Arrived } from "../data/db";
import { groundFor } from "../data/library";

export default function ArrivedScreen() {
  const ground = groundFor();
  const [arrived, setArrived] = useState<Arrived | null>(null);

  useEffect(() => {
    let alive = true;
    loadArrived()
      .then((stored) => {
        if (!alive || !stored?.body) return;
        setArrived(stored);
        if (!stored.seen) void saveArrived({ ...stored, seen: true });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1 },
  photo: {
    ...StyleSheet.absoluteFillObject,
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
});