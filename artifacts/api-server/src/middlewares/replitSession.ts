import type { RequestHandler } from "express";
import { findReader } from "../lib/replit-session";

export const replitSession: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const reader = await findReader(header.slice(7));
    if (reader) {
      res.locals.userId = reader.id;
      res.locals.reader = reader;
      // Legacy storage key for existing private-library/import code; NOT a Clerk session.
      res.locals.clerkUserId = reader.clerkUserId;
    }
  }
  next();
};
export const requireReader: RequestHandler = (_req, res, next) => {
  if (!res.locals.userId) { res.status(401).json({ error: "Sign in to access your library." }); return; }
  next();
};
