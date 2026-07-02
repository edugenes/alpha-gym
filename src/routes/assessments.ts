import { Router } from "express";
import PDFDocument from "pdfkit";
import { getDb } from "../db/client.js";
import {
  ensureAssessmentsTable,
  ensureAssessmentMeasurementsTable,
  ensureAssessmentSkinsfoldsTable,
  ensureAssessmentPhotosTable,
  ensureStudentsTable,
} from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  calcBMI,
  bmiCategory,
  calcBodyComposition,
  ageFromBirthDate,
  type Sex,
  type SkinfoldInput,
} from "../lib/bodyComposition.js";

export const assessmentsRouter = Router();
assessmentsRouter.use(requireAuth);

// Recepcionista não acessa detalhes de avaliação física (dados sensíveis de saúde - LGPD)
const requireProfOrAdmin = requireRole("professor", "administrador");

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface AssessmentRow {
  id: number;
  student_id: number;
  evaluator_id: number | null;
  assessment_date: string;
  weight_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  protocol: string | null;
  body_fat_percent: number | null;
  body_density: number | null;
  lean_mass_kg: number | null;
  goal: string | null;
  notes: string | null;
  created_at: string;
}

interface MeasurementsRow {
  neck: number | null; shoulder: number | null; chest: number | null;
  waist: number | null; abdomen: number | null; hip: number | null;
  arm_relaxed_right: number | null; arm_relaxed_left: number | null;
  arm_flexed_right: number | null; arm_flexed_left: number | null;
  forearm_right: number | null; forearm_left: number | null;
  thigh_right: number | null; thigh_left: number | null;
  calf_right: number | null; calf_left: number | null;
}

interface SkinfoldRow {
  triceps: number | null; subscapular: number | null; chest: number | null;
  midaxillary: number | null; suprailiac: number | null;
  abdominal: number | null; thigh: number | null;
}

interface PhotoRow { id: number; assessment_id: number; angle: string | null; url: string; created_at: string }

async function ensureAll() {
  await ensureAssessmentsTable();
  await ensureAssessmentMeasurementsTable();
  await ensureAssessmentSkinsfoldsTable();
  await ensureAssessmentPhotosTable();
}

function rowToAssessment(r: AssessmentRow, m?: MeasurementsRow | null, sf?: SkinfoldRow | null, photos?: PhotoRow[]) {
  return {
    id: r.id,
    studentId: r.student_id,
    evaluatorId: r.evaluator_id,
    assessmentDate: r.assessment_date,
    weightKg: r.weight_kg,
    heightCm: r.height_cm,
    bmi: r.bmi,
    bmiCategory: r.bmi ? bmiCategory(r.bmi) : null,
    protocol: r.protocol,
    bodyFatPercent: r.body_fat_percent,
    bodyDensity: r.body_density,
    leanMassKg: r.lean_mass_kg,
    goal: r.goal,
    notes: r.notes,
    createdAt: r.created_at,
    measurements: m ? {
      neck: m.neck, shoulder: m.shoulder, chest: m.chest,
      waist: m.waist, abdomen: m.abdomen, hip: m.hip,
      armRelaxedRight: m.arm_relaxed_right, armRelaxedLeft: m.arm_relaxed_left,
      armFlexedRight: m.arm_flexed_right, armFlexedLeft: m.arm_flexed_left,
      forearmRight: m.forearm_right, forearmLeft: m.forearm_left,
      thighRight: m.thigh_right, thighLeft: m.thigh_left,
      calfRight: m.calf_right, calfLeft: m.calf_left,
    } : null,
    skinfolds: sf ? {
      triceps: sf.triceps, subscapular: sf.subscapular, chest: sf.chest,
      midaxillary: sf.midaxillary, suprailiac: sf.suprailiac,
      abdominal: sf.abdominal, thigh: sf.thigh,
    } : null,
    photos: photos ?? [],
  };
}

// ── GET /api/assessments?student_id=X ────────────────────────────────────────

assessmentsRouter.get("/", requireProfOrAdmin, async (req, res) => {
  try {
    const studentId = req.query.student_id;
    if (!studentId) return res.status(400).json({ error: "student_id é obrigatório." });
    await ensureAll();
    const db = getDb();
    const result = await db.query(
      "SELECT * FROM assessments WHERE student_id = $1 ORDER BY assessment_date DESC",
      [studentId]
    );
    const assessments = await Promise.all(
      (result.rows as AssessmentRow[]).map(async (r) => {
        const [mRes, sfRes, phRes] = await Promise.all([
          db.query("SELECT * FROM assessment_measurements WHERE assessment_id = $1", [r.id]),
          db.query("SELECT * FROM assessment_skinfolds WHERE assessment_id = $1", [r.id]),
          db.query("SELECT * FROM assessment_photos WHERE assessment_id = $1 ORDER BY created_at", [r.id]),
        ]);
        return rowToAssessment(
          r,
          mRes.rows[0] as MeasurementsRow ?? null,
          sfRes.rows[0] as SkinfoldRow ?? null,
          phRes.rows as PhotoRow[]
        );
      })
    );
    res.json({ assessments });
  } catch (e) {
    console.error("Assessments list error:", e);
    res.status(500).json({ error: "Erro ao listar avaliações." });
  }
});

// ── GET /api/assessments/student/:id/evolution ────────────────────────────────

assessmentsRouter.get("/student/:studentId/evolution", requireProfOrAdmin, async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId, 10);
    if (Number.isNaN(studentId)) return res.status(400).json({ error: "ID inválido." });
    await ensureAll();
    const db = getDb();
    const result = await db.query(
      `SELECT a.id, a.assessment_date, a.weight_kg, a.height_cm, a.bmi,
              a.body_fat_percent, a.lean_mass_kg, a.protocol,
              m.waist, m.abdomen, m.hip, m.thigh_right, m.arm_flexed_right
       FROM assessments a
       LEFT JOIN assessment_measurements m ON m.assessment_id = a.id
       WHERE a.student_id = $1
       ORDER BY a.assessment_date ASC`,
      [studentId]
    );
    const evolution = (result.rows as {
      id: number; assessment_date: string; weight_kg: number | null; height_cm: number | null;
      bmi: number | null; body_fat_percent: number | null; lean_mass_kg: number | null;
      protocol: string | null; waist: number | null; abdomen: number | null;
      hip: number | null; thigh_right: number | null; arm_flexed_right: number | null;
    }[]).map((r) => ({
      id: r.id,
      date: r.assessment_date,
      weightKg: r.weight_kg,
      bmi: r.bmi,
      bodyFatPercent: r.body_fat_percent,
      leanMassKg: r.lean_mass_kg,
      waist: r.waist,
      abdomen: r.abdomen,
      hip: r.hip,
      thighRight: r.thigh_right,
      armFlexedRight: r.arm_flexed_right,
    }));
    res.json({ evolution });
  } catch (e) {
    console.error("Evolution error:", e);
    res.status(500).json({ error: "Erro ao buscar evolução." });
  }
});

// ── GET /api/assessments/:id ──────────────────────────────────────────────────

assessmentsRouter.get("/:id(\\d+)", requireProfOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido." });
    await ensureAll();
    const db = getDb();
    const result = await db.query("SELECT * FROM assessments WHERE id = $1", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Avaliação não encontrada." });
    const r = result.rows[0] as AssessmentRow;
    const [mRes, sfRes, phRes] = await Promise.all([
      db.query("SELECT * FROM assessment_measurements WHERE assessment_id = $1", [id]),
      db.query("SELECT * FROM assessment_skinfolds WHERE assessment_id = $1", [id]),
      db.query("SELECT * FROM assessment_photos WHERE assessment_id = $1 ORDER BY created_at", [id]),
    ]);
    res.json({
      assessment: rowToAssessment(
        r,
        mRes.rows[0] as MeasurementsRow ?? null,
        sfRes.rows[0] as SkinfoldRow ?? null,
        phRes.rows as PhotoRow[]
      )
    });
  } catch (e) {
    console.error("Assessment get error:", e);
    res.status(500).json({ error: "Erro ao buscar avaliação." });
  }
});

// ── POST /api/assessments ─────────────────────────────────────────────────────

assessmentsRouter.post("/", requireProfOrAdmin, async (req, res) => {
  try {
    const body = req.body as {
      studentId: number;
      evaluatorId?: number;
      assessmentDate: string;
      weightKg?: number;
      heightCm?: number;
      protocol?: "pollock3" | "pollock7" | "bioimpedancia" | null;
      bodyFatPercent?: number;
      goal?: string;
      notes?: string;
      measurements?: Partial<MeasurementsRow>;
      skinfolds?: Partial<SkinfoldRow>;
      photos?: { angle?: string; url: string }[];
    };

    if (!body.studentId || !body.assessmentDate) {
      return res.status(400).json({ error: "studentId e assessmentDate são obrigatórios." });
    }

    await ensureAll();
    await ensureStudentsTable();
    const db = getDb();

    const studentRes = await db.query(
      "SELECT id, birth_date, sex FROM students WHERE id = $1",
      [body.studentId]
    );
    if (studentRes.rows.length === 0) return res.status(404).json({ error: "Aluno não encontrado." });
    const student = studentRes.rows[0] as { id: number; birth_date: string | null; sex: string | null };

    const weight = body.weightKg ?? null;
    const height = body.heightCm ?? null;
    const bmi = weight && height ? calcBMI(weight, height) : null;

    let bodyFatPercent: number | null = body.bodyFatPercent ?? null;
    let bodyDensity: number | null = null;
    let leanMassKg: number | null = null;

    if ((body.protocol === "pollock3" || body.protocol === "pollock7") && body.skinfolds && student.birth_date) {
      const age = ageFromBirthDate(student.birth_date);
      const sex: Sex = (student.sex ?? "M").toUpperCase().startsWith("F") ? "F" : "M";
      const result = calcBodyComposition(body.protocol, sex, age, weight ?? 0, body.skinfolds as SkinfoldInput);
      if (result) {
        bodyDensity = result.density;
        bodyFatPercent = result.bodyFatPercent;
        leanMassKg = result.leanMassKg;
      }
    } else if (weight && bodyFatPercent != null) {
      leanMassKg = Math.round((weight * (1 - bodyFatPercent / 100)) * 100) / 100;
    }

    const insert = await db.query(
      `INSERT INTO assessments
        (student_id, evaluator_id, assessment_date, weight_kg, height_cm, bmi, protocol, body_fat_percent, body_density, lean_mass_kg, goal, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        body.studentId, body.evaluatorId ?? null,
        body.assessmentDate.split("T")[0],
        weight, height, bmi,
        body.protocol ?? null,
        bodyFatPercent, bodyDensity, leanMassKg,
        body.goal ?? null, body.notes ?? null,
      ]
    );
    const newRow = insert.rows[0] as AssessmentRow;

    // Measurements
    if (body.measurements && Object.keys(body.measurements).length > 0) {
      const m = body.measurements as MeasurementsRow;
      await db.query(
        `INSERT OR REPLACE INTO assessment_measurements
          (assessment_id, neck, shoulder, chest, waist, abdomen, hip,
           arm_relaxed_right, arm_relaxed_left, arm_flexed_right, arm_flexed_left,
           forearm_right, forearm_left, thigh_right, thigh_left, calf_right, calf_left)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          newRow.id,
          m.neck ?? null, m.shoulder ?? null, m.chest ?? null, m.waist ?? null,
          m.abdomen ?? null, m.hip ?? null,
          m.arm_relaxed_right ?? null, m.arm_relaxed_left ?? null,
          m.arm_flexed_right ?? null, m.arm_flexed_left ?? null,
          m.forearm_right ?? null, m.forearm_left ?? null,
          m.thigh_right ?? null, m.thigh_left ?? null,
          m.calf_right ?? null, m.calf_left ?? null,
        ]
      );
    }

    // Skinfolds
    if (body.skinfolds && Object.keys(body.skinfolds).length > 0) {
      const sf = body.skinfolds as SkinfoldRow;
      await db.query(
        `INSERT OR REPLACE INTO assessment_skinfolds
          (assessment_id, triceps, subscapular, chest, midaxillary, suprailiac, abdominal, thigh)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [newRow.id, sf.triceps ?? null, sf.subscapular ?? null, sf.chest ?? null,
          sf.midaxillary ?? null, sf.suprailiac ?? null, sf.abdominal ?? null, sf.thigh ?? null]
      );
    }

    // Photos
    let savedPhotos: PhotoRow[] = [];
    if (body.photos && body.photos.length > 0) {
      for (const ph of body.photos) {
        await db.query(
          "INSERT INTO assessment_photos (assessment_id, angle, url) VALUES ($1,$2,$3)",
          [newRow.id, ph.angle ?? null, ph.url]
        );
      }
      const phRes = await db.query("SELECT * FROM assessment_photos WHERE assessment_id = $1", [newRow.id]);
      savedPhotos = phRes.rows as PhotoRow[];
    }

    const [mRes, sfRes] = await Promise.all([
      db.query("SELECT * FROM assessment_measurements WHERE assessment_id = $1", [newRow.id]),
      db.query("SELECT * FROM assessment_skinfolds WHERE assessment_id = $1", [newRow.id]),
    ]);

    res.status(201).json({
      assessment: rowToAssessment(
        newRow,
        mRes.rows[0] as MeasurementsRow ?? null,
        sfRes.rows[0] as SkinfoldRow ?? null,
        savedPhotos
      )
    });
  } catch (e) {
    console.error("Assessment create error:", e);
    res.status(500).json({ error: "Erro ao registrar avaliação." });
  }
});

// ── DELETE /api/assessments/:id ───────────────────────────────────────────────

assessmentsRouter.delete("/:id", requireProfOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido." });
    await ensureAssessmentsTable();
    const db = getDb();
    const result = await db.query("DELETE FROM assessments WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Avaliação não encontrada." });
    res.status(204).send();
  } catch (e) {
    console.error("Assessment delete error:", e);
    res.status(500).json({ error: "Erro ao excluir avaliação." });
  }
});

// ── GET /api/assessments/:id/print ────────────────────────────────────────────

assessmentsRouter.get("/:id/print", requireProfOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido." });
    await ensureAll();
    const db = getDb();

    const aRes = await db.query("SELECT * FROM assessments WHERE id = $1", [id]);
    if (aRes.rows.length === 0) return res.status(404).json({ error: "Avaliação não encontrada." });
    const a = aRes.rows[0] as AssessmentRow;

    const [sRes, mRes, sfRes, prevRes] = await Promise.all([
      db.query("SELECT name, birth_date, sex FROM students WHERE id = $1", [a.student_id]),
      db.query("SELECT * FROM assessment_measurements WHERE assessment_id = $1", [id]),
      db.query("SELECT * FROM assessment_skinfolds WHERE assessment_id = $1", [id]),
      db.query(
        "SELECT * FROM assessments WHERE student_id = $1 AND assessment_date < $2 ORDER BY assessment_date DESC LIMIT 1",
        [a.student_id, a.assessment_date]
      ),
    ]);

    const student = sRes.rows[0] as { name: string; birth_date: string | null; sex: string | null } | undefined;
    const m = mRes.rows[0] as MeasurementsRow | undefined;
    const sf = sfRes.rows[0] as SkinfoldRow | undefined;
    const prev = prevRes.rows[0] as AssessmentRow | undefined;

    const doc = new PDFDocument({ margin: 48, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="avaliacao-${id}.pdf"`);
    doc.pipe(res);

    // Cabeçalho
    doc.fontSize(20).font("Helvetica-Bold").text("Alpha GYM", { align: "center" });
    doc.fontSize(10).font("Helvetica").fillColor("#888888").text("Avaliação Física", { align: "center" });
    doc.moveDown(0.3);
    doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).strokeColor("#f97316").lineWidth(2).stroke();
    doc.moveDown(0.6);

    // Dados do aluno
    doc.fillColor("#000").fontSize(12).font("Helvetica-Bold").text(`Aluno: ${student?.name ?? "—"}`);
    doc.fontSize(10).font("Helvetica").fillColor("#444")
      .text(`Data da avaliação: ${a.assessment_date}   |   Protocolo: ${a.protocol ?? "—"}`)
      .text(`Objetivo: ${a.goal ?? "—"}`);
    doc.moveDown(0.8);

    // Cards principais
    function kv(label: string, value: string, prev_val?: string) {
      const diff = prev_val != null ? `  (anterior: ${prev_val})` : "";
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#000").text(`${label}: `, { continued: true });
      doc.font("Helvetica").fillColor("#333").text(`${value}${diff}`);
    }

    doc.fontSize(11).font("Helvetica-Bold").fillColor("#f97316").text("Dados Gerais");
    doc.moveDown(0.2);
    doc.fillColor("#000");
    kv("Peso", a.weight_kg != null ? `${a.weight_kg} kg` : "—", prev?.weight_kg != null ? `${prev.weight_kg} kg` : undefined);
    kv("Altura", a.height_cm != null ? `${a.height_cm} cm` : "—");
    kv("IMC", a.bmi != null ? `${a.bmi} (${bmiCategory(a.bmi)})` : "—");
    kv("% Gordura", a.body_fat_percent != null ? `${a.body_fat_percent}%` : "—", prev?.body_fat_percent != null ? `${prev.body_fat_percent}%` : undefined);
    kv("Massa Magra", a.lean_mass_kg != null ? `${a.lean_mass_kg} kg` : "—");
    doc.moveDown(0.6);

    // Circunferências
    if (m) {
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#f97316").text("Perimetria (cm)");
      doc.moveDown(0.2);
      const pairs: [string, number | null][] = [
        ["Pescoço", m.neck], ["Ombro", m.shoulder], ["Peitoral", m.chest],
        ["Cintura", m.waist], ["Abdômen", m.abdomen], ["Quadril", m.hip],
        ["Braço relax. D", m.arm_relaxed_right], ["Braço relax. E", m.arm_relaxed_left],
        ["Braço cont. D", m.arm_flexed_right], ["Braço cont. E", m.arm_flexed_left],
        ["Antebraço D", m.forearm_right], ["Antebraço E", m.forearm_left],
        ["Coxa D", m.thigh_right], ["Coxa E", m.thigh_left],
        ["Panturrilha D", m.calf_right], ["Panturrilha E", m.calf_left],
      ];
      const filled = pairs.filter(([, v]) => v != null);
      const colW = (doc.page.width - 96) / 2;
      for (let i = 0; i < filled.length; i += 2) {
        const rowY = doc.y;
        doc.fontSize(9).font("Helvetica").fillColor("#333")
          .text(`${filled[i][0]}: ${filled[i][1]} cm`, 48, rowY, { width: colW });
        if (filled[i + 1]) {
          doc.text(`${filled[i + 1][0]}: ${filled[i + 1][1]} cm`, 48 + colW, rowY, { width: colW });
        }
        doc.y = rowY + 14;
      }
      doc.moveDown(0.6);
    }

    // Dobras
    if (sf) {
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#f97316").text("Dobras Cutâneas (mm)");
      doc.moveDown(0.2);
      const sfPairs: [string, number | null][] = [
        ["Tríceps", sf.triceps], ["Subescapular", sf.subscapular],
        ["Peitoral", sf.chest], ["Axilar média", sf.midaxillary],
        ["Supra-ilíaca", sf.suprailiac], ["Abdominal", sf.abdominal], ["Coxa", sf.thigh],
      ];
      for (const [label, val] of sfPairs.filter(([, v]) => v != null)) {
        doc.fontSize(9).font("Helvetica").fillColor("#333").text(`${label}: ${val} mm`);
      }
      if (a.body_density) {
        doc.moveDown(0.2).text(`Densidade corporal: ${a.body_density}`);
      }
      doc.moveDown(0.6);
    }

    // Observações
    if (a.notes) {
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#f97316").text("Observações");
      doc.moveDown(0.2).fontSize(9).font("Helvetica").fillColor("#333").text(a.notes);
      doc.moveDown(0.6);
    }

    // Rodapé
    doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).strokeColor("#e5e7eb").lineWidth(1).stroke();
    doc.moveDown(0.5);
    const sigLineW = 180;
    const sigY = doc.y;
    doc.moveTo(48, sigY + 28).lineTo(48 + sigLineW, sigY + 28).strokeColor("#000").lineWidth(0.8).stroke();
    doc.fontSize(8).font("Helvetica").fillColor("#555").text("Assinatura do professor", 48, sigY + 32, { width: sigLineW, align: "center" });
    doc.moveTo(doc.page.width - 48 - sigLineW, sigY + 28).lineTo(doc.page.width - 48, sigY + 28).stroke();
    doc.text("Assinatura do aluno", doc.page.width - 48 - sigLineW, sigY + 32, { width: sigLineW, align: "center" });
    doc.moveDown(2.5);
    doc.fontSize(7).fillColor("#aaa").text(
      "⚠ Valores estimados por protocolo antropométrico, sujeitos à técnica de medição do avaliador. Este documento não substitui avaliação clínica de precisão.",
      { align: "center" }
    );

    doc.end();
  } catch (e) {
    console.error("Assessment print error:", e);
    if (!res.headersSent) res.status(500).json({ error: "Erro ao gerar PDF da avaliação." });
  }
});
