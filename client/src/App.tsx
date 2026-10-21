import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

type Product = {
  id: number
  name: string
  sku: string
  category: string
  price: number | string
  quantity: number
  reorder_level: number
  supplier_name: string | null
  created_at: string
  updated_at: string
}

type Transaction = {
  id: number
  product_id: number
  product_name: string
  sku: string
  transaction_type: 'IN' | 'OUT'
  quantity: number
  note: string | null
  created_at: string
}

type Dashboard = {
  total_product_count: number
  total_units: number
  low_stock_count: number
  total_inventory_value: number | string
  recent_stock_transactions: Transaction[]
}

type ProductForm = {
  name: string
  sku: string
  category: string
  price: string
  quantity: string
  reorder_level: string
  supplier_name: string
}

type DialogState =
  | { type: 'product'; product?: Product }
  | { type: 'stock'; product: Product; action: 'IN' | 'OUT' }
  | { type: 'delete'; product: Product }
  | null

const emptyForm: ProductForm = {
  name: '',
  sku: '',
  category: '',
  price: '',
  quantity: '0',
  reorder_level: '5',
  supplier_name: '',
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
    box: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 8 9 5 9-5M3 8v9l9 5 9-5V8M12 13v9" /></>,
    alert: <><path d="M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3l-7.5-13a2 2 0 0 0-3.4-.1Z" /><path d="M12 9v4m0 4h.01" /></>,
    money: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M16 12h.01M8 12h.01M12 9v6m2-4a2 2 0 1 0-4 0c0 2 4 2 4 4a2 2 0 1 1-4 0" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    plus: <><path d="M12 5v14m-7-7h14" /></>,
    down: <><path d="M12 5v14m-7-7 7 7 7-7" /></>,
    up: <><path d="M12 19V5m-7 7 7-7 7 7" /></>,
    edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15l-.8 5Z" /></>,
    trash: <><path d="M3 6h18m-2 0-.9 14H5.9L5 6m3 0V4h8v2m-6 4v6m4-6v6" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    leaf: <><path d="M20 4c-8 0-14 3-14 10a6 6 0 0 0 6 6c7 0 10-6 8-16Z" /><path d="M4 21c2-5 6-8 11-11" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.box}
    </svg>
  )
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
  } catch {
    throw new Error('Cannot reach the backend. Start the API on port 3000 and try again.')
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json() as { error?: string; message?: string }
      message = body.error || body.message || message
    } catch {
      // Keep the HTTP status message when the server did not return JSON.
    }
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function formatCurrency(value: number | string) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value) || 0)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function App() {
  const [products, setProducts] = useState<Product[]>([])
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [databaseConnected, setDatabaseConnected] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All categories')
  const [dialog, setDialog] = useState<DialogState>(null)
  const [saving, setSaving] = useState(false)
  const [dialogError, setDialogError] = useState('')
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [stockQuantity, setStockQuantity] = useState('')
  const [stockNote, setStockNote] = useState('')

  const loadDashboard = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const [nextProducts, nextDashboard] = await Promise.all([
        api<Product[]>('/api/products'),
        api<Dashboard>('/api/dashboard'),
      ])
      setProducts(nextProducts)
      setDashboard(nextDashboard)
      setDatabaseConnected(true)
    } catch (loadError) {
      setDatabaseConnected(false)
      setError(loadError instanceof Error ? loadError.message : 'Unable to load inventory.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const categories = useMemo(
    () => ['All categories', ...new Set(products.map((product) => product.category).filter(Boolean).sort())],
    [products],
  )

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return products.filter((product) => {
      const matchesCategory = category === 'All categories' || product.category === category
      const matchesSearch = !query || [product.name, product.sku, product.category, product.supplier_name || '']
        .some((value) => value.toLowerCase().includes(query))
      return matchesCategory && matchesSearch
    })
  }, [category, products, search])

  function openCreateDialog() {
    setForm(emptyForm)
    setDialogError('')
    setDialog({ type: 'product' })
  }

  function openEditDialog(product: Product) {
    setDialogError('')
    setForm({
      name: product.name,
      sku: product.sku,
      category: product.category,
      price: String(product.price),
      quantity: String(product.quantity),
      reorder_level: String(product.reorder_level),
      supplier_name: product.supplier_name || '',
    })
    setDialog({ type: 'product', product })
  }

  function openStockDialog(product: Product, action: 'IN' | 'OUT') {
    setStockQuantity('')
    setStockNote('')
    setDialogError('')
    setDialog({ type: 'stock', product, action })
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const editing = dialog?.type === 'product' ? dialog.product : undefined
    const body = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      category: form.category.trim(),
      price: Number(form.price),
      quantity: Number(form.quantity),
      reorder_level: Number(form.reorder_level),
      supplier_name: form.supplier_name.trim() || null,
    }
    try {
      if (editing) {
        const { quantity: _quantity, ...editableFields } = body
        await api<Product>(`/api/products/${editing.id}`, { method: 'PUT', body: JSON.stringify(editableFields) })
        setNotice('Product details updated successfully.')
      } else {
        await api<Product>('/api/products', { method: 'POST', body: JSON.stringify(body) })
        setNotice('Product added to your inventory.')
      }
      setDialog(null)
      await loadDashboard(true)
    } catch (saveError) {
      setDialogError(saveError instanceof Error ? saveError.message : 'Unable to save product.')
    } finally {
      setSaving(false)
    }
  }

  async function submitStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (dialog?.type !== 'stock') return
    setSaving(true)
    try {
      await api(`/api/products/${dialog.product.id}/stock-${dialog.action === 'IN' ? 'in' : 'out'}`, {
        method: 'POST',
        body: JSON.stringify({ quantity: Number(stockQuantity), note: stockNote.trim() || null }),
      })
      setNotice(`${dialog.action === 'IN' ? 'Stock added' : 'Stock removed'} for ${dialog.product.name}.`)
      setDialog(null)
      await loadDashboard(true)
    } catch (stockError) {
      setDialogError(stockError instanceof Error ? stockError.message : 'Unable to update stock.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteProduct() {
    if (dialog?.type !== 'delete') return
    setSaving(true)
    try {
      await api(`/api/products/${dialog.product.id}`, { method: 'DELETE' })
      setNotice(`${dialog.product.name} was deleted.`)
      setDialog(null)
      await loadDashboard(true)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete product.')
      setDialog(null)
    } finally {
      setSaving(false)
    }
  }

  const stats = [
    { label: 'Total products', value: dashboard?.total_product_count ?? 0, icon: 'box', tone: 'blue', caption: 'Products in catalog' },
    { label: 'Units in stock', value: dashboard?.total_units ?? 0, icon: 'grid', tone: 'violet', caption: 'Across all products' },
    { label: 'Low-stock items', value: dashboard?.low_stock_count ?? 0, icon: 'alert', tone: 'orange', caption: 'Need your attention' },
    { label: 'Inventory value', value: formatCurrency(dashboard?.total_inventory_value ?? 0), icon: 'money', tone: 'green', caption: 'Current stock value' },
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Stockwise home">
          <span className="brand-mark"><Icon name="box" size={23} /></span>
          <span>stockwise<span className="brand-dot">.</span></span>
        </a>
        <div className="side-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <a href="#overview" className="nav-link active"><Icon name="grid" /><span>Overview</span></a>
          <a href="#inventory" className="nav-link"><Icon name="box" /><span>Inventory</span><span className="nav-count">{products.length}</span></a>
          <a href="#transactions" className="nav-link"><Icon name="clock" /><span>Transactions</span></a>
        </nav>
        <div className="sidebar-bottom">
          <div className="side-help">
            <div className="help-icon"><Icon name="leaf" size={18} /></div>
            <strong>Stay in control</strong>
            <span>Keep your stock balanced and your business moving.</span>
          </div>
          <div className="profile">
            <div className="avatar">IM</div>
            <div className="profile-copy"><strong>Inventory Manager</strong><span>Workspace admin</span></div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><Icon name="chevron" size={15} /><strong>Overview</strong></div>
          <div className="topbar-actions">
            <span className={`live-status${databaseConnected === false ? ' disconnected' : ''}`}><i />{databaseConnected === null ? 'Checking connection' : databaseConnected ? 'Database connected' : 'Database disconnected'}</span>
            <button className={`icon-button${refreshing ? ' spinning' : ''}`} onClick={() => void loadDashboard(true)} aria-label="Refresh dashboard" title="Refresh"><Icon name="refresh" /></button>
            <div className="top-avatar">IM</div>
          </div>
        </header>

        <div className="page-wrap">
          <section className="welcome-row">
            <div>
              <p className="eyebrow">INVENTORY AT A GLANCE</p>
              <h1>Good day, Manager <span className="wave">✦</span></h1>
              <p className="subtitle">Here’s what’s happening with your inventory today.</p>
            </div>
            <button className="primary-button" onClick={openCreateDialog}><Icon name="plus" size={18} /> Add product</button>
          </section>

          {error && <div className="alert-banner" role="alert"><Icon name="alert" /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><Icon name="close" size={17} /></button></div>}
          {notice && <div className="success-toast" role="status"><Icon name="check" size={17} />{notice}</div>}

          <section className="stats-grid" aria-label="Inventory summary">
            {stats.map((stat) => (
              <article className="stat-card" key={stat.label}>
                <div className={`stat-icon ${stat.tone}`}><Icon name={stat.icon} size={20} /></div>
                <div className="stat-heading"><span>{stat.label}</span><span className="stat-menu">•••</span></div>
                <strong className="stat-value">{loading ? <span className="skeleton skeleton-value" /> : stat.value}</strong>
                <span className="stat-caption">{stat.caption}</span>
              </article>
            ))}
          </section>

          <section className="inventory-panel" id="inventory">
            <div className="panel-heading">
              <div>
                <div className="title-with-icon"><span className="title-icon"><Icon name="box" size={19} /></span><h2>Product inventory</h2></div>
                <p className="panel-subtitle">Manage and monitor your stock levels</p>
              </div>
              <span className="item-count">{products.length} items</span>
            </div>
            <div className="table-toolbar">
              <label className="search-box">
                <Icon name="search" size={18} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, SKU..." aria-label="Search products" />
                {search && <button onClick={() => setSearch('')} aria-label="Clear search"><Icon name="close" size={15} /></button>}
              </label>
              <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">
                {categories.map((item) => <option key={item}>{item}</option>)}
              </select>
              <button className="secondary-button" onClick={() => void loadDashboard(true)} disabled={refreshing}><Icon name="refresh" size={16} /> Refresh</button>
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>SKU</th><th>PRICE</th><th>QUANTITY</th><th>REORDER AT</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
                <tbody>
                  {loading ? Array.from({ length: 4 }, (_, index) => <tr key={index} className="loading-row"><td colSpan={8}><span className="skeleton skeleton-line" /></td></tr>) :
                    filteredProducts.map((product) => {
                      const lowStock = product.quantity <= product.reorder_level
                      return (
                        <tr key={product.id}>
                          <td><div className="product-cell"><span className={`product-thumb thumb-${product.id % 5}`}><Icon name="box" size={18} /></span><span className="product-name">{product.name}<small>{product.supplier_name || 'No supplier'}</small></span></div></td>
                          <td><span className="category-pill">{product.category}</span></td>
                          <td className="sku-cell">{product.sku}</td>
                          <td className="price-cell">{formatCurrency(product.price)}</td>
                          <td><strong className={lowStock ? 'quantity-low' : 'quantity-normal'}>{product.quantity}</strong><span className="unit-label"> units</span></td>
                          <td>{product.reorder_level} units</td>
                          <td><span className={`status-pill ${lowStock ? 'status-low' : 'status-good'}`}><i />{lowStock ? 'Low stock' : 'In stock'}</span></td>
                          <td>
                            <div className="row-actions">
                              <button className="action-button stock-in" title="Stock in" aria-label={`Stock in ${product.name}`} onClick={() => openStockDialog(product, 'IN')}><Icon name="down" size={16} /></button>
                              <button className="action-button stock-out" title="Stock out" aria-label={`Stock out ${product.name}`} onClick={() => openStockDialog(product, 'OUT')}><Icon name="up" size={16} /></button>
                              <button className="action-button" title="Edit product" aria-label={`Edit ${product.name}`} onClick={() => openEditDialog(product)}><Icon name="edit" size={15} /></button>
                              <button className="action-button delete-action" title="Delete product" aria-label={`Delete ${product.name}`} onClick={() => setDialog({ type: 'delete', product })}><Icon name="trash" size={15} /></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
              {!loading && filteredProducts.length === 0 && (
                <div className="empty-state"><span className="empty-icon"><Icon name={search || category !== 'All categories' ? 'search' : 'box'} size={24} /></span><strong>{products.length === 0 ? 'Your inventory is ready' : 'No products found'}</strong><p>{products.length === 0 ? 'Add your first product to start tracking stock.' : 'Try another search or category filter.'}</p>{products.length === 0 && <button className="primary-button small" onClick={openCreateDialog}><Icon name="plus" size={16} /> Add your first product</button>}</div>
              )}
            </div>
            <div className="table-footer"><span>Showing <strong>{filteredProducts.length}</strong> of <strong>{products.length}</strong> products</span><span className="footer-live"><i /> Live inventory data</span></div>
          </section>

          <section className="transactions-panel" id="transactions">
            <div className="panel-heading transaction-heading">
              <div><div className="title-with-icon"><span className="title-icon clock-icon"><Icon name="clock" size={19} /></span><h2>Recent stock activity</h2></div><p className="panel-subtitle">A quick look at your latest inventory movements</p></div>
              <span className="item-count">Last 10 transactions</span>
            </div>
            {loading ? <div className="transaction-loading"><span className="skeleton skeleton-line" /><span className="skeleton skeleton-line" /></div> :
              dashboard?.recent_stock_transactions.length ? (
                <div className="transaction-list">
                  {dashboard.recent_stock_transactions.slice(0, 5).map((transaction) => (
                    <div className="transaction-row" key={transaction.id}>
                      <span className={`transaction-icon ${transaction.transaction_type === 'IN' ? 'transaction-in' : 'transaction-out'}`}><Icon name={transaction.transaction_type === 'IN' ? 'down' : 'up'} size={17} /></span>
                      <div className="transaction-copy"><strong>{transaction.product_name}</strong><span>{transaction.sku}{transaction.note ? ` · ${transaction.note}` : ''}</span></div>
                      <span className={`transaction-quantity ${transaction.transaction_type === 'IN' ? 'positive' : 'negative'}`}>{transaction.transaction_type === 'IN' ? '+' : '−'}{transaction.quantity}</span>
                      <time>{formatDate(transaction.created_at)}</time>
                    </div>
                  ))}
                </div>
              ) : <div className="transactions-empty"><Icon name="clock" size={20} /><span>No stock movements yet. Use the stock actions above to record one.</span></div>}
          </section>
          <footer className="page-footer"><span>Stockwise Inventory</span><span>Built for smarter stock management <span className="footer-sparkle">✦</span></span></footer>
        </div>
      </main>

      {dialog?.type === 'product' && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
            <div className="modal-header"><div><span className="modal-kicker">PRODUCT DETAILS</span><h2 id="product-modal-title">{dialog.product ? 'Edit product' : 'Add a product'}</h2><p>Fill in the details below to keep your inventory up to date.</p></div><button className="icon-button" onClick={() => setDialog(null)} aria-label="Close"><Icon name="close" /></button></div>
            <form onSubmit={saveProduct}>
              <div className="form-grid">
                <label className="field full"><span>Product name</span><input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Wireless Mouse" /></label>
                <label className="field"><span>SKU</span><input required maxLength={80} value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="e.g. ELEC-001" /></label>
                <label className="field"><span>Category</span><input required maxLength={80} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="e.g. Electronics" /></label>
                <label className="field"><span>Price</span><div className="input-prefix"><span>$</span><input required min="0" step="0.01" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="0.00" /></div></label>
                <label className="field"><span>Reorder level</span><input required min="0" step="1" type="number" value={form.reorder_level} onChange={(event) => setForm({ ...form, reorder_level: event.target.value })} /></label>
                {!dialog.product && <label className="field"><span>Opening quantity</span><input required min="0" step="1" type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></label>}
                <label className={`field${dialog.product ? ' full' : ''}`}><span>Supplier <em>Optional</em></span><input maxLength={120} value={form.supplier_name} onChange={(event) => setForm({ ...form, supplier_name: event.target.value })} placeholder="Supplier name" /></label>
              </div>
              {dialogError && <div className="modal-error" role="alert"><Icon name="alert" size={16} />{dialogError}</div>}
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDialog(null)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving...' : dialog.product ? 'Save changes' : <><Icon name="plus" size={17} /> Add product</>}</button></div>
            </form>
          </section>
        </div>
      )}

      {dialog?.type === 'stock' && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}>
          <section className="modal-card compact-modal" role="dialog" aria-modal="true" aria-labelledby="stock-modal-title">
            <div className="modal-header"><div><span className="modal-kicker">{dialog.action === 'IN' ? 'RESTOCK INVENTORY' : 'RECORD USAGE'}</span><h2 id="stock-modal-title">Stock {dialog.action === 'IN' ? 'in' : 'out'}</h2><p>{dialog.product.name} · {dialog.product.quantity} units currently in stock</p></div><button className="icon-button" onClick={() => setDialog(null)} aria-label="Close"><Icon name="close" /></button></div>
            <form onSubmit={submitStock}>
              <label className="field"><span>Quantity</span><input autoFocus required min="1" max="2147483647" step="1" type="number" value={stockQuantity} onChange={(event) => setStockQuantity(event.target.value)} placeholder="Enter number of units" /></label>
              {dialog.action === 'OUT' && <p className="stock-hint">Available to remove: <strong>{dialog.product.quantity}</strong> units</p>}
              <label className="field note-field"><span>Note <em>Optional</em></span><input maxLength={500} value={stockNote} onChange={(event) => setStockNote(event.target.value)} placeholder={dialog.action === 'IN' ? 'e.g. Supplier delivery' : 'e.g. Customer order'} /></label>
              {dialogError && <div className="modal-error" role="alert"><Icon name="alert" size={16} />{dialogError}</div>}
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDialog(null)}>Cancel</button><button className={`primary-button ${dialog.action === 'OUT' ? 'out-button' : ''}`} disabled={saving}>{saving ? 'Saving...' : <><Icon name={dialog.action === 'IN' ? 'down' : 'up'} size={17} /> Confirm stock {dialog.action === 'IN' ? 'in' : 'out'}</>}</button></div>
            </form>
          </section>
        </div>
      )}

      {dialog?.type === 'delete' && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}>
          <section className="modal-card compact-modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-modal-title">
            <span className="confirm-icon"><Icon name="trash" size={22} /></span><h2 id="delete-modal-title">Delete this product?</h2><p><strong>{dialog.product.name}</strong> will be removed from your inventory. Products with stock transaction history cannot be deleted.</p>
            <div className="modal-actions"><button className="secondary-button" onClick={() => setDialog(null)}>Keep product</button><button className="danger-button" onClick={() => void deleteProduct()} disabled={saving}>{saving ? 'Deleting...' : 'Delete product'}</button></div>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
