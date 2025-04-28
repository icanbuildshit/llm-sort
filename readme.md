# Enterprise Database Password Rotation System

This system provides an automated, secure mechanism for rotating database credentials across multiple database platforms (PostgreSQL and Supabase). It's designed for enterprise environments with strict security requirements.

## Overview

The database password rotation system supports:

- Multi-platform databases (PostgreSQL and Supabase)
- Automated rotation on a defined schedule (typically quarterly)
- Manual rotation through CI/CD or direct AWS Lambda invocation
- High-security password generation with configurable complexity
- Database backup before rotation (for PostgreSQL)
- Comprehensive logging and notifications
- AWS Secrets Manager integration
- CI/CD platform secrets updates

## Components

This system consists of the following components:

1. **Rotation Script** (`db-password-rotation.sh`) - Core script that handles the password rotation process
2. **AWS Lambda Function** (`bootstrap`) - Wrapper for AWS Lambda execution environment
3. **Terraform Infrastructure** - IaC for AWS deployment
4. **GitHub Actions Workflow** - CI/CD integration for scheduled or manual rotation

## Setup Instructions

### Option 1: AWS Lambda Deployment

1. Deploy the infrastructure using Terraform:

```bash
cd terraform
terraform init
terraform apply -var-file=environments/production.tfvars
```

2. Package the Lambda function:

```bash
mkdir -p lambda-package
cp db-password-rotation.sh lambda-package/
cp bootstrap lambda-package/
cd lambda-package
chmod +x bootstrap db-password-rotation.sh
zip -r ../lambda-package.zip .
```

3. Update the Lambda function code (if already deployed):

```bash
aws lambda update-function-code \
  --function-name dynagen-production-db-password-rotation \
  --zip-file fileb://lambda-package.zip
```

### Option 2: CI/CD Integration (GitHub Actions)

1. Store the rotation script in your repository under `scripts/db-password-rotation.sh`

2. Add the GitHub Actions workflow file to `.github/workflows/db-password-rotation.yml`

3. Configure the required secrets in your GitHub repository:
   - `DB_USERNAME`
   - `DB_PASSWORD` (current password)
   - `DB_NAME`
   - `DB_HOST`
   - `DB_PORT` (optional, defaults to 5432)
   - `AWS_ROLE_ARN` (for AWS authentication)
   - `AWS_REGION`
   - `SLACK_WEBHOOK_URL` (for notifications)
   - `SUPABASE_PROJECT_REF` (if using Supabase)
   - `SUPABASE_MANAGEMENT_API_KEY` (if using Supabase)

4. Trigger rotation manually or rely on the scheduled execution (quarterly by default)

## Configuration Options

### Database Host Types

The system supports two database host types:

- **postgres**: Traditional PostgreSQL database with direct SQL connection
- **supabase**: Supabase-hosted PostgreSQL with Management API integration

Set the `DB_HOST_TYPE` environment variable to specify which type you're using.

### Password Generation

By default, the system generates secure 32-character passwords with:

- Uppercase letters
- Lowercase letters
- Numbers
- Special characters

The password generation is designed to meet enterprise security requirements and avoids characters that could cause issues with SQL statements.

### Notification Options

The system supports two notification methods:

- **Slack**: Send notifications to a Slack channel via webhook
- **SNS**: AWS Simple Notification Service (in Lambda deployment)

Configure the appropriate webhook URL or SNS topic ARN to receive notifications.

## Rotation Process

1. **Preparation**:
   - Verify required environment variables
   - Generate a secure new password
   - Create database backup (PostgreSQL only)

2. **Password Update**:
   - For PostgreSQL: Execute `ALTER USER` SQL command
   - For Supabase: Call Management API to update password

3. **Verification**:
   - Test connection with new password
   - Ensure database operations still work

4. **Secret Updates**:
   - Update AWS Secrets Manager (if configured)
   - Update CI/CD platform secrets (if supported)

5. **Notification**:
   - Send success/failure notification

## Security Considerations

This system implements several security best practices:

- **Least Privilege**: Lambda functions use minimal IAM permissions
- **Secure Password Generation**: High-entropy passwords with complexity requirements
- **Backup Before Changes**: Database is backed up before modifications
- **Connection Verification**: New password is tested before completing
- **Secure Storage**: Passwords stored in AWS Secrets Manager or equivalent
- **Audit Trail**: Comprehensive logging for all operations
- **Failure Handling**: Clear error reporting and notifications

## Troubleshooting

### Common Issues

1. **Database Connection Failures**:
   - Verify credentials are correct
   - Check network connectivity and security groups
   - Ensure database port is accessible

2. **Permission Errors**:
   - Verify the database user has permission to change passwords
   - Check AWS IAM roles have correct permissions
   - For Supabase, verify API key has management permissions

3. **Notification Failures**:
   - Check webhook URLs are valid and accessible
   - Verify SNS topic permissions

### Log Files

- AWS Lambda logs are available in CloudWatch Logs
- CI/CD logs are available in GitHub Actions runs
- Local execution logs are stored at the path specified in `LOG_FILE`

## Maintenance

- Review and test the rotation process quarterly
- Update the script as database platforms evolve
- Rotate the Supabase Management API key annually
- Verify backup mechanisms regularly

## License

This project is licensed under the MIT License - see the LICENSE file for details.
