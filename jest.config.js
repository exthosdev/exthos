// module.exports = 
export default {
  rootDir: './dist',
  testEnvironment: 'jest-environment-node',
  transform: {},
  testTimeout: 5 * 1000,
  verbose: true,
  collectCoverage: true,
  coverageReporters: ["cobertura", "lcov", "text"],
};