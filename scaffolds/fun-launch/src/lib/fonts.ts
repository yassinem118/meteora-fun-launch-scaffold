import { Bricolage_Grotesque, Onest } from 'next/font/google';

/** Display face: wide, slightly quirky grotesque for headings and big numbers. */
export const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

/** Text face: clean and readable for forms and body copy, with tabular figures. */
export const body = Onest({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});
