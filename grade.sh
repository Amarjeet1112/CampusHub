#!/usr/bin/env bash
# ==============================================================================
# CampusHub Grading and Compliance Verification Script
# Validates all Docker Compose, security, architecture, and Dockerfile requirements
# ==============================================================================

set -o pipefail

# ANSI Color Codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PASSED_CHECKS=0
FAILED_CHECKS=0
TOTAL_CHECKS=0

pass() {
  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  PASSED_CHECKS=$((PASSED_CHECKS + 1))
  echo -e "  [${GREEN}PASS${NC}] $1"
}

fail() {
  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  FAILED_CHECKS=$((FAILED_CHECKS + 1))
  echo -e "  [${RED}FAIL${NC}] $1"
}

info() {
  echo -e "\n${BLUE}=== $1 ===${NC}"
}

echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN}   CampusHub Exam Specification Auto-Grader       ${NC}"
echo -e "${CYAN}====================================================${NC}"

# 1. Compose file exists
info "1. Verifying Docker Compose Configuration"
if [ -f "docker-compose.yml" ] || [ -f "docker-compose.yaml" ]; then
  pass "docker-compose.yml file is present in project root"
else
  fail "docker-compose.yml is missing"
fi

# 2. Required 9 Services exist in Compose
info "2. Verifying Required Services (Exactly 9 Services)"
REQUIRED_SERVICES=("gateway" "frontend" "api" "worker" "postgres" "redis" "rabbitmq" "minio" "mailhog")
COMPOSE_FILE="docker-compose.yml"
[ -f "docker-compose.yaml" ] && COMPOSE_FILE="docker-compose.yaml"

for s in "${REQUIRED_SERVICES[@]}"; do
  if grep -E "^  ${s}:" "$COMPOSE_FILE" > /dev/null 2>&1; then
    pass "Service '${s}' defined in $COMPOSE_FILE"
  else
    fail "Service '${s}' is NOT defined in $COMPOSE_FILE"
  fi
done

# 3. Dockerfiles exist
info "3. Verifying Dockerfiles"
if [ -f "app/frontend/Dockerfile" ]; then
  pass "Frontend Dockerfile exists (app/frontend/Dockerfile)"
else
  fail "Frontend Dockerfile missing"
fi

if [ -f "app/api/Dockerfile" ]; then
  pass "API & Worker single shared Dockerfile exists (app/api/Dockerfile)"
else
  fail "API Dockerfile missing"
fi

if [ -f "gateway/Dockerfile" ]; then
  pass "Gateway Dockerfile exists (gateway/Dockerfile)"
else
  fail "Gateway Dockerfile missing"
fi

# 4. .dockerignore files exist
info "4. Verifying .dockerignore Files"
if [ -f ".dockerignore" ]; then
  pass "Root .dockerignore exists"
else
  fail "Root .dockerignore missing"
fi

if [ -f "app/frontend/.dockerignore" ]; then
  pass "Frontend .dockerignore exists"
else
  fail "Frontend .dockerignore missing"
fi

if [ -f "app/api/.dockerignore" ]; then
  pass "API .dockerignore exists"
else
  fail "API .dockerignore missing"
fi

if [ -f "gateway/.dockerignore" ]; then
  pass "Gateway .dockerignore exists"
else
  fail "Gateway .dockerignore missing"
fi

# 5. Networks exist
info "5. Verifying Network Segmentation"
for net in "frontend" "backend" "data"; do
  if grep -E "^  ${net}:" "$COMPOSE_FILE" > /dev/null 2>&1; then
    pass "Network '${net}' declared in $COMPOSE_FILE"
  else
    fail "Network '${net}' missing from $COMPOSE_FILE"
  fi
done

# 6. Named Volumes exist
info "6. Verifying Named Volumes"
for vol in "postgres_data" "minio_data"; do
  if grep -E "^  ${vol}:" "$COMPOSE_FILE" > /dev/null 2>&1; then
    pass "Named volume '${vol}' declared in $COMPOSE_FILE"
  else
    fail "Named volume '${vol}' missing from $COMPOSE_FILE"
  fi
done

# 7. Healthchecks exist
info "7. Verifying Healthchecks & Worker Override"
if grep -A 30 "^  postgres:" "$COMPOSE_FILE" | grep -q "healthcheck:"; then
  pass "PostgreSQL has a healthcheck defined"
else
  fail "PostgreSQL healthcheck missing"
fi

if grep -A 30 "^  redis:" "$COMPOSE_FILE" | grep -q "healthcheck:"; then
  pass "Redis has a healthcheck defined"
else
  fail "Redis healthcheck missing"
fi

if grep -A 30 "^  rabbitmq:" "$COMPOSE_FILE" | grep -q "healthcheck:"; then
  pass "RabbitMQ has a healthcheck defined"
else
  fail "RabbitMQ healthcheck missing"
fi

if grep -A 30 "^  minio:" "$COMPOSE_FILE" | grep -q "healthcheck:"; then
  pass "MinIO has a healthcheck defined"
else
  fail "MinIO healthcheck missing"
fi

if grep -A 30 "^  worker:" "$COMPOSE_FILE" | grep -q "disable: true"; then
  pass "Worker properly disables unsuitable inherited API healthcheck"
else
  fail "Worker does not have 'healthcheck: disable: true'"
fi

# 8. No obvious hardcoded secrets in compose or code
info "8. Verifying Secrets & Environment Variable Usage"
if [ -f ".env.example" ]; then
  pass ".env.example exists with placeholder parameters"
else
  fail ".env.example is missing"
fi

if grep -q "\.env" ".gitignore"; then
  pass ".env is safely ignored in .gitignore"
else
  fail ".env is NOT listed in .gitignore"
fi

if grep -q "\.env" ".dockerignore"; then
  pass ".env is excluded in root .dockerignore"
else
  fail ".env is NOT listed in root .dockerignore"
fi

if grep -iE 'password: "[a-zA-Z0-9_-]+"' "$COMPOSE_FILE" | grep -v '\${' > /dev/null 2>&1; then
  fail "Hardcoded plain password found in $COMPOSE_FILE without \${VAR} interpolation"
else
  pass "No raw hardcoded passwords found in $COMPOSE_FILE (environment variables utilized)"
fi

# 9. Required Ports and Security Isolation
info "9. Verifying Port Security and Interface Binding"
# Gateway port should be published
if grep -A 8 "gateway:" "$COMPOSE_FILE" | grep -q "8080"; then
  pass "Gateway exposes ingress port"
else
  fail "Gateway port mapping missing"
fi

# Check that internal stateful services are NOT exposed to 0.0.0.0
for internal_svc in "postgres" "redis"; do
  if grep -A 8 "^  ${internal_svc}:" "$COMPOSE_FILE" | grep -q "ports:"; then
    fail "Service '${internal_svc}' exposes ports on public interfaces (should be internal only)"
  else
    pass "Service '${internal_svc}' is not directly exposed on host ports"
  fi
done

# Check that management UIs are loopback bound (127.0.0.1)
for debug_svc in "mailhog" "rabbitmq" "minio"; do
  if grep -A 25 "^  ${debug_svc}:" "$COMPOSE_FILE" | grep -A 4 "ports:" | grep -q "127.0.0.1"; then
    pass "Service '${debug_svc}' debug/console port is safely restricted to 127.0.0.1"
  else
    fail "Service '${debug_svc}' is not bound to 127.0.0.1"
  fi
done

# 10. Non-root Configuration
info "10. Verifying Non-Root Configuration"
if grep -q "USER nginx" "app/frontend/Dockerfile"; then
  pass "Frontend Dockerfile specifies non-root user (USER nginx)"
else
  fail "Frontend Dockerfile does not enforce non-root user"
fi

if grep -q "USER node" "app/api/Dockerfile"; then
  pass "API Dockerfile specifies non-root user (USER node)"
else
  fail "API Dockerfile does not enforce non-root user"
fi

if grep -q "USER nginx" "gateway/Dockerfile"; then
  pass "Gateway Dockerfile specifies non-root user (USER nginx)"
else
  fail "Gateway Dockerfile does not enforce non-root user"
fi

# 11. Resource Limits & Restart Policies
info "11. Verifying Resource Limits & Restart Policies"
SVC_COUNT=$(grep -c "restart: unless-stopped" "$COMPOSE_FILE" || true)
if [ "$SVC_COUNT" -ge 9 ]; then
  pass "All 9 services have restart: unless-stopped configured"
else
  fail "Not all services have restart policy defined (found $SVC_COUNT/9)"
fi

LIMITS_COUNT=$(grep -c "limits:" "$COMPOSE_FILE" || true)
if [ "$LIMITS_COUNT" -ge 9 ]; then
  pass "All 9 services have CPU and Memory limits defined"
else
  fail "Not all services have resource limits defined (found $LIMITS_COUNT/9)"
fi

# 12. API Image Size (if built locally)
info "12. Checking API Image Size (if present)"
if command -v docker > /dev/null 2>&1; then
  IMAGE_SIZE_BYTES=$(docker inspect --format='{{.Size}}' campushub-api:latest 2>/dev/null || true)
  if [ -n "$IMAGE_SIZE_BYTES" ]; then
    IMAGE_SIZE_MB=$((IMAGE_SIZE_BYTES / 1024 / 1024))
    if [ "$IMAGE_SIZE_MB" -lt 250 ]; then
      pass "campushub-api:latest image size is ${IMAGE_SIZE_MB}MB (< 250MB threshold)"
    else
      fail "campushub-api:latest image size is ${IMAGE_SIZE_MB}MB (exceeds 250MB threshold)"
    fi
  else
    echo -e "  [${YELLOW}INFO${NC}] Image campushub-api:latest not yet built locally (build to verify size)"
  fi
fi

# Final Summary
echo -e "\n${CYAN}====================================================${NC}"
echo -e "${CYAN}                 Grading Summary                   ${NC}"
echo -e "${CYAN}====================================================${NC}"
echo -e "Total Checks:  ${TOTAL_CHECKS}"
echo -e "Passed Checks: ${GREEN}${PASSED_CHECKS}${NC}"
echo -e "Failed Checks: ${RED}${FAILED_CHECKS}${NC}"

if [ "$FAILED_CHECKS" -eq 0 ]; then
  echo -e "\n${GREEN}🎉 EXCELLENT! 100% of the tested exam specifications PASSED!${NC}\n"
  exit 0
else
  echo -e "\n${RED}⚠️ Some specifications require attention. Review the FAIL logs above.${NC}\n"
  exit 1
fi
