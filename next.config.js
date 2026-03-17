/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Include bundled font file in serverless function output
    outputFileTracingIncludes: {
      '/api/preview-cover': ['./src/assets/fonts/**/*'],
      '/api/create-playlist': ['./src/assets/fonts/**/*'],
    },
  },
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
