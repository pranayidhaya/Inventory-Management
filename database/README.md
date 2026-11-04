# Database setup

This folder contains the PostgreSQL setup files for the inventory management system.

1. Run `01-create-database.sql` as a PostgreSQL superuser.
2. Run `02-create-tables.sql` inside `inventory_db`.
3. Run `03-seed-data.sql` inside `inventory_db` to populate the sample products.

The database name is `inventory_db`.
The application expects the `products` and `stock_transactions` tables to exist before the server starts.

The default local setup uses the `postgres` user for a simple college-project deployment. For a production-style setup, create a dedicated application user and update the backend environment variables accordingly.

Do not commit real database credentials to version control. Use environment variables instead.
