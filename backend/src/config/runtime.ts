import {
	DEFAULT_BATCH_LLM_CONCURRENCY,
	DEFAULT_FREE_MONTHLY_LLM_CALLS,
	DEFAULT_PRO_MONTHLY_LLM_CALLS,
} from "../lib/policy-constants";

type EnvSource = Record<string, string | undefined>;

export interface RuntimeConfig {
	testMode: boolean;
	server: {
		nodeEnv: string;
		port: number;
		appUrl: string;
	};
	db: {
		url: string;
	};
	llm: {
		apiKey: string;
		textModel: string;
		vlmModel: string;
		baseUrl: string;
	};
	billing: {
		polarEnv: "sandbox" | "production";
		polarApiKey: string;
		polarWebhookSecret: string;
		polarProductId: string;
		polarApiBase: string;
	};
	quotas: {
		freeMonthlyLlmCalls: number;
		proMonthlyLlmCalls: number;
	};
	auth: {
		jwtSecret: string;
	};
	email: {
		resendApiKey: string;
		magicLinkBaseUrl: string;
		logMagicLinkUrls: boolean;
	};
	classification: {
		batchConcurrency: number;
	};
}

interface RuntimeOptions {
	allowMissingSecrets?: boolean;
}

function requireString(
	env: EnvSource,
	name: string,
	allowEmpty = false,
): string {
	const value = env[name];
	if (value === undefined || (!allowEmpty && value.trim().length === 0)) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function parseInteger(
	env: EnvSource,
	name: string,
	fallback: number,
	minimum = 1,
): number {
	const raw = env[name];
	if (raw === undefined || raw.trim().length === 0) {
		return fallback;
	}

	const parsed = Number.parseInt(raw, 10);
	if (!Number.isInteger(parsed) || parsed < minimum) {
		throw new Error(
			`Invalid integer env var ${name}: "${raw}" (min ${minimum})`,
		);
	}

	return parsed;
}

function parseBoolean(
	env: EnvSource,
	name: string,
	fallback: boolean,
): boolean {
	const raw = env[name];
	if (raw === undefined || raw.trim().length === 0) {
		return fallback;
	}

	if (raw === "true") return true;
	if (raw === "false") return false;
	throw new Error(
		`Invalid boolean env var ${name}: "${raw}" (expected true|false)`,
	);
}

function readSecret(
	env: EnvSource,
	name: string,
	allowMissing: boolean,
): string {
	if (allowMissing) {
		return env[name] ?? "";
	}
	return requireString(env, name);
}

export function loadRuntimeConfig(
	env: EnvSource = process.env,
	options: RuntimeOptions = {},
): RuntimeConfig {
	const testMode = env.TEST_MODE === "true";
	const allowMissingSecrets = options.allowMissingSecrets ?? testMode;

	// In Workers, db.url comes from HYPERDRIVE.connectionString, not DATABASE_URL
	const databaseUrl = env.DATABASE_URL ?? "";
	const appUrl = requireString(env, "APP_URL");

	const polarEnv = env.POLAR_ENV === "sandbox" ? "sandbox" : "production";

	return {
		testMode,
		server: {
			nodeEnv: env.NODE_ENV ?? "development",
			port: parseInteger(env, "PORT", 3000),
			appUrl,
		},
		db: {
			url: databaseUrl,
		},
		llm: {
			apiKey: readSecret(env, "LLM_API_KEY", allowMissingSecrets),
			textModel: readSecret(env, "LLM_MODEL", allowMissingSecrets),
			vlmModel: readSecret(env, "VLM_MODEL", allowMissingSecrets),
			baseUrl: env.LLM_BASE_URL?.trim() || "https://openrouter.ai/api/v1",
		},
		billing: {
			polarEnv,
			polarApiKey: readSecret(env, "POLAR_API_KEY", allowMissingSecrets),
			polarWebhookSecret: readSecret(
				env,
				"POLAR_WEBHOOK_SECRET",
				allowMissingSecrets,
			),
			polarProductId: readSecret(env, "POLAR_PRODUCT_ID", allowMissingSecrets),
			polarApiBase:
				polarEnv === "sandbox"
					? "https://sandbox-api.polar.sh"
					: "https://api.polar.sh",
		},
		quotas: {
			freeMonthlyLlmCalls: parseInteger(
				env,
				"FREE_MONTHLY_LLM_CALLS",
				DEFAULT_FREE_MONTHLY_LLM_CALLS,
			),
			proMonthlyLlmCalls: parseInteger(
				env,
				"PRO_MONTHLY_LLM_CALLS",
				DEFAULT_PRO_MONTHLY_LLM_CALLS,
			),
		},
		auth: {
			jwtSecret: readSecret(env, "JWT_SECRET", allowMissingSecrets),
		},
		email: {
			resendApiKey: env.RESEND_API_KEY ?? "",
			magicLinkBaseUrl: requireString(env, "MAGIC_LINK_BASE_URL"),
			logMagicLinkUrls: parseBoolean(env, "LOG_MAGIC_LINK_URLS", false),
		},
		classification: {
			batchConcurrency: parseInteger(
				env,
				"BATCH_LLM_CONCURRENCY",
				DEFAULT_BATCH_LLM_CONCURRENCY,
			),
		},
	};
}
