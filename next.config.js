/** @type {import('next').NextConfig} */

const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [
      "resources.premierleague.com", // FPL player photos
      "fantasy.premierleague.com",   // FPL assets
    ],
  },
};

module.exports = withPWA(nextConfig);


