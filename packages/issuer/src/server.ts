import { createApp } from './app';
import { createDefaultConfig } from './config';

const config = createDefaultConfig();
const { app } = createApp(config);

app.listen(config.port, () => {
  console.log(`Breakchain Issuer Server running at ${config.issuerUrl}`);
});
