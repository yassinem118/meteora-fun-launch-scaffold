/** @type {import('next').NextConfig} */
const nextConfig: import('next').NextConfig = {
  reactStrictMode: true,
  typescript: {
    
    ignoreBuildErrors: true,
  },
  eslint: {
   
    ignoreDuringBuilds: true,
  },
  // Set Turbopack root explicitly to silence workspace warnings
  turbopack: {
    root: '.',
  },
  // Configure webpack to handle Node.js polyfills correctly on the client side
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      };
    }
    return config;
  },
};

export default nextConfig;