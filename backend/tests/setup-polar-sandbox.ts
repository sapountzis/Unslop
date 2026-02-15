import { fetch } from "bun";

const POLAR_ACCESS_TOKEN = process.env.POLAR_SANDBOX_ACCESS_TOKEN;
const POLAR_API_BASE = "https://sandbox-api.polar.sh";

if (!POLAR_ACCESS_TOKEN) {
	throw new Error("POLAR_SANDBOX_ACCESS_TOKEN required for integration tests");
}

interface Product {
	id: string;
	name: string;
	prices: Array<{
		id: string;
		type: string;
		recurring_interval: string;
	}>;
}

async function createTestProduct(productName: string): Promise<Product> {
	const response = await fetch(`${POLAR_API_BASE}/v1/products`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			name: productName,
			description: "Test product for Unslop integration tests",
			is_recurring: true,
			prices: [
				{
					amount: 399,
					currency: "EUR",
					type: "recurring",
					recurring_interval: "month",
				},
			],
		}),
	});

	if (!response.ok) {
		throw new Error(`Failed to create product: ${await response.text()}`);
	}

	return response.json();
}

async function createWebhookEndpoint(
	url: string,
	organizationId: string,
): Promise<{ id: string; secret: string }> {
	const response = await fetch(`${POLAR_API_BASE}/v1/webhooks/endpoints`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			url,
			organization_id: organizationId,
			events: [
				"subscription.created",
				"subscription.active",
				"subscription.updated",
				"subscription.uncanceled",
				"subscription.canceled",
				"subscription.revoked",
				"subscription.past_due",
			],
		}),
	});

	if (!response.ok) {
		throw new Error(`Failed to create webhook: ${await response.text()}`);
	}

	const result = await response.json();
	return { id: result.id, secret: result.secret };
}

async function deleteProduct(productId: string): Promise<void> {
	await fetch(`${POLAR_API_BASE}/v1/products/${productId}`, {
		method: "DELETE",
		headers: {
			Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
		},
	});
}

async function deleteWebhook(webhookId: string): Promise<void> {
	await fetch(`${POLAR_API_BASE}/v1/webhooks/endpoints/${webhookId}`, {
		method: "DELETE",
		headers: {
			Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
		},
	});
}

export {
	createTestProduct,
	createWebhookEndpoint,
	deleteProduct,
	deleteWebhook,
};
