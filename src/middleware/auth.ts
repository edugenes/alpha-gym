import { Request, Response, NextFunction } from "express";
import jwt, { type Secret } from "jsonwebtoken";
import { Role } from "../routes/auth.js";

export interface AuthPayload {
  sub: number;
  email: string;
  role: Role;
}

export interface StudentAuthPayload {
  sub: number;
  type: "student";
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
      studentId?: number;
    }
  }
}

const JWT_SECRET = (process.env.JWT_SECRET ?? "dev-secret-change-in-production") as Secret;

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Token não informado." });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as AuthPayload & { type?: string };
    if (payload.type === "student") {
      res.status(401).json({ error: "Use o app do aluno para esta conta." });
      return;
    }
    req.auth = payload as AuthPayload;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado." });
  }
}

export function requireStudentAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Token não informado." });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as StudentAuthPayload;
    if (payload.type !== "student") {
      res.status(401).json({ error: "Token inválido para o app do aluno." });
      return;
    }
    req.studentId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado." });
  }
}

export function requireRole(...allowed: Role[]): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({ error: "Não autenticado." });
      return;
    }
    if (!allowed.includes(req.auth.role)) {
      res.status(403).json({ error: "Sem permissão para esta ação." });
      return;
    }
    next();
  };
}
