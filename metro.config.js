// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Restrict max worker processes so bundling does not exhaust system RAM on Windows
config.maxWorkers = 1;

module.exports = config;
