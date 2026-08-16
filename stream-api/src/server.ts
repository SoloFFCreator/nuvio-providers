import express from "express";
import { registerStreamRoutes } from "./stream/routes.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
registerStreamRoutes(app);

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
app.listen(port, () => {
  console.log("Midnight Anime stream API is running.");
});
