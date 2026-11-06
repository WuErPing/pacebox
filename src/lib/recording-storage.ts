import { Directory, File, Paths } from "expo-file-system";

/**
 * 原生端录音持久化：expo-file-system 新 API。
 * ESR persist / expo-audio 的产物统一 move 到 document/rehearsals/<id>.<ext>。
 */

export interface RecordingSource {
  uri?: string;
  /** 仅 web 端使用 */
  blob?: Blob;
  mime?: string;
}

const DIR_NAME = "rehearsals";

function rehearsalDir(): Directory {
  const dir = new Directory(Paths.document, DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function extFromMime(mime?: string): string {
  if (mime === "audio/webm") return ".webm";
  if (mime === "audio/wav") return ".wav";
  if (mime === "audio/x-caf") return ".caf";
  return ".m4a";
}

function mimeFromExt(ext: string): string {
  if (ext === ".wav") return "audio/wav";
  if (ext === ".webm") return "audio/webm";
  if (ext === ".caf") return "audio/x-caf";
  return "audio/mp4";
}

export async function persistRecording(
  id: string,
  source: RecordingSource | null,
): Promise<{ ref: string; mime: string } | null> {
  if (!source?.uri) return null;
  try {
    const src = new File(source.uri);
    if (!src.exists) return null;
    const ext = src.extension || extFromMime(source.mime);
    const dest = new File(rehearsalDir(), `${id}${ext}`);
    if (dest.exists) dest.delete();
    src.move(dest);
    return { ref: dest.uri, mime: source.mime ?? mimeFromExt(ext) };
  } catch {
    return null;
  }
}

export async function deleteRecording(ref: string): Promise<void> {
  try {
    const file = new File(ref);
    if (file.exists) file.delete();
  } catch {
    // 忽略删除失败
  }
}

export async function listRecordingRefs(): Promise<string[]> {
  try {
    return rehearsalDir()
      .list()
      .filter((item): item is File => item instanceof File)
      .map((file) => file.uri);
  } catch {
    return [];
  }
}

/** 原生端直接用 file:// URI 播放，无需 blob */
export async function loadRecordingBlob(_ref: string): Promise<Blob | null> {
  return null;
}
