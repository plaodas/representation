import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fadeToScreen } from "../components/Frame";
import { loadArrived, type Arrived } from "../data/db";
import { groundFor } from "../data/library";

const dayLabel = (day: string) => {
  const [, month, date] = day.split("-");
  return `${Number(month)}月${Number(date)}日`;
};

export default function MemoryScreen() {
  const ground = groundFor();
  const router = useRouter();
  const [poems, setPoems] = useState<Arrived[]>([]);
  useFocusEffect(useCallback(() => {
    loadArrived()
      .then((stored) => setPoems(stored.filter((item) => item.body)))
      .catch(() => undefined);
  }, []));
  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.page}>
      {poems.map((poem) => {
        const first = poem.body.split("\n").find((line) => line.trim()) ?? "";
        return (
          <Pressable
            key={poem.day}
            onPress={() => {
              fadeToScreen(() => router.push({ pathname: "/arrived", params: { day: poem.day } }));
            }}
          >
            <View style={styles.row}>
              <Text
                style={[
                  styles.line,
                  {
                    color: ground.color,
                    fontFamily: poem.lang === "ja" ? "ZenOldMincho_400Regular" : "EBGaramond_400Regular",
                  },
                ]}
              >
                {first}
              </Text>
              <Text style={[styles.day, { color: ground.faint }]}>{dayLabel(poem.day)}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { paddingHorizontal: 28, paddingVertical: 36, maxWidth: 720, width: "100%", alignSelf: "center" },
  row: { flexDirection: "row", alignItems: "baseline", gap: 16, paddingVertical: 14 },
  line: { flex: 1, fontSize: 18, lineHeight: 30 },
  day: { fontSize: 12, letterSpacing: 1 },
});
