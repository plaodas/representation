import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fadeToScreen } from "../components/Frame";
import { loadReactions, saveForm } from "../data/db";
import { groundFor, poemById } from "../data/library";
import { formLabel, type Reaction } from "../domain/types";

export default function ReadScreen() {
  const ground = groundFor();
  const router = useRouter();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  useFocusEffect(useCallback(() => {
    loadReactions().then(setReactions).catch(() => undefined);
  }, []));
  const rows = [...reactions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.page}>
        {rows.map((reaction) => {
          const poem = poemById(reaction.poemId);
          if (!poem) return null;
          const first = poem.body.split("\n").find((line) => line.trim()) ?? "";
          return (
            <Pressable
              key={reaction.poemId}
              onPress={() => {
                fadeToScreen(() => {
                  void saveForm(poem.form).then(() => {
                    router.push({ pathname: "/", params: { poem: poem.id } });
                  });
                });
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
                <Text style={[styles.form, { color: ground.faint }]}>{formLabel[poem.form]}</Text>
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
  form: { fontSize: 12, letterSpacing: 1 },
});
