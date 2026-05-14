import jwt from "jsonwebtoken";
const JWT_SECRET = (process.env.JWT_SECRET ?? "dev-secret-change-in-production");
export function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
        res.status(401).json({ error: "Token não informado." });
        return;
    }
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload.type === "student") {
            res.status(401).json({ error: "Use o app do aluno para esta conta." });
            return;
        }
        req.auth = payload;
        next();
    }
    catch {
        res.status(401).json({ error: "Token inválido ou expirado." });
    }
}
export function requireStudentAuth(req, res, next) {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
        res.status(401).json({ error: "Token não informado." });
        return;
    }
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload.type !== "student") {
            res.status(401).json({ error: "Token inválido para o app do aluno." });
            return;
        }
        req.studentId = payload.sub;
        next();
    }
    catch {
        res.status(401).json({ error: "Token inválido ou expirado." });
    }
}
export function requireRole(...allowed) {
    return (req, res, next) => {
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
