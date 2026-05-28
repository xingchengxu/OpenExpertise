import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'OpenExpertise',
  description:
    'AI-era Makefile — codify expert workflows as deterministic, persistent, self-improving YAML graphs.',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,

  // GitHub Pages serves the repo at https://xingchengxu.github.io/OpenExpertise/
  base: '/OpenExpertise/',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/OpenExpertise/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#6366f1' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: 'https://xingchengxu.github.io/OpenExpertise/' }],
    ['meta', { property: 'og:title', content: 'OpenExpertise — AI-era Makefile' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Codify expert workflows as YAML graphs. Run with deterministic flow + LLM-powered nodes. Evolve after each run.',
      },
    ],
    [
      'meta',
      { property: 'og:image', content: 'https://xingchengxu.github.io/OpenExpertise/og.png' },
    ],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'OpenExpertise — AI-era Makefile' }],
    [
      'meta',
      {
        name: 'twitter:description',
        content:
          'Codify expert workflows as YAML graphs. Multi-vendor LLM CLI orchestration. Self-evolving.',
      },
    ],
    [
      'meta',
      { name: 'twitter:image', content: 'https://xingchengxu.github.io/OpenExpertise/og.png' },
    ],
  ],

  themeConfig: {
    logo: { src: '/logo.svg', width: 24, height: 24 },
    siteTitle: 'OpenExpertise',

    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '^/guide/' },
      { text: 'Concepts', link: '/concepts/experiences', activeMatch: '^/concepts/' },
      { text: 'Examples', link: '/examples/', activeMatch: '^/examples/' },
      { text: 'Use cases', link: '/use-cases/', activeMatch: '^/use-cases/' },
      { text: 'Cookbook', link: '/cookbook/', activeMatch: '^/cookbook/' },
      {
        text: 'Reference',
        items: [
          { text: 'CLI', link: '/reference/cli/' },
          { text: 'API', link: '/reference/api/' },
          { text: 'YAML schema', link: '/reference/schema' },
        ],
      },
      { text: 'Compare', link: '/compare/', activeMatch: '^/compare/' },
      { text: 'Ecosystem', link: '/ecosystem', activeMatch: '^/ecosystem' },
      {
        text: 'Help',
        items: [
          { text: 'FAQ + troubleshooting', link: '/faq' },
          { text: 'Glossary', link: '/glossary' },
        ],
      },
      {
        text: 'v0.1.0',
        items: [
          { text: 'Roadmap', link: '/roadmap' },
          {
            text: 'Changelog',
            link: 'https://github.com/xingchengxu/OpenExpertise/blob/main/CHANGELOG.md',
          },
          {
            text: 'Contributing',
            link: 'https://github.com/xingchengxu/OpenExpertise/blob/main/CONTRIBUTING.md',
          },
          {
            text: 'Security',
            link: 'https://github.com/xingchengxu/OpenExpertise/blob/main/SECURITY.md',
          },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting started',
          collapsed: false,
          items: [
            { text: 'Install & first run', link: '/guide/getting-started' },
            { text: 'Your first experience', link: '/guide/first-experience' },
            { text: 'Run with an LLM', link: '/guide/run-with-llm' },
            { text: 'The TUI dashboard', link: '/guide/tui' },
          ],
        },
        {
          text: 'Authoring',
          collapsed: false,
          items: [
            { text: 'Hand-writing experience.yaml', link: '/guide/authoring-yaml' },
            { text: 'oe ultra — LLM authors for you', link: '/guide/authoring-ultra' },
            { text: 'From inside Claude Code', link: '/guide/authoring-slash-command' },
            { text: 'Tool stubs in .mjs', link: '/guide/tool-stubs' },
            { text: 'Prompt files', link: '/guide/prompt-files' },
          ],
        },
        {
          text: 'Running',
          collapsed: false,
          items: [
            { text: 'Concurrency + 429 retry', link: '/guide/concurrency' },
            { text: 'Resume + cache', link: '/guide/resume-cache' },
            { text: 'Error policies (on_error)', link: '/guide/on-error' },
            { text: 'Self-hosted LLMs (vLLM, Ollama)', link: '/guide/self-hosted-llm' },
          ],
        },
        {
          text: 'Evolving',
          collapsed: false,
          items: [
            { text: 'The advisor', link: '/guide/evolution-advisor' },
            { text: 'Applying proposals', link: '/guide/applying-proposals' },
            { text: 'Author → run → evolve loop', link: '/guide/closed-loop' },
          ],
        },
        {
          text: 'Integration',
          collapsed: false,
          items: [
            { text: 'MCP server (use OE from Claude Code)', link: '/guide/mcp-server' },
            { text: 'cli-agent node (call CLIs from OE)', link: '/guide/cli-agent-usage' },
            { text: 'Skills + SKILL.md', link: '/guide/skills' },
          ],
        },
      ],
      '/concepts/': [
        {
          text: 'Core model',
          collapsed: false,
          items: [
            { text: 'What is an experience?', link: '/concepts/experiences' },
            { text: 'Code-as-Law', link: '/concepts/code-as-law' },
            { text: 'The 6 node kinds', link: '/concepts/node-kinds' },
            { text: 'State (SQLite blackboard)', link: '/concepts/state' },
            { text: 'Edges & control flow', link: '/concepts/control-flow' },
            { text: 'Events & event log', link: '/concepts/events' },
          ],
        },
        {
          text: 'Node kinds in depth',
          collapsed: false,
          items: [
            { text: 'tool', link: '/concepts/node-tool' },
            { text: 'agent', link: '/concepts/node-agent' },
            { text: 'skill', link: '/concepts/node-skill' },
            { text: 'dataset', link: '/concepts/node-dataset' },
            { text: 'experience', link: '/concepts/node-experience' },
            { text: 'cli-agent', link: '/concepts/node-cli-agent' },
          ],
        },
        {
          text: 'Runtime',
          collapsed: false,
          items: [
            { text: 'Scheduler (Sequential + Parallel)', link: '/concepts/scheduler' },
            { text: 'Dispatchers', link: '/concepts/dispatchers' },
            { text: 'Cache key + memoization', link: '/concepts/cache' },
            { text: 'Evolution loop', link: '/concepts/evolution-loop' },
          ],
        },
      ],
      '/examples/': [
        {
          text: 'Walkthroughs',
          collapsed: false,
          items: [
            { text: 'All examples', link: '/examples/' },
            { text: 'hello-tool', link: '/examples/hello-tool' },
            { text: 'dataset-aggregate', link: '/examples/dataset-aggregate' },
            { text: 'agent-echo', link: '/examples/agent-echo' },
            { text: 'review-branch ★', link: '/examples/review-branch' },
            { text: 'oncall-runbook', link: '/examples/oncall-runbook' },
            { text: 'issue-triage', link: '/examples/issue-triage' },
            { text: 'release-gates', link: '/examples/release-gates' },
            { text: 'cli-orchestration', link: '/examples/cli-orchestration' },
            { text: 'tri-cli-orchestration ★', link: '/examples/tri-cli-orchestration' },
            { text: 'deep-research', link: '/examples/deep-research' },
            { text: 'systematic-debugging', link: '/examples/systematic-debugging' },
            { text: 'brainstorming', link: '/examples/brainstorming' },
          ],
        },
      ],
      '/reference/cli/': [
        {
          text: 'CLI reference',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/reference/cli/' },
            { text: 'oe init', link: '/reference/cli/init' },
            { text: 'oe validate', link: '/reference/cli/validate' },
            { text: 'oe run', link: '/reference/cli/run' },
            { text: 'oe resume', link: '/reference/cli/resume' },
            { text: 'oe inspect', link: '/reference/cli/inspect' },
            { text: 'oe state', link: '/reference/cli/state' },
            { text: 'oe reset-state', link: '/reference/cli/reset-state' },
            { text: 'oe evolve', link: '/reference/cli/evolve' },
            { text: 'oe diff', link: '/reference/cli/diff' },
            { text: 'oe ultra', link: '/reference/cli/ultra' },
            { text: 'oe doctor', link: '/reference/cli/doctor' },
          ],
        },
      ],
      '/reference/api/': [
        {
          text: 'Programmatic API',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/reference/api/' },
            { text: 'runExperience', link: '/reference/api/run-experience' },
            { text: 'LLMClient', link: '/reference/api/llm-client' },
            { text: 'NodeDispatcher', link: '/reference/api/node-dispatcher' },
            { text: 'EvolutionAdvisor', link: '/reference/api/evolution-advisor' },
            { text: 'UltraExpertise', link: '/reference/api/ultra-expertise' },
            { text: 'StateStore', link: '/reference/api/state-store' },
            { text: 'EventBus', link: '/reference/api/event-bus' },
          ],
        },
      ],
      '/reference/': [
        { text: 'YAML schema', link: '/reference/schema' },
        { text: 'CLI', link: '/reference/cli/' },
        { text: 'API', link: '/reference/api/' },
      ],
      '/compare/': [
        {
          text: 'vs the alternatives',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/compare/' },
            { text: 'vs Anthropic /workflows', link: '/compare/vs-workflows' },
            { text: 'vs LangGraph', link: '/compare/vs-langgraph' },
            { text: 'vs CrewAI', link: '/compare/vs-crewai' },
            { text: 'vs Mastra', link: '/compare/vs-mastra' },
            { text: 'vs Inngest / Temporal', link: '/compare/vs-inngest' },
            { text: 'vs Claude Code directly', link: '/compare/vs-claude-code' },
          ],
        },
      ],
      '/operations/': [
        {
          text: 'Operations',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/operations/' },
            { text: 'Architecture', link: '/operations/architecture' },
            { text: 'Observability', link: '/operations/observability' },
            { text: 'Deployment', link: '/operations/deployment' },
            { text: 'Performance & cost', link: '/operations/performance' },
          ],
        },
      ],
      '/cookbook/': [
        {
          text: 'Cookbook',
          collapsed: false,
          items: [
            { text: 'Recipes index', link: '/cookbook/' },
            {
              text: 'Control flow',
              collapsed: false,
              items: [
                { text: 'Fan-out with concurrency', link: '/cookbook/fan-out-with-concurrency' },
                { text: 'Branch by feature flag', link: '/cookbook/branch-by-feature-flag' },
                { text: 'Retry with backoff', link: '/cookbook/retry-with-backoff' },
                { text: 'Nested experiences', link: '/cookbook/nested-experiences' },
              ],
            },
            {
              text: 'State & output',
              collapsed: false,
              items: [
                { text: 'Merge strategies', link: '/cookbook/merge-strategies' },
                { text: 'Structured output schemas', link: '/cookbook/structured-output-schemas' },
              ],
            },
            {
              text: 'Running & recovery',
              collapsed: false,
              items: [{ text: 'Resume from cache', link: '/cookbook/resume-from-cache' }],
            },
            {
              text: 'Multi-provider & integration',
              collapsed: false,
              items: [
                { text: 'CLI agent with file edits', link: '/cookbook/cli-agent-with-edits' },
                { text: 'Hybrid LLM routing', link: '/cookbook/hybrid-llm-routing' },
                { text: 'oe-mcp as server', link: '/cookbook/mcp-as-server' },
              ],
            },
          ],
        },
      ],
      '/use-cases/': [
        {
          text: 'Use cases',
          collapsed: false,
          items: [
            { text: 'By role / scenario', link: '/use-cases/' },
            {
              text: 'Deep dives',
              collapsed: false,
              items: [
                { text: 'Multi-dimensional PR review', link: '/use-cases/pr-review-multi-dim' },
                { text: 'Executable on-call runbook', link: '/use-cases/incident-triage-runbook' },
                {
                  text: 'Multi-vendor compliance scan',
                  link: '/use-cases/compliance-scan-multi-vendor',
                },
                {
                  text: 'Reproducible LLM eval suite',
                  link: '/use-cases/standardized-eval-suite',
                },
                { text: 'Tier-1 support routing', link: '/use-cases/support-routing' },
              ],
            },
          ],
        },
      ],
      '/roadmap': [
        {
          text: 'Project',
          collapsed: false,
          items: [
            { text: 'Roadmap', link: '/roadmap' },
            { text: 'FAQ', link: '/faq' },
            { text: 'Glossary', link: '/glossary' },
          ],
        },
      ],
      '/faq': [
        {
          text: 'Help',
          collapsed: false,
          items: [
            { text: 'FAQ + troubleshooting', link: '/faq' },
            { text: 'Glossary', link: '/glossary' },
          ],
        },
      ],
      '/glossary': [
        {
          text: 'Help',
          collapsed: false,
          items: [
            { text: 'FAQ + troubleshooting', link: '/faq' },
            { text: 'Glossary', link: '/glossary' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/xingchengxu/OpenExpertise' }],

    editLink: {
      pattern: 'https://github.com/xingchengxu/OpenExpertise/edit/main/site/:path',
      text: 'Edit this page on GitHub',
    },

    search: {
      provider: 'local',
      options: {
        detailedView: true,
      },
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 OpenExpertise contributors',
    },

    outline: {
      level: [2, 3],
      label: 'On this page',
    },

    docFooter: {
      prev: 'Previous',
      next: 'Next',
    },
  },

  markdown: {
    theme: { light: 'github-light', dark: 'github-dark' },
    lineNumbers: false,
  },

  sitemap: {
    hostname: 'https://xingchengxu.github.io/OpenExpertise/',
  },
})
