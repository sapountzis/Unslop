export type MultimodalNodeKind = 'root' | 'repost';

export interface MultimodalPostNode {
  id: string;
  parent_id: string | null;
  kind: MultimodalNodeKind;
  text: string;
}

export interface MultimodalImageAttachment {
  node_id: string;
  kind: 'image';
  sha256: string;
  mime_type: string;
  base64: string;
}

export interface MultimodalPdfAttachment {
  node_id: string;
  kind: 'pdf';
  source_url: string;
  excerpt_text?: string;
}

export type MultimodalAttachment = MultimodalImageAttachment | MultimodalPdfAttachment;

export interface MultimodalClassifyPost {
  post_id: string;
  author_id: string;
  author_name: string;
  nodes: MultimodalPostNode[];
  attachments: MultimodalAttachment[];
}
