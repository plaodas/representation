import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fadeToScreen } from "../components/Frame";
import { readIn, writeOut } from "../data/carry";
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
      .then(setPoems)
      .catch(() => undefined);
  }, []));
  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.page}>
      {poems.map((poem) => {
        const first = poem.body.split("\n").find((line) => line.trim())
          ?? (poem.missed ? "届かなかった" : "待つ");
        return (
          <Pressable
            key={poem.id ?? poem.day}
            onPress={() => {
              fadeToScreen(() => router.push({
                pathname: "/arrived",
                params: poem.id ? { day: poem.day, id: poem.id } : { day: poem.day },
              }));
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
              <View style={styles.edge}>
                {poem.id ? <Text style={[styles.day, { color: ground.faint }]}>綴</Text> : null}
                <Text style={[styles.day, { color: ground.faint }]}>{dayLabel(poem.day)}</Text>
              </View>
            </View>
          </Pressable>
        );
      })}
      <View style={styles.words}>
        <Pressable onPress={() => {
          void writeOut();
        }}>
          <Text style={[styles.word, { color: ground.faint }]}>送り出す</Text>
        </Pressable>
        <Pressable onPress={() => {
          void readIn().then((read) => {
            if (read) return loadArrived().then(setPoems);
          });
        }}>
          <Text style={[styles.word, { color: ground.faint }]}>迎える</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { paddingHorizontal: 28, paddingVertical: 36, maxWidth: 720, width: "100%", alignSelf: "center" },
  row: { flexDirection: "row", alignItems: "baseline", gap: 16, paddingVertical: 14 },
  line: { flex: 1, fontSize: 18, lineHeight: 30 },
  edge: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  day: { fontSize: 12, letterSpacing: 1 },
  words: {
    marginTop: 28,
    flexDirection: "row",
    justifyContent: "center",
    gap: 28,
  },
  word: { fontSize: 13, letterSpacing: 2 },
});
