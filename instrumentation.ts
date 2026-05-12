export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("Registering instrumentation. Pid:", process.pid);
    const inspector =
      require("node:inspector") as typeof import("node:inspector");
    const fs = require("node:fs") as typeof import("node:fs");
    process.on("SIGUSR2", () => {
      const session = new inspector.Session();
      session.connect();
      session.post("Profiler.enable", () => {
        session.post("Profiler.start", () => {
          console.log("CPU Profile started via SIGUSR2...");
          setTimeout(() => {
            session.post("Profiler.stop", (err, { profile }) => {
              if (!err) {
                const filename = `./profile-${Date.now()}.cpuprofile`;
                fs.writeFileSync(filename, JSON.stringify(profile));
                console.log(`Profile saved: ${filename}`);
              }
              session.disconnect();
            });
          }, 30000);
        });
      });
    });
  }
}
