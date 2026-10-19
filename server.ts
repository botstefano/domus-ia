import express from 'express';
import cors from 'cors';
import { resolve } from 'node:path';
import { apiRouter } from './src/server/routes';
import { store } from './src/server/store';

async function startServer() {
  await store.init();

  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const host = '0.0.0.0';

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Mount API routes
  app.use('/api', apiRouter);

  // Health endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(resolve(distPath, 'index.html'));
    });
  }

  app.listen(port, host, () => {
    console.log(`Domus IA server listening on http://${host}:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
