import { createIssuerServer } from './index';

const port = Number(process.env.PORT ?? 3001);
const app = createIssuerServer({ port });

app.listen(port, () => {
  console.log(`Issuer server listening on http://127.0.0.1:${port}`);
});
