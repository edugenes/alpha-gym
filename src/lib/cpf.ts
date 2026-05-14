/** Remove caracteres não numéricos do CPF */
export function stripCpf(cpf: string): string {
  return (cpf || "").replace(/\D/g, "");
}

/** Validação simples: 11 dígitos e não todos iguais */
export function isValidCpf(cpf: string): boolean {
  const digits = stripCpf(cpf);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  return true;
}
