environment = "production"
aws_region  = "eu-central-1"

vpc_cidr = "10.0.0.0/16"

rds_instance_class = "db.r6g.large"
redis_node_type    = "cache.r6g.large"

eks_node_instance_types = ["t3.large", "t3.xlarge"]
eks_desired_capacity    = 5
eks_min_capacity        = 3
eks_max_capacity        = 20

