# 🚀 Fun Launch (Meteora Invent Edition)

A high-performance, production-grade token launchpad leveraging the official **Meteora Dynamic Bonding Curve (DBC) SDK (v1.5.13)** on Solana. Built specifically for the Meteora Invent Hackathon to enable precise curve customization, including real-world asset (RWA) step curves and meme launches.

## 📋 Table of Contents
- [Overview & Architecture](#overview--architecture)
- [Core Features](#core-features)
- [Tech Stack](#tech-stack)
- [Setup & Installation](#setup--installation)
- [Running Locally](#running-locally)
- [Deployment](#deployment)

---

## 🏛️ Overview & Architecture

Fun Launch moves away from static simulations to provide **true on-chain integration** with Meteora’s Dynamic Bonding Curve protocol (`dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`). 

Every preset dynamically computes 16-point liquidity weights via `buildCurveWithLiquidityWeights` and renders real-time charts derived directly from the program's sqrt price formulas (`summarizeCurve`), ensuring exact parity between UI visualization and on-chain execution.

## ✨ Core Features

- **4 Real Curve Presets (SDK-Powered):**
  - 🔥 **Meme Launch:** Steep exponential curve designed for high initial volatility and fast hype cycles.
  - 📈 **Steady Growth:** Uniform liquidity distribution for predictable, low-risk price discovery.
  - 🏛️ **RWA / Stock Steps:** Custom price bands with zero-liquidity steps, tailored for tokenized real-world assets and equities.
  - ⚖️ **Flat Band:** Concentrated liquidity near the start price before sharp graduation scaling.
- **True On-Chain Execution:** Executes two-step transactions (`createConfigAndPool`) using the official DBC SDK and generates verifiable Devnet Solscan proofs.
- **Smart Parameter Assistant:** Intelligent rule-based parsing matching user tokenomics visions directly to optimal DBC configurations.
- **DAMM v2 Migration Ready:** Built-in graduation threshold calculations targeting seamless transition to Meteora's DAMM v2 pools.

## 🧰 Tech Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS & Recharts
- **Blockchain:** Solana Web3.js, Solana Wallet Adapter & `@meteora-ag/dynamic-bonding-curve-sdk`

---

## 🛠️ Setup & Installation

1. **Clone the repository & navigate to the scaffold:**
   ```bash
   git clone [https://github.com/MeteoraAg/meteora-invent.git](https://github.com/MeteoraAg/meteora-invent.git)
   cd scaffolds/fun-launch
Install dependencies:

Bash
pnpm install
Configure Environment Variables:
Create a .env file in the root directory:

Extrait de code
NEXT_PUBLIC_RPC_URL=your_solana_devnet_rpc_url
💻 Running the Development Server
Start the application locally in development mode:

Bash
pnpm dev
Open http://localhost:3000 in your browser, connect your Phantom wallet (set to Devnet with test SOL), choose your curve preset, and launch your pool on-chain!

🚀 Deployment (Vercel)
Push your code to your GitHub repository.

Import the repository into Vercel.

Configure project settings:

Framework Preset: Next.js

Root Directory: scaffolds/fun-launch

Build Command: pnpm build

Add your environment variables and click Deploy.

📄 License
ISC
