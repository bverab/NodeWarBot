const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "../.."),
  serverExternalPackages: ["discord.js", "@discordjs/ws", "@discordjs/rest"]
};

module.exports = nextConfig;
