# Local development environment configuration
# Uses LocalStack for AWS service mocks

environment = "local"
aws_region  = "eu-central-1"

# VPC Configuration (LocalStack doesn't fully support VPC, simplified for local)
vpc_cidr = "10.0.0.0/16"

# Database Configuration (LocalStack RDS is limited, consider using Docker PostgreSQL directly)
rds_instance_class = "db.t3.micro"

# Redis Configuration (LocalStack ElastiCache is limited, use Docker Redis directly)
redis_node_type = "cache.t3.micro"

# Note: For local development, it's better to use:
# - Docker PostgreSQL instead of LocalStack RDS
# - Docker Redis instead of LocalStack ElastiCache
# - LocalStack S3 for file storage (works well!)

