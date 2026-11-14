import { buildApp } from "./app.js";
import { loadConfig } from "@crs/config";

const config = loadConfig();
const app = buildApp(config);

app
  .listen({ port: config.PORT, host: "0.0.0.0" })
  .then(() => app.log.info({ port: config.PORT }, "api listening"))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
