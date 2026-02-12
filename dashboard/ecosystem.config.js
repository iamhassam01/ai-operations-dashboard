module.exports = {
  apps: [
    {
      name: 'ai-dashboard',
      cwd: '/opt/ai-dashboard',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_NAME: 'ai_operations_agent',
        DB_USER: 'openclaw_user',
        DB_PASSWORD: process.env.DB_PASSWORD,
        OPENCLAW_URL: 'http://127.0.0.1:18789',
        OPENCLAW_TOKEN: process.env.OPENCLAW_TOKEN,
        OPENCLAW_HOOK_TOKEN: process.env.OPENCLAW_HOOK_TOKEN,
      },
      max_memory_restart: '500M',
      instances: 1,
      autorestart: true,
      watch: false,
    },
  ],
};
