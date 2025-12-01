-- Initialize separate databases for each service
CREATE DATABASE auth;
CREATE DATABASE users;
CREATE DATABASE billing;
CREATE DATABASE notifications;
CREATE DATABASE files;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE auth TO postgres;
GRANT ALL PRIVILEGES ON DATABASE users TO postgres;
GRANT ALL PRIVILEGES ON DATABASE billing TO postgres;
GRANT ALL PRIVILEGES ON DATABASE notifications TO postgres;
GRANT ALL PRIVILEGES ON DATABASE files TO postgres;

