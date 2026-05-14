# Alpha GYM API

API REST do painel administrativo Alpha GYM (roadmap Fase 1+).

## Requisitos

- Node.js 18+
- PostgreSQL

## Configuração

1. Copie `.env.example` para `.env`.
2. Ajuste `DATABASE_URL` (ex: `postgresql://usuario:senha@localhost:5432/alpha_gym`).
3. Crie o banco: `createdb alpha_gym` (ou pelo pgAdmin).
4. Instale dependências: `npm install`.
5. (Opcional) Crie o primeiro admin: `npm run db:seed`.  
   Login padrão: `admin@alphagym.local` / `admin123`.  
   Para outro email/senha: `ADMIN_EMAIL=seu@email.com ADMIN_PASSWORD=suaSenha npm run db:seed`.

## Executar

- Desenvolvimento: `npm run dev` (porta 3001 por padrão).
- Produção: `npm run build` e `npm start`.

## Endpoints (Fase 1)

- **Auth:** `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/register`.
- **Alunos:** `GET/POST /api/students`, `GET/PUT /api/students/:id`.
- **Planos:** `GET/POST /api/plans`, `GET/PUT/DELETE /api/plans/:id`.
- **Matrículas:** `GET /api/enrollments?student_id=`, `GET /api/enrollments/student/:id/current`, `POST /api/enrollments`.
- **Financeiro:** `GET /api/financial/installments?month=&year=&status=`, `POST /api/financial/installments/generate`, `POST /api/financial/installments/:id/pay`, `GET /api/financial/daily`, `GET /api/financial/report?month=&year=&format=csv`.
- **Dashboard:** `GET /api/dashboard`.

Todas as rotas exceto health e auth/login exigem `Authorization: Bearer <token>`.

## Próximos passos (roadmap)

Alunos, Planos, Matrículas e Financeiro — ver `docs/ROADMAP-IMPLEMENTACAO.md` na raiz do repositório.
