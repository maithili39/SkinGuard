/** @type {import('next').NextConfig} */
// In Docker, BACKEND_URL is set to http://backend:8000 (the compose service name).
// Locally it defaults to the dev backend on 127.0.0.1:8000.
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

const nextConfig = {
    output: 'standalone', // smaller production image for Docker
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'images.openfoodfacts.org',
            },
            {
                protocol: 'https',
                hostname: 'images.openbeautyfacts.org',
            },
            {
                protocol: 'https',
                hostname: 'static.openfoodfacts.org',
            },
        ],
    },
    async rewrites() {
      return [
        {
          source: '/api/:path*',
          destination: `${BACKEND_URL}/:path*` // Proxy to Backend
        }
      ]
    }
};

module.exports = nextConfig;
