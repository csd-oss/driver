/**
 * The official question bank and its images, downloaded once and kept on the
 * device (iOS and Android). The native binaries do not bundle them: App
 * Review's automated checks flag the identical official content that many
 * driving-test apps ship. scripts/build-content.mjs builds the pack and the
 * PWA's Vercel deployment serves it.
 *
 * Layout under the cache directory (re-downloadable data belongs there, per
 * Apple's data storage guidelines; it is not backed up):
 *   content/current.json        { version } of the installed pack
 *   content/<version>/          manifest.json, questions.json, images/…
 *
 * Startup (app/_layout.tsx): loadInstalledContent() reads the installed pack
 * from disk. Only when there is none does the app show the download screen
 * (components/ContentGate.tsx), which calls downloadContent(). After that the
 * app is offline. checkForContentUpdate() quietly fetches a newer pack in the
 * background; it is used from the next launch.
 */
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import type { ImageSourcePropType } from 'react-native';
import { setQuestionData } from './questionData';

// EXPO_PUBLIC_CONTENT_URL points a test build at a local server (scripts/serve-web.mjs).
export const CONTENT_URL = process.env.EXPO_PUBLIC_CONTENT_URL || 'https://driver.smartie.team/content/v1/';

interface ImageEntry { path: string; bytes: number; width: number; height: number }
interface Manifest {
  version: string;
  questions: { path: string; bytes: number; sha256: string };
  images: Record<string, ImageEntry>;
}
export interface ContentProgress { done: number; total: number }

const ROOT = `${FileSystem.cacheDirectory}content/`;
const POINTER = `${ROOT}current.json`;
const CONCURRENCY = 8;

let installed: { dir: string; manifest: Manifest } | null = null;

const readJson = async <T,>(uri: string): Promise<T | null> => {
  try {
    return JSON.parse(await FileSystem.readAsStringAsync(uri)) as T;
  } catch {
    return null;
  }
};

const fetchManifest = async (): Promise<Manifest> => {
  const response = await fetch(`${CONTENT_URL}manifest.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Content manifest: HTTP ${response.status}`);
  return (await response.json()) as Manifest;
};

/** Load the pack of `dir` into memory; false if anything is missing. */
const loadFrom = async (dir: string): Promise<boolean> => {
  const manifest = await readJson<Manifest>(`${dir}manifest.json`);
  if (!manifest) return false;
  const questions = await readJson<unknown[][]>(`${dir}${manifest.questions.path}`);
  if (!Array.isArray(questions) || questions.length !== 3) return false;
  setQuestionData(questions);
  installed = { dir, manifest };
  return true;
};

/** Use the pack already on the device. True when the app can start. */
export const loadInstalledContent = async (): Promise<boolean> => {
  const pointer = await readJson<{ version: string }>(POINTER);
  if (!pointer?.version) return false;
  if (!(await loadFrom(`${ROOT}${pointer.version}/`))) return false;
  prune(pointer.version).catch(() => {});
  return true;
};

/** Download every file of `manifest` into its version directory. */
const downloadPack = async (manifest: Manifest, onProgress?: (p: ContentProgress) => void): Promise<string> => {
  const dir = `${ROOT}${manifest.version}/`;
  const files = [
    { path: manifest.questions.path, bytes: manifest.questions.bytes },
    ...Object.values(manifest.images).map(({ path, bytes }) => ({ path, bytes })),
  ];
  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  let done = 0;
  onProgress?.({ done, total });

  const queue = [...files];
  const worker = async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      const target = `${dir}${file.path}`;
      await FileSystem.makeDirectoryAsync(target.slice(0, target.lastIndexOf('/')), { intermediates: true });
      const result = await FileSystem.downloadAsync(`${CONTENT_URL}${file.path}`, target);
      if (result.status !== 200) throw new Error(`${file.path}: HTTP ${result.status}`);
      done += file.bytes;
      onProgress?.({ done, total });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // The questions must be exactly the published file before the pack counts.
  const text = await FileSystem.readAsStringAsync(`${dir}${manifest.questions.path}`);
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
  if (digest !== manifest.questions.sha256) throw new Error('Downloaded questions are damaged');
  await FileSystem.writeAsStringAsync(`${dir}manifest.json`, JSON.stringify(manifest));
  return dir;
};

/** Point current.json at `version`; it is used from the next load. */
const activate = (version: string): Promise<void> =>
  FileSystem.writeAsStringAsync(POINTER, JSON.stringify({ version }));

/** Remove every version but `keep`. Only at startup: the screens show images from the loaded one. */
const prune = async (keep: string): Promise<void> => {
  const entries = await FileSystem.readDirectoryAsync(ROOT).catch(() => [] as string[]);
  await Promise.all(entries
    .filter((name) => name !== keep && name !== 'current.json')
    .map((name) => FileSystem.deleteAsync(`${ROOT}${name}`, { idempotent: true })));
};

/** First launch: fetch the pack and load it. Throws when offline or on a bad download. */
export const downloadContent = async (onProgress?: (p: ContentProgress) => void): Promise<void> => {
  await FileSystem.makeDirectoryAsync(ROOT, { intermediates: true });
  const manifest = await fetchManifest();
  const dir = await downloadPack(manifest, onProgress);
  await activate(manifest.version);
  if (!(await loadFrom(dir))) throw new Error('Downloaded content could not be read');
};

/** Fetch a newer pack in the background; the app switches to it on the next launch. */
export const checkForContentUpdate = async (): Promise<void> => {
  if (!installed) return;
  try {
    const manifest = await fetchManifest();
    if (manifest.version === installed.manifest.version) return;
    await downloadPack(manifest);
    await activate(manifest.version);
  } catch {
    // Offline or a failed download: keep the installed pack, try next launch.
  }
};

/** The image of a question, from the installed pack. */
export const questionImageSource = (key: string | null | undefined): ImageSourcePropType | null => {
  const entry = key && installed?.manifest.images[key];
  if (!entry) return null;
  return { uri: `${installed!.dir}${entry.path}`, width: entry.width, height: entry.height };
};
