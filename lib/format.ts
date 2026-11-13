export function formatRupiah(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '-';
  }
  const absFormatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(Math.round(amount)));
  return amount < 0 ? `-Rp ${absFormatted}` : `Rp ${absFormatted}`;
}
