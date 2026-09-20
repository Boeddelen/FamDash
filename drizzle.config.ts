import { defineConfig } from 'drizzle-kit';
import { join } from 'node:path';

export default defineConfig({
	dialect: 'sqlite',
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dbCredentials: {
		url: process.env.DB_PATH ?? join(process.cwd(), 'data', 'dashboard.db')
	}
});
