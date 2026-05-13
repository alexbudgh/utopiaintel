export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  console.log("Registering instrumentation. Pid:", process.pid);
  const inspector = await import("node:inspector");
  const fs = await import("node:fs");
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
