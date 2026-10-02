import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { fadeToScreen } from "../components/Frame";
import { loadArrived, loadLang, loadReactions, saveArrived, type Arrived } from "../data/db";
import { groundFor, todayKey } from "../data/library";
import { orderPhoto, watchArrival } from "../data/order";
import { likeCount, photoLikeThreshold } from "../domain/selectNext";
import type { LangMode } from "../domain/types";

export default function ArrivedScreen() {
  const ground = groundFor();
  const router = useRouter();
  const params = useLocalSearchParams<{ day?: string }>();
  const day = params.day || todayKey();
  const [arrived, setArrived] = useState<Arrived | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [limit, setLimit] = useState(false);
  const [canSend, setCanSend] = useState(false);
  const [langMode, setLangMode] = useState<LangMode>("mix");

  useEffect(() => {
    setAsking(false);
    setBlocked(false);
    setLimit(false);
  }, [day]);

  useEffect(() => {
    let alive = true;
    Promise.all([loadReactions(), loadLang()])
      .then(([reactions, lang]) => {
        if (!alive) return;
        setCanSend(likeCount(reactions) >= photoLikeThreshold);
        setLangMode(lang);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    loadArrived()
      .then((stored) => {
        const poem = stored.find((item) => item.day === day);
        if (!alive || !poem) return;
        setArrived(poem);
        if (poem.body && !poem.seen) {
          void loadArrived().then((list) => {
            const current = list.find((item) => item.day === poem.day) ?? poem;
            return saveArrived({ ...current, seen: true });
          });
        }
        if (!poem.body && !poem.missed && poem.day === todayKey()) {
          void watchArrival().then(async (next) => {
            if (!alive) return;
            if (next?.day === poem.day) {
              setArrived(next);
              return;
            }
            const current = (await loadArrived()).find((item) => item.day === poem.day);
            if (alive && current) setArrived(current);
          });
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [day]);

  if (!arrived) return null;

  const tone = (chosen: boolean, other: boolean) => (chosen ? 1 : other ? 0.28 : 1);
  const waiting = arrived.missed ? "届かなかった" : "待つ";

  const face = {
    color: ground.color,
    fontFamily: arrived.lang === "ja" ? "ZenOldMincho_400Regular" : "EBGaramond_400Regular",
  };

  const remember = (next: Arrived) => {
    setArrived(next);
    void saveArrived(next);
  };

  const choose = (sentiment: "like" | "dislike") => {
    remember({ ...arrived, sentiment, notedAt: new Date().toISOString() });
  };

  const toggle = (key: "scene" | "explains") => {
    remember({ ...arrived, [key]: !arrived[key], notedAt: new Date().toISOString() });
  };

  const finishReason = (text: string) => {
    remember({ ...arrived, reason: text, notedAt: new Date().toISOString() });
  };

  const finish = (text: string) => {
    const body = text.trim();
    setDraft(null);
    if (!body || body === arrived.body) return;
    const next = { ...arrived, body };
    setArrived(next);
    void saveArrived(next);
  };

  const sampleBody = () => {
    const text = (draft ?? arrived.body).trim();
    if (!text) return "";
    if (draft !== null && text !== arrived.body) {
      const next = { ...arrived, body: text };
      setArrived(next);
      void saveArrived(next);
    }
    if (draft !== null) setDraft(null);
    return text;
  };

  const pickPhoto = () => {
    setAsking(false);
    const sample = sampleBody();
    if (!sample) return;
    void (async () => {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        quality: 0.5,
        base64: false,
        exif: false,
      });
      if (picked.canceled || !picked.assets[0]?.uri) return;
      const reactions = await loadReactions();
      const sent = await orderPhoto(picked.assets[0].uri, reactions, langMode, sample);
      if (sent === "full") {
        setBlocked(true);
        setLimit(true);
        return;
      }
      if (sent !== "sent") return;
      const poem = await watchArrival();
      if (poem?.day) fadeToScreen(() => router.push({ pathname: "/arrived", params: { day: poem.day } }));
    })();
  };

  return (
    <View style={styles.stage}>
      {arrived.thumb ? (
        <Image source={{ uri: arrived.thumb }} blurRadius={36} style={styles.photo} />
      ) : null}
      <ScrollView contentContainerStyle={styles.poemWrap}>
        {!arrived.body ? (
          <Text style={[styles.body, face]}>{waiting}</Text>
        ) : draft === null ? (
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
        {arrived.body ? (
          <>
            <View style={styles.words}>
              <Pressable onPress={() => choose("like")}>
                <Text style={{ color: ground.color, opacity: tone(arrived.sentiment === "like", Boolean(arrived.sentiment)) }}>
                  好き
                </Text>
              </Pressable>
              <Pressable onPress={() => choose("dislike")}>
                <Text style={{ color: ground.color, opacity: tone(arrived.sentiment === "dislike", Boolean(arrived.sentiment)) }}>
                  嫌い
                </Text>
              </Pressable>
            </View>
            {arrived.sentiment === "like" ? (
              <TextInput
                key={`${arrived.day}:like`}
                defaultValue={arrived.reason}
                onChangeText={(text) => setArrived({ ...arrived, reason: text })}
                onBlur={(event) => {
                  const text = (event.nativeEvent as { text?: string }).text;
                  if (typeof text === "string") finishReason(text);
                }}
                onEndEditing={(event) => finishReason(event.nativeEvent.text)}
                placeholder="ひとこと"
                placeholderTextColor={ground.faint}
                style={[styles.reason, { color: ground.color, borderColor: ground.faint }]}
              />
            ) : null}
            <View style={styles.words}>
              <Pressable onPress={() => toggle("scene")}>
                <Text style={{ color: ground.color, opacity: arrived.scene ? 1 : 0.28 }}>情景は合っている</Text>
              </Pressable>
              <Pressable onPress={() => toggle("explains")}>
                <Text style={{ color: ground.color, opacity: arrived.explains ? 1 : 0.28 }}>説明しすぎ</Text>
              </Pressable>
            </View>
          </>
        ) : null}
        {limit ? (
          <Text style={[styles.consent, styles.limit, { color: ground.color }]}>
            詩の創作は1日1回までです。
          </Text>
        ) : asking ? (
          <Pressable onPress={pickPhoto}>
            <Text style={[styles.consent, { color: ground.color }]}>
              創作のために詩を外部へ送信します。サーバーへの送信データは創作後に削除されます。
            </Text>
          </Pressable>
        ) : null}
        <View style={styles.words}>
          {arrived.body ? (
            <Pressable onPress={() => {
              setAsking(false);
              setLimit(false);
              if (draft === null) setDraft(arrived.body);
            }}>
              <Text style={[styles.word, { color: ground.faint }]}>綴る</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => {
            setAsking(false);
            setLimit(false);
            if (draft !== null) finish(draft);
            fadeToScreen(() => router.push("/memory"));
          }}>
            <Text style={[styles.word, { color: ground.faint }]}>記憶</Text>
          </Pressable>
          {canSend ? (
            <Pressable onPress={() => {
              if (blocked) {
                setAsking(false);
                setLimit((value) => !value);
                return;
              }
              setLimit(false);
              setAsking((value) => !value);
            }}>
              <Text style={[styles.word, { color: ground.faint, opacity: asking ? 0.45 : 1 }]}>瞬間</Text>
            </Pressable>
          ) : null}
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
  consent: {
    marginTop: 28,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 22,
    textDecorationLine: "underline",
  },
  limit: {
    textDecorationLine: "none",
  },
  words: {
    marginTop: 28,
    flexDirection: "row",
    justifyContent: "center",
    gap: 28,
  },
  word: { fontSize: 13, letterSpacing: 2 },
  reason: {
    alignSelf: "center",
    width: "70%",
    maxWidth: 420,
    borderBottomWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    paddingVertical: 8,
    marginTop: 16,
  },
});
