 'use client';

import React, { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { createBondingCurveTx } from '../lib/meteoraDbc';

type CurveType = 'exponential' | 'flat' | 'linear' | 'rwa';

export const CurveVisualizer = ({
  activePreset,
}: {
  activePreset?: {
    curveType: CurveType;
    targetLiquidity: number;
    feePercentage: number;
  };
}) => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const [curveType, setCurveType] = useState<CurveType>('exponential');
  const [targetLiquidity, setTargetLiquidity] = useState(50000);
  const [feePercentage, setFeePercentage] = useState(1);
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [txSignature, setTxSignature] = useState(null);

  // Automatically update parameters when selecting a preset from the Marketplace
  useEffect(() => {
    if (activePreset) {
      setCurveType(activePreset.curveType);
      setTargetLiquidity(activePreset.targetLiquidity);
      setFeePercentage(activePreset.feePercentage);
    }
  }, [activePreset]);

  const generateData = () => {
    const data = [];
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const supplyPercent = (i / steps) * 100;
      let price = 0;

      if (curveType === 'exponential') {
        price = Math.pow(i / steps, 2) * (targetLiquidity / 1000);
      } else if (curveType === 'flat') {
        price = targetLiquidity / 1000;
      } else if (curveType === 'linear') {
        price = (i / steps) * (targetLiquidity / 1000);
      } else if (curveType === 'rwa') {
        price = Math.floor((i / steps) * 5) * (targetLiquidity / 5000) + 1;
      }

      data.push({
        supply: `${supplyPercent.toFixed(0)}%`,
        Price: Number(price.toFixed(4)),
      });
    }
    return data;
  };

  const handleLaunch = async () => {
    if (!connected || !publicKey) {
      alert('Please connect your wallet first!');
      return;
    }
    if (!tokenName || !tokenSymbol) {
      alert('Please enter the token name and symbol');
      return;
    }

    try {
      setLoading(true);
      const { transaction } = await createBondingCurveTx(connection, publicKey, {
        curveType,
        targetLiquidity,
        feePercentage,
        tokenName,
        tokenSymbol,
      });

      const signature = await sendTransaction(transaction, connection);
      setTxSignature(signature);
      alert('Bonding curve successfully created on-chain!');
    } catch (error) {
      console.error('DBC Launch Error:', error);
      alert('An error occurred while executing the transaction');
    } finally {
      setLoading(false);
    }
  };

  const curveOptions: CurveType[] = ['exponential', 'flat', 'linear', 'rwa'];

  return (
    <div className="p-6 bg-slate-900 text-white rounded-xl border border-slate-800 my-6 shadow-xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-emerald-400">
            Meteora DBC Dynamic Curve Configurator
          </h2>
          <p className="text-sm text-slate-400">
            Simulate and customize bonding curve shapes for your token launch
          </p>
        </div>
        <span className="bg-emerald-500/10 text-emerald-400 text-xs px-3 py-1 rounded-full border border-emerald-500/20">
          Powered by DBC SDK
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {curveOptions.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setCurveType(type)}
            className={`p-3 rounded-lg text-sm font-semibold capitalize border transition-all ${
              curveType === type
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
            }`}
          >
            {type === 'rwa' ? '🏛️ RWA / Stock' : `${type} Curve`}
          </button>
        ))}
      </div>

      <div className="h-64 w-full bg-slate-950/50 p-4 rounded-lg border border-slate-800/80 mb-6">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={generateData()}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="supply" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
            <Line type="monotone" dataKey="Price" stroke="#10b981" strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Token and Liquidity Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Token Name</label>
          <input
            type="text"
            placeholder="e.g. Solana DBC Token"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Token Symbol</label>
          <input
            type="text"
            placeholder="e.g. SDBC"
            value={tokenSymbol}
            onChange={(e) => setTokenSymbol(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Target Graduation Liquidity ($)
          </label>
          <input
            type="number"
            value={targetLiquidity}
            onChange={(e) => setTargetLiquidity(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            DBC Fee Schedule (%)
          </label>
          <input
            type="number"
            value={feePercentage}
            onChange={(e) => setFeePercentage(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Launch Transaction Button */}
      <button
        type="button"
        onClick={handleLaunch}
        disabled={loading}
        className="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 font-bold text-slate-950 rounded-lg transition-all shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50"
      >
        {loading ? 'Launching Dynamic DBC Pool...' : '🚀 Launch Token on Meteora DBC'}
      </button>

      {txSignature && (
        <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded text-xs text-emerald-300">
          Transaction Sent! Signature: {txSignature}
        </div>
      )}
    </div>
  );
};
