import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { replitSession } from "./middlewares/replitSession";
import { frontendUrls, publicApiOrigin } from "./lib/auth-policy";
import authRouter from "./routes/auth";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const allowedOrigins = new Set(frontendUrls().map(url => new URL(url).origin));
publicApiOrigin(); // Fail early for a missing/invalid published callback origin.
app.use((req, res, next) => {
  if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) {
    res.status(403).json({ error: "This site is not allowed to call the API." }); return;
  }
  next();
});
app.use(cors({ origin: [...allowedOrigins], credentials: false, allowedHeaders: ["Content-Type", "Authorization"], methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] }));
app.use(cookieParser());
// Spreadsheet rows are parsed in the browser; no uploaded files are persisted.
app.use("/api/books/import", express.json({ limit: "10mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(replitSession);
app.use("/api", authRouter);
app.use("/api", router);

export default app;
