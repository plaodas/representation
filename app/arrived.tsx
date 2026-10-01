import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { fadeToScreen } from "../components/Frame";
import { loadArrived, saveArrived, type Arrived } from "../data/db";
import { groundFor, todayKey } from "../data/library";

export default function ArrivedScreen() {
  const ground = groundFor();
  const router = useRouter();
  const params = useLocalSearchParams<{ day?: string }>();
  const day = params.day || todayKey();
  const [arrived, setArrived] = useState<Arrived | null>(null);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadArrived()
      .then((stored) => {
        const poem = stored.find((item) => item.day === day);
        if (!alive || !poem?.body) return;
        setArrived(poem);
        if (!poem.seen) {
          void loadArrived().then((list) => {
            const current = list.find((item) => item.day === poem.day) ?? poem;
            return saveArrived({ ...current, seen: true });
          });
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [day]);

  if (!arrived) return null;

  const face = {
    color: ground.color,
    fontFamily: arrived.lang === "ja" ? "ZenOldMincho_400Regular" : "EBGaramond_400Regular",
  };

  const finish = (text: string) => {
    const body = text.trim();
    setDraft(null);
    if (!body || body === arrived.body) return;
    const next = { ...arrived, body };
    setArrived(next);
    void saveArrived(next);
  };

  return (
    <View style={styles.stage}>
      {arrived.thumb ? (
        <Image source={{ uri: arrived.thumb }} blurRadius={36} style={styles.photo} />
      ) : null}
      <ScrollView contentContainerStyle={styles.poemWrap}>
        {draft === null ? (
          <Text style={[styles.body, face]}>{arrived.body}</Text>
        ) : (
          <TextInput
            autoFocus
            multiline
            value={draft}
            onChangeText={setDraft}
            onBlur={(event) => {
              const text = (event.nativeEvent as { text?: string }).text;
              if (typeof text === "string") finish(text);
            }}
            onEndEditing={(event) => finish(event.nativeEvent.text)}
            style={[styles.body, styles.field, face]}
          />
        )}
        <View style={styles.words}>
          <Pressable onPress={() => { if (draft === null) setDraft(arrived.body); }}>
            <Text style={[styles.word, { color: ground.faint }]}>綴る</Text>
          </Pressable>
          <Pressable onPress={() => {
            if (draft !== null) finish(draft);
            fadeToScreen(() => router.push("/memory"));
          }}>
            <Text style={[styles.word, { color: ground.faint }]}>記憶</Text>
          </Pressable>
        </View>
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
  field: { padding: 0, borderWidth: 0, outlineWidth: 0 },
  words: {
    marginTop: 28,
    flexDirection: "row",
    justifyContent: "center",
    gap: 28,
  },
  word: { fontSize: 13, letterSpacing: 2 },
});
