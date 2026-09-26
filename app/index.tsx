import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { loadForm, loadReactions, loadRead, saveForm, saveReaction, saveRead } from "../data/db";
import { allPoems, groundFor, poemById, todayKey } from "../data/library";
import { advanceRead, resolveOpen, selectNextPoem } from "../domain/selectNext";
import { emptyRead, formLabel, forms, type Form, type Reaction, type ReadState } from "../domain/types";

let enterFaded = false;

const fadeTiming = (value: Animated.Value, to: number, duration: number) =>
  new Promise<void>((resolve) => {
    Animated.timing(value, {
      toValue: to,
      duration,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start(() => resolve());
  });

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
  const sentimentRef = useRef<Reaction["sentiment"] | null>(null);
  const shownReaction = useRef<{ id?: string; sentiment?: Reaction["sentiment"] }>({});
  const scrollRef = useRef<ScrollView>(null);
  const fading = useRef(false);
  const alive = useRef(true);
  const openedFaded = useState(() => {
    const faded = enterFaded;
    enterFaded = false;
    return faded;
  })[0];
  const poemOpacity = useRef(new Animated.Value(openedFaded ? 0 : 1)).current;

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

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!openedFaded) return;
    void fadeTiming(poemOpacity, 1, 460);
  }, [openedFaded, poemOpacity]);

  const current = viewing ?? poemById(read.lastPoemId ?? "");
  const reaction = reactions.find((item) => item.poemId === current?.id);
  const wide = current?.form === "haiku" || current?.form === "tanka";

  if (
    shownReaction.current.id !== current?.id ||
    shownReaction.current.sentiment !== reaction?.sentiment
  ) {
    shownReaction.current = { id: current?.id, sentiment: reaction?.sentiment };
    sentimentRef.current = reaction?.sentiment ?? null;
    latestReason.current = reaction?.reason ?? "";
  }

  const enqueue = (task: () => Promise<void>) => {
    reasonSave.current = reasonSave.current.catch(() => undefined).then(task);
    return reasonSave.current;
  };

  const choose = (sentiment: "like" | "dislike") => {
    if (!current) return;
    const poemId = current.id;
    sentimentRef.current = sentiment;
    const existing = reactions.find((item) => item.poemId === poemId);
    const reason = latestReason.current || existing?.reason || "";
    latestReason.current = reason;
    const next: Reaction = {
      poemId,
      sentiment,
      reason,
      updatedAt: new Date().toISOString(),
    };
    setReactions((prev) => [next, ...prev.filter((item) => item.poemId !== poemId)]);
    void enqueue(() => saveReaction(poemId, sentiment, reason));
  };

  const saveReason = (poemId: string, reason: string) => {
    latestReason.current = reason;
    void enqueue(async () => {
      if (sentimentRef.current !== "like") return;
      await saveReaction(poemId, "like", latestReason.current);
    });
  };

  const writeReason = (reason: string) => {
    if (!current || sentimentRef.current !== "like") return;
    const active = typeof document === "undefined" ? null : document.activeElement;
    if (active && active.tagName !== "INPUT" && active.tagName !== "TEXTAREA") return;
    saveReason(current.id, reason);
  };

  const finishReason = (reason: string) => {
    if (!current || sentimentRef.current !== "like") return;
    saveReason(current.id, reason);
  };

  const crossfade = async (swap: () => Promise<void>) => {
    if (fading.current) return;
    fading.current = true;
    try {
      await fadeTiming(poemOpacity, 0, 280);
      if (!alive.current) return;
      await swap();
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      if (!alive.current) return;
      enterFaded = false;
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      await fadeTiming(poemOpacity, 1, 460);
    } finally {
      fading.current = false;
    }
  };

  const nextPoem = () => {
    void crossfade(async () => {
      await reasonSave.current.catch(() => undefined);
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
      if (viewing) {
        enterFaded = true;
        router.replace("/");
      }
    });
  };

  const cycleForm = () => {
    void crossfade(async () => {
      const next = forms[(forms.indexOf(form) + 1) % forms.length];
      await saveForm(next);
      if (viewing) {
        enterFaded = true;
        router.replace("/");
      }
      await openForm(next);
    });
  };

  return (
    <>
      <Animated.View style={{ opacity: poemOpacity }}>
        <View style={styles.top}>
          <Pressable onPress={cycleForm}>
            <Text style={[styles.faint, { color: ground.faint }]}>{formLabel[form]}</Text>
          </Pressable>
          <Text style={[styles.faint, { color: ground.faint }]}>{read.countToday || ""}</Text>
        </View>
      </Animated.View>
      <Animated.View style={[styles.poemFade, { opacity: poemOpacity }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.poemFade}
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
      </Animated.View>
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
      </View>
      <Animated.View style={{ opacity: poemOpacity }}>
        {reaction?.sentiment === "like" && current ? (
          <TextInput
            key={`${current.id}:like`}
            defaultValue={reaction.reason}
            onChangeText={writeReason}
            onEndEditing={(event) => finishReason(event.nativeEvent.text)}
            placeholder="ひとこと"
            placeholderTextColor={ground.faint}
            style={[styles.reason, { color: ground.color, borderColor: ground.faint }]}
          />
        ) : null}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 28,
  },
  faint: { fontSize: 13, letterSpacing: 2 },
  poemFade: { flex: 1 },
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
