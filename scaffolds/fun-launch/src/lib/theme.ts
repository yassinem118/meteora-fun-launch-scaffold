import type { PresetId } from './dbc';

/**
 * Each launch type has its own colour world. The whole page takes the colour of the
 * selected preset, so the colour tells you which kind of curve you are shaping.
 */
export interface PresetTheme {
  /** Main accent: curve line, active states, primary button. */
  accent: string;
  /** Second stop of the accent gradient. */
  accent2: string;
  /** Text colour that stays readable on top of the accent. */
  onAccent: string;
  /** Short plain-language name of the feeling of this curve. */
  mood: string;
}

export const PRESET_THEME: Record<PresetId, PresetTheme> = {
  meme: { accent: '#FF5C7A', accent2: '#FFA24C', onAccent: '#2A0710', mood: 'Fast and loud' },
  steady: { accent: '#2FD3C0', accent2: '#6FE8A0', onAccent: '#04221F', mood: 'Calm and even' },
  'rwa-steps': { accent: '#F2B544', accent2: '#FFDD8A', onAccent: '#2B1D02', mood: 'Priced in bands' },
  flat: { accent: '#79B6FF', accent2: '#B9A8FF', onAccent: '#071A33', mood: 'Anchored, then a jump' },
};
