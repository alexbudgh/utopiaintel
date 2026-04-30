module.exports = {
  apps: [{
    name: "utopiaintel-test",
    script: "server.js",
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    env: {
      HOSTNAME: "127.0.0.1",
      PORT: "3001",
      STAGING: "true",
      INTEL_DB_PATH: "/home/ec2-user/utopiaintel-data/intel.db",
      AXIOM_TOKEN: "",
      AXIOM_DATASET: "",
      AXIOM_LOG_LEVEL: "off",
      NEXT_PUBLIC_AXIOM_LOG_LEVEL: "off",
      INTEL_DEBUG: "0",
      INTEL_DEBUG_PATH: "/home/ec2-user/utopiaintel-data/intel_debug.jsonl",
      INTEL_DEBUG_MAX_BYTES: "10485760",
      INTEL_DEBUG_MAX_FILES: "5",
    },
  }],
};
