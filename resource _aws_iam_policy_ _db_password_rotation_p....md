Okay, here is the final, unified set of code incorporating the latest security fixes and optimizations, ready for copy-pasting.  
---

**1\. Main Rotation Script (scripts/db-password-rotation.sh)**

Bash

\#\!/bin/bash  
\# db-password-rotation.sh \- Enterprise-grade database password rotation  
\# Supports both PostgreSQL and Supabase database platforms

\# Strict mode: Exit on error, treat unset variables as errors, handle pipe failures  
set \-euo pipefail

\# \--- Configuration (Read from Environment Variables) \---  
DB\_HOST\_TYPE="${DB\_HOST\_TYPE:-postgres}" \# 'supabase' or 'postgres'  
DB\_USER="${DB\_SECRET\_USERNAME}"  
DB\_NAME="${DB\_SECRET\_DBNAME}"  
DB\_HOST="${DB\_SECRET\_HOST}"  
DB\_PORT="${DB\_SECRET\_PORT:-5432}"  
DB\_CURRENT\_PASSWORD="${DB\_SECRET\_PASSWORD}"

\# Supabase-specific configuration  
SUPABASE\_PROJECT\_REF="${SUPABASE\_PROJECT\_REF}"  
SUPABASE\_API\_KEY="${SUPABASE\_MANAGEMENT\_API\_KEY}"

\# AWS Secrets Manager configuration (if using within Lambda)  
USE\_AWS\_SECRETS="${USE\_AWS\_SECRETS:-false}"  
AWS\_SECRET\_ID="${AWS\_SECRET\_ID:-/dynagendashv1/production/db-credentials}" \# Example secret ID  
AWS\_REGION="${AWS\_REGION:-us-east-1}"  
\# Optional: Secret ID for Supabase API Key if stored separately  
SUPABASE\_API\_KEY\_SECRET\_ID="${SUPABASE\_API\_KEY\_SECRET\_ID:-}"

\# CI/CD platform secrets integration  
CICD\_PLATFORM="${CICD\_PLATFORM:-github}" \# github, gitlab, azure, etc.  
CICD\_SECRET\_NAME="${CICD\_SECRET\_NAME:-DB\_SECRET\_PASSWORD}" \# Name of the password secret in CI/CD  
\# Specific CI/CD Env Vars (e.g., for GitHub)  
GITHUB\_ENV\_NAME="${GITHUB\_ENV\_NAME:-${ENVIRONMENT:-default}}" \# Target GitHub Environment Name

\# Backup configuration  
ENABLE\_BACKUP="${ENABLE\_BACKUP:-true}" \# Set to false to disable backups  
BACKUP\_BUCKET="${BACKUP\_BUCKET:-dynagen-db-backups}" \# S3 bucket for backups  
BACKUP\_PATH\_PREFIX="${BACKUP\_PATH\_PREFIX:-rotation-backups}" \# Path within the bucket

\# Logging and Notification configuration  
LOG\_FILE="${LOG\_FILE:-/tmp/db-password-rotation.log}"  
NOTIFICATION\_WEBHOOK="${SLACK\_WEBHOOK\_URL:-}" \# Slack webhook URL  
PYTHON\_HELPER\_SCRIPT\_PATH="${PYTHON\_HELPER\_SCRIPT\_PATH:-./secure\_alter\_password.py}" \# Path to Python helper

\# \--- Helper Functions \---

\# Logs messages with timestamp and level  
log() {  
  local level="$1"  
  local message="$2"  
  local timestamp=$(date \-u \+"%Y-%m-%dT%H:%M:%SZ")  
  echo "\[$timestamp\] \[$level\] $message" | tee \-a "$LOG\_FILE"  
}

\# Sends notifications (currently Slack)  
notify() {  
  local message="$1"  
  local status="$2" \# success or failure

  log "INFO" "Sending notification: $status \- $message"

  if \[\[ \-n "$NOTIFICATION\_WEBHOOK" \]\]; then  
    local color="good"  
    local icon=":white\_check\_mark:"  
    \[\[ "$status" \== "failure" \]\] && color="danger" && icon=":x:"

    \# Escape JSON special characters in the message  
    local escaped\_message=$(echo "$message" | sed 's/\\\\/\\\\\\\\/g' | sed 's/"/\\\\"/g' | sed ':a;N;$\!ba;s/\\n/\\\\n/g')

    local payload="{\\"attachments\\":\[{\\"color\\":\\"$color\\",\\"title\\":\\"$icon Database Password Rotation\\",\\"text\\":\\"$escaped\_message\\"}\]}"

    if \! curl \-s \-X POST \-H "Content-type: application/json" \--data "$payload" "$NOTIFICATION\_WEBHOOK"; then  
       log "WARN" "Failed to send Slack notification."  
    fi  
  fi  
}

\# Generates a secure random password meeting complexity requirements (Improved version)  
generate\_secure\_password() {  
  local length=32  
  local attempts=0  
  local max\_attempts=10  
  local password=""

  log "DEBUG" "Generating password (length: $length, max\_attempts: $max\_attempts)"

  \# Keep generating until we get a password that meets all requirements  
  while \[\[ $attempts \-lt $max\_attempts \]\]; do  
    attempts=$((attempts \+ 1))  
    log "DEBUG" "Password generation attempt: $attempts"

    \# Generate base password with OpenSSL (preferred method)  
    if command \-v openssl &\> /dev/null; then  
      \# Increased base64 length for better chance of getting all chars  
      password=$(openssl rand \-base64 48 | tr \-dc 'a-zA-Z0-9\!@\#$%^&\*()-\_=+' | head \-c $length)  
    \# Fallback to /dev/urandom  
    elif \[\[ \-e /dev/urandom \]\]; then  
      password=$(cat /dev/urandom | tr \-dc 'a-zA-Z0-9\!@\#$%^&\*()-\_=+' | head \-c $length)  
    \# Last resort with less entropy using $RANDOM (not recommended for high security)  
    else  
       log "WARN" "Using less secure \\$RANDOM for password generation (openssl or /dev/urandom preferred)."  
      local chars="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\!@\#$%^&\*()-\_=+"  
      password=""  
      for i in $(seq 1 $length); do  
        password="${password}${chars:$(( RANDOM % ${\#chars} )):1}"  
      done  
    fi

    log "DEBUG" "Generated candidate password (attempt $attempts)"

    \# Check if password meets all complexity requirements and avoids problematic chars  
    \# Requirements: 1 uppercase, 1 lowercase, 1 digit, 1 special char from the allowed set  
    \# Excluded chars: ' " ; \\ \`  
    if \[\[ "$password" \=\~ \[A-Z\] && "$password" \=\~ \[a-z\] && \\  
          "$password" \=\~ \[0-9\] && "$password" \=\~ \[-\!@\#$%^&\*()\_=+\] && \\  
          \! "$password" \=\~ \[\\'\\"\\;\\\\\\\`\] \]\]; then  
       log "DEBUG" "Password meets complexity and character requirements on attempt $attempts."  
      break \# Password is good  
    fi

    \# If we've reached max attempts, force complexity  
    if \[\[ $attempts \-eq $max\_attempts \]\]; then  
      log "WARN" "Failed to generate a naturally complex password after $max\_attempts attempts, enforcing complexity."

      \# Start with a simple base of random alphanumeric characters  
      password=$(openssl rand \-base64 24 | tr \-dc 'a-zA-Z0-9' | head \-c $((length-4)) )  
      \# Explicitly add required character types  
      password="${password}A1\!-" \# Add one of each required type  
      \# Shuffle the password to mix the added characters (requires bash 4+)  
      if \[\[ ${BASH\_VERSINFO\[0\]} \-ge 4 \]\]; then  
         password=$(echo "$password" | fold \-w1 | shuf | tr \-d '\\n')  
         log "DEBUG" "Manually constructed and shuffled password."  
      else  
         log "WARN" "Bash version \< 4, cannot shuffle manually constructed password."  
      fi  
    fi  
  done \# End while loop

  \# Final length validation  
  if \[\[ ${\#password} \-lt 16 \]\]; then  
    log "ERROR" "Final generated password is too short (${\#password} chars). Cannot proceed."  
    return 1  
  fi

  echo "$password"  
  return 0  
}

\# Updates a secret in AWS Secrets Manager  
update\_aws\_secret() {  
  local secret\_id="$1"  
  local new\_password="$2"

  log "INFO" "Attempting to update AWS Secrets Manager secret: $secret\_id"

  if \! command \-v aws &\> /dev/null; then  
      log "ERROR" "AWS CLI command not found. Cannot update AWS Secret."  
      return 1  
  fi  
  if \! command \-v jq &\> /dev/null; then  
      log "ERROR" "jq command not found. Cannot update AWS Secret JSON."  
      return 1  
  fi

  local current\_secret  
  \# Capture stderr to check for errors  
  if \! current\_secret=$(aws secretsmanager get-secret-value \--secret-id "$secret\_id" \--region "$AWS\_REGION" \--query 'SecretString' \--output text 2\> /dev/null); then  
      log "ERROR" "Failed to retrieve current secret value from AWS Secrets Manager (Secret ID: $secret\_id). Check permissions and secret existence."  
      return 1  
  fi

  \# Update JSON safely using jq  
  local updated\_secret  
  if \! updated\_secret=$(echo "$current\_secret" | jq \--arg pwd "$new\_password" '.password \= $pwd'); then  
      log "ERROR" "Failed to update secret JSON structure using jq."  
      return 1  
  fi

  \# Put updated secret  
  if \! aws secretsmanager put-secret-value \--secret-id "$secret\_id" \--secret-string "$updated\_secret" \--region "$AWS\_REGION"; then  
      log "ERROR" "Failed to put updated secret value to AWS Secrets Manager."  
      return 1  
  fi

  log "INFO" "AWS Secrets Manager secret updated successfully."  
  return 0  
}

\# Updates a secret in the specified CI/CD platform  
update\_cicd\_secret() {  
  local platform="$1"  
  local secret\_name="$2"  
  local new\_password="$3"

  log "INFO" "Attempting to update $platform secret: $secret\_name"

  case "$platform" in  
    github)  
      if command \-v gh &\> /dev/null; then  
        \# Check permissions by trying to list secrets (requires 'secrets' scope/permission)  
        if gh secret list \-e "${GITHUB\_ENV\_NAME:-default}" &\> /dev/null; then  
           log "DEBUG" "GitHub CLI available with permissions for environment '${GITHUB\_ENV\_NAME:-default}'."  
           if echo "$new\_password" | gh secret set "$secret\_name" \-e "${GITHUB\_ENV\_NAME:-default}" \-b-; then  
               log "INFO" "GitHub secret '$secret\_name' updated successfully via CLI for environment '${GITHUB\_ENV\_NAME:-default}'."  
               return 0  
           else  
               log "ERROR" "GitHub CLI command 'gh secret set' failed for environment '${GITHUB\_ENV\_NAME:-default}'."  
               return 1  
           fi  
        else  
           log "WARN" "GitHub CLI found, but lacks permissions to list/set secrets for environment '${GITHUB\_ENV\_NAME:-default}'. Manual update required."  
           return 126 \# Indicate manual step needed due to permissions  
        fi  
      else  
        log "WARN" "GitHub CLI ('gh') not found. Manual update required."  
        return 127 \# Indicate manual step needed due to missing tool  
      fi  
      ;;  
    gitlab)  
      \# Similar logic for GitLab CLI ('glab')  
      log "WARN" "GitLab CLI integration not fully implemented in this script example. Manual update required."  
      return 127  
      ;;  
    azure)  
      \# Similar logic for Azure CLI ('az')  
      log "WARN" "Azure CLI integration not fully implemented in this script example. Manual update required."  
      return 127  
      ;;  
    \*)  
      log "WARN" "Unsupported CI/CD platform for automated update: '$platform'. Manual update required."  
      return 127 \# Indicate manual step needed  
      ;;  
  esac  
}

\# Tests PostgreSQL connection using psql  
test\_postgres\_connection() {  
  local host="$1"  
  local port="$2"  
  local user="$3"  
  local password="$4"  
  local dbname="$5"

  log "DEBUG" "Testing connection to postgres://$user:\*\*\*@$host:$port/$dbname"

  if \! command \-v psql &\> /dev/null; then  
      log "ERROR" "psql command not found. Cannot test PostgreSQL connection."  
      return 1  
  fi

  export PGPASSWORD="$password"  
  \# Use \-qtA to be quiet, tuple-only, and unaligned; timeout with \-w  
  if psql \-h "$host" \-p "$port" \-U "$user" \-d "$dbname" \-qtA \-w 5 \-c "SELECT 1" \> /dev/null; then  
      log "DEBUG" "PostgreSQL connection test successful."  
      unset PGPASSWORD  
      return 0  
  else  
      log "WARN" "PostgreSQL connection test failed."  
      unset PGPASSWORD  
      return 1  
  fi  
}

\# \--- Main Execution Logic \---  
main() {  
    log "INFO" "Starting database password rotation process..."  
    log "INFO" "Database Type: $DB\_HOST\_TYPE"  
    log "INFO" "Database Host: $DB\_HOST"  
    log "INFO" "Database User: $DB\_USER"

    \# Verify required base variables  
    if \[\[ \-z "$DB\_USER" || \-z "$DB\_NAME" || \-z "$DB\_HOST" || \-z "$DB\_CURRENT\_PASSWORD" \]\]; then  
        log "ERROR" "Missing required database configuration variables (DB\_USER, DB\_NAME, DB\_HOST, DB\_CURRENT\_PASSWORD)."  
        notify "Password rotation failed: Missing required configuration" "failure"  
        exit 1  
    fi

    \# Verify Supabase variables if type is supabase  
    if \[\[ "$DB\_HOST\_TYPE" \== "supabase" && (-z "$SUPABASE\_PROJECT\_REF" || \-z "$SUPABASE\_API\_KEY") \]\]; then  
        log "ERROR" "Missing required Supabase configuration variables (SUPABASE\_PROJECT\_REF, SUPABASE\_API\_KEY)."  
        notify "Password rotation failed: Missing Supabase configuration" "failure"  
        exit 1  
    fi

    \# Generate new secure password  
    log "INFO" "Generating new secure password..."  
    if \! NEW\_PASSWORD=$(generate\_secure\_password); then  
        log "ERROR" "Failed to generate secure password. Aborting."  
        notify "Password rotation failed: Could not generate secure password" "failure"  
        exit 1 \# Exit if password generation fails critically  
    fi  
    log "INFO" "New password generated successfully."  
    \# log "DEBUG" "Generated password: $NEW\_PASSWORD" \# Avoid logging password if possible

    \# \--- Pre-Rotation Backup (PostgreSQL Only) \---  
    if \[\[ "$DB\_HOST\_TYPE" \== "postgres" && "$ENABLE\_BACKUP" \== "true" \]\]; then  
        log "INFO" "Creating database backup before password rotation..."  
        local backup\_date=$(date \+"%Y%m%d%H%M%S")  
        local backup\_filename="db\_backup\_${DB\_NAME}\_${backup\_date}.sql.gz" \# Use gzip  
        local backup\_filepath="$TEMP\_DIR/$backup\_filename" \# Use /tmp

        if \! command \-v pg\_dump &\> /dev/null || \! command \-v gzip &\> /dev/null; then  
            log "ERROR" "pg\_dump or gzip command not found. Cannot create backup."  
            notify "Password rotation warning: pg\_dump/gzip not found, backup skipped." "failure" \# Warning, but proceed  
        else  
            export PGPASSWORD="$DB\_CURRENT\_PASSWORD"  
            if \! pg\_dump \-h "$DB\_HOST" \-p "$DB\_PORT" \-U "$DB\_USER" \-d "$DB\_NAME" | gzip \> "$backup\_filepath"; then  
                log "WARN" "Failed to create database backup. Proceeding with rotation cautiously."  
                notify "Password rotation warning: Database backup failed." "failure"  
            else  
                log "INFO" "Backup created successfully: $backup\_filepath"  
                unset PGPASSWORD \# Unset password immediately after use

                \# Optionally upload backup to secure storage (e.g., S3)  
                if command \-v aws &\> /dev/null && \[\[ \-n "$BACKUP\_BUCKET" \]\]; then  
                    local s3\_path="s3://${BACKUP\_BUCKET}/${BACKUP\_PATH\_PREFIX}/${backup\_filename}"  
                    if aws s3 cp "$backup\_filepath" "$s3\_path"; then  
                        log "INFO" "Backup successfully uploaded to $s3\_path"  
                        rm "$backup\_filepath" \# Clean up local backup after successful upload  
                    else  
                        log "WARN" "Failed to upload backup to S3. Local backup retained at $backup\_filepath"  
                    fi  
                else  
                    log "INFO" "Local backup retained at $backup\_filepath (AWS CLI not found or BACKUP\_BUCKET not set)."  
                fi  
            fi  
             \# Ensure PGPASSWORD is unset even if pg\_dump wasn't found or failed  
            \[\[ \-n "${PGPASSWORD:-}" \]\] && unset PGPASSWORD  
        fi  
    elif \[\[ "$DB\_HOST\_TYPE" \== "supabase" \]\]; then  
        log "INFO" "Backup skipped for Supabase type (managed by Supabase platform)."  
    fi

    \# \--- Perform Password Rotation \---  
    local rotation\_success=false  
    if \[\[ "$DB\_HOST\_TYPE" \== "supabase" \]\]; then  
        \# \--- Supabase Rotation via Management API \---  
        log "INFO" "Rotating password via Supabase Management API for project: $SUPABASE\_PROJECT\_REF"  
        local api\_endpoint="https://api.supabase.com/v1/projects/${SUPABASE\_PROJECT\_REF}/db/password" \# Use documented v1 endpoint

        \# Escape password for JSON payload  
        local escaped\_password  
        if \! command \-v jq &\> /dev/null; then  
            log "ERROR" "jq command not found. Cannot construct Supabase API payload."  
            notify "Password rotation failed: jq missing for Supabase payload" "failure"  
            exit 1  
        fi  
        if \! escaped\_password=$(echo "$NEW\_PASSWORD" | jq \-sR .); then  
            log "ERROR" "Failed to JSON-escape the new password using jq."  
            notify "Password rotation failed: Internal error (jq escaping)" "failure"  
            exit 1  
        fi  
        local payload="{\\"password\\":${escaped\_password}}"

        local max\_retries=3  
        local retry\_count=0  
        local http\_code=0

        while \[\[ $retry\_count \-lt $max\_retries \]\]; do  
            retry\_count=$((retry\_count \+ 1))  
            log "INFO" "Making Supabase API call (Attempt $retry\_count/$max\_retries)..."

            \# Make API request, capture body and HTTP code separately  
            local response  
            \# Use \--fail to make curl return non-zero on HTTP errors \>= 400  
            response=$(curl \--fail \-s \-w "\\\\n%{http\_code}" \--connect-timeout 10 \--max-time 30 \-X POST \\  
              \-H "Authorization: Bearer ${SUPABASE\_API\_KEY}" \\  
              \-H "Content-Type: application/json" \\  
              \-d "$payload" \\  
              "$api\_endpoint")  
            local curl\_exit\_code=$?

            \# Extract body and code (handles potential empty body)  
            http\_code=$(echo "$response" | tail \-n 1\)  
            local http\_body=$(echo "$response" | sed '$d') \# Get all lines except the last

            \# Check curl exit code first, then HTTP code  
            if \[\[ "$curl\_exit\_code" \-eq 0 && "$http\_code" \-ge 200 && "$http\_code" \-lt 300 \]\]; then  
                log "INFO" "Supabase API call successful (HTTP $http\_code)."  
                rotation\_success=true  
                break  
            else  
                log "WARN" "Supabase API call failed (Attempt $retry\_count/$max\_retries): Curl Exit Code: $curl\_exit\_code, HTTP status $http\_code, Response: $http\_body"  
                if \[\[ $retry\_count \-lt $max\_retries \]\]; then  
                    log "INFO" "Retrying in 5 seconds..."  
                    sleep 5  
                fi  
            fi  
        done

        if \[\[ "$rotation\_success" \!= "true" \]\]; then  
            log "ERROR" "Failed to rotate password via Supabase API after $max\_retries attempts."  
            notify "Password rotation failed: Supabase API error (HTTP $http\_code)" "failure"  
            exit 1  
        fi

    elif \[\[ "$DB\_HOST\_TYPE" \== "postgres" \]\]; then  
        \# \--- PostgreSQL Rotation via Secure Helper Script \---  
        log "INFO" "Rotating password via secure helper script: $PYTHON\_HELPER\_SCRIPT\_PATH"

        if \[\[ \! \-f "$PYTHON\_HELPER\_SCRIPT\_PATH" \]\]; then  
             log "ERROR" "Python helper script not found at: $PYTHON\_HELPER\_SCRIPT\_PATH"  
             notify "Password rotation failed: Helper script missing." "failure"  
             exit 1  
        fi  
        if \! command \-v python3 &\> /dev/null; then  
             log "ERROR" "python3 command not found. Cannot execute helper script."  
             notify "Password rotation failed: Python3 missing." "failure"  
             exit 1  
        fi

        \# Export variables needed by the Python script  
        export DB\_HOST DB\_PORT DB\_NAME DB\_USER DB\_CURRENT\_PASSWORD NEW\_PASSWORD

        \# Execute the secure password update script, capture output and exit code  
        local helper\_output  
        local helper\_exit\_code=0  
        \# Use command substitution to capture output, check exit code afterwards  
        if \! helper\_output=$(python3 "$PYTHON\_HELPER\_SCRIPT\_PATH" 2\>&1); then  
             helper\_exit\_code=$? \# Capture exit code on failure  
             log "ERROR" "Python helper script failed with exit code $helper\_exit\_code."  
             log "ERROR" "Helper script output: $helper\_output"  
             \# Unset sensitive vars immediately on failure  
             unset NEW\_PASSWORD DB\_CURRENT\_PASSWORD  
             notify "Password rotation failed: Secure SQL execution error" "failure"  
             exit 1 \# Critical failure  
        else  
             \# Script succeeded (exit code 0\)  
             log "INFO" "Python helper script executed successfully."  
             log "INFO" "Helper script output: $helper\_output"  
             rotation\_success=true  
        fi  
        \# Unset sensitive vars after potential use, regardless of success/failure inside block  
        unset NEW\_PASSWORD DB\_CURRENT\_PASSWORD

    else  
        log "ERROR" "Invalid DB\_HOST\_TYPE specified: '$DB\_HOST\_TYPE'. Must be 'supabase' or 'postgres'."  
        notify "Password rotation failed: Invalid database type configuration" "failure"  
        exit 1  
    fi

    \# \--- Post-Rotation Verification \---  
    log "INFO" "Verifying new password connection..."  
    \# Allow a brief moment for changes to propagate, especially in distributed systems  
    sleep 5  
    if test\_postgres\_connection "$DB\_HOST" "$DB\_PORT" "$DB\_USER" "$NEW\_PASSWORD" "$DB\_NAME"; then  
        log "INFO" "New password verification successful."  
    else  
        \# This is a warning because the password might still be propagating or there might be replication lag.  
        \# The rotation itself likely succeeded if we got here.  
        log "WARN" "New password verification failed immediately after rotation. The password \*may\* be active but verification check failed."  
        notify "Password rotation warning: Post-rotation connection test failed. Manual verification recommended." "failure"  
    fi

    \# \--- Update Secrets in External Systems \---  
    local cicd\_update\_status=0 \# 0=success, 1=failed, 126/127=manual required  
    local temp\_pass\_file="/tmp/new\_db\_password\_$(date \+%s).txt" \# Define temp file path

    if \[\[ "$USE\_AWS\_SECRETS" \== "true" && \-n "$AWS\_SECRET\_ID" \]\]; then  
        log "INFO" "Updating password in AWS Secrets Manager..."  
        if \! update\_aws\_secret "$AWS\_SECRET\_ID" "$NEW\_PASSWORD"; then  
            log "ERROR" "Failed to update AWS Secrets Manager. Manual update required for $AWS\_SECRET\_ID."  
            notify "Password rotation partial failure: AWS Secrets Manager update failed. Manual action needed." "failure"  
            cicd\_update\_status=1 \# Indicate at least one secret update failed  
        fi  
    fi

    \# Update CI/CD platform secrets  
    if \[\[ \-n "$CICD\_PLATFORM" && \-n "$CICD\_SECRET\_NAME" \]\]; then  
        log "INFO" "Updating password in CI/CD platform: $CICD\_PLATFORM..."  
        local update\_cicd\_exit\_code=0  
        if \! update\_cicd\_secret "$CICD\_PLATFORM" "$CICD\_SECRET\_NAME" "$NEW\_PASSWORD"; then  
            update\_cicd\_exit\_code=$? \# Capture exit code from the function  
            log "WARN" "Automated CI/CD secret update failed (Exit Code: $update\_cicd\_exit\_code). Manual update likely required for secret '$CICD\_SECRET\_NAME'."  
            cicd\_update\_status=$update\_cicd\_exit\_code \# Use the specific exit code

            \# Provide clear instructions for manual update ONLY if automation failed  
            echo "---------------------------------------------------------------------" \>&2 \# Log warnings/errors to stderr  
            echo "ACTION REQUIRED: Manual Secret Update Needed\!" \>&2  
            echo "---------------------------------------------------------------------" \>&2  
            echo "Platform:      $CICD\_PLATFORM" \>&2  
            echo "Secret Name:   $CICD\_SECRET\_NAME" \>&2  
            echo "Environment:   ${GITHUB\_ENV\_NAME:-N/A (check CICD platform)}" \>&2  
            echo "Reason:        Automated update failed (Exit Code: $update\_cicd\_exit\_code). Check logs above." \>&2  
            \# Save password temporarily ONLY if automation fails and manual action needed  
            echo "$NEW\_PASSWORD" \> "$temp\_pass\_file"  
            chmod 600 "$temp\_pass\_file" \# Restrict permissions  
            log "INFO" "New password saved temporarily to $temp\_pass\_file for manual update. DELETE THIS FILE AFTER UPDATING THE SECRET."  
            echo "Password saved to: $temp\_pass\_file (DELETE AFTER USE)" \>&2  
            echo "---------------------------------------------------------------------" \>&2  
            notify "Password rotation partial failure: CI/CD secret update failed for '$CICD\_SECRET\_NAME'. Manual action required." "failure"  
        fi  
    fi

    \# Clean up the temporary password file immediately after attempting updates  
    if \[\[ \-f "$temp\_pass\_file" \]\]; then  
        log "INFO" "Cleaning up temporary password file: $temp\_pass\_file"  
        rm \-f "$temp\_pass\_file"  
    fi

    \# \--- Final Outcome \---  
    if \[\[ "$cicd\_update\_status" \-eq 0 \]\]; then  
        log "INFO" "Password rotation process completed successfully, including secret updates."  
        notify "Database password rotation completed successfully." "success"  
        \# Explicitly unset NEW\_PASSWORD from env if it was exported  
        \[\[ \-n "${NEW\_PASSWORD:-}" \]\] && unset NEW\_PASSWORD  
        return 0  
    else  
        log "WARN" "Password rotation completed for database, but one or more secret updates failed or requires manual action (Exit Code: $cicd\_update\_status). MANUAL ACTION MAY BE REQUIRED."  
        \# Exit with a specific code indicating partial success/failure/manual action  
        \[\[ \-n "${NEW\_PASSWORD:-}" \]\] && unset NEW\_PASSWORD  
        return $cicd\_update\_status \# Return the specific exit code from the update process  
    fi  
}

\# \--- Script Entry Point \---  
\# Initialize log file  
echo "" \> "$LOG\_FILE"  
chmod 600 "$LOG\_FILE"

\# Execute main function and handle top-level errors  
if main; then  
  exit 0  
else  
  \# Capture exit code from main function if it exited non-zero  
  exit\_code=$?  
  log "FATAL" "Password rotation script failed with exit code $exit\_code."  
  \# Ensure a notification goes out on fatal script error if not already sent by main()  
  \# notify "Password rotation process failed critically (Exit Code: $exit\_code)." "failure" \# Avoid duplicate notifications if possible  
  exit $exit\_code  
fi

---

**2\. Secure Python Helper Script (scripts/secure\_alter\_password.py)**

Python

\#\!/usr/bin/env python3  
\# secure\_alter\_password.py  
\# Description: Securely updates a PostgreSQL user password using parameterized queries.  
\#              Reads connection details and new password from environment variables.  
\# Author:      Your Name/Team  
\# Version:     1.1 (Added logging, refined error handling)

import sys  
import os  
import psycopg2  
import datetime  
from psycopg2 import sql \# Import sql module for identifier quoting  
\# ISOLATION\_LEVEL\_AUTOCOMMIT is needed for commands like ALTER USER outside a transaction  
from psycopg2.extensions import ISOLATION\_LEVEL\_AUTOCOMMIT

\# \--- Logging \---  
def log\_message(level, message):  
    """ Simple structured logging to stdout/stderr """  
    timestamp \= datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")  
    log\_entry \= f"\[{timestamp}\] \[PYTHON\_HELPER\] \[{level}\] {message}"  
    if level \== "ERROR" or level \== "CRITICAL":  
        print(log\_entry, file=sys.stderr)  
    else:  
        print(log\_entry)

\# \--- Configuration & Validation \---  
try:  
    log\_message("INFO", "Reading configuration from environment variables...")  
    db\_host \= os.environ.get('DB\_HOST')  
    db\_port \= os.environ.get('DB\_PORT', '5432')  
    db\_name \= os.environ.get('DB\_NAME')  
    db\_user \= os.environ.get('DB\_USER')  
    db\_current\_password \= os.environ.get('DB\_CURRENT\_PASSWORD')  
    new\_password \= os.environ.get('NEW\_PASSWORD')

    \# Validate required variables  
    required\_vars\_map \= {  
        'DB\_HOST': db\_host, 'DB\_PORT': db\_port, 'DB\_NAME': db\_name,  
        'DB\_USER': db\_user, 'DB\_CURRENT\_PASSWORD': db\_current\_password, 'NEW\_PASSWORD': new\_password  
    }  
    missing\_vars \= \[var for var, val in required\_vars\_map.items() if not val\]

    if missing\_vars:  
        \# Don't log passwords even in error messages  
        error\_vars \= \[var for var in missing\_vars if "PASSWORD" not in var\]  
        if any("PASSWORD" in var for var in missing\_vars):  
             error\_vars.append("DB\_CURRENT\_PASSWORD/NEW\_PASSWORD")  
        raise ValueError(f"Missing required environment variables: {', '.join(error\_vars)}")

    log\_message("INFO", f"Configuration loaded for DB: {db\_name}, Host: {db\_host}:{db\_port}, User: {db\_user}")

except ValueError as e:  
    log\_message("ERROR", f"Configuration error: {e}")  
    sys.exit(2) \# Specific exit code for configuration errors  
except Exception as e:  
    log\_message("CRITICAL", f"Unexpected error during configuration: {e}")  
    sys.exit(1) \# General error

\# \--- Main Logic \---  
conn \= None \# Initialize connection variable  
try:  
    log\_message("INFO", "Attempting database connection...")  
    \# Connect to the database using the current password  
    conn \= psycopg2.connect(  
        host=db\_host,  
        port=db\_port,  
        dbname=db\_name,  
        user=db\_user,  
        password=db\_current\_password,  
        connect\_timeout=10 \# Add connection timeout  
    )  
    \# Autocommit ensures ALTER USER command runs outside a transaction block if needed by DB version  
    conn.set\_isolation\_level(ISOLATION\_LEVEL\_AUTOCOMMIT)  
    log\_message("INFO", "Database connection successful.")

    with conn.cursor() as cur:  
        \# Construct the ALTER USER command safely using psycopg2.sql for the identifier  
        \# and parameterized query (%s) for the password literal.  
        \# This prevents SQL injection from both username and password.  
        alter\_user\_sql \= sql.SQL("ALTER USER {user} WITH PASSWORD %s").format(  
            user=sql.Identifier(db\_user) \# Safely quote the username identifier if it contains special chars  
        )

        log\_message("INFO", f"Executing password update for user '{db\_user}'...")  
        cur.execute(alter\_user\_sql, (new\_password,)) \# Pass password as parameter tuple

    log\_message("INFO", "Password updated successfully in the database.")  
    sys.exit(0) \# Explicit success exit code

except psycopg2.OperationalError as e:  
    \# Handle connection errors specifically  
    log\_message("ERROR", f"Database connection failed: {e}")  
    sys.exit(3) \# Specific exit code for connection errors

except psycopg2.Error as e:  
    \# Catch other specific database errors (ProgrammingError, etc.)  
    error\_code \= getattr(e, 'pgcode', 'N/A')  
    log\_message("ERROR", f"Database Error during password update: Code={error\_code}, Details={e}")  
    sys.exit(4) \# Specific exit code for database command errors

except Exception as e:  
    \# Catch any other unexpected errors during execution  
    log\_message("CRITICAL", f"Unexpected runtime error: {e}")  
    sys.exit(1) \# General error exit code

finally:  
    \# Ensure connection is always closed if it was opened  
    if conn is not None and not conn.closed:  
        conn.close()  
        log\_message("INFO", "Database connection closed.")

---

**3\. Tightened Terraform IAM Policy (terraform/database-rotation.tf)**

* Shows the aws\_iam\_policy resource definition.

Terraform

\# terraform/database-rotation.tf

\# (Assumes variables like var.environment, var.region, etc. and resources  
\#  like aws\_secretsmanager\_secret.db\_credentials, aws\_secretsmanager\_secret.supabase\_api\_key,  
\#  aws\_sns\_topic.rotation\_notifications, data.aws\_caller\_identity.current are defined elsewhere in your Terraform config)

resource "aws\_iam\_policy" "db\_password\_rotation\_policy" {  
  name        \= "dynagen-${var.environment}-db-password-rotation-policy"  
  description \= "Policy for database password rotation Lambda (Least Privilege Enhanced)"

  policy \= jsonencode({  
    Version \= "2012-10-17"  
    Statement \= \[  
      \# CloudWatch Logs permissions \- scoped to specific log group and streams  
      {  
        Effect \= "Allow"  
        Action \= \[  
          "logs:CreateLogStream", \# Needed by Lambda runtime  
          "logs:PutLogEvents"  
        \]  
        Resource \= \[  
          \# Allow actions only on streams within the specific log group  
          "arn:aws:logs:${var.region}:${data.aws\_caller\_identity.current.account\_id}:log-group:/aws/lambda/dynagen-${var.environment}-db-password-rotation:log-stream:\*"  
        \]  
      },  
      \# Explicitly allow creating the log group if it doesn't exist (needed once)  
      {  
         Effect \= "Allow"  
         Action \= "logs:CreateLogGroup"  
         Resource \= "arn:aws:logs:${var.region}:${data.aws\_caller\_identity.current.account\_id}:log-group:/aws/lambda/dynagen-${var.environment}-db-password-rotation:\*"  
         \# Optional: Add condition to only allow if log group doesn't exist, though CreateLogGroup is generally safe  
      },  
      \# Secrets Manager: Get permissions scoped to necessary secrets  
      {  
        Effect \= "Allow"  
        Action \= \[  
          "secretsmanager:GetSecretValue"  
          \#"secretsmanager:DescribeSecret" \# Often useful for checking status/existence  
        \]  
        \# List required secrets explicitly using Terraform functions for cleaner conditional logic  
        Resource \= distinct(compact(concat(  
          \[aws\_secretsmanager\_secret.db\_credentials.arn\],  
          var.db\_host\_type \== "supabase" ? \[aws\_secretsmanager\_secret.supabase\_api\_key\[0\].arn\] : \[\]  
        )))  
      },  
      \# Secrets Manager: Put permission scoped ONLY to the DB credentials secret  
      {  
        Effect \= "Allow"  
        Action \= \[  
          "secretsmanager:PutSecretValue" \# The primary action needed to update the password field  
          \#"secretsmanager:UpdateSecretVersionStage" \# Needed if using custom rotation logic with staging labels  
        \]  
        Resource \= \[aws\_secretsmanager\_secret.db\_credentials.arn\]  
        \# Optional Condition: Ensure only the 'password' field could potentially be modified if needed,  
        \# though PutSecretValue replaces the whole string, making field-level control hard here.  
      },  
      \# S3 permissions for backups \- scoped to specific path and PutObject action  
      {  
        Effect \= "Allow"  
        Action \= \[  
          "s3:PutObject"  
        \]  
        \# Scope to the specific environment/prefix path within the backup bucket  
        Resource \= \[  
          "arn:aws:s3:::${var.backup\_bucket\_name}/${var.backup\_path\_prefix}/\*"  
        \]  
        \# Optional Condition: Add expected bucket owner account ID  
        \# Condition \= { StringEquals \= { "s3:x-amz-acl": "bucket-owner-full-control" } } \# If needed  
      },  
      \# SNS Publish permission \- scoped to the specific topic  
      {  
        Effect \= "Allow"  
        Action \= \[  
          "sns:Publish"  
        \]  
        Resource \= \[  
          aws\_sns\_topic.rotation\_notifications.arn \# Assumes this resource is defined  
        \]  
      },

      \# \--- VPC Networking Permissions (if var.lambda\_in\_vpc is true) \---  
      \# These are required by the AWS Lambda service to manage ENIs in your VPC.  
      \# Scoping these tightly can be complex and sometimes requires broader permissions initially.  
      {  
        Comment \= "Allow Lambda service to create ENIs in specified subnets/security groups"  
        Effect \= "Allow"  
        Action \= \[  
          "ec2:CreateNetworkInterface"  
        \]  
        Resource \= \[ \# Specify resources the ENI will connect to  
            "arn:aws:ec2:${var.region}:${data.aws\_caller\_identity.current.account\_id}:subnet/\*",  
            "arn:aws:ec2:${var.region}:${data.aws\_caller\_identity.current.account\_id}:security-group/\*"  
        \]  
        \# Condition based on tags applied \*during creation\* (if Lambda supports passing them)  
        \# Note: aws:RequestTag conditions might not always work perfectly for service-linked roles or ENI creation by Lambda itself.  
        \# Condition \= {  
        \#   StringEquals \= {  
        \#     "aws:RequestTag/Application": "dynagendashv1-${var.environment}-rotation",  
        \#     "aws:RequestTag/ManagedBy": "AWSLambda"  
        \#   }  
        \# }  
      },  
      {  
         Comment \= "Allow Lambda service to manage the ENIs it creates"  
         Effect \= "Allow"  
         Action \= \[  
            "ec2:DeleteNetworkInterface",  
            "ec2:DescribeNetworkInterfaces" \# Describe is often needed on wider scope or specific ENI ARN created by Lambda  
            \#"ec2:AssignPrivateIpAddresses", \# Sometimes needed  
            \#"ec2:UnassignPrivateIpAddresses" \# Sometimes needed  
         \]  
         Resource \= "arn:aws:ec2:${var.region}:${data.aws\_caller\_identity.current.account\_id}:network-interface/\*"  
         \# Condition to only allow management of ENIs created by this Lambda function/role  
         Condition \= {  
            StringEquals \= { \# Assuming Lambda correctly tags the ENIs it creates  
               "ec2:ResourceTag/aws:lambda:createdBy": aws\_lambda\_function.db\_password\_rotation.arn  
               \#"ec2:ResourceTag/Application": "dynagendashv1-${var.environment}-rotation"  
            }  
         }  
      }  
      \# Removed broader ec2:Describe\* on "\*" \- rely on Lambda service role implicitly having necessary describe permissions  
      \# or add them back if connection fails due to missing describe perms during ENI setup.  
    \]  
  })  
}

---

**4\. Enhanced GitHub Actions Secret Update Step (.github/workflows/db-password-rotation.yml)**

* Shows only the relevant steps for updating secrets and providing guidance.

YAML

\# .github/workflows/db-password-rotation.yml

\# ... (previous steps: checkout, setup env, configure aws, backup, execute rotation) ...

      \- name: Update GitHub environment secrets and Provide Guidance  
        \# Run if rotation script indicates success (exit 0\) or partial success (exit 2),  
        \# wasn't a dry run, AND the main script indicated manual action might be needed  
        \# (captured via exit code or potentially an output).  
        \# Using failure() condition on previous step might be simpler if exit 2 also means partial failure.  
        if: ${{ (steps.rotation.outcome \== 'success' || steps.rotation.outputs.exit\_code \== '2') && env.DRY\_RUN \!= 'true' }}  
        id: secret-update  
        env:  
           TARGET\_ENVIRONMENT: ${{ env.ENVIRONMENT }} \# Target GH Environment  
           SECRET\_NAME: ${{ env.CICD\_SECRET\_NAME || 'DB\_PASSWORD' }} \# Use configured name  
           \# Pass the temporary file path if the rotation script outputs it on failure/manual step  
           NEW\_PASSWORD\_FILE: ${{ steps.rotation.outputs.new\_password\_file || '/tmp/new\_db\_password.txt' }}  
        run: |  
          echo "Attempting to update GitHub secret '$SECRET\_NAME' in environment '$TARGET\_ENVIRONMENT'..."  
          MANUAL\_UPDATE\_NEEDED="false"  
          MANUAL\_UPDATE\_REASON="-"

          \# Check if the temporary password file exists (indication manual update might be needed)  
          if \[\[ \! \-f "$NEW\_PASSWORD\_FILE" \]\]; then  
            echo "::notice::Temporary password file '$NEW\_PASSWORD\_FILE' not found. Assuming automated update succeeded or was not needed."  
            echo "manual\_update\_needed=false" \>\> $GITHUB\_OUTPUT  
            exit 0  
          fi

          \# Check GitHub CLI availability  
          if \! command \-v gh &\> /dev/null; then  
            MANUAL\_UPDATE\_NEEDED="true"  
            MANUAL\_UPDATE\_REASON="GitHub CLI ('gh') not available in runner."  
          else  
            \# Check permissions by trying to list secrets for the target environment  
            echo "Checking permissions for GitHub environment '$TARGET\_ENVIRONMENT'..."  
            if \! gh secret list \-e "$TARGET\_ENVIRONMENT" &\> /dev/null; then  
              MANUAL\_UPDATE\_NEEDED="true"  
              MANUAL\_UPDATE\_REASON="GitHub CLI lacks permissions to list/set secrets for environment '$TARGET\_ENVIRONMENT'."  
            else  
              \# If CLI available and permissions seem OK, attempt update  
              echo "Attempting to update secret '$SECRET\_NAME' using GitHub CLI..."  
              NEW\_PASSWORD=$(cat "$NEW\_PASSWORD\_FILE")  
              if echo "$NEW\_PASSWORD" | gh secret set "$SECRET\_NAME" \--env "$TARGET\_ENVIRONMENT" \-b-; then  
                 echo "Secret '$SECRET\_NAME' updated successfully in GitHub environment '$TARGET\_ENVIRONMENT' via CLI."  
                 MANUAL\_UPDATE\_NEEDED="false" \# Success\!  
              else  
                 echo "::error::GitHub CLI command 'gh secret set' failed. Manual secret update required."  
                 MANUAL\_UPDATE\_NEEDED="true"  
                 MANUAL\_UPDATE\_REASON="GitHub CLI 'gh secret set' command failed (check logs/permissions)."  
              fi  
            fi  
          fi

          \# Output whether manual update is needed  
          echo "manual\_update\_needed=$MANUAL\_UPDATE\_NEEDED" \>\> $GITHUB\_OUTPUT  
          echo "MANUAL\_UPDATE\_REASON=$MANUAL\_UPDATE\_REASON" \>\> $GITHUB\_OUTPUT

          \# If manual update is needed, provide instructions (will be displayed by next step)  
          if \[\[ "$MANUAL\_UPDATE\_NEEDED" \== "true" \]\]; then  
             echo "::warning::Automated secret update failed or was not possible."  
          fi

      \- name: Display Manual Secret Update Instructions  
        \# Run if the previous step determined manual update is needed  
        if: steps.secret-update.outputs.manual\_update\_needed \== 'true'  
        run: |  
          echo "---------------------------------------------------------------------"  
          echo "::warning::ACTION REQUIRED: Manual Secret Update Needed\!"  
          echo "---------------------------------------------------------------------"  
          echo "Environment:       ${{ env.ENVIRONMENT }}"  
          echo "Secret Name:       ${{ env.CICD\_SECRET\_NAME || 'DB\_PASSWORD' }}"  
          echo "Reason:            ${{ steps.secret-update.outputs.MANUAL\_UPDATE\_REASON }}"  
          echo ""  
          echo "Instructions for updating the secret manually:"  
          echo "1. Go to: ${{ github.server\_url }}/${{ github.repository }}/settings/secrets/actions"  
          echo "2. Select the 'Environments' tab on the left."  
          echo "3. Click on the '${{ env.ENVIRONMENT }}' environment."  
          echo "4. Under 'Environment secrets', find '${{ env.CICD\_SECRET\_NAME || 'DB\_PASSWORD' }}' and click 'Update'."  
          echo "5. Paste the new password (retrieve securely \- check previous step logs for temp file path if applicable)."  
          echo "6. Save the secret."  
          echo "7. VERY IMPORTANT: Ensure any temporary file containing the new password (e.g., /tmp/new\_db\_password\_\*.txt mentioned in logs) is deleted from the runner (should be handled by the Cleanup step)."  
          echo "---------------------------------------------------------------------"

\# ... (Cleanup step \- ensure it removes /tmp/new\_db\_password\_\*.txt, Notification step) ...

---

**5\. Lambda Bootstrap Script (lambda/bootstrap)**

* This script acts as the entry point when deploying the bash script to AWS Lambda using a custom runtime (provided.al2).

Bash

\#\!/bin/bash  
\# bootstrap \- AWS Lambda Custom Runtime (AL2) entrypoint for Bash scripts

\# Strict mode  
set \-euo pipefail

\# \--- Configuration \---  
\# Lambda environment variables provide AWS\_LAMBDA\_RUNTIME\_API  
LAMBDA\_TASK\_ROOT="${LAMBDA\_TASK\_ROOT:-/var/task}" \# Standard Lambda env var  
SCRIPT\_PATH="$LAMBDA\_TASK\_ROOT/db-password-rotation.sh" \# Path to your main script within the Lambda package  
PYTHON\_HELPER\_SCRIPT\_PATH="$LAMBDA\_TASK\_ROOT/secure\_alter\_password.py" \# Path to Python helper if packaged  
TEMP\_DIR="/tmp" \# Writable directory in Lambda  
BOOTSTRAP\_LOG\_FILE="$TEMP\_DIR/lambda\_bootstrap.log" \# Bootstrap specific log

\# \--- Logging \---  
\# Initialize log file for this execution  
echo "" \> "$BOOTSTRAP\_LOG\_FILE"  
chmod 600 "$BOOTSTRAP\_LOG\_FILE"  
log\_bootstrap() {  
    local level="$1"  
    local message="$2"  
    local timestamp=$(date \-u \+"%Y-%m-%dT%H:%M:%SZ")  
    \# Log to bootstrap log AND CloudWatch via stdout/stderr  
    echo "\[$timestamp\] \[BOOTSTRAP\] \[$level\] $message" | tee \-a "$BOOTSTRAP\_LOG\_FILE" \>&2  
}

log\_bootstrap "INFO" "Lambda bootstrap execution started. PID: $$"

\# \--- Helper Functions \---

\# Sends successful response back to Lambda Runtime API  
send\_response() {  
    local request\_id="$1"  
    local response\_json="$2"  
    log\_bootstrap "INFO" "Sending success response for request $request\_id"  
    curl \-s \-X POST "http://${AWS\_LAMBDA\_RUNTIME\_API}/2018-06-01/runtime/invocation/$request\_id/response" \\  
      \-H "Content-Type: application/json" \-d "$response\_json"  
}

\# Sends error response back to Lambda Runtime API  
send\_error() {  
    local request\_id="$1"  
    local error\_type="$2"  
    local error\_message="$3"  
    log\_bootstrap "ERROR" "Sending error response for request $request\_id: \[$error\_type\]"  
    \# Escape error message for JSON  
    local escaped\_message=$(echo "$error\_message" | sed 's/\\\\/\\\\\\\\/g' | sed 's/"/\\\\"/g' | sed ':a;N;$\!ba;s/\\n/\\\\n/g') \# Handle newlines too  
    local error\_json="{\\"errorType\\":\\"$error\_type\\",\\"errorMessage\\":\\"$escaped\_message\\"}"  
    \# Log the error JSON being sent (excluding potentially sensitive details if necessary)  
    \# log\_bootstrap "DEBUG" "Error JSON Payload: $error\_json"  
    curl \-s \-X POST "http://${AWS\_LAMBDA\_RUNTIME\_API}/2018-06-01/runtime/invocation/$request\_id/error" \\  
     \-H "Content-Type: application/json" \-d "$error\_json"  
}

\# Prepares the Lambda execution environment  
prepare\_environment() {  
    log\_bootstrap "INFO" "Preparing environment..."  
    local install\_needed=false

    \# \--- Install Dependencies \---  
    \# Check and install jq  
    if \! command \-v jq &\> /dev/null; then  
        log\_bootstrap "INFO" "jq not found. Installing..."  
        if \! yum install \-y jq; then log\_bootstrap "ERROR" "Failed to install jq."; return 1; fi  
        install\_needed=true  
    fi

    \# Check and install Python3 and pip (needed for psycopg2 if not packaged)  
    if \[\[ \-f "$PYTHON\_HELPER\_SCRIPT\_PATH" \]\]; then  
        if \! command \-v python3 &\> /dev/null; then  
            log\_bootstrap "INFO" "python3 not found. Installing..."  
            if \! yum install \-y python3; then log\_bootstrap "ERROR" "Failed to install python3."; return 1; fi  
            install\_needed=true  
        fi  
        if \! command \-v pip3 &\> /dev/null; then  
             log\_bootstrap "INFO" "pip3 not found. Installing..."  
             if \! yum install \-y python3-pip; then log\_bootstrap "ERROR" "Failed to install pip3."; return 1; fi  
             install\_needed=true  
        fi  
        \# Check if psycopg2 is importable, install if not (assumes it's NOT packaged)  
        \# Better approach: Package dependencies with the Lambda zip file.  
        if \! python3 \-c "import psycopg2" &\> /dev/null; then  
             log\_bootstrap "INFO" "psycopg2 python library not found. Installing..."  
             \# Install binary version for compatibility with Amazon Linux 2  
             if \! pip3 install psycopg2-binary; then log\_bootstrap "ERROR" "Failed to install psycopg2-binary."; return 1; fi  
             install\_needed=true  
        fi  
    \# Check for psql only if NOT using the Python helper for postgres  
    elif \[\[ "${DB\_HOST\_TYPE:-postgres}" \== "postgres" \]\]; then  
       if \! command \-v psql &\> /dev/null; then  
            log\_bootstrap "INFO" "psql not found. Installing PostgreSQL client..."  
            if \! yum install \-y postgresql; then log\_bootstrap "ERROR" "Failed to install PostgreSQL client."; return 1; fi  
            install\_needed=true  
       fi  
    fi

     \# Check and install curl (usually present)  
    if \! command \-v curl &\> /dev/null; then  
        log\_bootstrap "INFO" "curl not found. Installing..."  
        if \! yum install \-y curl; then log\_bootstrap "ERROR" "Failed to install curl."; return 1; fi  
        install\_needed=true  
    fi

     \# Check and install gzip (usually present)  
    if \! command \-v gzip &\> /dev/null; then  
        log\_bootstrap "INFO" "gzip not found. Installing..."  
        if \! yum install \-y gzip; then log\_bootstrap "ERROR" "Failed to install gzip."; return 1; fi  
        install\_needed=true  
    fi

    if \[\[ "$install\_needed" \== "true" \]\]; then  
        log\_bootstrap "INFO" "Dependency installation complete."  
    else  
        log\_bootstrap "INFO" "All required dependencies seem available."  
    fi

    \# \--- Make Scripts Executable \---  
    if \[\[ \-f "$SCRIPT\_PATH" \]\]; then chmod \+x "$SCRIPT\_PATH"; else log\_bootstrap "ERROR" "Main script not found: $SCRIPT\_PATH"; return 1; fi  
    if \[\[ \-f "$PYTHON\_HELPER\_SCRIPT\_PATH" \]\]; then chmod \+x "$PYTHON\_HELPER\_SCRIPT\_PATH"; fi

    \# \--- Configure Environment from Secrets \---  
    if \[\[ "${USE\_AWS\_SECRETS:-false}" \== "true" && \-n "${AWS\_SECRET\_ID:-}" \]\]; then  
        log\_bootstrap "INFO" "Retrieving primary DB credentials from AWS Secrets Manager: ${AWS\_SECRET\_ID}"  
        local secret\_value  
        if \! secret\_value=$(aws secretsmanager get-secret-value \--secret-id "$AWS\_SECRET\_ID" \--query 'SecretString' \--output text 2\> /dev/null); then  
             log\_bootstrap "ERROR" "Failed to retrieve secret value from AWS Secrets Manager (Secret ID: $AWS\_SECRET\_ID). Check permissions and secret existence."  
             return 1  
        fi  
        \# Export credentials safely  
        export DB\_SECRET\_USERNAME=$(echo "$secret\_value" | jq \-r '.username // ""')  
        export DB\_SECRET\_DBNAME=$(echo "$secret\_value" | jq \-r '.dbname // ""')  
        export DB\_SECRET\_HOST=$(echo "$secret\_value" | jq \-r '.host // ""')  
        export DB\_SECRET\_PORT=$(echo "$secret\_value" | jq \-r '.port // "5432"')  
        export DB\_SECRET\_PASSWORD=$(echo "$secret\_value" | jq \-r '.password // ""')  
        local secret\_host\_type=$(echo "$secret\_value" | jq \-r '.host\_type // ""')  
        export DB\_HOST\_TYPE=${secret\_host\_type:-${DB\_HOST\_TYPE:-postgres}} \# Allow override from secret

        if \[\[ "$DB\_HOST\_TYPE" \== "supabase" \]\]; then  
            export SUPABASE\_PROJECT\_REF=${SUPABASE\_PROJECT\_REF:-$(echo "$secret\_value" | jq \-r '.project\_ref // ""')}  
            if \[\[ \-n "$SUPABASE\_API\_KEY\_SECRET\_ID" \]\]; then  
                log\_bootstrap "INFO" "Retrieving Supabase API Key from AWS Secrets Manager: ${SUPABASE\_API\_KEY\_SECRET\_ID}"  
                local supabase\_api\_key  
                if \! supabase\_api\_key=$(aws secretsmanager get-secret-value \--secret-id "$SUPABASE\_API\_KEY\_SECRET\_ID" \--query 'SecretString' \--output text 2\> /dev/null); then  
                   log\_bootstrap "ERROR" "Failed to retrieve Supabase API key from Secret ID: $SUPABASE\_API\_KEY\_SECRET\_ID."  
                   return 1  
                fi  
                export SUPABASE\_MANAGEMENT\_API\_KEY="$supabase\_api\_key"  
            elif \[\[ \-z "$SUPABASE\_MANAGEMENT\_API\_KEY" \]\]; then  
                log\_bootstrap "ERROR" "Supabase API Key not found in direct environment variables or specified secret."  
                return 1  
            fi  
             log\_bootstrap "INFO" "Supabase credentials configured."  
        fi  
        log\_bootstrap "INFO" "Successfully retrieved and exported credentials from Secrets Manager."  
    else  
        log\_bootstrap "INFO" "USE\_AWS\_SECRETS is not 'true' or AWS\_SECRET\_ID is not set. Relying on direct environment variables for credentials."  
    fi

    \# Pass Python helper path to main script  
    export PYTHON\_HELPER\_SCRIPT\_PATH

    log\_bootstrap "INFO" "Environment preparation complete."  
    return 0  
}

\# \--- Main Lambda Handler Loop \---  
main\_loop() {  
    while true; do  
        log\_bootstrap "INFO" "Waiting for next Lambda invocation..."  
        local headers\_file="$TEMP\_DIR/headers.txt"  
        local event\_data  
        \# Use curl options for safety: \-f fail fast, \-S show error, \-s silent  
        event\_data=$(curl \-fSs \-LD "$headers\_file" "http://${AWS\_LAMBDA\_RUNTIME\_API}/2018-06-01/runtime/invocation/next")  
        local request\_id=$(grep \-Fi Lambda-Runtime-Aws-Request-Id "$headers\_file" | tr \-d '\[:space:\]' | cut \-d: \-f2)  
        rm "$headers\_file" \# Clean up header file

        log\_bootstrap "INFO" "Received request ID: $request\_id"  
        log\_bootstrap "DEBUG" "Event data: $event\_data"

        \# \--- Execute the Rotation Script \---  
        log\_bootstrap "INFO" "Executing main rotation script: $SCRIPT\_PATH"  
        \# Use unique log file per invocation for main script  
        local script\_log\_file="$TEMP\_DIR/rotation\_script\_${request\_id}.log"  
        local rotation\_exit\_code=0

        \# Run script, redirect stdout/stderr to the script log file  
        \# Use subshell to capture exit code correctly with redirection  
        ( LOG\_FILE="$script\_log\_file" "$SCRIPT\_PATH" )  
        rotation\_exit\_code=$?

        local script\_log\_content="\<Log Content Not Available\>" \# Default message  
        if \[\[ \-f "$script\_log\_file" \]\]; then  
             \# Read log content safely  
             script\_log\_content=$(cat "$script\_log\_file")  
             \# Limit log size included in response/error to avoid exceeding payload limits  
             local max\_log\_size=3072 \# Limit to \~3KB  
             local current\_size=${\#script\_log\_content}  
             if \[\[ $current\_size \-gt $max\_log\_size \]\]; then  
                script\_log\_content="... (Log Truncated) ...\\n$(echo "$script\_log\_content" | tail \-c $max\_log\_size)"  
             fi  
        fi  
        log\_bootstrap "INFO" "Rotation script finished with exit code $rotation\_exit\_code"  
        log\_bootstrap "DEBUG" "Rotation script log content:\\n$script\_log\_content"

        \# \--- Send Response/Error \---  
        local response\_json=""  
        if \[\[ $rotation\_exit\_code \-eq 0 \]\]; then  
            \# Success  
            local msg="Database password rotation completed successfully (Request ID: $request\_id)."  
            response\_json=$(jq \-n \--arg status "success" \--arg message "$msg" \--arg details "$script\_log\_content" \\  
                           '{status: $status, message: $message, details: $details}')  
            send\_response "$request\_id" "$response\_json"  
        elif \[\[ $rotation\_exit\_code \-eq 2 \]\]; then  
             \# Partial success (rotation done, secret update failed)  
            local msg="Password rotation succeeded, but secret update failed. Manual action required (Request ID: $request\_id)."  
             response\_json=$(jq \-n \--arg status "partial\_failure" \--arg message "$msg" \--arg details "$script\_log\_content" \\  
                            '{status: $status, message: $message, details: $details}')  
            send\_response "$request\_id" "$response\_json" \# Send success, but message indicates issue  
        else  
            \# Failure  
            local msg="Database password rotation failed (Exit Code: $rotation\_exit\_code). Request ID: $request\_id."  
            \# Include log content in error message for easier debugging  
            send\_error "$request\_id" "RotationScriptError" "$msg\\n\\nScript Logs:\\n$script\_log\_content"  
        fi

        \# \--- Cleanup Temporary Files \---  
        rm \-f "$script\_log\_file" /tmp/new\_db\_password\_\*.txt 2\>/dev/null  
        log\_bootstrap "DEBUG" "Cleaned up temporary files for request $request\_id."

    done \# End while loop  
}

\# \--- Script Entry Point \---  
\# Prepare environment first, exit if it fails  
if \! prepare\_environment; then  
   log\_bootstrap "FATAL" "Environment preparation failed. Exiting bootstrap."  
   \# Send initialization error to Lambda API  
   curl \-s \-X POST "http://${AWS\_LAMBDA\_RUNTIME\_API}/2018-06-01/runtime/init/error" \\  
     \-H "Content-Type: application/json" \\  
     \-d '{"errorType":"Bootstrap.EnvironmentError","errorMessage":"Failed to prepare environment. Check bootstrap logs in CloudWatch."}'  
   exit 1  
fi

\# Start the main processing loop  
\# Handle potential errors within the loop itself via send\_error  
main\_loop

\# This line should not be reached  
log\_bootstrap "FATAL" "Main processing loop exited unexpectedly."  
exit 1

---

This collection includes the secure, optimized versions of the bash script, the Python helper, the Terraform policy, the GitHub Actions snippet, and the Lambda bootstrap, ready for use.