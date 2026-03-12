import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Allow the extension bridge page to be embedded in iframes
        // from Chrome extensions and localhost (for development)
        source: '/extension-bridge',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: 'frame-ancestors chrome-extension://* http://localhost:* http://127.0.0.1:*',
          },
          {
            key: 'X-Frame-Options',
            value: 'ALLOWALL',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
