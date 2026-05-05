import type { Profiler } from 'node:inspector';

export function register() {
  console.log('Registering instrumentation. Pid:', process.pid);
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const inspector = require('node:inspector');
    const fs = require('node:fs');
    process.on('SIGUSR2', () => {
      const session = new inspector.Session();
      session.connect();
      session.post('Profiler.enable', () => {
        session.post('Profiler.start', () => {
          console.log('CPU Profile started via SIGUSR2...');
          setTimeout(() => {
            session.post('Profiler.stop', (err: Error | null, { profile }: { profile: Profiler.Profile }) => {
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