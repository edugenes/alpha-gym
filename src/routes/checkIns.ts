import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { getDb } from "../db/client.js";
import {
  ensureCheckInsTable,
  ensureStudentsTable,
  ensureEnrollmentsTable,
  ensureInstallmentsTable,
  ensureStudentWorkoutsTable,
  ensureWorkoutTemplatesTable,
  ensureWorkoutTemplateItemsTable,
  ensureExercisesTable,
  ensureDevicesTable,
} from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

export const checkInsRouter = Router();

// ── Middleware de autenticação por device token ──────────────────────────────
async function requireDeviceToken(req: Request, res: Response, next: () => void): Promise<void> {
  const token = req.headers["x-device-token"] as string | undefined;
  if (!token) {
    res.status(401).json({ error: "X-Device-Token obrigatório." });
    return;
  }
  try {
    await ensureDevicesTable();
    const db = getDb();
    const result = await db.query(
      "SELECT id, name, type FROM devices WHERE token = $1 AND status = 'ativo'",
      [token]
    );
    if (result.rows.length === 0) {
      res.status(401).json({ error: "Token de dispositivo inválido ou inativo." });
      return;
    }
    const device = result.rows[0] as { id: number; name: string; type: string };
    (req as Request & { device: typeof device }).device = device;
    // Atualiza last_seen_at
    db.query("UPDATE devices SET last_seen_at = datetime('now') WHERE id = $1", [device.id]).catch(() => {});
    next();
  } catch (e) {
    console.error("Device token check error:", e);
    res.status(500).json({ error: "Erro ao validar token de dispositivo." });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Verifica se o aluno tem matrícula ativa e mensalidade em aberto. */
async function getStudentAccessInfo(studentId: number) {
  const db = getDb();
  await ensureEnrollmentsTable();
  await ensureInstallmentsTable();

  const enrollment = await db.query(
    `SELECT e.id, e.end_date, e.active
     FROM enrollments e WHERE e.student_id = $1 AND e.active = 1
     ORDER BY e.end_date DESC LIMIT 1`,
    [studentId]
  );

  const hasActiveEnrollment = enrollment.rows.length > 0;

  const overdue = await db.query(
    `SELECT COUNT(*) as c FROM installments
     WHERE student_id = $1 AND status = 'pending' AND date(due_date) < date('now')`,
    [studentId]
  );
  const overdueCount = Number((overdue.rows[0] as { c: number }).c);

  return { hasActiveEnrollment, overdueCount };
}

/** Retorna a ficha de treino ativa do aluno (lista de exercícios). */
async function getActiveWorkout(studentId: number) {
  const db = getDb();
  await ensureStudentWorkoutsTable();
  await ensureWorkoutTemplatesTable();
  await ensureWorkoutTemplateItemsTable();
  await ensureExercisesTable();

  const sw = await db.query(
    `SELECT sw.id, sw.template_id, wt.name as template_name
     FROM student_workouts sw JOIN workout_templates wt ON wt.id = sw.template_id
     WHERE sw.student_id = $1 ORDER BY sw.assigned_at DESC LIMIT 1`,
    [studentId]
  );
  if (sw.rows.length === 0) return null;

  const r = sw.rows[0] as { id: number; template_id: number; template_name: string };
  const items = await db.query(
    `SELECT e.name as exercise_name, e.muscle_group, i.sets, i.reps, i.sort_order
     FROM workout_template_items i JOIN exercises e ON e.id = i.exercise_id
     WHERE i.template_id = $1 ORDER BY i.sort_order, i.id`,
    [r.template_id]
  );

  return {
    id: r.id,
    templateId: r.template_id,
    templateName: r.template_name,
    items: (items.rows as { exercise_name: string; muscle_group: string; sets: string | null; reps: string | null; sort_order: number }[]).map((i) => ({
      exerciseName: i.exercise_name,
      muscleGroup: i.muscle_group,
      sets: i.sets,
      reps: i.reps,
    })),
  };
}

// ── Rota painel: check-in manual pelo painel administrativo ──────────────────

checkInsRouter.post("/", requireAuth, async (req, res) => {
  try {
    const body = req.body as { studentId: number };
    if (!body.studentId) return res.status(400).json({ error: "studentId é obrigatório." });
    await ensureCheckInsTable();
    await ensureStudentsTable();
    const db = getDb();
    const student = await db.query("SELECT id FROM students WHERE id = $1", [body.studentId]);
    if (student.rows.length === 0) return res.status(404).json({ error: "Aluno não encontrado." });
    const insert = await db.query(
      "INSERT INTO check_ins (student_id) VALUES ($1) RETURNING id, student_id, created_at",
      [body.studentId]
    );
    const r = insert.rows[0] as { id: number; student_id: number; created_at: string };
    res.status(201).json({ checkIn: { id: r.id, studentId: r.student_id, createdAt: r.created_at } });
  } catch (e) {
    console.error("Check-in create error:", e);
    res.status(500).json({ error: "Erro ao registrar entrada." });
  }
});

// ── Rota totem: self-service (sem JWT de painel, usa device token) ────────────

const selfServiceLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10,             // máx. 10 requisições por IP por minuto
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde 1 minuto antes de tentar novamente." },
});

/**
 * POST /api/check-ins/self-service
 * Header: X-Device-Token: <token do totem>
 * Body: { cpf: "..." }  OU  { enrollmentCode: "..." }
 *
 * Retorna: nome, status mensalidade (boolean simplificado) e ficha de treino.
 * Nunca retorna CPF completo nem dados financeiros detalhados.
 */
checkInsRouter.post("/self-service", selfServiceLimiter, requireDeviceToken as unknown as Parameters<typeof checkInsRouter.post>[1], async (req, res) => {
  try {
    const { cpf } = req.body as { cpf?: string };
    if (!cpf?.trim()) {
      return res.status(400).json({ error: "CPF é obrigatório." });
    }

    const cpfNormalized = cpf.replace(/\D/g, "");
    if (cpfNormalized.length !== 11) {
      return res.status(400).json({ error: "CPF inválido." });
    }

    await ensureStudentsTable();
    await ensureCheckInsTable();
    const db = getDb();

    const result = await db.query(
      `SELECT id, name, status FROM students
       WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = $1`,
      [cpfNormalized]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Aluno não encontrado. Verifique o CPF ou procure a recepção." });
    }

    const student = result.rows[0] as { id: number; name: string; status: string };

    if (student.status === "cancelado") {
      return res.status(403).json({
        error: "Matrícula cancelada.",
        message: "Sua matrícula está cancelada. Procure a recepção.",
      });
    }

    const { hasActiveEnrollment, overdueCount } = await getStudentAccessInfo(student.id);

    // Registra check-in
    const insert = await db.query(
      "INSERT INTO check_ins (student_id) VALUES ($1) RETURNING id, created_at",
      [student.id]
    );
    const ci = insert.rows[0] as { id: number; created_at: string };

    const workout = await getActiveWorkout(student.id);

    res.status(201).json({
      checkIn: { id: ci.id, createdAt: ci.created_at },
      student: {
        name: student.name,
        status: student.status,
      },
      access: {
        hasActiveEnrollment,
        hasOverdueInstallment: overdueCount > 0,
        // Nunca detalha valores financeiros nesta rota
        message: overdueCount > 0
          ? "Atenção: há mensalidade em aberto. Procure a recepção."
          : null,
      },
      workout,
    });
  } catch (e) {
    console.error("Self-service check-in error:", e);
    res.status(500).json({ error: "Erro ao processar entrada." });
  }
});

// ── Rota catraca: acionada pelo Alpha GYM Bridge ─────────────────────────────

/**
 * POST /api/check-ins/device
 * Header: X-Device-Token: <token da catraca>
 * Body: { biometricRef: "...", method?: "biometria" | "card" }
 *
 * Retorna: { allow: boolean, reason: string, studentName?: string }
 */
checkInsRouter.post("/device", requireDeviceToken as unknown as Parameters<typeof checkInsRouter.post>[1], async (req, res) => {
  try {
    const { biometricRef, method = "biometria" } = req.body as {
      biometricRef?: string;
      method?: string;
    };

    if (!biometricRef?.trim()) {
      return res.status(400).json({ allow: false, reason: "biometricRef é obrigatório." });
    }

    await ensureStudentsTable();
    await ensureCheckInsTable();
    const db = getDb();

    // Busca aluno pelo identificador biométrico do equipamento
    const result = await db.query(
      "SELECT id, name, status FROM students WHERE biometric_device_ref = $1",
      [biometricRef.trim()]
    );

    if (result.rows.length === 0) {
      return res.json({ allow: false, reason: "Digital não cadastrada. Procure a recepção." });
    }

    const student = result.rows[0] as { id: number; name: string; status: string };

    if (student.status === "cancelado") {
      return res.json({ allow: false, reason: "Matrícula cancelada.", studentName: student.name });
    }

    const { hasActiveEnrollment, overdueCount } = await getStudentAccessInfo(student.id);

    if (!hasActiveEnrollment) {
      return res.json({ allow: false, reason: "Sem matrícula ativa.", studentName: student.name });
    }

    // Política: mensalidade atrasada há mais de X dias pode bloquear (configurável futuramente)
    // Por ora: avisa mas permite entrada
    const device = (req as Request & { device: { id: number } }).device;
    const insert = await db.query(
      `INSERT INTO check_ins (student_id, device_id, method) VALUES ($1, $2, $3)
       RETURNING id, created_at`,
      [student.id, device.id, method]
    );
    const ci = insert.rows[0] as { id: number; created_at: string };

    res.json({
      allow: true,
      reason: overdueCount > 0 ? "Entrada liberada (mensalidade em aberto — avisar na recepção)." : "Entrada liberada.",
      studentName: student.name,
      checkInId: ci.id,
    });
  } catch (e) {
    console.error("Device check-in error:", e);
    res.status(500).json({ allow: false, reason: "Erro interno." });
  }
});
