# 🚀 Fun Launch (Meteora Invent Edition)

A cutting-edge, production-ready platform for launching tokens with customizable price curves on Solana, built as part of the Meteora Invent Hackathon.

## 📋 Table of Contents
- [Setup](#setup)
- [Getting R2 Credentials](#getting-r2-credentials)
- [Getting RPC URL](#getting-rpc-url)
- [Pool Config Key](#pool-config-key)
- [Running the Development Server](#running-the-development-server)
- [Deployment (Vercel)](#deployment-vercel)
- [Features](#features)
- [Tech Stack](#tech-stack)

---

## 🛠️️ Setup

1. **Clone the repository & navigate to the scaffold:**
   ```bash
   git clone [https://github.com/MeteoraAg/meteora-invent.git](https://github.com/MeteoraAg/meteora-invent.git)
   cd scaffolds/fun-launch
Install dependencies:

Bash
pnpm install
Set up environment variables:
Create a .env file in the root directory of this scaffold by copying the example file:

Bash
cp .env.example .env
Fill in the required variables:

Extrait de code
# Cloudflare R2 Storage
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_ACCOUNT_ID=your_r2_account_id
R2_BUCKET=your_r2_bucket_name

# Solana RPC URL
RPC_URL=your_rpc_url

# Pool Configuration
POOL_CONFIG_KEY=your_pool_config_key
☁️ Getting R2 Credentials
Go to Cloudflare Dashboard

Navigate to R2

Create a new bucket or select an existing one

Go to "Manage R2 API Tokens" and create a new token with:

Account R2 Storage: Edit

Bucket: Your specific bucket name

Copy the Access Key ID, Secret Access Key, and Account ID (found in the URL or Account Home).

🔌 Getting RPC URL
Get your high-performance Solana RPC URL from any third-party provider (e.g., Helius, Alchemy, QuickNode).

⚙️ Pool Config Key
The pool config key configures the bonding curve parameters. You'll need to:

Deploy your own pool config program, or use an existing one.

Get the public key of the pool config account and add it to your .env.

💻 Running the Development Server
Run the app locally in development mode:

Bash
pnpm dev
🚀 Deployment (Vercel)
Push your code to your GitHub repository.

Go to Vercel and click "New Project", importing your repository.

Configure your project settings carefully:

Framework Preset: Next.js

Root Directory: scaffolds/fun-launch (Crucial for Monorepo)

Build Command: pnpm build (or let Vercel handle via workspace)

Output Directory: .next

Add Environment Variables: Add all the keys from your .env file (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET, RPC_URL, POOL_CONFIG_KEY).

Click "Deploy"!

✨ Features
Create token pools with customizable price curves

Seamless token metadata and logo uploads via Cloudflare R2

Real-time token statistics and interactive charts

Full transaction tracking

Fully responsive mobile-friendly interface

🧰 Tech Stack
Framework: Next.js (App Router)

Language: TypeScript

Styling: Tailwind CSS

Blockchain: Solana Web3.js & Dynamic Bonding Curve SDK

Storage: Cloudflare R2

🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check out the main repository README.

📄 License
ISC
