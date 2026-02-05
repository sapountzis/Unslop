import { createApp } from './app/create-app';
import { createDependencies } from './app/dependencies';

const dependencies = createDependencies();
const app = createApp(dependencies);

const port = dependencies.config.server.port;
dependencies.logger.info('server_start', { port });

export default {
  port,
  fetch: app.fetch,
};
