import express, { type Express } from "express";
import type { NextFunction, Request, Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.set("trust proxy", 1);
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
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
      "font-src 'self' data:; script-src 'self'; connect-src 'self'; object-src 'none'; " +
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
  }

  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.get("origin");
    const fetchSite = req.get("sec-fetch-site");
    if (fetchSite === "cross-site") {
      res.status(403).json({ error: "Межсайтовые запросы запрещены." });
      return;
    }
    if (origin) {
      try {
        const expectedOrigin = `${req.protocol}://${req.get("host")}`;
        if (
          new URL(origin).origin !== expectedOrigin &&
          fetchSite !== "same-origin"
        ) {
          res.status(403).json({ error: "Источник запроса не разрешён." });
          return;
        }
      } catch {
        res.status(403).json({ error: "Источник запроса не разрешён." });
        return;
      }
    }
  }
  next();
});
app.use(express.json({ limit: "256kb", strict: true }));
app.use(cookieParser());

app.use("/api", router);
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
app.get("/ready", async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.status(200).json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not_ready" });
  }
});

if (process.env.NODE_ENV === "production") {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const frontendCandidates = [
    path.resolve(process.cwd(), "../faction-control/dist/public"),
    path.resolve(process.cwd(), "artifacts/faction-control/dist/public"),
    path.resolve(here, "../../faction-control/dist/public"),
  ];
  const frontendDir = frontendCandidates.find((candidate) =>
    existsSync(path.join(candidate, "index.html")),
  );
  if (!frontendDir) {
    throw new Error("Production frontend bundle is missing; run the web build before starting the API.");
  }
  app.use(express.static(frontendDir, { index: false, maxAge: "1h" }));
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res, next) => {
    res.sendFile(path.join(frontendDir, "index.html"), (error) => {
      if (error) next(error);
    });
  });
}

app.use(
  (
    error: unknown,
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const errorType =
      error && typeof error === "object" && "type" in error
        ? String(error.type)
        : "";
    if (errorType === "entity.parse.failed") {
      res.status(400).json({ error: "Тело запроса должно быть корректным JSON." });
      return;
    }
    if (errorType === "entity.too.large") {
      res.status(413).json({ error: "Размер загружаемого файла превышает 25 МБ." });
      return;
    }
    req.log?.error({ err: error }, "Unhandled API error");
    res.status(500).json({ error: "Внутренняя ошибка сервера." });
  },
);

export default app;
