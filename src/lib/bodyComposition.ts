/**
 * Módulo de cálculos de composição corporal.
 *
 * ⚠️ AVISO IMPORTANTE:
 * As fórmulas aqui implementadas são estimativas antropométricas amplamente utilizadas no Brasil.
 * Os resultados dependem diretamente da técnica de medição do avaliador (posição do adipômetro,
 * local exato da dobra, pressão aplicada). ESTE SISTEMA NÃO SUBSTITUI AVALIAÇÃO CLÍNICA DE PRECISÃO.
 * Antes de utilizar esses resultados com alunos, o profissional de Educação Física responsável
 * deve validar as fórmulas e pontos anatômicos de medição conforme o protocolo adotado pela academia.
 *
 * Referências:
 * - Jackson AS, Pollock ML. "Generalized equations for predicting body density of men." Br J Nutr. 1978.
 * - Jackson AS, Pollock ML, Ward A. "Generalized equations for predicting body density of women." Med Sci Sports Exerc. 1980.
 * - Siri WE. "Body composition from fluid spaces and density: analysis of methods." 1956.
 */

export type Sex = "M" | "F";

// ── IMC ─────────────────────────────────────────────────────────────────────

/** Calcula IMC. height_cm em centímetros. */
export function calcBMI(weight_kg: number, height_cm: number): number {
  if (height_cm <= 0 || weight_kg <= 0) return 0;
  const h_m = height_cm / 100;
  return Math.round((weight_kg / (h_m * h_m)) * 100) / 100;
}

export function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return "Abaixo do peso";
  if (bmi < 25.0) return "Peso normal";
  if (bmi < 30.0) return "Sobrepeso";
  if (bmi < 35.0) return "Obesidade grau I";
  if (bmi < 40.0) return "Obesidade grau II";
  return "Obesidade grau III";
}

// ── Pollock 3 dobras ─────────────────────────────────────────────────────────

/**
 * Pollock 3 dobras — Homens
 * Pontos: peitoral (chest), abdômen (abdominal), coxa (thigh)
 * Equação: Jackson & Pollock, 1978.
 */
export function pollock3Men(chest: number, abdominal: number, thigh: number, age: number): number {
  const sum = chest + abdominal + thigh;
  return 1.10938 - 0.0008267 * sum + 0.0000016 * sum * sum - 0.0002574 * age;
}

/**
 * Pollock 3 dobras — Mulheres
 * Pontos: tríceps (triceps), supra-ilíaca (suprailiac), coxa (thigh)
 * Equação: Jackson, Pollock & Ward, 1980.
 */
export function pollock3Women(triceps: number, suprailiac: number, thigh: number, age: number): number {
  const sum = triceps + suprailiac + thigh;
  return 1.0994921 - 0.0009929 * sum + 0.0000023 * sum * sum - 0.0001392 * age;
}

// ── Pollock 7 dobras ─────────────────────────────────────────────────────────

/**
 * Pollock 7 dobras — Homens
 * Pontos: peitoral, axilar média, tríceps, subescapular, abdominal, supra-ilíaca, coxa
 * Equação: Jackson & Pollock, 1978.
 */
export function pollock7Men(
  chest: number,
  midaxillary: number,
  triceps: number,
  subscapular: number,
  abdominal: number,
  suprailiac: number,
  thigh: number,
  age: number
): number {
  const sum = chest + midaxillary + triceps + subscapular + abdominal + suprailiac + thigh;
  return 1.112 - 0.00043499 * sum + 0.00000055 * sum * sum - 0.00028826 * age;
}

/**
 * Pollock 7 dobras — Mulheres
 * Pontos: peitoral, axilar média, tríceps, subescapular, abdominal, supra-ilíaca, coxa
 * Equação: Jackson, Pollock & Ward, 1980.
 */
export function pollock7Women(
  chest: number,
  midaxillary: number,
  triceps: number,
  subscapular: number,
  abdominal: number,
  suprailiac: number,
  thigh: number,
  age: number
): number {
  const sum = chest + midaxillary + triceps + subscapular + abdominal + suprailiac + thigh;
  return 1.097 - 0.00046971 * sum + 0.00000056 * sum * sum - 0.00012828 * age;
}

// ── Equação de Siri ───────────────────────────────────────────────────────────

/** %Gordura = (495 / Densidade Corporal) − 450  (Siri, 1956) */
export function siriBodyFat(density: number): number {
  if (density <= 0) return 0;
  return Math.round(((495 / density) - 450) * 100) / 100;
}

// ── Orquestrador principal ────────────────────────────────────────────────────

export interface SkinfoldInput {
  triceps?: number | null;
  subscapular?: number | null;
  chest?: number | null;
  midaxillary?: number | null;
  suprailiac?: number | null;
  abdominal?: number | null;
  thigh?: number | null;
}

export interface BodyCompositionResult {
  density: number;
  bodyFatPercent: number;
  leanMassKg: number | null;
}

export function calcBodyComposition(
  protocol: "pollock3" | "pollock7",
  sex: Sex,
  age: number,
  weight_kg: number,
  skinfolds: SkinfoldInput
): BodyCompositionResult | null {
  let density = 0;

  const sf = skinfolds;

  if (protocol === "pollock3") {
    if (sex === "M") {
      if (sf.chest == null || sf.abdominal == null || sf.thigh == null) return null;
      density = pollock3Men(sf.chest, sf.abdominal, sf.thigh, age);
    } else {
      if (sf.triceps == null || sf.suprailiac == null || sf.thigh == null) return null;
      density = pollock3Women(sf.triceps, sf.suprailiac, sf.thigh, age);
    }
  } else {
    const required = [sf.chest, sf.midaxillary, sf.triceps, sf.subscapular, sf.abdominal, sf.suprailiac, sf.thigh];
    if (required.some((v) => v == null)) return null;
    if (sex === "M") {
      density = pollock7Men(sf.chest!, sf.midaxillary!, sf.triceps!, sf.subscapular!, sf.abdominal!, sf.suprailiac!, sf.thigh!, age);
    } else {
      density = pollock7Women(sf.chest!, sf.midaxillary!, sf.triceps!, sf.subscapular!, sf.abdominal!, sf.suprailiac!, sf.thigh!, age);
    }
  }

  const bodyFatPercent = siriBodyFat(density);
  const leanMassKg = weight_kg > 0 ? Math.round((weight_kg * (1 - bodyFatPercent / 100)) * 100) / 100 : null;

  return {
    density: Math.round(density * 100000) / 100000,
    bodyFatPercent,
    leanMassKg,
  };
}

/** Calcula a idade a partir da data de nascimento (string YYYY-MM-DD). */
export function ageFromBirthDate(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
