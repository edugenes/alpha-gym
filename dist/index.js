import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { studentsRouter } from "./routes/students.js";
import { plansRouter } from "./routes/plans.js";
import { enrollmentsRouter } from "./routes/enrollments.js";
import { financialRouter } from "./routes/financial.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { assessmentsRouter } from "./routes/assessments.js";
import { exercisesRouter } from "./routes/exercises.js";
import { workoutsRouter } from "./routes/workouts.js";
import { employeesRouter } from "./routes/employees.js";
import { checkInsRouter } from "./routes/checkIns.js";
import { studentAuthRouter } from "./routes/studentAuth.js";
import { studentRouter } from "./routes/student.js";
import { notificationsRouter } from "./routes/notifications.js";
const app = express();
const PORT = process.env.PORT ?? 3001;
const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
    : ["http://localhost:5173", "http://localhost:8080"];
app.use(cors({
    origin: (origin, cb) => {
        if (!origin)
            return cb(null, true);
        if (allowedOrigins.includes(origin))
            return cb(null, origin);
        cb(null, false);
    },
    credentials: true,
}));
app.use(express.json());
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/students", studentsRouter);
app.use("/api/plans", plansRouter);
app.use("/api/enrollments", enrollmentsRouter);
app.use("/api/financial", financialRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/assessments", assessmentsRouter);
app.use("/api/exercises", exercisesRouter);
app.use("/api/workouts", workoutsRouter);
app.use("/api/employees", employeesRouter);
app.use("/api/check-ins", checkInsRouter);
app.use("/api/student-auth", studentAuthRouter);
app.use("/api/student", studentRouter);
app.use("/api/notifications", notificationsRouter);
// Serve frontend estático (pasta public/ gerada pelo build do React)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    // Fallback SPA: qualquer rota que não seja /api retorna index.html
    app.get(/^(?!\/api).*$/, (_req, res) => {
        res.sendFile(path.join(publicDir, "index.html"));
    });
}
app.listen(PORT, () => {
    console.log(`Alpha GYM API rodando em http://localhost:${PORT}`);
});
