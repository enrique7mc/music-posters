/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize Google AI packages to prevent webpack bundling issues
      config.externals = config.externals || [];
      config.externals.push({
        '@google/generative-ai': 'commonjs @google/generative-ai',
        '@google-cloud/vision': 'commonjs @google-cloud/vision',
      });
    }
    return config;
  },
};

module.exports = nextConfig;
