environment = "staging"
aws_region  = "eu-central-1"

vpc_cidr = "10.1.0.0/16"

rds_instance_class = "db.t3.medium"
redis_node_type    = "cache.t3.medium"

eks_node_instance_types = ["t3.medium"]
eks_desired_capacity    = 2
eks_min_capacity        = 1
eks_max_capacity        = 5

