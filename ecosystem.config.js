module.exports = {
  apps: [{
    name: "utopiaintel",
    script: "server.js",
    env: {
      HOSTNAME: "127.0.0.1",
      INTEL_DEBUG: "0",
    },
  }],
};
