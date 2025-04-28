#!/bin/bash
# bootstrap - AWS Lambda entrypoint for database password rotation

set -euo pipefail

# Set up paths
LAMBDA_TASK_ROOT=${LAMBDA_TASK_ROOT:-/var/task}
SCRIPT_PATH="$LAMBDA_TASK_ROOT/db-password-rotation.sh"
TEMP_DIR="/tmp"
LOG_FILE="$TEMP_DIR/rotation.log"

# Initialize logging
echo "Lambda execution started at $(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "$LOG_FILE"

# Function to send response back to Lambda runtime API
send_response() {
    local request_id="$1"
    local response="$2"
    local status_code="${3:-200}"
    
    echo "Sending response for request $request_id with status $status_code" >> "$LOG_FILE"
    echo "$response" >> "$LOG_FILE"
    
    curl -s -X POST "http://${AWS_LAMBDA_RUNTIME_API}/2018-06-01/runtime/invocation/$request_id/response" -d "$response"
}

# Function to send error response
send_error() {
    local request_id="$1"
    local error_type="$2"
    local error_message="$3"
    
    echo "Sending error response: $error_type - $error_message" >> "$LOG_FILE"
    
    local error_json="{\"errorType\":\"$error_type\",\"errorMessage\":\"$error_message\"}"
    curl -s -X POST "http://${AWS_LAMBDA_RUNTIME_API}/2018-06-01/runtime/invocation/$request_id/error" -d "$error_json"
}

# Prepare environment for rotation script
prepare_environment() {
    # Install required utilities if not already available
    if ! command -v jq &> /dev/null; then
        echo "Installing jq..." >> "$LOG_FILE"
        yum install -y jq
    fi
    
    if ! command -v psql &> /dev/null; then
        echo "Installing PostgreSQL client..." >> "$LOG_FILE"
        amazon-linux-extras install -y postgresql13
    fi
    
    # Make rotation script executable
    chmod +x "$SCRIPT_PATH"
    
    # Extract database credentials from AWS Secrets Manager if enabled
    if [[ "${USE_AWS_SECRETS:-false}" == "true" && -n "${AWS_SECRET_ID:-}" ]]; then
        echo "Retrieving credentials from AWS Secrets Manager..." >> "$LOG_FILE"
        
        local secret_value
        secret_value=$(aws secretsmanager get-secret-value \
            --secret-id "$AWS_SECRET_ID" \
            --query 'SecretString' \
            --output text)
        
        # Export credentials as environment variables for the rotation script
        export DB_SECRET_USERNAME=$(echo "$secret_value" | jq -r '.username // ""')
        export DB_SECRET_DBNAME=$(echo "$secret_value" | jq -r '.dbname // ""')
        export DB_SECRET_HOST=$(echo "$secret_value" | jq -r '.host // ""')
        export DB_SECRET_PORT=$(echo "$secret_value" | jq -r '.port // "5432"')
        export DB_SECRET_PASSWORD=$(echo "$secret_value" | jq -r '.password // ""')
        
        # For Supabase setup
        if [[ "${DB_HOST_TYPE:-postgres}" == "supabase" ]]; then
            export SUPABASE_PROJECT_REF=$(echo "$secret_value" | jq -r '.project_ref // ""')
            
            # Get Supabase API key from separate secret (for security isolation)
            if [[ -n "${SUPABASE_API_KEY_SECRET_ID:-}" ]]; then
                local supabase_api_key
                supabase_api_key=$(aws secretsmanager get-secret-value \
                    --secret-id "$SUPABASE_API_KEY_SECRET_ID" \
                    --query 'SecretString' \
                    --output text)
                export SUPABASE_MANAGEMENT_API_KEY="$supabase_api_key"
            fi
        fi
    fi
}

# Main Lambda handler loop
main() {
    # Prepare the environment
    prepare_environment
    
    # Process incoming events
    while true; do
        # Get next Lambda invocation
        echo "Waiting for next invocation..." >> "$LOG_FILE"
        HEADERS="$(mktemp)"
        EVENT_DATA=$(curl -sS -LD "$HEADERS" "http://${AWS_LAMBDA_RUNTIME_API}/2018-06-01/runtime/invocation/next")
        REQUEST_ID=$(grep -Fi Lambda-Runtime-Aws-Request-Id "$HEADERS" | tr -d '[:space:]' | cut -d: -f2)
        
        echo "Received request $REQUEST_ID" >> "$LOG_FILE"
        echo "Event data: $EVENT_DATA" >> "$LOG_FILE"
        
        # Extract any event-specific parameters
        EVENT_SOURCE=$(echo "$EVENT_DATA" | jq -r '.source // "manual"')
        
        # Process based on event source
        if [[ "$EVENT_SOURCE" == "aws.events" ]]; then
            # This is a scheduled EventBridge event
            echo "Processing scheduled rotation" >> "$LOG_FILE"
        else
            # Extract any parameters from the event
            PARAMS=$(echo "$EVENT_DATA" | jq -r '.params // {}')
            echo "Processing manual rotation with params: $PARAMS" >> "$LOG_FILE"
            
            # Extract specific parameters if needed
            OVERRIDE_DB_TYPE=$(echo "$PARAMS" | jq -r '.db_host_type // ""')
            if [[ -n "$OVERRIDE_DB_TYPE" ]]; then
                export DB_HOST_TYPE="$OVERRIDE_DB_TYPE"
            fi
        fi
        
        # Run the rotation script and capture output
        echo "Running rotation script..." >> "$LOG_FILE"
        ROTATION_OUTPUT_FILE="$TEMP_DIR/rotation_output.txt"
        ROTATION_EXIT_CODE=0
        
        # Execute rotation script with output and error capture
        if ! "$SCRIPT_PATH" > "$ROTATION_OUTPUT_FILE" 2>&1; then
            ROTATION_EXIT_CODE=$?
            echo "Rotation script failed with exit code $ROTATION_EXIT_CODE" >> "$LOG_FILE"
        fi
        
        # Capture output into a variable
        ROTATION_OUTPUT=$(<"$ROTATION_OUTPUT_FILE")
        echo "Rotation script output:" >> "$LOG_FILE"
        echo "$ROTATION_OUTPUT" >> "$LOG_FILE"
        
        # Prepare response
        if [[ $ROTATION_EXIT_CODE -eq 0 ]]; then
            # Success response
            RESPONSE=$(jq -n \
                --arg status "success" \
                --arg message "Database password rotation completed successfully" \
                --arg details "$ROTATION_OUTPUT" \
                --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
                '{status: $status, message: $message, details: $details, timestamp: $timestamp}')
            
            send_response "$REQUEST_ID" "$RESPONSE"
        else
            # Error response
            ERROR_MESSAGE="Database password rotation failed with exit code $ROTATION_EXIT_CODE"
            send_error "$REQUEST_ID" "RotationError" "$ERROR_MESSAGE\n\nDetails:\n$ROTATION_OUTPUT"
        fi
    done
}

# Start the handler
main
