import dotenv from 'dotenv'
import pg from 'pg'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)) })

const { Pool } = pg
const requiredDatabaseVariables = ['DB_NAME', 'DB_USER', 'DB_PASSWORD']
const missingDatabaseVariables = requiredDatabaseVariables.filter((name) => !process.env[name])
if (missingDatabaseVariables.length > 0) {
  throw new Error(`Missing required database environment variables: ${missingDatabaseVariables.join(', ')}`)
}

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

const products = [
  ['Wireless Mouse', 'ACC001', 'Accessories', 599, 3, 10],
  ['USB Keyboard', 'ACC002', 'Accessories', 899, 25, 5],
  ['HDMI Cable', 'CAB001', 'Cables', 299, 4, 10],
  ['Laptop Stand', 'ACC003', 'Accessories', 1299, 15, 5],
  ['USB-C Hub', 'ACC004', 'Accessories', 1499, 8, 10],
  ['64GB USB Drive', 'STO001', 'Storage', 499, 30, 10],
  ['1TB External HDD', 'STO002', 'Storage', 4499, 7, 5],
  ['500GB SSD', 'STO003', 'Storage', 3299, 12, 5],
  ['16GB DDR4 RAM', 'COM001', 'Components', 2499, 6, 8],
  ['650W Power Supply', 'COM002', 'Components', 3499, 9, 5],
  ['Wireless Headset', 'AUD001', 'Audio', 1799, 4, 8],
  ['Webcam 1080p', 'ACC005', 'Accessories', 1299, 14, 5],
  ['Ethernet Cable', 'CAB002', 'Cables', 199, 40, 10],
  ['USB-C Charger', 'POW001', 'Power', 999, 5, 10],
  ['Laptop Cooling Pad', 'ACC006', 'Accessories', 1099, 11, 5],
  ['Bluetooth Speaker', 'AUD002', 'Audio', 1499, 18, 5],
  ['DisplayPort Cable', 'CAB003', 'Cables', 399, 3, 8],
  ['128GB Memory Card', 'STO004', 'Storage', 699, 20, 10],
  ['Surge Protector', 'POW002', 'Power', 799, 6, 8],
  ['Mechanical Keyboard', 'ACC007', 'Accessories', 2499, 13, 5],
]

const placeholders = products.map((_, index) => {
  const first = index * 6 + 1
  return `($${first}, $${first + 1}, $${first + 2}, $${first + 3}, $${first + 4}, $${first + 5}, NULL)`
})
const values = products.flat()
const client = await pool.connect()

try {
  await client.query('BEGIN')
  const inserted = await client.query(
    `INSERT INTO products (name, sku, category, price, quantity, reorder_level, supplier_name)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (sku) DO NOTHING
     RETURNING sku`,
    values,
  )

  const seeded = await client.query(
    `SELECT sku, quantity, reorder_level
     FROM products
     WHERE sku = ANY($1::varchar[])
     ORDER BY sku`,
    [products.map((product) => product[1])],
  )

  if (seeded.rowCount !== products.length) {
    throw new Error(`Expected ${products.length} seeded SKUs to exist; found ${seeded.rowCount}`)
  }

  await client.query('COMMIT')
  const insertedSkus = new Set(inserted.rows.map((row) => row.sku))
  const skippedSkus = products.map((product) => product[1]).filter((sku) => !insertedSkus.has(sku))
  const lowStockCount = seeded.rows.filter((product) => product.quantity <= product.reorder_level).length

  console.log(`Seed products inserted: ${inserted.rowCount}`)
  console.log(`Existing SKUs left unchanged: ${skippedSkus.length}`)
  if (skippedSkus.length > 0) {
    console.log(`Skipped SKUs: ${skippedSkus.join(', ')}`)
  }
  console.log(`Requested sample products present: ${seeded.rowCount}/${products.length}`)
  console.log(`Low-stock products among these sample SKUs: ${lowStockCount}`)
} catch (error) {
  await client.query('ROLLBACK')
  console.error(`Product seed failed: ${error.message}`)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
