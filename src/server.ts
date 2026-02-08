import { createApp } from "./app";
import { env } from "./config/env";

createApp()
  .then((app) => {
    app.listen(env.port, () => {
      console.log(`API listening on :${env.port}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
