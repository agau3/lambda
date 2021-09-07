module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ["dotenv/config"],
  testPathIgnorePatterns: ['node_modules','src/storage/*'],
  coveragePathIgnorePatterns: ['node_modules','src/storage/*']
};