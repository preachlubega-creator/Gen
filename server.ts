import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { accountsRouter } from './src/server/modules/accounts.ts';
import { auditRouter } from './src/server/modules/audit.ts';
import { financeRouter } from './src/server/modules/finance.ts';
import { membersRouter } from './src/server/modules/members.ts';
import { operationsRouter } from './src/server/modules/operations.ts';
import { projectsRouter } from './src/server/modules/projects.ts';
import { rbacRouter } from './src/server/modules/rbac.ts';
import { reportsRouter } from './src/server/modules/reports.ts';
import { sectorsRouter } from './src/server/modules/sectors.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'genz-agririse' });
});

// Modular Domain APIs
app.use('/api/accounts', accountsRouter);
app.use('/api/rbac', rbacRouter);
app.use('/api/sectors', sectorsRouter);
app.use('/api/members', membersRouter);
app.use('/api/finance', financeRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/operations', operationsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/audit', auditRouter);

// API 404 handler
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// Global error handler
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('Unhandled API error:', err);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  }
);

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Gen Z AgriRise server listening on port ${PORT}`);
  });
}

startServer();
