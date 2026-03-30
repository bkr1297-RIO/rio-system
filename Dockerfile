# RIO Protocol: Production Gateway (v1.0)
# Lane: DevOps / Deployment
# Status: DRAFT (Pending PR Approval)

FROM python:3.11-slim

# 1. System Dependencies
RUN apt-get update && apt-get install -y libpq-dev gcc curl

# 2. Working Directory
WORKDIR /app

# 3. Python Dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Application Code
COPY . .

# 5. Environment Defaults (Fail-Closed)
ENV PORT=8000
ENV DATABASE_URL=""
ENV AZURE_VAULT_URL=""
ENV SOVEREIGN_EMAIL=""

# 6. Execution
EXPOSE 8000
CMD ["uvicorn", "backend.execution_gate:app", "--host", "0.0.0.0", "--port", "8000"]
