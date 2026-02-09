import { describe, expect, it } from 'bun:test';
import { extractPostData } from './linkedin-parser';
import { SELECTORS } from '../lib/selectors';

type QueryNode = {
  textContent?: string;
  className?: string;
  getAttribute?: (name: string) => string | null;
};

function textNode(text: string): QueryNode {
  return { textContent: text };
}

function attrNode(attributes: Record<string, string>, textContent = ''): QueryNode {
  return {
    textContent,
    getAttribute: (name: string) => attributes[name] ?? null,
  };
}

function makeFeedCase(overrides: {
  rootText?: string;
  repostTexts?: string[];
  imageNodes?: Array<{ src: string; alt: string }>;
  document?: { iframeSrc?: string; containerDataUrl?: string; sourceHintText?: string };
}): HTMLElement {
  const postUrn = 'urn:li:activity:case-1';
  const rootText = overrides.rootText ?? 'Root body';
  const repostTexts = overrides.repostTexts ?? [];
  const imageNodes = overrides.imageNodes ?? [];

  const rootContentNode = textNode(rootText);
  const repostTextNodes = repostTexts.map(textNode);
  const imageQueryNodes = imageNodes.map((image) => attrNode({ src: image.src, alt: image.alt }));
  const documentContainerNodes = overrides.document?.containerDataUrl
    ? [attrNode({ 'data-url': overrides.document.containerDataUrl })]
    : [];
  const documentIframeNodes = overrides.document?.iframeSrc
    ? [attrNode({ src: overrides.document.iframeSrc })]
    : [];
  const documentHintNodes = overrides.document?.sourceHintText
    ? [textNode(overrides.document.sourceHintText)]
    : [];

  return {
    matches: (selector: string) => selector === SELECTORS.candidatePostRoot,
    classList: { contains: (token: string) => token === 'feed-shared-update-v2' },
    getAttribute: (name: string) => (name === 'data-urn' ? postUrn : null),
    querySelector: (selector: string): QueryNode | null => {
      if (selector === SELECTORS.recommendationEntity) return null;
      if (selector === SELECTORS.postUrn) return attrNode({ 'data-urn': postUrn });
      if (selector === SELECTORS.authorLink) return attrNode({ href: '/in/case-author/' });
      if (selector === SELECTORS.authorName) return textNode('Case Author');
      if (selector === SELECTORS.postContent) return rootContentNode;
      if (selector === SELECTORS.documentIframe) return documentIframeNodes[0] ?? null;
      if (selector === SELECTORS.documentContainer) return documentContainerNodes[0] ?? null;
      return null;
    },
    querySelectorAll: (selector: string): QueryNode[] => {
      if (selector === SELECTORS.postContent) return [rootContentNode];
      if (selector === SELECTORS.imageNodes) return imageQueryNodes;
      if (selector === SELECTORS.documentContainer) return documentContainerNodes;
      if (selector === SELECTORS.documentIframe) return documentIframeNodes;
      if (selector === SELECTORS.documentSourceHints) return documentHintNodes;
      if (selector.includes('update-components-mini-update-v2__link-to-details-page')) {
        return repostTextNodes;
      }
      return [];
    },
  } as unknown as HTMLElement;
}

describe('extractPostData LinkedIn structure coverage (multimodal parser)', () => {
  it('creates root and repost nodes in deterministic DOM order with parent mapping', async () => {
    const element = makeFeedCase({
      rootText: 'Root commentary from sharer.',
      repostTexts: ['Nested original post body.', 'Second nested block.'],
    });

    const result = await extractPostData(element);
    expect(result).not.toBeNull();
    expect(result?.nodes.map((node) => node.id)).toEqual(['root', 'repost-0', 'repost-1']);
    expect(result?.nodes.map((node) => node.parent_id)).toEqual([null, 'root', 'root']);
    expect(result?.nodes.map((node) => node.text)).toEqual([
      'root commentary from sharer.',
      'nested original post body.',
      'second nested block.',
    ]);
  });

  it('extracts image references with src, alt, and ordinal metadata', async () => {
    const element = makeFeedCase({
      rootText: 'Image post',
      imageNodes: [
        {
          src: 'https://media.licdn.com/a.jpg',
          alt: 'Architecture diagram for Q1 roadmap',
        },
        {
          src: 'https://media.licdn.com/b.jpg',
          alt: 'Second chart',
        },
      ],
    });

    const result = await extractPostData(element);
    expect(result).not.toBeNull();
    expect(result?.attachments).toEqual([
      {
        node_id: 'root',
        kind: 'image',
        src: 'https://media.licdn.com/a.jpg',
        alt: 'Architecture diagram for Q1 roadmap',
        ordinal: 0,
      },
      {
        node_id: 'root',
        kind: 'image',
        src: 'https://media.licdn.com/b.jpg',
        alt: 'Second chart',
        ordinal: 1,
      },
    ]);
  });

  it('extracts pdf references with iframe source and container metadata', async () => {
    const element = makeFeedCase({
      rootText: 'Document post',
      document: {
        iframeSrc: 'https://media.licdn.com/dms/document/C4D1/document-element',
        containerDataUrl: 'https://media.licdn.com/dms/document/C4D1/feedshare-document-pdf',
        sourceHintText: 'feedshare-document',
      },
    });

    const result = await extractPostData(element);
    expect(result).not.toBeNull();
    expect(result?.attachments).toEqual([
      {
        node_id: 'root',
        kind: 'pdf',
        iframe_src: 'https://media.licdn.com/dms/document/C4D1/document-element',
        container_data_url: 'https://media.licdn.com/dms/document/C4D1/feedshare-document-pdf',
        source_hint: 'feedshare-document',
        ordinal: 0,
      },
    ]);
  });

  it('does not emit attachments for unrelated cards', async () => {
    const element = makeFeedCase({
      rootText: 'Text-only post with external link card.',
    });

    const result = await extractPostData(element);
    expect(result).not.toBeNull();
    expect(result?.attachments).toEqual([]);
  });
});
