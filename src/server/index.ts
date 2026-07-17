import express from "express";
import { getHealthStatus } from "./health";

const app = express();
const port = Number(process.env.PORT ?? 4173);

app.use(express.json());
app.get("/api/health", (_request, response) => {
  response.json(getHealthStatus());
});

app.listen(port, () => {
  console.log(`本地视频特效服务已启动：http://localhost:${port}`);
});
