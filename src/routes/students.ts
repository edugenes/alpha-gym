import { Router } from "express";
import bcrypt from "bcryptjs";
import { getDb } from "../db/client.js";
import { ensureStudentsTable, ensureStudentAttachmentsTable } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { stripCpf, isValidCpf } from "../lib/cpf.js";

export const studentsRouter = Router();
studentsRouter.use(requireAuth);

type StudentStatus = "ativo" | "inadimplente" | "cancelado";

interface StudentRow {
  id: number;
  name: string;
  cpf: string;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  photo_url: string | null;
  notes: string | null;
  status: StudentStatus;
  plan_name: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

function rowToStudent(r: StudentRow) {
  return {
    id: r.id,
    name: r.name,
    cpf: r.cpf,
    birthDate: r.birth_date,
    phone: r.phone,
    email: r.email,
    address: r.address,
    photoUrl: r.photo_url,
    notes: r.notes,
    status: r.status,
    planName: r.plan_name,
    dueDate: r.due_date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** GET /api/students — Lista alunos (query: search, status, plan) */
studentsRouter.get("/", async (req, res) => {
  try {
    await ensureStudentsTable();
    const db = getDb();
    const { search, status, plan } = req.query as { search?: string; status?: string; plan?: string };

    let query = "SELECT * FROM students WHERE 1=1";
    const params: string[] = [];
    let i = 1;

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(name) LIKE $${i} OR cpf LIKE $${i})`;
      i++;
    }
    if (status && ["ativo", "inadimplente", "cancelado"].includes(status)) {
      params.push(status);
      query += ` AND status = $${i}`;
      i++;
    }
    if (plan && plan.trim()) {
      params.push(plan.trim());
      query += ` AND plan_name = $${i}`;
    }

    query += " ORDER BY name";

    const result = await db.query(query, params);
    const students = (result.rows as StudentRow[]).map((r) => rowToStudent(r));
    res.json({ students });
  } catch (e) {
    console.error("Students list error:", e);
    res.status(500).json({ error: "Erro ao listar alunos." });
  }
});

/** GET /api/students/:id/attachments — Lista anexos do aluno (ex.: atestados) */
studentsRouter.get("/:id/attachments", async (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (Number.isNaN(studentId)) return res.status(400).json({ error: "ID do aluno inválido." });
    await ensureStudentAttachmentsTable();
    const db = getDb();
    const result = await db.query(
      "SELECT id, student_id, type, content_url, file_name, created_at FROM student_attachments WHERE student_id = $1 ORDER BY created_at DESC",
      [studentId]
    );
    const attachments = (result.rows as { id: number; student_id: number; type: string; content_url: string; file_name: string | null; created_at: string }[]).map((r) => ({
      id: r.id,
      studentId: r.student_id,
      type: r.type,
      contentUrl: r.content_url,
      fileName: r.file_name,
      createdAt: r.created_at,
    }));
    res.json({ attachments });
  } catch (e) {
    console.error("Attachments list error:", e);
    res.status(500).json({ error: "Erro ao listar anexos." });
  }
});

/** POST /api/students/:id/attachments — Upload atestado (body: { type?, contentUrl ou content base64, fileName? }) */
studentsRouter.post("/:id/attachments", async (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (Number.isNaN(studentId)) return res.status(400).json({ error: "ID do aluno inválido." });
    const body = req.body as { type?: string; contentUrl?: string; content?: string; fileName?: string };
    const contentUrl = body.contentUrl || body.content || "";
    if (!contentUrl.trim()) return res.status(400).json({ error: "contentUrl ou content é obrigatório." });
    const type = (body.type || "atestado").trim();
    await ensureStudentsTable();
    await ensureStudentAttachmentsTable();
    const db = getDb();
    const student = await db.query("SELECT id FROM students WHERE id = $1", [studentId]);
    if (student.rows.length === 0) return res.status(404).json({ error: "Aluno não encontrado." });
    const insert = await db.query(
      "INSERT INTO student_attachments (student_id, type, content_url, file_name) VALUES ($1, $2, $3, $4) RETURNING id, student_id, type, content_url, file_name, created_at",
      [studentId, type, contentUrl.substring(0, 50000), body.fileName?.trim() || null]
    );
    const r = insert.rows[0] as { id: number; student_id: number; type: string; content_url: string; file_name: string | null; created_at: string };
    res.status(201).json({
      attachment: {
        id: r.id,
        studentId: r.student_id,
        type: r.type,
        contentUrl: r.content_url,
        fileName: r.file_name,
        createdAt: r.created_at,
      },
    });
  } catch (e) {
    console.error("Attachment create error:", e);
    res.status(500).json({ error: "Erro ao anexar arquivo." });
  }
});

/** GET /api/students/:id */
studentsRouter.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "ID inválido." });
      return;
    }
    await ensureStudentsTable();
    const db = getDb();
    const result = await db.query("SELECT * FROM students WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Aluno não encontrado." });
      return;
    }
    res.json({ student: rowToStudent(result.rows[0] as StudentRow) });
  } catch (e) {
    console.error("Student get error:", e);
    res.status(500).json({ error: "Erro ao buscar aluno." });
  }
});

/** POST /api/students — Criar aluno */
studentsRouter.post("/", async (req, res) => {
  try {
    const body = req.body as {
      name?: string;
      cpf?: string;
      birthDate?: string;
      phone?: string;
      email?: string;
      address?: string;
      photoUrl?: string;
      notes?: string;
      status?: StudentStatus;
      planName?: string;
      dueDate?: string;
    };

    if (!body.name || !body.cpf) {
      res.status(400).json({ error: "Nome e CPF são obrigatórios." });
      return;
    }

    const cpf = stripCpf(body.cpf);
    if (!isValidCpf(cpf)) {
      res.status(400).json({ error: "CPF inválido." });
      return;
    }

    await ensureStudentsTable();
    const db = getDb();

    const existing = await db.query("SELECT id FROM students WHERE cpf = $1", [cpf]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: "Já existe um aluno com este CPF." });
      return;
    }

    const status = body.status && ["ativo", "inadimplente", "cancelado"].includes(body.status) ? body.status : "ativo";
    const insert = await db.query(
      `INSERT INTO students (name, cpf, birth_date, phone, email, address, photo_url, notes, status, plan_name, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        body.name.trim(),
        cpf,
        body.birthDate || null,
        body.phone?.trim() || null,
        body.email?.trim() || null,
        body.address?.trim() || null,
        body.photoUrl?.trim() || null,
        body.notes?.trim() || null,
        status,
        body.planName?.trim() || null,
        body.dueDate || null,
      ]
    );
    res.status(201).json({ student: rowToStudent(insert.rows[0] as StudentRow) });
  } catch (e) {
    console.error("Student create error:", e);
    res.status(500).json({ error: "Erro ao cadastrar aluno." });
  }
});

/** PUT /api/students/:id — Atualizar aluno */
studentsRouter.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "ID inválido." });
      return;
    }

    const body = req.body as {
      name?: string;
      cpf?: string;
      birthDate?: string;
      phone?: string;
      email?: string;
      address?: string;
      photoUrl?: string;
      notes?: string;
      status?: StudentStatus;
      planName?: string;
      dueDate?: string;
    };

    await ensureStudentsTable();
    const db = getDb();

    const existing = await db.query("SELECT id, cpf FROM students WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: "Aluno não encontrado." });
      return;
    }

    if (body.cpf !== undefined) {
      const cpf = stripCpf(body.cpf);
      if (!isValidCpf(cpf)) {
        res.status(400).json({ error: "CPF inválido." });
        return;
      }
      const duplicate = await db.query("SELECT id FROM students WHERE cpf = $1 AND id != $2", [cpf, id]);
      if (duplicate.rows.length > 0) {
        res.status(409).json({ error: "Já existe outro aluno com este CPF." });
        return;
      }
    }

    const current = existing.rows[0] as StudentRow;
    const name = body.name !== undefined ? body.name.trim() : current.name;
    const cpf = body.cpf !== undefined ? stripCpf(body.cpf) : current.cpf;
    const status = body.status && ["ativo", "inadimplente", "cancelado"].includes(body.status) ? body.status : current.status;

    await db.query(
      `UPDATE students SET
        name = $1, cpf = $2, birth_date = $3, phone = $4, email = $5, address = $6,
        photo_url = $7, notes = $8, status = $9, plan_name = $10, due_date = $11, updated_at = datetime('now')
       WHERE id = $12`,
      [
        name,
        cpf,
        body.birthDate ?? current.birth_date,
        body.phone?.trim() ?? current.phone,
        body.email?.trim() ?? current.email,
        body.address?.trim() ?? current.address,
        body.photoUrl?.trim() ?? current.photo_url,
        body.notes?.trim() ?? current.notes,
        status,
        body.planName?.trim() ?? current.plan_name,
        body.dueDate ?? current.due_date,
        id,
      ]
    );

    const updated = await db.query("SELECT * FROM students WHERE id = $1", [id]);
    res.json({ student: rowToStudent(updated.rows[0] as StudentRow) });
  } catch (e) {
    console.error("Student update error:", e);
    res.status(500).json({ error: "Erro ao atualizar aluno." });
  }
});

/** PUT /api/students/:id/app-password — Definir senha do app do aluno (recepção/admin) */
studentsRouter.put("/:id/app-password", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido." });
    const body = req.body as { password?: string };
    if (!body.password || body.password.length < 4) {
      return res.status(400).json({ error: "Senha deve ter no mínimo 4 caracteres." });
    }
    await ensureStudentsTable();
    const db = getDb();
    const existing = await db.query("SELECT id FROM students WHERE id = $1", [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: "Aluno não encontrado." });
    const password_hash = await bcrypt.hash(body.password, 10);
    await db.query("UPDATE students SET password_hash = $1, updated_at = datetime('now') WHERE id = $2", [password_hash, id]);
    res.json({ message: "Senha do app definida com sucesso." });
  } catch (e) {
    console.error("Student app-password error:", e);
    res.status(500).json({ error: "Erro ao definir senha." });
  }
});
