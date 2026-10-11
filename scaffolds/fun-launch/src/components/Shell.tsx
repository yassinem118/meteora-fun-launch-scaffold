import dynamic from 'next/dynamic';
import Link from 'next/link';
import React, { type CSSProperties, type ReactNode } from 'react';
import { body, display } from '../lib/fonts';
import type { PresetId } from '../lib/dbc';
import { PRESET_THEME } from '../lib/theme';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

/** Page frame: fonts, the colour world of the selected preset, and the top bar. */
export const Shell = ({
  presetId = 'steady',
  narrow = false,
  children,
}: {
  presetId?: PresetId;
  narrow?: boolean;
  children: ReactNode;
}) => {
  const t = PRESET_THEME[presetId];
  const vars = {
    '--accent': t.accent,
    '--accent-2': t.accent2,
    '--on-accent': t.onAccent,
  } as CSSProperties;

  return (
    <div className={`fl ${display.variable} ${body.variable}`} style={vars}>
      <div className={narrow ? 'fl-narrow' : 'fl-wrap'}>
        <header className="fl-top">
          <Link href="/" className="fl-brand">
            <span className="fl-mark" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path
                  d="M2 15c4 0 5-1 7-5s3-6 7-7"
                  stroke="var(--on-accent)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            Fun Launch
          </Link>
          <nav className="fl-nav" aria-label="Main">
            <Link href="/">Launch</Link>
            <Link href="/trade">Trade</Link>
            <WalletMultiButton />
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
};
