import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Frame } from "../components/Frame";
import { loadForm, loadReactions, loadRead, saveForm, saveReaction, saveRead } from "../data/db";
import { allPoems, groundFor, poemById, todayKey } from "../data/library";
import { advanceRead, resolveOpen, selectNextPoem } from "../domain/selectNext";
import { emptyRead, formLabel, forms, type Form, type Reaction, type ReadState } from "../domain/types";

export default function TodayScreen() {
  const ground = groundFor();
  const router = useRouter();
  const params = useLocalSearchParams<{ poem?: string }>();
  const [form, setForm] = useState<Form>("free");
  const [read, setRead] = useState<ReadState>(emptyRead());
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [ready, setReady] = useState(false);
  const [actionsClear, setActionsClear] = useState(false);
  const viewing = params.poem ? poemById(params.poem) : undefined;
  const reasonSave = useRef(Promise.resolve());
  const latestReason = useRef("");

  const openForm = useCallback(async (nextForm: Form) => {
    const today = todayKey();
    const [stored, storedReactions] = await Promise.all([
      loadRead(nextForm),
      loadReactions(),
    ]);
    const opened = resolveOpen({
      poems: allPoems,
      reactions: storedReactions,
      today,
      form: nextForm,
      read: stored,
    });
    if (opened.read !== stored) await saveRead(nextForm, opened.read);
    setForm(nextForm);
    setRead(opened.read);
    setReactions(storedReactions);
    setReady(true);
  }, []);

  useEffect(() => {
    loadForm().then(openForm).catch(() => setReady(true));
  }, [openForm]);

  const current = viewing ?? poemById(read.lastPoemId ?? "");
  const reaction = reactions.find((item) => item.poemId === current?.id);
  const wide = current?.form === "haiku" || current?.form === "tanka";

  useEffect(() => {
    latestReason.current = reaction?.reason ?? "";
  }, [current?.id, reaction?.sentiment]);

  const choose = async (sentiment: "like" | "dislike") => {
    if (!current) return;
    await reasonSave.current.catch(() => undefined);
    await saveReaction(current.id, sentiment, latestReason.current);
    setReactions(await loadReactions());
  };

  const writeReason = (reason: string) => {
    if (!current) return;
    latestReason.current = reason;
    const poemId = current.id;
    reasonSave.current = reasonSave.current.catch(() => undefined).then(() =>
      saveReaction(poemId, "like", reason),
    );
  };

  const nextPoem = async () => {
    const today = todayKey();
    const poemId = selectNextPoem({
      poems: allPoems,
      reactions,
      today,
      form,
      read,
    });
    const advanced = advanceRead(read, poemId, today);
    await saveRead(form, advanced);
    setRead(advanced);
    setActionsClear(false);
    if (viewing) router.replace("/");
  };

  const cycleForm = async () => {
    const next = forms[(forms.indexOf(form) + 1) % forms.length];
    await saveForm(next);
    router.replace("/");
    await openForm(next);
  };

  return (
    <Frame>
      <View style={styles.top}>
        <Pressable onPress={cycleForm}>
          <Text style={[styles.faint, { color: ground.faint }]}>{formLabel[form]}</Text>
        </Pressable>
        <Text style={[styles.faint, { color: ground.faint }]}>{read.countToday || ""}</Text>
      </View>
      <ScrollView
        contentContainerStyle={[styles.poemWrap, wide && styles.wide]}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          const distance = contentSize.height - layoutMeasurement.height - contentOffset.y;
          if (distance < 48) setActionsClear(true);
        }}
        scrollEventThrottle={16}
      >
        {ready && current ? (
          <Text
            style={[
              styles.body,
              {
                color: ground.color,
                fontFamily: current.lang === "ja" ? "ZenOldMincho_400Regular" : "EBGaramond_400Regular",
              },
            ]}
          >
            {current.body}
          </Text>
        ) : null}
        {current ? (
          <Text style={[styles.credit, { color: ground.faint }]}>
            {[current.title, current.poet].filter(Boolean).join("　")}
          </Text>
        ) : null}
      </ScrollView>
      <View
        style={{ opacity: actionsClear ? 1 : 0.28 }}
        onPointerEnter={() => setActionsClear(true)}
      >
        <View style={styles.actions}>
          <Pressable onPress={() => choose("like")}>
            <Text style={{ color: ground.color }}>好き</Text>
          </Pressable>
          <Pressable onPress={() => choose("dislike")}>
            <Text style={{ color: ground.color }}>嫌い</Text>
          </Pressable>
          <Pressable onPress={nextPoem}>
            <Text style={{ color: ground.color }}>次の一首</Text>
          </Pressable>
        </View>
        {reaction?.sentiment === "like" ? (
          <TextInput
            key={current?.id}
            defaultValue={reaction.reason}
            onChangeText={writeReason}
            placeholder="ひとこと"
            placeholderTextColor={ground.faint}
            style={[styles.reason, { color: ground.color, borderColor: ground.faint }]}
          />
        ) : null}
      </View>
    </Frame>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 28,
  },
  faint: { fontSize: 13, letterSpacing: 2 },
  poemWrap: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 36,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  wide: { paddingVertical: 72 },
  body: { fontSize: 22, lineHeight: 40 },
  credit: { marginTop: 28, fontSize: 13 },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 28,
    paddingBottom: 8,
  },
  reason: {
    alignSelf: "center",
    width: "70%",
    maxWidth: 420,
    borderBottomWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    paddingVertical: 8,
    marginBottom: 12,
  },
});
