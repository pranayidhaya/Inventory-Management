-- Run after the tables exist.
-- Command:
-- psql -U postgres -d inventory_db -f database/03-seed-data.sql

INSERT INTO products (name, sku, category, price, quantity, reorder_level, supplier_name)
VALUES
    ('Wireless Mouse', 'ACC001', 'Accessories', 599.00, 3, 10, 'TechHub Supplies'),
    ('USB Keyboard', 'ACC002', 'Accessories', 899.00, 25, 5, 'Smart Devices Co.'),
    ('HDMI Cable', 'CAB001', 'Cables', 299.00, 4, 10, 'CableWorks Ltd.'),
    ('Laptop Stand', 'ACC003', 'Accessories', 1299.00, 15, 5, 'DeskCore'),
    ('USB-C Hub', 'ACC004', 'Accessories', 1499.00, 8, 10, 'Device Connect'),
    ('64GB USB Drive', 'STO001', 'Storage', 499.00, 30, 10, 'ByteStore'),
    ('1TB External HDD', 'STO002', 'Storage', 4499.00, 7, 5, 'Secure Storage'),
    ('500GB SSD', 'STO003', 'Storage', 3299.00, 12, 5, 'FlashEdge'),
    ('16GB DDR4 RAM', 'COM001', 'Components', 2499.00, 6, 8, 'CoreParts'),
    ('650W Power Supply', 'COM002', 'Components', 3499.00, 9, 5, 'PowerGrid Labs'),
    ('Wireless Headset', 'AUD001', 'Audio', 1799.00, 4, 8, 'AudioSphere'),
    ('Webcam 1080p', 'ACC005', 'Accessories', 1299.00, 14, 5, 'VisionTech'),
    ('Ethernet Cable', 'CAB002', 'Cables', 199.00, 40, 10, 'NetLink'),
    ('USB-C Charger', 'POW001', 'Power', 999.00, 5, 10, 'VoltSource'),
    ('Laptop Cooling Pad', 'ACC006', 'Accessories', 1099.00, 11, 5, 'ThermalCare'),
    ('Bluetooth Speaker', 'AUD002', 'Audio', 1499.00, 18, 5, 'SoundNest'),
    ('DisplayPort Cable', 'CAB003', 'Cables', 399.00, 3, 8, 'SignalFlow'),
    ('128GB Memory Card', 'STO004', 'Storage', 699.00, 20, 10, 'MediaVault'),
    ('Surge Protector', 'POW002', 'Power', 799.00, 6, 8, 'SafePower'),
    ('Mechanical Keyboard', 'ACC007', 'Accessories', 2499.00, 13, 5, 'KeyCraft')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO stock_transactions (product_id, transaction_type, quantity, note)
SELECT id, 'IN', 10, 'Initial inventory setup'
FROM products
WHERE sku = 'ACC001';

-- Example low-stock alert products are intentionally seeded with quantities at or below reorder level.
UPDATE products
SET quantity = 3, reorder_level = 10
WHERE sku = 'ACC001';

UPDATE products
SET quantity = 4, reorder_level = 10
WHERE sku = 'CAB001';

UPDATE products
SET quantity = 4, reorder_level = 8
WHERE sku = 'AUD001';

UPDATE products
SET quantity = 5, reorder_level = 10
WHERE sku = 'POW001';

UPDATE products
SET quantity = 3, reorder_level = 8
WHERE sku = 'CAB003';
