export type InventoryImportRow = {
  rowNumber: number
  sku: string
  name: string
  unit: string
  quantity: number
  reorderPoint: number
}

export type InventoryImportError = { rowNumber: number; code: string }

function parseCsv(source: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { field += '"'; index += 1 }
      else if (character === '"') quoted = false
      else field += character
    } else if (character === '"') quoted = true
    else if (character === ',') { row.push(field); field = '' }
    else if (character === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (character !== '\r') field += character
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field')
  row.push(field)
  if (row.some(value => value.length) || rows.length === 0) rows.push(row)
  return rows
}

function safeText(value: string, max: number) {
  const text = value.trim()
  return Boolean(text) && text.length <= max && !/^[=+\-@]/.test(text) && !/[\u0000-\u001f\u007f]/.test(text)
}

export function previewInventoryCsv(source: unknown) {
  const csv = String(source || '')
  if (!csv || Buffer.byteLength(csv) > 100_000) throw new Error('Inventory CSV must be between 1 byte and 100 KB')
  const parsed = parseCsv(csv)
  const header = parsed.shift()?.map(value => value.trim())
  if (JSON.stringify(header) !== JSON.stringify(['sku', 'name', 'unit', 'quantity', 'reorderPoint'])) {
    throw new Error('Inventory CSV header must be sku,name,unit,quantity,reorderPoint')
  }
  if (parsed.length > 100) throw new Error('Inventory CSV cannot contain more than 100 rows')
  const rows: InventoryImportRow[] = []
  const errors: InventoryImportError[] = []
  const seen = new Set<string>()
  parsed.forEach((columns, index) => {
    const rowNumber = index + 2
    if (columns.length !== 5) { errors.push({ rowNumber, code: 'column_count' }); return }
    const [rawSku, rawName, rawUnit, rawQuantity, rawReorder] = columns
    const sku = rawSku.trim().toUpperCase()
    const name = rawName.trim()
    const unit = rawUnit.trim()
    const quantity = Number(rawQuantity)
    const reorderPoint = Number(rawReorder)
    if (!/^[A-Z0-9][A-Z0-9._-]{0,99}$/.test(sku)) errors.push({ rowNumber, code: 'invalid_sku' })
    if (!safeText(name, 300)) errors.push({ rowNumber, code: 'invalid_name' })
    if (!safeText(unit, 80)) errors.push({ rowNumber, code: 'invalid_unit' })
    if (!Number.isSafeInteger(quantity) || quantity < 0) errors.push({ rowNumber, code: 'invalid_quantity' })
    if (!Number.isSafeInteger(reorderPoint) || reorderPoint < 0) errors.push({ rowNumber, code: 'invalid_reorder_point' })
    if (seen.has(sku)) errors.push({ rowNumber, code: 'duplicate_sku' })
    seen.add(sku)
    if (!errors.some(error => error.rowNumber === rowNumber)) rows.push({ rowNumber, sku, name, unit, quantity, reorderPoint })
  })
  return { rows, errors, rowCount: parsed.length }
}

export function inventoryRowsToCsv(rows: Array<Record<string, unknown>>) {
  const escape = (value: unknown) => {
    let text = String(value ?? '')
    if (/^[=+\-@]/.test(text)) text = `'${text}`
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  return [
    'sku,name,unit,status,quantityOnHand,quantityReserved,reorderPoint',
    ...rows.map(row => [row.sku, row.name, row.unit, row.status, row.quantityOnHand, row.quantityReserved, row.reorderPoint].map(escape).join(',')),
  ].join('\r\n')
}
