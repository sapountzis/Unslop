import { createApp } from './app/create-app';
import { createDependencies } from './app/dependencies';
import { loadRuntimeConfig } from './config/runtime';
import { createDb } from './db';
import type { Database } from './db';
import { createLogger } from './lib/logger';
import type { Hyperdrive } from '@cloudflare/workers-types';

interface Env {
    HYPERDRIVE: Hyperdrive;
    [key: string]: unknown;
}

let cachedApp: ReturnType<typeof createApp> | null = null;
let cachedDb: Database | null = null;

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        // Reuse across requests within the same isolate
        if (!cachedApp) {
            const config = loadRuntimeConfig(env as Record<string, string | undefined>);
            // Set db.url from Hyperdrive for use by services
            config.db.url = env.HYPERDRIVE.connectionString;
            const logger = createLogger({ nodeEnv: 'production' });
            cachedDb = createDb({
                url: config.db.url,
                logger,
            }) as Database;
            const deps = createDependencies({ config, db: cachedDb, logger });
            cachedApp = createApp(deps);
        }

        return cachedApp.fetch(request);
    },
};
