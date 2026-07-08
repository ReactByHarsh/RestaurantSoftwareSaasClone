export function buildUpiPaymentUrl(input: { upiId: string; payeeName: string; amountPaise: number; note?: string }) {
  const upiId = input.upiId.trim()
  if (!upiId) return ''
  const params = new URLSearchParams({
    pa: upiId,
    pn: input.payeeName.trim() || upiId,
    am: (Math.max(0, input.amountPaise) / 100).toFixed(2),
    cu: 'INR',
  })
  if (input.note?.trim()) params.set('tn', input.note.trim())
  return `upi://pay?${params.toString()}`
}
