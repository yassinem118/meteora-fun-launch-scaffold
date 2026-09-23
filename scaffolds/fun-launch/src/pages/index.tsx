import dynamic from 'next/dynamic';
import React, { useState } from 'react';
import { CurveVisualizer } from '../components/CurveVisualizer';
import { PresetMarketplace } from '../components/PresetMarketplace';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

interface AiAssistantProps {
  onSelectPreset: (presetKey: string) => void;
}

interface Preset {
  id: string;
  title: string;
  description: string;
  curveType: 'linear' | 'exponential' | 'rwa';
  targetLiquidity: number;
  feePercentage: number;
  tag: string;
}

// Inline AI Assistant Component
const AiAssistant = ({ onSelectPreset }: AiAssistantProps) => {
  const [prompt, setPrompt] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const handleAnalyze = () => {
    if (!prompt.trim()) return;
    setIsAnalyzing(true);
    setSuggestion(null);

    setTimeout(() => {
      const text = prompt.toLowerCase();
      let chosenPreset: string = 'steady';
      let explanation: string = '';

      if (
        text.includes('meme') ||
        text.includes('hype') ||
        text.includes('pump') ||
        text.includes('fast')
      ) {
        chosenPreset = 'meme';
        explanation = '🔥 Suggested Preset: **Meme Launch** — High volatility curve selected!';
      } else if (
        text.includes('rwa') ||
        text.includes('stock') ||
        text.includes('estate') ||
        text.includes('asset')
      ) {
        chosenPreset = 'rwa';
        explanation = '🏛️ Suggested Preset: **RWA / Stock Pegged** — Step-function curve selected!';
      } else {
        chosenPreset = 'steady';
        explanation = '📈 Suggested Preset: **Steady Growth** — Linear curve selected!';
      }

      onSelectPreset(chosenPreset);
      setSuggestion(explanation);
      setIsAnalyzing(false);
    }, 600);
  };

  return (
    <div className="mb-8 p-4 rounded-xl bg-slate-900/80 border border-purple-500/30 backdrop-blur-md shadow-lg">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">🤖</span>
        <h3 className="text-md font-bold text-purple-300">AI Launch Curve Assistant</h3>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        Describe your token idea (e.g., &quot;A viral meme token&quot; or &quot;Real estate
        liquidity pool&quot;) and AI will pick the curve.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your token project..."
          className="flex-1 px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
          onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
        />
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-semibold rounded-lg hover:from-purple-500 transition-all disabled:opacity-50"
        >
          {isAnalyzing ? 'Analyzing...' : 'Ask AI'}
        </button>
      </div>

      {suggestion && (
        <div className="mt-3 p-2.5 rounded-lg bg-purple-950/40 border border-purple-500/40 text-xs text-purple-200">
          <span
            dangerouslySetInnerHTML={{
              __html: suggestion.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'),
            }}
          />
        </div>
      )}
    </div>
  );
};

const PRESETS_DATA: Record<string, Preset> = {
  meme: {
    id: 'meme',
    title: '🔥 Meme Launch',
    description: 'High initial volatility, steep exponential curve for fast hype generation.',
    curveType: 'exponential',
    targetLiquidity: 25000,
    feePercentage: 1.5,
    tag: 'Popular',
  },
  steady: {
    id: 'steady',
    title: '📈 Steady Growth',
    description:
      'Linear bonding curve designed for long-term community building and reduced dumps.',
    curveType: 'linear',
    targetLiquidity: 100000,
    feePercentage: 0.5,
    tag: 'Low Risk',
  },
  rwa: {
    id: 'rwa',
    title: '🏛️ RWA / Stock Pegged',
    description:
      'Step-function price discovery curve tailored for real-world assets & tokenized stocks.',
    curveType: 'rwa',
    targetLiquidity: 500000,
    feePercentage: 0.2,
    tag: 'Institutional',
  },
};

export default function Home() {
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);

  const handleSelectPreset = (preset: Omit<Preset, 'curveType'> & { curveType: string }): void => {
    if (
      preset.curveType === 'linear' ||
      preset.curveType === 'exponential' ||
      preset.curveType === 'rwa'
    ) {
      setSelectedPreset({ ...preset, curveType: preset.curveType });
    }
  };

  const handleAiPresetSelect = (presetKey: string): void => {
    if (PRESETS_DATA[presetKey]) {
      setSelectedPreset(PRESETS_DATA[presetKey]);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <header className="border-b border-slate-800 pb-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-center md:text-left">
            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500 mb-2">
              Fun Launch Dashboard
            </h1>
            <p className="text-slate-400">
              Meteora Dynamic Bonding Curve Configurator & Token Launcher
            </p>
          </div>

          <div>
            <WalletMultiButton className="!bg-emerald-500 hover:!bg-emerald-600 !transition-all !rounded-lg" />
          </div>
        </header>

        {/* AI Assistant Section */}
        <AiAssistant onSelectPreset={handleAiPresetSelect} />

        {/* Preset Marketplace Section */}
        <PresetMarketplace onSelectPreset={handleSelectPreset} />

        {/* Visualizer & Configurator Section */}
        <CurveVisualizer activePreset={selectedPreset || undefined} />
      </div>
    </main>
  );
}
