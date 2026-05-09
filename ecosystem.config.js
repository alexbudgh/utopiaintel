module.exports = {
  apps: [{
    name: "utopiaintel",
    script: "server.js",
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    env: {
      HOSTNAME: "127.0.0.1",
      INTEL_DB_PATH: "/home/ec2-user/utopiaintel-data/intel.db",
      // Set DB_DRIVER=mysql to use MySQL instead of SQLite.
      // DB_DRIVER: "mysql",
      // DB_HOST: "localhost",
      // DB_PORT: "3306",
      // DB_USER: "utopiaintel",
      // DB_PASSWORD: "",
      // DB_NAME: "utopiaintel",
      AXIOM_TOKEN: process.env.AXIOM_TOKEN,
      AXIOM_DATASET: process.env.AXIOM_DATASET ?? "utopiaintel",
      AXIOM_LOG_LEVEL: process.env.AXIOM_LOG_LEVEL ?? "info",
      INTEL_DEBUG: "1",
      INTEL_DEBUG_PATH: "/home/ec2-user/utopiaintel-data/intel_debug.jsonl",
      INTEL_DEBUG_MAX_BYTES: "10485760",
      INTEL_DEBUG_MAX_FILES: "5",
    },
  }],
};
