import { createHash } from "crypto";

export interface ContentAttachment {
	kind: string;
	ordinal?: number;
	[key: string]: string | number | boolean | null | undefined;
}

export interface ContentFingerprintInput {
	post_id: string;
	text: string;
	attachments: ContentAttachment[];
}

type CanonicalJsonPrimitive = string | number | boolean | null;
type CanonicalJsonValue =
	| CanonicalJsonPrimitive
	| CanonicalJsonValue[]
	| CanonicalJsonObject;
interface CanonicalJsonObject {
	[key: string]: CanonicalJsonValue;
}

function isCanonicalJsonObject(
	value: CanonicalJsonValue | undefined,
): value is CanonicalJsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function sortAttachments(
	attachments: ContentAttachment[],
): ContentAttachment[] {
	return attachments
		.map((attachment, index) => ({
			...attachment,
			ordinal: attachment.ordinal ?? index,
		}))
		.sort((left, right) => {
			if (left.ordinal !== right.ordinal) {
				return (left.ordinal ?? 0) - (right.ordinal ?? 0);
			}

			const byKind = left.kind.localeCompare(right.kind);
			if (byKind !== 0) {
				return byKind;
			}

			return stableStringify(toCanonicalJson(left) ?? null).localeCompare(
				stableStringify(toCanonicalJson(right) ?? null),
			);
		});
}

function toCanonicalJson(value: unknown): CanonicalJsonValue | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "boolean"
	) {
		return value;
	}

	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new Error(
				"Non-finite numbers are not supported in content fingerprints",
			);
		}

		return value;
	}

	if (Array.isArray(value)) {
		const arrayValues: CanonicalJsonValue[] = [];

		for (const item of value) {
			const converted = toCanonicalJson(item);
			arrayValues.push(converted ?? null);
		}

		return arrayValues;
	}

	if (typeof value === "object") {
		const objectValue = value as Record<string, unknown>;
		const canonical: CanonicalJsonObject = {};

		const keys = Object.keys(objectValue).sort((a, b) => a.localeCompare(b));
		for (const key of keys) {
			const converted = toCanonicalJson(objectValue[key]);
			if (converted !== undefined) {
				canonical[key] = converted;
			}
		}

		return canonical;
	}

	throw new Error(
		`Unsupported value type in content fingerprint: ${typeof value}`,
	);
}

function stableStringify(value: CanonicalJsonValue): string {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}

	const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
	const entries = keys.map(
		(key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`,
	);

	return `{${entries.join(",")}}`;
}

export function canonicalizeContentFingerprintInput(
	input: ContentFingerprintInput,
): CanonicalJsonObject {
	const sortedAttachments = sortAttachments(input.attachments);

	const canonical = toCanonicalJson({
		post_id: input.post_id,
		text: normalizeText(input.text),
		attachments: sortedAttachments,
	});

	if (!isCanonicalJsonObject(canonical)) {
		throw new Error(
			"Content fingerprint payload must canonicalize to an object",
		);
	}

	return canonical;
}

export function computeContentFingerprint(
	input: ContentFingerprintInput,
): string {
	const canonicalPayload = canonicalizeContentFingerprintInput(input);
	const canonicalJson = stableStringify(canonicalPayload);
	return createHash("sha256").update(canonicalJson, "utf-8").digest("hex");
}
