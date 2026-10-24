import 'dotenv/config';

// Reads and validates environment variables. Credentials never leave this
// module except inside the connection URI; use describeMongoTarget() for logs.

const required = (name) => {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable ${name} (see backend/.env.example)`);
  }
  return value.trim();
};

export function getMongoConfig() {
  return {
    username: required('DB_USERNAME'),
    password: required('DB_PASSWORD'),
    clusterUrl: required('DB_CLUSTER_URL'),
    dbName: required('DB_NAME'),
  };
}

// mongodb+srv URI with URL-encoded credentials (the password may contain @, :, / …).
export function buildMongoUri({ username, password, clusterUrl, dbName }) {
  const host = clusterUrl.replace(/^mongodb(\+srv)?:\/\//, '').replace(/\/+$/, '');
  return (
    `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}` +
    `@${host}/${encodeURIComponent(dbName)}?retryWrites=true&w=majority`
  );
}

// Safe for logs: no password, no full URI.
export function describeMongoTarget({ username, clusterUrl, dbName }) {
  return `${username}@${clusterUrl}/${dbName}`;
}

// Optional: Redis is used only when REDIS_URL is set
// (redis://redis:6379 in Docker Compose, redis://localhost:6379 from the host).
export function getRedisUrl() {
  const value = process.env.REDIS_URL?.trim();
  return value || null;
}

// Safe for logs: scheme, host, port and database number, without credentials.
export function describeRedisTarget(url) {
  try {
    const { protocol, hostname, port, pathname } = new URL(url);
    return `${protocol}//${hostname}:${port || 6379}${pathname.length > 1 ? pathname : ''}`;
  } catch {
    return 'invalid REDIS_URL';
  }
}
