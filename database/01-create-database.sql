-- Run as the PostgreSQL superuser (for example: postgres)
-- Command:
-- psql -U postgres -d postgres -f database/01-create-database.sql

SELECT 'CREATE DATABASE inventory_db
    WITH OWNER = postgres
    ENCODING = ''UTF8''
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1
    IS_TEMPLATE = False'
WHERE NOT EXISTS (
    SELECT FROM pg_database WHERE datname = 'inventory_db'
)\gexec
