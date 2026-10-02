const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    testTimeout: 30000,
    hookTimeout: 60000,
    environment: 'node',
  },
});
