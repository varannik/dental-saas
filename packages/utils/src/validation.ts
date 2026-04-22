export function isValidToothNumber(tooth: string): boolean {
  const num = Number.parseInt(tooth, 10);
  return Number.isInteger(num) && num >= 1 && num <= 32;
}

export function isValidCDTCode(code: string): boolean {
  return /^D\d{4}$/.test(code);
}
