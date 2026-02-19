export interface MultimodalImageAttachment {
	kind: "image";
	ordinal?: number;
	sha256: string;
	mime_type: string;
	base64: string;
}

export interface MultimodalPdfAttachment {
	kind: "pdf";
	ordinal?: number;
	source_url: string;
	excerpt_text?: string;
}

export type MultimodalAttachment =
	| MultimodalImageAttachment
	| MultimodalPdfAttachment;

export interface MultimodalClassifyPost {
	post_id: string;
	text: string;
	attachments: MultimodalAttachment[];
}
