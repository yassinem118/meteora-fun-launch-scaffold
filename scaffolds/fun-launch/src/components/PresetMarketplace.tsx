 import React from 'react';

const PRESETS = [
  {
    id: 'meme',
    title: '🔥 Meme Launch',
    description: 'High initial volatility, steep exponential curve for fast hype generation.',
    curveType: 'exponential',
    targetLiquidity: 25000,
    feePercentage: 1.5,
    tag: 'Popular',
  },
  {
    id: 'steady',
    title: '📈 Steady Growth',
    description:
      'Linear bonding curve designed for long-term community building and reduced dumps.',
    curveType: 'linear',
    targetLiquidity: 100000,
    feePercentage: 0.5,
    tag: 'Low Risk',
  },
  {
    id: 'rwa',
    title: '🏛️ RWA / Stock Pegged',
    description:
      'Step-function price discovery curve tailored for real-world assets & tokenized stocks.',
    curveType: 'rwa',
    targetLiquidity: 500000,
    feePercentage: 0.2,
    tag: 'Institutional',
  },
];

export const PresetMarketplace = ({
  onSelectPreset,
}: {
  onSelectPreset: (preset: (typeof PRESETS)[number]) => void;
}) => {
  return (
    <div className="my-8">
      <h3 className="text-xl font-bold text-white mb-2">⚡ Select Curve Preset Marketplace</h3>
      <p className="text-sm text-slate-400 mb-6">
        Pick a pre-configured Meteora DBC parameters suite or customize manually below.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PRESETS.map((preset) => (
          <div
            key={preset.id}
            onClick={() => onSelectPreset(preset)}
            className="p-5 bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-xl cursor-pointer transition-all hover:scale-[1.02] group relative flex flex-col justify-between"
          >
            <div>
              <div className="flex justify-between items-start mb-3">
                <h4 className="font-bold text-lg text-emerald-400 group-hover:text-emerald-300">
                  {preset.title}
                </h4>
                <span className="bg-slate-800 text-slate-300 text-xs px-2 py-0.5 rounded border border-slate-700">
                  {preset.tag}
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">{preset.description}</p>
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex justify-between items-center text-xs text-slate-300">
              <span>
                Target: <strong>${preset.targetLiquidity.toLocaleString()}</strong>
              </span>
              <span>
                Fee: <strong>{preset.feePercentage}%</strong>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
