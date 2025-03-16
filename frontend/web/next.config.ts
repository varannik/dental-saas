import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  env: {
    // WebRTC configuration
    STUN_SERVERS: process.env.STUN_SERVERS || "stun:stun.l.google.com:19302",
    TURN_SERVERS: process.env.TURN_SERVERS || "",
    TURN_USERNAME: process.env.TURN_USERNAME || "",
    TURN_CREDENTIAL: process.env.TURN_CREDENTIAL || "",
    
    // Redis configuration
    REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
    
    // Authentication microservice
    AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || "http://localhost:8000",
    
    // FastAPI streaming backend
    API_BASE_URL: process.env.API_BASE_URL || "http://localhost:8000",
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
        ],
      },
    ]
  },
};

export default nextConfig; 


