export const DEFAULT_LLM_PREAMBLE = [
  'You are helping draft a written communication for the user.',
  '',
  'You will receive an XML document that wraps a source document plus LLM callouts.',
  'Your job is to apply the callouts to produce an updated document.'
].join('\n');

export const DEFAULT_ITERATION_PREAMBLE = [
  'Iteration scope guidance:',
  '- Scope mode: {{scope_mode}}',
  '- Scope location: {{scope_location}}',
  '',
  'Instructions:',
  '- Only return updated text for the scoped section.',
  '- Do not rewrite the full document.'
].join('\n');

export const DEFAULT_CALLOUTS_STATE = {
  overall: [] as Array<unknown>,
  inline: [] as Array<unknown>
};

export const DEFAULT_CONTEXTS_STATE = {
  items: [] as Array<unknown>
};

export const DEFAULT_SCOPE_STATE = {
  mode: 'full',
  selection: null as null
};

export const DEFAULT_LLM_SESSION = {
  provider: 'openai',
  model: null as null | string,
  messages: [] as Array<unknown>
};

export function getDefaultLexicalDoc(): Record<string, unknown> {
  return {
    root: {
      children: [
        {
          children: [],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'paragraph',
          version: 1
        }
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1
    }
  };
}
