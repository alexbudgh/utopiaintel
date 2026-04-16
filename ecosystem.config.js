module.exports = {
  apps: [{
    name: "utopiaintel",
    script: "server.js",
    env: {
      HOSTNAME: "127.0.0.1",
      INTEL_DB_PATH: "/home/ec2-user/utopiaintel-data/intel.db",
      INTEL_DEBUG: "0",
      INTEL_DEBUG_PATH: "/home/ec2-user/utopiaintel-data/intel_debug.jsonl",
      INTEL_DEBUG_MAX_BYTES: "10485760",
      INTEL_DEBUG_MAX_FILES: "5",
    },
  }],
};
