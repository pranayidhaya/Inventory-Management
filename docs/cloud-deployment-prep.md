# Phase 6: Cloud deployment preparation

This project is prepared for a simple, low-cost AWS deployment model:

- Frontend: AWS S3 static hosting
- Backend: AWS EC2 instance running Node.js + Express
- Database: PostgreSQL on the same EC2 instance or a private PostgreSQL service

## Architecture summary

```text
Browser
  -> S3 static frontend
  -> EC2 backend API
  -> PostgreSQL on EC2
```

## AWS deployment readiness checklist

### 1. Frontend configuration

- Use a production build from the React client.
- Set the frontend API base URL to the EC2 backend URL or private load balancer URL.
- Keep the frontend free of secrets.
- Example client environment variable:

  VITE_API_URL=http://<EC2_PUBLIC_IP>:3000

### 2. Backend configuration

The backend already reads runtime config from environment variables and does not hardcode database credentials.

Required server variables:

- DB_HOST
- DB_PORT
- DB_NAME
- DB_USER
- DB_PASSWORD
- HOST
- PORT
- CORS_ORIGIN

Example values:

```env
HOST=0.0.0.0
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=inventory_db
DB_USER=postgres
DB_PASSWORD=your_secure_password
CORS_ORIGIN=http://<S3_BUCKET_URL>
```

Important:
- Do not expose PostgreSQL port 5432 publicly.
- Use localhost or private networking for the database when both backend and database are on the same EC2 instance.
- Set CORS to the exact frontend origin instead of using a wildcard.

### 3. Security and networking

- Keep PostgreSQL only on private/internal access when possible.
- Use `scram-sha-256` authentication for PostgreSQL.
- Do not open 5432 to the internet.
- Use EC2 security groups to allow only the needed ports.
- Keep SSH access restricted to trusted IPs.

### 4. Database readiness

Before deployment, verify the schema exists:

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

The expected tables are:

- products
- stock_transactions

### 5. Production build for frontend

Run from the client folder:

```powershell
cd inventory-stock-alert-system\client
npm install
npm run build
```

The generated files in `client/dist` are suitable for upload to AWS S3.

### 6. Production start for backend

Run from the server folder:

```powershell
cd inventory-stock-alert-system\server
npm install
$env:DB_HOST='localhost'
$env:DB_PORT='5432'
$env:DB_NAME='inventory_db'
$env:DB_USER='postgres'
$env:DB_PASSWORD='your_secure_password'
$env:HOST='0.0.0.0'
$env:PORT='3000'
$env:CORS_ORIGIN='http://<S3_BUCKET_URL>'
node index.js
```

### 7. Deployment logic for AWS

- Upload frontend files to an S3 bucket configured for static website hosting.
- Create an EC2 instance with Node.js and PostgreSQL installed.
- Upload the backend project files to the EC2 instance.
- Configure environment variables on the EC2 instance.
- Start the backend and validate the health endpoint.

### 8. Project files to keep for deployment

- [server/index.js](../server/index.js)
- [server/package.json](../server/package.json)
- [server/.env.example](../server/.env.example)
- [client/package.json](../client/package.json)
- [client/.env.example](../client/.env.example)
- [database/02-create-tables.sql](../database/02-create-tables.sql)

## Cloud deployment notes

This architecture is intentionally simple and affordable for a college cloud computing project because:

- S3 is cheap and efficient for static frontend hosting.
- EC2 gives a full backend environment without unnecessary complexity.
- PostgreSQL runs locally on EC2 to avoid requiring a separate managed database in this project phase.

This is suitable for a final-year assessment as it demonstrates core cloud concepts such as:

- frontend hosting on S3
- backend hosting on EC2
- database connectivity and security
- environment variables and configuration management
- CORS and origin restrictions
- private networking and security group rules

## Deployment caution

Do not:

- expose PostgreSQL publicly on port 5432
- store secrets in the frontend build
- use wildcard CORS
- create extra AWS resources beyond the required S3 and EC2 setup
- delete existing AWS resources without permission
