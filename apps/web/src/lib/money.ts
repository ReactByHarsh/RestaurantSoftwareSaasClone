// ─── Money Utilities (paise = 1/100 of INR) ──────────────────────────────────

/** Format paise to display string e.g. 75000 → "₹750.00" */
export function formatPaise(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(paise / 100)
}

/** Format paise without paise fraction e.g. 75000 → "₹750" */
export function formatPaiseShort(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100)
}

/** Convert rupees string to paise */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100)
}

/** Convert paise to rupees */
export function paiseToRupees(paise: number): number {
  return paise / 100
}

/** Calculate tax amount in paise */
export function calculateTax(pricePaise: number, taxPercent: number): number {
  return Math.round((pricePaise * taxPercent) / 100)
}

/** Calculate total with tax */
export function calculateTotal(pricePaise: number, quantity: number, taxPercent: number): number {
  const subtotal = pricePaise * quantity
  const tax = calculateTax(subtotal, taxPercent)
  return subtotal + tax
}
