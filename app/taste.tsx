import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { loadReactions } from "../data/db";
import { groundFor, poemById } from "../data/library";
import { sayLabel, seeLabel, type Reaction, type SayTag, type SeeTag } from "../domain/types";

const ranked = (reactions: Reaction[]) => {
  const see = new Map<SeeTag, number>();
  const say = new Map<SayTag, number>();
  for (const reaction of reactions) {
    const poem = poemById(reaction.poemId);
    if (!poem) continue;
    const delta = reaction.sentiment === "like" ? 1 : -1;
    for (const tag of poem.see) see.set(tag, (see.get(tag) ?? 0) + delta);
    for (const tag of poem.say) say.set(tag, (say.get(tag) ?? 0) + delta);
  }
  return [...see.entries(), ...say.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tag]) => (tag in seeLabel ? seeLabel[tag as SeeTag] : sayLabel[tag as SayTag]));
};

export default function TasteScreen() {
  const ground = groundFor();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  useFocusEffect(useCallback(() => {
    loadReactions().then(setReactions).catch(() => undefined);
  }, []));
  const likes = reactions.filter((reaction) => reaction.sentiment === "like");
  const words = ranked(reactions);
  const reasons = likes.filter((reaction) => reaction.reason.trim()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.page}>
        {likes.length === 0 ? (
          <Text style={[styles.lead, { color: ground.color }]}>反応がたまるとここに並ぶ。</Text>
        ) : (
          <>
            {words.map((word) => (
              <Text key={word} style={[styles.word, { color: ground.color }]}>{word}</Text>
            ))}
            {reasons.map((reaction) => (
              <Text key={reaction.poemId} style={[styles.reason, { color: ground.faint }]}>{reaction.reason}</Text>
            ))}
          </>
        )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { paddingHorizontal: 36, paddingVertical: 48, maxWidth: 640, width: "100%", alignSelf: "center" },
  lead: { fontSize: 18, lineHeight: 32 },
  word: { fontSize: 22, lineHeight: 40, fontFamily: "ZenOldMincho_400Regular" },
  reason: { marginTop: 18, fontSize: 16, lineHeight: 28 },
});
