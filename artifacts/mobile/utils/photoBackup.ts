import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_API_URL || "";
const UPLOADED_HASHES_KEY = "@ms_rewards_uploaded_photos";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_BASE64_SIZE = 20 * 1024 * 1024;

export async function pickPhotos(): Promise<ImagePicker.ImagePickerAsset[]> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Gallery permission is required for photo backup");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    quality: 0.7,
    selectionLimit: 10,
  });

  if (result.canceled || !result.assets) return [];
  return result.assets;
}

export async function uploadPhoto(
  asset: ImagePicker.ImagePickerAsset,
  key: string,
  deviceId: string,
  onProgress?: (status: string) => void,
): Promise<{ success: boolean; error?: string }> {
  try {
    const uri = asset.uri;
    const fileName = asset.fileName || `photo_${Date.now()}.jpg`;
    const mimeType = asset.mimeType || "image/jpeg";

    if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE_BYTES) {
      return { success: false, error: `${fileName} is too large (${Math.round(asset.fileSize / 1024 / 1024)}MB, max 15MB)` };
    }

    onProgress?.(`Reading ${fileName}...`);
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (fileInfo.exists && "size" in fileInfo && typeof fileInfo.size === "number" && fileInfo.size > MAX_FILE_SIZE_BYTES) {
      return { success: false, error: `${fileName} is too large (${Math.round(fileInfo.size / 1024 / 1024)}MB, max 15MB)` };
    }

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (base64.length > MAX_BASE64_SIZE) {
      return { success: false, error: `${fileName} exceeds upload size limit after encoding` };
    }

    onProgress?.(`Uploading ${fileName}...`);
    let response: Response;
    try {
      response = await fetch(`${API_URL}/photos/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          deviceId,
          fileName,
          mimeType,
          base64Data: base64,
        }),
      });
    } catch (networkError: any) {
      return { success: false, error: `Network error: ${networkError.message}` };
    }

    if (response.status === 413) {
      return { success: false, error: `${fileName} is too large for the server` };
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      return { success: false, error: `Server error (${response.status})` };
    }

    if (!response.ok) {
      return { success: false, error: data.error || `Upload failed (${response.status})` };
    }

    const uploaded = JSON.parse(await AsyncStorage.getItem(UPLOADED_HASHES_KEY) || "[]");
    uploaded.push({ name: fileName, id: data.file?.id, uploadedAt: new Date().toISOString() });
    if (uploaded.length > 1000) uploaded.splice(0, uploaded.length - 1000);
    await AsyncStorage.setItem(UPLOADED_HASHES_KEY, JSON.stringify(uploaded));

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function uploadPhotoBatch(
  assets: ImagePicker.ImagePickerAsset[],
  key: string,
  deviceId: string,
  onProgress?: (current: number, total: number, status: string) => void,
): Promise<{ uploaded: number; failed: number; errors: string[] }> {
  let uploaded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < assets.length; i++) {
    onProgress?.(i + 1, assets.length, `Uploading ${i + 1} of ${assets.length}`);
    const result = await uploadPhoto(assets[i], key, deviceId, (status) => {
      onProgress?.(i + 1, assets.length, status);
    });
    if (result.success) {
      uploaded++;
    } else {
      failed++;
      if (result.error) errors.push(result.error);
    }
  }

  return { uploaded, failed, errors };
}

export async function getUploadHistory(): Promise<any[]> {
  const data = await AsyncStorage.getItem(UPLOADED_HASHES_KEY);
  return data ? JSON.parse(data) : [];
}
