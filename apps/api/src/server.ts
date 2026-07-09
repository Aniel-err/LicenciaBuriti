import { app } from "./app.js";
import { config } from "./config.js";

app.listen(config.port, () => {
  console.log(`API Licencia Buriti em http://localhost:${config.port}`);
});
