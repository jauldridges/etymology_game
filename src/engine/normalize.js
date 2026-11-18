// Turns typed text and key words into a comparable form.
// Ignores capitals and accent marks, as the design requires. Also treats
// hyphens like spaces and drops apostrophes, so "chef d'oeuvre",
// "chef-d'œuvre" and "Chef-d’Œuvre" all match. It never touches word endings:
// plurals and verb forms come only from each entry's variants list.
export function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’‘ʼ`´]/g, '')
    .replace(/[-‐‑–—_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
