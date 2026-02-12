import { createApp } from './app/create-app';
import { createDependencies } from './app/dependencies';
import { loadRuntimeConfig } from './config/runtime';
import { createDb } from './db';
import { createLogger } from './lib/logger';
import { Client } from 'pg';

const config = loadRuntimeConfig();
const logger = createLogger({ nodeEnv: config.server.nodeEnv });

const client = new Client({ connectionString: config.db.url });
await client.connect();

const db = createDb({ client, logger });
const dependencies = createDependencies({ config, db, logger });
const app = createApp(dependencies);

const port = dependencies.config.server.port;
dependencies.logger.info('server_start', { port });

export default {
  port,
  fetch: app.fetch,
};
