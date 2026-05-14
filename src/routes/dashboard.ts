import { Router } from "express";
import { getDb } from "../db/client.js";
import { ensureStudentsTable, ensureInstallmentsTable, ensureCheckInsTable } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/", async (_req, res) => {
  try {
    await ensureStudentsTable();
    await ensureInstallmentsTable();
    const db = getDb();
    const now = new Date();
    const thisMonth = now.getMonth() + 1;
    const thisYear = now.getFullYear();
    const lastMonth = thisMonth === 1 ? 12 : thisMonth - 1;
    const lastYear = thisMonth === 1 ? thisYear - 1 : thisYear;
    const thisMonthStr = String(thisMonth).padStart(2, "0");
    const lastMonthStr = String(lastMonth).padStart(2, "0");

    const activeCount = await db.query(
      "SELECT COUNT(*) as c FROM students WHERE status = 'ativo'"
    );
    const lastMonthActive = await db.query(
      "SELECT COUNT(*) as c FROM students WHERE status = 'ativo' AND (created_at < $1)",
      [`${lastYear}-${lastMonthStr}-01`]
    );
    const newThisMonth = await db.query(
      "SELECT COUNT(*) as c FROM students WHERE created_at >= $1",
      [`${thisYear}-${thisMonthStr}-01`]
    );

    const revenueThis = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM installments WHERE status = 'paid' AND strftime('%m', paid_at) = $1 AND strftime('%Y', paid_at) = $2`,
      [thisMonthStr, String(thisYear)]
    );
    const revenueLast = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM installments WHERE status = 'paid' AND strftime('%m', paid_at) = $1 AND strftime('%Y', paid_at) = $2`,
      [lastMonthStr, String(lastYear)]
    );
    const pendingCount = await db.query(
      `SELECT COUNT(*) as c FROM installments WHERE status IN ('pending', 'overdue') AND date(due_date) < date('now')`
    );
    const overdueAmount = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM installments WHERE status IN ('pending', 'overdue') AND date(due_date) < date('now')`
    );
    const totalActive = await db.query("SELECT COUNT(*) as c FROM students WHERE status = 'ativo'");
    const totalRevenue = Number((revenueThis.rows[0] as { total: number }).total);
    const prevRevenue = Number((revenueLast.rows[0] as { total: number }).total);
    const activeStudents = Number((activeCount.rows[0] as { c: number }).c);
    const prevActive = Number((lastMonthActive.rows[0] as { c: number }).c);
    const newEnrollments = Number((newThisMonth.rows[0] as { c: number }).c);
    const inadimplenciaCount = Number((pendingCount.rows[0] as { c: number }).c);
    const inadimplenciaAmount = Number((overdueAmount.rows[0] as { total: number }).total);
    const ticketMedio = activeStudents > 0 ? totalRevenue / activeStudents : 0;

    const revenueByMonth = await db.query(
      `SELECT strftime('%m', paid_at) as month, strftime('%Y', paid_at) as year, SUM(amount) as value
       FROM installments WHERE status = 'paid' AND paid_at >= $1
       GROUP BY strftime('%Y', paid_at), strftime('%m', paid_at) ORDER BY year, month`,
      [`${thisYear - 1}-${thisMonthStr}-01`]
    );
    const growthByMonth = await db.query(
      `SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as alunos
       FROM students WHERE created_at <= datetime('now')
       GROUP BY strftime('%Y-%m', created_at) ORDER BY month`
    );

    await ensureCheckInsTable();
    const frequencyByHour = await db.query(
      `SELECT cast(strftime('%H', created_at) as integer) as hour, COUNT(*) as count
       FROM check_ins WHERE created_at >= date('now', '-30 days')
       GROUP BY cast(strftime('%H', created_at) as integer) ORDER BY hour`
    );
    const hourLabels = ["06h", "07h", "08h", "09h", "10h", "11h", "12h", "13h", "14h", "15h", "16h", "17h", "18h", "19h", "20h", "21h"];
    const frequencyMap = new Map((frequencyByHour.rows as { hour: number; count: number }[]).map((r) => [r.hour, r.count]));
    const frequencyData = hourLabels.map((label, i) => {
      const h = 6 + i;
      return { hour: label, count: frequencyMap.get(h) ?? 0 };
    });

    res.json({
      activeStudents,
      activeChange: prevActive > 0 ? ((activeStudents - prevActive) / prevActive) * 100 : 0,
      revenueThisMonth: totalRevenue,
      revenueChange: prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0,
      inadimplenciaPercent: totalRevenue + inadimplenciaAmount > 0 ? (inadimplenciaAmount / (totalRevenue + inadimplenciaAmount)) * 100 : 0,
      inadimplenciaCount,
      newEnrollments,
      ticketMedio: Math.round(ticketMedio * 100) / 100,
      revenueData: (revenueByMonth.rows as { month: string; year: string; value: number }[]).map((r) => ({
        month: `${["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][parseInt(r.month, 10) - 1]}/${String(r.year).slice(-2)}`,
        value: Number(r.value),
      })),
      growthData: (growthByMonth.rows as { month: string; alunos: number }[]).map((r) => ({
        month: r.month,
        alunos: Number(r.alunos),
      })),
      frequencyData,
    });
  } catch (e) {
    console.error("Dashboard error:", e);
    res.status(500).json({ error: "Erro ao carregar dashboard." });
  }
});
