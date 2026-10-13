/**
 * Web build: the PWA bundles the question bank and its images (it is not
 * reviewed by App Review), so there is nothing to download. Same interface as
 * contentPack.ts.
 */
import type { ImageSourcePropType } from 'react-native';
import { data } from '../../data/data5.js';
import { IMAGE_MANIFEST } from '../../data/imageManifest';
import { setQuestionData } from './questionData';

export interface ContentProgress { done: number; total: number }

export const loadInstalledContent = async (): Promise<boolean> => {
  setQuestionData(data as unknown[][]);
  return true;
};

export const downloadContent = async (): Promise<void> => {
  setQuestionData(data as unknown[][]);
};

export const checkForContentUpdate = async (): Promise<void> => {};

export const questionImageSource = (key: string | null | undefined): ImageSourcePropType | null =>
  (key && (IMAGE_MANIFEST as Record<string, ImageSourcePropType>)[key]) || null;
