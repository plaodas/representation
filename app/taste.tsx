import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fadeToScreen } from "../components/Frame";
import { loadArrived, loadLang, loadReactions, saveForm, saveLang, type Arrived } from "../data/db";
import { groundFor, poemById } from "../data/library";
import { langModeLabel, nextLangMode, sayLabel, seeLabel, type LangMode, type Reaction, type SayTag, type SeeTag } from "../domain/types";

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
  const router = useRouter();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [arrived, setArrived] = useState<Arrived[]>([]);
  const [langMode, setLangMode] = useState<LangMode>("mix");
  useFocusEffect(useCallback(() => {
    Promise.all([loadReactions(), loadLang(), loadArrived()])
      .then(([stored, mode, poems]) => {
        setReactions(stored);
        setLangMode(mode);
        setArrived(poems);
      })
      .catch(() => undefined);
  }, []));
  const likes = reactions.filter((reaction) => reaction.sentiment === "like");
  const words = ranked(reactions);
  const reasons = [
    ...likes.filter((reaction) => reaction.reason.trim()).map((reaction) => ({
      key: reaction.poemId,
      at: reaction.updatedAt,
      reason: reaction.reason,
      open: () => {
        const poem = poemById(reaction.poemId);
        if (!poem) return;
        fadeToScreen(() => {
          void saveForm(poem.form).then(() => {
            router.push({ pathname: "/", params: { poem: poem.id } });
          });
        });
      },
    })),
    ...arrived.filter((poem) => poem.sentiment === "like" && poem.reason.trim()).map((poem) => ({
      key: `arrived:${poem.day}`,
      at: poem.notedAt ?? poem.day,
      reason: poem.reason,
      open: () => {
        fadeToScreen(() => router.push({ pathname: "/arrived", params: { day: poem.day } }));
      },
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const cycleLang = () => {
    const mode = nextLangMode(langMode);
    setLangMode(mode);
    void saveLang(mode);
  };

  return (
    <View style={styles.fill}>
      <ScrollView style={styles.fill} contentContainerStyle={styles.page}>
          {likes.length === 0 && reasons.length === 0 ? (
            <Text style={[styles.lead, { color: ground.color }]}>反応がたまるとここに並ぶ。</Text>
          ) : (
            <>
              {words.map((word) => (
                <Text key={word} style={[styles.word, { color: ground.color }]}>{word}</Text>
              ))}
              {reasons.map((item) => (
                <Pressable key={item.key} onPress={item.open}>
                  <Text style={[styles.reason, { color: ground.faint }]}>{item.reason}</Text>
                </Pressable>
              ))}
            </>
          )}
      </ScrollView>
      <Pressable onPress={cycleLang} style={styles.lang}>
        <Text style={[styles.langWord, { color: ground.faint }]}>{langModeLabel[langMode]}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { paddingHorizontal: 36, paddingVertical: 48, maxWidth: 640, width: "100%", alignSelf: "center" },
  lead: { fontSize: 18, lineHeight: 32 },
  word: { fontSize: 22, lineHeight: 40, fontFamily: "ZenOldMincho_400Regular" },
  reason: { marginTop: 18, fontSize: 16, lineHeight: 28 },
  lang: { alignItems: "center", paddingBottom: 12 },
  langWord: { fontSize: 13, letterSpacing: 2 },
});
