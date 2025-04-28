#!/bin/bash
# db-password-rotation.sh - Enterprise-grade database password rotation
# Supports both PostgreSQL and Supabase database platforms

set -eo pipefail # Exit immediately on error

# --- Configuration (Read from Environment Variables) ---
DB_HOST_TYPE="${DB_HOST_TYPE:-postgres}" # Set to 'supabase' or 'postgres'
DB_USER="${DB_SECRET_USERNAME}"
DB_NAME="${DB_SECRET_DBNAME}"
DB_HOST="${DB_SECRET_HOST}"
DB_PORT="${DB_SECRET_PORT:-5432}"
DB_CURRENT_PASSWORD="${DB_SECRET_PASSWORD}"

# Supabase-specific configuration
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF}"
SUPABASE_API_KEY="${SUPABASE_MANAGEMENT_API_KEY}"

# AWS Secrets Manager configuration (if using)
USE_AWS_SECRETS="${USE_AWS_SECRETS:-false}"
AWS_SECRET_ID="${AWS_SECRET_ID:-/dynagendashv1/production/db-credentials}"
AWS_REGION="${AWS_REGION:-us-east-1}"

# CI/CD platform secrets integration
CICD_PLATFORM="${CICD_PLATFORM:-github}" # github, gitlab, azure, etc.
CICD_SECRET_NAME="${CICD_SECRET_NAME:-DB_SECRET_PASSWORD}"

# Logging configuration
LOG_FILE="${LOG_FILE:-/tmp/db-password-rotation.log}"
NOTIFICATION_WEBHOOK="${SLACK_WEBHOOK_URL:-}"

# --- Helper Functions ---
log() {
  local level="$1"
  local message="$2"
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

notify() {
  local message="$1"
  local status="$2" # success or failure
  
  log "INFO" "Sending notification: $status - $message"
  
  if [[ -n "$NOTIFICATION_WEBHOOK" ]]; then
    local color="good"
    [[ "$status" == "failure" ]] && color="danger"
    
    curl -s -X POST -H "Content-type: application/json" \
      --data "{\"attachments\":[{\"color\":\"$color\",\"title\":\"Database Password Rotation\",\"text\":\"$message\"}]}" \
      "$NOTIFICATION_WEBHOOK" || log "WARN" "Failed to send notification"
  fi
}

generate_secure_password() {
  # Generate a secure random password with high entropy
  # Ensures password meets typical database complexity requirements
  local password=""
  
  # First attempt with OpenSSL (most secure)
  if command -v openssl &> /dev/null; then
    password=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9!@#$%^&*()-_=+' | head -c 32)
  # Fallback to /dev/urandom
  elif [ -e /dev/urandom ]; then
    password=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9!@#$%^&*()-_=+' | head -c 32)
  # Last resort with less entropy
  else
    # Generate with bash $RANDOM
    for i in {1..32}; do
      random_char=$(printf "%s" "${RANDOM: -1}")
      chars="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+"
      password="${password}${chars:${random_char}:1}"
    done
  fi
  
  # Ensure password meets complexity requirements
  # At least: 1 uppercase, 1 lowercase, 1 digit, 1 special char
  if ! [[ "$password" =~ [A-Z] && "$password" =~ [a-z] && "$password" =~ [0-9] && "$password" =~ [!@#\$%^\&*\(\)_+\-=] ]]; then
    # Add required character types if missing
    [[ ! "$password" =~ [A-Z] ]] && password="${password:0:28}A"
    [[ ! "$password" =~ [a-z] ]] && password="${password:0:29}a"
    [[ ! "$password" =~ [0-9] ]] && password="${password:0:30}1"
    [[ ! "$password" =~ [!@#\$%^\&*\(\)_+\-=] ]] && password="${password:0:31}!"
  fi
  
  # Ensure password contains no SQL special characters that could cause issues
  password=$(echo "$password" | tr -d "\"';\\")
  
  # Validate password length
  if [[ ${#password} -lt 16 ]]; then
    log "ERROR" "Generated password is too short (${#password} chars)"
    return 1
  fi
  
  echo "$password"
}

update_aws_secret() {
  local secret_id="$1"
  local new_password="$2"
  
  log "INFO" "Updating AWS Secrets Manager secret: $secret_id"
  
  # Get current secret value
  local current_secret=$(aws secretsmanager get-secret-value \
    --secret-id "$secret_id" \
    --region "$AWS_REGION" \
    --query 'SecretString' \
    --output text)
  
  # Update JSON with new password
  local updated_secret=$(echo "$current_secret" | jq --arg pwd "$new_password" '.password = $pwd')
  
  # Put updated secret
  aws secretsmanager put-secret-value \
    --secret-id "$secret_id" \
    --secret-string "$updated_secret" \
    --region "$AWS_REGION" || return 1
    
  log "INFO" "AWS Secrets Manager secret updated successfully"
  return 0
}

update_cicd_secret() {
  local platform="$1"
  local secret_name="$2"
  local new_password="$3"
  
  log "INFO" "Updating $platform secret: $secret_name"
  
  case "$platform" in
    github)
      # Check if GitHub CLI is available
      if command -v gh &> /dev/null; then
        # Assumes GitHub CLI is authenticated
        echo "$new_password" | gh secret set "$secret_name" || return 1
      else
        log "WARN" "GitHub CLI not available. Manual update required."
        echo "Manual step: Update GitHub secret $secret_name with new password"
        return 0
      fi
      ;;
    gitlab)
      # Check if GitLab CLI is available
      if command -v glab &> /dev/null; then
        # Assumes GitLab CLI is authenticated
        glab variable set "$secret_name" "$new_password" --scope project --masked || return 1
      else
        log "WARN" "GitLab CLI not available. Manual update required."
        echo "Manual step: Update GitLab variable $secret_name with new password"
        return 0
      fi
      ;;
    azure)
      # Check if Azure CLI is available
      if command -v az &> /dev/null; then
        # Assumes Azure CLI is authenticated and variables set for pipeline
        local pipeline_id="${AZURE_PIPELINE_ID}"
        local org="${AZURE_ORGANIZATION}"
        local project="${AZURE_PROJECT}"
        
        az pipelines variable update --pipeline-id "$pipeline_id" \
          --org "$org" --project "$project" \
          --name "$secret_name" --value "$new_password" --secret || return 1
      else
        log "WARN" "Azure CLI not available. Manual update required."
        echo "Manual step: Update Azure DevOps variable $secret_name with new password"
        return 0
      fi
      ;;
    *)
      log "WARN" "Unsupported CI/CD platform: $platform. Manual update required."
      echo "Manual step: Update $secret_name in your CI/CD platform with new password"
      return 0
      ;;
  esac
  
  log "INFO" "CI/CD secret updated successfully"
  return 0
}

test_postgres_connection() {
  local host="$1"
  local port="$2"
  local user="$3"
  local password="$4"
  local dbname="$5"
  
  export PGPASSWORD="$password"
  psql -h "$host" -p "$port" -U "$user" -d "$dbname" -c "SELECT 1 AS connection_test;" &> /dev/null
  local result=$?
  unset PGPASSWORD
  
  return $result
}

# --- Main Execution ---
log "INFO" "Starting database password rotation for $DB_HOST_TYPE"

# Verify required variables
if [[ -z "$DB_USER" || -z "$DB_NAME" || -z "$DB_HOST" || -z "$DB_CURRENT_PASSWORD" ]]; then
  log "ERROR" "Missing required database configuration variables"
  notify "Password rotation failed: Missing required configuration" "failure"
  exit 1
fi

if [[ "$DB_HOST_TYPE" == "supabase" && (-z "$SUPABASE_PROJECT_REF" || -z "$SUPABASE_API_KEY") ]]; then
  log "ERROR" "Missing required Supabase configuration variables"
  notify "Password rotation failed: Missing Supabase configuration" "failure"
  exit 1
fi

# Generate new secure password
log "INFO" "Generating new secure password"
NEW_PASSWORD=$(generate_secure_password)
if [[ -z "$NEW_PASSWORD" ]]; then
  log "ERROR" "Failed to generate secure password"
  notify "Password rotation failed: Could not generate secure password" "failure"
  exit 1
fi
log "INFO" "New password generated successfully"

# Create backup - best practice before critical operations
if [[ "$DB_HOST_TYPE" == "postgres" ]]; then
  log "INFO" "Creating database backup before password rotation"
  BACKUP_DATE=$(date +"%Y%m%d%H%M%S")
  BACKUP_FILE="/tmp/db_backup_${DB_NAME}_${BACKUP_DATE}.sql"
  
  export PGPASSWORD="$DB_CURRENT_PASSWORD"
  if ! pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$BACKUP_FILE"; then
    log "WARN" "Failed to create backup. Proceeding with rotation anyway."
  else
    log "INFO" "Backup created successfully: $BACKUP_FILE"
    
    # Optionally upload backup to secure storage
    if command -v aws &> /dev/null; then
      aws s3 cp "$BACKUP_FILE" "s3://dynagen-db-backups/rotation-backups/$(basename "$BACKUP_FILE")" && \
        log "INFO" "Backup uploaded to S3" || log "WARN" "Failed to upload backup to S3"
    fi
  fi
  unset PGPASSWORD
fi

# Perform password rotation based on database type
ROTATION_SUCCESS=false
if [[ "$DB_HOST_TYPE" == "supabase" ]]; then
  log "INFO" "Rotating password via Supabase Management API"
  
  # Using Supabase Management API
  API_ENDPOINT="https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/db/password"
  
  # Escape any special characters in the password
  ESCAPED_PASSWORD=$(echo "$NEW_PASSWORD" | jq -sR .)
  PAYLOAD="{\"password\":${ESCAPED_PASSWORD}}"
  
  # Make API request with retries
  MAX_RETRIES=3
  RETRY_COUNT=0
  
  while [[ $RETRY_COUNT -lt $MAX_RETRIES ]]; do
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
      -H "Authorization: Bearer ${SUPABASE_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD" \
      "$API_ENDPOINT")
    
    HTTP_BODY=$(echo "$RESPONSE" | head -n 1)
    HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
    
    if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 300 ]]; then
      log "INFO" "Supabase API call successful (HTTP $HTTP_CODE)"
      ROTATION_SUCCESS=true
      break
    else
      log "WARN" "Supabase API call failed with HTTP status $HTTP_CODE: $HTTP_BODY"
      RETRY_COUNT=$((RETRY_COUNT + 1))
      
      if [[ $RETRY_COUNT -lt $MAX_RETRIES ]]; then
        log "INFO" "Retrying in 5 seconds... (Attempt $RETRY_COUNT of $MAX_RETRIES)"
        sleep 5
      fi
    fi
  done
  
  if [[ "$ROTATION_SUCCESS" != "true" ]]; then
    log "ERROR" "Failed to rotate password via Supabase API after $MAX_RETRIES attempts"
    notify "Password rotation failed: Supabase API error" "failure"
    exit 1
  fi
  
elif [[ "$DB_HOST_TYPE" == "postgres" ]]; then
  log "INFO" "Rotating password via direct PostgreSQL command"
  
  export PGPASSWORD="$DB_CURRENT_PASSWORD"
  
  # Properly escape the username and password for SQL
  # This is better than using string interpolation directly
  PSQL_COMMAND="ALTER USER \"$DB_USER\" WITH PASSWORD '$NEW_PASSWORD';"
  
  if echo "$PSQL_COMMAND" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"; then
    log "INFO" "SQL command executed successfully"
    ROTATION_SUCCESS=true
  else
    log "ERROR" "Failed to execute SQL command"
    unset PGPASSWORD
    notify "Password rotation failed: SQL command execution error" "failure"
    exit 1
  fi
  
  unset PGPASSWORD
else
  log "ERROR" "Invalid DB_HOST_TYPE specified: $DB_HOST_TYPE. Must be 'supabase' or 'postgres'."
  notify "Password rotation failed: Invalid database type" "failure"
  exit 1
fi

# Verify new password works
log "INFO" "Verifying new password connection"

# Small delay to ensure password change is propagated
sleep 5

if test_postgres_connection "$DB_HOST" "$DB_PORT" "$DB_USER" "$NEW_PASSWORD" "$DB_NAME"; then
  log "INFO" "New password verification successful"
else
  log "ERROR" "New password verification failed. Password may not be active yet."
  notify "Password rotation warning: New password verification failed" "failure"
  # We don't exit here as the password might still be propagating in some systems
fi

# Update secrets in external systems
if [[ "$USE_AWS_SECRETS" == "true" && -n "$AWS_SECRET_ID" ]]; then
  log "INFO" "Updating password in AWS Secrets Manager"
  if ! update_aws_secret "$AWS_SECRET_ID" "$NEW_PASSWORD"; then
    log "ERROR" "Failed to update AWS Secrets Manager"
    notify "Password rotation partial failure: AWS Secrets Manager update failed" "failure"
    # Continue with other updates despite this failure
  fi
fi

# Update CI/CD platform secrets
if [[ -n "$CICD_PLATFORM" && -n "$CICD_SECRET_NAME" ]]; then
  log "INFO" "Updating password in CI/CD platform: $CICD_PLATFORM"
  if ! update_cicd_secret "$CICD_PLATFORM" "$CICD_SECRET_NAME" "$NEW_PASSWORD"; then
    log "WARN" "CI/CD secret update automation failed, manual update may be required"
    echo "IMPORTANT: Update $CICD_SECRET_NAME in your $CICD_PLATFORM environment with the new password"
    echo "$NEW_PASSWORD" > /tmp/new_db_password.txt
    log "INFO" "New password saved to /tmp/new_db_password.txt for manual update"
  fi
fi

# Successfully completed
log "INFO" "Password rotation completed successfully"
notify "Database password rotation completed successfully" "success"
exit 0
