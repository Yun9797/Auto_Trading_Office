/**
 * DART 공시 조회 중계 — 개발 서버(Node)에서 /api/dart/* 를 직접 처리한다.
 *
 * DART 서버는 오래된 TLS 암호화 방식만 받아서, Cloudflare 워커(로컬 workerd 포함)에서는
 * 접속 자체가 실패한다. Node 는 접속되므로 개발 서버가 대신 묻는다.
 * 키는 `.dev.vars` 의 DART_API_KEY 를 요청마다 읽는다 (키를 넣고 서버를 다시 켤 필요 없음).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { handleDart } from "../worker/dart";

function devVar(root: string, name: string) {
  if (process.env[name]) return process.env[name];
  try {
    const text = readFileSync(resolve(root, ".dev.vars"), "utf8");
    const line = text.split(/\r?\n/).find((l) => l.trim().startsWith(`${name}=`));
    return line?.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") || undefined;
  } catch {
    return undefined;
  }
}

export function dartRelay(): Plugin {
  return {
    name: "dart-relay",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/dart/")) return next();
        try {
          const response = await handleDart(new Request(`http://localhost${req.url}`), {
            DART_API_KEY: devVar(server.config.root, "DART_API_KEY"),
          });
          res.statusCode = response.status;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(await response.text());
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
