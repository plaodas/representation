import * as DocumentPicker from "expo-document-picker";
import { File as DeviceFile, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { carryText, mergeCarry, parseCarry } from "../domain/carry";
import { loadRecord, saveRecord } from "./db";

const fileName = "representation.json";

const download = (text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

export const writeOut = async () => {
  const text = carryText(await loadRecord());
  if (Platform.OS === "web") {
    download(text);
    return;
  }
  const file = new DeviceFile(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType: "application/json", UTI: "public.json" });
};

export const readIn = async () => {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "public.json"],
    multiple: false,
    copyToCacheDirectory: true,
    base64: false,
  });
  if (picked.canceled || !picked.assets[0]) return false;
  const asset = picked.assets[0];
  const text = asset.file ? await asset.file.text() : await new DeviceFile(asset.uri).text();
  const parsed = parseCarry(text);
  if (!parsed) return false;
  await saveRecord(mergeCarry(await loadRecord(), parsed));
  return true;
};
