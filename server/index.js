import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import pg from 'pg'
import serverless from 'serverless-http'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)) })

const { Pool } = pg
const app = express()
const host = process.env.HOST || '127.0.0.1'
const port = Number(process.env.PORT) || 3000
const isLambdaRuntime = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT)
const requiredDatabaseVariables = ['DB_NAME', 'DB_USER', 'DB_PASSWORD']
const missingDatabaseVariables = requiredDatabaseVariables.filter((name) => !process.env[name])
if (missingDatabaseVariables.length > 0) {
  throw new Error(`Missing required database environment variables: ${missingDatabaseVariables.join(', ')}`)
}

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
if (allowedOrigins.includes('*')) {
  throw new Error('CORS_ORIGIN must list specific frontend origins; wildcard origins are not allowed')
}
const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true)
    }
    return callback(null, allowedOrigins.includes(origin))
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
}
const maxDatabaseInteger = 2147483647
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error.message)
})

app.use(cors(corsOptions))
app.options(/.*/, cors(corsOptions))
app.use(express.json())

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function positiveInteger(value, field) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > maxDatabaseInteger) {
    throw new HttpError(400, `${field} must be a positive integer`)
  }
  return value
}

function nonNegativeInteger(value, field, defaultValue) {
  const number = value === undefined && defaultValue !== undefined ? defaultValue : value
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 0 || number > maxDatabaseInteger) {
    throw new HttpError(400, `${field} must be a non-negative integer`)
  }
  return number
}

function productInput(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object')
  }

  const input = {}
  const fields = ['name', 'sku', 'category', 'supplier_name', 'quantity', 'reorder_level', 'price']
  const allowedFields = new Set(fields)
  const unexpected = Object.keys(body).find((key) => !allowedFields.has(key))
  if (unexpected) {
    throw new HttpError(400, `Unexpected field: ${unexpected}`)
  }

  if (!partial || Object.hasOwn(body, 'name')) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      throw new HttpError(400, 'name is required and must be a non-empty string')
    }
    input.name = body.name.trim()
  }

  if (!partial || Object.hasOwn(body, 'sku')) {
    if (typeof body.sku !== 'string' || !body.sku.trim()) {
      throw new HttpError(400, 'sku is required and must be a non-empty string')
    }
    input.sku = body.sku.trim()
  }

  if (!partial || Object.hasOwn(body, 'category')) {
    if (typeof body.category !== 'string' || !body.category.trim()) {
      throw new HttpError(400, 'category is required and must be a non-empty string')
    }
    input.category = body.category.trim()
  }

  if (Object.hasOwn(body, 'supplier_name') || !partial) {
    if (body.supplier_name !== undefined && body.supplier_name !== null && typeof body.supplier_name !== 'string') {
      throw new HttpError(400, 'supplier_name must be a string or null')
    }
    input.supplier_name = body.supplier_name?.trim() || null
  }

  if (!partial || Object.hasOwn(body, 'quantity')) {
    input.quantity = nonNegativeInteger(body.quantity, 'quantity', 0)
  }
  if (!partial || Object.hasOwn(body, 'reorder_level')) {
    input.reorder_level = nonNegativeInteger(body.reorder_level, 'reorder_level', 0)
  }
  if (!partial || Object.hasOwn(body, 'price')) {
    const price = body.price === undefined && !partial ? 0 : body.price
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
      throw new HttpError(400, 'price must be a non-negative number')
    }
    input.price = price
  }

  if (partial && Object.keys(input).length === 0) {
    throw new HttpError(400, 'Provide at least one product field to update')
  }
  return input
}

function productId(request) {
  return positiveInteger(Number(request.params.id), 'id')
}

app.get('/api/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1')
    response.json({ status: 'ok', message: 'Server is running', database: 'connected' })
  } catch (error) {
    console.error('Database health check failed:', error.message)
    response.status(503).json({
      status: 'error',
      message: 'Server is running but the database is unavailable',
      database: 'disconnected',
    })
  }
})

app.get('/api/products/low-stock', async (_request, response) => {
  const result = await pool.query(
    `SELECT id, name, sku, category, price, quantity, reorder_level, supplier_name, created_at, updated_at
     FROM products
     WHERE quantity <= reorder_level
     ORDER BY name, id`,
  )
  response.json(result.rows)
})

app.get('/api/products', async (_request, response) => {
  const result = await pool.query(
    `SELECT id, name, sku, category, price, quantity, reorder_level, supplier_name, created_at, updated_at
     FROM products
     ORDER BY id`,
  )
  response.json(result.rows)
})

app.get('/api/products/:id', async (request, response) => {
  const id = productId(request)
  const result = await pool.query(
    `SELECT id, name, sku, category, price, quantity, reorder_level, supplier_name, created_at, updated_at
     FROM products
     WHERE id = $1`,
    [id],
  )
  if (result.rowCount === 0) {
    throw new HttpError(404, 'Product not found')
  }
  response.json(result.rows[0])
})

app.post('/api/products', async (request, response) => {
  const input = productInput(request.body)
  const result = await pool.query(
    `INSERT INTO products (name, sku, category, price, quantity, reorder_level, supplier_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, sku, category, price, quantity, reorder_level, supplier_name, created_at, updated_at`,
    [input.name, input.sku, input.category, input.price, input.quantity, input.reorder_level, input.supplier_name],
  )
  response.status(201).json(result.rows[0])
})

app.put('/api/products/:id', async (request, response) => {
  const id = productId(request)
  const input = productInput(request.body, { partial: true })
  if (Object.hasOwn(input, 'quantity')) {
    throw new HttpError(400, 'Use the stock-in or stock-out endpoint to change quantity')
  }
  const columns = {
    name: 'name',
    sku: 'sku',
    category: 'category',
    supplier_name: 'supplier_name',
    reorder_level: 'reorder_level',
    price: 'price',
  }
  const assignments = []
  const values = []
  for (const [key, value] of Object.entries(input)) {
    values.push(value)
    assignments.push(`${columns[key]} = $${values.length}`)
  }
  values.push(id)
  const result = await pool.query(
    `UPDATE products
     SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${values.length}
     RETURNING id, name, sku, category, price, quantity, reorder_level, supplier_name, created_at, updated_at`,
    values,
  )
  if (result.rowCount === 0) {
    throw new HttpError(404, 'Product not found')
  }
  response.json(result.rows[0])
})

app.delete('/api/products/:id', async (request, response) => {
  const id = productId(request)
  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const product = await client.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [id])
    if (product.rowCount === 0) {
      throw new HttpError(404, 'Product not found')
    }
    const history = await client.query(
      'SELECT 1 FROM stock_transactions WHERE product_id = $1 LIMIT 1',
      [id],
    )
    if (history.rowCount > 0) {
      throw new HttpError(409, 'Cannot delete a product with stock transaction history')
    }
    await client.query('DELETE FROM products WHERE id = $1', [id])
    await client.query('COMMIT')
    transactionStarted = false
    response.status(204).end()
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        console.error('Failed to roll back product deletion:', rollbackError.message)
      }
    }
    throw error
  } finally {
    client.release()
  }
})

app.get('/api/transactions', async (_request, response) => {
  const result = await pool.query(
    `SELECT st.id, st.product_id, p.name AS product_name, p.sku,
            st.transaction_type, st.quantity, st.note, st.created_at
     FROM stock_transactions st
     JOIN products p ON p.id = st.product_id
     ORDER BY st.created_at DESC, st.id DESC`,
  )
  response.json(result.rows)
})

app.get('/api/dashboard', async (_request, response) => {
  const [totals, transactions] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::integer AS total_product_count,
         COALESCE(SUM(quantity), 0)::bigint AS total_units,
         COUNT(*) FILTER (WHERE quantity <= reorder_level)::integer AS low_stock_count,
         COALESCE(SUM(quantity * price), 0)::numeric AS total_inventory_value
       FROM products`,
    ),
    pool.query(
      `SELECT st.id, st.product_id, p.name AS product_name, p.sku,
              st.transaction_type, st.quantity, st.note, st.created_at
       FROM stock_transactions st
       JOIN products p ON p.id = st.product_id
       ORDER BY st.created_at DESC, st.id DESC
       LIMIT 10`,
    ),
  ])
  response.json({
    ...totals.rows[0],
    recent_stock_transactions: transactions.rows,
  })
})

async function adjustStock(request, response, transactionType) {
  const id = productId(request)
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
    throw new HttpError(400, 'Request body must be a JSON object')
  }
  const unexpected = Object.keys(request.body).find((key) => !['quantity', 'note'].includes(key))
  if (unexpected) {
    throw new HttpError(400, `Unexpected field: ${unexpected}`)
  }
  const quantity = positiveInteger(request.body.quantity, 'quantity')
  if (request.body.note !== undefined && request.body.note !== null && typeof request.body.note !== 'string') {
    throw new HttpError(400, 'note must be a string or null')
  }
  const note = request.body.note?.trim() || null
  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const product = await client.query(
      'SELECT id, quantity FROM products WHERE id = $1 FOR UPDATE',
      [id],
    )
    if (product.rowCount === 0) {
      throw new HttpError(404, 'Product not found')
    }

    const currentQuantity = Number(product.rows[0].quantity)
    const newQuantity = transactionType === 'IN'
      ? currentQuantity + quantity
      : currentQuantity - quantity
    if (!Number.isSafeInteger(newQuantity) || newQuantity < 0) {
      throw new HttpError(409, 'Insufficient stock for this stock-out request')
    }
    if (newQuantity > maxDatabaseInteger) {
      throw new HttpError(409, 'Stock quantity exceeds the maximum supported quantity')
    }

    const updated = await client.query(
      `UPDATE products
       SET quantity = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, name, sku, category, price, quantity, reorder_level, supplier_name, created_at, updated_at`,
      [newQuantity, id],
    )
    const transaction = await client.query(
      `INSERT INTO stock_transactions (product_id, transaction_type, quantity, note)
       VALUES ($1, $2, $3, $4)
       RETURNING id, product_id, transaction_type, quantity, note, created_at`,
      [id, transactionType, quantity, note],
    )
    await client.query('COMMIT')
    transactionStarted = false
    response.status(201).json({
      product: updated.rows[0],
      transaction: transaction.rows[0],
    })
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        console.error('Failed to roll back stock adjustment:', rollbackError.message)
      }
    }
    throw error
  } finally {
    client.release()
  }
}

app.post('/api/products/:id/stock-in', async (request, response) => {
  await adjustStock(request, response, 'IN')
})

app.post('/api/products/:id/stock-out', async (request, response) => {
  await adjustStock(request, response, 'OUT')
})

app.use((_request, response) => {
  response.status(404).json({ error: 'Endpoint not found' })
})

app.use((error, _request, response, _next) => {
  if (error instanceof HttpError) {
    return response.status(error.status).json({ error: error.message })
  }
  if (error?.type === 'entity.parse.failed') {
    return response.status(400).json({ error: 'Request body must contain valid JSON' })
  }
  if (error?.code === '23505') {
    return response.status(409).json({ error: 'A product with this SKU already exists' })
  }
  if (error?.code === '23503') {
    return response.status(409).json({ error: 'The requested operation conflicts with related stock history' })
  }

  console.error('Unhandled API error:', error.message)
  return response.status(500).json({ error: 'Internal server error' })
})

export const handler = serverless(app, {
  binary: [],
  callbackWaitsForEmptyEventLoop: false,
})

export default app

if (!isLambdaRuntime) {
  const server = app.listen(port, host, () => {
    console.log(`API server listening on http://${host}:${port}`)
  })

  async function shutdown() {
    server.close(async () => {
      await pool.end()
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
