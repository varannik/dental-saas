variable "aws_region" {
  description = "AWS region - SINGLE region for ALL resources (no cross-region)"
  type        = string
  default     = "eu-central-1"
  
  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]{1}$", var.aws_region))
    error_message = "AWS region must be valid format (e.g., us-east-1, eu-west-1)"
  }
}

variable "environment" {
  description = "Environment name"
  type        = string
  
  validation {
    condition     = contains(["local", "staging", "production"], var.environment)
    error_message = "Environment must be local, staging, or production."
  }
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.medium"
}

variable "eks_node_instance_types" {
  description = "EKS node instance types"
  type        = list(string)
  default     = ["t3.medium"]
}

variable "eks_desired_capacity" {
  description = "EKS desired node capacity"
  type        = number
  default     = 3
}

variable "eks_min_capacity" {
  description = "EKS minimum node capacity"
  type        = number
  default     = 2
}

variable "eks_max_capacity" {
  description = "EKS maximum node capacity"
  type        = number
  default     = 10
}

