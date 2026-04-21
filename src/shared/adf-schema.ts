import { z } from 'zod';

const ADF_NODE_TYPES = [
  'blockCard',
  'blockquote',
  'blockTaskItem',
  'bodiedExtension',
  'bodiedSyncBlock',
  'bulletList',
  'caption',
  'codeBlock',
  'date',
  'decisionItem',
  'decisionList',
  'doc',
  'embedCard',
  'emoji',
  'expand',
  'extension',
  'hardBreak',
  'heading',
  'inlineCard',
  'inlineExtension',
  'layoutColumn',
  'layoutSection',
  'listItem',
  'media',
  'mediaGroup',
  'mediaInline',
  'mediaSingle',
  'mention',
  'nestedExpand',
  'orderedList',
  'panel',
  'paragraph',
  'placeholder',
  'rule',
  'status',
  'syncBlock',
  'table',
  'tableCell',
  'tableHeader',
  'tableRow',
  'taskItem',
  'taskList',
  'text'
] as const;

const ADF_MARK_TYPES = [
  'alignment',
  'annotation',
  'backgroundColor',
  'border',
  'breakout',
  'code',
  'dataConsumer',
  'em',
  'fragment',
  'indentation',
  'link',
  'strike',
  'strong',
  'subsup',
  'textColor',
  'underline'
] as const;

const AdfMark = z.looseObject({ type: z.enum(ADF_MARK_TYPES) });

const AdfNode: z.ZodType = z.lazy(() =>
  z
    .looseObject({
      type: z.enum(ADF_NODE_TYPES),
      content: z.array(AdfNode).optional(),
      text: z.string().optional(),
      marks: z.array(AdfMark).optional(),
      attrs: z.record(z.string(), z.unknown()).optional()
    })
    .refine((n) => n.type !== 'text' || typeof n.text === 'string', { message: 'text node requires a text field' })
);

export const AdfSchema = z.object({
  version: z.literal(1),
  type: z.literal('doc'),
  content: z.array(AdfNode)
});
