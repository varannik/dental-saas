/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['images.unsplash.com'],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api',
    NEXT_PUBLIC_AUTH_URL: process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:3001',
    NEXT_PUBLIC_PATIENT_URL: process.env.NEXT_PUBLIC_PATIENT_URL || 'http://localhost:3002',
    NEXT_PUBLIC_SUBSCRIPTION_URL: process.env.NEXT_PUBLIC_SUBSCRIPTION_URL || 'http://localhost:3003',
    NEXT_PUBLIC_VOICE_URL: process.env.NEXT_PUBLIC_VOICE_URL || 'http://localhost:3004'
  }
};

module.exports = nextConfig; 