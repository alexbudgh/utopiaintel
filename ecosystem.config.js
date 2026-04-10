module.exports = {
  apps: [{
    name: "utopiaintel",
    script: "server.js",
    env: {
      HOSTNAME: "127.0.0.1",
      INTEL_DB_PATH: "/home/ec2-user/utopiaintel-data/intel.db",
      INTEL_DEBUG: "0",
    },
  }],
};
