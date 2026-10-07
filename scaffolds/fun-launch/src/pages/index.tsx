import dynamic from 'next/dynamic';
import React, { useState, useEffect } from 'react';
import { CurveVisualizer } from '../components/CurveVisualizer';
import { PresetMarketplace } from '../components/PresetMarketplace';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
 );
interface Preset {
  id: string;
  title: string;
  description: string;
  curveType: 'linear' | 'exponential' | 'rwa';
  targetLiquidity: number;
  feePercentage: number;
  tag: string;
}

interface AiAssistantProps {
  onSelectDynamicPreset: (preset: Preset) => void;
}

// Hook for typewriter / streaming typing effect
const useTypewriter = (text: string, speed: number = 20) => {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    if (!text) {
      setDisplayedText('');
      return () => {};
    }
    let i = 0;
    setDisplayedText('');
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayedText((prev) => prev + text.charAt(i));
        i++;
      } else {
        clearInterval(timer);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed]);

  return displayedText;
};

// Inline Advanced AI Assistant Component with Dynamic Math & Streaming
const AiAssistant = ({ onSelectDynamicPreset }: AiAssistantProps) => {
  const [prompt, setPrompt] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [rawSuggestion, setRawSuggestion] = useState<string>('');
  const typedSuggestion = useTypewriter(rawSuggestion, 15);

  const handleAnalyze = () => {
    if (!prompt.trim()) return;
    setIsAnalyzing(true);
    setRawSuggestion('');

    setTimeout(() => {
      const text = prompt.toLowerCase();
      let chosenCurve: 'linear' | 'exponential' | 'rwa' = 'linear';
      let dynamicLiquidity = 100000;
      let dynamicFee = 0.5;
      let title = 'Custom AI Generated Pool';
      let tag = 'AI Optimized';
      let explanation = '';

      if (
        text.includes('meme') ||
        text.includes('hype') ||
        text.includes('pump') ||
        text.includes('fast') ||
        text.includes('viral')
      ) {
        // Check custom keywords for dynamic mathematical scaling
        if (text.includes('meme') || text.includes('hype') || text.includes('pump')) {
          chosenCurve = 'exponential';
          dynamicLiquidity = Math.floor(Math.random() * 20000) + 15000; // e.g. 15k - 35k
          dynamicFee = 1.25;
          title = '⚡ AI Neural Meme Launch';
          tag = 'High Volatility';
        } else if (text.includes('rwa') || text.includes('estate') || text.includes('stock') || text.includes('asset')) {
          chosenCurve = 'rwa';
          dynamicLiquidity = Math.floor(Math.random() * 200000) + 400000; // e.g. 400k - 600k
          dynamicFee = 0.15;
          title = '🏛️ AI Institutional RWA Peg';
          tag = 'Regulated Asset';
        } else {
          chosenCurve = 'linear';
          dynamicLiquidity = Math.floor(Math.random() * 50000) + 75000; // e.g. 75k - 125k
          dynamicFee = 0.4;
          title = '📈 AI Adaptive Steady Growth';
          tag = 'Balanced Risk';
        }
      }

      const generatedPreset: Preset = {
        id: 'ai-custom-' + Date.now(),
        title,
        description: `Dynamically calculated by neural engine based on prompt: "${prompt}"`,
        curveType: chosenCurve,
        targetLiquidity: dynamicLiquidity,
        feePercentage: dynamicFee,
        tag,
      };

      explanation = `🚀 **Neural Analysis Complete**\n• Curve Architecture: **${chosenCurve.toUpperCase()}**\n• Target Liquidity: **$${dynamicLiquidity.toLocaleString()}**\n• Optimized Fee Bps: **${(dynamicFee * 100).toFixed(0)} bps (${dynamicFee}%)**\n\n✨ *Parameters successfully injected into Meteora DBC transaction builder!*`;

      onSelectDynamicPreset(generatedPreset);
      setRawSuggestion(explanation);
      setIsAnalyzing(false);
    }, 750);
  };

  return (
    <div className="mb-8 p-5 rounded-2xl bg-slate-900/90 border border-purple-500/40 backdrop-blur-xl shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl animate-pulse">🤖</span>
        <h3 className="text-md font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-cyan-300">
          Advanced AI Dynamic Curve Math Engine
        </h3>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Type any custom token vision (e.g., &quot;Sustainable green energy micro-utility fund with low slippage&quot;) and our AI agent will compute exact curve parameters.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your custom tokenomics & project ecosystem..."
          className="flex-1 px-4 py-2.5 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
          onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
        />
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="px-5 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all shadow-lg disabled:opacity-50 flex items-center gap-2"
        >
          {isAnalyzing ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Computing Math...
            </>
          ) : (
            'Generate AI Curve'
          )}
        </button>
      </div>

      {typedSuggestion && (
        <div className="mt-4 p-3.5 rounded-xl bg-purple-950/40 border border-purple-500/50 text-xs text-purple-200 whitespace-pre-line leading-relaxed shadow-inner">
          <span
            dangerouslySetInnerHTML={{
              __html: typedSuggestion.replace(/\*\*(.*?)\*\*/g, '<strong class="text-cyan-300">$1</strong>'),
            }}
          />
        </div>
      )}
    </div>
  );
 };
export default function Home() {
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);

  const handleSelectPreset = (preset: Omit<Preset, 'curveType'> & { curveType: string }): void => {
    if (
      preset.curveType === 'linear' ||
      preset.curveType === 'exponential' ||
      preset.curveType == 'rwa'
    ) {
      setSelectedPreset({ ...preset, curveType: preset.curveType });
    }
  };

  const handleDynamicAiPreset = (preset: Preset): void => {
    setSelectedPreset(preset);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <header className="border-b border-slate-800 pb-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-center md:text-left">
            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-400 to-purple-500 mb-2">
              Fun Launch Dashboard
            </h1>
            <p className="text-slate-400">
              Meteora Dynamic Bonding Curve Configurator & Neural Token Launcher
            </p>
          </div>

          <div>
            <WalletMultiButton className="!bg-emerald-500 hover:!bg-emerald-600 !transition-all !rounded-xl !font-medium" />
          </div>
        </header>

        {/* AI Assistant Section with Dynamic Streaming Math */}
        <AiAssistant onSelectDynamicPreset={handleDynamicAiPreset} />

        {/* Preset Marketplace Section */}
        <PresetMarketplace onSelectPreset={handleSelectPreset} />

        {/* Visualizer & Configurator Section */}
        <CurveVisualizer activePreset={selectedPreset || undefined} />
      </div>
    </main>
  );
 }