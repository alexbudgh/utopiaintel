export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const nodeProcess = globalThis.process;
  console.log("Registering instrumentation. Pid:", nodeProcess.pid);
  const nodeImport = new Function("specifier", "return import(specifier)") as <
    T,
  >(
    specifier: string,
  ) => Promise<T>;
  const inspector =
    await nodeImport<typeof import("node:inspector")>("node:inspector");
  const fs = await nodeImport<typeof import("node:fs")>("node:fs");
  nodeProcess.on("SIGUSR2", () => {
    const session = new inspector.Session();
    session.connect();
    session.post("Profiler.enable", () => {
      session.post("Profiler.start", () => {
        console.log("CPU Profile started via SIGUSR2...");
        setTimeout(() => {
          session.post("Profiler.stop", (err, result) => {
            if (!err) {
              const { profile } = result;
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
