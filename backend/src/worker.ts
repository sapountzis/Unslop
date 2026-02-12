import { createApp } from './app/create-app';
import { createDependencies } from './app/dependencies';
import { loadRuntimeConfig } from './config/runtime';
import { createDb } from './db';
import { createLogger } from './lib/logger';
import type { Hyperdrive } from '@cloudflare/workers-types';
import { Client } from 'pg';

interface Env {
    HYPERDRIVE: Hyperdrive;
    [key: string]: unknown;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
        await client.connect();

        const config = loadRuntimeConfig(env as Record<string, string | undefined>);
        const logger = createLogger({ nodeEnv: 'production' });
        const db = createDb({ client, logger });
        const deps = createDependencies({ config, db, logger });
        const app = createApp(deps);

        return app.fetch(request);
    },
};
