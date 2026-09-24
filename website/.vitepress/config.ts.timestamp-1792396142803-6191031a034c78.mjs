// website/.vitepress/config.ts
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { resolve as resolve2 } from "node:path";
import { withMermaid } from "file:///home/tyler/deepseek-harness/node_modules/.pnpm/vitepress-plugin-mermaid@2.0.17_mermaid@11.17.2_vitepress@1.6.4_@algolia+client-search@_c60e757e395ec9f3b39dde74e888bd34/node_modules/vitepress-plugin-mermaid/dist/vitepress-plugin-mermaid.es.mjs";

// website/.vitepress/code-groups.ts
function codeGroupFallbackHead(mpa) {
  return mpa ? [["style", {}, `
.vp-code-group .tabs, .vp-code-group button.copy { display: none; }
.vp-code-group .blocks > div { display: block; }
`]] : [];
}
function isolateCodeGroupRadios(md) {
  const render = md.renderer.rules["container_code-group_open"];
  if (render === void 0) throw new Error("VitePress Markdown renderer is missing the code-group opening rule.");
  md.renderer.rules["container_code-group_open"] = (...args) => {
    const html = render(...args);
    const opening = '<div class="tabs">';
    const closing = '</div><div class="blocks">';
    if (!html.includes(opening) || !html.includes(closing)) {
      throw new Error("VitePress code-group markup does not contain the expected tab strip.");
    }
    return html.replace(opening, '<form class="tabs" @submit.prevent>').replace(closing, '</form><div class="blocks">');
  };
}

// website/docs.ts
function localized(value, locale) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value[locale] : value;
}
function mirroredPages(pages) {
  return pages.flatMap((page) => ["root", "en"].map((locale) => {
    const aliases = page.sourceAliases === void 0 ? void 0 : Array.isArray(page.sourceAliases) ? page.sourceAliases : page.sourceAliases[locale];
    return {
      locale,
      contentLocale: localized(page.contentLocale, locale),
      source: localized(page.source, locale),
      route: locale === "root" ? page.route : `en/${page.route}`,
      label: page.label[locale],
      sidebar: page.sidebar[locale],
      section: page.section[locale],
      order: page.order,
      ...page.outline === void 0 ? {} : { outline: page.outline },
      ...aliases === void 0 ? {} : { sourceAliases: aliases }
    };
  }));
}
function pairedPages(pages) {
  return mirroredPages(pages.map((page) => {
    const chineseSource = page.source.replace(/\.md$/, ".zh.md");
    const sharedAliases = page.sourceAliases ?? [];
    return {
      ...page,
      source: { root: chineseSource, en: page.source },
      contentLocale: { root: "zh-CN", en: "en-US" },
      sourceAliases: {
        root: [...sharedAliases, page.source],
        en: [...sharedAliases, chineseSource]
      }
    };
  }));
}
var homeAndGuide = pairedPages([
  {
    source: "docs/user/index.md",
    route: "index.md",
    label: { root: "DeepSeek Harness", en: "DeepSeek Harness" },
    sidebar: { root: null, en: null },
    section: { root: "\u9996\u9875", en: "Home" },
    order: 0
  },
  {
    source: "docs/user/guide/index.md",
    route: "guide/quickstart.md",
    label: { root: "\u4F7F\u7528 Web UI", en: "Use the Web UI" },
    sidebar: { root: "zh-guide", en: "en-guide" },
    section: { root: "\u5165\u95E8", en: "Guide" },
    order: 1,
    sourceAliases: ["docs/user/guide"]
  },
  {
    source: "docs/user/guide/providers.md",
    route: "guide/providers.md",
    label: { root: "\u914D\u7F6E\u6A21\u578B", en: "Configure models" },
    sidebar: { root: "zh-guide", en: "en-guide" },
    section: { root: "\u5165\u95E8", en: "Guide" },
    order: 2
  },
  {
    source: "docs/user/guide/network-proxy.md",
    route: "guide/network-proxy.md",
    label: { root: "\u7F51\u7EDC\u4EE3\u7406", en: "Network proxy" },
    sidebar: { root: "zh-guide", en: "en-guide" },
    section: { root: "\u5165\u95E8", en: "Guide" },
    order: 3
  },
  {
    source: "docs/user/guide/public-deployments.md",
    route: "guide/public-deployments.md",
    label: { root: "\u516C\u5F00\u90E8\u7F72", en: "Public deployments" },
    sidebar: { root: "zh-guide", en: "en-guide" },
    section: { root: "\u5165\u95E8", en: "Guide" },
    order: 4
  },
  {
    source: "docs/user/guide/python-sdk.md",
    route: "guide/python-sdk.md",
    label: { root: "Python", en: "Python" },
    sidebar: { root: "zh-guide", en: "en-guide" },
    section: { root: "SDK", en: "SDK" },
    order: 1
  },
  {
    source: "docs/user/guide/github-review.md",
    route: "guide/github-review.md",
    label: { root: "GitHub \u8BC4\u5BA1\u4F1A\u8BDD", en: "GitHub review sessions" },
    sidebar: { root: "zh-guide", en: "en-guide" },
    section: { root: "\u81EA\u52A8\u5316", en: "Automation" },
    order: 1
  },
  {
    source: "docs/user/guide/schedule.md",
    route: "guide/schedule.md",
    label: { root: "\u4F1A\u8BDD\u5185\u63D0\u9192", en: "Session reminders" },
    sidebar: { root: "zh-guide", en: "en-guide" },
    section: { root: "\u81EA\u52A8\u5316", en: "Automation" },
    order: 2
  },
  {
    source: "docs/user/guide/plugin-market.md",
    route: "guide/plugin-market.md",
    label: { root: "\u63D2\u4EF6\u5E02\u573A", en: "Plugin markets" },
    sidebar: { root: "zh-guide", en: "en-guide" },
    section: { root: "\u96C6\u6210", en: "Integrations" },
    order: 2
  },
  {
    source: "docs/user/guide/mcp-memory.md",
    route: "guide/mcp-memory.md",
    label: { root: "\u8BB0\u5FC6 MCP", en: "Memory MCP" },
    sidebar: { root: "zh-guide", en: "en-guide" },
    section: { root: "\u96C6\u6210", en: "Integrations" },
    order: 1
  }
]);
var develop = pairedPages([
  {
    source: "docs/user/develop/basic/index.md",
    route: "develop/basic/index.md",
    label: { root: "\u7B2C\u4E00\u4E2A Harness \u63D2\u4EF6", en: "Your first Harness plugin" },
    sidebar: { root: "zh-develop", en: "en-develop" },
    section: { root: "\u57FA\u7840", en: "Basics" },
    order: 1,
    sourceAliases: ["docs/user/develop/basic"]
  },
  {
    source: "docs/user/develop/basic/tool.md",
    route: "develop/basic/tool.md",
    label: { root: "\u5F00\u53D1\u4E00\u4E2A Tool", en: "Build a tool" },
    sidebar: { root: "zh-develop", en: "en-develop" },
    section: { root: "\u57FA\u7840", en: "Basics" },
    order: 2
  },
  {
    source: "docs/user/develop/basic/config.md",
    route: "develop/basic/config.md",
    label: { root: "\u63D2\u4EF6\u914D\u7F6E", en: "Plugin configuration" },
    sidebar: { root: "zh-develop", en: "en-develop" },
    section: { root: "\u57FA\u7840", en: "Basics" },
    order: 3
  },
  {
    source: "docs/user/develop/basic/publish.md",
    route: "develop/basic/publish.md",
    label: { root: "\u6253\u5305\u4E0E\u5B89\u88C5\u63D2\u4EF6", en: "Package and install" },
    sidebar: { root: "zh-develop", en: "en-develop" },
    section: { root: "\u57FA\u7840", en: "Basics" },
    order: 4
  },
  {
    source: "docs/user/develop/framework/index.md",
    route: "develop/framework/index.md",
    label: { root: "\u63D2\u4EF6\u4E0E\u751F\u547D\u5468\u671F", en: "Plugin lifecycle" },
    sidebar: { root: "zh-develop", en: "en-develop" },
    section: { root: "\u6846\u67B6\u80FD\u529B", en: "Framework" },
    order: 1,
    sourceAliases: ["docs/user/develop/framework"]
  },
  {
    source: "docs/user/develop/framework/service.md",
    route: "develop/framework/service.md",
    label: { root: "\u670D\u52A1\u4E0E\u4F9D\u8D56", en: "Services and dependencies" },
    sidebar: { root: "zh-develop", en: "en-develop" },
    section: { root: "\u6846\u67B6\u80FD\u529B", en: "Framework" },
    order: 2
  },
  {
    source: "docs/user/develop/framework/events.md",
    route: "develop/framework/events.md",
    label: { root: "\u4E8B\u4EF6\u7CFB\u7EDF", en: "Event system" },
    sidebar: { root: "zh-develop", en: "en-develop" },
    section: { root: "\u6846\u67B6\u80FD\u529B", en: "Framework" },
    order: 3
  },
  {
    source: "docs/user/develop/practice/index.md",
    route: "develop/practice/index.md",
    label: { root: "\u80FD\u529B\u7684\u4E09\u5C42\u62C6\u5206", en: "Capability layering" },
    sidebar: { root: "zh-develop", en: "en-develop" },
    section: { root: "\u5B9E\u6218", en: "Practice" },
    order: 1,
    sourceAliases: ["docs/user/develop/practice"]
  },
  {
    source: "docs/user/develop/practice/llm-adapter.md",
    route: "develop/practice/llm-adapter.md",
    label: { root: "LLM \u9002\u914D\u5668", en: "LLM adapter" },
    sidebar: { root: "zh-develop", en: "en-develop" },
    section: { root: "\u5B9E\u6218", en: "Practice" },
    order: 2
  },
  {
    source: "docs/user/develop/practice/dynamic-cordis.md",
    route: "develop/practice/dynamic-cordis.md",
    label: { root: "\u6301\u4E45\u5316 Harness \u63D2\u4EF6", en: "Persistent Harness plugins" },
    sidebar: { root: "zh-develop", en: "en-develop" },
    section: { root: "\u5B9E\u6218", en: "Practice" },
    order: 3
  }
]);
var cordisTutorial = pairedPages([
  ["index.md", "\u603B\u89C8", "Overview"],
  ["01-first-plugin.md", "1. \u7B2C\u4E00\u4E2A\u63D2\u4EF6", "1. Your first plugin"],
  ["02-lifecycle-and-effects.md", "2. \u751F\u547D\u5468\u671F\u4E0E\u526F\u4F5C\u7528", "2. Lifecycle and effects"],
  ["03-services.md", "3. \u670D\u52A1", "3. Services"],
  ["04-events.md", "4. \u4E8B\u4EF6", "4. Events"],
  ["05-config.md", "5. \u914D\u7F6E", "5. Configuration"],
  ["06-composition-and-hmr.md", "6. \u7EC4\u5408\u4E0E\u70ED\u91CD\u8F7D", "6. Composition and HMR"],
  ["07-into-the-harness.md", "7. \u8FDB\u5165 Harness", "7. Into the harness"]
].map(([file, rootLabel, enLabel], order) => ({
  source: `docs/cordis-tutorial/${file}`,
  route: `develop/cordis-tutorial/${file}`,
  label: { root: rootLabel, en: enLabel },
  sidebar: { root: "zh-develop", en: "en-develop" },
  section: { root: "Cordis \u6846\u67B6\u6559\u7A0B", en: "Cordis framework tutorial" },
  order,
  ...file === "index.md" ? { sourceAliases: ["docs/cordis-tutorial"] } : {}
})));
var cordisPrimerReference = pairedPages([
  {
    source: "docs/cordis-primer.md",
    route: "reference/cordis-primer.md",
    label: { root: "Cordis \u5165\u95E8", en: "Cordis primer" },
    sidebar: { root: "zh-reference", en: "en-reference" },
    section: { root: "\u6982\u5FF5", en: "Concepts" },
    order: 1
  }
]);
var subsystemGroups = [
  ["\u603B\u89C8", "Overview", [
    ["README.md", "\u5B50\u7CFB\u7EDF", "Subsystems"]
  ]],
  ["\u5185\u6838\u4E0E\u4F5C\u7528\u57DF", "Core and scopes", [
    ["core.md", "\u6838\u5FC3", "Core"],
    ["scope.md", "\u4F5C\u7528\u57DF", "Scopes"]
  ]],
  ["\u4F1A\u8BDD\u4E0E\u6301\u4E45\u5316", "Sessions and persistence", [
    ["session.md", "\u4F1A\u8BDD", "Sessions"],
    ["session-query.md", "\u4F1A\u8BDD\u67E5\u8BE2", "Session query"],
    ["session-reference.md", "\u4F1A\u8BDD\u5F15\u7528", "Session references"],
    ["session-title.md", "\u4F1A\u8BDD\u6807\u9898", "Session titles"],
    ["session-projection.md", "\u4F1A\u8BDD\u6295\u5F71", "Session projections"],
    ["persistence.md", "\u4F1A\u8BDD\u6301\u4E45\u5316", "Session persistence"],
    ["spill.md", "Spill \u5B58\u50A8", "Spill storage"],
    ["session-telemetry.md", "\u9065\u6D4B", "SessionTelemetryBackend"]
  ]],
  ["\u6A21\u578B\u4E0E\u4E0A\u4E0B\u6587", "Model and context", [
    ["llm-streaming.md", "LLM \u6D41\u5F0F\u54CD\u5E94", "LLM streaming"],
    ["token-meter.md", "Token \u8BA1\u91CF", "Token metering"],
    ["system-prompt.md", "\u7CFB\u7EDF\u63D0\u793A\u8BCD", "System prompts"],
    ["compaction.md", "\u4E0A\u4E0B\u6587\u538B\u7F29", "Compaction"]
  ]],
  ["\u6267\u884C\u4E0E\u5DE5\u5177", "Execution and tools", [
    ["tools.md", "\u5DE5\u5177", "Tools"],
    ["shell.md", "Bash \u6267\u884C", "Bash execution"],
    ["subprocess.md", "\u5B50\u8FDB\u7A0B", "Subprocesses"],
    ["terminal.md", "PTY \u4F1A\u8BDD", "PTY sessions"],
    ["jobs.md", "\u540E\u53F0\u4EFB\u52A1", "Background jobs"],
    ["filesystem.md", "\u6587\u4EF6\u7CFB\u7EDF", "Filesystem"],
    ["lsp.md", "LSP \u5BFC\u822A", "LSP navigation"],
    ["ptc-runtime.md", "PTC \u8FD0\u884C\u65F6", "PTC runtime"],
    ["web.md", "Web \u8BBF\u95EE", "Web access"],
    ["skills.md", "\u6280\u80FD", "Skills"],
    ["workflow.md", "\u5DE5\u4F5C\u6D41", "Workflows"],
    ["subagent.md", "\u5B50\u667A\u80FD\u4F53", "Subagents"]
  ]],
  ["\u7B56\u7565\u4E0E\u4EA4\u4E92", "Policy and interaction", [
    ["approval.md", "\u5BA1\u6279", "Approvals"],
    ["permission-presets.md", "\u6743\u9650\u9884\u8BBE", "Permission presets"],
    ["sandbox.md", "\u6C99\u7BB1", "Sandboxing"],
    ["plan.md", "\u8BA1\u5212\u6A21\u5F0F", "Plan mode"],
    ["user-questions.md", "\u7528\u6237\u4EA4\u4E92", "User interaction"],
    ["commands.md", "\u547D\u4EE4", "Human commands"],
    ["goal.md", "\u76EE\u6807", "Goals"],
    ["schedule.md", "\u5B9A\u65F6\u63D0\u9192", "Scheduled reminders"]
  ]],
  ["\u5E73\u53F0\u4E0E\u63A5\u5165", "Platform and access", [
    ["web-server.md", "HTTP \u670D\u52A1\u5668", "HTTP server"],
    ["web-client.md", "Web Client \u67B6\u6784", "Web Client architecture"],
    ["client-modules.md", "\u5BA2\u6237\u7AEF\u6A21\u5757", "Client modules"],
    ["slots.md", "\u5BA2\u6237\u7AEF Slots", "Client slots"],
    ["client-resources.md", "\u5BA2\u6237\u7AEF\u8D44\u6E90", "Client resources"],
    ["sidebar-right.md", "\u53F3\u4FA7 Sidebar", "Right Sidebar"],
    ["conversation.md", "Conversation \u7EC4\u88C5", "Conversation assembly"],
    ["typert.md", "Typert", "Typert"],
    ["storage.md", "\u5B58\u50A8", "Storage"],
    ["workspace.md", "\u5DE5\u4F5C\u533A", "Workspaces"],
    ["settings.md", "\u7528\u6237\u8BBE\u7F6E", "User settings"],
    ["credentials.md", "\u7528\u6237\u51ED\u636E", "User credentials"]
  ]]
];
var subsystemsReference = subsystemGroups.flatMap(([rootSection, enSection, files]) => pairedPages(
  files.map(([file, rootLabel, enLabel], order) => ({
    source: `docs/subsystems/${file}`,
    route: file === "README.md" ? "reference/subsystems/index.md" : `reference/subsystems/${file}`,
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: "zh-reference", en: "en-reference" },
    section: { root: rootSection, en: enSection },
    order,
    // Subsystem pages carry long third-level sections a two-level outline reaches.
    outline: [2, 3],
    ...file === "README.md" ? { sourceAliases: ["docs/subsystems"] } : {}
  }))
));
var reference = [
  // `docs/deepseek-llm-api-wire-extensions.md` is a repository-only provider protocol reference.
  // Projected links intentionally resolve to its GitHub source instead of a public site route.
  ...pairedPages([
    ["docs/architecture.md", "reference/index.md", "\u67B6\u6784", "Architecture", 0]
  ].map(([source, route, rootLabel, enLabel, order]) => ({
    source,
    route,
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: "zh-reference", en: "en-reference" },
    section: { root: "\u6982\u5FF5", en: "Concepts" },
    order
  }))),
  ...pairedPages([
    ["docs/capability-seams.md", "reference/capability-seams.md", "\u80FD\u529B\u670D\u52A1", "Capability services", 2],
    ["docs/agent-lifecycle.md", "reference/agent-lifecycle.md", "Agent \u751F\u547D\u5468\u671F", "Agent lifecycle", 3],
    ["docs/tool-execution-pipeline.md", "reference/tool-execution-pipeline.md", "Tool \u6267\u884C", "Tool execution", 4],
    ["docs/api-gateway.md", "reference/api-gateway.md", "API Gateway", "API Gateway", 5]
  ].map(([source, route, rootLabel, enLabel, order]) => ({
    source,
    route,
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: "zh-reference", en: "en-reference" },
    section: { root: "\u6982\u5FF5", en: "Concepts" },
    order
  }))),
  ...pairedPages([
    ["docs/config-catalog.md", "reference/config-catalog.md", "\u63D2\u4EF6\u914D\u7F6E", "Plugin configuration"],
    ["docs/tool-catalog.md", "reference/tool-catalog.md", "Tool Schema", "Tool schemas"],
    ["docs/persistence-catalog.md", "reference/persistence-catalog.md", "\u6301\u4E45\u5316\u4E8B\u4EF6", "Persistence events", "deep"],
    ["docs/experimental-persistence-catalog.md", "reference/experimental-persistence-catalog.md", "\u5B9E\u9A8C\u6027\u6301\u4E45\u5316\u8BB0\u5F55", "Experimental persistence"]
  ].map(([source, route, rootLabel, enLabel, outline], order) => ({
    source,
    route,
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: "zh-reference", en: "en-reference" },
    section: { root: "\u751F\u6210\u53C2\u8003", en: "Generated reference" },
    order,
    ...outline === void 0 ? {} : { outline }
  }))),
  ...pairedPages([
    ["context.md", "Context", "Context"],
    ["events.md", "Events", "Events"],
    ["fiber.md", "Fiber", "Fiber"],
    ["registry.md", "Plugin Registry", "Plugin Registry"],
    ["service.md", "Service", "Service"]
  ].map(([file, rootLabel, enLabel], order) => ({
    source: `docs/cordis-api/${file}`,
    route: `reference/cordis-api/${file}`,
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: "zh-reference", en: "en-reference" },
    section: { root: "Cordis API", en: "Cordis Core API" },
    order
  }))),
  ...mirroredPages([
    ["inherited.md", "\u7EE7\u627F\u63A5\u53E3\u9762", "Inherited surface"]
  ].map(([file, rootLabel, enLabel], order) => ({
    source: `docs/cordis-api/${file}`,
    route: `reference/cordis-api/${file}`,
    contentLocale: "en-US",
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: "zh-reference", en: "en-reference" },
    section: { root: "Cordis API", en: "Cordis Core API" },
    order: order + 5
  }))),
  ...pairedPages([
    ["adding-a-package.md", "\u65B0\u589E Package", "Adding a package"],
    ["adding-a-tool.md", "\u65B0\u589E Tool", "Adding a tool"],
    ["adding-an-llm-adapter.md", "\u65B0\u589E LLM Adapter", "Adding an LLM adapter"],
    ["adding-a-settings-card.md", "\u65B0\u589E\u8BBE\u7F6E\u9875", "Adding a settings page"],
    ["extension-cookbook.md", "\u6269\u5C55\u6A21\u5F0F", "Extension patterns"]
  ].map(([file, rootLabel, enLabel], order) => ({
    source: `docs/cookbook/${file}`,
    route: `reference/cookbook/${file}`,
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: "zh-reference", en: "en-reference" },
    section: { root: "\u5F00\u53D1\u624B\u518C", en: "Cookbook" },
    order
  })))
];
var localeCollections = {
  root: ["zh-guide", "zh-develop", "zh-reference"],
  en: ["en-guide", "en-develop", "en-reference"]
};
var sections = {
  root: [
    { label: "\u5165\u95E8" },
    { label: "SDK" },
    { label: "\u81EA\u52A8\u5316" },
    { label: "\u96C6\u6210" },
    { label: "\u57FA\u7840" },
    { label: "\u6846\u67B6\u80FD\u529B" },
    { label: "\u5B9E\u6218" },
    { label: "Cordis \u6846\u67B6\u6559\u7A0B" },
    { label: "\u6982\u5FF5" },
    { label: "\u751F\u6210\u53C2\u8003" },
    { label: "Cordis API" },
    { label: "\u5F00\u53D1\u624B\u518C" },
    { label: "\u603B\u89C8" },
    { label: "\u5185\u6838\u4E0E\u4F5C\u7528\u57DF", collapsed: true },
    { label: "\u4F1A\u8BDD\u4E0E\u6301\u4E45\u5316", collapsed: true },
    { label: "\u6A21\u578B\u4E0E\u4E0A\u4E0B\u6587", collapsed: true },
    { label: "\u6267\u884C\u4E0E\u5DE5\u5177", collapsed: true },
    { label: "\u7B56\u7565\u4E0E\u4EA4\u4E92", collapsed: true },
    { label: "\u5E73\u53F0\u4E0E\u63A5\u5165", collapsed: true }
  ],
  en: [
    { label: "Guide" },
    { label: "SDK" },
    { label: "Automation" },
    { label: "Integrations" },
    { label: "Basics" },
    { label: "Framework" },
    { label: "Practice" },
    { label: "Cordis framework tutorial" },
    { label: "Concepts" },
    { label: "Generated reference" },
    { label: "Cordis Core API" },
    { label: "Cookbook" },
    { label: "Overview" },
    { label: "Core and scopes", collapsed: true },
    { label: "Sessions and persistence", collapsed: true },
    { label: "Model and context", collapsed: true },
    { label: "Execution and tools", collapsed: true },
    { label: "Policy and interaction", collapsed: true },
    { label: "Platform and access", collapsed: true }
  ]
};
function sectionSpec(locale, label) {
  const declared = sections[locale];
  const section = declared.find((candidate) => candidate.label === label);
  if (section === void 0) throw new Error(`Sidebar section "${label}" has no placement in the ${locale} locale.`);
  return { ...section, index: declared.indexOf(section) };
}
var docsPages = [
  ...homeAndGuide,
  ...develop,
  ...cordisTutorial,
  ...cordisPrimerReference,
  ...subsystemsReference,
  ...reference
];
function orderedPages(locale, collection) {
  return docsPages.filter((page) => page.locale === locale && page.sidebar === collection).sort((left, right) => sectionSpec(locale, left.section).index - sectionSpec(locale, right.section).index || left.order - right.order);
}
function routeLink(route) {
  return `/${route.replace(/(?:index)?\.md$/, "")}`;
}
function landingLink(locale, collection) {
  const first = orderedPages(locale, collection)[0];
  if (first === void 0) throw new Error(`Sidebar collection "${collection}" publishes no page.`);
  return routeLink(first.route);
}

// scripts/project-doc-site.ts
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, extname, posix, relative, resolve, sep } from "node:path";
import { fromMarkdown as fromMarkdown2 } from "file:///home/tyler/deepseek-harness/node_modules/.pnpm/mdast-util-from-markdown@2.0.3_supports-color@9.4.0/node_modules/mdast-util-from-markdown/index.js";
import { gfmFromMarkdown as gfmFromMarkdown2 } from "file:///home/tyler/deepseek-harness/node_modules/.pnpm/mdast-util-gfm@3.1.0_supports-color@9.4.0/node_modules/mdast-util-gfm/index.js";
import { gfm as gfm2 } from "file:///home/tyler/deepseek-harness/node_modules/.pnpm/micromark-extension-gfm@3.0.0/node_modules/micromark-extension-gfm/index.js";

// scripts/markdown.ts
import { fromMarkdown } from "file:///home/tyler/deepseek-harness/node_modules/.pnpm/mdast-util-from-markdown@2.0.3_supports-color@9.4.0/node_modules/mdast-util-from-markdown/index.js";
import { gfmFromMarkdown } from "file:///home/tyler/deepseek-harness/node_modules/.pnpm/mdast-util-gfm@3.1.0_supports-color@9.4.0/node_modules/mdast-util-gfm/index.js";
import { gfm } from "file:///home/tyler/deepseek-harness/node_modules/.pnpm/micromark-extension-gfm@3.0.0/node_modules/micromark-extension-gfm/index.js";
function isExternalOrAbsoluteMarkdownUrl(url) {
  return url.startsWith("#") || url.startsWith("//") || url.startsWith("/") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url);
}
function splitMarkdownUrlTarget(url) {
  const boundary = url.search(/[?#]/);
  if (boundary === -1) return { path: url, suffix: "" };
  return { path: url.slice(0, boundary), suffix: url.slice(boundary) };
}
function skipWhitespace(source, start) {
  let index = start;
  while (/\s/.test(source[index] ?? "")) index += 1;
  return index;
}
function labelEnd(source) {
  const first = source.indexOf("[");
  if (first === -1) return -1;
  let depth = 0;
  for (let index = first; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") index += 1;
    else if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}
function destinationRange(rawNode, type) {
  const endOfLabel = labelEnd(rawNode);
  if (endOfLabel === -1) throw new Error(`markdown: cannot locate label end in ${JSON.stringify(rawNode)}`);
  let start;
  if (type === "definition") {
    const colon = rawNode.indexOf(":", endOfLabel + 1);
    if (colon === -1) throw new Error(`markdown: cannot locate definition separator in ${JSON.stringify(rawNode)}`);
    start = skipWhitespace(rawNode, colon + 1);
  } else {
    if (rawNode[endOfLabel + 1] !== "(") {
      throw new Error(`markdown: cannot locate inline destination in ${JSON.stringify(rawNode)}`);
    }
    start = skipWhitespace(rawNode, endOfLabel + 2);
  }
  if (rawNode[start] === "<") {
    for (let index = start + 1; index < rawNode.length; index += 1) {
      if (rawNode[index] === "\\") index += 1;
      else if (rawNode[index] === ">") return { start: start + 1, end: index };
    }
    throw new Error(`markdown: cannot locate angle-bracket destination end in ${JSON.stringify(rawNode)}`);
  }
  let depth = 0;
  for (let index = start; index < rawNode.length; index += 1) {
    const char = rawNode[index];
    if (char === "\\") index += 1;
    else if (char === "(") depth += 1;
    else if (char === ")") {
      if (depth === 0) return { start, end: index };
      depth -= 1;
    } else if (/\s/.test(char ?? "") && depth === 0) {
      return { start, end: index };
    }
  }
  return { start, end: rawNode.length };
}
function markdownDestination(source, node) {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === void 0 || end === void 0) {
    throw new Error(`markdown: destination ${JSON.stringify(node.url)} has no source offsets`);
  }
  const range = destinationRange(source.slice(start, end), node.type);
  const absolute = { start: start + range.start, end: start + range.end };
  return { ...absolute, url: source.slice(absolute.start, absolute.end) };
}

// scripts/project-doc-site.ts
var __vite_injected_original_dirname = "/home/tyler/deepseek-harness/scripts";
var REPOSITORY_URL = "https://github.com/deepseek-ai/deepseek-harness";
var root = resolve(__vite_injected_original_dirname, "..");
var generatedRoot = resolve(root, "website/.generated");
function resolveRepositoryRef(environment) {
  return environment.DOCS_REPOSITORY_REF ?? "master";
}
function repoPath(absPath, repoRoot) {
  return relative(repoRoot, absPath).split(sep).join("/");
}
function decodePath(path) {
  try {
    return decodeURIComponent(path);
  } catch {
    throw new Error(`project-doc-site: malformed percent escape in ${JSON.stringify(path)}.`);
  }
}
function routeTarget(fromRoute, toRoute, suffix) {
  const target = posix.relative(posix.dirname(fromRoute), toRoute);
  return `${target.startsWith(".") ? target : `./${target}`}${suffix}`;
}
function sourceMap(pages) {
  const map = /* @__PURE__ */ new Map();
  for (const page of pages) {
    for (const source of [page.source, ...page.sourceAliases ?? []]) {
      const localized2 = map.get(source) ?? /* @__PURE__ */ new Map();
      if (localized2.has(page.locale)) {
        throw new Error(`project-doc-site: duplicate source or alias ${JSON.stringify(source)} for locale ${JSON.stringify(page.locale)}.`);
      }
      localized2.set(page.locale, page);
      map.set(source, localized2);
    }
  }
  return map;
}
function counterpartSource(source) {
  return source.endsWith(".zh.md") ? source.replace(/\.zh\.md$/, ".md") : source.replace(/\.md$/, ".zh.md");
}
function resolveRepositoryTarget(sourceAbs, rawPath, repoRoot) {
  const decoded = decodePath(rawPath);
  let absPath = resolve(dirname(sourceAbs), decoded);
  if (existsSync(absPath)) return { absPath };
  const lineMatch = decoded.match(/:(\d+)$/);
  if (lineMatch !== null) {
    const lineText = lineMatch[1];
    if (lineText === void 0) throw new Error("project-doc-site: line suffix matched without a line number.");
    absPath = resolve(dirname(sourceAbs), decoded.slice(0, -lineMatch[0].length));
    if (existsSync(absPath)) return { absPath, line: Number.parseInt(lineText, 10) };
  }
  if (extname(decoded) === "") {
    const markdown = resolve(dirname(sourceAbs), `${decoded}.md`);
    if (existsSync(markdown)) return { absPath: markdown };
    const index = resolve(dirname(sourceAbs), decoded, "index.md");
    if (existsSync(index)) return { absPath: index };
  }
  throw new Error(`project-doc-site: ${repoPath(sourceAbs, repoRoot)} links to missing path ${JSON.stringify(rawPath)}.`);
}
function githubTarget(absPath, line, suffix, repositoryRef, repoRoot, image) {
  const path = repoPath(absPath, repoRoot);
  if (image) return `https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/${repositoryRef}/${path}${suffix}`;
  const kind = lstatSync(absPath).isDirectory() ? "tree" : "blob";
  const lineSuffix = line === void 0 ? suffix : `#L${line}`;
  return `${REPOSITORY_URL}/${kind}/${repositoryRef}/${path}${lineSuffix}`;
}
function rewriteMarkdown(source, options) {
  const sourceAbs = resolve(options.repoRoot, options.sourcePath);
  const published = sourceMap(options.pages);
  const tree = fromMarkdown2(source, { extensions: [gfm2()], mdastExtensions: [gfmFromMarkdown2()] });
  const replacements = [];
  const rewrite = (node) => {
    if (isExternalOrAbsoluteMarkdownUrl(node.url)) return;
    const { path, suffix } = splitMarkdownUrlTarget(node.url);
    if (path === "") return;
    const { absPath, line } = resolveRepositoryTarget(sourceAbs, path, options.repoRoot);
    const targetPath = repoPath(absPath, options.repoRoot);
    const isLanguageSwitcher = targetPath === counterpartSource(options.sourcePath);
    const targetLocale = isLanguageSwitcher ? options.locale === "root" ? "en" : "root" : options.locale;
    const page = published.get(targetPath)?.get(targetLocale);
    const nextUrl = page !== void 0 ? routeTarget(options.route, page.route, suffix) : node.type === "image" && options.placeImage !== void 0 ? `${options.placeImage(absPath)}${suffix}` : githubTarget(absPath, line, suffix, options.repositoryRef, options.repoRoot, node.type === "image");
    const destination = markdownDestination(source, node);
    replacements.push({
      start: destination.start,
      end: destination.end,
      value: nextUrl
    });
  };
  const visit = (node) => {
    if ((node.type === "link" || node.type === "image" || node.type === "definition") && "url" in node) rewrite(node);
    if ("children" in node) {
      for (const child of node.children) visit(child);
    }
  };
  visit(tree);
  let projected = source;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    projected = projected.slice(0, replacement.start) + replacement.value + projected.slice(replacement.end);
  }
  return projected;
}
function addProjectionFrontmatter(markdown, page) {
  const fields = [
    `editSource: ${JSON.stringify(page.source)}`,
    ...page.sidebar === null ? [] : [`rawMarkdownPath: ${JSON.stringify(page.route)}`],
    ...page.outline === void 0 ? [] : [`outline: ${JSON.stringify(page.outline)}`]
  ].join("\n");
  if (markdown.startsWith("---\n")) return markdown.replace("---\n", `---
${fields}
`);
  return `---
${fields}
---

${markdown}`;
}
var LANGUAGE_SWITCHER = /^(?:English \| \[中文\]\([^)]*\)|\[English\]\([^)]*\) \| 中文)$/;
var REPOSITORY_BADGE = /^\[!\[[^\]]*\]\(https:\/\/img\.shields\.io\/[^)]*\)\]\([^)]*\)$/;
function withoutRepositoryChrome(markdown) {
  const lines = markdown.split("\n");
  const switcher = lines.findIndex((line) => LANGUAGE_SWITCHER.test(line));
  if (switcher !== -1 && switcher < 8) {
    lines.splice(switcher, lines[switcher + 1] === "" ? 2 : 1);
  }
  const badge = lines.findLastIndex((line) => REPOSITORY_BADGE.test(line));
  if (badge !== -1) {
    lines.splice(lines[badge - 1] === "" ? badge - 1 : badge, lines[badge - 1] === "" ? 2 : 1);
  }
  return lines.join("\n");
}
function projectedPageContent(markdown, page) {
  if (page.sidebar !== null) return withoutRepositoryChrome(markdown);
  if (!markdown.startsWith("---\n")) {
    throw new Error(`project-doc-site: locale home source ${JSON.stringify(page.source)} must start with YAML frontmatter.`);
  }
  const closingDelimiter = "\n---\n";
  const closing = markdown.indexOf(closingDelimiter, 4);
  if (closing === -1) {
    throw new Error(`project-doc-site: locale home source ${JSON.stringify(page.source)} has unclosed YAML frontmatter.`);
  }
  return markdown.slice(0, closing + closingDelimiter.length);
}
function publishableImage(absPath, repoRoot) {
  const real = realpathSync(absPath);
  const inside = real === repoRoot || real.startsWith(`${repoRoot}${sep}`);
  return inside && statSync(real).isFile() ? real : void 0;
}
function referencedImages() {
  const found = /* @__PURE__ */ new Set();
  for (const page of docsPages) {
    const sourceAbs = resolve(root, page.source);
    if (!existsSync(sourceAbs)) continue;
    rewriteMarkdown(readFileSync(sourceAbs, "utf8"), {
      sourcePath: page.source,
      locale: page.locale,
      route: page.route,
      pages: docsPages,
      repoRoot: root,
      repositoryRef: "master",
      placeImage: (absPath) => {
        const real = publishableImage(absPath, root);
        if (real !== void 0) found.add(real);
        return "";
      }
    });
  }
  return [...found];
}
function docsSourceFiles() {
  return [.../* @__PURE__ */ new Set([...docsPages.map((page) => resolve(root, page.source)), ...referencedImages()])];
}
function defaultProjectionContext() {
  return { pages: docsPages, repoRoot: root, repositoryRef: resolveRepositoryRef(process.env) };
}
function projectPagesInto(targetRoot, context, pageContent, entries = context.pages) {
  const routes = /* @__PURE__ */ new Set();
  const claimed = /* @__PURE__ */ new Map();
  const claim = (target, sourceAbs) => {
    const holder = claimed.get(target);
    if (holder !== void 0 && holder !== sourceAbs) {
      throw new Error(
        `project-doc-site: ${repoPath(sourceAbs, context.repoRoot)} and ${repoPath(holder, context.repoRoot)} both project to ${relative(targetRoot, target).split(sep).join("/")}.`
      );
    }
    if (holder === void 0 && existsSync(target)) {
      throw new Error(
        `project-doc-site: ${repoPath(sourceAbs, context.repoRoot)} would overwrite existing build file ${relative(targetRoot, target).split(sep).join("/")}.`
      );
    }
    claimed.set(target, sourceAbs);
  };
  for (const page of entries) {
    if (routes.has(page.route)) throw new Error(`project-doc-site: duplicate route ${JSON.stringify(page.route)}.`);
    routes.add(page.route);
    const sourceAbs = resolve(context.repoRoot, page.source);
    if (!existsSync(sourceAbs) || !lstatSync(sourceAbs).isFile()) {
      throw new Error(`project-doc-site: source ${JSON.stringify(page.source)} does not exist or is not a file.`);
    }
    const output = resolve(targetRoot, page.route);
    claim(output, sourceAbs);
    mkdirSync(dirname(output), { recursive: true });
    const markdown = readFileSync(sourceAbs, "utf8");
    const projected = rewriteMarkdown(markdown, {
      sourcePath: page.source,
      locale: page.locale,
      route: page.route,
      pages: context.pages,
      repoRoot: context.repoRoot,
      repositoryRef: context.repositoryRef,
      placeImage: (absPath) => {
        const real = publishableImage(absPath, context.repoRoot);
        if (real === void 0) {
          throw new Error(
            `project-doc-site: ${page.source} references image ${repoPath(absPath, context.repoRoot)}, which is not a regular file inside the repository.`
          );
        }
        const name = basename(real);
        const target = resolve(dirname(output), name);
        claim(target, real);
        copyFileSync(real, target);
        return `./${encodeURI(name)}`;
      }
    });
    writeFileSync(output, pageContent(projected, page));
  }
}
function projectDocs() {
  rmSync(generatedRoot, { recursive: true, force: true });
  projectPagesInto(generatedRoot, defaultProjectionContext(), (markdown, page) => addProjectionFrontmatter(projectedPageContent(markdown, page), page));
}
function withoutFrontmatter(markdown, source) {
  if (!markdown.startsWith("---\n")) return markdown;
  const closingDelimiter = "\n---\n";
  const closing = markdown.indexOf(closingDelimiter, 4);
  if (closing === -1) {
    throw new Error(`project-doc-site: ${JSON.stringify(source)} has unclosed YAML frontmatter.`);
  }
  return markdown.slice(closing + closingDelimiter.length).replace(/^\n+/, "");
}
function rawMarkdownPageContent(markdown, source) {
  return withoutRepositoryChrome(withoutFrontmatter(markdown, source));
}
function indexAliasRoute(route) {
  const match = /^(.+)\/index\.md$/.exec(route);
  return match?.[1] === void 0 ? void 0 : `${match[1]}.md`;
}
function emitRawMarkdownPages(outDir, context = defaultProjectionContext()) {
  const aliases = context.pages.flatMap((page) => {
    const alias = indexAliasRoute(page.route);
    return alias === void 0 ? [] : [{ ...page, route: alias }];
  });
  projectPagesInto(
    outDir,
    context,
    (markdown, page) => `\uFEFF${rawMarkdownPageContent(markdown, page.source)}`,
    [...context.pages, ...aliases]
  );
}
function rawMarkdownRoute(route, context = defaultProjectionContext()) {
  const page = context.pages.find((candidate) => candidate.route === route);
  if (page === void 0) return void 0;
  const markdown = readFileSync(resolve(context.repoRoot, page.source), "utf8");
  return rawMarkdownPageContent(rewriteMarkdown(markdown, {
    sourcePath: page.source,
    locale: page.locale,
    route: page.route,
    pages: context.pages,
    repoRoot: context.repoRoot,
    repositoryRef: context.repositoryRef,
    placeImage: (absPath) => `./${encodeURI(basename(absPath))}`
  }), page.source);
}
var llmsTxtLocales = [
  { heading: "\u7B80\u4F53\u4E2D\u6587", locale: "root" },
  { heading: "English", locale: "en" }
];
function llmsTxt(site) {
  const lines = [
    `# ${site.title}`,
    "",
    `> ${site.description}`,
    "",
    "\u9875\u9762 URL \u53BB\u6389\u672B\u5C3E\u659C\u6760\u518D\u52A0 `.md` \u5373\u4E3A\u8BE5\u9875\u539F\u59CB Markdown(\u6839\u8DEF\u5F84\u7528 `/index.md`);\u4E0B\u65B9\u5217\u8868\u662F\u5404\u9875\u7CBE\u786E\u5730\u5740\u3002Drop any trailing slash and append `.md` to a page URL for its raw Markdown (the site root is `/index.md`); the list below carries the exact addresses."
  ];
  for (const { heading, locale } of llmsTxtLocales) {
    lines.push("", `## ${heading}`, "");
    for (const collection of localeCollections[locale]) {
      for (const page of orderedPages(locale, collection)) {
        lines.push(`- [${page.label}](${site.base}${page.route}): ${page.section}`);
      }
    }
  }
  return `${lines.join("\n")}
`;
}

// website/raw-markdown.ts
function rawMarkdownMiddleware(base2, index) {
  return (req, res, next) => {
    if (req.url === void 0 || req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    let url;
    try {
      url = new URL(req.url, "http://docs.local");
    } catch (_error) {
      next();
      return;
    }
    if (!url.pathname.startsWith(base2)) {
      next();
      return;
    }
    const path = url.pathname.slice(base2.length);
    const explicit = path.endsWith(".md") && url.searchParams.get("dsh-raw") === "1";
    const destination = req.headers["sec-fetch-dest"];
    if (destination !== void 0 && destination !== "document" && !(destination === "empty" && explicit)) {
      next();
      return;
    }
    const content = path === "llms.txt" ? index() : path.endsWith(".md") ? rawMarkdownRoute(path) : void 0;
    if (content === void 0) {
      if (!explicit) {
        next();
        return;
      }
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader("Content-Type", `${path === "llms.txt" ? "text/plain" : "text/markdown"}; charset=utf-8`);
    res.end(req.method === "HEAD" ? void 0 : content);
  };
}

// website/.vitepress/config.ts
var __vite_injected_original_dirname2 = "/home/tyler/deepseek-harness/website/.vitepress";
projectDocs();
function sidebar(locale, collection) {
  const groups = /* @__PURE__ */ new Map();
  for (const page of orderedPages(locale, collection)) {
    const entries = groups.get(page.section) ?? [];
    entries.push(page);
    groups.set(page.section, entries);
  }
  return [...groups.entries()].map(([text, entries]) => {
    const { collapsed } = sectionSpec(locale, text);
    return {
      text,
      // A present `collapsed` is what makes the default theme render the
      // group as collapsible at all, so an open group must omit the key.
      ...collapsed === void 0 ? {} : { collapsed },
      items: entries.map((page) => ({ text: page.label, link: routeLink(page.route) }))
    };
  });
}
var guideModules = {
  root: {
    guide: localeCollections.root[0],
    develop: { label: "\u5F00\u53D1", collection: localeCollections.root[1] },
    reference: { label: "\u53C2\u8003", collection: localeCollections.root[2] }
  },
  en: {
    guide: localeCollections.en[0],
    develop: { label: "Development", collection: localeCollections.en[1] },
    reference: { label: "Reference", collection: localeCollections.en[2] }
  }
};
function guideSidebar(locale) {
  const { guide, develop: develop2, reference: reference2 } = guideModules[locale];
  return [
    ...sidebar(locale, guide),
    ...[develop2, reference2].map(({ label, collection }) => ({
      text: label,
      link: landingLink(locale, collection)
    }))
  ];
}
function moduleNav(locale) {
  const { develop: develop2, reference: reference2 } = guideModules[locale];
  const routePrefix = locale === "root" ? "" : "/en";
  return [
    { text: develop2.label, link: landingLink(locale, develop2.collection), activeMatch: `^${routePrefix}/develop/` },
    { text: reference2.label, link: landingLink(locale, reference2.collection), activeMatch: `^${routePrefix}/reference/` }
  ];
}
function watchCanonicalDocs(server) {
  const sources = docsSourceFiles();
  server.watcher.add(sources);
  server.watcher.on("change", (changed) => {
    if (!sources.includes(changed)) return;
    projectDocs();
  });
}
function serveRawMarkdown(server) {
  server.middlewares.use(rawMarkdownMiddleware(base, () => llmsTxt({ base, ...siteIdentity })));
}
function escapeVueInterpolation(html) {
  return html.replaceAll("{{", "&#123;&#123;").replaceAll("}}", "&#125;&#125;");
}
var sharedTheme = {
  search: {
    provider: "local",
    options: {
      locales: {
        root: {
          translations: {
            button: {
              buttonText: "\u641C\u7D22\u6587\u6863",
              buttonAriaLabel: "\u641C\u7D22\u6587\u6863"
            },
            modal: {
              displayDetails: "\u663E\u793A\u8BE6\u7EC6\u5217\u8868",
              resetButtonTitle: "\u6E05\u9664\u641C\u7D22",
              backButtonTitle: "\u5173\u95ED\u641C\u7D22",
              noResultsText: "\u672A\u627E\u5230\u76F8\u5173\u7ED3\u679C",
              footer: {
                selectText: "\u9009\u62E9",
                selectKeyAriaLabel: "\u56DE\u8F66\u952E",
                navigateText: "\u5207\u6362",
                navigateUpKeyAriaLabel: "\u4E0A\u65B9\u5411\u952E",
                navigateDownKeyAriaLabel: "\u4E0B\u65B9\u5411\u952E",
                closeText: "\u5173\u95ED",
                closeKeyAriaLabel: "Esc \u952E"
              }
            }
          }
        }
      }
    }
  },
  socialLinks: [
    { icon: "github", link: "https://github.com/deepseek-ai/deepseek-harness" }
  ],
  editLink: {
    pattern: ({ frontmatter }) => {
      const data = frontmatter;
      const editSource = typeof data === "object" && data !== null ? Reflect.get(data, "editSource") : void 0;
      if (typeof editSource !== "string") throw new Error("Projected documentation page has no editSource frontmatter.");
      return `https://github.com/deepseek-ai/deepseek-harness/edit/master/${editSource}`;
    },
    text: "\u5728 GitHub \u4E0A\u7F16\u8F91\u6B64\u9875"
  }
};
var base = process.env.DOCS_BASE ?? "/";
var siteIdentity = {
  title: "DeepSeek Harness",
  description: "\u7528\u4E8E\u6784\u5EFA Agent Harness \u7684\u63D2\u4EF6\u5316 SDK"
};
var wordmark = readFileSync2(resolve2(__vite_injected_original_dirname2, "../public/wordmark.svg"), "utf8").trim().replace("<svg ", '<svg class="dsh-wordmark" ');
var siteStyle = `
.dsh-lockup { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.dsh-wordmark { display: block; height: 22px; width: auto; color: var(--vp-c-text-1); }
.dsh-tag {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--vp-c-brand-soft);
  border-radius: 999px;
  padding: 1px 9px;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  white-space: nowrap;
  color: var(--vp-c-brand-1);
}

.VPSidebar::-webkit-scrollbar { width: 6px; }
.VPSidebar::-webkit-scrollbar-track { background: transparent; }
.VPSidebar::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 3px;
  transition: background-color 0.3s;
}
.VPSidebar[data-scrolling]::-webkit-scrollbar-thumb { background-color: var(--vp-c-text-3); }
@supports not selector(::-webkit-scrollbar) {
  .VPSidebar { scrollbar-width: thin; scrollbar-color: transparent transparent; }
  .VPSidebar[data-scrolling] { scrollbar-color: var(--vp-c-text-3) transparent; }
}
`;
var scrollbarScript = `
(() => {
  let idle
  addEventListener('scroll', (event) => {
    const target = event.target
    if (!(target instanceof Element) || !target.classList.contains('VPSidebar')) return
    target.dataset.scrolling = ''
    clearTimeout(idle)
    idle = setTimeout(() => delete target.dataset.scrolling, 800)
  }, true)
})()
`;
function siteTitle(previewTag) {
  return `<span class="dsh-lockup">${wordmark}<span class="dsh-tag">${previewTag}</span></span>`;
}
var config_default = withMermaid({
  title: siteIdentity.title,
  description: siteIdentity.description,
  base,
  transformHead: ({ siteConfig }) => codeGroupFallbackHead(siteConfig.mpa),
  /** Emit the raw-Markdown twin of every route plus llms.txt beside the rendered site. */
  buildEnd(siteConfig) {
    emitRawMarkdownPages(siteConfig.outDir);
    writeFileSync2(resolve2(siteConfig.outDir, "llms.txt"), llmsTxt({ base, ...siteIdentity }));
  },
  head: [
    // VitePress leaves head hrefs untouched, so the base belongs here explicitly.
    ["link", { rel: "icon", type: "image/svg+xml", href: `${base}favicon.svg` }],
    ["style", {}, siteStyle],
    ["script", {}, scrollbarScript]
  ],
  cleanUrls: true,
  srcDir: ".generated",
  cacheDir: ".cache",
  outDir: ".dist",
  locales: {
    root: {
      label: "\u7B80\u4F53\u4E2D\u6587",
      lang: "zh-CN",
      themeConfig: {
        siteTitle: siteTitle("\u6280\u672F\u9884\u89C8"),
        nav: [
          { text: "\u5165\u95E8", link: landingLink("root", guideModules.root.guide), activeMatch: "^/guide/" },
          ...moduleNav("root")
        ],
        sidebar: {
          "/guide/": guideSidebar("root"),
          "/develop/": sidebar("root", "zh-develop"),
          "/reference/": sidebar("root", "zh-reference")
        },
        outline: { label: "\u672C\u9875\u76EE\u5F55" },
        docFooter: { prev: "\u4E0A\u4E00\u7BC7", next: "\u4E0B\u4E00\u7BC7" },
        darkModeSwitchLabel: "\u5916\u89C2",
        lightModeSwitchTitle: "\u5207\u6362\u5230\u6D45\u8272\u4E3B\u9898",
        darkModeSwitchTitle: "\u5207\u6362\u5230\u6DF1\u8272\u4E3B\u9898",
        sidebarMenuLabel: "\u83DC\u5355",
        returnToTopLabel: "\u8FD4\u56DE\u9876\u90E8",
        langMenuLabel: "\u5207\u6362\u8BED\u8A00",
        skipToContentLabel: "\u8DF3\u81F3\u5185\u5BB9"
      }
    },
    en: {
      label: "English",
      lang: "en-US",
      link: "/en/",
      themeConfig: {
        siteTitle: siteTitle("Preview"),
        nav: [
          { text: "Guide", link: landingLink("en", guideModules.en.guide), activeMatch: "^/en/guide/" },
          ...moduleNav("en")
        ],
        sidebar: {
          "/en/guide/": guideSidebar("en"),
          "/en/develop/": sidebar("en", "en-develop"),
          "/en/reference/": sidebar("en", "en-reference")
        },
        editLink: {
          pattern: ({ frontmatter }) => {
            const data = frontmatter;
            const editSource = typeof data === "object" && data !== null ? Reflect.get(data, "editSource") : void 0;
            if (typeof editSource !== "string") throw new Error("Projected documentation page has no editSource frontmatter.");
            return `https://github.com/deepseek-ai/deepseek-harness/edit/master/${editSource}`;
          },
          text: "Edit this page on GitHub"
        },
        outline: { label: "On this page" },
        docFooter: { prev: "Previous", next: "Next" }
      }
    }
  },
  vite: {
    // `srcDir` puts the Vite root inside the disposable generated tree, whose
    // own `public/` no tracked asset can live in.
    publicDir: resolve2(__vite_injected_original_dirname2, "../public"),
    plugins: [
      {
        name: "deepseek-harness-doc-projector",
        configureServer(server) {
          watchCanonicalDocs(server);
          serveRawMarkdown(server);
        }
      }
    ]
  },
  markdown: {
    config(md) {
      isolateCodeGroupRadios(md);
      const renderText = md.renderer.rules.text;
      const renderCode = md.renderer.rules.code_inline;
      const renderFence = md.renderer.rules.fence;
      if (renderText === void 0) throw new Error("VitePress Markdown renderer is missing the text rendering rule.");
      if (renderCode === void 0) throw new Error("VitePress Markdown renderer is missing the inline-code rendering rule.");
      if (renderFence === void 0) throw new Error("VitePress Markdown renderer is missing the fence rendering rule.");
      md.renderer.rules.text = (...args) => escapeVueInterpolation(renderText(...args));
      md.renderer.rules.code_inline = (...args) => escapeVueInterpolation(renderCode(...args));
      const renderedFences = /* @__PURE__ */ new Map();
      md.renderer.rules.fence = (...args) => {
        const [tokens, index] = args;
        const token = tokens[index];
        if (token === void 0) throw new Error("VitePress code-fence renderer received no token.");
        if (["mermaid", "mmd"].includes(token.info.trim().split(/\s+/, 1)[0] ?? "")) return renderFence(...args);
        if (Reflect.get(token, "src") !== void 0) return renderFence(...args);
        if (process.env.NODE_ENV !== "production") return renderFence(...args);
        const key = JSON.stringify([token.content, token.info, token.markup, token.attrs]);
        const cached = renderedFences.get(key);
        if (cached !== void 0) return cached;
        const html = renderFence(...args);
        renderedFences.set(key, html);
        return html;
      };
    }
  },
  mermaid: {},
  themeConfig: sharedTheme
});
export {
  config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsid2Vic2l0ZS8udml0ZXByZXNzL2NvbmZpZy50cyIsICJ3ZWJzaXRlLy52aXRlcHJlc3MvY29kZS1ncm91cHMudHMiLCAid2Vic2l0ZS9kb2NzLnRzIiwgInNjcmlwdHMvcHJvamVjdC1kb2Mtc2l0ZS50cyIsICJzY3JpcHRzL21hcmtkb3duLnRzIiwgIndlYnNpdGUvcmF3LW1hcmtkb3duLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL2hvbWUvdHlsZXIvZGVlcHNlZWstaGFybmVzcy93ZWJzaXRlLy52aXRlcHJlc3NcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9ob21lL3R5bGVyL2RlZXBzZWVrLWhhcm5lc3Mvd2Vic2l0ZS8udml0ZXByZXNzL2NvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vaG9tZS90eWxlci9kZWVwc2Vlay1oYXJuZXNzL3dlYnNpdGUvLnZpdGVwcmVzcy9jb25maWcudHNcIjsvKiogVml0ZVByZXNzIGNvbmZpZ3VyYXRpb24gZm9yIHRoZSBsb2NhbGx5IHByb2plY3RlZCBkb2N1bWVudGF0aW9uIHNpdGUuICovXG5cbmltcG9ydCB7IHJlYWRGaWxlU3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gJ25vZGU6ZnMnXG5pbXBvcnQgeyByZXNvbHZlIH0gZnJvbSAnbm9kZTpwYXRoJ1xuaW1wb3J0IHR5cGUgeyBEZWZhdWx0VGhlbWUsIFBhZ2VEYXRhLCBTaXRlQ29uZmlnIH0gZnJvbSAndml0ZXByZXNzJ1xuaW1wb3J0IHR5cGUgeyBWaXRlRGV2U2VydmVyIH0gZnJvbSAndml0ZSdcbmltcG9ydCB7IHdpdGhNZXJtYWlkIH0gZnJvbSAndml0ZXByZXNzLXBsdWdpbi1tZXJtYWlkJ1xuaW1wb3J0IHsgY29kZUdyb3VwRmFsbGJhY2tIZWFkLCBpc29sYXRlQ29kZUdyb3VwUmFkaW9zIH0gZnJvbSAnLi9jb2RlLWdyb3Vwcy50cydcbmltcG9ydCB7IGxhbmRpbmdMaW5rLCBsb2NhbGVDb2xsZWN0aW9ucywgb3JkZXJlZFBhZ2VzLCByb3V0ZUxpbmssIHNlY3Rpb25TcGVjLCB0eXBlIERvY3NMb2NhbGUsIHR5cGUgRG9jc1BhZ2UsIHR5cGUgRG9jc1NpZGViYXIgfSBmcm9tICcuLi9kb2NzLnRzJ1xuaW1wb3J0IHsgZG9jc1NvdXJjZUZpbGVzLCBlbWl0UmF3TWFya2Rvd25QYWdlcywgbGxtc1R4dCwgcHJvamVjdERvY3MgfSBmcm9tICcuLi8uLi9zY3JpcHRzL3Byb2plY3QtZG9jLXNpdGUudHMnXG5pbXBvcnQgeyByYXdNYXJrZG93bk1pZGRsZXdhcmUgfSBmcm9tICcuLi9yYXctbWFya2Rvd24udHMnXG5cbnByb2plY3REb2NzKClcblxuZnVuY3Rpb24gc2lkZWJhcihsb2NhbGU6IERvY3NMb2NhbGUsIGNvbGxlY3Rpb246IE5vbk51bGxhYmxlPERvY3NQYWdlWydzaWRlYmFyJ10+KTogRGVmYXVsdFRoZW1lLlNpZGViYXJJdGVtW10ge1xuICAvLyBgb3JkZXJlZFBhZ2VzYCBhbHJlYWR5IHNvcnRzIGJ5IHNlY3Rpb24gcGxhY2VtZW50LCBzbyBpbnNlcnRpb24gb3JkZXJcbiAgLy8gY2FycmllcyB0aGUgZ3JvdXAgb3JkZXIgYW5kIGVhY2ggZ3JvdXAga2VlcHMgaXRzIHBhZ2VzIGluIHNlcXVlbmNlLlxuICBjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgRG9jc1BhZ2VbXT4oKVxuICBmb3IgKGNvbnN0IHBhZ2Ugb2Ygb3JkZXJlZFBhZ2VzKGxvY2FsZSwgY29sbGVjdGlvbikpIHtcbiAgICBjb25zdCBlbnRyaWVzID0gZ3JvdXBzLmdldChwYWdlLnNlY3Rpb24pID8/IFtdXG4gICAgZW50cmllcy5wdXNoKHBhZ2UpXG4gICAgZ3JvdXBzLnNldChwYWdlLnNlY3Rpb24sIGVudHJpZXMpXG4gIH1cbiAgcmV0dXJuIFsuLi5ncm91cHMuZW50cmllcygpXS5tYXAoKFt0ZXh0LCBlbnRyaWVzXSkgPT4ge1xuICAgIGNvbnN0IHsgY29sbGFwc2VkIH0gPSBzZWN0aW9uU3BlYyhsb2NhbGUsIHRleHQpXG4gICAgcmV0dXJuIHtcbiAgICAgIHRleHQsXG4gICAgICAvLyBBIHByZXNlbnQgYGNvbGxhcHNlZGAgaXMgd2hhdCBtYWtlcyB0aGUgZGVmYXVsdCB0aGVtZSByZW5kZXIgdGhlXG4gICAgICAvLyBncm91cCBhcyBjb2xsYXBzaWJsZSBhdCBhbGwsIHNvIGFuIG9wZW4gZ3JvdXAgbXVzdCBvbWl0IHRoZSBrZXkuXG4gICAgICAuLi4oY29sbGFwc2VkID09PSB1bmRlZmluZWQgPyB7fSA6IHsgY29sbGFwc2VkIH0pLFxuICAgICAgaXRlbXM6IGVudHJpZXMubWFwKHBhZ2UgPT4gKHsgdGV4dDogcGFnZS5sYWJlbCwgbGluazogcm91dGVMaW5rKHBhZ2Uucm91dGUpIH0pKSxcbiAgICB9XG4gIH0pXG59XG5cbi8qKiBPbmUgbW9kdWxlIGxpbmsgc2hhcmVkIGJldHdlZW4gdGhlIG5hdmlnYXRpb24gYmFyIGFuZCB0aGUgZ3VpZGUgc2lkZWJhci4gKi9cbmludGVyZmFjZSBHdWlkZU1vZHVsZUxpbmsge1xuICAvKiogTGFiZWwgc2hvd24gaW4gdGhlIG5hdmlnYXRpb24gYmFyIGFuZCB0aGUgZ3VpZGUgc2lkZWJhci4gKi9cbiAgbGFiZWw6IHN0cmluZ1xuICAvKiogU2lkZWJhciBjb2xsZWN0aW9uIHRoZSBsaW5rIG9wZW5zLiAqL1xuICBjb2xsZWN0aW9uOiBEb2NzU2lkZWJhclxufVxuXG4vKipcbiAqIFBlci1sb2NhbGUgZ3VpZGUtbW9kdWxlIGZhY3RzOiB0aGUgZ3VpZGUgY29sbGVjdGlvbiBhbmQgdGhlIG1vZHVsZSBsaW5rc1xuICogYXBwZW5kZWQgdG8gdGhlIGd1aWRlIHNpZGViYXIuXG4gKi9cbmludGVyZmFjZSBHdWlkZU1vZHVsZXMge1xuICAvKiogR3VpZGUgc2lkZWJhciBjb2xsZWN0aW9uIGZvciB0aGUgbG9jYWxlLiAqL1xuICBndWlkZTogJ3poLWd1aWRlJyB8ICdlbi1ndWlkZSdcbiAgLyoqIERldmVsb3BtZW50IG1vZHVsZSBsaW5rLiAqL1xuICBkZXZlbG9wOiBHdWlkZU1vZHVsZUxpbmtcbiAgLyoqIFJlZmVyZW5jZSBtb2R1bGUgbGluay4gKi9cbiAgcmVmZXJlbmNlOiBHdWlkZU1vZHVsZUxpbmtcbn1cblxuLyoqXG4gKiBHdWlkZS1tb2R1bGUgZmFjdHMga2V5ZWQgYnkgbG9jYWxlLCBnaXZpbmcgZXZlcnkgbW9kdWxlIGxhYmVsIGFuZCBjb2xsZWN0aW9uXG4gKiBvbmUgaG9tZSBzaGFyZWQgYnkgdGhlIG5hdmlnYXRpb24gYmFyIGFuZCB0aGUgZ3VpZGUgc2lkZWJhci5cbiAqL1xuY29uc3QgZ3VpZGVNb2R1bGVzID0ge1xuICByb290OiB7XG4gICAgZ3VpZGU6IGxvY2FsZUNvbGxlY3Rpb25zLnJvb3RbMF0sXG4gICAgZGV2ZWxvcDogeyBsYWJlbDogJ1x1NUYwMFx1NTNEMScsIGNvbGxlY3Rpb246IGxvY2FsZUNvbGxlY3Rpb25zLnJvb3RbMV0gfSxcbiAgICByZWZlcmVuY2U6IHsgbGFiZWw6ICdcdTUzQzJcdTgwMDMnLCBjb2xsZWN0aW9uOiBsb2NhbGVDb2xsZWN0aW9ucy5yb290WzJdIH0sXG4gIH0sXG4gIGVuOiB7XG4gICAgZ3VpZGU6IGxvY2FsZUNvbGxlY3Rpb25zLmVuWzBdLFxuICAgIGRldmVsb3A6IHsgbGFiZWw6ICdEZXZlbG9wbWVudCcsIGNvbGxlY3Rpb246IGxvY2FsZUNvbGxlY3Rpb25zLmVuWzFdIH0sXG4gICAgcmVmZXJlbmNlOiB7IGxhYmVsOiAnUmVmZXJlbmNlJywgY29sbGVjdGlvbjogbG9jYWxlQ29sbGVjdGlvbnMuZW5bMl0gfSxcbiAgfSxcbn0gc2F0aXNmaWVzIFJlY29yZDxEb2NzTG9jYWxlLCBHdWlkZU1vZHVsZXM+XG5cbi8qKlxuICogR3VpZGUgc2lkZWJhciB3aXRoIGRpcmVjdCBsaW5rcyBpbnRvIHRoZSBmaXJzdCBkZXZlbG9wbWVudCBhbmQgcmVmZXJlbmNlIHBhZ2VzLlxuICpcbiAqIEBwYXJhbSBsb2NhbGUgLSBSb3V0ZSB0cmVlIHdob3NlIGd1aWRlIHNpZGViYXIgaXMgYmVpbmcgYnVpbHQuXG4gKiBAcmV0dXJucyBHdWlkZSBncm91cHMgZm9sbG93ZWQgYnkgdG9wLWxldmVsIGxpbmtzIHRvIHRoZSBvdGhlciBkb2N1bWVudGF0aW9uIG1vZHVsZXMuXG4gKi9cbmZ1bmN0aW9uIGd1aWRlU2lkZWJhcihsb2NhbGU6IERvY3NMb2NhbGUpOiBEZWZhdWx0VGhlbWUuU2lkZWJhckl0ZW1bXSB7XG4gIGNvbnN0IHsgZ3VpZGUsIGRldmVsb3AsIHJlZmVyZW5jZSB9ID0gZ3VpZGVNb2R1bGVzW2xvY2FsZV1cbiAgcmV0dXJuIFtcbiAgICAuLi5zaWRlYmFyKGxvY2FsZSwgZ3VpZGUpLFxuICAgIC4uLltkZXZlbG9wLCByZWZlcmVuY2VdLm1hcCgoeyBsYWJlbCwgY29sbGVjdGlvbiB9KSA9PiAoe1xuICAgICAgdGV4dDogbGFiZWwsXG4gICAgICBsaW5rOiBsYW5kaW5nTGluayhsb2NhbGUsIGNvbGxlY3Rpb24pLFxuICAgIH0pKSxcbiAgXVxufVxuXG4vKipcbiAqIE5hdmlnYXRpb24tYmFyIGl0ZW1zIGZvciB0aGUgbW9kdWxlcyB0aGUgZ3VpZGUgc2lkZWJhciBsaW5rcyBpbnRvLCByZWFkaW5nXG4gKiB0aGVpciBsYWJlbHMgYW5kIGNvbGxlY3Rpb25zIGZyb20gdGhlIHNoYXJlZCBwZXItbG9jYWxlIHJlY29yZC5cbiAqXG4gKiBAcGFyYW0gbG9jYWxlIC0gUm91dGUgdHJlZSB0aGUgbmF2aWdhdGlvbiBpdGVtcyBiZWxvbmcgdG8uXG4gKiBAcmV0dXJucyBUaGUgbW9kdWxlIGl0ZW1zIGZvciB0aGUgbG9jYWxlJ3MgbmF2aWdhdGlvbiBiYXIuXG4gKi9cbmZ1bmN0aW9uIG1vZHVsZU5hdihsb2NhbGU6IERvY3NMb2NhbGUpOiBEZWZhdWx0VGhlbWUuTmF2SXRlbVtdIHtcbiAgY29uc3QgeyBkZXZlbG9wLCByZWZlcmVuY2UgfSA9IGd1aWRlTW9kdWxlc1tsb2NhbGVdXG4gIGNvbnN0IHJvdXRlUHJlZml4ID0gbG9jYWxlID09PSAncm9vdCcgPyAnJyA6ICcvZW4nXG4gIHJldHVybiBbXG4gICAgeyB0ZXh0OiBkZXZlbG9wLmxhYmVsLCBsaW5rOiBsYW5kaW5nTGluayhsb2NhbGUsIGRldmVsb3AuY29sbGVjdGlvbiksIGFjdGl2ZU1hdGNoOiBgXiR7cm91dGVQcmVmaXh9L2RldmVsb3AvYCB9LFxuICAgIHsgdGV4dDogcmVmZXJlbmNlLmxhYmVsLCBsaW5rOiBsYW5kaW5nTGluayhsb2NhbGUsIHJlZmVyZW5jZS5jb2xsZWN0aW9uKSwgYWN0aXZlTWF0Y2g6IGBeJHtyb3V0ZVByZWZpeH0vcmVmZXJlbmNlL2AgfSxcbiAgXVxufVxuXG5mdW5jdGlvbiB3YXRjaENhbm9uaWNhbERvY3Moc2VydmVyOiBWaXRlRGV2U2VydmVyKTogdm9pZCB7XG4gIGNvbnN0IHNvdXJjZXMgPSBkb2NzU291cmNlRmlsZXMoKVxuICBzZXJ2ZXIud2F0Y2hlci5hZGQoc291cmNlcylcbiAgc2VydmVyLndhdGNoZXIub24oJ2NoYW5nZScsIChjaGFuZ2VkKSA9PiB7XG4gICAgaWYgKCFzb3VyY2VzLmluY2x1ZGVzKGNoYW5nZWQpKSByZXR1cm5cbiAgICBwcm9qZWN0RG9jcygpXG4gIH0pXG59XG5cbi8qKlxuICogU2VydmUgdGhlIHJhdy1NYXJrZG93biB0d2luIG9mIGVhY2ggcm91dGUgYW5kIGxsbXMudHh0IGR1cmluZyBkZXZlbG9wbWVudCxcbiAqIG1hdGNoaW5nIHdoYXQgYGJ1aWxkRW5kYCBlbWl0cyBpbnRvIHRoZSBzdGF0aWMgYnVpbGQuIFBhZ2VzIHByb2plY3QgZnJvbVxuICogdGhlaXIgY2Fub25pY2FsIHNvdXJjZXMgcGVyIHJlcXVlc3QsIHNvIGFuIGVkaXQgc2hvd3Mgd2l0aG91dCBhIHJlYnVpbGQuXG4gKi9cbmZ1bmN0aW9uIHNlcnZlUmF3TWFya2Rvd24oc2VydmVyOiBWaXRlRGV2U2VydmVyKTogdm9pZCB7XG4gIHNlcnZlci5taWRkbGV3YXJlcy51c2UocmF3TWFya2Rvd25NaWRkbGV3YXJlKGJhc2UsICgpID0+IGxsbXNUeHQoeyBiYXNlLCAuLi5zaXRlSWRlbnRpdHkgfSkpKVxufVxuXG5mdW5jdGlvbiBlc2NhcGVWdWVJbnRlcnBvbGF0aW9uKGh0bWw6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBodG1sLnJlcGxhY2VBbGwoJ3t7JywgJyYjMTIzOyYjMTIzOycpLnJlcGxhY2VBbGwoJ319JywgJyYjMTI1OyYjMTI1OycpXG59XG5cbmNvbnN0IHNoYXJlZFRoZW1lOiBQaWNrPERlZmF1bHRUaGVtZS5Db25maWcsICdzZWFyY2gnIHwgJ3NvY2lhbExpbmtzJyB8ICdlZGl0TGluayc+ID0ge1xuICBzZWFyY2g6IHtcbiAgICBwcm92aWRlcjogJ2xvY2FsJyxcbiAgICBvcHRpb25zOiB7XG4gICAgICBsb2NhbGVzOiB7XG4gICAgICAgIHJvb3Q6IHtcbiAgICAgICAgICB0cmFuc2xhdGlvbnM6IHtcbiAgICAgICAgICAgIGJ1dHRvbjoge1xuICAgICAgICAgICAgICBidXR0b25UZXh0OiAnXHU2NDFDXHU3RDIyXHU2NTg3XHU2ODYzJyxcbiAgICAgICAgICAgICAgYnV0dG9uQXJpYUxhYmVsOiAnXHU2NDFDXHU3RDIyXHU2NTg3XHU2ODYzJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBtb2RhbDoge1xuICAgICAgICAgICAgICBkaXNwbGF5RGV0YWlsczogJ1x1NjYzRVx1NzkzQVx1OEJFNlx1N0VDNlx1NTIxN1x1ODg2OCcsXG4gICAgICAgICAgICAgIHJlc2V0QnV0dG9uVGl0bGU6ICdcdTZFMDVcdTk2NjRcdTY0MUNcdTdEMjInLFxuICAgICAgICAgICAgICBiYWNrQnV0dG9uVGl0bGU6ICdcdTUxNzNcdTk1RURcdTY0MUNcdTdEMjInLFxuICAgICAgICAgICAgICBub1Jlc3VsdHNUZXh0OiAnXHU2NzJBXHU2MjdFXHU1MjMwXHU3NkY4XHU1MTczXHU3RUQzXHU2NzlDJyxcbiAgICAgICAgICAgICAgZm9vdGVyOiB7XG4gICAgICAgICAgICAgICAgc2VsZWN0VGV4dDogJ1x1OTAwOVx1NjJFOScsXG4gICAgICAgICAgICAgICAgc2VsZWN0S2V5QXJpYUxhYmVsOiAnXHU1NkRFXHU4RjY2XHU5NTJFJyxcbiAgICAgICAgICAgICAgICBuYXZpZ2F0ZVRleHQ6ICdcdTUyMDdcdTYzNjInLFxuICAgICAgICAgICAgICAgIG5hdmlnYXRlVXBLZXlBcmlhTGFiZWw6ICdcdTRFMEFcdTY1QjlcdTU0MTFcdTk1MkUnLFxuICAgICAgICAgICAgICAgIG5hdmlnYXRlRG93bktleUFyaWFMYWJlbDogJ1x1NEUwQlx1NjVCOVx1NTQxMVx1OTUyRScsXG4gICAgICAgICAgICAgICAgY2xvc2VUZXh0OiAnXHU1MTczXHU5NUVEJyxcbiAgICAgICAgICAgICAgICBjbG9zZUtleUFyaWFMYWJlbDogJ0VzYyBcdTk1MkUnLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICB9LFxuICBzb2NpYWxMaW5rczogW1xuICAgIHsgaWNvbjogJ2dpdGh1YicsIGxpbms6ICdodHRwczovL2dpdGh1Yi5jb20vZGVlcHNlZWstYWkvZGVlcHNlZWstaGFybmVzcycgfSxcbiAgXSxcbiAgZWRpdExpbms6IHtcbiAgICBwYXR0ZXJuOiAoeyBmcm9udG1hdHRlciB9OiBQYWdlRGF0YSkgPT4ge1xuICAgICAgY29uc3QgZGF0YTogdW5rbm93biA9IGZyb250bWF0dGVyXG4gICAgICBjb25zdCBlZGl0U291cmNlOiB1bmtub3duID0gdHlwZW9mIGRhdGEgPT09ICdvYmplY3QnICYmIGRhdGEgIT09IG51bGwgPyBSZWZsZWN0LmdldChkYXRhLCAnZWRpdFNvdXJjZScpIDogdW5kZWZpbmVkXG4gICAgICBpZiAodHlwZW9mIGVkaXRTb3VyY2UgIT09ICdzdHJpbmcnKSB0aHJvdyBuZXcgRXJyb3IoJ1Byb2plY3RlZCBkb2N1bWVudGF0aW9uIHBhZ2UgaGFzIG5vIGVkaXRTb3VyY2UgZnJvbnRtYXR0ZXIuJylcbiAgICAgIHJldHVybiBgaHR0cHM6Ly9naXRodWIuY29tL2RlZXBzZWVrLWFpL2RlZXBzZWVrLWhhcm5lc3MvZWRpdC9tYXN0ZXIvJHtlZGl0U291cmNlfWBcbiAgICB9LFxuICAgIHRleHQ6ICdcdTU3MjggR2l0SHViIFx1NEUwQVx1N0YxNlx1OEY5MVx1NkI2NFx1OTg3NScsXG4gIH0sXG59XG5cbi8qKiBTaXRlIGJhc2UgcGF0aCwgY2FycnlpbmcgdGhlIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHNsYXNoZXMgVml0ZVByZXNzIHJlcXVpcmVzLiAqL1xuY29uc3QgYmFzZSA9IHByb2Nlc3MuZW52LkRPQ1NfQkFTRSA/PyAnLydcblxuLyoqIFNpdGUgaWRlbnRpdHkgc2hhcmVkIGJ5IHRoZSBWaXRlUHJlc3MgY29uZmlndXJhdGlvbiBhbmQgdGhlIGxsbXMudHh0IGluZGV4LiAqL1xuY29uc3Qgc2l0ZUlkZW50aXR5ID0ge1xuICB0aXRsZTogJ0RlZXBTZWVrIEhhcm5lc3MnLFxuICBkZXNjcmlwdGlvbjogJ1x1NzUyOFx1NEU4RVx1Njc4NFx1NUVGQSBBZ2VudCBIYXJuZXNzIFx1NzY4NFx1NjNEMlx1NEVGNlx1NTMxNiBTREsnLFxufVxuXG4vKipcbiAqIFRoZSBEZWVwU2VlayB3b3JkbWFyaywgaW5saW5lZCBzbyBpdHMgYGN1cnJlbnRDb2xvcmAgZmlsbHMgZm9sbG93IHRoZSBhY3RpdmVcbiAqIHRoZW1lLiBBbiBgPGltZz5gIHdvdWxkIGZyZWV6ZSB0aGUgbWFyayBhdCB0aGUgY29sb3JzIHRoZSBmaWxlIGRlY2xhcmVzLlxuICovXG5jb25zdCB3b3JkbWFyayA9IHJlYWRGaWxlU3luYyhyZXNvbHZlKGltcG9ydC5tZXRhLmRpcm5hbWUsICcuLi9wdWJsaWMvd29yZG1hcmsuc3ZnJyksICd1dGY4JylcbiAgLnRyaW0oKVxuICAucmVwbGFjZSgnPHN2ZyAnLCAnPHN2ZyBjbGFzcz1cImRzaC13b3JkbWFya1wiICcpXG5cbi8qKlxuICogSGVhZC1pbmplY3RlZCBzdHlsZXMgZm9yIHRoZSBzaXRlIGlkZW50aXR5IGFuZCBzaWRlYmFyIHNjcm9sbGJhci5cbiAqXG4gKiBUaGUgbmF2aWdhdGlvbi1iYXIgbG9ja3VwIHBhaXJzIHdpdGggYHNpdGVUaXRsZWAuIFRoZSBzY3JvbGxiYXIgcnVsZXMgcmVwbGFjZVxuICogdGhlIHNpZGViYXIncyBwbGF0Zm9ybSBiYXIsIHdoaWNoIHJlc2VydmVzIDE1cHggb2YgYSAyNjVweCBjb2x1bW4gYW5kIGRyYXdzIGFcbiAqIHRyYWNrIHRoZSByZXN0IG9mIHRoZSBuYXZpZ2F0aW9uIGhhcyBubyBib3JkZXIgZm9yOyBgc2Nyb2xsYmFyU2NyaXB0YCBzdXBwbGllc1xuICogdGhlIG1hcmtlciB0aGF0IHJldmVhbHMgdGhlIHRodW1iLiBDaHJvbWUgZHJvcHMgYDo6LXdlYmtpdC1zY3JvbGxiYXJgIG9uY2VcbiAqIGBzY3JvbGxiYXItd2lkdGhgIGlzIHNldCB0byBhbnl0aGluZyBidXQgYGF1dG9gLCBzbyB0aGUgc3RhbmRhcmQgcHJvcGVydGllc1xuICogc3RheSBiZWhpbmQgYSBxdWVyeSBvbmx5IEZpcmVmb3ggYW5zd2Vycy5cbiAqL1xuY29uc3Qgc2l0ZVN0eWxlID0gYFxuLmRzaC1sb2NrdXAgeyBkaXNwbGF5OiBpbmxpbmUtZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiA4cHg7IG1pbi13aWR0aDogMDsgfVxuLmRzaC13b3JkbWFyayB7IGRpc3BsYXk6IGJsb2NrOyBoZWlnaHQ6IDIycHg7IHdpZHRoOiBhdXRvOyBjb2xvcjogdmFyKC0tdnAtYy10ZXh0LTEpOyB9XG4uZHNoLXRhZyB7XG4gIGRpc3BsYXk6IGlubGluZS1mbGV4O1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS12cC1jLWJyYW5kLXNvZnQpO1xuICBib3JkZXItcmFkaXVzOiA5OTlweDtcbiAgcGFkZGluZzogMXB4IDlweDtcbiAgZm9udC1zaXplOiAxMnB4O1xuICBmb250LXdlaWdodDogNTAwO1xuICBsaW5lLWhlaWdodDogMThweDtcbiAgd2hpdGUtc3BhY2U6IG5vd3JhcDtcbiAgY29sb3I6IHZhcigtLXZwLWMtYnJhbmQtMSk7XG59XG5cbi5WUFNpZGViYXI6Oi13ZWJraXQtc2Nyb2xsYmFyIHsgd2lkdGg6IDZweDsgfVxuLlZQU2lkZWJhcjo6LXdlYmtpdC1zY3JvbGxiYXItdHJhY2sgeyBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDsgfVxuLlZQU2lkZWJhcjo6LXdlYmtpdC1zY3JvbGxiYXItdGh1bWIge1xuICBiYWNrZ3JvdW5kLWNvbG9yOiB0cmFuc3BhcmVudDtcbiAgYm9yZGVyLXJhZGl1czogM3B4O1xuICB0cmFuc2l0aW9uOiBiYWNrZ3JvdW5kLWNvbG9yIDAuM3M7XG59XG4uVlBTaWRlYmFyW2RhdGEtc2Nyb2xsaW5nXTo6LXdlYmtpdC1zY3JvbGxiYXItdGh1bWIgeyBiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS12cC1jLXRleHQtMyk7IH1cbkBzdXBwb3J0cyBub3Qgc2VsZWN0b3IoOjotd2Via2l0LXNjcm9sbGJhcikge1xuICAuVlBTaWRlYmFyIHsgc2Nyb2xsYmFyLXdpZHRoOiB0aGluOyBzY3JvbGxiYXItY29sb3I6IHRyYW5zcGFyZW50IHRyYW5zcGFyZW50OyB9XG4gIC5WUFNpZGViYXJbZGF0YS1zY3JvbGxpbmddIHsgc2Nyb2xsYmFyLWNvbG9yOiB2YXIoLS12cC1jLXRleHQtMykgdHJhbnNwYXJlbnQ7IH1cbn1cbmBcblxuLyoqXG4gKiBNYXJrIHRoZSBzaWRlYmFyIHdoaWxlIGl0IHNjcm9sbHMsIHNvIGl0cyBzY3JvbGxiYXIgcmVzdHMgaW52aXNpYmxlLlxuICpcbiAqIEEgc2l6ZWQgYDo6LXdlYmtpdC1zY3JvbGxiYXJgIG9wdHMgdGhlIGVsZW1lbnQgb3V0IG9mIHRoZSBwbGF0Zm9ybSdzXG4gKiBzZWxmLWhpZGluZyBvdmVybGF5IGJhciwgbGVhdmluZyBvbmUgcGFpbnRlZCBhdCBhbGwgdGltZXM7IG5vdGhpbmcgaW4gQ1NTXG4gKiByZXBvcnRzIHRoYXQgYW4gZWxlbWVudCBpcyBzY3JvbGxpbmcuIFRoZSBsaXN0ZW5lciBjYXB0dXJlcyBpbnN0ZWFkIG9mXG4gKiBidWJibGluZyBiZWNhdXNlIHNjcm9sbCBldmVudHMgZG8gbm90IGJ1YmJsZSwgYW5kIG1hcmtzIGEgYGRhdGEtYCBhdHRyaWJ1dGVcbiAqIHJhdGhlciB0aGFuIGEgY2xhc3MgYmVjYXVzZSBWdWUgcmV3cml0ZXMgYGNsYXNzYCB3aG9sZXNhbGUgd2hlbiBpdCBwYXRjaGVzXG4gKiB0aGUgZWxlbWVudC5cbiAqL1xuY29uc3Qgc2Nyb2xsYmFyU2NyaXB0ID0gYFxuKCgpID0+IHtcbiAgbGV0IGlkbGVcbiAgYWRkRXZlbnRMaXN0ZW5lcignc2Nyb2xsJywgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0XG4gICAgaWYgKCEodGFyZ2V0IGluc3RhbmNlb2YgRWxlbWVudCkgfHwgIXRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ1ZQU2lkZWJhcicpKSByZXR1cm5cbiAgICB0YXJnZXQuZGF0YXNldC5zY3JvbGxpbmcgPSAnJ1xuICAgIGNsZWFyVGltZW91dChpZGxlKVxuICAgIGlkbGUgPSBzZXRUaW1lb3V0KCgpID0+IGRlbGV0ZSB0YXJnZXQuZGF0YXNldC5zY3JvbGxpbmcsIDgwMClcbiAgfSwgdHJ1ZSlcbn0pKClcbmBcblxuLyoqXG4gKiBOYXZpZ2F0aW9uLWJhciB0aXRsZTogdGhlIERlZXBTZWVrIHdvcmRtYXJrIGFuZCB0aGUgcmVsZWFzZS1zdGFnZSB0YWcuXG4gKiBWaXRlUHJlc3MgcmVuZGVycyBgc2l0ZVRpdGxlYCBhcyBIVE1MLlxuICpcbiAqIEBwYXJhbSBwcmV2aWV3VGFnIC0gTG9jYWxpemVkIHJlbGVhc2Utc3RhZ2UgbGFiZWwuXG4gKiBAcmV0dXJucyBNYXJrdXAgcGxhY2VkIGJlc2lkZSB0aGUgbmF2aWdhdGlvbi1iYXIgaG9tZSBsaW5rLlxuICovXG5mdW5jdGlvbiBzaXRlVGl0bGUocHJldmlld1RhZzogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIGA8c3BhbiBjbGFzcz1cImRzaC1sb2NrdXBcIj4ke3dvcmRtYXJrfTxzcGFuIGNsYXNzPVwiZHNoLXRhZ1wiPiR7cHJldmlld1RhZ308L3NwYW4+PC9zcGFuPmBcbn1cblxuZXhwb3J0IGRlZmF1bHQgd2l0aE1lcm1haWQoe1xuICB0aXRsZTogc2l0ZUlkZW50aXR5LnRpdGxlLFxuICBkZXNjcmlwdGlvbjogc2l0ZUlkZW50aXR5LmRlc2NyaXB0aW9uLFxuICBiYXNlLFxuICB0cmFuc2Zvcm1IZWFkOiAoeyBzaXRlQ29uZmlnIH0pID0+IGNvZGVHcm91cEZhbGxiYWNrSGVhZChzaXRlQ29uZmlnLm1wYSksXG4gIC8qKiBFbWl0IHRoZSByYXctTWFya2Rvd24gdHdpbiBvZiBldmVyeSByb3V0ZSBwbHVzIGxsbXMudHh0IGJlc2lkZSB0aGUgcmVuZGVyZWQgc2l0ZS4gKi9cbiAgYnVpbGRFbmQoc2l0ZUNvbmZpZzogU2l0ZUNvbmZpZykge1xuICAgIGVtaXRSYXdNYXJrZG93blBhZ2VzKHNpdGVDb25maWcub3V0RGlyKVxuICAgIHdyaXRlRmlsZVN5bmMocmVzb2x2ZShzaXRlQ29uZmlnLm91dERpciwgJ2xsbXMudHh0JyksIGxsbXNUeHQoeyBiYXNlLCAuLi5zaXRlSWRlbnRpdHkgfSkpXG4gIH0sXG4gIGhlYWQ6IFtcbiAgICAvLyBWaXRlUHJlc3MgbGVhdmVzIGhlYWQgaHJlZnMgdW50b3VjaGVkLCBzbyB0aGUgYmFzZSBiZWxvbmdzIGhlcmUgZXhwbGljaXRseS5cbiAgICBbJ2xpbmsnLCB7IHJlbDogJ2ljb24nLCB0eXBlOiAnaW1hZ2Uvc3ZnK3htbCcsIGhyZWY6IGAke2Jhc2V9ZmF2aWNvbi5zdmdgIH1dLFxuICAgIFsnc3R5bGUnLCB7fSwgc2l0ZVN0eWxlXSxcbiAgICBbJ3NjcmlwdCcsIHt9LCBzY3JvbGxiYXJTY3JpcHRdLFxuICBdLFxuICBjbGVhblVybHM6IHRydWUsXG4gIHNyY0RpcjogJy5nZW5lcmF0ZWQnLFxuICBjYWNoZURpcjogJy5jYWNoZScsXG4gIG91dERpcjogJy5kaXN0JyxcbiAgbG9jYWxlczoge1xuICAgIHJvb3Q6IHtcbiAgICAgIGxhYmVsOiAnXHU3QjgwXHU0RjUzXHU0RTJEXHU2NTg3JyxcbiAgICAgIGxhbmc6ICd6aC1DTicsXG4gICAgICB0aGVtZUNvbmZpZzoge1xuICAgICAgICBzaXRlVGl0bGU6IHNpdGVUaXRsZSgnXHU2MjgwXHU2NzJGXHU5ODg0XHU4OUM4JyksXG4gICAgICAgIG5hdjogW1xuICAgICAgICAgIHsgdGV4dDogJ1x1NTE2NVx1OTVFOCcsIGxpbms6IGxhbmRpbmdMaW5rKCdyb290JywgZ3VpZGVNb2R1bGVzLnJvb3QuZ3VpZGUpLCBhY3RpdmVNYXRjaDogJ14vZ3VpZGUvJyB9LFxuICAgICAgICAgIC4uLm1vZHVsZU5hdigncm9vdCcpLFxuICAgICAgICBdLFxuICAgICAgICBzaWRlYmFyOiB7XG4gICAgICAgICAgJy9ndWlkZS8nOiBndWlkZVNpZGViYXIoJ3Jvb3QnKSxcbiAgICAgICAgICAnL2RldmVsb3AvJzogc2lkZWJhcigncm9vdCcsICd6aC1kZXZlbG9wJyksXG4gICAgICAgICAgJy9yZWZlcmVuY2UvJzogc2lkZWJhcigncm9vdCcsICd6aC1yZWZlcmVuY2UnKSxcbiAgICAgICAgfSxcbiAgICAgICAgb3V0bGluZTogeyBsYWJlbDogJ1x1NjcyQ1x1OTg3NVx1NzZFRVx1NUY1NScgfSxcbiAgICAgICAgZG9jRm9vdGVyOiB7IHByZXY6ICdcdTRFMEFcdTRFMDBcdTdCQzcnLCBuZXh0OiAnXHU0RTBCXHU0RTAwXHU3QkM3JyB9LFxuICAgICAgICBkYXJrTW9kZVN3aXRjaExhYmVsOiAnXHU1OTE2XHU4OUMyJyxcbiAgICAgICAgbGlnaHRNb2RlU3dpdGNoVGl0bGU6ICdcdTUyMDdcdTYzNjJcdTUyMzBcdTZENDVcdTgyNzJcdTRFM0JcdTk4OTgnLFxuICAgICAgICBkYXJrTW9kZVN3aXRjaFRpdGxlOiAnXHU1MjA3XHU2MzYyXHU1MjMwXHU2REYxXHU4MjcyXHU0RTNCXHU5ODk4JyxcbiAgICAgICAgc2lkZWJhck1lbnVMYWJlbDogJ1x1ODNEQ1x1NTM1NScsXG4gICAgICAgIHJldHVyblRvVG9wTGFiZWw6ICdcdThGRDRcdTU2REVcdTk4NzZcdTkwRTgnLFxuICAgICAgICBsYW5nTWVudUxhYmVsOiAnXHU1MjA3XHU2MzYyXHU4QkVEXHU4QTAwJyxcbiAgICAgICAgc2tpcFRvQ29udGVudExhYmVsOiAnXHU4REYzXHU4MUYzXHU1MTg1XHU1QkI5JyxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBlbjoge1xuICAgICAgbGFiZWw6ICdFbmdsaXNoJyxcbiAgICAgIGxhbmc6ICdlbi1VUycsXG4gICAgICBsaW5rOiAnL2VuLycsXG4gICAgICB0aGVtZUNvbmZpZzoge1xuICAgICAgICBzaXRlVGl0bGU6IHNpdGVUaXRsZSgnUHJldmlldycpLFxuICAgICAgICBuYXY6IFtcbiAgICAgICAgICB7IHRleHQ6ICdHdWlkZScsIGxpbms6IGxhbmRpbmdMaW5rKCdlbicsIGd1aWRlTW9kdWxlcy5lbi5ndWlkZSksIGFjdGl2ZU1hdGNoOiAnXi9lbi9ndWlkZS8nIH0sXG4gICAgICAgICAgLi4ubW9kdWxlTmF2KCdlbicpLFxuICAgICAgICBdLFxuICAgICAgICBzaWRlYmFyOiB7XG4gICAgICAgICAgJy9lbi9ndWlkZS8nOiBndWlkZVNpZGViYXIoJ2VuJyksXG4gICAgICAgICAgJy9lbi9kZXZlbG9wLyc6IHNpZGViYXIoJ2VuJywgJ2VuLWRldmVsb3AnKSxcbiAgICAgICAgICAnL2VuL3JlZmVyZW5jZS8nOiBzaWRlYmFyKCdlbicsICdlbi1yZWZlcmVuY2UnKSxcbiAgICAgICAgfSxcbiAgICAgICAgZWRpdExpbms6IHtcbiAgICAgICAgICBwYXR0ZXJuOiAoeyBmcm9udG1hdHRlciB9OiBQYWdlRGF0YSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgZGF0YTogdW5rbm93biA9IGZyb250bWF0dGVyXG4gICAgICAgICAgICBjb25zdCBlZGl0U291cmNlOiB1bmtub3duID0gdHlwZW9mIGRhdGEgPT09ICdvYmplY3QnICYmIGRhdGEgIT09IG51bGwgPyBSZWZsZWN0LmdldChkYXRhLCAnZWRpdFNvdXJjZScpIDogdW5kZWZpbmVkXG4gICAgICAgICAgICBpZiAodHlwZW9mIGVkaXRTb3VyY2UgIT09ICdzdHJpbmcnKSB0aHJvdyBuZXcgRXJyb3IoJ1Byb2plY3RlZCBkb2N1bWVudGF0aW9uIHBhZ2UgaGFzIG5vIGVkaXRTb3VyY2UgZnJvbnRtYXR0ZXIuJylcbiAgICAgICAgICAgIHJldHVybiBgaHR0cHM6Ly9naXRodWIuY29tL2RlZXBzZWVrLWFpL2RlZXBzZWVrLWhhcm5lc3MvZWRpdC9tYXN0ZXIvJHtlZGl0U291cmNlfWBcbiAgICAgICAgICB9LFxuICAgICAgICAgIHRleHQ6ICdFZGl0IHRoaXMgcGFnZSBvbiBHaXRIdWInLFxuICAgICAgICB9LFxuICAgICAgICBvdXRsaW5lOiB7IGxhYmVsOiAnT24gdGhpcyBwYWdlJyB9LFxuICAgICAgICBkb2NGb290ZXI6IHsgcHJldjogJ1ByZXZpb3VzJywgbmV4dDogJ05leHQnIH0sXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG4gIHZpdGU6IHtcbiAgICAvLyBgc3JjRGlyYCBwdXRzIHRoZSBWaXRlIHJvb3QgaW5zaWRlIHRoZSBkaXNwb3NhYmxlIGdlbmVyYXRlZCB0cmVlLCB3aG9zZVxuICAgIC8vIG93biBgcHVibGljL2Agbm8gdHJhY2tlZCBhc3NldCBjYW4gbGl2ZSBpbi5cbiAgICBwdWJsaWNEaXI6IHJlc29sdmUoaW1wb3J0Lm1ldGEuZGlybmFtZSwgJy4uL3B1YmxpYycpLFxuICAgIHBsdWdpbnM6IFtcbiAgICAgIHtcbiAgICAgICAgbmFtZTogJ2RlZXBzZWVrLWhhcm5lc3MtZG9jLXByb2plY3RvcicsXG4gICAgICAgIGNvbmZpZ3VyZVNlcnZlcihzZXJ2ZXIpIHtcbiAgICAgICAgICB3YXRjaENhbm9uaWNhbERvY3Moc2VydmVyKVxuICAgICAgICAgIHNlcnZlUmF3TWFya2Rvd24oc2VydmVyKVxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICBdLFxuICB9LFxuICBtYXJrZG93bjoge1xuICAgIGNvbmZpZyhtZCkge1xuICAgICAgaXNvbGF0ZUNvZGVHcm91cFJhZGlvcyhtZClcbiAgICAgIGNvbnN0IHJlbmRlclRleHQgPSBtZC5yZW5kZXJlci5ydWxlcy50ZXh0XG4gICAgICBjb25zdCByZW5kZXJDb2RlID0gbWQucmVuZGVyZXIucnVsZXMuY29kZV9pbmxpbmVcbiAgICAgIGNvbnN0IHJlbmRlckZlbmNlID0gbWQucmVuZGVyZXIucnVsZXMuZmVuY2VcbiAgICAgIGlmIChyZW5kZXJUZXh0ID09PSB1bmRlZmluZWQpIHRocm93IG5ldyBFcnJvcignVml0ZVByZXNzIE1hcmtkb3duIHJlbmRlcmVyIGlzIG1pc3NpbmcgdGhlIHRleHQgcmVuZGVyaW5nIHJ1bGUuJylcbiAgICAgIGlmIChyZW5kZXJDb2RlID09PSB1bmRlZmluZWQpIHRocm93IG5ldyBFcnJvcignVml0ZVByZXNzIE1hcmtkb3duIHJlbmRlcmVyIGlzIG1pc3NpbmcgdGhlIGlubGluZS1jb2RlIHJlbmRlcmluZyBydWxlLicpXG4gICAgICBpZiAocmVuZGVyRmVuY2UgPT09IHVuZGVmaW5lZCkgdGhyb3cgbmV3IEVycm9yKCdWaXRlUHJlc3MgTWFya2Rvd24gcmVuZGVyZXIgaXMgbWlzc2luZyB0aGUgZmVuY2UgcmVuZGVyaW5nIHJ1bGUuJylcbiAgICAgIG1kLnJlbmRlcmVyLnJ1bGVzLnRleHQgPSAoLi4uYXJncykgPT4gZXNjYXBlVnVlSW50ZXJwb2xhdGlvbihyZW5kZXJUZXh0KC4uLmFyZ3MpKVxuICAgICAgbWQucmVuZGVyZXIucnVsZXMuY29kZV9pbmxpbmUgPSAoLi4uYXJncykgPT4gZXNjYXBlVnVlSW50ZXJwb2xhdGlvbihyZW5kZXJDb2RlKC4uLmFyZ3MpKVxuICAgICAgY29uc3QgcmVuZGVyZWRGZW5jZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpXG4gICAgICBtZC5yZW5kZXJlci5ydWxlcy5mZW5jZSA9ICguLi5hcmdzKSA9PiB7XG4gICAgICAgIGNvbnN0IFt0b2tlbnMsIGluZGV4XSA9IGFyZ3NcbiAgICAgICAgY29uc3QgdG9rZW4gPSB0b2tlbnNbaW5kZXhdXG4gICAgICAgIGlmICh0b2tlbiA9PT0gdW5kZWZpbmVkKSB0aHJvdyBuZXcgRXJyb3IoJ1ZpdGVQcmVzcyBjb2RlLWZlbmNlIHJlbmRlcmVyIHJlY2VpdmVkIG5vIHRva2VuLicpXG4gICAgICAgIC8vIE1lcm1haWQgb3V0cHV0IGVtYmVkcyB0aGUgdG9rZW4gcG9zaXRpb24sIGFuZCBWaXRlUHJlc3Mgc25pcHBldHMgcmVzb2x2ZSBzb3VyY2UgZmlsZXMgZHVyaW5nIHJlbmRlcmluZy5cbiAgICAgICAgaWYgKFsnbWVybWFpZCcsICdtbWQnXS5pbmNsdWRlcyh0b2tlbi5pbmZvLnRyaW0oKS5zcGxpdCgvXFxzKy8sIDEpWzBdID8/ICcnKSkgcmV0dXJuIHJlbmRlckZlbmNlKC4uLmFyZ3MpXG4gICAgICAgIGlmIChSZWZsZWN0LmdldCh0b2tlbiwgJ3NyYycpICE9PSB1bmRlZmluZWQpIHJldHVybiByZW5kZXJGZW5jZSguLi5hcmdzKVxuICAgICAgICAvLyBLZWVwIHRoZSBjYWNoZSBidWlsZC1sb2NhbDsgYSBkZXYgcmVuZGVyZXIgY2FuIHN1cnZpdmUgbWFueSBITVIgdXBkYXRlcy5cbiAgICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WICE9PSAncHJvZHVjdGlvbicpIHJldHVybiByZW5kZXJGZW5jZSguLi5hcmdzKVxuICAgICAgICBjb25zdCBrZXkgPSBKU09OLnN0cmluZ2lmeShbdG9rZW4uY29udGVudCwgdG9rZW4uaW5mbywgdG9rZW4ubWFya3VwLCB0b2tlbi5hdHRyc10pXG4gICAgICAgIGNvbnN0IGNhY2hlZCA9IHJlbmRlcmVkRmVuY2VzLmdldChrZXkpXG4gICAgICAgIGlmIChjYWNoZWQgIT09IHVuZGVmaW5lZCkgcmV0dXJuIGNhY2hlZFxuICAgICAgICBjb25zdCBodG1sID0gcmVuZGVyRmVuY2UoLi4uYXJncylcbiAgICAgICAgcmVuZGVyZWRGZW5jZXMuc2V0KGtleSwgaHRtbClcbiAgICAgICAgcmV0dXJuIGh0bWxcbiAgICAgIH1cbiAgICB9LFxuICB9LFxuICBtZXJtYWlkOiB7fSxcbiAgdGhlbWVDb25maWc6IHNoYXJlZFRoZW1lLFxufSlcbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL2hvbWUvdHlsZXIvZGVlcHNlZWstaGFybmVzcy93ZWJzaXRlLy52aXRlcHJlc3NcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9ob21lL3R5bGVyL2RlZXBzZWVrLWhhcm5lc3Mvd2Vic2l0ZS8udml0ZXByZXNzL2NvZGUtZ3JvdXBzLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3R5bGVyL2RlZXBzZWVrLWhhcm5lc3Mvd2Vic2l0ZS8udml0ZXByZXNzL2NvZGUtZ3JvdXBzLnRzXCI7LyoqIElzb2xhdGVzIG5hdGl2ZSBjb2RlLWdyb3VwIHJhZGlvcyBmcm9tIGNvcGllcyByZW5kZXJlZCBpbiBsb2NhbCBzZWFyY2guICovXG5cbmltcG9ydCB0eXBlIHsgSGVhZENvbmZpZywgTWFya2Rvd25SZW5kZXJlciB9IGZyb20gJ3ZpdGVwcmVzcydcblxuLyoqXG4gKiBLZWVwcyBhbGwgY29kZS1ncm91cCBjb21tYW5kcyByZWFkYWJsZSB3aGVuIE1QQSBvdXRwdXQgb21pdHMgdGhlIHRoZW1lJ3MgY2xpZW50IGhhbmRsZXJzLlxuICogQHBhcmFtIG1wYSAtIFdoZXRoZXIgdGhlIHJlc29sdmVkIHNpdGUgdXNlcyBWaXRlUHJlc3MncyBNUEEgYnVpbGQuXG4gKiBAcmV0dXJucyBNUEEtb25seSBzdHlsZXMgdGhhdCBleHBvc2UgZXZlcnkgYmxvY2sgYW5kIGhpZGUgaW5hY3RpdmUgY29udHJvbHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb2RlR3JvdXBGYWxsYmFja0hlYWQobXBhOiBib29sZWFuIHwgdW5kZWZpbmVkKTogSGVhZENvbmZpZ1tdIHtcbiAgcmV0dXJuIG1wYSA/IFtbJ3N0eWxlJywge30sIGBcbi52cC1jb2RlLWdyb3VwIC50YWJzLCAudnAtY29kZS1ncm91cCBidXR0b24uY29weSB7IGRpc3BsYXk6IG5vbmU7IH1cbi52cC1jb2RlLWdyb3VwIC5ibG9ja3MgPiBkaXYgeyBkaXNwbGF5OiBibG9jazsgfVxuYF1dIDogW11cbn1cblxuLyoqXG4gKiBHaXZlcyBlYWNoIG5hdGl2ZSB0YWIgc3RyaXAgaXRzIG93biBmb3JtIHNvIHNlYXJjaCBleGNlcnB0cyBjYW5ub3QgY2xlYXIgdGhlIHBhZ2UncyBzZWxlY3Rpb24uXG4gKlxuICogQHBhcmFtIG1kIC0gVml0ZVByZXNzIHJlbmRlcmVyIHdpdGggdGhlIG5hdGl2ZSBjb2RlLWdyb3VwIHJ1bGVzIGluc3RhbGxlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzb2xhdGVDb2RlR3JvdXBSYWRpb3MobWQ6IE1hcmtkb3duUmVuZGVyZXIpOiB2b2lkIHtcbiAgY29uc3QgcmVuZGVyID0gbWQucmVuZGVyZXIucnVsZXNbJ2NvbnRhaW5lcl9jb2RlLWdyb3VwX29wZW4nXVxuICBpZiAocmVuZGVyID09PSB1bmRlZmluZWQpIHRocm93IG5ldyBFcnJvcignVml0ZVByZXNzIE1hcmtkb3duIHJlbmRlcmVyIGlzIG1pc3NpbmcgdGhlIGNvZGUtZ3JvdXAgb3BlbmluZyBydWxlLicpXG4gIG1kLnJlbmRlcmVyLnJ1bGVzWydjb250YWluZXJfY29kZS1ncm91cF9vcGVuJ10gPSAoLi4uYXJncykgPT4ge1xuICAgIGNvbnN0IGh0bWwgPSByZW5kZXIoLi4uYXJncylcbiAgICBjb25zdCBvcGVuaW5nID0gJzxkaXYgY2xhc3M9XCJ0YWJzXCI+J1xuICAgIGNvbnN0IGNsb3NpbmcgPSAnPC9kaXY+PGRpdiBjbGFzcz1cImJsb2Nrc1wiPidcbiAgICBpZiAoIWh0bWwuaW5jbHVkZXMob3BlbmluZykgfHwgIWh0bWwuaW5jbHVkZXMoY2xvc2luZykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVml0ZVByZXNzIGNvZGUtZ3JvdXAgbWFya3VwIGRvZXMgbm90IGNvbnRhaW4gdGhlIGV4cGVjdGVkIHRhYiBzdHJpcC4nKVxuICAgIH1cbiAgICByZXR1cm4gaHRtbC5yZXBsYWNlKG9wZW5pbmcsICc8Zm9ybSBjbGFzcz1cInRhYnNcIiBAc3VibWl0LnByZXZlbnQ+JykucmVwbGFjZShjbG9zaW5nLCAnPC9mb3JtPjxkaXYgY2xhc3M9XCJibG9ja3NcIj4nKVxuICB9XG59XG4iLCAiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9ob21lL3R5bGVyL2RlZXBzZWVrLWhhcm5lc3Mvd2Vic2l0ZVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL2hvbWUvdHlsZXIvZGVlcHNlZWstaGFybmVzcy93ZWJzaXRlL2RvY3MudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL2hvbWUvdHlsZXIvZGVlcHNlZWstaGFybmVzcy93ZWJzaXRlL2RvY3MudHNcIjsvKipcbiAqIENhbm9uaWNhbCBwdWJsaWNhdGlvbiBtYW5pZmVzdCBmb3IgdGhlIGRvY3VtZW50YXRpb24gd2Vic2l0ZS5cbiAqXG4gKiBNYXJrZG93biBzdGF5cyBpbiBpdHMgb3duaW5nIHJlcG9zaXRvcnkgdGllci4gVGhpcyBtYW5pZmVzdCBtYXBzIGVhY2hcbiAqIGNhbm9uaWNhbCBzb3VyY2UgaW50byBtYXRjaGluZyByb3V0ZSB0cmVlcyBmb3IgYm90aCBzaXRlIGxvY2FsZXM7IHdoZW4gYVxuICogdHJhbnNsYXRpb24gaXMgYWJzZW50LCBib3RoIHJvdXRlcyBpbnRlbnRpb25hbGx5IHByb2plY3QgdGhlIGF2YWlsYWJsZVxuICogc291cmNlIGluc3RlYWQgb2YgY29weWluZyBNYXJrZG93bi5cbiAqL1xuXG4vKiogTG9jYWxlIGtleSB1c2VkIGJ5IHRoZSBWaXRlUHJlc3Mgc2l0ZS4gKi9cbmV4cG9ydCB0eXBlIERvY3NMb2NhbGUgPSAncm9vdCcgfCAnZW4nXG5cbi8qKiBTaWRlYmFyIGNvbGxlY3Rpb24gcmVuZGVyZWQgZm9yIG9uZSBsb2NhbGUgYW5kIHRvcC1sZXZlbCBtb2R1bGUuICovXG5leHBvcnQgdHlwZSBEb2NzU2lkZWJhciA9XG4gIHwgJ3poLWd1aWRlJ1xuICB8ICd6aC1kZXZlbG9wJ1xuICB8ICd6aC1yZWZlcmVuY2UnXG4gIHwgJ2VuLWd1aWRlJ1xuICB8ICdlbi1kZXZlbG9wJ1xuICB8ICdlbi1yZWZlcmVuY2UnXG5cbi8qKiBBIHBhZ2UgcHJvamVjdGVkIGludG8gdGhlIFZpdGVQcmVzcyBzb3VyY2UgdHJlZS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRG9jc1BhZ2Uge1xuICAvKiogVml0ZVByZXNzIGxvY2FsZSB3aG9zZSByb3V0ZSB0cmVlIG93bnMgdGhpcyBwcm9qZWN0aW9uLiAqL1xuICBsb2NhbGU6IERvY3NMb2NhbGVcbiAgLyoqIExhbmd1YWdlIG9mIHRoZSBjYW5vbmljYWwgc291cmNlIGN1cnJlbnRseSBwcm9qZWN0ZWQgYXQgdGhpcyByb3V0ZS4gKi9cbiAgY29udGVudExvY2FsZTogJ3poLUNOJyB8ICdlbi1VUydcbiAgLyoqIFJlcG9zaXRvcnktcmVsYXRpdmUgY2Fub25pY2FsIE1hcmtkb3duIHNvdXJjZS4gKi9cbiAgc291cmNlOiBzdHJpbmdcbiAgLyoqIFZpdGVQcmVzcyByb3V0ZSwgaW5jbHVkaW5nIHRoZSBgLm1kYCBzdWZmaXguICovXG4gIHJvdXRlOiBzdHJpbmdcbiAgLyoqIE5hdmlnYXRpb24gbGFiZWwgc2hvd24gaW4gdGhlIHNpZGViYXIuICovXG4gIGxhYmVsOiBzdHJpbmdcbiAgLyoqIFNpZGViYXIgY29sbGVjdGlvbiB0aGF0IG93bnMgdGhlIHBhZ2UsIG9yIG51bGwgZm9yIGEgbG9jYWxlIGhvbWUgcGFnZS4gKi9cbiAgc2lkZWJhcjogRG9jc1NpZGViYXIgfCBudWxsXG4gIC8qKiBTZWN0aW9uIGxhYmVsIHdpdGhpbiB0aGUgc2lkZWJhci4gKi9cbiAgc2VjdGlvbjogc3RyaW5nXG4gIC8qKiBTdGFibGUgb3JkZXIgd2l0aGluIHRoZSBzZWN0aW9uLiAqL1xuICBvcmRlcjogbnVtYmVyXG4gIC8qKiBIZWFkaW5nIGxldmVscyBpbmNsdWRlZCBpbiB0aGlzIHBhZ2UncyBWaXRlUHJlc3Mgb3V0bGluZS4gKi9cbiAgb3V0bGluZT86IG51bWJlciB8IHJlYWRvbmx5IFtudW1iZXIsIG51bWJlcl0gfCAnZGVlcCcgfCBmYWxzZVxuICAvKiogQWRkaXRpb25hbCByZXBvc2l0b3J5IHBhdGhzIHRoYXQgcmVzb2x2ZSB0byB0aGlzIHBhZ2UuICovXG4gIHNvdXJjZUFsaWFzZXM/OiBzdHJpbmdbXVxufVxuXG5pbnRlcmZhY2UgTWlycm9yZWRQYWdlIHtcbiAgc291cmNlOiBzdHJpbmcgfCBSZWNvcmQ8RG9jc0xvY2FsZSwgc3RyaW5nPlxuICByb3V0ZTogc3RyaW5nXG4gIGNvbnRlbnRMb2NhbGU6IERvY3NQYWdlWydjb250ZW50TG9jYWxlJ10gfCBSZWNvcmQ8RG9jc0xvY2FsZSwgRG9jc1BhZ2VbJ2NvbnRlbnRMb2NhbGUnXT5cbiAgbGFiZWw6IFJlY29yZDxEb2NzTG9jYWxlLCBzdHJpbmc+XG4gIHNpZGViYXI6IFJlY29yZDxEb2NzTG9jYWxlLCBEb2NzU2lkZWJhciB8IG51bGw+XG4gIHNlY3Rpb246IFJlY29yZDxEb2NzTG9jYWxlLCBzdHJpbmc+XG4gIG9yZGVyOiBudW1iZXJcbiAgb3V0bGluZT86IERvY3NQYWdlWydvdXRsaW5lJ11cbiAgc291cmNlQWxpYXNlcz86IHN0cmluZ1tdIHwgUGFydGlhbDxSZWNvcmQ8RG9jc0xvY2FsZSwgc3RyaW5nW10+PlxufVxuXG50eXBlIFBhaXJlZFBhZ2UgPSBPbWl0PE1pcnJvcmVkUGFnZSwgJ3NvdXJjZScgfCAnY29udGVudExvY2FsZScgfCAnc291cmNlQWxpYXNlcyc+ICYge1xuICAvKiogRW5nbGlzaCBzaWRlIG9mIGEgc2libGluZyBgZm9vLm1kYCAvIGBmb28uemgubWRgIHBhaXIuICovXG4gIHNvdXJjZTogc3RyaW5nXG4gIC8qKiBMYW5ndWFnZS1uZXV0cmFsIHJlcG9zaXRvcnkgYWxpYXNlcywgc3VjaCBhcyB0aGUgZGlyZWN0b3J5IG9mIGFuIGluZGV4IHBhZ2UuICovXG4gIHNvdXJjZUFsaWFzZXM/OiBzdHJpbmdbXVxufVxuXG5mdW5jdGlvbiBsb2NhbGl6ZWQ8VD4odmFsdWU6IFQgfCBSZWNvcmQ8RG9jc0xvY2FsZSwgVD4sIGxvY2FsZTogRG9jc0xvY2FsZSk6IFQge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheSh2YWx1ZSlcbiAgICA/ICh2YWx1ZSBhcyBSZWNvcmQ8RG9jc0xvY2FsZSwgVD4pW2xvY2FsZV1cbiAgICA6IHZhbHVlXG59XG5cbmZ1bmN0aW9uIG1pcnJvcmVkUGFnZXMocGFnZXM6IE1pcnJvcmVkUGFnZVtdKTogRG9jc1BhZ2VbXSB7XG4gIHJldHVybiBwYWdlcy5mbGF0TWFwKHBhZ2UgPT4gKFsncm9vdCcsICdlbiddIGFzIGNvbnN0KS5tYXAoKGxvY2FsZSkgPT4ge1xuICAgIGNvbnN0IGFsaWFzZXMgPSBwYWdlLnNvdXJjZUFsaWFzZXMgPT09IHVuZGVmaW5lZFxuICAgICAgPyB1bmRlZmluZWRcbiAgICAgIDogQXJyYXkuaXNBcnJheShwYWdlLnNvdXJjZUFsaWFzZXMpID8gcGFnZS5zb3VyY2VBbGlhc2VzIDogcGFnZS5zb3VyY2VBbGlhc2VzW2xvY2FsZV1cbiAgICByZXR1cm4ge1xuICAgICAgbG9jYWxlLFxuICAgICAgY29udGVudExvY2FsZTogbG9jYWxpemVkKHBhZ2UuY29udGVudExvY2FsZSwgbG9jYWxlKSxcbiAgICAgIHNvdXJjZTogbG9jYWxpemVkKHBhZ2Uuc291cmNlLCBsb2NhbGUpLFxuICAgICAgcm91dGU6IGxvY2FsZSA9PT0gJ3Jvb3QnID8gcGFnZS5yb3V0ZSA6IGBlbi8ke3BhZ2Uucm91dGV9YCxcbiAgICAgIGxhYmVsOiBwYWdlLmxhYmVsW2xvY2FsZV0sXG4gICAgICBzaWRlYmFyOiBwYWdlLnNpZGViYXJbbG9jYWxlXSxcbiAgICAgIHNlY3Rpb246IHBhZ2Uuc2VjdGlvbltsb2NhbGVdLFxuICAgICAgb3JkZXI6IHBhZ2Uub3JkZXIsXG4gICAgICAuLi4ocGFnZS5vdXRsaW5lID09PSB1bmRlZmluZWQgPyB7fSA6IHsgb3V0bGluZTogcGFnZS5vdXRsaW5lIH0pLFxuICAgICAgLi4uKGFsaWFzZXMgPT09IHVuZGVmaW5lZCA/IHt9IDogeyBzb3VyY2VBbGlhc2VzOiBhbGlhc2VzIH0pLFxuICAgIH1cbiAgfSkpXG59XG5cbmZ1bmN0aW9uIHBhaXJlZFBhZ2VzKHBhZ2VzOiBQYWlyZWRQYWdlW10pOiBEb2NzUGFnZVtdIHtcbiAgcmV0dXJuIG1pcnJvcmVkUGFnZXMocGFnZXMubWFwKChwYWdlKSA9PiB7XG4gICAgY29uc3QgY2hpbmVzZVNvdXJjZSA9IHBhZ2Uuc291cmNlLnJlcGxhY2UoL1xcLm1kJC8sICcuemgubWQnKVxuICAgIGNvbnN0IHNoYXJlZEFsaWFzZXMgPSBwYWdlLnNvdXJjZUFsaWFzZXMgPz8gW11cbiAgICByZXR1cm4ge1xuICAgICAgLi4ucGFnZSxcbiAgICAgIHNvdXJjZTogeyByb290OiBjaGluZXNlU291cmNlLCBlbjogcGFnZS5zb3VyY2UgfSxcbiAgICAgIGNvbnRlbnRMb2NhbGU6IHsgcm9vdDogJ3poLUNOJywgZW46ICdlbi1VUycgfSxcbiAgICAgIHNvdXJjZUFsaWFzZXM6IHtcbiAgICAgICAgcm9vdDogWy4uLnNoYXJlZEFsaWFzZXMsIHBhZ2Uuc291cmNlXSxcbiAgICAgICAgZW46IFsuLi5zaGFyZWRBbGlhc2VzLCBjaGluZXNlU291cmNlXSxcbiAgICAgIH0sXG4gICAgfVxuICB9KSlcbn1cblxuY29uc3QgaG9tZUFuZEd1aWRlID0gcGFpcmVkUGFnZXMoW1xuICB7XG4gICAgc291cmNlOiAnZG9jcy91c2VyL2luZGV4Lm1kJyxcbiAgICByb3V0ZTogJ2luZGV4Lm1kJyxcbiAgICBsYWJlbDogeyByb290OiAnRGVlcFNlZWsgSGFybmVzcycsIGVuOiAnRGVlcFNlZWsgSGFybmVzcycgfSxcbiAgICBzaWRlYmFyOiB7IHJvb3Q6IG51bGwsIGVuOiBudWxsIH0sXG4gICAgc2VjdGlvbjogeyByb290OiAnXHU5OTk2XHU5ODc1JywgZW46ICdIb21lJyB9LFxuICAgIG9yZGVyOiAwLFxuICB9LFxuICB7XG4gICAgc291cmNlOiAnZG9jcy91c2VyL2d1aWRlL2luZGV4Lm1kJyxcbiAgICByb3V0ZTogJ2d1aWRlL3F1aWNrc3RhcnQubWQnLFxuICAgIGxhYmVsOiB7IHJvb3Q6ICdcdTRGN0ZcdTc1MjggV2ViIFVJJywgZW46ICdVc2UgdGhlIFdlYiBVSScgfSxcbiAgICBzaWRlYmFyOiB7IHJvb3Q6ICd6aC1ndWlkZScsIGVuOiAnZW4tZ3VpZGUnIH0sXG4gICAgc2VjdGlvbjogeyByb290OiAnXHU1MTY1XHU5NUU4JywgZW46ICdHdWlkZScgfSxcbiAgICBvcmRlcjogMSxcbiAgICBzb3VyY2VBbGlhc2VzOiBbJ2RvY3MvdXNlci9ndWlkZSddLFxuICB9LFxuICB7XG4gICAgc291cmNlOiAnZG9jcy91c2VyL2d1aWRlL3Byb3ZpZGVycy5tZCcsXG4gICAgcm91dGU6ICdndWlkZS9wcm92aWRlcnMubWQnLFxuICAgIGxhYmVsOiB7IHJvb3Q6ICdcdTkxNERcdTdGNkVcdTZBMjFcdTU3OEInLCBlbjogJ0NvbmZpZ3VyZSBtb2RlbHMnIH0sXG4gICAgc2lkZWJhcjogeyByb290OiAnemgtZ3VpZGUnLCBlbjogJ2VuLWd1aWRlJyB9LFxuICAgIHNlY3Rpb246IHsgcm9vdDogJ1x1NTE2NVx1OTVFOCcsIGVuOiAnR3VpZGUnIH0sXG4gICAgb3JkZXI6IDIsXG4gIH0sXG4gIHtcbiAgICBzb3VyY2U6ICdkb2NzL3VzZXIvZ3VpZGUvbmV0d29yay1wcm94eS5tZCcsXG4gICAgcm91dGU6ICdndWlkZS9uZXR3b3JrLXByb3h5Lm1kJyxcbiAgICBsYWJlbDogeyByb290OiAnXHU3RjUxXHU3RURDXHU0RUUzXHU3NDA2JywgZW46ICdOZXR3b3JrIHByb3h5JyB9LFxuICAgIHNpZGViYXI6IHsgcm9vdDogJ3poLWd1aWRlJywgZW46ICdlbi1ndWlkZScgfSxcbiAgICBzZWN0aW9uOiB7IHJvb3Q6ICdcdTUxNjVcdTk1RTgnLCBlbjogJ0d1aWRlJyB9LFxuICAgIG9yZGVyOiAzLFxuICB9LFxuICB7XG4gICAgc291cmNlOiAnZG9jcy91c2VyL2d1aWRlL3B1YmxpYy1kZXBsb3ltZW50cy5tZCcsXG4gICAgcm91dGU6ICdndWlkZS9wdWJsaWMtZGVwbG95bWVudHMubWQnLFxuICAgIGxhYmVsOiB7IHJvb3Q6ICdcdTUxNkNcdTVGMDBcdTkwRThcdTdGNzInLCBlbjogJ1B1YmxpYyBkZXBsb3ltZW50cycgfSxcbiAgICBzaWRlYmFyOiB7IHJvb3Q6ICd6aC1ndWlkZScsIGVuOiAnZW4tZ3VpZGUnIH0sXG4gICAgc2VjdGlvbjogeyByb290OiAnXHU1MTY1XHU5NUU4JywgZW46ICdHdWlkZScgfSxcbiAgICBvcmRlcjogNCxcbiAgfSxcbiAge1xuICAgIHNvdXJjZTogJ2RvY3MvdXNlci9ndWlkZS9weXRob24tc2RrLm1kJyxcbiAgICByb3V0ZTogJ2d1aWRlL3B5dGhvbi1zZGsubWQnLFxuICAgIGxhYmVsOiB7IHJvb3Q6ICdQeXRob24nLCBlbjogJ1B5dGhvbicgfSxcbiAgICBzaWRlYmFyOiB7IHJvb3Q6ICd6aC1ndWlkZScsIGVuOiAnZW4tZ3VpZGUnIH0sXG4gICAgc2VjdGlvbjogeyByb290OiAnU0RLJywgZW46ICdTREsnIH0sXG4gICAgb3JkZXI6IDEsXG4gIH0sXG4gIHtcbiAgICBzb3VyY2U6ICdkb2NzL3VzZXIvZ3VpZGUvZ2l0aHViLXJldmlldy5tZCcsXG4gICAgcm91dGU6ICdndWlkZS9naXRodWItcmV2aWV3Lm1kJyxcbiAgICBsYWJlbDogeyByb290OiAnR2l0SHViIFx1OEJDNFx1NUJBMVx1NEYxQVx1OEJERCcsIGVuOiAnR2l0SHViIHJldmlldyBzZXNzaW9ucycgfSxcbiAgICBzaWRlYmFyOiB7IHJvb3Q6ICd6aC1ndWlkZScsIGVuOiAnZW4tZ3VpZGUnIH0sXG4gICAgc2VjdGlvbjogeyByb290OiAnXHU4MUVBXHU1MkE4XHU1MzE2JywgZW46ICdBdXRvbWF0aW9uJyB9LFxuICAgIG9yZGVyOiAxLFxuICB9LFxuICB7XG4gICAgc291cmNlOiAnZG9jcy91c2VyL2d1aWRlL3NjaGVkdWxlLm1kJyxcbiAgICByb3V0ZTogJ2d1aWRlL3NjaGVkdWxlLm1kJyxcbiAgICBsYWJlbDogeyByb290OiAnXHU0RjFBXHU4QkREXHU1MTg1XHU2M0QwXHU5MTkyJywgZW46ICdTZXNzaW9uIHJlbWluZGVycycgfSxcbiAgICBzaWRlYmFyOiB7IHJvb3Q6ICd6aC1ndWlkZScsIGVuOiAnZW4tZ3VpZGUnIH0sXG4gICAgc2VjdGlvbjogeyByb290OiAnXHU4MUVBXHU1MkE4XHU1MzE2JywgZW46ICdBdXRvbWF0aW9uJyB9LFxuICAgIG9yZGVyOiAyLFxuICB9LFxuICB7XG4gICAgc291cmNlOiAnZG9jcy91c2VyL2d1aWRlL3BsdWdpbi1tYXJrZXQubWQnLFxuICAgIHJvdXRlOiAnZ3VpZGUvcGx1Z2luLW1hcmtldC5tZCcsXG4gICAgbGFiZWw6IHsgcm9vdDogJ1x1NjNEMlx1NEVGNlx1NUUwMlx1NTczQScsIGVuOiAnUGx1Z2luIG1hcmtldHMnIH0sXG4gICAgc2lkZWJhcjogeyByb290OiAnemgtZ3VpZGUnLCBlbjogJ2VuLWd1aWRlJyB9LFxuICAgIHNlY3Rpb246IHsgcm9vdDogJ1x1OTZDNlx1NjIxMCcsIGVuOiAnSW50ZWdyYXRpb25zJyB9LFxuICAgIG9yZGVyOiAyLFxuICB9LFxuICB7XG4gICAgc291cmNlOiAnZG9jcy91c2VyL2d1aWRlL21jcC1tZW1vcnkubWQnLFxuICAgIHJvdXRlOiAnZ3VpZGUvbWNwLW1lbW9yeS5tZCcsXG4gICAgbGFiZWw6IHsgcm9vdDogJ1x1OEJCMFx1NUZDNiBNQ1AnLCBlbjogJ01lbW9yeSBNQ1AnIH0sXG4gICAgc2lkZWJhcjogeyByb290OiAnemgtZ3VpZGUnLCBlbjogJ2VuLWd1aWRlJyB9LFxuICAgIHNlY3Rpb246IHsgcm9vdDogJ1x1OTZDNlx1NjIxMCcsIGVuOiAnSW50ZWdyYXRpb25zJyB9LFxuICAgIG9yZGVyOiAxLFxuICB9LFxuXSlcblxuY29uc3QgZGV2ZWxvcCA9IHBhaXJlZFBhZ2VzKFtcbiAge1xuICAgIHNvdXJjZTogJ2RvY3MvdXNlci9kZXZlbG9wL2Jhc2ljL2luZGV4Lm1kJyxcbiAgICByb3V0ZTogJ2RldmVsb3AvYmFzaWMvaW5kZXgubWQnLFxuICAgIGxhYmVsOiB7IHJvb3Q6ICdcdTdCMkNcdTRFMDBcdTRFMkEgSGFybmVzcyBcdTYzRDJcdTRFRjYnLCBlbjogJ1lvdXIgZmlyc3QgSGFybmVzcyBwbHVnaW4nIH0sXG4gICAgc2lkZWJhcjogeyByb290OiAnemgtZGV2ZWxvcCcsIGVuOiAnZW4tZGV2ZWxvcCcgfSxcbiAgICBzZWN0aW9uOiB7IHJvb3Q6ICdcdTU3RkFcdTc4NDAnLCBlbjogJ0Jhc2ljcycgfSxcbiAgICBvcmRlcjogMSxcbiAgICBzb3VyY2VBbGlhc2VzOiBbJ2RvY3MvdXNlci9kZXZlbG9wL2Jhc2ljJ10sXG4gIH0sXG4gIHtcbiAgICBzb3VyY2U6ICdkb2NzL3VzZXIvZGV2ZWxvcC9iYXNpYy90b29sLm1kJyxcbiAgICByb3V0ZTogJ2RldmVsb3AvYmFzaWMvdG9vbC5tZCcsXG4gICAgbGFiZWw6IHsgcm9vdDogJ1x1NUYwMFx1NTNEMVx1NEUwMFx1NEUyQSBUb29sJywgZW46ICdCdWlsZCBhIHRvb2wnIH0sXG4gICAgc2lkZWJhcjogeyByb290OiAnemgtZGV2ZWxvcCcsIGVuOiAnZW4tZGV2ZWxvcCcgfSxcbiAgICBzZWN0aW9uOiB7IHJvb3Q6ICdcdTU3RkFcdTc4NDAnLCBlbjogJ0Jhc2ljcycgfSxcbiAgICBvcmRlcjogMixcbiAgfSxcbiAge1xuICAgIHNvdXJjZTogJ2RvY3MvdXNlci9kZXZlbG9wL2Jhc2ljL2NvbmZpZy5tZCcsXG4gICAgcm91dGU6ICdkZXZlbG9wL2Jhc2ljL2NvbmZpZy5tZCcsXG4gICAgbGFiZWw6IHsgcm9vdDogJ1x1NjNEMlx1NEVGNlx1OTE0RFx1N0Y2RScsIGVuOiAnUGx1Z2luIGNvbmZpZ3VyYXRpb24nIH0sXG4gICAgc2lkZWJhcjogeyByb290OiAnemgtZGV2ZWxvcCcsIGVuOiAnZW4tZGV2ZWxvcCcgfSxcbiAgICBzZWN0aW9uOiB7IHJvb3Q6ICdcdTU3RkFcdTc4NDAnLCBlbjogJ0Jhc2ljcycgfSxcbiAgICBvcmRlcjogMyxcbiAgfSxcbiAge1xuICAgIHNvdXJjZTogJ2RvY3MvdXNlci9kZXZlbG9wL2Jhc2ljL3B1Ymxpc2gubWQnLFxuICAgIHJvdXRlOiAnZGV2ZWxvcC9iYXNpYy9wdWJsaXNoLm1kJyxcbiAgICBsYWJlbDogeyByb290OiAnXHU2MjUzXHU1MzA1XHU0RTBFXHU1Qjg5XHU4OEM1XHU2M0QyXHU0RUY2JywgZW46ICdQYWNrYWdlIGFuZCBpbnN0YWxsJyB9LFxuICAgIHNpZGViYXI6IHsgcm9vdDogJ3poLWRldmVsb3AnLCBlbjogJ2VuLWRldmVsb3AnIH0sXG4gICAgc2VjdGlvbjogeyByb290OiAnXHU1N0ZBXHU3ODQwJywgZW46ICdCYXNpY3MnIH0sXG4gICAgb3JkZXI6IDQsXG4gIH0sXG4gIHtcbiAgICBzb3VyY2U6ICdkb2NzL3VzZXIvZGV2ZWxvcC9mcmFtZXdvcmsvaW5kZXgubWQnLFxuICAgIHJvdXRlOiAnZGV2ZWxvcC9mcmFtZXdvcmsvaW5kZXgubWQnLFxuICAgIGxhYmVsOiB7IHJvb3Q6ICdcdTYzRDJcdTRFRjZcdTRFMEVcdTc1MUZcdTU0N0RcdTU0NjhcdTY3MUYnLCBlbjogJ1BsdWdpbiBsaWZlY3ljbGUnIH0sXG4gICAgc2lkZWJhcjogeyByb290OiAnemgtZGV2ZWxvcCcsIGVuOiAnZW4tZGV2ZWxvcCcgfSxcbiAgICBzZWN0aW9uOiB7IHJvb3Q6ICdcdTY4NDZcdTY3QjZcdTgwRkRcdTUyOUInLCBlbjogJ0ZyYW1ld29yaycgfSxcbiAgICBvcmRlcjogMSxcbiAgICBzb3VyY2VBbGlhc2VzOiBbJ2RvY3MvdXNlci9kZXZlbG9wL2ZyYW1ld29yayddLFxuICB9LFxuICB7XG4gICAgc291cmNlOiAnZG9jcy91c2VyL2RldmVsb3AvZnJhbWV3b3JrL3NlcnZpY2UubWQnLFxuICAgIHJvdXRlOiAnZGV2ZWxvcC9mcmFtZXdvcmsvc2VydmljZS5tZCcsXG4gICAgbGFiZWw6IHsgcm9vdDogJ1x1NjcwRFx1NTJBMVx1NEUwRVx1NEY5RFx1OEQ1NicsIGVuOiAnU2VydmljZXMgYW5kIGRlcGVuZGVuY2llcycgfSxcbiAgICBzaWRlYmFyOiB7IHJvb3Q6ICd6aC1kZXZlbG9wJywgZW46ICdlbi1kZXZlbG9wJyB9LFxuICAgIHNlY3Rpb246IHsgcm9vdDogJ1x1Njg0Nlx1NjdCNlx1ODBGRFx1NTI5QicsIGVuOiAnRnJhbWV3b3JrJyB9LFxuICAgIG9yZGVyOiAyLFxuICB9LFxuICB7XG4gICAgc291cmNlOiAnZG9jcy91c2VyL2RldmVsb3AvZnJhbWV3b3JrL2V2ZW50cy5tZCcsXG4gICAgcm91dGU6ICdkZXZlbG9wL2ZyYW1ld29yay9ldmVudHMubWQnLFxuICAgIGxhYmVsOiB7IHJvb3Q6ICdcdTRFOEJcdTRFRjZcdTdDRkJcdTdFREYnLCBlbjogJ0V2ZW50IHN5c3RlbScgfSxcbiAgICBzaWRlYmFyOiB7IHJvb3Q6ICd6aC1kZXZlbG9wJywgZW46ICdlbi1kZXZlbG9wJyB9LFxuICAgIHNlY3Rpb246IHsgcm9vdDogJ1x1Njg0Nlx1NjdCNlx1ODBGRFx1NTI5QicsIGVuOiAnRnJhbWV3b3JrJyB9LFxuICAgIG9yZGVyOiAzLFxuICB9LFxuICB7XG4gICAgc291cmNlOiAnZG9jcy91c2VyL2RldmVsb3AvcHJhY3RpY2UvaW5kZXgubWQnLFxuICAgIHJvdXRlOiAnZGV2ZWxvcC9wcmFjdGljZS9pbmRleC5tZCcsXG4gICAgbGFiZWw6IHsgcm9vdDogJ1x1ODBGRFx1NTI5Qlx1NzY4NFx1NEUwOVx1NUM0Mlx1NjJDNlx1NTIwNicsIGVuOiAnQ2FwYWJpbGl0eSBsYXllcmluZycgfSxcbiAgICBzaWRlYmFyOiB7IHJvb3Q6ICd6aC1kZXZlbG9wJywgZW46ICdlbi1kZXZlbG9wJyB9LFxuICAgIHNlY3Rpb246IHsgcm9vdDogJ1x1NUI5RVx1NjIxOCcsIGVuOiAnUHJhY3RpY2UnIH0sXG4gICAgb3JkZXI6IDEsXG4gICAgc291cmNlQWxpYXNlczogWydkb2NzL3VzZXIvZGV2ZWxvcC9wcmFjdGljZSddLFxuICB9LFxuICB7XG4gICAgc291cmNlOiAnZG9jcy91c2VyL2RldmVsb3AvcHJhY3RpY2UvbGxtLWFkYXB0ZXIubWQnLFxuICAgIHJvdXRlOiAnZGV2ZWxvcC9wcmFjdGljZS9sbG0tYWRhcHRlci5tZCcsXG4gICAgbGFiZWw6IHsgcm9vdDogJ0xMTSBcdTkwMDJcdTkxNERcdTU2NjgnLCBlbjogJ0xMTSBhZGFwdGVyJyB9LFxuICAgIHNpZGViYXI6IHsgcm9vdDogJ3poLWRldmVsb3AnLCBlbjogJ2VuLWRldmVsb3AnIH0sXG4gICAgc2VjdGlvbjogeyByb290OiAnXHU1QjlFXHU2MjE4JywgZW46ICdQcmFjdGljZScgfSxcbiAgICBvcmRlcjogMixcbiAgfSxcbiAge1xuICAgIHNvdXJjZTogJ2RvY3MvdXNlci9kZXZlbG9wL3ByYWN0aWNlL2R5bmFtaWMtY29yZGlzLm1kJyxcbiAgICByb3V0ZTogJ2RldmVsb3AvcHJhY3RpY2UvZHluYW1pYy1jb3JkaXMubWQnLFxuICAgIGxhYmVsOiB7IHJvb3Q6ICdcdTYzMDFcdTRFNDVcdTUzMTYgSGFybmVzcyBcdTYzRDJcdTRFRjYnLCBlbjogJ1BlcnNpc3RlbnQgSGFybmVzcyBwbHVnaW5zJyB9LFxuICAgIHNpZGViYXI6IHsgcm9vdDogJ3poLWRldmVsb3AnLCBlbjogJ2VuLWRldmVsb3AnIH0sXG4gICAgc2VjdGlvbjogeyByb290OiAnXHU1QjlFXHU2MjE4JywgZW46ICdQcmFjdGljZScgfSxcbiAgICBvcmRlcjogMyxcbiAgfSxcbl0pXG5cbmNvbnN0IGNvcmRpc1R1dG9yaWFsID0gcGFpcmVkUGFnZXMoKFtcbiAgWydpbmRleC5tZCcsICdcdTYwM0JcdTg5QzgnLCAnT3ZlcnZpZXcnXSxcbiAgWycwMS1maXJzdC1wbHVnaW4ubWQnLCAnMS4gXHU3QjJDXHU0RTAwXHU0RTJBXHU2M0QyXHU0RUY2JywgJzEuIFlvdXIgZmlyc3QgcGx1Z2luJ10sXG4gIFsnMDItbGlmZWN5Y2xlLWFuZC1lZmZlY3RzLm1kJywgJzIuIFx1NzUxRlx1NTQ3RFx1NTQ2OFx1NjcxRlx1NEUwRVx1NTI2Rlx1NEY1Q1x1NzUyOCcsICcyLiBMaWZlY3ljbGUgYW5kIGVmZmVjdHMnXSxcbiAgWycwMy1zZXJ2aWNlcy5tZCcsICczLiBcdTY3MERcdTUyQTEnLCAnMy4gU2VydmljZXMnXSxcbiAgWycwNC1ldmVudHMubWQnLCAnNC4gXHU0RThCXHU0RUY2JywgJzQuIEV2ZW50cyddLFxuICBbJzA1LWNvbmZpZy5tZCcsICc1LiBcdTkxNERcdTdGNkUnLCAnNS4gQ29uZmlndXJhdGlvbiddLFxuICBbJzA2LWNvbXBvc2l0aW9uLWFuZC1obXIubWQnLCAnNi4gXHU3RUM0XHU1NDA4XHU0RTBFXHU3MEVEXHU5MUNEXHU4RjdEJywgJzYuIENvbXBvc2l0aW9uIGFuZCBITVInXSxcbiAgWycwNy1pbnRvLXRoZS1oYXJuZXNzLm1kJywgJzcuIFx1OEZEQlx1NTE2NSBIYXJuZXNzJywgJzcuIEludG8gdGhlIGhhcm5lc3MnXSxcbl0gYXMgY29uc3QpLm1hcCgoW2ZpbGUsIHJvb3RMYWJlbCwgZW5MYWJlbF0sIG9yZGVyKTogUGFpcmVkUGFnZSA9PiAoe1xuICBzb3VyY2U6IGBkb2NzL2NvcmRpcy10dXRvcmlhbC8ke2ZpbGV9YCxcbiAgcm91dGU6IGBkZXZlbG9wL2NvcmRpcy10dXRvcmlhbC8ke2ZpbGV9YCxcbiAgbGFiZWw6IHsgcm9vdDogcm9vdExhYmVsLCBlbjogZW5MYWJlbCB9LFxuICBzaWRlYmFyOiB7IHJvb3Q6ICd6aC1kZXZlbG9wJywgZW46ICdlbi1kZXZlbG9wJyB9LFxuICBzZWN0aW9uOiB7IHJvb3Q6ICdDb3JkaXMgXHU2ODQ2XHU2N0I2XHU2NTU5XHU3QTBCJywgZW46ICdDb3JkaXMgZnJhbWV3b3JrIHR1dG9yaWFsJyB9LFxuICBvcmRlcixcbiAgLi4uKGZpbGUgPT09ICdpbmRleC5tZCcgPyB7IHNvdXJjZUFsaWFzZXM6IFsnZG9jcy9jb3JkaXMtdHV0b3JpYWwnXSB9IDoge30pLFxufSkpKVxuXG5jb25zdCBjb3JkaXNQcmltZXJSZWZlcmVuY2UgPSBwYWlyZWRQYWdlcyhbXG4gIHtcbiAgICBzb3VyY2U6ICdkb2NzL2NvcmRpcy1wcmltZXIubWQnLFxuICAgIHJvdXRlOiAncmVmZXJlbmNlL2NvcmRpcy1wcmltZXIubWQnLFxuICAgIGxhYmVsOiB7IHJvb3Q6ICdDb3JkaXMgXHU1MTY1XHU5NUU4JywgZW46ICdDb3JkaXMgcHJpbWVyJyB9LFxuICAgIHNpZGViYXI6IHsgcm9vdDogJ3poLXJlZmVyZW5jZScsIGVuOiAnZW4tcmVmZXJlbmNlJyB9LFxuICAgIHNlY3Rpb246IHsgcm9vdDogJ1x1Njk4Mlx1NUZGNScsIGVuOiAnQ29uY2VwdHMnIH0sXG4gICAgb3JkZXI6IDEsXG4gIH0sXG5dKVxuXG4vKipcbiAqIFN1YnN5c3RlbSBwYWdlcyBncm91cGVkIGJ5IHRoZSBjb25jZXJuIHRoZXkgZG9jdW1lbnQsIGFzIGBbQ2hpbmVzZSBzZWN0aW9uLFxuICogRW5nbGlzaCBzZWN0aW9uLCBwYWdlc11gLiBPbmUgZmxhdCBsaXN0IG9mIGV2ZXJ5IHN1YnN5c3RlbSBwdXNoZWQgdGhlIHJlc3Qgb2ZcbiAqIHRoZSByZWZlcmVuY2Ugc2lkZWJhciBiZWxvdyB0aGUgZm9sZC5cbiAqL1xuY29uc3Qgc3Vic3lzdGVtR3JvdXBzID0gW1xuICBbJ1x1NjAzQlx1ODlDOCcsICdPdmVydmlldycsIFtcbiAgICBbJ1JFQURNRS5tZCcsICdcdTVCNTBcdTdDRkJcdTdFREYnLCAnU3Vic3lzdGVtcyddLFxuICBdXSxcbiAgWydcdTUxODVcdTY4MzhcdTRFMEVcdTRGNUNcdTc1MjhcdTU3REYnLCAnQ29yZSBhbmQgc2NvcGVzJywgW1xuICAgIFsnY29yZS5tZCcsICdcdTY4MzhcdTVGQzMnLCAnQ29yZSddLFxuICAgIFsnc2NvcGUubWQnLCAnXHU0RjVDXHU3NTI4XHU1N0RGJywgJ1Njb3BlcyddLFxuICBdXSxcbiAgWydcdTRGMUFcdThCRERcdTRFMEVcdTYzMDFcdTRFNDVcdTUzMTYnLCAnU2Vzc2lvbnMgYW5kIHBlcnNpc3RlbmNlJywgW1xuICAgIFsnc2Vzc2lvbi5tZCcsICdcdTRGMUFcdThCREQnLCAnU2Vzc2lvbnMnXSxcbiAgICBbJ3Nlc3Npb24tcXVlcnkubWQnLCAnXHU0RjFBXHU4QkREXHU2N0U1XHU4QkUyJywgJ1Nlc3Npb24gcXVlcnknXSxcbiAgICBbJ3Nlc3Npb24tcmVmZXJlbmNlLm1kJywgJ1x1NEYxQVx1OEJERFx1NUYxNVx1NzUyOCcsICdTZXNzaW9uIHJlZmVyZW5jZXMnXSxcbiAgICBbJ3Nlc3Npb24tdGl0bGUubWQnLCAnXHU0RjFBXHU4QkREXHU2ODA3XHU5ODk4JywgJ1Nlc3Npb24gdGl0bGVzJ10sXG4gICAgWydzZXNzaW9uLXByb2plY3Rpb24ubWQnLCAnXHU0RjFBXHU4QkREXHU2Mjk1XHU1RjcxJywgJ1Nlc3Npb24gcHJvamVjdGlvbnMnXSxcbiAgICBbJ3BlcnNpc3RlbmNlLm1kJywgJ1x1NEYxQVx1OEJERFx1NjMwMVx1NEU0NVx1NTMxNicsICdTZXNzaW9uIHBlcnNpc3RlbmNlJ10sXG4gICAgWydzcGlsbC5tZCcsICdTcGlsbCBcdTVCNThcdTUwQTgnLCAnU3BpbGwgc3RvcmFnZSddLFxuICAgIFsnc2Vzc2lvbi10ZWxlbWV0cnkubWQnLCAnXHU5MDY1XHU2RDRCJywgJ1Nlc3Npb25UZWxlbWV0cnlCYWNrZW5kJ10sXG4gIF1dLFxuICBbJ1x1NkEyMVx1NTc4Qlx1NEUwRVx1NEUwQVx1NEUwQlx1NjU4NycsICdNb2RlbCBhbmQgY29udGV4dCcsIFtcbiAgICBbJ2xsbS1zdHJlYW1pbmcubWQnLCAnTExNIFx1NkQ0MVx1NUYwRlx1NTRDRFx1NUU5NCcsICdMTE0gc3RyZWFtaW5nJ10sXG4gICAgWyd0b2tlbi1tZXRlci5tZCcsICdUb2tlbiBcdThCQTFcdTkxQ0YnLCAnVG9rZW4gbWV0ZXJpbmcnXSxcbiAgICBbJ3N5c3RlbS1wcm9tcHQubWQnLCAnXHU3Q0ZCXHU3RURGXHU2M0QwXHU3OTNBXHU4QkNEJywgJ1N5c3RlbSBwcm9tcHRzJ10sXG4gICAgWydjb21wYWN0aW9uLm1kJywgJ1x1NEUwQVx1NEUwQlx1NjU4N1x1NTM4Qlx1N0YyOScsICdDb21wYWN0aW9uJ10sXG4gIF1dLFxuICBbJ1x1NjI2N1x1ODg0Q1x1NEUwRVx1NURFNVx1NTE3NycsICdFeGVjdXRpb24gYW5kIHRvb2xzJywgW1xuICAgIFsndG9vbHMubWQnLCAnXHU1REU1XHU1MTc3JywgJ1Rvb2xzJ10sXG4gICAgWydzaGVsbC5tZCcsICdCYXNoIFx1NjI2N1x1ODg0QycsICdCYXNoIGV4ZWN1dGlvbiddLFxuICAgIFsnc3VicHJvY2Vzcy5tZCcsICdcdTVCNTBcdThGREJcdTdBMEInLCAnU3VicHJvY2Vzc2VzJ10sXG4gICAgWyd0ZXJtaW5hbC5tZCcsICdQVFkgXHU0RjFBXHU4QkREJywgJ1BUWSBzZXNzaW9ucyddLFxuICAgIFsnam9icy5tZCcsICdcdTU0MEVcdTUzRjBcdTRFRkJcdTUyQTEnLCAnQmFja2dyb3VuZCBqb2JzJ10sXG4gICAgWydmaWxlc3lzdGVtLm1kJywgJ1x1NjU4N1x1NEVGNlx1N0NGQlx1N0VERicsICdGaWxlc3lzdGVtJ10sXG4gICAgWydsc3AubWQnLCAnTFNQIFx1NUJGQ1x1ODIyQScsICdMU1AgbmF2aWdhdGlvbiddLFxuICAgIFsncHRjLXJ1bnRpbWUubWQnLCAnUFRDIFx1OEZEMFx1ODg0Q1x1NjVGNicsICdQVEMgcnVudGltZSddLFxuICAgIFsnd2ViLm1kJywgJ1dlYiBcdThCQkZcdTk1RUUnLCAnV2ViIGFjY2VzcyddLFxuICAgIFsnc2tpbGxzLm1kJywgJ1x1NjI4MFx1ODBGRCcsICdTa2lsbHMnXSxcbiAgICBbJ3dvcmtmbG93Lm1kJywgJ1x1NURFNVx1NEY1Q1x1NkQ0MScsICdXb3JrZmxvd3MnXSxcbiAgICBbJ3N1YmFnZW50Lm1kJywgJ1x1NUI1MFx1NjY3QVx1ODBGRFx1NEY1MycsICdTdWJhZ2VudHMnXSxcbiAgXV0sXG4gIFsnXHU3QjU2XHU3NTY1XHU0RTBFXHU0RUE0XHU0RTkyJywgJ1BvbGljeSBhbmQgaW50ZXJhY3Rpb24nLCBbXG4gICAgWydhcHByb3ZhbC5tZCcsICdcdTVCQTFcdTYyNzknLCAnQXBwcm92YWxzJ10sXG4gICAgWydwZXJtaXNzaW9uLXByZXNldHMubWQnLCAnXHU2NzQzXHU5NjUwXHU5ODg0XHU4QkJFJywgJ1Blcm1pc3Npb24gcHJlc2V0cyddLFxuICAgIFsnc2FuZGJveC5tZCcsICdcdTZDOTlcdTdCQjEnLCAnU2FuZGJveGluZyddLFxuICAgIFsncGxhbi5tZCcsICdcdThCQTFcdTUyMTJcdTZBMjFcdTVGMEYnLCAnUGxhbiBtb2RlJ10sXG4gICAgWyd1c2VyLXF1ZXN0aW9ucy5tZCcsICdcdTc1MjhcdTYyMzdcdTRFQTRcdTRFOTInLCAnVXNlciBpbnRlcmFjdGlvbiddLFxuICAgIFsnY29tbWFuZHMubWQnLCAnXHU1NDdEXHU0RUU0JywgJ0h1bWFuIGNvbW1hbmRzJ10sXG4gICAgWydnb2FsLm1kJywgJ1x1NzZFRVx1NjgwNycsICdHb2FscyddLFxuICAgIFsnc2NoZWR1bGUubWQnLCAnXHU1QjlBXHU2NUY2XHU2M0QwXHU5MTkyJywgJ1NjaGVkdWxlZCByZW1pbmRlcnMnXSxcbiAgXV0sXG4gIFsnXHU1RTczXHU1M0YwXHU0RTBFXHU2M0E1XHU1MTY1JywgJ1BsYXRmb3JtIGFuZCBhY2Nlc3MnLCBbXG4gICAgWyd3ZWItc2VydmVyLm1kJywgJ0hUVFAgXHU2NzBEXHU1MkExXHU1NjY4JywgJ0hUVFAgc2VydmVyJ10sXG4gICAgWyd3ZWItY2xpZW50Lm1kJywgJ1dlYiBDbGllbnQgXHU2N0I2XHU2Nzg0JywgJ1dlYiBDbGllbnQgYXJjaGl0ZWN0dXJlJ10sXG4gICAgWydjbGllbnQtbW9kdWxlcy5tZCcsICdcdTVCQTJcdTYyMzdcdTdBRUZcdTZBMjFcdTU3NTcnLCAnQ2xpZW50IG1vZHVsZXMnXSxcbiAgICBbJ3Nsb3RzLm1kJywgJ1x1NUJBMlx1NjIzN1x1N0FFRiBTbG90cycsICdDbGllbnQgc2xvdHMnXSxcbiAgICBbJ2NsaWVudC1yZXNvdXJjZXMubWQnLCAnXHU1QkEyXHU2MjM3XHU3QUVGXHU4RDQ0XHU2RTkwJywgJ0NsaWVudCByZXNvdXJjZXMnXSxcbiAgICBbJ3NpZGViYXItcmlnaHQubWQnLCAnXHU1M0YzXHU0RkE3IFNpZGViYXInLCAnUmlnaHQgU2lkZWJhciddLFxuICAgIFsnY29udmVyc2F0aW9uLm1kJywgJ0NvbnZlcnNhdGlvbiBcdTdFQzRcdTg4QzUnLCAnQ29udmVyc2F0aW9uIGFzc2VtYmx5J10sXG4gICAgWyd0eXBlcnQubWQnLCAnVHlwZXJ0JywgJ1R5cGVydCddLFxuICAgIFsnc3RvcmFnZS5tZCcsICdcdTVCNThcdTUwQTgnLCAnU3RvcmFnZSddLFxuICAgIFsnd29ya3NwYWNlLm1kJywgJ1x1NURFNVx1NEY1Q1x1NTMzQScsICdXb3Jrc3BhY2VzJ10sXG4gICAgWydzZXR0aW5ncy5tZCcsICdcdTc1MjhcdTYyMzdcdThCQkVcdTdGNkUnLCAnVXNlciBzZXR0aW5ncyddLFxuICAgIFsnY3JlZGVudGlhbHMubWQnLCAnXHU3NTI4XHU2MjM3XHU1MUVEXHU2MzZFJywgJ1VzZXIgY3JlZGVudGlhbHMnXSxcbiAgXV0sXG5dIGFzIGNvbnN0XG5cbmNvbnN0IHN1YnN5c3RlbXNSZWZlcmVuY2UgPSBzdWJzeXN0ZW1Hcm91cHMuZmxhdE1hcCgoW3Jvb3RTZWN0aW9uLCBlblNlY3Rpb24sIGZpbGVzXSkgPT4gcGFpcmVkUGFnZXMoXG4gIGZpbGVzLm1hcCgoW2ZpbGUsIHJvb3RMYWJlbCwgZW5MYWJlbF0sIG9yZGVyKTogUGFpcmVkUGFnZSA9PiAoe1xuICAgIHNvdXJjZTogYGRvY3Mvc3Vic3lzdGVtcy8ke2ZpbGV9YCxcbiAgICByb3V0ZTogZmlsZSA9PT0gJ1JFQURNRS5tZCcgPyAncmVmZXJlbmNlL3N1YnN5c3RlbXMvaW5kZXgubWQnIDogYHJlZmVyZW5jZS9zdWJzeXN0ZW1zLyR7ZmlsZX1gLFxuICAgIGxhYmVsOiB7IHJvb3Q6IHJvb3RMYWJlbCwgZW46IGVuTGFiZWwgfSxcbiAgICBzaWRlYmFyOiB7IHJvb3Q6ICd6aC1yZWZlcmVuY2UnLCBlbjogJ2VuLXJlZmVyZW5jZScgfSxcbiAgICBzZWN0aW9uOiB7IHJvb3Q6IHJvb3RTZWN0aW9uLCBlbjogZW5TZWN0aW9uIH0sXG4gICAgb3JkZXIsXG4gICAgLy8gU3Vic3lzdGVtIHBhZ2VzIGNhcnJ5IGxvbmcgdGhpcmQtbGV2ZWwgc2VjdGlvbnMgYSB0d28tbGV2ZWwgb3V0bGluZSByZWFjaGVzLlxuICAgIG91dGxpbmU6IFsyLCAzXSxcbiAgICAuLi4oZmlsZSA9PT0gJ1JFQURNRS5tZCcgPyB7IHNvdXJjZUFsaWFzZXM6IFsnZG9jcy9zdWJzeXN0ZW1zJ10gfSA6IHt9KSxcbiAgfSkpLFxuKSlcblxuY29uc3QgcmVmZXJlbmNlID0gW1xuICAvLyBgZG9jcy9kZWVwc2Vlay1sbG0tYXBpLXdpcmUtZXh0ZW5zaW9ucy5tZGAgaXMgYSByZXBvc2l0b3J5LW9ubHkgcHJvdmlkZXIgcHJvdG9jb2wgcmVmZXJlbmNlLlxuICAvLyBQcm9qZWN0ZWQgbGlua3MgaW50ZW50aW9uYWxseSByZXNvbHZlIHRvIGl0cyBHaXRIdWIgc291cmNlIGluc3RlYWQgb2YgYSBwdWJsaWMgc2l0ZSByb3V0ZS5cbiAgLi4ucGFpcmVkUGFnZXMoKFtcbiAgICBbJ2RvY3MvYXJjaGl0ZWN0dXJlLm1kJywgJ3JlZmVyZW5jZS9pbmRleC5tZCcsICdcdTY3QjZcdTY3ODQnLCAnQXJjaGl0ZWN0dXJlJywgMF0sXG4gIF0gYXMgY29uc3QpLm1hcCgoW3NvdXJjZSwgcm91dGUsIHJvb3RMYWJlbCwgZW5MYWJlbCwgb3JkZXJdKTogUGFpcmVkUGFnZSA9PiAoe1xuICAgIHNvdXJjZSxcbiAgICByb3V0ZSxcbiAgICBsYWJlbDogeyByb290OiByb290TGFiZWwsIGVuOiBlbkxhYmVsIH0sXG4gICAgc2lkZWJhcjogeyByb290OiAnemgtcmVmZXJlbmNlJywgZW46ICdlbi1yZWZlcmVuY2UnIH0sXG4gICAgc2VjdGlvbjogeyByb290OiAnXHU2OTgyXHU1RkY1JywgZW46ICdDb25jZXB0cycgfSxcbiAgICBvcmRlcixcbiAgfSkpKSxcbiAgLi4ucGFpcmVkUGFnZXMoKFtcbiAgICBbJ2RvY3MvY2FwYWJpbGl0eS1zZWFtcy5tZCcsICdyZWZlcmVuY2UvY2FwYWJpbGl0eS1zZWFtcy5tZCcsICdcdTgwRkRcdTUyOUJcdTY3MERcdTUyQTEnLCAnQ2FwYWJpbGl0eSBzZXJ2aWNlcycsIDJdLFxuICAgIFsnZG9jcy9hZ2VudC1saWZlY3ljbGUubWQnLCAncmVmZXJlbmNlL2FnZW50LWxpZmVjeWNsZS5tZCcsICdBZ2VudCBcdTc1MUZcdTU0N0RcdTU0NjhcdTY3MUYnLCAnQWdlbnQgbGlmZWN5Y2xlJywgM10sXG4gICAgWydkb2NzL3Rvb2wtZXhlY3V0aW9uLXBpcGVsaW5lLm1kJywgJ3JlZmVyZW5jZS90b29sLWV4ZWN1dGlvbi1waXBlbGluZS5tZCcsICdUb29sIFx1NjI2N1x1ODg0QycsICdUb29sIGV4ZWN1dGlvbicsIDRdLFxuICAgIFsnZG9jcy9hcGktZ2F0ZXdheS5tZCcsICdyZWZlcmVuY2UvYXBpLWdhdGV3YXkubWQnLCAnQVBJIEdhdGV3YXknLCAnQVBJIEdhdGV3YXknLCA1XSxcbiAgXSBhcyBjb25zdCkubWFwKChbc291cmNlLCByb3V0ZSwgcm9vdExhYmVsLCBlbkxhYmVsLCBvcmRlcl0pOiBQYWlyZWRQYWdlID0+ICh7XG4gICAgc291cmNlLFxuICAgIHJvdXRlLFxuICAgIGxhYmVsOiB7IHJvb3Q6IHJvb3RMYWJlbCwgZW46IGVuTGFiZWwgfSxcbiAgICBzaWRlYmFyOiB7IHJvb3Q6ICd6aC1yZWZlcmVuY2UnLCBlbjogJ2VuLXJlZmVyZW5jZScgfSxcbiAgICBzZWN0aW9uOiB7IHJvb3Q6ICdcdTY5ODJcdTVGRjUnLCBlbjogJ0NvbmNlcHRzJyB9LFxuICAgIG9yZGVyLFxuICB9KSkpLFxuICAuLi5wYWlyZWRQYWdlcygoW1xuICAgIFsnZG9jcy9jb25maWctY2F0YWxvZy5tZCcsICdyZWZlcmVuY2UvY29uZmlnLWNhdGFsb2cubWQnLCAnXHU2M0QyXHU0RUY2XHU5MTREXHU3RjZFJywgJ1BsdWdpbiBjb25maWd1cmF0aW9uJ10sXG4gICAgWydkb2NzL3Rvb2wtY2F0YWxvZy5tZCcsICdyZWZlcmVuY2UvdG9vbC1jYXRhbG9nLm1kJywgJ1Rvb2wgU2NoZW1hJywgJ1Rvb2wgc2NoZW1hcyddLFxuICAgIFsnZG9jcy9wZXJzaXN0ZW5jZS1jYXRhbG9nLm1kJywgJ3JlZmVyZW5jZS9wZXJzaXN0ZW5jZS1jYXRhbG9nLm1kJywgJ1x1NjMwMVx1NEU0NVx1NTMxNlx1NEU4Qlx1NEVGNicsICdQZXJzaXN0ZW5jZSBldmVudHMnLCAnZGVlcCddLFxuICAgIFsnZG9jcy9leHBlcmltZW50YWwtcGVyc2lzdGVuY2UtY2F0YWxvZy5tZCcsICdyZWZlcmVuY2UvZXhwZXJpbWVudGFsLXBlcnNpc3RlbmNlLWNhdGFsb2cubWQnLCAnXHU1QjlFXHU5QThDXHU2MDI3XHU2MzAxXHU0RTQ1XHU1MzE2XHU4QkIwXHU1RjU1JywgJ0V4cGVyaW1lbnRhbCBwZXJzaXN0ZW5jZSddLFxuICBdIGFzIGNvbnN0KS5tYXAoKFtzb3VyY2UsIHJvdXRlLCByb290TGFiZWwsIGVuTGFiZWwsIG91dGxpbmVdLCBvcmRlcik6IFBhaXJlZFBhZ2UgPT4gKHtcbiAgICBzb3VyY2UsXG4gICAgcm91dGUsXG4gICAgbGFiZWw6IHsgcm9vdDogcm9vdExhYmVsLCBlbjogZW5MYWJlbCB9LFxuICAgIHNpZGViYXI6IHsgcm9vdDogJ3poLXJlZmVyZW5jZScsIGVuOiAnZW4tcmVmZXJlbmNlJyB9LFxuICAgIHNlY3Rpb246IHsgcm9vdDogJ1x1NzUxRlx1NjIxMFx1NTNDMlx1ODAwMycsIGVuOiAnR2VuZXJhdGVkIHJlZmVyZW5jZScgfSxcbiAgICBvcmRlcixcbiAgICAuLi4ob3V0bGluZSA9PT0gdW5kZWZpbmVkID8ge30gOiB7IG91dGxpbmUgfSksXG4gIH0pKSksXG4gIC4uLnBhaXJlZFBhZ2VzKChbXG4gICAgWydjb250ZXh0Lm1kJywgJ0NvbnRleHQnLCAnQ29udGV4dCddLFxuICAgIFsnZXZlbnRzLm1kJywgJ0V2ZW50cycsICdFdmVudHMnXSxcbiAgICBbJ2ZpYmVyLm1kJywgJ0ZpYmVyJywgJ0ZpYmVyJ10sXG4gICAgWydyZWdpc3RyeS5tZCcsICdQbHVnaW4gUmVnaXN0cnknLCAnUGx1Z2luIFJlZ2lzdHJ5J10sXG4gICAgWydzZXJ2aWNlLm1kJywgJ1NlcnZpY2UnLCAnU2VydmljZSddLFxuICBdIGFzIGNvbnN0KS5tYXAoKFtmaWxlLCByb290TGFiZWwsIGVuTGFiZWxdLCBvcmRlcik6IFBhaXJlZFBhZ2UgPT4gKHtcbiAgICBzb3VyY2U6IGBkb2NzL2NvcmRpcy1hcGkvJHtmaWxlfWAsXG4gICAgcm91dGU6IGByZWZlcmVuY2UvY29yZGlzLWFwaS8ke2ZpbGV9YCxcbiAgICBsYWJlbDogeyByb290OiByb290TGFiZWwsIGVuOiBlbkxhYmVsIH0sXG4gICAgc2lkZWJhcjogeyByb290OiAnemgtcmVmZXJlbmNlJywgZW46ICdlbi1yZWZlcmVuY2UnIH0sXG4gICAgc2VjdGlvbjogeyByb290OiAnQ29yZGlzIEFQSScsIGVuOiAnQ29yZGlzIENvcmUgQVBJJyB9LFxuICAgIG9yZGVyLFxuICB9KSkpLFxuICAuLi5taXJyb3JlZFBhZ2VzKChbXG4gICAgWydpbmhlcml0ZWQubWQnLCAnXHU3RUU3XHU2MjdGXHU2M0E1XHU1M0UzXHU5NzYyJywgJ0luaGVyaXRlZCBzdXJmYWNlJ10sXG4gIF0gYXMgY29uc3QpLm1hcCgoW2ZpbGUsIHJvb3RMYWJlbCwgZW5MYWJlbF0sIG9yZGVyKTogTWlycm9yZWRQYWdlID0+ICh7XG4gICAgc291cmNlOiBgZG9jcy9jb3JkaXMtYXBpLyR7ZmlsZX1gLFxuICAgIHJvdXRlOiBgcmVmZXJlbmNlL2NvcmRpcy1hcGkvJHtmaWxlfWAsXG4gICAgY29udGVudExvY2FsZTogJ2VuLVVTJyxcbiAgICBsYWJlbDogeyByb290OiByb290TGFiZWwsIGVuOiBlbkxhYmVsIH0sXG4gICAgc2lkZWJhcjogeyByb290OiAnemgtcmVmZXJlbmNlJywgZW46ICdlbi1yZWZlcmVuY2UnIH0sXG4gICAgc2VjdGlvbjogeyByb290OiAnQ29yZGlzIEFQSScsIGVuOiAnQ29yZGlzIENvcmUgQVBJJyB9LFxuICAgIG9yZGVyOiBvcmRlciArIDUsXG4gIH0pKSksXG4gIC4uLnBhaXJlZFBhZ2VzKChbXG4gICAgWydhZGRpbmctYS1wYWNrYWdlLm1kJywgJ1x1NjVCMFx1NTg5RSBQYWNrYWdlJywgJ0FkZGluZyBhIHBhY2thZ2UnXSxcbiAgICBbJ2FkZGluZy1hLXRvb2wubWQnLCAnXHU2NUIwXHU1ODlFIFRvb2wnLCAnQWRkaW5nIGEgdG9vbCddLFxuICAgIFsnYWRkaW5nLWFuLWxsbS1hZGFwdGVyLm1kJywgJ1x1NjVCMFx1NTg5RSBMTE0gQWRhcHRlcicsICdBZGRpbmcgYW4gTExNIGFkYXB0ZXInXSxcbiAgICBbJ2FkZGluZy1hLXNldHRpbmdzLWNhcmQubWQnLCAnXHU2NUIwXHU1ODlFXHU4QkJFXHU3RjZFXHU5ODc1JywgJ0FkZGluZyBhIHNldHRpbmdzIHBhZ2UnXSxcbiAgICBbJ2V4dGVuc2lvbi1jb29rYm9vay5tZCcsICdcdTYyNjlcdTVDNTVcdTZBMjFcdTVGMEYnLCAnRXh0ZW5zaW9uIHBhdHRlcm5zJ10sXG4gIF0gYXMgY29uc3QpLm1hcCgoW2ZpbGUsIHJvb3RMYWJlbCwgZW5MYWJlbF0sIG9yZGVyKTogUGFpcmVkUGFnZSA9PiAoe1xuICAgIHNvdXJjZTogYGRvY3MvY29va2Jvb2svJHtmaWxlfWAsXG4gICAgcm91dGU6IGByZWZlcmVuY2UvY29va2Jvb2svJHtmaWxlfWAsXG4gICAgbGFiZWw6IHsgcm9vdDogcm9vdExhYmVsLCBlbjogZW5MYWJlbCB9LFxuICAgIHNpZGViYXI6IHsgcm9vdDogJ3poLXJlZmVyZW5jZScsIGVuOiAnZW4tcmVmZXJlbmNlJyB9LFxuICAgIHNlY3Rpb246IHsgcm9vdDogJ1x1NUYwMFx1NTNEMVx1NjI0Qlx1NTE4QycsIGVuOiAnQ29va2Jvb2snIH0sXG4gICAgb3JkZXIsXG4gIH0pKSksXG5dXG5cbi8qKlxuICogU2lkZWJhciBjb2xsZWN0aW9ucyBvZiBlYWNoIGxvY2FsZSwgaW4gdGhlIG9yZGVyIHRoZSBzaXRlJ3MgbmF2aWdhdGlvblxuICogcHJlc2VudHMgdGhlbS4gVGhlIG5hdmlnYXRpb24gYmFyIGFuZCB0aGUgbGxtcy50eHQgaW5kZXggYm90aCByZWFkIHRoaXNcbiAqIHNlcXVlbmNlLCBzbyBhIG5ldyBjb2xsZWN0aW9uIGxhbmRzIGluIGJvdGggc3VyZmFjZXMgdG9nZXRoZXIuXG4gKi9cbmV4cG9ydCBjb25zdCBsb2NhbGVDb2xsZWN0aW9ucyA9IHtcbiAgcm9vdDogWyd6aC1ndWlkZScsICd6aC1kZXZlbG9wJywgJ3poLXJlZmVyZW5jZSddLFxuICBlbjogWydlbi1ndWlkZScsICdlbi1kZXZlbG9wJywgJ2VuLXJlZmVyZW5jZSddLFxufSBhcyBjb25zdCBzYXRpc2ZpZXMgUmVjb3JkPERvY3NMb2NhbGUsIHJlYWRvbmx5IERvY3NTaWRlYmFyW10+XG5cbi8qKiBBIHNpZGViYXIgZ3JvdXAsIG1hdGNoZWQgdG8gcGFnZXMgYnkgYGxhYmVsYC4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRG9jc1NlY3Rpb24ge1xuICAvKiogR3JvdXAgaGVhZGluZywgZXF1YWwgdG8gdGhlIGBzZWN0aW9uYCBmaWVsZCBvZiBldmVyeSBwYWdlIGl0IGhvbGRzLiAqL1xuICBsYWJlbDogc3RyaW5nXG4gIC8qKiBSZW5kZXIgdGhlIGdyb3VwIGNvbGxhcHNlZCB1bnRpbCBpdCBob2xkcyB0aGUgcGFnZSBiZWluZyByZWFkLiAqL1xuICBjb2xsYXBzZWQ/OiBib29sZWFuXG59XG5cbi8qKlxuICogRXZlcnkgc2lkZWJhciBncm91cCwgaW4gdGhlIG9yZGVyIGl0cyBsb2NhbGUgcmVuZGVycyBpdC5cbiAqXG4gKiBUaGUgc3Vic3lzdGVtIGdyb3VwcyBjb2xsYXBzZSBiZWNhdXNlIHRvZ2V0aGVyIHRoZXkgb3V0bnVtYmVyIHRoZSByZXN0IG9mIHRoZVxuICogcmVmZXJlbmNlIHNpZGViYXI7IGV4cGFuZGVkLCB0aGV5IHB1c2ggZXZlcnkgb3RoZXIgZ3JvdXAgYmVsb3cgdGhlIGZvbGQuXG4gKi9cbmNvbnN0IHNlY3Rpb25zOiBSZWNvcmQ8RG9jc0xvY2FsZSwgcmVhZG9ubHkgRG9jc1NlY3Rpb25bXT4gPSB7XG4gIHJvb3Q6IFtcbiAgICB7IGxhYmVsOiAnXHU1MTY1XHU5NUU4JyB9LCB7IGxhYmVsOiAnU0RLJyB9LCB7IGxhYmVsOiAnXHU4MUVBXHU1MkE4XHU1MzE2JyB9LCB7IGxhYmVsOiAnXHU5NkM2XHU2MjEwJyB9LFxuICAgIHsgbGFiZWw6ICdcdTU3RkFcdTc4NDAnIH0sIHsgbGFiZWw6ICdcdTY4NDZcdTY3QjZcdTgwRkRcdTUyOUInIH0sIHsgbGFiZWw6ICdcdTVCOUVcdTYyMTgnIH0sIHsgbGFiZWw6ICdDb3JkaXMgXHU2ODQ2XHU2N0I2XHU2NTU5XHU3QTBCJyB9LFxuICAgIHsgbGFiZWw6ICdcdTY5ODJcdTVGRjUnIH0sIHsgbGFiZWw6ICdcdTc1MUZcdTYyMTBcdTUzQzJcdTgwMDMnIH0sIHsgbGFiZWw6ICdDb3JkaXMgQVBJJyB9LCB7IGxhYmVsOiAnXHU1RjAwXHU1M0QxXHU2MjRCXHU1MThDJyB9LFxuICAgIHsgbGFiZWw6ICdcdTYwM0JcdTg5QzgnIH0sXG4gICAgeyBsYWJlbDogJ1x1NTE4NVx1NjgzOFx1NEUwRVx1NEY1Q1x1NzUyOFx1NTdERicsIGNvbGxhcHNlZDogdHJ1ZSB9LFxuICAgIHsgbGFiZWw6ICdcdTRGMUFcdThCRERcdTRFMEVcdTYzMDFcdTRFNDVcdTUzMTYnLCBjb2xsYXBzZWQ6IHRydWUgfSxcbiAgICB7IGxhYmVsOiAnXHU2QTIxXHU1NzhCXHU0RTBFXHU0RTBBXHU0RTBCXHU2NTg3JywgY29sbGFwc2VkOiB0cnVlIH0sXG4gICAgeyBsYWJlbDogJ1x1NjI2N1x1ODg0Q1x1NEUwRVx1NURFNVx1NTE3NycsIGNvbGxhcHNlZDogdHJ1ZSB9LFxuICAgIHsgbGFiZWw6ICdcdTdCNTZcdTc1NjVcdTRFMEVcdTRFQTRcdTRFOTInLCBjb2xsYXBzZWQ6IHRydWUgfSxcbiAgICB7IGxhYmVsOiAnXHU1RTczXHU1M0YwXHU0RTBFXHU2M0E1XHU1MTY1JywgY29sbGFwc2VkOiB0cnVlIH0sXG4gIF0sXG4gIGVuOiBbXG4gICAgeyBsYWJlbDogJ0d1aWRlJyB9LCB7IGxhYmVsOiAnU0RLJyB9LCB7IGxhYmVsOiAnQXV0b21hdGlvbicgfSwgeyBsYWJlbDogJ0ludGVncmF0aW9ucycgfSxcbiAgICB7IGxhYmVsOiAnQmFzaWNzJyB9LCB7IGxhYmVsOiAnRnJhbWV3b3JrJyB9LCB7IGxhYmVsOiAnUHJhY3RpY2UnIH0sIHsgbGFiZWw6ICdDb3JkaXMgZnJhbWV3b3JrIHR1dG9yaWFsJyB9LFxuICAgIHsgbGFiZWw6ICdDb25jZXB0cycgfSwgeyBsYWJlbDogJ0dlbmVyYXRlZCByZWZlcmVuY2UnIH0sIHsgbGFiZWw6ICdDb3JkaXMgQ29yZSBBUEknIH0sIHsgbGFiZWw6ICdDb29rYm9vaycgfSxcbiAgICB7IGxhYmVsOiAnT3ZlcnZpZXcnIH0sXG4gICAgeyBsYWJlbDogJ0NvcmUgYW5kIHNjb3BlcycsIGNvbGxhcHNlZDogdHJ1ZSB9LFxuICAgIHsgbGFiZWw6ICdTZXNzaW9ucyBhbmQgcGVyc2lzdGVuY2UnLCBjb2xsYXBzZWQ6IHRydWUgfSxcbiAgICB7IGxhYmVsOiAnTW9kZWwgYW5kIGNvbnRleHQnLCBjb2xsYXBzZWQ6IHRydWUgfSxcbiAgICB7IGxhYmVsOiAnRXhlY3V0aW9uIGFuZCB0b29scycsIGNvbGxhcHNlZDogdHJ1ZSB9LFxuICAgIHsgbGFiZWw6ICdQb2xpY3kgYW5kIGludGVyYWN0aW9uJywgY29sbGFwc2VkOiB0cnVlIH0sXG4gICAgeyBsYWJlbDogJ1BsYXRmb3JtIGFuZCBhY2Nlc3MnLCBjb2xsYXBzZWQ6IHRydWUgfSxcbiAgXSxcbn1cblxuLyoqXG4gKiBQbGFjZW1lbnQgYW5kIGNvbGxhcHNlIGJlaGF2aW9yIG9mIG9uZSBzaWRlYmFyIGdyb3VwLlxuICpcbiAqIEBwYXJhbSBsb2NhbGUgLSBSb3V0ZSB0cmVlIHdob3NlIHNpZGViYXIgaXMgYmVpbmcgYnVpbHQuXG4gKiBAcGFyYW0gbGFiZWwgLSBTZWN0aW9uIGxhYmVsIGNhcnJpZWQgYnkgdGhlIHBhZ2VzIGluIHRoZSBncm91cC5cbiAqIEByZXR1cm5zIFRoZSBkZWNsYXJlZCBncm91cCwgcGx1cyBpdHMgemVyby1iYXNlZCBwb3NpdGlvbiBpbiB0aGUgbG9jYWxlLlxuICogQHRocm93cyBXaGVuIHRoZSBsb2NhbGUgZGVjbGFyZXMgbm8gcGxhY2VtZW50IGZvciB0aGUgbGFiZWwuIFJhbmtpbmcgYnkgbGlzdFxuICogICBtZW1iZXJzaGlwIGFsb25lIHdvdWxkIHNvcnQgYW4gdW5kZWNsYXJlZCBncm91cCBzaWxlbnRseSBhaGVhZCBvZiBldmVyeVxuICogICBkZWNsYXJlZCBvbmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZWN0aW9uU3BlYyhsb2NhbGU6IERvY3NMb2NhbGUsIGxhYmVsOiBzdHJpbmcpOiBEb2NzU2VjdGlvbiAmIHsgaW5kZXg6IG51bWJlciB9IHtcbiAgY29uc3QgZGVjbGFyZWQgPSBzZWN0aW9uc1tsb2NhbGVdXG4gIGNvbnN0IHNlY3Rpb24gPSBkZWNsYXJlZC5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUubGFiZWwgPT09IGxhYmVsKVxuICBpZiAoc2VjdGlvbiA9PT0gdW5kZWZpbmVkKSB0aHJvdyBuZXcgRXJyb3IoYFNpZGViYXIgc2VjdGlvbiBcIiR7bGFiZWx9XCIgaGFzIG5vIHBsYWNlbWVudCBpbiB0aGUgJHtsb2NhbGV9IGxvY2FsZS5gKVxuICByZXR1cm4geyAuLi5zZWN0aW9uLCBpbmRleDogZGVjbGFyZWQuaW5kZXhPZihzZWN0aW9uKSB9XG59XG5cbi8qKiBFdmVyeSBjYW5vbmljYWwgcGFnZSBwdWJsaXNoZWQgYnkgdGhlIGRvY3VtZW50YXRpb24gd2Vic2l0ZS4gKi9cbmV4cG9ydCBjb25zdCBkb2NzUGFnZXM6IERvY3NQYWdlW10gPSBbXG4gIC4uLmhvbWVBbmRHdWlkZSxcbiAgLi4uZGV2ZWxvcCxcbiAgLi4uY29yZGlzVHV0b3JpYWwsXG4gIC4uLmNvcmRpc1ByaW1lclJlZmVyZW5jZSxcbiAgLi4uc3Vic3lzdGVtc1JlZmVyZW5jZSxcbiAgLi4ucmVmZXJlbmNlLFxuXVxuXG4vKipcbiAqIFBhZ2VzIG9mIG9uZSBzaWRlYmFyIGNvbGxlY3Rpb24sIGluIHRoZSBvcmRlciB0aGUgc2lkZWJhciBsaXN0cyB0aGVtLlxuICpcbiAqIEBwYXJhbSBsb2NhbGUgLSBSb3V0ZSB0cmVlIHdob3NlIHNpZGViYXIgaXMgYmVpbmcgYnVpbHQuXG4gKiBAcGFyYW0gY29sbGVjdGlvbiAtIFNpZGViYXIgY29sbGVjdGlvbiB0byByZWFkLlxuICogQHJldHVybnMgVGhlIGNvbGxlY3Rpb24ncyBwYWdlcywgb3JkZXJlZCBieSBzZWN0aW9uIHBsYWNlbWVudCB0aGVuIGJ5IGBvcmRlcmAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvcmRlcmVkUGFnZXMobG9jYWxlOiBEb2NzTG9jYWxlLCBjb2xsZWN0aW9uOiBEb2NzU2lkZWJhcik6IERvY3NQYWdlW10ge1xuICByZXR1cm4gZG9jc1BhZ2VzXG4gICAgLmZpbHRlcihwYWdlID0+IHBhZ2UubG9jYWxlID09PSBsb2NhbGUgJiYgcGFnZS5zaWRlYmFyID09PSBjb2xsZWN0aW9uKVxuICAgIC5zb3J0KChsZWZ0LCByaWdodCkgPT4gKFxuICAgICAgc2VjdGlvblNwZWMobG9jYWxlLCBsZWZ0LnNlY3Rpb24pLmluZGV4IC0gc2VjdGlvblNwZWMobG9jYWxlLCByaWdodC5zZWN0aW9uKS5pbmRleFxuICAgICAgfHwgbGVmdC5vcmRlciAtIHJpZ2h0Lm9yZGVyXG4gICAgKSlcbn1cblxuLyoqXG4gKiBTaXRlLXJlbGF0aXZlIGxpbmsgZm9yIGEgcHVibGlzaGVkIHJvdXRlLlxuICpcbiAqIEBwYXJhbSByb3V0ZSAtIE1hbmlmZXN0IHJvdXRlLCBpbmNsdWRpbmcgaXRzIGAubWRgIHN1ZmZpeC5cbiAqIEByZXR1cm5zIFRoZSBsaW5rIFZpdGVQcmVzcyBzZXJ2ZXMgdGhlIHJvdXRlIGF0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcm91dGVMaW5rKHJvdXRlOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gYC8ke3JvdXRlLnJlcGxhY2UoLyg/OmluZGV4KT9cXC5tZCQvLCAnJyl9YFxufVxuXG4vKipcbiAqIFdoZXJlIGEgdG9wLWxldmVsIG5hdmlnYXRpb24gaXRlbSBsYW5kcy5cbiAqXG4gKiBUaGUgdGFyZ2V0IGlzIGRlcml2ZWQgcmF0aGVyIHRoYW4gd3JpdHRlbiBkb3duOiBhIGNvbGxlY3Rpb24gd2hvc2UgZmlyc3QgcGFnZVxuICogaXMgcmVuYW1lZCBvciByZW9yZGVyZWQgd291bGQgb3RoZXJ3aXNlIGxlYXZlIHRoZSBuYXZpZ2F0aW9uIGJhciBwb2ludGluZyBhdFxuICogYSByb3V0ZSB0aGUgbWFuaWZlc3Qgbm8gbG9uZ2VyIHB1Ymxpc2hlcy5cbiAqXG4gKiBAcGFyYW0gbG9jYWxlIC0gUm91dGUgdHJlZSB0aGUgbmF2aWdhdGlvbiBpdGVtIGJlbG9uZ3MgdG8uXG4gKiBAcGFyYW0gY29sbGVjdGlvbiAtIFNpZGViYXIgY29sbGVjdGlvbiB0aGUgaXRlbSBvcGVucy5cbiAqIEByZXR1cm5zIFNpdGUtcmVsYXRpdmUgbGluayBvZiB0aGUgY29sbGVjdGlvbidzIGZpcnN0IHBhZ2UuXG4gKiBAdGhyb3dzIFdoZW4gdGhlIGNvbGxlY3Rpb24gcHVibGlzaGVzIG5vIHBhZ2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBsYW5kaW5nTGluayhsb2NhbGU6IERvY3NMb2NhbGUsIGNvbGxlY3Rpb246IERvY3NTaWRlYmFyKTogc3RyaW5nIHtcbiAgY29uc3QgZmlyc3QgPSBvcmRlcmVkUGFnZXMobG9jYWxlLCBjb2xsZWN0aW9uKVswXVxuICBpZiAoZmlyc3QgPT09IHVuZGVmaW5lZCkgdGhyb3cgbmV3IEVycm9yKGBTaWRlYmFyIGNvbGxlY3Rpb24gXCIke2NvbGxlY3Rpb259XCIgcHVibGlzaGVzIG5vIHBhZ2UuYClcbiAgcmV0dXJuIHJvdXRlTGluayhmaXJzdC5yb3V0ZSlcbn1cbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL2hvbWUvdHlsZXIvZGVlcHNlZWstaGFybmVzcy9zY3JpcHRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS90eWxlci9kZWVwc2Vlay1oYXJuZXNzL3NjcmlwdHMvcHJvamVjdC1kb2Mtc2l0ZS50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vaG9tZS90eWxlci9kZWVwc2Vlay1oYXJuZXNzL3NjcmlwdHMvcHJvamVjdC1kb2Mtc2l0ZS50c1wiOy8qKlxuICogQnVpbGQtdGltZSBwcm9qZWN0aW9uIGZyb20gY2Fub25pY2FsIHJlcG9zaXRvcnkgTWFya2Rvd24gaW50byBWaXRlUHJlc3MuXG4gKlxuICogVGhlIGdlbmVyYXRlZCB0cmVlIGlzIGRpc3Bvc2FibGU6IHNvdXJjZXMgc3RheSBpbiB0aGVpciBvd25pbmcgYGRvY3MvYFxuICogdGllciwgd2hpbGUgdGhpcyBhZGFwdGVyIHJld3JpdGVzIGNyb3NzLXNvdXJjZSBsaW5rcyBmb3IgdGhlIHB1YmxpYyBzaXRlLlxuICogVGhlIHNhbWUgcHJvamVjdGlvbiBhbHNvIGVtaXRzIGEgcmF3LU1hcmtkb3duIHR3aW4gb2YgZXZlcnkgcm91dGUgaW50byB0aGVcbiAqIGJ1aWxkIG91dHB1dCwgc28gYSBwYWdlJ3MgVVJMLCBtaW51cyBhbnkgdHJhaWxpbmcgc2xhc2gsIHBsdXMgYC5tZGAgc2VydmVzXG4gKiBpdCBhcyBwbGFpbiBNYXJrZG93bi5cbiAqL1xuXG5pbXBvcnQge1xuICBjb3B5RmlsZVN5bmMsIGV4aXN0c1N5bmMsIGxzdGF0U3luYywgbWtkaXJTeW5jLCByZWFkRmlsZVN5bmMsIHJlYWxwYXRoU3luYywgcm1TeW5jLCBzdGF0U3luYywgd3JpdGVGaWxlU3luYyxcbn0gZnJvbSAnbm9kZTpmcydcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lLCBleHRuYW1lLCBwb3NpeCwgcmVsYXRpdmUsIHJlc29sdmUsIHNlcCB9IGZyb20gJ25vZGU6cGF0aCdcbmltcG9ydCB7IGZyb21NYXJrZG93biB9IGZyb20gJ21kYXN0LXV0aWwtZnJvbS1tYXJrZG93bidcbmltcG9ydCB7IGdmbUZyb21NYXJrZG93biB9IGZyb20gJ21kYXN0LXV0aWwtZ2ZtJ1xuaW1wb3J0IHsgZ2ZtIH0gZnJvbSAnbWljcm9tYXJrLWV4dGVuc2lvbi1nZm0nXG5pbXBvcnQgdHlwZSB7IE5vZGVzIH0gZnJvbSAnbWRhc3QnXG5pbXBvcnQgeyBkb2NzUGFnZXMsIGxvY2FsZUNvbGxlY3Rpb25zLCBvcmRlcmVkUGFnZXMsIHR5cGUgRG9jc0xvY2FsZSwgdHlwZSBEb2NzUGFnZSB9IGZyb20gJy4uL3dlYnNpdGUvZG9jcy50cydcbmltcG9ydCB7XG4gIGlzRXh0ZXJuYWxPckFic29sdXRlTWFya2Rvd25VcmwsXG4gIG1hcmtkb3duRGVzdGluYXRpb24sXG4gIHNwbGl0TWFya2Rvd25VcmxUYXJnZXQsXG59IGZyb20gJy4vbWFya2Rvd24udHMnXG5cbmNvbnN0IFJFUE9TSVRPUllfVVJMID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS9kZWVwc2Vlay1haS9kZWVwc2Vlay1oYXJuZXNzJ1xuY29uc3Qgcm9vdCA9IHJlc29sdmUoaW1wb3J0Lm1ldGEuZGlybmFtZSwgJy4uJylcbmNvbnN0IGdlbmVyYXRlZFJvb3QgPSByZXNvbHZlKHJvb3QsICd3ZWJzaXRlLy5nZW5lcmF0ZWQnKVxuXG4vKipcbiAqIFJlc29sdmUgdGhlIHB1YmxpYyByZXBvc2l0b3J5IHJlZiB1c2VkIGJ5IHByb2plY3RlZCBzb3VyY2UgbGlua3MuXG4gKlxuICogQHBhcmFtIGVudmlyb25tZW50IEJ1aWxkIGVudmlyb25tZW50IGNvbnRhaW5pbmcgYW4gb3B0aW9uYWwgZXhwbGljaXQgcHVibGljIHJlZi5cbiAqIEByZXR1cm5zIFRoZSBjb25maWd1cmVkIHB1YmxpYyByZWYsIG9yIGBtYXN0ZXJgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZVJlcG9zaXRvcnlSZWYoZW52aXJvbm1lbnQ6IE5vZGVKUy5Qcm9jZXNzRW52KTogc3RyaW5nIHtcbiAgcmV0dXJuIGVudmlyb25tZW50LkRPQ1NfUkVQT1NJVE9SWV9SRUYgPz8gJ21hc3Rlcidcbn1cblxuaW50ZXJmYWNlIFJlcGxhY2VtZW50IHtcbiAgc3RhcnQ6IG51bWJlclxuICBlbmQ6IG51bWJlclxuICB2YWx1ZTogc3RyaW5nXG59XG5cbnR5cGUgUmV3cml0YWJsZU5vZGUgPSBFeHRyYWN0PE5vZGVzLCB7IHR5cGU6ICdsaW5rJyB8ICdpbWFnZScgfCAnZGVmaW5pdGlvbicgfT5cblxuLyoqIElucHV0cyBmb3IgcmV3cml0aW5nIG9uZSBjYW5vbmljYWwgTWFya2Rvd24gcGFnZS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgUmV3cml0ZU1hcmtkb3duT3B0aW9ucyB7XG4gIGxvY2FsZTogRG9jc0xvY2FsZVxuICBzb3VyY2VQYXRoOiBzdHJpbmdcbiAgcm91dGU6IHN0cmluZ1xuICBwYWdlczogRG9jc1BhZ2VbXVxuICByZXBvUm9vdDogc3RyaW5nXG4gIHJlcG9zaXRvcnlSZWY6IHN0cmluZ1xuICAvKipcbiAgICogUGxhY2Ugb25lIHJlZmVyZW5jZWQgaW1hZ2UgYmVzaWRlIHRoZSBwcm9qZWN0ZWQgcGFnZSBhbmQgcmV0dXJuIHRoZSBVUkwgdG9cbiAgICogcmVhY2ggaXQgZnJvbSB0aGF0IHBhZ2UuIEEgR2l0SHViIHJhdyBVUkwgY2Fubm90IHNlcnZlIHRoaXMgcmVwb3NpdG9yeSBcdTIwMTRcbiAgICogYHJhdy5naXRodWJ1c2VyY29udGVudC5jb21gIGFuc3dlcnMgNDA0IGZvciBhIHByaXZhdGUgb25lLCBhbmQgbm8gcmVhZGVyIG9mXG4gICAqIHRoZSBzaXRlIGlzIGF1dGhlbnRpY2F0ZWQgdG8gaXQgXHUyMDE0IHNvIGFuIGltYWdlIHRyYXZlbHMgaW50byB0aGUgZ2VuZXJhdGVkXG4gICAqIHRyZWUgYW5kIFZpdGUgYnVuZGxlcyBpdCBsaWtlIGFueSBvdGhlciBzaXRlIGFzc2V0LiBPbWl0dGVkIGJ5IGNhbGxlcnMgdGhhdFxuICAgKiBvbmx5IHJld3JpdGUgdGV4dCwgd2hpY2ggdGhlbiBsZWF2ZSBpbWFnZXMgcG9pbnRpbmcgYXQgdGhlIHJlcG9zaXRvcnkuXG4gICAqL1xuICBwbGFjZUltYWdlPzogKGFic1BhdGg6IHN0cmluZykgPT4gc3RyaW5nXG59XG5cbmZ1bmN0aW9uIHJlcG9QYXRoKGFic1BhdGg6IHN0cmluZywgcmVwb1Jvb3Q6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiByZWxhdGl2ZShyZXBvUm9vdCwgYWJzUGF0aCkuc3BsaXQoc2VwKS5qb2luKCcvJylcbn1cblxuLy8gYCNmcmFnbWVudGAgc3VmZml4ZXMgcGFzcyB0aHJvdWdoIHZlcmJhdGltLiBHZW5lcmF0ZWQgY29yZGlzLXN1cmZhY2Vcbi8vIGhlYWRpbmdzIGNhcnJ5IGV4cGxpY2l0IGA8YSBpZD5gIGFuY2hvcnMgd2l0aCB0aGUgR2l0SHViIHNsdWcsIHNvIHRob3NlXG4vLyBmcmFnbWVudHMgcmVzb2x2ZSBvbiB0aGUgcHVibGlzaGVkIHNpdGUgdG9vOyBoYW5kLXdyaXR0ZW4gaGVhZGluZ3MgcmVseSBvblxuLy8gVml0ZVByZXNzJ3Mgb3duIHNsdWdnZXIsIHdoaWNoIGRpZmZlcnMgZnJvbSBHaXRIdWIncyBmb3IgcHVuY3R1YXRpb24taGVhdnlcbi8vIHRleHQgXHUyMDE0IGhhbmQtYXV0aG9yZWQgY3Jvc3MtcGFnZSBmcmFnbWVudHMgc2hvdWxkIHByZWZlciBwbGFpbi10ZXh0IGhlYWRpbmdzXG4vLyBvciBleHBsaWNpdCBhbmNob3JzLlxuZnVuY3Rpb24gZGVjb2RlUGF0aChwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICB0cnkge1xuICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQocGF0aClcbiAgfSBjYXRjaCB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBwcm9qZWN0LWRvYy1zaXRlOiBtYWxmb3JtZWQgcGVyY2VudCBlc2NhcGUgaW4gJHtKU09OLnN0cmluZ2lmeShwYXRoKX0uYClcbiAgfVxufVxuXG5mdW5jdGlvbiByb3V0ZVRhcmdldChmcm9tUm91dGU6IHN0cmluZywgdG9Sb3V0ZTogc3RyaW5nLCBzdWZmaXg6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IHRhcmdldCA9IHBvc2l4LnJlbGF0aXZlKHBvc2l4LmRpcm5hbWUoZnJvbVJvdXRlKSwgdG9Sb3V0ZSlcbiAgcmV0dXJuIGAke3RhcmdldC5zdGFydHNXaXRoKCcuJykgPyB0YXJnZXQgOiBgLi8ke3RhcmdldH1gfSR7c3VmZml4fWBcbn1cblxuZnVuY3Rpb24gc291cmNlTWFwKHBhZ2VzOiBEb2NzUGFnZVtdKTogTWFwPHN0cmluZywgTWFwPERvY3NMb2NhbGUsIERvY3NQYWdlPj4ge1xuICBjb25zdCBtYXAgPSBuZXcgTWFwPHN0cmluZywgTWFwPERvY3NMb2NhbGUsIERvY3NQYWdlPj4oKVxuICBmb3IgKGNvbnN0IHBhZ2Ugb2YgcGFnZXMpIHtcbiAgICBmb3IgKGNvbnN0IHNvdXJjZSBvZiBbcGFnZS5zb3VyY2UsIC4uLihwYWdlLnNvdXJjZUFsaWFzZXMgPz8gW10pXSkge1xuICAgICAgY29uc3QgbG9jYWxpemVkID0gbWFwLmdldChzb3VyY2UpID8/IG5ldyBNYXA8RG9jc0xvY2FsZSwgRG9jc1BhZ2U+KClcbiAgICAgIGlmIChsb2NhbGl6ZWQuaGFzKHBhZ2UubG9jYWxlKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYHByb2plY3QtZG9jLXNpdGU6IGR1cGxpY2F0ZSBzb3VyY2Ugb3IgYWxpYXMgJHtKU09OLnN0cmluZ2lmeShzb3VyY2UpfSBmb3IgbG9jYWxlICR7SlNPTi5zdHJpbmdpZnkocGFnZS5sb2NhbGUpfS5gKVxuICAgICAgfVxuICAgICAgbG9jYWxpemVkLnNldChwYWdlLmxvY2FsZSwgcGFnZSlcbiAgICAgIG1hcC5zZXQoc291cmNlLCBsb2NhbGl6ZWQpXG4gICAgfVxuICB9XG4gIHJldHVybiBtYXBcbn1cblxuZnVuY3Rpb24gY291bnRlcnBhcnRTb3VyY2Uoc291cmNlOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gc291cmNlLmVuZHNXaXRoKCcuemgubWQnKVxuICAgID8gc291cmNlLnJlcGxhY2UoL1xcLnpoXFwubWQkLywgJy5tZCcpXG4gICAgOiBzb3VyY2UucmVwbGFjZSgvXFwubWQkLywgJy56aC5tZCcpXG59XG5cbmZ1bmN0aW9uIHJlc29sdmVSZXBvc2l0b3J5VGFyZ2V0KHNvdXJjZUFiczogc3RyaW5nLCByYXdQYXRoOiBzdHJpbmcsIHJlcG9Sb290OiBzdHJpbmcpOiB7IGFic1BhdGg6IHN0cmluZzsgbGluZT86IG51bWJlciB9IHtcbiAgY29uc3QgZGVjb2RlZCA9IGRlY29kZVBhdGgocmF3UGF0aClcbiAgbGV0IGFic1BhdGggPSByZXNvbHZlKGRpcm5hbWUoc291cmNlQWJzKSwgZGVjb2RlZClcbiAgaWYgKGV4aXN0c1N5bmMoYWJzUGF0aCkpIHJldHVybiB7IGFic1BhdGggfVxuXG4gIGNvbnN0IGxpbmVNYXRjaCA9IGRlY29kZWQubWF0Y2goLzooXFxkKykkLylcbiAgaWYgKGxpbmVNYXRjaCAhPT0gbnVsbCkge1xuICAgIGNvbnN0IGxpbmVUZXh0ID0gbGluZU1hdGNoWzFdXG4gICAgaWYgKGxpbmVUZXh0ID09PSB1bmRlZmluZWQpIHRocm93IG5ldyBFcnJvcigncHJvamVjdC1kb2Mtc2l0ZTogbGluZSBzdWZmaXggbWF0Y2hlZCB3aXRob3V0IGEgbGluZSBudW1iZXIuJylcbiAgICBhYnNQYXRoID0gcmVzb2x2ZShkaXJuYW1lKHNvdXJjZUFicyksIGRlY29kZWQuc2xpY2UoMCwgLWxpbmVNYXRjaFswXS5sZW5ndGgpKVxuICAgIGlmIChleGlzdHNTeW5jKGFic1BhdGgpKSByZXR1cm4geyBhYnNQYXRoLCBsaW5lOiBOdW1iZXIucGFyc2VJbnQobGluZVRleHQsIDEwKSB9XG4gIH1cblxuICBpZiAoZXh0bmFtZShkZWNvZGVkKSA9PT0gJycpIHtcbiAgICBjb25zdCBtYXJrZG93biA9IHJlc29sdmUoZGlybmFtZShzb3VyY2VBYnMpLCBgJHtkZWNvZGVkfS5tZGApXG4gICAgaWYgKGV4aXN0c1N5bmMobWFya2Rvd24pKSByZXR1cm4geyBhYnNQYXRoOiBtYXJrZG93biB9XG4gICAgY29uc3QgaW5kZXggPSByZXNvbHZlKGRpcm5hbWUoc291cmNlQWJzKSwgZGVjb2RlZCwgJ2luZGV4Lm1kJylcbiAgICBpZiAoZXhpc3RzU3luYyhpbmRleCkpIHJldHVybiB7IGFic1BhdGg6IGluZGV4IH1cbiAgfVxuXG4gIHRocm93IG5ldyBFcnJvcihgcHJvamVjdC1kb2Mtc2l0ZTogJHtyZXBvUGF0aChzb3VyY2VBYnMsIHJlcG9Sb290KX0gbGlua3MgdG8gbWlzc2luZyBwYXRoICR7SlNPTi5zdHJpbmdpZnkocmF3UGF0aCl9LmApXG59XG5cbmZ1bmN0aW9uIGdpdGh1YlRhcmdldChcbiAgYWJzUGF0aDogc3RyaW5nLFxuICBsaW5lOiBudW1iZXIgfCB1bmRlZmluZWQsXG4gIHN1ZmZpeDogc3RyaW5nLFxuICByZXBvc2l0b3J5UmVmOiBzdHJpbmcsXG4gIHJlcG9Sb290OiBzdHJpbmcsXG4gIGltYWdlOiBib29sZWFuLFxuKTogc3RyaW5nIHtcbiAgY29uc3QgcGF0aCA9IHJlcG9QYXRoKGFic1BhdGgsIHJlcG9Sb290KVxuICBpZiAoaW1hZ2UpIHJldHVybiBgaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL2RlZXBzZWVrLWFpL2RlZXBzZWVrLWhhcm5lc3MvJHtyZXBvc2l0b3J5UmVmfS8ke3BhdGh9JHtzdWZmaXh9YFxuICBjb25zdCBraW5kID0gbHN0YXRTeW5jKGFic1BhdGgpLmlzRGlyZWN0b3J5KCkgPyAndHJlZScgOiAnYmxvYidcbiAgY29uc3QgbGluZVN1ZmZpeCA9IGxpbmUgPT09IHVuZGVmaW5lZCA/IHN1ZmZpeCA6IGAjTCR7bGluZX1gXG4gIHJldHVybiBgJHtSRVBPU0lUT1JZX1VSTH0vJHtraW5kfS8ke3JlcG9zaXRvcnlSZWZ9LyR7cGF0aH0ke2xpbmVTdWZmaXh9YFxufVxuXG4vKipcbiAqIFJld3JpdGUgcmVwb3NpdG9yeS1yZWxhdGl2ZSBsaW5rcyB3aXRob3V0IHJlc2VyaWFsaXppbmcgTWFya2Rvd24uXG4gKlxuICogQHBhcmFtIHNvdXJjZSBNYXJrZG93biB0ZXh0IGZyb20gdGhlIGNhbm9uaWNhbCBmaWxlLlxuICogQHBhcmFtIG9wdGlvbnMgU291cmNlLCByb3V0ZSwgbWFuaWZlc3QsIGFuZCByZXBvc2l0b3J5IGNvbnRleHQuXG4gKiBAcmV0dXJucyBNYXJrZG93biB3aG9zZSBwdWJsaXNoZWQgbGlua3MgcmVzb2x2ZSBpbnNpZGUgdGhlIHNpdGUgb3IgdG8gR2l0SHViLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmV3cml0ZU1hcmtkb3duKHNvdXJjZTogc3RyaW5nLCBvcHRpb25zOiBSZXdyaXRlTWFya2Rvd25PcHRpb25zKTogc3RyaW5nIHtcbiAgY29uc3Qgc291cmNlQWJzID0gcmVzb2x2ZShvcHRpb25zLnJlcG9Sb290LCBvcHRpb25zLnNvdXJjZVBhdGgpXG4gIGNvbnN0IHB1Ymxpc2hlZCA9IHNvdXJjZU1hcChvcHRpb25zLnBhZ2VzKVxuICBjb25zdCB0cmVlID0gZnJvbU1hcmtkb3duKHNvdXJjZSwgeyBleHRlbnNpb25zOiBbZ2ZtKCldLCBtZGFzdEV4dGVuc2lvbnM6IFtnZm1Gcm9tTWFya2Rvd24oKV0gfSlcbiAgY29uc3QgcmVwbGFjZW1lbnRzOiBSZXBsYWNlbWVudFtdID0gW11cblxuICBjb25zdCByZXdyaXRlID0gKG5vZGU6IFJld3JpdGFibGVOb2RlKTogdm9pZCA9PiB7XG4gICAgaWYgKGlzRXh0ZXJuYWxPckFic29sdXRlTWFya2Rvd25Vcmwobm9kZS51cmwpKSByZXR1cm5cbiAgICBjb25zdCB7IHBhdGgsIHN1ZmZpeCB9ID0gc3BsaXRNYXJrZG93blVybFRhcmdldChub2RlLnVybClcbiAgICBpZiAocGF0aCA9PT0gJycpIHJldHVyblxuICAgIGNvbnN0IHsgYWJzUGF0aCwgbGluZSB9ID0gcmVzb2x2ZVJlcG9zaXRvcnlUYXJnZXQoc291cmNlQWJzLCBwYXRoLCBvcHRpb25zLnJlcG9Sb290KVxuICAgIGNvbnN0IHRhcmdldFBhdGggPSByZXBvUGF0aChhYnNQYXRoLCBvcHRpb25zLnJlcG9Sb290KVxuICAgIGNvbnN0IGlzTGFuZ3VhZ2VTd2l0Y2hlciA9IHRhcmdldFBhdGggPT09IGNvdW50ZXJwYXJ0U291cmNlKG9wdGlvbnMuc291cmNlUGF0aClcbiAgICBjb25zdCB0YXJnZXRMb2NhbGU6IERvY3NMb2NhbGUgPSBpc0xhbmd1YWdlU3dpdGNoZXJcbiAgICAgID8gb3B0aW9ucy5sb2NhbGUgPT09ICdyb290JyA/ICdlbicgOiAncm9vdCdcbiAgICAgIDogb3B0aW9ucy5sb2NhbGVcbiAgICBjb25zdCBwYWdlID0gcHVibGlzaGVkLmdldCh0YXJnZXRQYXRoKT8uZ2V0KHRhcmdldExvY2FsZSlcbiAgICBjb25zdCBuZXh0VXJsID0gcGFnZSAhPT0gdW5kZWZpbmVkXG4gICAgICA/IHJvdXRlVGFyZ2V0KG9wdGlvbnMucm91dGUsIHBhZ2Uucm91dGUsIHN1ZmZpeClcbiAgICAgIDogbm9kZS50eXBlID09PSAnaW1hZ2UnICYmIG9wdGlvbnMucGxhY2VJbWFnZSAhPT0gdW5kZWZpbmVkXG4gICAgICAgIC8vIFRoZSBzdWZmaXggcmlkZXMgYWxvbmcgZXhhY3RseSBhcyB0aGUgR2l0SHViIGJyYW5jaCBrZWVwcyBpdDogYW4gU1ZHXG4gICAgICAgIC8vIHZpZXcgZnJhZ21lbnQgb3IgYSBWaXRlIHF1ZXJ5IGNoYW5nZXMgd2hhdCB0aGUgcmVmZXJlbmNlIG1lYW5zLlxuICAgICAgICA/IGAke29wdGlvbnMucGxhY2VJbWFnZShhYnNQYXRoKX0ke3N1ZmZpeH1gXG4gICAgICAgIDogZ2l0aHViVGFyZ2V0KGFic1BhdGgsIGxpbmUsIHN1ZmZpeCwgb3B0aW9ucy5yZXBvc2l0b3J5UmVmLCBvcHRpb25zLnJlcG9Sb290LCBub2RlLnR5cGUgPT09ICdpbWFnZScpXG5cbiAgICBjb25zdCBkZXN0aW5hdGlvbiA9IG1hcmtkb3duRGVzdGluYXRpb24oc291cmNlLCBub2RlKVxuICAgIHJlcGxhY2VtZW50cy5wdXNoKHtcbiAgICAgIHN0YXJ0OiBkZXN0aW5hdGlvbi5zdGFydCxcbiAgICAgIGVuZDogZGVzdGluYXRpb24uZW5kLFxuICAgICAgdmFsdWU6IG5leHRVcmwsXG4gICAgfSlcbiAgfVxuXG4gIGNvbnN0IHZpc2l0ID0gKG5vZGU6IE5vZGVzKTogdm9pZCA9PiB7XG4gICAgaWYgKChub2RlLnR5cGUgPT09ICdsaW5rJyB8fCBub2RlLnR5cGUgPT09ICdpbWFnZScgfHwgbm9kZS50eXBlID09PSAnZGVmaW5pdGlvbicpICYmICd1cmwnIGluIG5vZGUpIHJld3JpdGUobm9kZSlcbiAgICBpZiAoJ2NoaWxkcmVuJyBpbiBub2RlKSB7XG4gICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHZpc2l0KGNoaWxkKVxuICAgIH1cbiAgfVxuICB2aXNpdCh0cmVlKVxuXG4gIGxldCBwcm9qZWN0ZWQgPSBzb3VyY2VcbiAgZm9yIChjb25zdCByZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudHMuc29ydCgoYSwgYikgPT4gYi5zdGFydCAtIGEuc3RhcnQpKSB7XG4gICAgcHJvamVjdGVkID0gcHJvamVjdGVkLnNsaWNlKDAsIHJlcGxhY2VtZW50LnN0YXJ0KSArIHJlcGxhY2VtZW50LnZhbHVlICsgcHJvamVjdGVkLnNsaWNlKHJlcGxhY2VtZW50LmVuZClcbiAgfVxuICByZXR1cm4gcHJvamVjdGVkXG59XG5cbi8qKlxuICogUmVjb3JkIGNhbm9uaWNhbCBlZGl0IGFuZCByYXctTWFya2Rvd24gdGFyZ2V0cyBpbiBWaXRlUHJlc3MgZnJvbnRtYXR0ZXIuXG4gKlxuICogQHBhcmFtIG1hcmtkb3duIFByb2plY3RlZCBNYXJrZG93biBjb250ZW50LlxuICogQHBhcmFtIHBhZ2UgUHVibGljYXRpb24gbWFuaWZlc3QgZW50cnkgZm9yIHRoZSBjb250ZW50LlxuICogQHJldHVybnMgTWFya2Rvd24gd2l0aCBwcm9qZWN0aW9uLW93bmVkIGZyb250bWF0dGVyIGZpZWxkcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFkZFByb2plY3Rpb25Gcm9udG1hdHRlcihtYXJrZG93bjogc3RyaW5nLCBwYWdlOiBQaWNrPERvY3NQYWdlLCAnc291cmNlJyB8ICdvdXRsaW5lJyB8ICdyb3V0ZScgfCAnc2lkZWJhcic+KTogc3RyaW5nIHtcbiAgY29uc3QgZmllbGRzID0gW1xuICAgIGBlZGl0U291cmNlOiAke0pTT04uc3RyaW5naWZ5KHBhZ2Uuc291cmNlKX1gLFxuICAgIC4uLihwYWdlLnNpZGViYXIgPT09IG51bGwgPyBbXSA6IFtgcmF3TWFya2Rvd25QYXRoOiAke0pTT04uc3RyaW5naWZ5KHBhZ2Uucm91dGUpfWBdKSxcbiAgICAuLi4ocGFnZS5vdXRsaW5lID09PSB1bmRlZmluZWQgPyBbXSA6IFtgb3V0bGluZTogJHtKU09OLnN0cmluZ2lmeShwYWdlLm91dGxpbmUpfWBdKSxcbiAgXS5qb2luKCdcXG4nKVxuICBpZiAobWFya2Rvd24uc3RhcnRzV2l0aCgnLS0tXFxuJykpIHJldHVybiBtYXJrZG93bi5yZXBsYWNlKCctLS1cXG4nLCBgLS0tXFxuJHtmaWVsZHN9XFxuYClcbiAgcmV0dXJuIGAtLS1cXG4ke2ZpZWxkc31cXG4tLS1cXG5cXG4ke21hcmtkb3dufWBcbn1cblxuLyoqIFRoZSBzd2l0Y2hlciBsaW5lIGEgY2Fub25pY2FsIHBhZ2UgY2FycmllcyBzbyBpdHMgR2l0SHViIHJlYWRlciBjYW4gcmVhY2ggdGhlIG90aGVyIGxhbmd1YWdlLiAqL1xuY29uc3QgTEFOR1VBR0VfU1dJVENIRVIgPSAvXig/OkVuZ2xpc2ggXFx8IFxcW1x1NEUyRFx1NjU4N1xcXVxcKFteKV0qXFwpfFxcW0VuZ2xpc2hcXF1cXChbXildKlxcKSBcXHwgXHU0RTJEXHU2NTg3KSQvXG5cbi8qKiBUaGUgcmVwb3NpdG9yeSBiYWRnZSBhIGNhbm9uaWNhbCBwYWdlIGNhcnJpZXMgZm9yIGl0cyBHaXRIdWIgcmVhZGVyLiAqL1xuY29uc3QgUkVQT1NJVE9SWV9CQURHRSA9IC9eXFxbIVxcW1teXFxdXSpcXF1cXChodHRwczpcXC9cXC9pbWdcXC5zaGllbGRzXFwuaW9cXC9bXildKlxcKVxcXVxcKFteKV0qXFwpJC9cblxuLyoqXG4gKiBEcm9wIHRoZSBsaW5lcyB0aGF0IGFkZHJlc3MgYSBjYW5vbmljYWwgcGFnZSdzIEdpdEh1YiByZWFkZXIuXG4gKlxuICogVGhlIHNpdGUgY2FycmllcyBhIGxvY2FsZSBzd2l0Y2hlciBpbiBpdHMgbmF2aWdhdGlvbiBiYXIgYW5kIGxpbmtzIHRoZVxuICogcmVwb3NpdG9yeSBmcm9tIGV2ZXJ5IHBhZ2UsIHNvIHByb2plY3RpbmcgdGhlc2UgbGluZXMgd291bGQgcmVwZWF0IGJvdGggXHUyMDE0IHRoZVxuICogc3dpdGNoZXIgYXMgdGhlIGZpcnN0IGVsZW1lbnQgdW5kZXIgZWFjaCBoZWFkaW5nLlxuICpcbiAqIEBwYXJhbSBtYXJrZG93biBSZXdyaXR0ZW4gY2Fub25pY2FsIE1hcmtkb3duIGNvbnRlbnQuXG4gKiBAcmV0dXJucyBUaGUgY29udGVudCB3aXRob3V0IHRoZSBzd2l0Y2hlciBsaW5lIG9yIHRoZSByZXBvc2l0b3J5IGJhZGdlLlxuICovXG5mdW5jdGlvbiB3aXRob3V0UmVwb3NpdG9yeUNocm9tZShtYXJrZG93bjogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgbGluZXMgPSBtYXJrZG93bi5zcGxpdCgnXFxuJylcbiAgY29uc3Qgc3dpdGNoZXIgPSBsaW5lcy5maW5kSW5kZXgobGluZSA9PiBMQU5HVUFHRV9TV0lUQ0hFUi50ZXN0KGxpbmUpKVxuICAvLyBPbmx5IHRoZSBzd2l0Y2hlciBpbnRyb2R1Y2luZyB0aGUgcGFnZSBxdWFsaWZpZXM7IGZ1cnRoZXIgZG93biB0aGUgc2FtZVxuICAvLyB0ZXh0IGlzIHByb3NlIG9yIGEgc2FtcGxlIHJhdGhlciB0aGFuIHRoZSBwYWdlJ3Mgb3duIGhlYWRlci5cbiAgaWYgKHN3aXRjaGVyICE9PSAtMSAmJiBzd2l0Y2hlciA8IDgpIHtcbiAgICBsaW5lcy5zcGxpY2Uoc3dpdGNoZXIsIGxpbmVzW3N3aXRjaGVyICsgMV0gPT09ICcnID8gMiA6IDEpXG4gIH1cbiAgY29uc3QgYmFkZ2UgPSBsaW5lcy5maW5kTGFzdEluZGV4KGxpbmUgPT4gUkVQT1NJVE9SWV9CQURHRS50ZXN0KGxpbmUpKVxuICBpZiAoYmFkZ2UgIT09IC0xKSB7XG4gICAgbGluZXMuc3BsaWNlKGxpbmVzW2JhZGdlIC0gMV0gPT09ICcnID8gYmFkZ2UgLSAxIDogYmFkZ2UsIGxpbmVzW2JhZGdlIC0gMV0gPT09ICcnID8gMiA6IDEpXG4gIH1cbiAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpXG59XG5cbi8qKlxuICogU2VsZWN0IHRoZSBNYXJrZG93biByZW5kZXJlZCBmb3Igb25lIHB1Ymxpc2hlZCBwYWdlLlxuICpcbiAqIEBwYXJhbSBtYXJrZG93biBSZXdyaXR0ZW4gY2Fub25pY2FsIE1hcmtkb3duIGNvbnRlbnQuXG4gKiBAcGFyYW0gcGFnZSBQdWJsaWNhdGlvbiBtYW5pZmVzdCBlbnRyeSBmb3IgdGhlIGNvbnRlbnQuXG4gKiBAcmV0dXJucyBGdWxsIE1hcmtkb3duIGZvciBvcmRpbmFyeSBwYWdlcyBvciBmcm9udG1hdHRlci1vbmx5IE1hcmtkb3duIGZvciBhIGxvY2FsZSBob21lIHBhZ2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcm9qZWN0ZWRQYWdlQ29udGVudChtYXJrZG93bjogc3RyaW5nLCBwYWdlOiBEb2NzUGFnZSk6IHN0cmluZyB7XG4gIGlmIChwYWdlLnNpZGViYXIgIT09IG51bGwpIHJldHVybiB3aXRob3V0UmVwb3NpdG9yeUNocm9tZShtYXJrZG93bilcbiAgaWYgKCFtYXJrZG93bi5zdGFydHNXaXRoKCctLS1cXG4nKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgcHJvamVjdC1kb2Mtc2l0ZTogbG9jYWxlIGhvbWUgc291cmNlICR7SlNPTi5zdHJpbmdpZnkocGFnZS5zb3VyY2UpfSBtdXN0IHN0YXJ0IHdpdGggWUFNTCBmcm9udG1hdHRlci5gKVxuICB9XG4gIGNvbnN0IGNsb3NpbmdEZWxpbWl0ZXIgPSAnXFxuLS0tXFxuJ1xuICBjb25zdCBjbG9zaW5nID0gbWFya2Rvd24uaW5kZXhPZihjbG9zaW5nRGVsaW1pdGVyLCA0KVxuICBpZiAoY2xvc2luZyA9PT0gLTEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYHByb2plY3QtZG9jLXNpdGU6IGxvY2FsZSBob21lIHNvdXJjZSAke0pTT04uc3RyaW5naWZ5KHBhZ2Uuc291cmNlKX0gaGFzIHVuY2xvc2VkIFlBTUwgZnJvbnRtYXR0ZXIuYClcbiAgfVxuICByZXR1cm4gbWFya2Rvd24uc2xpY2UoMCwgY2xvc2luZyArIGNsb3NpbmdEZWxpbWl0ZXIubGVuZ3RoKVxufVxuXG4vKipcbiAqIFRoZSByZXBvc2l0b3J5IGZpbGUgb25lIGltYWdlIHJlZmVyZW5jZSByZXNvbHZlcyB0bywgb3IgYHVuZGVmaW5lZGAgd2hlbiB0aGVcbiAqIHRhcmdldCBpcyBub3QgYSBsb2NhbCBmaWxlIHRoaXMgYnVpbGQgbWF5IHB1Ymxpc2guXG4gKiBAcGFyYW0gYWJzUGF0aCAtIHJlc29sdmVkIGltYWdlIHRhcmdldC5cbiAqIEBwYXJhbSByZXBvUm9vdCAtIHJlcG9zaXRvcnkgcm9vdCBldmVyeSBwdWJsaXNoZWQgaW1hZ2UgbXVzdCBzdGF5IGluc2lkZS5cbiAqIEByZXR1cm5zIHRoZSBmaWxlJ3MgcmVhbCBwYXRoLCBvciBgdW5kZWZpbmVkYCB3aGVuIGl0IG11c3Qgbm90IGJlIGNvcGllZC5cbiAqXG4gKiBPbmx5IGEgcmVndWxhciBmaWxlIHdob3NlIHJlYWwgcGF0aCBzdGF5cyBpbnNpZGUgdGhlIHJlcG9zaXRvcnkgcXVhbGlmaWVzLlxuICogUHVibGljYXRpb24gY29waWVzIHRoZSBieXRlcyBpbnRvIHRoZSBzaXRlLCBzbyBhIHJlZmVyZW5jZSBlc2NhcGluZyB0aGVcbiAqIHJlcG9zaXRvcnkgXHUyMDE0IGAuLi8uLi8uc3NoL2lkX3JzYWAsIG9yIGEgc3ltbGluayBwb2ludGluZyBvdXQgb2YgdGhlIHRyZWUgXHUyMDE0XG4gKiB3b3VsZCBwdXQgYSBidWlsZC1tYWNoaW5lIGZpbGUgb24gdGhlIHNpdGU7IGBleGlzdHNTeW5jYCBhbG9uZSwgd2hpY2ggaXMgYWxsXG4gKiBsaW5rIHJlc29sdXRpb24gbmVlZHMsIGRvZXMgbm90IGFuc3dlciB0aGF0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHVibGlzaGFibGVJbWFnZShhYnNQYXRoOiBzdHJpbmcsIHJlcG9Sb290OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBjb25zdCByZWFsID0gcmVhbHBhdGhTeW5jKGFic1BhdGgpXG4gIGNvbnN0IGluc2lkZSA9IHJlYWwgPT09IHJlcG9Sb290IHx8IHJlYWwuc3RhcnRzV2l0aChgJHtyZXBvUm9vdH0ke3NlcH1gKVxuICByZXR1cm4gaW5zaWRlICYmIHN0YXRTeW5jKHJlYWwpLmlzRmlsZSgpID8gcmVhbCA6IHVuZGVmaW5lZFxufVxuXG4vKiogRXZlcnkgbG9jYWwgaW1hZ2UgYSBwdWJsaXNoZWQgcGFnZSByZWZlcmVuY2VzLCByZXNvbHZlZCB0byBpdHMgcmVwb3NpdG9yeSBmaWxlLiAqL1xuZnVuY3Rpb24gcmVmZXJlbmNlZEltYWdlcygpOiBzdHJpbmdbXSB7XG4gIGNvbnN0IGZvdW5kID0gbmV3IFNldDxzdHJpbmc+KClcbiAgZm9yIChjb25zdCBwYWdlIG9mIGRvY3NQYWdlcykge1xuICAgIGNvbnN0IHNvdXJjZUFicyA9IHJlc29sdmUocm9vdCwgcGFnZS5zb3VyY2UpXG4gICAgaWYgKCFleGlzdHNTeW5jKHNvdXJjZUFicykpIGNvbnRpbnVlXG4gICAgcmV3cml0ZU1hcmtkb3duKHJlYWRGaWxlU3luYyhzb3VyY2VBYnMsICd1dGY4JyksIHtcbiAgICAgIHNvdXJjZVBhdGg6IHBhZ2Uuc291cmNlLFxuICAgICAgbG9jYWxlOiBwYWdlLmxvY2FsZSxcbiAgICAgIHJvdXRlOiBwYWdlLnJvdXRlLFxuICAgICAgcGFnZXM6IGRvY3NQYWdlcyxcbiAgICAgIHJlcG9Sb290OiByb290LFxuICAgICAgcmVwb3NpdG9yeVJlZjogJ21hc3RlcicsXG4gICAgICBwbGFjZUltYWdlOiAoYWJzUGF0aCkgPT4ge1xuICAgICAgICBjb25zdCByZWFsID0gcHVibGlzaGFibGVJbWFnZShhYnNQYXRoLCByb290KVxuICAgICAgICBpZiAocmVhbCAhPT0gdW5kZWZpbmVkKSBmb3VuZC5hZGQocmVhbClcbiAgICAgICAgcmV0dXJuICcnXG4gICAgICB9LFxuICAgIH0pXG4gIH1cbiAgcmV0dXJuIFsuLi5mb3VuZF1cbn1cblxuLyoqXG4gKiBGaWxlcyB3YXRjaGVkIGJ5IHRoZSBsb2NhbCBWaXRlUHJlc3MgZGV2IHNlcnZlcjogZXZlcnkgY2Fub25pY2FsIE1hcmtkb3duXG4gKiBzb3VyY2UsIHBsdXMgdGhlIGltYWdlcyB0aGV5IHB1Ymxpc2guIFdpdGhvdXQgdGhlIGltYWdlcywgcmVwbGFjaW5nIGFcbiAqIHNjcmVlbnNob3QgbGVhdmVzIHRoZSBwcmV2aW91cyBjb3B5IGluIHRoZSBnZW5lcmF0ZWQgdHJlZSB1bnRpbCBzb21ldGhpbmdcbiAqIHRvdWNoZXMgdGhlIE1hcmtkb3duIGJlc2lkZSBpdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRvY3NTb3VyY2VGaWxlcygpOiBzdHJpbmdbXSB7XG4gIHJldHVybiBbLi4ubmV3IFNldChbLi4uZG9jc1BhZ2VzLm1hcChwYWdlID0+IHJlc29sdmUocm9vdCwgcGFnZS5zb3VyY2UpKSwgLi4ucmVmZXJlbmNlZEltYWdlcygpXSldXG59XG5cbi8qKiBNYW5pZmVzdCBhbmQgcmVwb3NpdG9yeSBpbnB1dHMgZm9yIG9uZSBwcm9qZWN0aW9uIHBhc3MuICovXG5leHBvcnQgaW50ZXJmYWNlIFByb2plY3Rpb25Db250ZXh0IHtcbiAgLyoqIFBhZ2VzIHRvIHByb2plY3QuICovXG4gIHBhZ2VzOiBEb2NzUGFnZVtdXG4gIC8qKiBSZXBvc2l0b3J5IHJvb3QgZXZlcnkgc291cmNlIGFuZCBwbGFjZWQgaW1hZ2UgbXVzdCBsaXZlIHVuZGVyLiAqL1xuICByZXBvUm9vdDogc3RyaW5nXG4gIC8qKiBQdWJsaWMgcmVmIHVzZWQgYnkgcHJvamVjdGVkIEdpdEh1YiBsaW5rcy4gKi9cbiAgcmVwb3NpdG9yeVJlZjogc3RyaW5nXG59XG5cbmZ1bmN0aW9uIGRlZmF1bHRQcm9qZWN0aW9uQ29udGV4dCgpOiBQcm9qZWN0aW9uQ29udGV4dCB7XG4gIHJldHVybiB7IHBhZ2VzOiBkb2NzUGFnZXMsIHJlcG9Sb290OiByb290LCByZXBvc2l0b3J5UmVmOiByZXNvbHZlUmVwb3NpdG9yeVJlZihwcm9jZXNzLmVudikgfVxufVxuXG4vKipcbiAqIFByb2plY3QgZXZlcnkgcGFnZSBhbmQgaXRzIGltYWdlcyBpbnRvIG9uZSB0YXJnZXQgdHJlZS5cbiAqXG4gKiBgZW50cmllc2AgYXJlIHdoYXQgZ2V0cyBlbWl0dGVkOyBsaW5rIHJlc29sdXRpb24gYWx3YXlzIHJlYWRzIHRoZSBjYW5vbmljYWxcbiAqIGBjb250ZXh0LnBhZ2VzYCwgc28gYW4gYWxpYXMgZW50cnkgc2hhcmluZyBhIHNvdXJjZSB3aXRoIGl0cyBpbmRleCByb3V0ZVxuICogZW1pdHMgYXQgaXRzIG93biBwYXRoIHdoaWxlIGxpbmtzIGtlZXAgdGFyZ2V0aW5nIGNhbm9uaWNhbCByb3V0ZXMuXG4gKi9cbmZ1bmN0aW9uIHByb2plY3RQYWdlc0ludG8oXG4gIHRhcmdldFJvb3Q6IHN0cmluZyxcbiAgY29udGV4dDogUHJvamVjdGlvbkNvbnRleHQsXG4gIHBhZ2VDb250ZW50OiAobWFya2Rvd246IHN0cmluZywgcGFnZTogRG9jc1BhZ2UpID0+IHN0cmluZyxcbiAgZW50cmllczogRG9jc1BhZ2VbXSA9IGNvbnRleHQucGFnZXMsXG4pOiB2b2lkIHtcbiAgY29uc3Qgcm91dGVzID0gbmV3IFNldDxzdHJpbmc+KClcbiAgLyoqIFByb2plY3RlZCBwYXRoIHRvIHRoZSByZXBvc2l0b3J5IGZpbGUgdGhhdCBjbGFpbWVkIGl0LCBwYWdlcyBhbmQgaW1hZ2VzIGFsaWtlLiAqL1xuICBjb25zdCBjbGFpbWVkID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKVxuXG4gIC8qKiBSZXNlcnZlIG9uZSBwcm9qZWN0ZWQgcGF0aCwgcmVmdXNpbmcgYSBzZWNvbmQgc291cmNlIGZvciBpdC4gKi9cbiAgY29uc3QgY2xhaW0gPSAodGFyZ2V0OiBzdHJpbmcsIHNvdXJjZUFiczogc3RyaW5nKTogdm9pZCA9PiB7XG4gICAgY29uc3QgaG9sZGVyID0gY2xhaW1lZC5nZXQodGFyZ2V0KVxuICAgIGlmIChob2xkZXIgIT09IHVuZGVmaW5lZCAmJiBob2xkZXIgIT09IHNvdXJjZUFicykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgcHJvamVjdC1kb2Mtc2l0ZTogJHtyZXBvUGF0aChzb3VyY2VBYnMsIGNvbnRleHQucmVwb1Jvb3QpfSBhbmQgJHtyZXBvUGF0aChob2xkZXIsIGNvbnRleHQucmVwb1Jvb3QpfWBcbiAgICAgICAgKyBgIGJvdGggcHJvamVjdCB0byAke3JlbGF0aXZlKHRhcmdldFJvb3QsIHRhcmdldCkuc3BsaXQoc2VwKS5qb2luKCcvJyl9LmAsXG4gICAgICApXG4gICAgfVxuICAgIC8vIEEgZmlsZSB0aGUgcHJvamVjdGlvbiBkaWQgbm90IGNsYWltIGlzIGFub3RoZXIgcHJvZHVjZXIncyBvdXRwdXQgXHUyMDE0IGluXG4gICAgLy8gdGhlIHR3aW4gcGFzcywgdGhlIGJ1aWxkIFZpdGVQcmVzcyBqdXN0IHdyb3RlLCBpbmNsdWRpbmcgYHB1YmxpYy9gXG4gICAgLy8gY29waWVzLiBPdmVyd3JpdGluZyBvbmUgd291bGQgc2lsZW50bHkgY29ycnVwdCB0aGUgc2l0ZS5cbiAgICBpZiAoaG9sZGVyID09PSB1bmRlZmluZWQgJiYgZXhpc3RzU3luYyh0YXJnZXQpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBwcm9qZWN0LWRvYy1zaXRlOiAke3JlcG9QYXRoKHNvdXJjZUFicywgY29udGV4dC5yZXBvUm9vdCl9IHdvdWxkIG92ZXJ3cml0ZSBleGlzdGluZyBidWlsZCBmaWxlYFxuICAgICAgICArIGAgJHtyZWxhdGl2ZSh0YXJnZXRSb290LCB0YXJnZXQpLnNwbGl0KHNlcCkuam9pbignLycpfS5gLFxuICAgICAgKVxuICAgIH1cbiAgICBjbGFpbWVkLnNldCh0YXJnZXQsIHNvdXJjZUFicylcbiAgfVxuXG4gIGZvciAoY29uc3QgcGFnZSBvZiBlbnRyaWVzKSB7XG4gICAgaWYgKHJvdXRlcy5oYXMocGFnZS5yb3V0ZSkpIHRocm93IG5ldyBFcnJvcihgcHJvamVjdC1kb2Mtc2l0ZTogZHVwbGljYXRlIHJvdXRlICR7SlNPTi5zdHJpbmdpZnkocGFnZS5yb3V0ZSl9LmApXG4gICAgcm91dGVzLmFkZChwYWdlLnJvdXRlKVxuICAgIGNvbnN0IHNvdXJjZUFicyA9IHJlc29sdmUoY29udGV4dC5yZXBvUm9vdCwgcGFnZS5zb3VyY2UpXG4gICAgaWYgKCFleGlzdHNTeW5jKHNvdXJjZUFicykgfHwgIWxzdGF0U3luYyhzb3VyY2VBYnMpLmlzRmlsZSgpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYHByb2plY3QtZG9jLXNpdGU6IHNvdXJjZSAke0pTT04uc3RyaW5naWZ5KHBhZ2Uuc291cmNlKX0gZG9lcyBub3QgZXhpc3Qgb3IgaXMgbm90IGEgZmlsZS5gKVxuICAgIH1cbiAgICBjb25zdCBvdXRwdXQgPSByZXNvbHZlKHRhcmdldFJvb3QsIHBhZ2Uucm91dGUpXG4gICAgLy8gQ2xhaW1lZCBiZWZvcmUgdGhlIGltYWdlcyBhcmUgcGxhY2VkOiBhIHBhZ2UgYW5kIGFuIGltYWdlIGxhbmRpbmcgb24gb25lXG4gICAgLy8gcGF0aCB3b3VsZCBvdGhlcndpc2Ugb3ZlcndyaXRlIGVhY2ggb3RoZXIgaW4gd2hpY2hldmVyIG9yZGVyIHRoZXkgcmFuLlxuICAgIGNsYWltKG91dHB1dCwgc291cmNlQWJzKVxuICAgIG1rZGlyU3luYyhkaXJuYW1lKG91dHB1dCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pXG4gICAgY29uc3QgbWFya2Rvd24gPSByZWFkRmlsZVN5bmMoc291cmNlQWJzLCAndXRmOCcpXG4gICAgY29uc3QgcHJvamVjdGVkID0gcmV3cml0ZU1hcmtkb3duKG1hcmtkb3duLCB7XG4gICAgICBzb3VyY2VQYXRoOiBwYWdlLnNvdXJjZSxcbiAgICAgIGxvY2FsZTogcGFnZS5sb2NhbGUsXG4gICAgICByb3V0ZTogcGFnZS5yb3V0ZSxcbiAgICAgIHBhZ2VzOiBjb250ZXh0LnBhZ2VzLFxuICAgICAgcmVwb1Jvb3Q6IGNvbnRleHQucmVwb1Jvb3QsXG4gICAgICByZXBvc2l0b3J5UmVmOiBjb250ZXh0LnJlcG9zaXRvcnlSZWYsXG4gICAgICBwbGFjZUltYWdlOiAoYWJzUGF0aCkgPT4ge1xuICAgICAgICBjb25zdCByZWFsID0gcHVibGlzaGFibGVJbWFnZShhYnNQYXRoLCBjb250ZXh0LnJlcG9Sb290KVxuICAgICAgICBpZiAocmVhbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgYHByb2plY3QtZG9jLXNpdGU6ICR7cGFnZS5zb3VyY2V9IHJlZmVyZW5jZXMgaW1hZ2UgJHtyZXBvUGF0aChhYnNQYXRoLCBjb250ZXh0LnJlcG9Sb290KX0sYFxuICAgICAgICAgICAgKyAnIHdoaWNoIGlzIG5vdCBhIHJlZ3VsYXIgZmlsZSBpbnNpZGUgdGhlIHJlcG9zaXRvcnkuJyxcbiAgICAgICAgICApXG4gICAgICAgIH1cbiAgICAgICAgLy8gQmVzaWRlIHRoZSBwYWdlIHRoYXQgcmVmZXJlbmNlcyBpdCwgdW5kZXIgaXRzIG93biBiYXNlbmFtZTogZWFjaFxuICAgICAgICAvLyBsb2NhbGUncyByb3V0ZSB0cmVlIGdldHMgaXRzIG93biBjb3B5LCBzbyBvbmUgcmVsYXRpdmUgVVJMIGlzIGNvcnJlY3RcbiAgICAgICAgLy8gZnJvbSBib3RoLlxuICAgICAgICBjb25zdCBuYW1lID0gYmFzZW5hbWUocmVhbClcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gcmVzb2x2ZShkaXJuYW1lKG91dHB1dCksIG5hbWUpXG4gICAgICAgIGNsYWltKHRhcmdldCwgcmVhbClcbiAgICAgICAgY29weUZpbGVTeW5jKHJlYWwsIHRhcmdldClcbiAgICAgICAgLy8gRW5jb2RlZCBiZWNhdXNlIHRoZSBkZXN0aW5hdGlvbiBpcyBhIE1hcmtkb3duIGlubGluZSB0YXJnZXQsIHdoZXJlIGFuXG4gICAgICAgIC8vIHVuZXNjYXBlZCBzcGFjZSB3b3VsZCBlbmQgaXQgZWFybHkuXG4gICAgICAgIHJldHVybiBgLi8ke2VuY29kZVVSSShuYW1lKX1gXG4gICAgICB9LFxuICAgIH0pXG4gICAgd3JpdGVGaWxlU3luYyhvdXRwdXQsIHBhZ2VDb250ZW50KHByb2plY3RlZCwgcGFnZSkpXG4gIH1cbn1cblxuLyoqIFJlYnVpbGQgdGhlIGRpc3Bvc2FibGUgVml0ZVByZXNzIHNvdXJjZSB0cmVlIGZyb20gdGhlIHB1YmxpY2F0aW9uIG1hbmlmZXN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByb2plY3REb2NzKCk6IHZvaWQge1xuICBybVN5bmMoZ2VuZXJhdGVkUm9vdCwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pXG4gIHByb2plY3RQYWdlc0ludG8oZ2VuZXJhdGVkUm9vdCwgZGVmYXVsdFByb2plY3Rpb25Db250ZXh0KCksIChtYXJrZG93biwgcGFnZSkgPT5cbiAgICBhZGRQcm9qZWN0aW9uRnJvbnRtYXR0ZXIocHJvamVjdGVkUGFnZUNvbnRlbnQobWFya2Rvd24sIHBhZ2UpLCBwYWdlKSlcbn1cblxuLyoqXG4gKiBTdHJpcCB0aGUgbGVhZGluZyBZQU1MIGZyb250bWF0dGVyIG9mIGEgcHJvamVjdGVkIHBhZ2UuXG4gKlxuICogQHBhcmFtIG1hcmtkb3duIFJld3JpdHRlbiBjYW5vbmljYWwgTWFya2Rvd24gY29udGVudC5cbiAqIEBwYXJhbSBzb3VyY2UgUmVwb3NpdG9yeS1yZWxhdGl2ZSBwYWdlIHNvdXJjZSwgbmFtZWQgYnkgdGhlIGZhaWx1cmUuXG4gKiBAcmV0dXJucyBUaGUgY29udGVudCBhZnRlciB0aGUgZnJvbnRtYXR0ZXIgYmxvY2ssIG9yIHRoZSBpbnB1dCB3aGVuIG5vbmUgb3BlbnMgaXQuXG4gKi9cbmZ1bmN0aW9uIHdpdGhvdXRGcm9udG1hdHRlcihtYXJrZG93bjogc3RyaW5nLCBzb3VyY2U6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmICghbWFya2Rvd24uc3RhcnRzV2l0aCgnLS0tXFxuJykpIHJldHVybiBtYXJrZG93blxuICBjb25zdCBjbG9zaW5nRGVsaW1pdGVyID0gJ1xcbi0tLVxcbidcbiAgY29uc3QgY2xvc2luZyA9IG1hcmtkb3duLmluZGV4T2YoY2xvc2luZ0RlbGltaXRlciwgNClcbiAgaWYgKGNsb3NpbmcgPT09IC0xKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBwcm9qZWN0LWRvYy1zaXRlOiAke0pTT04uc3RyaW5naWZ5KHNvdXJjZSl9IGhhcyB1bmNsb3NlZCBZQU1MIGZyb250bWF0dGVyLmApXG4gIH1cbiAgcmV0dXJuIG1hcmtkb3duLnNsaWNlKGNsb3NpbmcgKyBjbG9zaW5nRGVsaW1pdGVyLmxlbmd0aCkucmVwbGFjZSgvXlxcbisvLCAnJylcbn1cblxuLyoqXG4gKiBUaGUgcmF3LU1hcmtkb3duIHR3aW4gb2Ygb25lIHB1Ymxpc2hlZCBwYWdlLlxuICpcbiAqIEZyb250bWF0dGVyIGlzIFZpdGVQcmVzcyByZW5kZXJpbmcgY29uZmlndXJhdGlvbiBhbmQgaXMgZHJvcHBlZC4gQSBsb2NhbGVcbiAqIGhvbWUgcGFnZSB0aGVyZWZvcmUga2VlcHMgaXRzIGJvZHkgaGVyZSwgd2hpbGUgdGhlIHJlbmRlcmVkIHNpdGUgdHJ1bmNhdGVzXG4gKiBpdCB0byB0aGUgZnJvbnRtYXR0ZXIgcmVkaXJlY3QuXG4gKlxuICogQHBhcmFtIG1hcmtkb3duIFJld3JpdHRlbiBjYW5vbmljYWwgTWFya2Rvd24gY29udGVudC5cbiAqIEBwYXJhbSBzb3VyY2UgUmVwb3NpdG9yeS1yZWxhdGl2ZSBwYWdlIHNvdXJjZSwgbmFtZWQgYnkgZnJvbnRtYXR0ZXIgZmFpbHVyZXMuXG4gKiBAcmV0dXJucyBQbGFpbiBNYXJrZG93biB3aXRob3V0IGZyb250bWF0dGVyIG9yIHJlcG9zaXRvcnkgY2hyb21lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmF3TWFya2Rvd25QYWdlQ29udGVudChtYXJrZG93bjogc3RyaW5nLCBzb3VyY2U6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiB3aXRob3V0UmVwb3NpdG9yeUNocm9tZSh3aXRob3V0RnJvbnRtYXR0ZXIobWFya2Rvd24sIHNvdXJjZSkpXG59XG5cbi8qKlxuICogUGFyZW50LWxldmVsIGFsaWFzIHJvdXRlIG9mIGFuIGluZGV4IHJvdXRlLCBvciBgdW5kZWZpbmVkYCBmb3Igb3RoZXIgcm91dGVzLlxuICpcbiAqIFRoZSByZW5kZXJlZCBzaXRlIHNob3dzIGFuIGluZGV4IHJvdXRlIGFzIGEgZGlyZWN0b3J5IFVSTCwgc28gXCJhcHBlbmRcbiAqIGAubWRgXCIgbmF0dXJhbGx5IGxhbmRzIG9uIGA8ZGlyPi5tZGAgb25jZSB0aGUgdHJhaWxpbmcgc2xhc2ggaXMgZHJvcHBlZC5cbiAqIFRoZSByb290IGBpbmRleC5tZGAgaGFzIG5vIHBhcmVudCB0byBhbGlhcyBpbnRvLlxuICovXG5mdW5jdGlvbiBpbmRleEFsaWFzUm91dGUocm91dGU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IG1hdGNoID0gL14oLispXFwvaW5kZXhcXC5tZCQvLmV4ZWMocm91dGUpXG4gIHJldHVybiBtYXRjaD8uWzFdID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBgJHttYXRjaFsxXX0ubWRgXG59XG5cbi8qKlxuICogU2l0ZS1yZWxhdGl2ZSBNYXJrZG93biBmaWxlcyB0aGUgcmF3LU1hcmtkb3duIHByb2plY3Rpb24gZW1pdHM6IGV2ZXJ5XG4gKiByb3V0ZSwgcGx1cyBvbmUgcGFyZW50LWxldmVsIGFsaWFzIHBlciBpbmRleCByb3V0ZS5cbiAqXG4gKiBAcGFyYW0gcGFnZXMgUGFnZXMgdG8gcHJvamVjdCwgZGVmYXVsdGluZyB0byB0aGUgcHVibGljYXRpb24gbWFuaWZlc3QuXG4gKiBAcmV0dXJucyBUaGUgZW1pdHRlZCBwYXRocywgcm91dGVzIGZpcnN0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmF3TWFya2Rvd25GaWxlcyhwYWdlczogRG9jc1BhZ2VbXSA9IGRvY3NQYWdlcyk6IHN0cmluZ1tdIHtcbiAgY29uc3QgYWxpYXNlcyA9IHBhZ2VzLm1hcChwYWdlID0+IGluZGV4QWxpYXNSb3V0ZShwYWdlLnJvdXRlKSkuZmlsdGVyKGFsaWFzID0+IGFsaWFzICE9PSB1bmRlZmluZWQpXG4gIHJldHVybiBbLi4ucGFnZXMubWFwKHBhZ2UgPT4gcGFnZS5yb3V0ZSksIC4uLmFsaWFzZXNdXG59XG5cbi8qKlxuICogRW1pdCB0aGUgcmF3LU1hcmtkb3duIHR3aW4gb2YgZXZlcnkgcHVibGlzaGVkIHJvdXRlIGludG8gYSBidWlsdCBzaXRlLCBzb1xuICogc3RhdGljIGhvc3Rpbmcgc2VydmVzIHRoZSBwYWdlJ3MgVVJMLCBtaW51cyBhbnkgdHJhaWxpbmcgc2xhc2gsIHBsdXMgYC5tZGBcbiAqIGFzIHBsYWluIE1hcmtkb3duLiBFYWNoIGluZGV4IHJvdXRlIGFsc28gZW1pdHMgYSBwYXJlbnQtbGV2ZWwgYWxpYXMgdHdpbixcbiAqIHByb2plY3RlZCBvdmVyIHRoZSBhbGlhcyByb3V0ZSBzbyBpdHMgcmVsYXRpdmUgbGlua3Mgc3RheSBjb3JyZWN0LlxuICogUmVmZXJlbmNlZCBpbWFnZXMgYXJlIGNvcGllZCBiZXNpZGUgdGhlIHBhZ2VzLCBrZWVwaW5nIHRoZSBzYW1lIHJlbGF0aXZlXG4gKiBVUkxzIHZhbGlkIGluIGJvdGggdHJlZXMuIEV4aXN0aW5nIGJ1aWxkIGZpbGVzIHN0YXkgaW4gcGxhY2UsIGFuZCBhIG5hbWVcbiAqIGNvbGxpc2lvbiB3aXRoIG9uZSBmYWlscyB0aGUgZW1pc3Npb24uIE1hcmtkb3duIGZpbGVzIGNhcnJ5IGEgVVRGLTggQk9NIHNvXG4gKiBicm93c2VyIG5hdmlnYXRpb24gZGVjb2RlcyB0aGVtIGV2ZW4gd2hlbiBzdGF0aWMgaG9zdGluZyBvbWl0cyBhIGNoYXJzZXQuXG4gKlxuICogQHBhcmFtIG91dERpciBCdWlsZCBvdXRwdXQgZGlyZWN0b3J5IHRvIGVtaXQgaW50by5cbiAqIEBwYXJhbSBjb250ZXh0IE1hbmlmZXN0IGFuZCByZXBvc2l0b3J5IGlucHV0cywgZGVmYXVsdGluZyB0byB0aGlzIHJlcG9zaXRvcnkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbWl0UmF3TWFya2Rvd25QYWdlcyhvdXREaXI6IHN0cmluZywgY29udGV4dDogUHJvamVjdGlvbkNvbnRleHQgPSBkZWZhdWx0UHJvamVjdGlvbkNvbnRleHQoKSk6IHZvaWQge1xuICBjb25zdCBhbGlhc2VzID0gY29udGV4dC5wYWdlcy5mbGF0TWFwKChwYWdlKSA9PiB7XG4gICAgY29uc3QgYWxpYXMgPSBpbmRleEFsaWFzUm91dGUocGFnZS5yb3V0ZSlcbiAgICByZXR1cm4gYWxpYXMgPT09IHVuZGVmaW5lZCA/IFtdIDogW3sgLi4ucGFnZSwgcm91dGU6IGFsaWFzIH1dXG4gIH0pXG4gIHByb2plY3RQYWdlc0ludG8oXG4gICAgb3V0RGlyLFxuICAgIGNvbnRleHQsXG4gICAgKG1hcmtkb3duLCBwYWdlKSA9PiBgXFx1RkVGRiR7cmF3TWFya2Rvd25QYWdlQ29udGVudChtYXJrZG93biwgcGFnZS5zb3VyY2UpfWAsXG4gICAgWy4uLmNvbnRleHQucGFnZXMsIC4uLmFsaWFzZXNdLFxuICApXG59XG5cbi8qKlxuICogUmF3IE1hcmtkb3duIHNlcnZlZCBmb3Igb25lIHNpdGUgcm91dGUuXG4gKlxuICogRGV2LXNlcnZlciBjb3VudGVycGFydCBvZiB7QGxpbmsgZW1pdFJhd01hcmtkb3duUGFnZXN9OiBpbWFnZXMgYXJlIG5vdFxuICogY29waWVkIGJlY2F1c2UgdGhlIGdlbmVyYXRlZCB0cmVlIGFscmVhZHkgc2VydmVzIHRoZW0gYmVzaWRlIHRoZSBwYWdlLlxuICpcbiAqIEBwYXJhbSByb3V0ZSBNYW5pZmVzdCByb3V0ZSwgaW5jbHVkaW5nIGl0cyBgLm1kYCBzdWZmaXguXG4gKiBAcGFyYW0gY29udGV4dCBNYW5pZmVzdCBhbmQgcmVwb3NpdG9yeSBpbnB1dHMsIGRlZmF1bHRpbmcgdG8gdGhpcyByZXBvc2l0b3J5LlxuICogQHJldHVybnMgVGhlIHByb2plY3RlZCBwYWdlLCBvciBgdW5kZWZpbmVkYCB3aGVuIHRoZSBtYW5pZmVzdCBkb2VzIG5vdCBwdWJsaXNoIHRoZSByb3V0ZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJhd01hcmtkb3duUm91dGUocm91dGU6IHN0cmluZywgY29udGV4dDogUHJvamVjdGlvbkNvbnRleHQgPSBkZWZhdWx0UHJvamVjdGlvbkNvbnRleHQoKSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IHBhZ2UgPSBjb250ZXh0LnBhZ2VzLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5yb3V0ZSA9PT0gcm91dGUpXG4gIGlmIChwYWdlID09PSB1bmRlZmluZWQpIHJldHVybiB1bmRlZmluZWRcbiAgY29uc3QgbWFya2Rvd24gPSByZWFkRmlsZVN5bmMocmVzb2x2ZShjb250ZXh0LnJlcG9Sb290LCBwYWdlLnNvdXJjZSksICd1dGY4JylcbiAgcmV0dXJuIHJhd01hcmtkb3duUGFnZUNvbnRlbnQocmV3cml0ZU1hcmtkb3duKG1hcmtkb3duLCB7XG4gICAgc291cmNlUGF0aDogcGFnZS5zb3VyY2UsXG4gICAgbG9jYWxlOiBwYWdlLmxvY2FsZSxcbiAgICByb3V0ZTogcGFnZS5yb3V0ZSxcbiAgICBwYWdlczogY29udGV4dC5wYWdlcyxcbiAgICByZXBvUm9vdDogY29udGV4dC5yZXBvUm9vdCxcbiAgICByZXBvc2l0b3J5UmVmOiBjb250ZXh0LnJlcG9zaXRvcnlSZWYsXG4gICAgcGxhY2VJbWFnZTogYWJzUGF0aCA9PiBgLi8ke2VuY29kZVVSSShiYXNlbmFtZShhYnNQYXRoKSl9YCxcbiAgfSksIHBhZ2Uuc291cmNlKVxufVxuXG4vKiogU2l0ZSBpZGVudGl0eSB3cml0dGVuIGludG8gbGxtcy50eHQuICovXG5leHBvcnQgaW50ZXJmYWNlIExsbXNUeHRTaXRlIHtcbiAgLyoqIFNpdGUgYmFzZSBwYXRoLCBjYXJyeWluZyB0aGUgbGVhZGluZyBhbmQgdHJhaWxpbmcgc2xhc2hlcyBWaXRlUHJlc3MgcmVxdWlyZXMuICovXG4gIGJhc2U6IHN0cmluZ1xuICAvKiogU2l0ZSB0aXRsZS4gKi9cbiAgdGl0bGU6IHN0cmluZ1xuICAvKiogU2l0ZSBkZXNjcmlwdGlvbi4gKi9cbiAgZGVzY3JpcHRpb246IHN0cmluZ1xufVxuXG4vKiogTG9jYWxlIGdyb3VwcyBsbG1zLnR4dCBsaXN0cywgaW4gdGhlIG9yZGVyIHRoZSBzaXRlJ3MgbmF2aWdhdGlvbiBwcmVzZW50cyB0aGVtLiAqL1xuY29uc3QgbGxtc1R4dExvY2FsZXM6IHJlYWRvbmx5IHsgaGVhZGluZzogc3RyaW5nOyBsb2NhbGU6IERvY3NMb2NhbGUgfVtdID0gW1xuICB7IGhlYWRpbmc6ICdcdTdCODBcdTRGNTNcdTRFMkRcdTY1ODcnLCBsb2NhbGU6ICdyb290JyB9LFxuICB7IGhlYWRpbmc6ICdFbmdsaXNoJywgbG9jYWxlOiAnZW4nIH0sXG5dXG5cbi8qKlxuICogVGhlIGxsbXMudHh0IGluZGV4IG9mIGV2ZXJ5IHB1Ymxpc2hlZCBwYWdlJ3MgcmF3LU1hcmtkb3duIHR3aW4uXG4gKlxuICogTGlua3MgYXJlIHNpdGUtYWJzb2x1dGUgc28gYW4gYWdlbnQgcmVzb2x2ZXMgdGhlbSBhZ2FpbnN0IHRoZSBob3N0IGl0XG4gKiBmZXRjaGVkIGxsbXMudHh0IGZyb207IGxvY2FsZSBob21lIHBhZ2VzIHN0YXkgb3V0IGJlY2F1c2UgdGhpcyBmaWxlIGlzIHRoZVxuICogYWdlbnQtZmFjaW5nIGVudHJ5IHBvaW50IGl0c2VsZi5cbiAqXG4gKiBAcGFyYW0gc2l0ZSBTaXRlIGlkZW50aXR5IGFuZCBiYXNlIHBhdGguXG4gKiBAcmV0dXJucyBsbG1zLnR4dCBjb250ZW50IGxpc3RpbmcgYm90aCBsb2NhbGUgdHJlZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBsbG1zVHh0KHNpdGU6IExsbXNUeHRTaXRlKTogc3RyaW5nIHtcbiAgY29uc3QgbGluZXMgPSBbXG4gICAgYCMgJHtzaXRlLnRpdGxlfWAsXG4gICAgJycsXG4gICAgYD4gJHtzaXRlLmRlc2NyaXB0aW9ufWAsXG4gICAgJycsXG4gICAgJ1x1OTg3NVx1OTc2MiBVUkwgXHU1M0JCXHU2Mzg5XHU2NzJCXHU1QzNFXHU2NTlDXHU2NzYwXHU1MThEXHU1MkEwIGAubWRgIFx1NTM3M1x1NEUzQVx1OEJFNVx1OTg3NVx1NTM5Rlx1NTlDQiBNYXJrZG93bihcdTY4MzlcdThERUZcdTVGODRcdTc1MjggYC9pbmRleC5tZGApO1x1NEUwQlx1NjVCOVx1NTIxN1x1ODg2OFx1NjYyRlx1NTQwNFx1OTg3NVx1N0NCRVx1Nzg2RVx1NTczMFx1NTc0MFx1MzAwMkRyb3AgYW55IHRyYWlsaW5nIHNsYXNoIGFuZCBhcHBlbmQgYC5tZGAgdG8gYSBwYWdlIFVSTCBmb3IgaXRzIHJhdyBNYXJrZG93biAodGhlIHNpdGUgcm9vdCBpcyBgL2luZGV4Lm1kYCk7IHRoZSBsaXN0IGJlbG93IGNhcnJpZXMgdGhlIGV4YWN0IGFkZHJlc3Nlcy4nLFxuICBdXG4gIGZvciAoY29uc3QgeyBoZWFkaW5nLCBsb2NhbGUgfSBvZiBsbG1zVHh0TG9jYWxlcykge1xuICAgIGxpbmVzLnB1c2goJycsIGAjIyAke2hlYWRpbmd9YCwgJycpXG4gICAgZm9yIChjb25zdCBjb2xsZWN0aW9uIG9mIGxvY2FsZUNvbGxlY3Rpb25zW2xvY2FsZV0pIHtcbiAgICAgIGZvciAoY29uc3QgcGFnZSBvZiBvcmRlcmVkUGFnZXMobG9jYWxlLCBjb2xsZWN0aW9uKSkge1xuICAgICAgICBsaW5lcy5wdXNoKGAtIFske3BhZ2UubGFiZWx9XSgke3NpdGUuYmFzZX0ke3BhZ2Uucm91dGV9KTogJHtwYWdlLnNlY3Rpb259YClcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIGAke2xpbmVzLmpvaW4oJ1xcbicpfVxcbmBcbn1cbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL2hvbWUvdHlsZXIvZGVlcHNlZWstaGFybmVzcy9zY3JpcHRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS90eWxlci9kZWVwc2Vlay1oYXJuZXNzL3NjcmlwdHMvbWFya2Rvd24udHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL2hvbWUvdHlsZXIvZGVlcHNlZWstaGFybmVzcy9zY3JpcHRzL21hcmtkb3duLnRzXCI7LyoqIFNoYXJlZCBNYXJrZG93biBwYXJzaW5nIGFuZCBkZXB0aC1maXJzdCB0cmF2ZXJzYWwgZm9yIGRvY3VtZW50YXRpb24gZ2F0ZXMuICovXG5cbmltcG9ydCB7IGZyb21NYXJrZG93biB9IGZyb20gJ21kYXN0LXV0aWwtZnJvbS1tYXJrZG93bidcbmltcG9ydCB7IGdmbUZyb21NYXJrZG93biB9IGZyb20gJ21kYXN0LXV0aWwtZ2ZtJ1xuaW1wb3J0IHsgZ2ZtIH0gZnJvbSAnbWljcm9tYXJrLWV4dGVuc2lvbi1nZm0nXG5pbXBvcnQgdHlwZSB7IE5vZGVzIH0gZnJvbSAnbWRhc3QnXG5cbi8qKiBPbmUgYXV0aG9yZWQgTWFya2Rvd24gbGluZSBvdXRzaWRlIGZlbmNlZCBjb2RlIGFuZCByZW5kZXJlZC1hd2F5IEhUTUwgY29tbWVudHMuICovXG5leHBvcnQgaW50ZXJmYWNlIE1hcmtkb3duUHJvc2VMaW5lIHtcbiAgLyoqIDEtYmFzZWQgc291cmNlIGxpbmUgbnVtYmVyLiAqL1xuICBpbmRleDogbnVtYmVyXG4gIC8qKiBTb3VyY2UgdGV4dCB3aXRob3V0IG5vcm1hbGl6YXRpb24uICovXG4gIHJhdzogc3RyaW5nXG59XG5cbi8qKiBPbmUgcGFyc2VkIE1hcmtkb3duIGhlYWRpbmcsIHJldGFpbmluZyBpdHMgYXV0aG9yZWQgZmlyc3QgbGluZSBhbmQgcmVuZGVyZWQgdGV4dC4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgTWFya2Rvd25IZWFkaW5nTGluZSBleHRlbmRzIE1hcmtkb3duUHJvc2VMaW5lIHtcbiAgLyoqIFBhcnNlZCBBVFggb3IgU2V0ZXh0IGhlYWRpbmcgZGVwdGguICovXG4gIGRlcHRoOiAxIHwgMiB8IDMgfCA0IHwgNSB8IDZcbiAgLyoqIFJlbmRlcmVkIGhlYWRpbmcgdGV4dCwgZXhjbHVkaW5nIHJhdyBIVE1MIHN1Y2ggYXMgY29tbWVudHMuICovXG4gIHRleHQ6IHN0cmluZ1xufVxuXG4vKiogT25lIGNvZGUgYmxvY2sgZnJvbSBhIHBhcnNlZCBNYXJrZG93biBzb3VyY2UuICovXG5leHBvcnQgaW50ZXJmYWNlIE1hcmtkb3duRmVuY2Uge1xuICAvKiogMS1iYXNlZCBzb3VyY2UgbGluZSBvZiB0aGUgb3BlbmluZyBmZW5jZS4gKi9cbiAgbGluZTogbnVtYmVyXG4gIC8qKiBJbmZvLXN0cmluZyBsYW5ndWFnZSAoaXRzIGZpcnN0IHdvcmQpLCBudWxsIG9uIGEgYmFyZSBvciBpbmRlbnRlZCBibG9jay4gKi9cbiAgbGFuZzogc3RyaW5nIHwgbnVsbFxuICAvKiogRnVsbCBpbmZvIHN0cmluZyAoZS5nLiBgdHMgaWdub3JlLWNoZWNrYCksICcnIG9uIGEgYmFyZSBvciBpbmRlbnRlZCBibG9jay4gKi9cbiAgaW5mbzogc3RyaW5nXG4gIC8qKiBCbG9jayBib2R5IHdpdGhvdXQgdGhlIGZlbmNlIGRlbGltaXRlcnMuICovXG4gIGNvZGU6IHN0cmluZ1xuICAvKipcbiAgICogV2hldGhlciBhIGNsb3NpbmcgZmVuY2UgZGVsaW1pdGVyIHRlcm1pbmF0ZXMgdGhlIGJsb2NrIFx1MjAxNCBtZGFzdCBzaWxlbnRseVxuICAgKiBjbG9zZXMgYW4gdW50ZXJtaW5hdGVkIGZlbmNlIGF0IGVuZCBvZiBmaWxlLiBGYWxzZSBvbiBpbmRlbnRlZFxuICAgKiAobm9uLWZlbmNlZCkgYmxvY2tzLCB3aG9zZSBlbmQgbGluZSBpcyBjb2RlLlxuICAgKi9cbiAgY2xvc2VkOiBib29sZWFuXG59XG5cbi8qKiBQYXJzZSBHaXRIdWItZmxhdm9yZWQgTWFya2Rvd24gd2l0aCB0aGUgcmVwb3NpdG9yeSdzIHN0YW5kYXJkIGV4dGVuc2lvbnMuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VNYXJrZG93bihzb3VyY2U6IHN0cmluZyk6IE5vZGVzIHtcbiAgcmV0dXJuIGZyb21NYXJrZG93bihzb3VyY2UsIHsgZXh0ZW5zaW9uczogW2dmbSgpXSwgbWRhc3RFeHRlbnNpb25zOiBbZ2ZtRnJvbU1hcmtkb3duKCldIH0pXG59XG5cbi8qKlxuICogVmlzaXQgYSBNYXJrZG93biB0cmVlIGRlcHRoLWZpcnN0OyByZXR1cm5pbmcgZmFsc2UgcHJ1bmVzIGEgbm9kZSdzIGNoaWxkcmVuLlxuICogQHBhcmFtIG5vZGUgLSBjdXJyZW50IHRyZWUgbm9kZS5cbiAqIEBwYXJhbSB2aXNpdG9yIC0gY2FsbGJhY2sgaW52b2tlZCBiZWZvcmUgZWFjaCBub2RlJ3MgY2hpbGRyZW4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2aXNpdE1hcmtkb3duKG5vZGU6IE5vZGVzLCB2aXNpdG9yOiAobm9kZTogTm9kZXMpID0+IGJvb2xlYW4gfCB2b2lkKTogdm9pZCB7XG4gIGlmICh2aXNpdG9yKG5vZGUpID09PSBmYWxzZSkgcmV0dXJuXG4gIGlmICgnY2hpbGRyZW4nIGluIG5vZGUpIHtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHZpc2l0TWFya2Rvd24oY2hpbGQsIHZpc2l0b3IpXG4gIH1cbn1cblxuLyoqIE1hcmtkb3duIG5vZGVzIHdob3NlIGF1dGhvcmVkIGRlc3RpbmF0aW9uIG9jY3VwaWVzIGEgcmVwbGFjZWFibGUgc291cmNlIHJhbmdlLiAqL1xuZXhwb3J0IHR5cGUgTWFya2Rvd25EZXN0aW5hdGlvbk5vZGUgPSBFeHRyYWN0PE5vZGVzLCB7IHR5cGU6ICdsaW5rJyB8ICdpbWFnZScgfCAnZGVmaW5pdGlvbicgfT5cblxuLyoqIE9uZSBhdXRob3JlZCBNYXJrZG93biBkZXN0aW5hdGlvbiBhbmQgaXRzIGFic29sdXRlIHNvdXJjZSBvZmZzZXRzLiAqL1xuZXhwb3J0IGludGVyZmFjZSBNYXJrZG93bkRlc3RpbmF0aW9uIHtcbiAgc3RhcnQ6IG51bWJlclxuICBlbmQ6IG51bWJlclxuICB1cmw6IHN0cmluZ1xufVxuXG4vKiogV2hldGhlciBhIE1hcmtkb3duIFVSTCBpcyBleHRlcm5hbCwgcmVwb3NpdG9yeS1yb290IGFic29sdXRlLCBvciBwdXJlbHkgaW4tcGFnZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0V4dGVybmFsT3JBYnNvbHV0ZU1hcmtkb3duVXJsKHVybDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiB1cmwuc3RhcnRzV2l0aCgnIycpXG4gICAgfHwgdXJsLnN0YXJ0c1dpdGgoJy8vJylcbiAgICB8fCB1cmwuc3RhcnRzV2l0aCgnLycpXG4gICAgfHwgL15bYS16QS1aXVthLXpBLVowLTkrLi1dKjovLnRlc3QodXJsKVxufVxuXG4vKiogU3BsaXQgb25lIE1hcmtkb3duIFVSTCB3aXRob3V0IG5vcm1hbGl6aW5nIGl0cyBxdWVyeSBvciBmcmFnbWVudCBzdWZmaXguICovXG5leHBvcnQgZnVuY3Rpb24gc3BsaXRNYXJrZG93blVybFRhcmdldCh1cmw6IHN0cmluZyk6IHsgcGF0aDogc3RyaW5nOyBzdWZmaXg6IHN0cmluZyB9IHtcbiAgY29uc3QgYm91bmRhcnkgPSB1cmwuc2VhcmNoKC9bPyNdLylcbiAgaWYgKGJvdW5kYXJ5ID09PSAtMSkgcmV0dXJuIHsgcGF0aDogdXJsLCBzdWZmaXg6ICcnIH1cbiAgcmV0dXJuIHsgcGF0aDogdXJsLnNsaWNlKDAsIGJvdW5kYXJ5KSwgc3VmZml4OiB1cmwuc2xpY2UoYm91bmRhcnkpIH1cbn1cblxuZnVuY3Rpb24gc2tpcFdoaXRlc3BhY2Uoc291cmNlOiBzdHJpbmcsIHN0YXJ0OiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgaW5kZXggPSBzdGFydFxuICB3aGlsZSAoL1xccy8udGVzdChzb3VyY2VbaW5kZXhdID8/ICcnKSkgaW5kZXggKz0gMVxuICByZXR1cm4gaW5kZXhcbn1cblxuZnVuY3Rpb24gbGFiZWxFbmQoc291cmNlOiBzdHJpbmcpOiBudW1iZXIge1xuICBjb25zdCBmaXJzdCA9IHNvdXJjZS5pbmRleE9mKCdbJylcbiAgaWYgKGZpcnN0ID09PSAtMSkgcmV0dXJuIC0xXG4gIGxldCBkZXB0aCA9IDBcbiAgZm9yIChsZXQgaW5kZXggPSBmaXJzdDsgaW5kZXggPCBzb3VyY2UubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgY29uc3QgY2hhciA9IHNvdXJjZVtpbmRleF1cbiAgICBpZiAoY2hhciA9PT0gJ1xcXFwnKSBpbmRleCArPSAxXG4gICAgZWxzZSBpZiAoY2hhciA9PT0gJ1snKSBkZXB0aCArPSAxXG4gICAgZWxzZSBpZiAoY2hhciA9PT0gJ10nKSB7XG4gICAgICBkZXB0aCAtPSAxXG4gICAgICBpZiAoZGVwdGggPT09IDApIHJldHVybiBpbmRleFxuICAgIH1cbiAgfVxuICByZXR1cm4gLTFcbn1cblxuZnVuY3Rpb24gZGVzdGluYXRpb25SYW5nZShyYXdOb2RlOiBzdHJpbmcsIHR5cGU6IE1hcmtkb3duRGVzdGluYXRpb25Ob2RlWyd0eXBlJ10pOiB7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyIH0ge1xuICBjb25zdCBlbmRPZkxhYmVsID0gbGFiZWxFbmQocmF3Tm9kZSlcbiAgaWYgKGVuZE9mTGFiZWwgPT09IC0xKSB0aHJvdyBuZXcgRXJyb3IoYG1hcmtkb3duOiBjYW5ub3QgbG9jYXRlIGxhYmVsIGVuZCBpbiAke0pTT04uc3RyaW5naWZ5KHJhd05vZGUpfWApXG4gIGxldCBzdGFydDogbnVtYmVyXG4gIGlmICh0eXBlID09PSAnZGVmaW5pdGlvbicpIHtcbiAgICBjb25zdCBjb2xvbiA9IHJhd05vZGUuaW5kZXhPZignOicsIGVuZE9mTGFiZWwgKyAxKVxuICAgIGlmIChjb2xvbiA9PT0gLTEpIHRocm93IG5ldyBFcnJvcihgbWFya2Rvd246IGNhbm5vdCBsb2NhdGUgZGVmaW5pdGlvbiBzZXBhcmF0b3IgaW4gJHtKU09OLnN0cmluZ2lmeShyYXdOb2RlKX1gKVxuICAgIHN0YXJ0ID0gc2tpcFdoaXRlc3BhY2UocmF3Tm9kZSwgY29sb24gKyAxKVxuICB9IGVsc2Uge1xuICAgIGlmIChyYXdOb2RlW2VuZE9mTGFiZWwgKyAxXSAhPT0gJygnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYG1hcmtkb3duOiBjYW5ub3QgbG9jYXRlIGlubGluZSBkZXN0aW5hdGlvbiBpbiAke0pTT04uc3RyaW5naWZ5KHJhd05vZGUpfWApXG4gICAgfVxuICAgIHN0YXJ0ID0gc2tpcFdoaXRlc3BhY2UocmF3Tm9kZSwgZW5kT2ZMYWJlbCArIDIpXG4gIH1cbiAgaWYgKHJhd05vZGVbc3RhcnRdID09PSAnPCcpIHtcbiAgICBmb3IgKGxldCBpbmRleCA9IHN0YXJ0ICsgMTsgaW5kZXggPCByYXdOb2RlLmxlbmd0aDsgaW5kZXggKz0gMSkge1xuICAgICAgaWYgKHJhd05vZGVbaW5kZXhdID09PSAnXFxcXCcpIGluZGV4ICs9IDFcbiAgICAgIGVsc2UgaWYgKHJhd05vZGVbaW5kZXhdID09PSAnPicpIHJldHVybiB7IHN0YXJ0OiBzdGFydCArIDEsIGVuZDogaW5kZXggfVxuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoYG1hcmtkb3duOiBjYW5ub3QgbG9jYXRlIGFuZ2xlLWJyYWNrZXQgZGVzdGluYXRpb24gZW5kIGluICR7SlNPTi5zdHJpbmdpZnkocmF3Tm9kZSl9YClcbiAgfVxuICBsZXQgZGVwdGggPSAwXG4gIGZvciAobGV0IGluZGV4ID0gc3RhcnQ7IGluZGV4IDwgcmF3Tm9kZS5sZW5ndGg7IGluZGV4ICs9IDEpIHtcbiAgICBjb25zdCBjaGFyID0gcmF3Tm9kZVtpbmRleF1cbiAgICBpZiAoY2hhciA9PT0gJ1xcXFwnKSBpbmRleCArPSAxXG4gICAgZWxzZSBpZiAoY2hhciA9PT0gJygnKSBkZXB0aCArPSAxXG4gICAgZWxzZSBpZiAoY2hhciA9PT0gJyknKSB7XG4gICAgICBpZiAoZGVwdGggPT09IDApIHJldHVybiB7IHN0YXJ0LCBlbmQ6IGluZGV4IH1cbiAgICAgIGRlcHRoIC09IDFcbiAgICB9IGVsc2UgaWYgKC9cXHMvLnRlc3QoY2hhciA/PyAnJykgJiYgZGVwdGggPT09IDApIHtcbiAgICAgIHJldHVybiB7IHN0YXJ0LCBlbmQ6IGluZGV4IH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHsgc3RhcnQsIGVuZDogcmF3Tm9kZS5sZW5ndGggfVxufVxuXG4vKiogTG9jYXRlIG9uZSBwYXJzZWQgZGVzdGluYXRpb24gaW4gdGhlIG9yaWdpbmFsIE1hcmtkb3duIHdpdGhvdXQgcmVzZXJpYWxpemluZyBpdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrZG93bkRlc3RpbmF0aW9uKHNvdXJjZTogc3RyaW5nLCBub2RlOiBNYXJrZG93bkRlc3RpbmF0aW9uTm9kZSk6IE1hcmtkb3duRGVzdGluYXRpb24ge1xuICBjb25zdCBzdGFydCA9IG5vZGUucG9zaXRpb24/LnN0YXJ0Lm9mZnNldFxuICBjb25zdCBlbmQgPSBub2RlLnBvc2l0aW9uPy5lbmQub2Zmc2V0XG4gIGlmIChzdGFydCA9PT0gdW5kZWZpbmVkIHx8IGVuZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBtYXJrZG93bjogZGVzdGluYXRpb24gJHtKU09OLnN0cmluZ2lmeShub2RlLnVybCl9IGhhcyBubyBzb3VyY2Ugb2Zmc2V0c2ApXG4gIH1cbiAgY29uc3QgcmFuZ2UgPSBkZXN0aW5hdGlvblJhbmdlKHNvdXJjZS5zbGljZShzdGFydCwgZW5kKSwgbm9kZS50eXBlKVxuICBjb25zdCBhYnNvbHV0ZSA9IHsgc3RhcnQ6IHN0YXJ0ICsgcmFuZ2Uuc3RhcnQsIGVuZDogc3RhcnQgKyByYW5nZS5lbmQgfVxuICByZXR1cm4geyAuLi5hYnNvbHV0ZSwgdXJsOiBzb3VyY2Uuc2xpY2UoYWJzb2x1dGUuc3RhcnQsIGFic29sdXRlLmVuZCkgfVxufVxuXG4vKipcbiAqIEV4dHJhY3QgZXZlcnkgcGFyc2VkIGNvZGUgYmxvY2sgd2l0aCBpdHMgaW5mbyBzdHJpbmcsIGluIGRvY3VtZW50IG9yZGVyLlxuICogQHBhcmFtIHNvdXJjZSAtIE1hcmtkb3duIHNvdXJjZSB0byBzY2FuLlxuICogQHJldHVybnMgZWFjaCBibG9jaydzIG9wZW5pbmcgbGluZSwgbGFuZ3VhZ2UsIGluZm8gc3RyaW5nLCBhbmQgYm9keS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcmtkb3duRmVuY2VzKHNvdXJjZTogc3RyaW5nKTogTWFya2Rvd25GZW5jZVtdIHtcbiAgY29uc3QgbGluZXMgPSBzb3VyY2Uuc3BsaXQoJ1xcbicpXG4gIGNvbnN0IGZlbmNlczogTWFya2Rvd25GZW5jZVtdID0gW11cbiAgdmlzaXRNYXJrZG93bihwYXJzZU1hcmtkb3duKHNvdXJjZSksIChub2RlKSA9PiB7XG4gICAgaWYgKG5vZGUudHlwZSAhPT0gJ2NvZGUnIHx8IG5vZGUucG9zaXRpb24gPT09IHVuZGVmaW5lZCkgcmV0dXJuXG4gICAgY29uc3QgbGFuZyA9IG5vZGUubGFuZyA/PyBudWxsXG4gICAgY29uc3QgbWV0YSA9IG5vZGUubWV0YSA/PyAnJ1xuICAgIGNvbnN0IGluZm8gPSBsYW5nID09PSBudWxsID8gJycgOiBtZXRhID09PSAnJyA/IGxhbmcgOiBgJHtsYW5nfSAke21ldGF9YFxuICAgIGNvbnN0IGVuZExpbmUgPSBsaW5lc1tub2RlLnBvc2l0aW9uLmVuZC5saW5lIC0gMV0gPz8gJydcbiAgICBjb25zdCBjbG9zZWQgPSAvXiB7MCwzfShgezMsfXx+ezMsfSlcXHMqJC8udGVzdChlbmRMaW5lKVxuICAgIGZlbmNlcy5wdXNoKHsgbGluZTogbm9kZS5wb3NpdGlvbi5zdGFydC5saW5lLCBsYW5nLCBpbmZvLCBjb2RlOiBub2RlLnZhbHVlLCBjbG9zZWQgfSlcbiAgfSlcbiAgcmV0dXJuIGZlbmNlc1xufVxuXG4vKiogVGV4dCBhIHJlYWRlciBzZWVzIGZyb20gb25lIE1hcmtkb3duIG5vZGU7IHJhdyBIVE1MIGl0c2VsZiBjb250cmlidXRlcyBub25lLiAqL1xuZnVuY3Rpb24gcmVuZGVyZWRUZXh0KG5vZGU6IE5vZGVzKTogc3RyaW5nIHtcbiAgaWYgKG5vZGUudHlwZSA9PT0gJ3RleHQnIHx8IG5vZGUudHlwZSA9PT0gJ2lubGluZUNvZGUnKSByZXR1cm4gbm9kZS52YWx1ZVxuICBpZiAobm9kZS50eXBlID09PSAnaW1hZ2UnIHx8IG5vZGUudHlwZSA9PT0gJ2ltYWdlUmVmZXJlbmNlJykgcmV0dXJuIG5vZGUuYWx0ID8/ICcnXG4gIGlmIChub2RlLnR5cGUgPT09ICdicmVhaycpIHJldHVybiAnICdcbiAgaWYgKCdjaGlsZHJlbicgaW4gbm9kZSkgcmV0dXJuIG5vZGUuY2hpbGRyZW4ubWFwKGNoaWxkID0+IHJlbmRlcmVkVGV4dChjaGlsZCkpLmpvaW4oJycpXG4gIHJldHVybiAnJ1xufVxuXG4vKipcbiAqIFJldHVybiBldmVyeSBwYXJzZWQgTWFya2Rvd24gaGVhZGluZyB3aXRoIGl0cyByZW5kZXJlZCB0ZXh0IGFuZCBzb3VyY2UgbGluZS5cbiAqIEBwYXJhbSBzb3VyY2UgLSBNYXJrZG93biBzb3VyY2Ugd2hvc2UgaGVhZGluZ3MgYXJlIHJldHVybmVkLlxuICogQHBhcmFtIHRyZWUgLSB0aGUge0BsaW5rIHBhcnNlTWFya2Rvd259IHJlc3VsdCBmb3IgZXhhY3RseSBgc291cmNlYCwgd2hlbiB0aGUgY2FsbGVyIGFscmVhZHkgaGFzIGl0LlxuICogQHJldHVybnMgaGVhZGluZ3MgaW4gZG9jdW1lbnQgb3JkZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXJrZG93bkhlYWRpbmdMaW5lcyhzb3VyY2U6IHN0cmluZywgdHJlZTogTm9kZXMgPSBwYXJzZU1hcmtkb3duKHNvdXJjZSkpOiBNYXJrZG93bkhlYWRpbmdMaW5lW10ge1xuICBjb25zdCByYXdMaW5lcyA9IHNvdXJjZS5zcGxpdCgnXFxuJylcbiAgY29uc3QgaGVhZGluZ3M6IE1hcmtkb3duSGVhZGluZ0xpbmVbXSA9IFtdXG4gIHZpc2l0TWFya2Rvd24odHJlZSwgKG5vZGUpID0+IHtcbiAgICBpZiAobm9kZS50eXBlICE9PSAnaGVhZGluZycgfHwgbm9kZS5wb3NpdGlvbiA9PT0gdW5kZWZpbmVkKSByZXR1cm5cbiAgICBoZWFkaW5ncy5wdXNoKHtcbiAgICAgIGRlcHRoOiBub2RlLmRlcHRoLFxuICAgICAgaW5kZXg6IG5vZGUucG9zaXRpb24uc3RhcnQubGluZSxcbiAgICAgIHJhdzogcmF3TGluZXNbbm9kZS5wb3NpdGlvbi5zdGFydC5saW5lIC0gMV0gPz8gJycsXG4gICAgICB0ZXh0OiByZW5kZXJlZFRleHQobm9kZSksXG4gICAgfSlcbiAgfSlcbiAgcmV0dXJuIGhlYWRpbmdzXG59XG5cbnR5cGUgQ29sdW1uUmFuZ2UgPSByZWFkb25seSBbc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXJdXG50eXBlIE9mZnNldFJhbmdlID0gcmVhZG9ubHkgW3N0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyXVxuXG4vKiogU291cmNlLWNvbHVtbiByYW5nZXMgb2NjdXBpZWQgYnkgcGFyc2VkIEhUTUwgY29tbWVudHMsIGtleWVkIGJ5IHNvdXJjZSBsaW5lLiAqL1xuZnVuY3Rpb24gaHRtbENvbW1lbnRSYW5nZXModHJlZTogTm9kZXMsIHJhd0xpbmVzOiByZWFkb25seSBzdHJpbmdbXSk6IE1hcDxudW1iZXIsIENvbHVtblJhbmdlW10+IHtcbiAgY29uc3QgY29tbWVudHM6IE9mZnNldFJhbmdlW10gPSBbXVxuICB2aXNpdE1hcmtkb3duKHRyZWUsIChub2RlKSA9PiB7XG4gICAgaWYgKG5vZGUudHlwZSAhPT0gJ2h0bWwnIHx8IG5vZGUucG9zaXRpb24/LnN0YXJ0Lm9mZnNldCA9PT0gdW5kZWZpbmVkKSByZXR1cm5cbiAgICBsZXQgY3Vyc29yID0gMFxuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICBjb25zdCBzdGFydCA9IG5vZGUudmFsdWUuaW5kZXhPZignPCEtLScsIGN1cnNvcilcbiAgICAgIGlmIChzdGFydCA8IDApIGJyZWFrXG4gICAgICBjb25zdCBjbG9zZSA9IG5vZGUudmFsdWUuaW5kZXhPZignLS0+Jywgc3RhcnQgKyAnPCEtLScubGVuZ3RoKVxuICAgICAgY29uc3QgZW5kID0gY2xvc2UgPCAwID8gbm9kZS52YWx1ZS5sZW5ndGggOiBjbG9zZSArICctLT4nLmxlbmd0aFxuICAgICAgY29tbWVudHMucHVzaChbbm9kZS5wb3NpdGlvbi5zdGFydC5vZmZzZXQgKyBzdGFydCwgbm9kZS5wb3NpdGlvbi5zdGFydC5vZmZzZXQgKyBlbmRdKVxuICAgICAgY3Vyc29yID0gZW5kXG4gICAgfVxuICB9KVxuXG4gIGNvbnN0IHJhbmdlcyA9IG5ldyBNYXA8bnVtYmVyLCBDb2x1bW5SYW5nZVtdPigpXG4gIGxldCBsaW5lT2Zmc2V0ID0gMFxuICByYXdMaW5lcy5mb3JFYWNoKChyYXcsIGluZGV4KSA9PiB7XG4gICAgY29uc3QgbGluZUVuZCA9IGxpbmVPZmZzZXQgKyByYXcubGVuZ3RoXG4gICAgZm9yIChjb25zdCBbc3RhcnQsIGVuZF0gb2YgY29tbWVudHMpIHtcbiAgICAgIGNvbnN0IGZyb20gPSBNYXRoLm1heChzdGFydCwgbGluZU9mZnNldClcbiAgICAgIGNvbnN0IHRvID0gTWF0aC5taW4oZW5kLCBsaW5lRW5kKVxuICAgICAgY29uc3QgY292ZXJzRW1wdHlMaW5lID0gcmF3Lmxlbmd0aCA9PT0gMCAmJiBzdGFydCA8PSBsaW5lT2Zmc2V0ICYmIGVuZCA+IGxpbmVPZmZzZXRcbiAgICAgIGlmIChmcm9tIDwgdG8gfHwgY292ZXJzRW1wdHlMaW5lKSB7XG4gICAgICAgIGNvbnN0IGxpbmVSYW5nZXMgPSByYW5nZXMuZ2V0KGluZGV4ICsgMSkgPz8gW11cbiAgICAgICAgbGluZVJhbmdlcy5wdXNoKFtmcm9tIC0gbGluZU9mZnNldCwgdG8gLSBsaW5lT2Zmc2V0XSlcbiAgICAgICAgcmFuZ2VzLnNldChpbmRleCArIDEsIGxpbmVSYW5nZXMpXG4gICAgICB9XG4gICAgfVxuICAgIGxpbmVPZmZzZXQgPSBsaW5lRW5kICsgMVxuICB9KVxuICByZXR1cm4gcmFuZ2VzXG59XG5cbi8qKiBXaGV0aGVyIGEgc291cmNlIGxpbmUgcmV0YWlucyBub24td2hpdGVzcGFjZSB0ZXh0IGFmdGVyIEhUTUwgY29tbWVudHMgZGlzYXBwZWFyLiAqL1xuZnVuY3Rpb24gaGFzUmVuZGVyZWRUZXh0T3V0c2lkZUNvbW1lbnRzKHJhdzogc3RyaW5nLCByYW5nZXM6IHJlYWRvbmx5IENvbHVtblJhbmdlW10gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcbiAgaWYgKHJhbmdlcyA9PT0gdW5kZWZpbmVkKSByZXR1cm4gdHJ1ZVxuICBsZXQgY3Vyc29yID0gMFxuICBsZXQgdmlzaWJsZSA9ICcnXG4gIGZvciAoY29uc3QgW3N0YXJ0LCBlbmRdIG9mIFsuLi5yYW5nZXNdLnNvcnQoKGxlZnQsIHJpZ2h0KSA9PiBsZWZ0WzBdIC0gcmlnaHRbMF0pKSB7XG4gICAgdmlzaWJsZSArPSByYXcuc2xpY2UoY3Vyc29yLCBzdGFydClcbiAgICBjdXJzb3IgPSBNYXRoLm1heChjdXJzb3IsIGVuZClcbiAgfVxuICB2aXNpYmxlICs9IHJhdy5zbGljZShjdXJzb3IpXG4gIHJldHVybiB2aXNpYmxlLnRyaW0oKS5sZW5ndGggPiAwXG59XG5cbi8qKlxuICogUmV0dXJuIHNvdXJjZSBsaW5lcyBvdXRzaWRlIGNvZGUgYmxvY2tzIGFuZCBIVE1MIGNvbW1lbnRzLlxuICogQHBhcmFtIHNvdXJjZSAtIE1hcmtkb3duIHNvdXJjZSB3aG9zZSBwcm9zZSBzaG91bGQgYmUgcmV0YWluZWQgdmVyYmF0aW0uXG4gKiBAcGFyYW0gdHJlZSAtIHRoZSB7QGxpbmsgcGFyc2VNYXJrZG93bn0gcmVzdWx0IGZvciBleGFjdGx5IGBzb3VyY2VgLCB3aGVuIHRoZSBjYWxsZXIgYWxyZWFkeSBoYXMgaXQuXG4gKiBAcmV0dXJucyB1bmZlbmNlZCBsaW5lcyB3aXRoIHRoZWlyIG9yaWdpbmFsIDEtYmFzZWQgbG9jYXRpb25zLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWFya2Rvd25Qcm9zZUxpbmVzKHNvdXJjZTogc3RyaW5nLCB0cmVlOiBOb2RlcyA9IHBhcnNlTWFya2Rvd24oc291cmNlKSk6IE1hcmtkb3duUHJvc2VMaW5lW10ge1xuICBjb25zdCByYXdMaW5lcyA9IHNvdXJjZS5zcGxpdCgnXFxuJylcbiAgY29uc3QgY29tbWVudHMgPSBodG1sQ29tbWVudFJhbmdlcyh0cmVlLCByYXdMaW5lcylcbiAgY29uc3QgZmVuY2VkID0gbmV3IFNldDxudW1iZXI+KClcbiAgdmlzaXRNYXJrZG93bih0cmVlLCAobm9kZSkgPT4ge1xuICAgIGlmIChub2RlLnR5cGUgIT09ICdjb2RlJyB8fCBub2RlLnBvc2l0aW9uID09PSB1bmRlZmluZWQpIHJldHVyblxuICAgIGZvciAobGV0IGxpbmUgPSBub2RlLnBvc2l0aW9uLnN0YXJ0LmxpbmU7IGxpbmUgPD0gbm9kZS5wb3NpdGlvbi5lbmQubGluZTsgbGluZSArPSAxKSBmZW5jZWQuYWRkKGxpbmUpXG4gIH0pXG4gIGNvbnN0IGtlcHQ6IE1hcmtkb3duUHJvc2VMaW5lW10gPSBbXVxuICByYXdMaW5lcy5mb3JFYWNoKChyYXcsIGkpID0+IHtcbiAgICBpZiAoZmVuY2VkLmhhcyhpICsgMSkpIHJldHVyblxuICAgIGlmIChoYXNSZW5kZXJlZFRleHRPdXRzaWRlQ29tbWVudHMocmF3LCBjb21tZW50cy5nZXQoaSArIDEpKSkge1xuICAgICAga2VwdC5wdXNoKHsgaW5kZXg6IGkgKyAxLCByYXcgfSlcbiAgICB9XG4gIH0pXG4gIHJldHVybiBrZXB0XG59XG4iLCAiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9ob21lL3R5bGVyL2RlZXBzZWVrLWhhcm5lc3Mvd2Vic2l0ZVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL2hvbWUvdHlsZXIvZGVlcHNlZWstaGFybmVzcy93ZWJzaXRlL3Jhdy1tYXJrZG93bi50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vaG9tZS90eWxlci9kZWVwc2Vlay1oYXJuZXNzL3dlYnNpdGUvcmF3LW1hcmtkb3duLnRzXCI7LyoqIERldmVsb3BtZW50IHJlc3BvbnNlcyBmb3IgcHVibGlzaGVkIE1hcmtkb3duIGFuZCB0aGUgZG9jdW1lbnRhdGlvbiBpbmRleC4gKi9cbmltcG9ydCB0eXBlIHsgQ29ubmVjdCB9IGZyb20gJ3ZpdGUnXG5pbXBvcnQgeyByYXdNYXJrZG93blJvdXRlIH0gZnJvbSAnLi4vc2NyaXB0cy9wcm9qZWN0LWRvYy1zaXRlLnRzJ1xuXG4vKipcbiAqIFNlcnZlIHB1Ymxpc2hlZCBzb3VyY2UgdGV4dCB3aGlsZSBwcmVzZXJ2aW5nIFZpdGUncyBNYXJrZG93biBtb2R1bGUgaW1wb3J0cy5cbiAqIEV4cGxpY2l0IGBkc2gtcmF3PTFgIGZldGNoZXMgcmV0dXJuIDQwNCBmb3IgdW5wdWJsaXNoZWQgTWFya2Rvd24gcm91dGVzLlxuICpcbiAqIEBwYXJhbSBiYXNlIFNpdGUgVVJMIHByZWZpeCB3aXRoIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHNsYXNoZXMuXG4gKiBAcGFyYW0gaW5kZXggUmVuZGVyIHRoZSBjdXJyZW50IGxsbXMudHh0IGluZGV4LlxuICogQHJldHVybnMgTWlkZGxld2FyZSBmb3IgdGhlIFZpdGUgZGV2ZWxvcG1lbnQgc2VydmVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmF3TWFya2Rvd25NaWRkbGV3YXJlKGJhc2U6IHN0cmluZywgaW5kZXg6ICgpID0+IHN0cmluZyk6IENvbm5lY3QuTmV4dEhhbmRsZUZ1bmN0aW9uIHtcbiAgcmV0dXJuIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICAgIGlmIChyZXEudXJsID09PSB1bmRlZmluZWQgfHwgKHJlcS5tZXRob2QgIT09ICdHRVQnICYmIHJlcS5tZXRob2QgIT09ICdIRUFEJykpIHtcbiAgICAgIG5leHQoKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGxldCB1cmw6IFVSTFxuICAgIHRyeSB7XG4gICAgICB1cmwgPSBuZXcgVVJMKHJlcS51cmwsICdodHRwOi8vZG9jcy5sb2NhbCcpXG4gICAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgICAvLyBNYWxmb3JtZWQgdGFyZ2V0cyBiZWxvbmcgdG8gVml0ZSdzIHJlcXVlc3QgaGFuZGxpbmcsIG5vdCByYXctcm91dGUgbG9va3VwLlxuICAgICAgbmV4dCgpXG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgaWYgKCF1cmwucGF0aG5hbWUuc3RhcnRzV2l0aChiYXNlKSkge1xuICAgICAgbmV4dCgpXG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgY29uc3QgcGF0aCA9IHVybC5wYXRobmFtZS5zbGljZShiYXNlLmxlbmd0aClcbiAgICBjb25zdCBleHBsaWNpdCA9IHBhdGguZW5kc1dpdGgoJy5tZCcpICYmIHVybC5zZWFyY2hQYXJhbXMuZ2V0KCdkc2gtcmF3JykgPT09ICcxJ1xuICAgIGNvbnN0IGRlc3RpbmF0aW9uID0gcmVxLmhlYWRlcnNbJ3NlYy1mZXRjaC1kZXN0J11cbiAgICAvLyBTY3JpcHQgaW1wb3J0cyBhbHdheXMgYmVsb25nIHRvIFZpdGUsIGluY2x1ZGluZyBpbXBvcnRzIGNhcnJ5aW5nIGEgcXVlcnkuXG4gICAgaWYgKGRlc3RpbmF0aW9uICE9PSB1bmRlZmluZWQgJiYgZGVzdGluYXRpb24gIT09ICdkb2N1bWVudCcgJiYgIShkZXN0aW5hdGlvbiA9PT0gJ2VtcHR5JyAmJiBleHBsaWNpdCkpIHtcbiAgICAgIG5leHQoKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IGNvbnRlbnQgPSBwYXRoID09PSAnbGxtcy50eHQnID8gaW5kZXgoKSA6IHBhdGguZW5kc1dpdGgoJy5tZCcpID8gcmF3TWFya2Rvd25Sb3V0ZShwYXRoKSA6IHVuZGVmaW5lZFxuICAgIGlmIChjb250ZW50ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmICghZXhwbGljaXQpIHtcbiAgICAgICAgbmV4dCgpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgcmVzLnN0YXR1c0NvZGUgPSA0MDRcbiAgICAgIHJlcy5lbmQoKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHJlcy5zZXRIZWFkZXIoJ0NvbnRlbnQtVHlwZScsIGAke3BhdGggPT09ICdsbG1zLnR4dCcgPyAndGV4dC9wbGFpbicgOiAndGV4dC9tYXJrZG93bid9OyBjaGFyc2V0PXV0Zi04YClcbiAgICByZXMuZW5kKHJlcS5tZXRob2QgPT09ICdIRUFEJyA/IHVuZGVmaW5lZCA6IGNvbnRlbnQpXG4gIH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFFQSxTQUFTLGdCQUFBQSxlQUFjLGlCQUFBQyxzQkFBcUI7QUFDNUMsU0FBUyxXQUFBQyxnQkFBZTtBQUd4QixTQUFTLG1CQUFtQjs7O0FDR3JCLFNBQVMsc0JBQXNCLEtBQXdDO0FBQzVFLFNBQU8sTUFBTSxDQUFDLENBQUMsU0FBUyxDQUFDLEdBQUc7QUFBQTtBQUFBO0FBQUEsQ0FHN0IsQ0FBQyxJQUFJLENBQUM7QUFDUDtBQU9PLFNBQVMsdUJBQXVCLElBQTRCO0FBQ2pFLFFBQU0sU0FBUyxHQUFHLFNBQVMsTUFBTSwyQkFBMkI7QUFDNUQsTUFBSSxXQUFXLE9BQVcsT0FBTSxJQUFJLE1BQU0scUVBQXFFO0FBQy9HLEtBQUcsU0FBUyxNQUFNLDJCQUEyQixJQUFJLElBQUksU0FBUztBQUM1RCxVQUFNLE9BQU8sT0FBTyxHQUFHLElBQUk7QUFDM0IsVUFBTSxVQUFVO0FBQ2hCLFVBQU0sVUFBVTtBQUNoQixRQUFJLENBQUMsS0FBSyxTQUFTLE9BQU8sS0FBSyxDQUFDLEtBQUssU0FBUyxPQUFPLEdBQUc7QUFDdEQsWUFBTSxJQUFJLE1BQU0sc0VBQXNFO0FBQUEsSUFDeEY7QUFDQSxXQUFPLEtBQUssUUFBUSxTQUFTLHFDQUFxQyxFQUFFLFFBQVEsU0FBUyw2QkFBNkI7QUFBQSxFQUNwSDtBQUNGOzs7QUMrQkEsU0FBUyxVQUFhLE9BQWtDLFFBQXVCO0FBQzdFLFNBQU8sT0FBTyxVQUFVLFlBQVksVUFBVSxRQUFRLENBQUMsTUFBTSxRQUFRLEtBQUssSUFDckUsTUFBZ0MsTUFBTSxJQUN2QztBQUNOO0FBRUEsU0FBUyxjQUFjLE9BQW1DO0FBQ3hELFNBQU8sTUFBTSxRQUFRLFVBQVMsQ0FBQyxRQUFRLElBQUksRUFBWSxJQUFJLENBQUMsV0FBVztBQUNyRSxVQUFNLFVBQVUsS0FBSyxrQkFBa0IsU0FDbkMsU0FDQSxNQUFNLFFBQVEsS0FBSyxhQUFhLElBQUksS0FBSyxnQkFBZ0IsS0FBSyxjQUFjLE1BQU07QUFDdEYsV0FBTztBQUFBLE1BQ0w7QUFBQSxNQUNBLGVBQWUsVUFBVSxLQUFLLGVBQWUsTUFBTTtBQUFBLE1BQ25ELFFBQVEsVUFBVSxLQUFLLFFBQVEsTUFBTTtBQUFBLE1BQ3JDLE9BQU8sV0FBVyxTQUFTLEtBQUssUUFBUSxNQUFNLEtBQUssS0FBSztBQUFBLE1BQ3hELE9BQU8sS0FBSyxNQUFNLE1BQU07QUFBQSxNQUN4QixTQUFTLEtBQUssUUFBUSxNQUFNO0FBQUEsTUFDNUIsU0FBUyxLQUFLLFFBQVEsTUFBTTtBQUFBLE1BQzVCLE9BQU8sS0FBSztBQUFBLE1BQ1osR0FBSSxLQUFLLFlBQVksU0FBWSxDQUFDLElBQUksRUFBRSxTQUFTLEtBQUssUUFBUTtBQUFBLE1BQzlELEdBQUksWUFBWSxTQUFZLENBQUMsSUFBSSxFQUFFLGVBQWUsUUFBUTtBQUFBLElBQzVEO0FBQUEsRUFDRixDQUFDLENBQUM7QUFDSjtBQUVBLFNBQVMsWUFBWSxPQUFpQztBQUNwRCxTQUFPLGNBQWMsTUFBTSxJQUFJLENBQUMsU0FBUztBQUN2QyxVQUFNLGdCQUFnQixLQUFLLE9BQU8sUUFBUSxTQUFTLFFBQVE7QUFDM0QsVUFBTSxnQkFBZ0IsS0FBSyxpQkFBaUIsQ0FBQztBQUM3QyxXQUFPO0FBQUEsTUFDTCxHQUFHO0FBQUEsTUFDSCxRQUFRLEVBQUUsTUFBTSxlQUFlLElBQUksS0FBSyxPQUFPO0FBQUEsTUFDL0MsZUFBZSxFQUFFLE1BQU0sU0FBUyxJQUFJLFFBQVE7QUFBQSxNQUM1QyxlQUFlO0FBQUEsUUFDYixNQUFNLENBQUMsR0FBRyxlQUFlLEtBQUssTUFBTTtBQUFBLFFBQ3BDLElBQUksQ0FBQyxHQUFHLGVBQWUsYUFBYTtBQUFBLE1BQ3RDO0FBQUEsSUFDRjtBQUFBLEVBQ0YsQ0FBQyxDQUFDO0FBQ0o7QUFFQSxJQUFNLGVBQWUsWUFBWTtBQUFBLEVBQy9CO0FBQUEsSUFDRSxRQUFRO0FBQUEsSUFDUixPQUFPO0FBQUEsSUFDUCxPQUFPLEVBQUUsTUFBTSxvQkFBb0IsSUFBSSxtQkFBbUI7QUFBQSxJQUMxRCxTQUFTLEVBQUUsTUFBTSxNQUFNLElBQUksS0FBSztBQUFBLElBQ2hDLFNBQVMsRUFBRSxNQUFNLGdCQUFNLElBQUksT0FBTztBQUFBLElBQ2xDLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQTtBQUFBLElBQ0UsUUFBUTtBQUFBLElBQ1IsT0FBTztBQUFBLElBQ1AsT0FBTyxFQUFFLE1BQU0sdUJBQWEsSUFBSSxpQkFBaUI7QUFBQSxJQUNqRCxTQUFTLEVBQUUsTUFBTSxZQUFZLElBQUksV0FBVztBQUFBLElBQzVDLFNBQVMsRUFBRSxNQUFNLGdCQUFNLElBQUksUUFBUTtBQUFBLElBQ25DLE9BQU87QUFBQSxJQUNQLGVBQWUsQ0FBQyxpQkFBaUI7QUFBQSxFQUNuQztBQUFBLEVBQ0E7QUFBQSxJQUNFLFFBQVE7QUFBQSxJQUNSLE9BQU87QUFBQSxJQUNQLE9BQU8sRUFBRSxNQUFNLDRCQUFRLElBQUksbUJBQW1CO0FBQUEsSUFDOUMsU0FBUyxFQUFFLE1BQU0sWUFBWSxJQUFJLFdBQVc7QUFBQSxJQUM1QyxTQUFTLEVBQUUsTUFBTSxnQkFBTSxJQUFJLFFBQVE7QUFBQSxJQUNuQyxPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0E7QUFBQSxJQUNFLFFBQVE7QUFBQSxJQUNSLE9BQU87QUFBQSxJQUNQLE9BQU8sRUFBRSxNQUFNLDRCQUFRLElBQUksZ0JBQWdCO0FBQUEsSUFDM0MsU0FBUyxFQUFFLE1BQU0sWUFBWSxJQUFJLFdBQVc7QUFBQSxJQUM1QyxTQUFTLEVBQUUsTUFBTSxnQkFBTSxJQUFJLFFBQVE7QUFBQSxJQUNuQyxPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0E7QUFBQSxJQUNFLFFBQVE7QUFBQSxJQUNSLE9BQU87QUFBQSxJQUNQLE9BQU8sRUFBRSxNQUFNLDRCQUFRLElBQUkscUJBQXFCO0FBQUEsSUFDaEQsU0FBUyxFQUFFLE1BQU0sWUFBWSxJQUFJLFdBQVc7QUFBQSxJQUM1QyxTQUFTLEVBQUUsTUFBTSxnQkFBTSxJQUFJLFFBQVE7QUFBQSxJQUNuQyxPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0E7QUFBQSxJQUNFLFFBQVE7QUFBQSxJQUNSLE9BQU87QUFBQSxJQUNQLE9BQU8sRUFBRSxNQUFNLFVBQVUsSUFBSSxTQUFTO0FBQUEsSUFDdEMsU0FBUyxFQUFFLE1BQU0sWUFBWSxJQUFJLFdBQVc7QUFBQSxJQUM1QyxTQUFTLEVBQUUsTUFBTSxPQUFPLElBQUksTUFBTTtBQUFBLElBQ2xDLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQTtBQUFBLElBQ0UsUUFBUTtBQUFBLElBQ1IsT0FBTztBQUFBLElBQ1AsT0FBTyxFQUFFLE1BQU0sbUNBQWUsSUFBSSx5QkFBeUI7QUFBQSxJQUMzRCxTQUFTLEVBQUUsTUFBTSxZQUFZLElBQUksV0FBVztBQUFBLElBQzVDLFNBQVMsRUFBRSxNQUFNLHNCQUFPLElBQUksYUFBYTtBQUFBLElBQ3pDLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQTtBQUFBLElBQ0UsUUFBUTtBQUFBLElBQ1IsT0FBTztBQUFBLElBQ1AsT0FBTyxFQUFFLE1BQU0sa0NBQVMsSUFBSSxvQkFBb0I7QUFBQSxJQUNoRCxTQUFTLEVBQUUsTUFBTSxZQUFZLElBQUksV0FBVztBQUFBLElBQzVDLFNBQVMsRUFBRSxNQUFNLHNCQUFPLElBQUksYUFBYTtBQUFBLElBQ3pDLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQTtBQUFBLElBQ0UsUUFBUTtBQUFBLElBQ1IsT0FBTztBQUFBLElBQ1AsT0FBTyxFQUFFLE1BQU0sNEJBQVEsSUFBSSxpQkFBaUI7QUFBQSxJQUM1QyxTQUFTLEVBQUUsTUFBTSxZQUFZLElBQUksV0FBVztBQUFBLElBQzVDLFNBQVMsRUFBRSxNQUFNLGdCQUFNLElBQUksZUFBZTtBQUFBLElBQzFDLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQTtBQUFBLElBQ0UsUUFBUTtBQUFBLElBQ1IsT0FBTztBQUFBLElBQ1AsT0FBTyxFQUFFLE1BQU0sb0JBQVUsSUFBSSxhQUFhO0FBQUEsSUFDMUMsU0FBUyxFQUFFLE1BQU0sWUFBWSxJQUFJLFdBQVc7QUFBQSxJQUM1QyxTQUFTLEVBQUUsTUFBTSxnQkFBTSxJQUFJLGVBQWU7QUFBQSxJQUMxQyxPQUFPO0FBQUEsRUFDVDtBQUNGLENBQUM7QUFFRCxJQUFNLFVBQVUsWUFBWTtBQUFBLEVBQzFCO0FBQUEsSUFDRSxRQUFRO0FBQUEsSUFDUixPQUFPO0FBQUEsSUFDUCxPQUFPLEVBQUUsTUFBTSwyQ0FBa0IsSUFBSSw0QkFBNEI7QUFBQSxJQUNqRSxTQUFTLEVBQUUsTUFBTSxjQUFjLElBQUksYUFBYTtBQUFBLElBQ2hELFNBQVMsRUFBRSxNQUFNLGdCQUFNLElBQUksU0FBUztBQUFBLElBQ3BDLE9BQU87QUFBQSxJQUNQLGVBQWUsQ0FBQyx5QkFBeUI7QUFBQSxFQUMzQztBQUFBLEVBQ0E7QUFBQSxJQUNFLFFBQVE7QUFBQSxJQUNSLE9BQU87QUFBQSxJQUNQLE9BQU8sRUFBRSxNQUFNLGlDQUFhLElBQUksZUFBZTtBQUFBLElBQy9DLFNBQVMsRUFBRSxNQUFNLGNBQWMsSUFBSSxhQUFhO0FBQUEsSUFDaEQsU0FBUyxFQUFFLE1BQU0sZ0JBQU0sSUFBSSxTQUFTO0FBQUEsSUFDcEMsT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBO0FBQUEsSUFDRSxRQUFRO0FBQUEsSUFDUixPQUFPO0FBQUEsSUFDUCxPQUFPLEVBQUUsTUFBTSw0QkFBUSxJQUFJLHVCQUF1QjtBQUFBLElBQ2xELFNBQVMsRUFBRSxNQUFNLGNBQWMsSUFBSSxhQUFhO0FBQUEsSUFDaEQsU0FBUyxFQUFFLE1BQU0sZ0JBQU0sSUFBSSxTQUFTO0FBQUEsSUFDcEMsT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBO0FBQUEsSUFDRSxRQUFRO0FBQUEsSUFDUixPQUFPO0FBQUEsSUFDUCxPQUFPLEVBQUUsTUFBTSw4Q0FBVyxJQUFJLHNCQUFzQjtBQUFBLElBQ3BELFNBQVMsRUFBRSxNQUFNLGNBQWMsSUFBSSxhQUFhO0FBQUEsSUFDaEQsU0FBUyxFQUFFLE1BQU0sZ0JBQU0sSUFBSSxTQUFTO0FBQUEsSUFDcEMsT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBO0FBQUEsSUFDRSxRQUFRO0FBQUEsSUFDUixPQUFPO0FBQUEsSUFDUCxPQUFPLEVBQUUsTUFBTSw4Q0FBVyxJQUFJLG1CQUFtQjtBQUFBLElBQ2pELFNBQVMsRUFBRSxNQUFNLGNBQWMsSUFBSSxhQUFhO0FBQUEsSUFDaEQsU0FBUyxFQUFFLE1BQU0sNEJBQVEsSUFBSSxZQUFZO0FBQUEsSUFDekMsT0FBTztBQUFBLElBQ1AsZUFBZSxDQUFDLDZCQUE2QjtBQUFBLEVBQy9DO0FBQUEsRUFDQTtBQUFBLElBQ0UsUUFBUTtBQUFBLElBQ1IsT0FBTztBQUFBLElBQ1AsT0FBTyxFQUFFLE1BQU0sa0NBQVMsSUFBSSw0QkFBNEI7QUFBQSxJQUN4RCxTQUFTLEVBQUUsTUFBTSxjQUFjLElBQUksYUFBYTtBQUFBLElBQ2hELFNBQVMsRUFBRSxNQUFNLDRCQUFRLElBQUksWUFBWTtBQUFBLElBQ3pDLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQTtBQUFBLElBQ0UsUUFBUTtBQUFBLElBQ1IsT0FBTztBQUFBLElBQ1AsT0FBTyxFQUFFLE1BQU0sNEJBQVEsSUFBSSxlQUFlO0FBQUEsSUFDMUMsU0FBUyxFQUFFLE1BQU0sY0FBYyxJQUFJLGFBQWE7QUFBQSxJQUNoRCxTQUFTLEVBQUUsTUFBTSw0QkFBUSxJQUFJLFlBQVk7QUFBQSxJQUN6QyxPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0E7QUFBQSxJQUNFLFFBQVE7QUFBQSxJQUNSLE9BQU87QUFBQSxJQUNQLE9BQU8sRUFBRSxNQUFNLDhDQUFXLElBQUksc0JBQXNCO0FBQUEsSUFDcEQsU0FBUyxFQUFFLE1BQU0sY0FBYyxJQUFJLGFBQWE7QUFBQSxJQUNoRCxTQUFTLEVBQUUsTUFBTSxnQkFBTSxJQUFJLFdBQVc7QUFBQSxJQUN0QyxPQUFPO0FBQUEsSUFDUCxlQUFlLENBQUMsNEJBQTRCO0FBQUEsRUFDOUM7QUFBQSxFQUNBO0FBQUEsSUFDRSxRQUFRO0FBQUEsSUFDUixPQUFPO0FBQUEsSUFDUCxPQUFPLEVBQUUsTUFBTSwwQkFBVyxJQUFJLGNBQWM7QUFBQSxJQUM1QyxTQUFTLEVBQUUsTUFBTSxjQUFjLElBQUksYUFBYTtBQUFBLElBQ2hELFNBQVMsRUFBRSxNQUFNLGdCQUFNLElBQUksV0FBVztBQUFBLElBQ3RDLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQTtBQUFBLElBQ0UsUUFBUTtBQUFBLElBQ1IsT0FBTztBQUFBLElBQ1AsT0FBTyxFQUFFLE1BQU0sMkNBQWtCLElBQUksNkJBQTZCO0FBQUEsSUFDbEUsU0FBUyxFQUFFLE1BQU0sY0FBYyxJQUFJLGFBQWE7QUFBQSxJQUNoRCxTQUFTLEVBQUUsTUFBTSxnQkFBTSxJQUFJLFdBQVc7QUFBQSxJQUN0QyxPQUFPO0FBQUEsRUFDVDtBQUNGLENBQUM7QUFFRCxJQUFNLGlCQUFpQixZQUFhO0FBQUEsRUFDbEMsQ0FBQyxZQUFZLGdCQUFNLFVBQVU7QUFBQSxFQUM3QixDQUFDLHNCQUFzQixxQ0FBWSxzQkFBc0I7QUFBQSxFQUN6RCxDQUFDLCtCQUErQix1REFBZSwwQkFBMEI7QUFBQSxFQUN6RSxDQUFDLGtCQUFrQixtQkFBUyxhQUFhO0FBQUEsRUFDekMsQ0FBQyxnQkFBZ0IsbUJBQVMsV0FBVztBQUFBLEVBQ3JDLENBQUMsZ0JBQWdCLG1CQUFTLGtCQUFrQjtBQUFBLEVBQzVDLENBQUMsNkJBQTZCLDJDQUFhLHdCQUF3QjtBQUFBLEVBQ25FLENBQUMsMEJBQTBCLDJCQUFpQixxQkFBcUI7QUFDbkUsRUFBWSxJQUFJLENBQUMsQ0FBQyxNQUFNLFdBQVcsT0FBTyxHQUFHLFdBQXVCO0FBQUEsRUFDbEUsUUFBUSx3QkFBd0IsSUFBSTtBQUFBLEVBQ3BDLE9BQU8sMkJBQTJCLElBQUk7QUFBQSxFQUN0QyxPQUFPLEVBQUUsTUFBTSxXQUFXLElBQUksUUFBUTtBQUFBLEVBQ3RDLFNBQVMsRUFBRSxNQUFNLGNBQWMsSUFBSSxhQUFhO0FBQUEsRUFDaEQsU0FBUyxFQUFFLE1BQU0sbUNBQWUsSUFBSSw0QkFBNEI7QUFBQSxFQUNoRTtBQUFBLEVBQ0EsR0FBSSxTQUFTLGFBQWEsRUFBRSxlQUFlLENBQUMsc0JBQXNCLEVBQUUsSUFBSSxDQUFDO0FBQzNFLEVBQUUsQ0FBQztBQUVILElBQU0sd0JBQXdCLFlBQVk7QUFBQSxFQUN4QztBQUFBLElBQ0UsUUFBUTtBQUFBLElBQ1IsT0FBTztBQUFBLElBQ1AsT0FBTyxFQUFFLE1BQU0sdUJBQWEsSUFBSSxnQkFBZ0I7QUFBQSxJQUNoRCxTQUFTLEVBQUUsTUFBTSxnQkFBZ0IsSUFBSSxlQUFlO0FBQUEsSUFDcEQsU0FBUyxFQUFFLE1BQU0sZ0JBQU0sSUFBSSxXQUFXO0FBQUEsSUFDdEMsT0FBTztBQUFBLEVBQ1Q7QUFDRixDQUFDO0FBT0QsSUFBTSxrQkFBa0I7QUFBQSxFQUN0QixDQUFDLGdCQUFNLFlBQVk7QUFBQSxJQUNqQixDQUFDLGFBQWEsc0JBQU8sWUFBWTtBQUFBLEVBQ25DLENBQUM7QUFBQSxFQUNELENBQUMsd0NBQVUsbUJBQW1CO0FBQUEsSUFDNUIsQ0FBQyxXQUFXLGdCQUFNLE1BQU07QUFBQSxJQUN4QixDQUFDLFlBQVksc0JBQU8sUUFBUTtBQUFBLEVBQzlCLENBQUM7QUFBQSxFQUNELENBQUMsd0NBQVUsNEJBQTRCO0FBQUEsSUFDckMsQ0FBQyxjQUFjLGdCQUFNLFVBQVU7QUFBQSxJQUMvQixDQUFDLG9CQUFvQiw0QkFBUSxlQUFlO0FBQUEsSUFDNUMsQ0FBQyx3QkFBd0IsNEJBQVEsb0JBQW9CO0FBQUEsSUFDckQsQ0FBQyxvQkFBb0IsNEJBQVEsZ0JBQWdCO0FBQUEsSUFDN0MsQ0FBQyx5QkFBeUIsNEJBQVEscUJBQXFCO0FBQUEsSUFDdkQsQ0FBQyxrQkFBa0Isa0NBQVMscUJBQXFCO0FBQUEsSUFDakQsQ0FBQyxZQUFZLHNCQUFZLGVBQWU7QUFBQSxJQUN4QyxDQUFDLHdCQUF3QixnQkFBTSx5QkFBeUI7QUFBQSxFQUMxRCxDQUFDO0FBQUEsRUFDRCxDQUFDLHdDQUFVLHFCQUFxQjtBQUFBLElBQzlCLENBQUMsb0JBQW9CLGdDQUFZLGVBQWU7QUFBQSxJQUNoRCxDQUFDLGtCQUFrQixzQkFBWSxnQkFBZ0I7QUFBQSxJQUMvQyxDQUFDLG9CQUFvQixrQ0FBUyxnQkFBZ0I7QUFBQSxJQUM5QyxDQUFDLGlCQUFpQixrQ0FBUyxZQUFZO0FBQUEsRUFDekMsQ0FBQztBQUFBLEVBQ0QsQ0FBQyxrQ0FBUyx1QkFBdUI7QUFBQSxJQUMvQixDQUFDLFlBQVksZ0JBQU0sT0FBTztBQUFBLElBQzFCLENBQUMsWUFBWSxxQkFBVyxnQkFBZ0I7QUFBQSxJQUN4QyxDQUFDLGlCQUFpQixzQkFBTyxjQUFjO0FBQUEsSUFDdkMsQ0FBQyxlQUFlLG9CQUFVLGNBQWM7QUFBQSxJQUN4QyxDQUFDLFdBQVcsNEJBQVEsaUJBQWlCO0FBQUEsSUFDckMsQ0FBQyxpQkFBaUIsNEJBQVEsWUFBWTtBQUFBLElBQ3RDLENBQUMsVUFBVSxvQkFBVSxnQkFBZ0I7QUFBQSxJQUNyQyxDQUFDLGtCQUFrQiwwQkFBVyxhQUFhO0FBQUEsSUFDM0MsQ0FBQyxVQUFVLG9CQUFVLFlBQVk7QUFBQSxJQUNqQyxDQUFDLGFBQWEsZ0JBQU0sUUFBUTtBQUFBLElBQzVCLENBQUMsZUFBZSxzQkFBTyxXQUFXO0FBQUEsSUFDbEMsQ0FBQyxlQUFlLDRCQUFRLFdBQVc7QUFBQSxFQUNyQyxDQUFDO0FBQUEsRUFDRCxDQUFDLGtDQUFTLDBCQUEwQjtBQUFBLElBQ2xDLENBQUMsZUFBZSxnQkFBTSxXQUFXO0FBQUEsSUFDakMsQ0FBQyx5QkFBeUIsNEJBQVEsb0JBQW9CO0FBQUEsSUFDdEQsQ0FBQyxjQUFjLGdCQUFNLFlBQVk7QUFBQSxJQUNqQyxDQUFDLFdBQVcsNEJBQVEsV0FBVztBQUFBLElBQy9CLENBQUMscUJBQXFCLDRCQUFRLGtCQUFrQjtBQUFBLElBQ2hELENBQUMsZUFBZSxnQkFBTSxnQkFBZ0I7QUFBQSxJQUN0QyxDQUFDLFdBQVcsZ0JBQU0sT0FBTztBQUFBLElBQ3pCLENBQUMsZUFBZSw0QkFBUSxxQkFBcUI7QUFBQSxFQUMvQyxDQUFDO0FBQUEsRUFDRCxDQUFDLGtDQUFTLHVCQUF1QjtBQUFBLElBQy9CLENBQUMsaUJBQWlCLDJCQUFZLGFBQWE7QUFBQSxJQUMzQyxDQUFDLGlCQUFpQiwyQkFBaUIseUJBQXlCO0FBQUEsSUFDNUQsQ0FBQyxxQkFBcUIsa0NBQVMsZ0JBQWdCO0FBQUEsSUFDL0MsQ0FBQyxZQUFZLDRCQUFhLGNBQWM7QUFBQSxJQUN4QyxDQUFDLHVCQUF1QixrQ0FBUyxrQkFBa0I7QUFBQSxJQUNuRCxDQUFDLG9CQUFvQix3QkFBYyxlQUFlO0FBQUEsSUFDbEQsQ0FBQyxtQkFBbUIsNkJBQW1CLHVCQUF1QjtBQUFBLElBQzlELENBQUMsYUFBYSxVQUFVLFFBQVE7QUFBQSxJQUNoQyxDQUFDLGNBQWMsZ0JBQU0sU0FBUztBQUFBLElBQzlCLENBQUMsZ0JBQWdCLHNCQUFPLFlBQVk7QUFBQSxJQUNwQyxDQUFDLGVBQWUsNEJBQVEsZUFBZTtBQUFBLElBQ3ZDLENBQUMsa0JBQWtCLDRCQUFRLGtCQUFrQjtBQUFBLEVBQy9DLENBQUM7QUFDSDtBQUVBLElBQU0sc0JBQXNCLGdCQUFnQixRQUFRLENBQUMsQ0FBQyxhQUFhLFdBQVcsS0FBSyxNQUFNO0FBQUEsRUFDdkYsTUFBTSxJQUFJLENBQUMsQ0FBQyxNQUFNLFdBQVcsT0FBTyxHQUFHLFdBQXVCO0FBQUEsSUFDNUQsUUFBUSxtQkFBbUIsSUFBSTtBQUFBLElBQy9CLE9BQU8sU0FBUyxjQUFjLGtDQUFrQyx3QkFBd0IsSUFBSTtBQUFBLElBQzVGLE9BQU8sRUFBRSxNQUFNLFdBQVcsSUFBSSxRQUFRO0FBQUEsSUFDdEMsU0FBUyxFQUFFLE1BQU0sZ0JBQWdCLElBQUksZUFBZTtBQUFBLElBQ3BELFNBQVMsRUFBRSxNQUFNLGFBQWEsSUFBSSxVQUFVO0FBQUEsSUFDNUM7QUFBQTtBQUFBLElBRUEsU0FBUyxDQUFDLEdBQUcsQ0FBQztBQUFBLElBQ2QsR0FBSSxTQUFTLGNBQWMsRUFBRSxlQUFlLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDO0FBQUEsRUFDdkUsRUFBRTtBQUNKLENBQUM7QUFFRCxJQUFNLFlBQVk7QUFBQTtBQUFBO0FBQUEsRUFHaEIsR0FBRyxZQUFhO0FBQUEsSUFDZCxDQUFDLHdCQUF3QixzQkFBc0IsZ0JBQU0sZ0JBQWdCLENBQUM7QUFBQSxFQUN4RSxFQUFZLElBQUksQ0FBQyxDQUFDLFFBQVEsT0FBTyxXQUFXLFNBQVMsS0FBSyxPQUFtQjtBQUFBLElBQzNFO0FBQUEsSUFDQTtBQUFBLElBQ0EsT0FBTyxFQUFFLE1BQU0sV0FBVyxJQUFJLFFBQVE7QUFBQSxJQUN0QyxTQUFTLEVBQUUsTUFBTSxnQkFBZ0IsSUFBSSxlQUFlO0FBQUEsSUFDcEQsU0FBUyxFQUFFLE1BQU0sZ0JBQU0sSUFBSSxXQUFXO0FBQUEsSUFDdEM7QUFBQSxFQUNGLEVBQUUsQ0FBQztBQUFBLEVBQ0gsR0FBRyxZQUFhO0FBQUEsSUFDZCxDQUFDLDRCQUE0QixpQ0FBaUMsNEJBQVEsdUJBQXVCLENBQUM7QUFBQSxJQUM5RixDQUFDLDJCQUEyQixnQ0FBZ0Msa0NBQWMsbUJBQW1CLENBQUM7QUFBQSxJQUM5RixDQUFDLG1DQUFtQyx3Q0FBd0MscUJBQVcsa0JBQWtCLENBQUM7QUFBQSxJQUMxRyxDQUFDLHVCQUF1Qiw0QkFBNEIsZUFBZSxlQUFlLENBQUM7QUFBQSxFQUNyRixFQUFZLElBQUksQ0FBQyxDQUFDLFFBQVEsT0FBTyxXQUFXLFNBQVMsS0FBSyxPQUFtQjtBQUFBLElBQzNFO0FBQUEsSUFDQTtBQUFBLElBQ0EsT0FBTyxFQUFFLE1BQU0sV0FBVyxJQUFJLFFBQVE7QUFBQSxJQUN0QyxTQUFTLEVBQUUsTUFBTSxnQkFBZ0IsSUFBSSxlQUFlO0FBQUEsSUFDcEQsU0FBUyxFQUFFLE1BQU0sZ0JBQU0sSUFBSSxXQUFXO0FBQUEsSUFDdEM7QUFBQSxFQUNGLEVBQUUsQ0FBQztBQUFBLEVBQ0gsR0FBRyxZQUFhO0FBQUEsSUFDZCxDQUFDLDBCQUEwQiwrQkFBK0IsNEJBQVEsc0JBQXNCO0FBQUEsSUFDeEYsQ0FBQyx3QkFBd0IsNkJBQTZCLGVBQWUsY0FBYztBQUFBLElBQ25GLENBQUMsK0JBQStCLG9DQUFvQyxrQ0FBUyxzQkFBc0IsTUFBTTtBQUFBLElBQ3pHLENBQUMsNENBQTRDLGlEQUFpRCxvREFBWSwwQkFBMEI7QUFBQSxFQUN0SSxFQUFZLElBQUksQ0FBQyxDQUFDLFFBQVEsT0FBTyxXQUFXLFNBQVMsT0FBTyxHQUFHLFdBQXVCO0FBQUEsSUFDcEY7QUFBQSxJQUNBO0FBQUEsSUFDQSxPQUFPLEVBQUUsTUFBTSxXQUFXLElBQUksUUFBUTtBQUFBLElBQ3RDLFNBQVMsRUFBRSxNQUFNLGdCQUFnQixJQUFJLGVBQWU7QUFBQSxJQUNwRCxTQUFTLEVBQUUsTUFBTSw0QkFBUSxJQUFJLHNCQUFzQjtBQUFBLElBQ25EO0FBQUEsSUFDQSxHQUFJLFlBQVksU0FBWSxDQUFDLElBQUksRUFBRSxRQUFRO0FBQUEsRUFDN0MsRUFBRSxDQUFDO0FBQUEsRUFDSCxHQUFHLFlBQWE7QUFBQSxJQUNkLENBQUMsY0FBYyxXQUFXLFNBQVM7QUFBQSxJQUNuQyxDQUFDLGFBQWEsVUFBVSxRQUFRO0FBQUEsSUFDaEMsQ0FBQyxZQUFZLFNBQVMsT0FBTztBQUFBLElBQzdCLENBQUMsZUFBZSxtQkFBbUIsaUJBQWlCO0FBQUEsSUFDcEQsQ0FBQyxjQUFjLFdBQVcsU0FBUztBQUFBLEVBQ3JDLEVBQVksSUFBSSxDQUFDLENBQUMsTUFBTSxXQUFXLE9BQU8sR0FBRyxXQUF1QjtBQUFBLElBQ2xFLFFBQVEsbUJBQW1CLElBQUk7QUFBQSxJQUMvQixPQUFPLHdCQUF3QixJQUFJO0FBQUEsSUFDbkMsT0FBTyxFQUFFLE1BQU0sV0FBVyxJQUFJLFFBQVE7QUFBQSxJQUN0QyxTQUFTLEVBQUUsTUFBTSxnQkFBZ0IsSUFBSSxlQUFlO0FBQUEsSUFDcEQsU0FBUyxFQUFFLE1BQU0sY0FBYyxJQUFJLGtCQUFrQjtBQUFBLElBQ3JEO0FBQUEsRUFDRixFQUFFLENBQUM7QUFBQSxFQUNILEdBQUcsY0FBZTtBQUFBLElBQ2hCLENBQUMsZ0JBQWdCLGtDQUFTLG1CQUFtQjtBQUFBLEVBQy9DLEVBQVksSUFBSSxDQUFDLENBQUMsTUFBTSxXQUFXLE9BQU8sR0FBRyxXQUF5QjtBQUFBLElBQ3BFLFFBQVEsbUJBQW1CLElBQUk7QUFBQSxJQUMvQixPQUFPLHdCQUF3QixJQUFJO0FBQUEsSUFDbkMsZUFBZTtBQUFBLElBQ2YsT0FBTyxFQUFFLE1BQU0sV0FBVyxJQUFJLFFBQVE7QUFBQSxJQUN0QyxTQUFTLEVBQUUsTUFBTSxnQkFBZ0IsSUFBSSxlQUFlO0FBQUEsSUFDcEQsU0FBUyxFQUFFLE1BQU0sY0FBYyxJQUFJLGtCQUFrQjtBQUFBLElBQ3JELE9BQU8sUUFBUTtBQUFBLEVBQ2pCLEVBQUUsQ0FBQztBQUFBLEVBQ0gsR0FBRyxZQUFhO0FBQUEsSUFDZCxDQUFDLHVCQUF1Qix3QkFBYyxrQkFBa0I7QUFBQSxJQUN4RCxDQUFDLG9CQUFvQixxQkFBVyxlQUFlO0FBQUEsSUFDL0MsQ0FBQyw0QkFBNEIsNEJBQWtCLHVCQUF1QjtBQUFBLElBQ3RFLENBQUMsNkJBQTZCLGtDQUFTLHdCQUF3QjtBQUFBLElBQy9ELENBQUMseUJBQXlCLDRCQUFRLG9CQUFvQjtBQUFBLEVBQ3hELEVBQVksSUFBSSxDQUFDLENBQUMsTUFBTSxXQUFXLE9BQU8sR0FBRyxXQUF1QjtBQUFBLElBQ2xFLFFBQVEsaUJBQWlCLElBQUk7QUFBQSxJQUM3QixPQUFPLHNCQUFzQixJQUFJO0FBQUEsSUFDakMsT0FBTyxFQUFFLE1BQU0sV0FBVyxJQUFJLFFBQVE7QUFBQSxJQUN0QyxTQUFTLEVBQUUsTUFBTSxnQkFBZ0IsSUFBSSxlQUFlO0FBQUEsSUFDcEQsU0FBUyxFQUFFLE1BQU0sNEJBQVEsSUFBSSxXQUFXO0FBQUEsSUFDeEM7QUFBQSxFQUNGLEVBQUUsQ0FBQztBQUNMO0FBT08sSUFBTSxvQkFBb0I7QUFBQSxFQUMvQixNQUFNLENBQUMsWUFBWSxjQUFjLGNBQWM7QUFBQSxFQUMvQyxJQUFJLENBQUMsWUFBWSxjQUFjLGNBQWM7QUFDL0M7QUFnQkEsSUFBTSxXQUF1RDtBQUFBLEVBQzNELE1BQU07QUFBQSxJQUNKLEVBQUUsT0FBTyxlQUFLO0FBQUEsSUFBRyxFQUFFLE9BQU8sTUFBTTtBQUFBLElBQUcsRUFBRSxPQUFPLHFCQUFNO0FBQUEsSUFBRyxFQUFFLE9BQU8sZUFBSztBQUFBLElBQ25FLEVBQUUsT0FBTyxlQUFLO0FBQUEsSUFBRyxFQUFFLE9BQU8sMkJBQU87QUFBQSxJQUFHLEVBQUUsT0FBTyxlQUFLO0FBQUEsSUFBRyxFQUFFLE9BQU8sa0NBQWM7QUFBQSxJQUM1RSxFQUFFLE9BQU8sZUFBSztBQUFBLElBQUcsRUFBRSxPQUFPLDJCQUFPO0FBQUEsSUFBRyxFQUFFLE9BQU8sYUFBYTtBQUFBLElBQUcsRUFBRSxPQUFPLDJCQUFPO0FBQUEsSUFDN0UsRUFBRSxPQUFPLGVBQUs7QUFBQSxJQUNkLEVBQUUsT0FBTyx3Q0FBVSxXQUFXLEtBQUs7QUFBQSxJQUNuQyxFQUFFLE9BQU8sd0NBQVUsV0FBVyxLQUFLO0FBQUEsSUFDbkMsRUFBRSxPQUFPLHdDQUFVLFdBQVcsS0FBSztBQUFBLElBQ25DLEVBQUUsT0FBTyxrQ0FBUyxXQUFXLEtBQUs7QUFBQSxJQUNsQyxFQUFFLE9BQU8sa0NBQVMsV0FBVyxLQUFLO0FBQUEsSUFDbEMsRUFBRSxPQUFPLGtDQUFTLFdBQVcsS0FBSztBQUFBLEVBQ3BDO0FBQUEsRUFDQSxJQUFJO0FBQUEsSUFDRixFQUFFLE9BQU8sUUFBUTtBQUFBLElBQUcsRUFBRSxPQUFPLE1BQU07QUFBQSxJQUFHLEVBQUUsT0FBTyxhQUFhO0FBQUEsSUFBRyxFQUFFLE9BQU8sZUFBZTtBQUFBLElBQ3ZGLEVBQUUsT0FBTyxTQUFTO0FBQUEsSUFBRyxFQUFFLE9BQU8sWUFBWTtBQUFBLElBQUcsRUFBRSxPQUFPLFdBQVc7QUFBQSxJQUFHLEVBQUUsT0FBTyw0QkFBNEI7QUFBQSxJQUN6RyxFQUFFLE9BQU8sV0FBVztBQUFBLElBQUcsRUFBRSxPQUFPLHNCQUFzQjtBQUFBLElBQUcsRUFBRSxPQUFPLGtCQUFrQjtBQUFBLElBQUcsRUFBRSxPQUFPLFdBQVc7QUFBQSxJQUMzRyxFQUFFLE9BQU8sV0FBVztBQUFBLElBQ3BCLEVBQUUsT0FBTyxtQkFBbUIsV0FBVyxLQUFLO0FBQUEsSUFDNUMsRUFBRSxPQUFPLDRCQUE0QixXQUFXLEtBQUs7QUFBQSxJQUNyRCxFQUFFLE9BQU8scUJBQXFCLFdBQVcsS0FBSztBQUFBLElBQzlDLEVBQUUsT0FBTyx1QkFBdUIsV0FBVyxLQUFLO0FBQUEsSUFDaEQsRUFBRSxPQUFPLDBCQUEwQixXQUFXLEtBQUs7QUFBQSxJQUNuRCxFQUFFLE9BQU8sdUJBQXVCLFdBQVcsS0FBSztBQUFBLEVBQ2xEO0FBQ0Y7QUFZTyxTQUFTLFlBQVksUUFBb0IsT0FBZ0Q7QUFDOUYsUUFBTSxXQUFXLFNBQVMsTUFBTTtBQUNoQyxRQUFNLFVBQVUsU0FBUyxLQUFLLGVBQWEsVUFBVSxVQUFVLEtBQUs7QUFDcEUsTUFBSSxZQUFZLE9BQVcsT0FBTSxJQUFJLE1BQU0sb0JBQW9CLEtBQUssNkJBQTZCLE1BQU0sVUFBVTtBQUNqSCxTQUFPLEVBQUUsR0FBRyxTQUFTLE9BQU8sU0FBUyxRQUFRLE9BQU8sRUFBRTtBQUN4RDtBQUdPLElBQU0sWUFBd0I7QUFBQSxFQUNuQyxHQUFHO0FBQUEsRUFDSCxHQUFHO0FBQUEsRUFDSCxHQUFHO0FBQUEsRUFDSCxHQUFHO0FBQUEsRUFDSCxHQUFHO0FBQUEsRUFDSCxHQUFHO0FBQ0w7QUFTTyxTQUFTLGFBQWEsUUFBb0IsWUFBcUM7QUFDcEYsU0FBTyxVQUNKLE9BQU8sVUFBUSxLQUFLLFdBQVcsVUFBVSxLQUFLLFlBQVksVUFBVSxFQUNwRSxLQUFLLENBQUMsTUFBTSxVQUNYLFlBQVksUUFBUSxLQUFLLE9BQU8sRUFBRSxRQUFRLFlBQVksUUFBUSxNQUFNLE9BQU8sRUFBRSxTQUMxRSxLQUFLLFFBQVEsTUFBTSxLQUN2QjtBQUNMO0FBUU8sU0FBUyxVQUFVLE9BQXVCO0FBQy9DLFNBQU8sSUFBSSxNQUFNLFFBQVEsbUJBQW1CLEVBQUUsQ0FBQztBQUNqRDtBQWNPLFNBQVMsWUFBWSxRQUFvQixZQUFpQztBQUMvRSxRQUFNLFFBQVEsYUFBYSxRQUFRLFVBQVUsRUFBRSxDQUFDO0FBQ2hELE1BQUksVUFBVSxPQUFXLE9BQU0sSUFBSSxNQUFNLHVCQUF1QixVQUFVLHNCQUFzQjtBQUNoRyxTQUFPLFVBQVUsTUFBTSxLQUFLO0FBQzlCOzs7QUNwa0JBO0FBQUEsRUFDRTtBQUFBLEVBQWM7QUFBQSxFQUFZO0FBQUEsRUFBVztBQUFBLEVBQVc7QUFBQSxFQUFjO0FBQUEsRUFBYztBQUFBLEVBQVE7QUFBQSxFQUFVO0FBQUEsT0FDekY7QUFDUCxTQUFTLFVBQVUsU0FBUyxTQUFTLE9BQU8sVUFBVSxTQUFTLFdBQVc7QUFDMUUsU0FBUyxnQkFBQUMscUJBQW9CO0FBQzdCLFNBQVMsbUJBQUFDLHdCQUF1QjtBQUNoQyxTQUFTLE9BQUFDLFlBQVc7OztBQ2RwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFpRWIsU0FBUyxnQ0FBZ0MsS0FBc0I7QUFDcEUsU0FBTyxJQUFJLFdBQVcsR0FBRyxLQUNwQixJQUFJLFdBQVcsSUFBSSxLQUNuQixJQUFJLFdBQVcsR0FBRyxLQUNsQiw0QkFBNEIsS0FBSyxHQUFHO0FBQzNDO0FBR08sU0FBUyx1QkFBdUIsS0FBK0M7QUFDcEYsUUFBTSxXQUFXLElBQUksT0FBTyxNQUFNO0FBQ2xDLE1BQUksYUFBYSxHQUFJLFFBQU8sRUFBRSxNQUFNLEtBQUssUUFBUSxHQUFHO0FBQ3BELFNBQU8sRUFBRSxNQUFNLElBQUksTUFBTSxHQUFHLFFBQVEsR0FBRyxRQUFRLElBQUksTUFBTSxRQUFRLEVBQUU7QUFDckU7QUFFQSxTQUFTLGVBQWUsUUFBZ0IsT0FBdUI7QUFDN0QsTUFBSSxRQUFRO0FBQ1osU0FBTyxLQUFLLEtBQUssT0FBTyxLQUFLLEtBQUssRUFBRSxFQUFHLFVBQVM7QUFDaEQsU0FBTztBQUNUO0FBRUEsU0FBUyxTQUFTLFFBQXdCO0FBQ3hDLFFBQU0sUUFBUSxPQUFPLFFBQVEsR0FBRztBQUNoQyxNQUFJLFVBQVUsR0FBSSxRQUFPO0FBQ3pCLE1BQUksUUFBUTtBQUNaLFdBQVMsUUFBUSxPQUFPLFFBQVEsT0FBTyxRQUFRLFNBQVMsR0FBRztBQUN6RCxVQUFNLE9BQU8sT0FBTyxLQUFLO0FBQ3pCLFFBQUksU0FBUyxLQUFNLFVBQVM7QUFBQSxhQUNuQixTQUFTLElBQUssVUFBUztBQUFBLGFBQ3ZCLFNBQVMsS0FBSztBQUNyQixlQUFTO0FBQ1QsVUFBSSxVQUFVLEVBQUcsUUFBTztBQUFBLElBQzFCO0FBQUEsRUFDRjtBQUNBLFNBQU87QUFDVDtBQUVBLFNBQVMsaUJBQWlCLFNBQWlCLE1BQXVFO0FBQ2hILFFBQU0sYUFBYSxTQUFTLE9BQU87QUFDbkMsTUFBSSxlQUFlLEdBQUksT0FBTSxJQUFJLE1BQU0sd0NBQXdDLEtBQUssVUFBVSxPQUFPLENBQUMsRUFBRTtBQUN4RyxNQUFJO0FBQ0osTUFBSSxTQUFTLGNBQWM7QUFDekIsVUFBTSxRQUFRLFFBQVEsUUFBUSxLQUFLLGFBQWEsQ0FBQztBQUNqRCxRQUFJLFVBQVUsR0FBSSxPQUFNLElBQUksTUFBTSxtREFBbUQsS0FBSyxVQUFVLE9BQU8sQ0FBQyxFQUFFO0FBQzlHLFlBQVEsZUFBZSxTQUFTLFFBQVEsQ0FBQztBQUFBLEVBQzNDLE9BQU87QUFDTCxRQUFJLFFBQVEsYUFBYSxDQUFDLE1BQU0sS0FBSztBQUNuQyxZQUFNLElBQUksTUFBTSxpREFBaUQsS0FBSyxVQUFVLE9BQU8sQ0FBQyxFQUFFO0FBQUEsSUFDNUY7QUFDQSxZQUFRLGVBQWUsU0FBUyxhQUFhLENBQUM7QUFBQSxFQUNoRDtBQUNBLE1BQUksUUFBUSxLQUFLLE1BQU0sS0FBSztBQUMxQixhQUFTLFFBQVEsUUFBUSxHQUFHLFFBQVEsUUFBUSxRQUFRLFNBQVMsR0FBRztBQUM5RCxVQUFJLFFBQVEsS0FBSyxNQUFNLEtBQU0sVUFBUztBQUFBLGVBQzdCLFFBQVEsS0FBSyxNQUFNLElBQUssUUFBTyxFQUFFLE9BQU8sUUFBUSxHQUFHLEtBQUssTUFBTTtBQUFBLElBQ3pFO0FBQ0EsVUFBTSxJQUFJLE1BQU0sNERBQTRELEtBQUssVUFBVSxPQUFPLENBQUMsRUFBRTtBQUFBLEVBQ3ZHO0FBQ0EsTUFBSSxRQUFRO0FBQ1osV0FBUyxRQUFRLE9BQU8sUUFBUSxRQUFRLFFBQVEsU0FBUyxHQUFHO0FBQzFELFVBQU0sT0FBTyxRQUFRLEtBQUs7QUFDMUIsUUFBSSxTQUFTLEtBQU0sVUFBUztBQUFBLGFBQ25CLFNBQVMsSUFBSyxVQUFTO0FBQUEsYUFDdkIsU0FBUyxLQUFLO0FBQ3JCLFVBQUksVUFBVSxFQUFHLFFBQU8sRUFBRSxPQUFPLEtBQUssTUFBTTtBQUM1QyxlQUFTO0FBQUEsSUFDWCxXQUFXLEtBQUssS0FBSyxRQUFRLEVBQUUsS0FBSyxVQUFVLEdBQUc7QUFDL0MsYUFBTyxFQUFFLE9BQU8sS0FBSyxNQUFNO0FBQUEsSUFDN0I7QUFBQSxFQUNGO0FBQ0EsU0FBTyxFQUFFLE9BQU8sS0FBSyxRQUFRLE9BQU87QUFDdEM7QUFHTyxTQUFTLG9CQUFvQixRQUFnQixNQUFvRDtBQUN0RyxRQUFNLFFBQVEsS0FBSyxVQUFVLE1BQU07QUFDbkMsUUFBTSxNQUFNLEtBQUssVUFBVSxJQUFJO0FBQy9CLE1BQUksVUFBVSxVQUFhLFFBQVEsUUFBVztBQUM1QyxVQUFNLElBQUksTUFBTSx5QkFBeUIsS0FBSyxVQUFVLEtBQUssR0FBRyxDQUFDLHdCQUF3QjtBQUFBLEVBQzNGO0FBQ0EsUUFBTSxRQUFRLGlCQUFpQixPQUFPLE1BQU0sT0FBTyxHQUFHLEdBQUcsS0FBSyxJQUFJO0FBQ2xFLFFBQU0sV0FBVyxFQUFFLE9BQU8sUUFBUSxNQUFNLE9BQU8sS0FBSyxRQUFRLE1BQU0sSUFBSTtBQUN0RSxTQUFPLEVBQUUsR0FBRyxVQUFVLEtBQUssT0FBTyxNQUFNLFNBQVMsT0FBTyxTQUFTLEdBQUcsRUFBRTtBQUN4RTs7O0FEdkpBLElBQU0sbUNBQW1DO0FBeUJ6QyxJQUFNLGlCQUFpQjtBQUN2QixJQUFNLE9BQU8sUUFBUSxrQ0FBcUIsSUFBSTtBQUM5QyxJQUFNLGdCQUFnQixRQUFRLE1BQU0sb0JBQW9CO0FBUWpELFNBQVMscUJBQXFCLGFBQXdDO0FBQzNFLFNBQU8sWUFBWSx1QkFBdUI7QUFDNUM7QUE2QkEsU0FBUyxTQUFTLFNBQWlCLFVBQTBCO0FBQzNELFNBQU8sU0FBUyxVQUFVLE9BQU8sRUFBRSxNQUFNLEdBQUcsRUFBRSxLQUFLLEdBQUc7QUFDeEQ7QUFRQSxTQUFTLFdBQVcsTUFBc0I7QUFDeEMsTUFBSTtBQUNGLFdBQU8sbUJBQW1CLElBQUk7QUFBQSxFQUNoQyxRQUFRO0FBQ04sVUFBTSxJQUFJLE1BQU0saURBQWlELEtBQUssVUFBVSxJQUFJLENBQUMsR0FBRztBQUFBLEVBQzFGO0FBQ0Y7QUFFQSxTQUFTLFlBQVksV0FBbUIsU0FBaUIsUUFBd0I7QUFDL0UsUUFBTSxTQUFTLE1BQU0sU0FBUyxNQUFNLFFBQVEsU0FBUyxHQUFHLE9BQU87QUFDL0QsU0FBTyxHQUFHLE9BQU8sV0FBVyxHQUFHLElBQUksU0FBUyxLQUFLLE1BQU0sRUFBRSxHQUFHLE1BQU07QUFDcEU7QUFFQSxTQUFTLFVBQVUsT0FBMkQ7QUFDNUUsUUFBTSxNQUFNLG9CQUFJLElBQXVDO0FBQ3ZELGFBQVcsUUFBUSxPQUFPO0FBQ3hCLGVBQVcsVUFBVSxDQUFDLEtBQUssUUFBUSxHQUFJLEtBQUssaUJBQWlCLENBQUMsQ0FBRSxHQUFHO0FBQ2pFLFlBQU1DLGFBQVksSUFBSSxJQUFJLE1BQU0sS0FBSyxvQkFBSSxJQUEwQjtBQUNuRSxVQUFJQSxXQUFVLElBQUksS0FBSyxNQUFNLEdBQUc7QUFDOUIsY0FBTSxJQUFJLE1BQU0sK0NBQStDLEtBQUssVUFBVSxNQUFNLENBQUMsZUFBZSxLQUFLLFVBQVUsS0FBSyxNQUFNLENBQUMsR0FBRztBQUFBLE1BQ3BJO0FBQ0EsTUFBQUEsV0FBVSxJQUFJLEtBQUssUUFBUSxJQUFJO0FBQy9CLFVBQUksSUFBSSxRQUFRQSxVQUFTO0FBQUEsSUFDM0I7QUFBQSxFQUNGO0FBQ0EsU0FBTztBQUNUO0FBRUEsU0FBUyxrQkFBa0IsUUFBd0I7QUFDakQsU0FBTyxPQUFPLFNBQVMsUUFBUSxJQUMzQixPQUFPLFFBQVEsYUFBYSxLQUFLLElBQ2pDLE9BQU8sUUFBUSxTQUFTLFFBQVE7QUFDdEM7QUFFQSxTQUFTLHdCQUF3QixXQUFtQixTQUFpQixVQUFzRDtBQUN6SCxRQUFNLFVBQVUsV0FBVyxPQUFPO0FBQ2xDLE1BQUksVUFBVSxRQUFRLFFBQVEsU0FBUyxHQUFHLE9BQU87QUFDakQsTUFBSSxXQUFXLE9BQU8sRUFBRyxRQUFPLEVBQUUsUUFBUTtBQUUxQyxRQUFNLFlBQVksUUFBUSxNQUFNLFNBQVM7QUFDekMsTUFBSSxjQUFjLE1BQU07QUFDdEIsVUFBTSxXQUFXLFVBQVUsQ0FBQztBQUM1QixRQUFJLGFBQWEsT0FBVyxPQUFNLElBQUksTUFBTSw4REFBOEQ7QUFDMUcsY0FBVSxRQUFRLFFBQVEsU0FBUyxHQUFHLFFBQVEsTUFBTSxHQUFHLENBQUMsVUFBVSxDQUFDLEVBQUUsTUFBTSxDQUFDO0FBQzVFLFFBQUksV0FBVyxPQUFPLEVBQUcsUUFBTyxFQUFFLFNBQVMsTUFBTSxPQUFPLFNBQVMsVUFBVSxFQUFFLEVBQUU7QUFBQSxFQUNqRjtBQUVBLE1BQUksUUFBUSxPQUFPLE1BQU0sSUFBSTtBQUMzQixVQUFNLFdBQVcsUUFBUSxRQUFRLFNBQVMsR0FBRyxHQUFHLE9BQU8sS0FBSztBQUM1RCxRQUFJLFdBQVcsUUFBUSxFQUFHLFFBQU8sRUFBRSxTQUFTLFNBQVM7QUFDckQsVUFBTSxRQUFRLFFBQVEsUUFBUSxTQUFTLEdBQUcsU0FBUyxVQUFVO0FBQzdELFFBQUksV0FBVyxLQUFLLEVBQUcsUUFBTyxFQUFFLFNBQVMsTUFBTTtBQUFBLEVBQ2pEO0FBRUEsUUFBTSxJQUFJLE1BQU0scUJBQXFCLFNBQVMsV0FBVyxRQUFRLENBQUMsMEJBQTBCLEtBQUssVUFBVSxPQUFPLENBQUMsR0FBRztBQUN4SDtBQUVBLFNBQVMsYUFDUCxTQUNBLE1BQ0EsUUFDQSxlQUNBLFVBQ0EsT0FDUTtBQUNSLFFBQU0sT0FBTyxTQUFTLFNBQVMsUUFBUTtBQUN2QyxNQUFJLE1BQU8sUUFBTyxrRUFBa0UsYUFBYSxJQUFJLElBQUksR0FBRyxNQUFNO0FBQ2xILFFBQU0sT0FBTyxVQUFVLE9BQU8sRUFBRSxZQUFZLElBQUksU0FBUztBQUN6RCxRQUFNLGFBQWEsU0FBUyxTQUFZLFNBQVMsS0FBSyxJQUFJO0FBQzFELFNBQU8sR0FBRyxjQUFjLElBQUksSUFBSSxJQUFJLGFBQWEsSUFBSSxJQUFJLEdBQUcsVUFBVTtBQUN4RTtBQVNPLFNBQVMsZ0JBQWdCLFFBQWdCLFNBQXlDO0FBQ3ZGLFFBQU0sWUFBWSxRQUFRLFFBQVEsVUFBVSxRQUFRLFVBQVU7QUFDOUQsUUFBTSxZQUFZLFVBQVUsUUFBUSxLQUFLO0FBQ3pDLFFBQU0sT0FBT0MsY0FBYSxRQUFRLEVBQUUsWUFBWSxDQUFDQyxLQUFJLENBQUMsR0FBRyxpQkFBaUIsQ0FBQ0MsaUJBQWdCLENBQUMsRUFBRSxDQUFDO0FBQy9GLFFBQU0sZUFBOEIsQ0FBQztBQUVyQyxRQUFNLFVBQVUsQ0FBQyxTQUErQjtBQUM5QyxRQUFJLGdDQUFnQyxLQUFLLEdBQUcsRUFBRztBQUMvQyxVQUFNLEVBQUUsTUFBTSxPQUFPLElBQUksdUJBQXVCLEtBQUssR0FBRztBQUN4RCxRQUFJLFNBQVMsR0FBSTtBQUNqQixVQUFNLEVBQUUsU0FBUyxLQUFLLElBQUksd0JBQXdCLFdBQVcsTUFBTSxRQUFRLFFBQVE7QUFDbkYsVUFBTSxhQUFhLFNBQVMsU0FBUyxRQUFRLFFBQVE7QUFDckQsVUFBTSxxQkFBcUIsZUFBZSxrQkFBa0IsUUFBUSxVQUFVO0FBQzlFLFVBQU0sZUFBMkIscUJBQzdCLFFBQVEsV0FBVyxTQUFTLE9BQU8sU0FDbkMsUUFBUTtBQUNaLFVBQU0sT0FBTyxVQUFVLElBQUksVUFBVSxHQUFHLElBQUksWUFBWTtBQUN4RCxVQUFNLFVBQVUsU0FBUyxTQUNyQixZQUFZLFFBQVEsT0FBTyxLQUFLLE9BQU8sTUFBTSxJQUM3QyxLQUFLLFNBQVMsV0FBVyxRQUFRLGVBQWUsU0FHOUMsR0FBRyxRQUFRLFdBQVcsT0FBTyxDQUFDLEdBQUcsTUFBTSxLQUN2QyxhQUFhLFNBQVMsTUFBTSxRQUFRLFFBQVEsZUFBZSxRQUFRLFVBQVUsS0FBSyxTQUFTLE9BQU87QUFFeEcsVUFBTSxjQUFjLG9CQUFvQixRQUFRLElBQUk7QUFDcEQsaUJBQWEsS0FBSztBQUFBLE1BQ2hCLE9BQU8sWUFBWTtBQUFBLE1BQ25CLEtBQUssWUFBWTtBQUFBLE1BQ2pCLE9BQU87QUFBQSxJQUNULENBQUM7QUFBQSxFQUNIO0FBRUEsUUFBTSxRQUFRLENBQUMsU0FBc0I7QUFDbkMsU0FBSyxLQUFLLFNBQVMsVUFBVSxLQUFLLFNBQVMsV0FBVyxLQUFLLFNBQVMsaUJBQWlCLFNBQVMsS0FBTSxTQUFRLElBQUk7QUFDaEgsUUFBSSxjQUFjLE1BQU07QUFDdEIsaUJBQVcsU0FBUyxLQUFLLFNBQVUsT0FBTSxLQUFLO0FBQUEsSUFDaEQ7QUFBQSxFQUNGO0FBQ0EsUUFBTSxJQUFJO0FBRVYsTUFBSSxZQUFZO0FBQ2hCLGFBQVcsZUFBZSxhQUFhLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxRQUFRLEVBQUUsS0FBSyxHQUFHO0FBQ3hFLGdCQUFZLFVBQVUsTUFBTSxHQUFHLFlBQVksS0FBSyxJQUFJLFlBQVksUUFBUSxVQUFVLE1BQU0sWUFBWSxHQUFHO0FBQUEsRUFDekc7QUFDQSxTQUFPO0FBQ1Q7QUFTTyxTQUFTLHlCQUF5QixVQUFrQixNQUEwRTtBQUNuSSxRQUFNLFNBQVM7QUFBQSxJQUNiLGVBQWUsS0FBSyxVQUFVLEtBQUssTUFBTSxDQUFDO0FBQUEsSUFDMUMsR0FBSSxLQUFLLFlBQVksT0FBTyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsS0FBSyxVQUFVLEtBQUssS0FBSyxDQUFDLEVBQUU7QUFBQSxJQUNsRixHQUFJLEtBQUssWUFBWSxTQUFZLENBQUMsSUFBSSxDQUFDLFlBQVksS0FBSyxVQUFVLEtBQUssT0FBTyxDQUFDLEVBQUU7QUFBQSxFQUNuRixFQUFFLEtBQUssSUFBSTtBQUNYLE1BQUksU0FBUyxXQUFXLE9BQU8sRUFBRyxRQUFPLFNBQVMsUUFBUSxTQUFTO0FBQUEsRUFBUSxNQUFNO0FBQUEsQ0FBSTtBQUNyRixTQUFPO0FBQUEsRUFBUSxNQUFNO0FBQUE7QUFBQTtBQUFBLEVBQVksUUFBUTtBQUMzQztBQUdBLElBQU0sb0JBQW9CO0FBRzFCLElBQU0sbUJBQW1CO0FBWXpCLFNBQVMsd0JBQXdCLFVBQTBCO0FBQ3pELFFBQU0sUUFBUSxTQUFTLE1BQU0sSUFBSTtBQUNqQyxRQUFNLFdBQVcsTUFBTSxVQUFVLFVBQVEsa0JBQWtCLEtBQUssSUFBSSxDQUFDO0FBR3JFLE1BQUksYUFBYSxNQUFNLFdBQVcsR0FBRztBQUNuQyxVQUFNLE9BQU8sVUFBVSxNQUFNLFdBQVcsQ0FBQyxNQUFNLEtBQUssSUFBSSxDQUFDO0FBQUEsRUFDM0Q7QUFDQSxRQUFNLFFBQVEsTUFBTSxjQUFjLFVBQVEsaUJBQWlCLEtBQUssSUFBSSxDQUFDO0FBQ3JFLE1BQUksVUFBVSxJQUFJO0FBQ2hCLFVBQU0sT0FBTyxNQUFNLFFBQVEsQ0FBQyxNQUFNLEtBQUssUUFBUSxJQUFJLE9BQU8sTUFBTSxRQUFRLENBQUMsTUFBTSxLQUFLLElBQUksQ0FBQztBQUFBLEVBQzNGO0FBQ0EsU0FBTyxNQUFNLEtBQUssSUFBSTtBQUN4QjtBQVNPLFNBQVMscUJBQXFCLFVBQWtCLE1BQXdCO0FBQzdFLE1BQUksS0FBSyxZQUFZLEtBQU0sUUFBTyx3QkFBd0IsUUFBUTtBQUNsRSxNQUFJLENBQUMsU0FBUyxXQUFXLE9BQU8sR0FBRztBQUNqQyxVQUFNLElBQUksTUFBTSx3Q0FBd0MsS0FBSyxVQUFVLEtBQUssTUFBTSxDQUFDLG9DQUFvQztBQUFBLEVBQ3pIO0FBQ0EsUUFBTSxtQkFBbUI7QUFDekIsUUFBTSxVQUFVLFNBQVMsUUFBUSxrQkFBa0IsQ0FBQztBQUNwRCxNQUFJLFlBQVksSUFBSTtBQUNsQixVQUFNLElBQUksTUFBTSx3Q0FBd0MsS0FBSyxVQUFVLEtBQUssTUFBTSxDQUFDLGlDQUFpQztBQUFBLEVBQ3RIO0FBQ0EsU0FBTyxTQUFTLE1BQU0sR0FBRyxVQUFVLGlCQUFpQixNQUFNO0FBQzVEO0FBZU8sU0FBUyxpQkFBaUIsU0FBaUIsVUFBc0M7QUFDdEYsUUFBTSxPQUFPLGFBQWEsT0FBTztBQUNqQyxRQUFNLFNBQVMsU0FBUyxZQUFZLEtBQUssV0FBVyxHQUFHLFFBQVEsR0FBRyxHQUFHLEVBQUU7QUFDdkUsU0FBTyxVQUFVLFNBQVMsSUFBSSxFQUFFLE9BQU8sSUFBSSxPQUFPO0FBQ3BEO0FBR0EsU0FBUyxtQkFBNkI7QUFDcEMsUUFBTSxRQUFRLG9CQUFJLElBQVk7QUFDOUIsYUFBVyxRQUFRLFdBQVc7QUFDNUIsVUFBTSxZQUFZLFFBQVEsTUFBTSxLQUFLLE1BQU07QUFDM0MsUUFBSSxDQUFDLFdBQVcsU0FBUyxFQUFHO0FBQzVCLG9CQUFnQixhQUFhLFdBQVcsTUFBTSxHQUFHO0FBQUEsTUFDL0MsWUFBWSxLQUFLO0FBQUEsTUFDakIsUUFBUSxLQUFLO0FBQUEsTUFDYixPQUFPLEtBQUs7QUFBQSxNQUNaLE9BQU87QUFBQSxNQUNQLFVBQVU7QUFBQSxNQUNWLGVBQWU7QUFBQSxNQUNmLFlBQVksQ0FBQyxZQUFZO0FBQ3ZCLGNBQU0sT0FBTyxpQkFBaUIsU0FBUyxJQUFJO0FBQzNDLFlBQUksU0FBUyxPQUFXLE9BQU0sSUFBSSxJQUFJO0FBQ3RDLGVBQU87QUFBQSxNQUNUO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDSDtBQUNBLFNBQU8sQ0FBQyxHQUFHLEtBQUs7QUFDbEI7QUFRTyxTQUFTLGtCQUE0QjtBQUMxQyxTQUFPLENBQUMsR0FBRyxvQkFBSSxJQUFJLENBQUMsR0FBRyxVQUFVLElBQUksVUFBUSxRQUFRLE1BQU0sS0FBSyxNQUFNLENBQUMsR0FBRyxHQUFHLGlCQUFpQixDQUFDLENBQUMsQ0FBQztBQUNuRztBQVlBLFNBQVMsMkJBQThDO0FBQ3JELFNBQU8sRUFBRSxPQUFPLFdBQVcsVUFBVSxNQUFNLGVBQWUscUJBQXFCLFFBQVEsR0FBRyxFQUFFO0FBQzlGO0FBU0EsU0FBUyxpQkFDUCxZQUNBLFNBQ0EsYUFDQSxVQUFzQixRQUFRLE9BQ3hCO0FBQ04sUUFBTSxTQUFTLG9CQUFJLElBQVk7QUFFL0IsUUFBTSxVQUFVLG9CQUFJLElBQW9CO0FBR3hDLFFBQU0sUUFBUSxDQUFDLFFBQWdCLGNBQTRCO0FBQ3pELFVBQU0sU0FBUyxRQUFRLElBQUksTUFBTTtBQUNqQyxRQUFJLFdBQVcsVUFBYSxXQUFXLFdBQVc7QUFDaEQsWUFBTSxJQUFJO0FBQUEsUUFDUixxQkFBcUIsU0FBUyxXQUFXLFFBQVEsUUFBUSxDQUFDLFFBQVEsU0FBUyxRQUFRLFFBQVEsUUFBUSxDQUFDLG9CQUM5RSxTQUFTLFlBQVksTUFBTSxFQUFFLE1BQU0sR0FBRyxFQUFFLEtBQUssR0FBRyxDQUFDO0FBQUEsTUFDekU7QUFBQSxJQUNGO0FBSUEsUUFBSSxXQUFXLFVBQWEsV0FBVyxNQUFNLEdBQUc7QUFDOUMsWUFBTSxJQUFJO0FBQUEsUUFDUixxQkFBcUIsU0FBUyxXQUFXLFFBQVEsUUFBUSxDQUFDLHdDQUNwRCxTQUFTLFlBQVksTUFBTSxFQUFFLE1BQU0sR0FBRyxFQUFFLEtBQUssR0FBRyxDQUFDO0FBQUEsTUFDekQ7QUFBQSxJQUNGO0FBQ0EsWUFBUSxJQUFJLFFBQVEsU0FBUztBQUFBLEVBQy9CO0FBRUEsYUFBVyxRQUFRLFNBQVM7QUFDMUIsUUFBSSxPQUFPLElBQUksS0FBSyxLQUFLLEVBQUcsT0FBTSxJQUFJLE1BQU0scUNBQXFDLEtBQUssVUFBVSxLQUFLLEtBQUssQ0FBQyxHQUFHO0FBQzlHLFdBQU8sSUFBSSxLQUFLLEtBQUs7QUFDckIsVUFBTSxZQUFZLFFBQVEsUUFBUSxVQUFVLEtBQUssTUFBTTtBQUN2RCxRQUFJLENBQUMsV0FBVyxTQUFTLEtBQUssQ0FBQyxVQUFVLFNBQVMsRUFBRSxPQUFPLEdBQUc7QUFDNUQsWUFBTSxJQUFJLE1BQU0sNEJBQTRCLEtBQUssVUFBVSxLQUFLLE1BQU0sQ0FBQyxtQ0FBbUM7QUFBQSxJQUM1RztBQUNBLFVBQU0sU0FBUyxRQUFRLFlBQVksS0FBSyxLQUFLO0FBRzdDLFVBQU0sUUFBUSxTQUFTO0FBQ3ZCLGNBQVUsUUFBUSxNQUFNLEdBQUcsRUFBRSxXQUFXLEtBQUssQ0FBQztBQUM5QyxVQUFNLFdBQVcsYUFBYSxXQUFXLE1BQU07QUFDL0MsVUFBTSxZQUFZLGdCQUFnQixVQUFVO0FBQUEsTUFDMUMsWUFBWSxLQUFLO0FBQUEsTUFDakIsUUFBUSxLQUFLO0FBQUEsTUFDYixPQUFPLEtBQUs7QUFBQSxNQUNaLE9BQU8sUUFBUTtBQUFBLE1BQ2YsVUFBVSxRQUFRO0FBQUEsTUFDbEIsZUFBZSxRQUFRO0FBQUEsTUFDdkIsWUFBWSxDQUFDLFlBQVk7QUFDdkIsY0FBTSxPQUFPLGlCQUFpQixTQUFTLFFBQVEsUUFBUTtBQUN2RCxZQUFJLFNBQVMsUUFBVztBQUN0QixnQkFBTSxJQUFJO0FBQUEsWUFDUixxQkFBcUIsS0FBSyxNQUFNLHFCQUFxQixTQUFTLFNBQVMsUUFBUSxRQUFRLENBQUM7QUFBQSxVQUUxRjtBQUFBLFFBQ0Y7QUFJQSxjQUFNLE9BQU8sU0FBUyxJQUFJO0FBQzFCLGNBQU0sU0FBUyxRQUFRLFFBQVEsTUFBTSxHQUFHLElBQUk7QUFDNUMsY0FBTSxRQUFRLElBQUk7QUFDbEIscUJBQWEsTUFBTSxNQUFNO0FBR3pCLGVBQU8sS0FBSyxVQUFVLElBQUksQ0FBQztBQUFBLE1BQzdCO0FBQUEsSUFDRixDQUFDO0FBQ0Qsa0JBQWMsUUFBUSxZQUFZLFdBQVcsSUFBSSxDQUFDO0FBQUEsRUFDcEQ7QUFDRjtBQUdPLFNBQVMsY0FBb0I7QUFDbEMsU0FBTyxlQUFlLEVBQUUsV0FBVyxNQUFNLE9BQU8sS0FBSyxDQUFDO0FBQ3RELG1CQUFpQixlQUFlLHlCQUF5QixHQUFHLENBQUMsVUFBVSxTQUNyRSx5QkFBeUIscUJBQXFCLFVBQVUsSUFBSSxHQUFHLElBQUksQ0FBQztBQUN4RTtBQVNBLFNBQVMsbUJBQW1CLFVBQWtCLFFBQXdCO0FBQ3BFLE1BQUksQ0FBQyxTQUFTLFdBQVcsT0FBTyxFQUFHLFFBQU87QUFDMUMsUUFBTSxtQkFBbUI7QUFDekIsUUFBTSxVQUFVLFNBQVMsUUFBUSxrQkFBa0IsQ0FBQztBQUNwRCxNQUFJLFlBQVksSUFBSTtBQUNsQixVQUFNLElBQUksTUFBTSxxQkFBcUIsS0FBSyxVQUFVLE1BQU0sQ0FBQyxpQ0FBaUM7QUFBQSxFQUM5RjtBQUNBLFNBQU8sU0FBUyxNQUFNLFVBQVUsaUJBQWlCLE1BQU0sRUFBRSxRQUFRLFFBQVEsRUFBRTtBQUM3RTtBQWFPLFNBQVMsdUJBQXVCLFVBQWtCLFFBQXdCO0FBQy9FLFNBQU8sd0JBQXdCLG1CQUFtQixVQUFVLE1BQU0sQ0FBQztBQUNyRTtBQVNBLFNBQVMsZ0JBQWdCLE9BQW1DO0FBQzFELFFBQU0sUUFBUSxvQkFBb0IsS0FBSyxLQUFLO0FBQzVDLFNBQU8sUUFBUSxDQUFDLE1BQU0sU0FBWSxTQUFZLEdBQUcsTUFBTSxDQUFDLENBQUM7QUFDM0Q7QUEyQk8sU0FBUyxxQkFBcUIsUUFBZ0IsVUFBNkIseUJBQXlCLEdBQVM7QUFDbEgsUUFBTSxVQUFVLFFBQVEsTUFBTSxRQUFRLENBQUMsU0FBUztBQUM5QyxVQUFNLFFBQVEsZ0JBQWdCLEtBQUssS0FBSztBQUN4QyxXQUFPLFVBQVUsU0FBWSxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsTUFBTSxPQUFPLE1BQU0sQ0FBQztBQUFBLEVBQzlELENBQUM7QUFDRDtBQUFBLElBQ0U7QUFBQSxJQUNBO0FBQUEsSUFDQSxDQUFDLFVBQVUsU0FBUyxTQUFTLHVCQUF1QixVQUFVLEtBQUssTUFBTSxDQUFDO0FBQUEsSUFDMUUsQ0FBQyxHQUFHLFFBQVEsT0FBTyxHQUFHLE9BQU87QUFBQSxFQUMvQjtBQUNGO0FBWU8sU0FBUyxpQkFBaUIsT0FBZSxVQUE2Qix5QkFBeUIsR0FBdUI7QUFDM0gsUUFBTSxPQUFPLFFBQVEsTUFBTSxLQUFLLGVBQWEsVUFBVSxVQUFVLEtBQUs7QUFDdEUsTUFBSSxTQUFTLE9BQVcsUUFBTztBQUMvQixRQUFNLFdBQVcsYUFBYSxRQUFRLFFBQVEsVUFBVSxLQUFLLE1BQU0sR0FBRyxNQUFNO0FBQzVFLFNBQU8sdUJBQXVCLGdCQUFnQixVQUFVO0FBQUEsSUFDdEQsWUFBWSxLQUFLO0FBQUEsSUFDakIsUUFBUSxLQUFLO0FBQUEsSUFDYixPQUFPLEtBQUs7QUFBQSxJQUNaLE9BQU8sUUFBUTtBQUFBLElBQ2YsVUFBVSxRQUFRO0FBQUEsSUFDbEIsZUFBZSxRQUFRO0FBQUEsSUFDdkIsWUFBWSxhQUFXLEtBQUssVUFBVSxTQUFTLE9BQU8sQ0FBQyxDQUFDO0FBQUEsRUFDMUQsQ0FBQyxHQUFHLEtBQUssTUFBTTtBQUNqQjtBQWFBLElBQU0saUJBQXFFO0FBQUEsRUFDekUsRUFBRSxTQUFTLDRCQUFRLFFBQVEsT0FBTztBQUFBLEVBQ2xDLEVBQUUsU0FBUyxXQUFXLFFBQVEsS0FBSztBQUNyQztBQVlPLFNBQVMsUUFBUSxNQUEyQjtBQUNqRCxRQUFNLFFBQVE7QUFBQSxJQUNaLEtBQUssS0FBSyxLQUFLO0FBQUEsSUFDZjtBQUFBLElBQ0EsS0FBSyxLQUFLLFdBQVc7QUFBQSxJQUNyQjtBQUFBLElBQ0E7QUFBQSxFQUNGO0FBQ0EsYUFBVyxFQUFFLFNBQVMsT0FBTyxLQUFLLGdCQUFnQjtBQUNoRCxVQUFNLEtBQUssSUFBSSxNQUFNLE9BQU8sSUFBSSxFQUFFO0FBQ2xDLGVBQVcsY0FBYyxrQkFBa0IsTUFBTSxHQUFHO0FBQ2xELGlCQUFXLFFBQVEsYUFBYSxRQUFRLFVBQVUsR0FBRztBQUNuRCxjQUFNLEtBQUssTUFBTSxLQUFLLEtBQUssS0FBSyxLQUFLLElBQUksR0FBRyxLQUFLLEtBQUssTUFBTSxLQUFLLE9BQU8sRUFBRTtBQUFBLE1BQzVFO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDQSxTQUFPLEdBQUcsTUFBTSxLQUFLLElBQUksQ0FBQztBQUFBO0FBQzVCOzs7QUVwakJPLFNBQVMsc0JBQXNCQyxPQUFjLE9BQWlEO0FBQ25HLFNBQU8sQ0FBQyxLQUFLLEtBQUssU0FBUztBQUN6QixRQUFJLElBQUksUUFBUSxVQUFjLElBQUksV0FBVyxTQUFTLElBQUksV0FBVyxRQUFTO0FBQzVFLFdBQUs7QUFDTDtBQUFBLElBQ0Y7QUFDQSxRQUFJO0FBQ0osUUFBSTtBQUNGLFlBQU0sSUFBSSxJQUFJLElBQUksS0FBSyxtQkFBbUI7QUFBQSxJQUM1QyxTQUFTLFFBQVE7QUFFZixXQUFLO0FBQ0w7QUFBQSxJQUNGO0FBQ0EsUUFBSSxDQUFDLElBQUksU0FBUyxXQUFXQSxLQUFJLEdBQUc7QUFDbEMsV0FBSztBQUNMO0FBQUEsSUFDRjtBQUNBLFVBQU0sT0FBTyxJQUFJLFNBQVMsTUFBTUEsTUFBSyxNQUFNO0FBQzNDLFVBQU0sV0FBVyxLQUFLLFNBQVMsS0FBSyxLQUFLLElBQUksYUFBYSxJQUFJLFNBQVMsTUFBTTtBQUM3RSxVQUFNLGNBQWMsSUFBSSxRQUFRLGdCQUFnQjtBQUVoRCxRQUFJLGdCQUFnQixVQUFhLGdCQUFnQixjQUFjLEVBQUUsZ0JBQWdCLFdBQVcsV0FBVztBQUNyRyxXQUFLO0FBQ0w7QUFBQSxJQUNGO0FBQ0EsVUFBTSxVQUFVLFNBQVMsYUFBYSxNQUFNLElBQUksS0FBSyxTQUFTLEtBQUssSUFBSSxpQkFBaUIsSUFBSSxJQUFJO0FBQ2hHLFFBQUksWUFBWSxRQUFXO0FBQ3pCLFVBQUksQ0FBQyxVQUFVO0FBQ2IsYUFBSztBQUNMO0FBQUEsTUFDRjtBQUNBLFVBQUksYUFBYTtBQUNqQixVQUFJLElBQUk7QUFDUjtBQUFBLElBQ0Y7QUFDQSxRQUFJLFVBQVUsZ0JBQWdCLEdBQUcsU0FBUyxhQUFhLGVBQWUsZUFBZSxpQkFBaUI7QUFDdEcsUUFBSSxJQUFJLElBQUksV0FBVyxTQUFTLFNBQVksT0FBTztBQUFBLEVBQ3JEO0FBQ0Y7OztBTG5EQSxJQUFNQyxvQ0FBbUM7QUFZekMsWUFBWTtBQUVaLFNBQVMsUUFBUSxRQUFvQixZQUEwRTtBQUc3RyxRQUFNLFNBQVMsb0JBQUksSUFBd0I7QUFDM0MsYUFBVyxRQUFRLGFBQWEsUUFBUSxVQUFVLEdBQUc7QUFDbkQsVUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLE9BQU8sS0FBSyxDQUFDO0FBQzdDLFlBQVEsS0FBSyxJQUFJO0FBQ2pCLFdBQU8sSUFBSSxLQUFLLFNBQVMsT0FBTztBQUFBLEVBQ2xDO0FBQ0EsU0FBTyxDQUFDLEdBQUcsT0FBTyxRQUFRLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxNQUFNLE9BQU8sTUFBTTtBQUNwRCxVQUFNLEVBQUUsVUFBVSxJQUFJLFlBQVksUUFBUSxJQUFJO0FBQzlDLFdBQU87QUFBQSxNQUNMO0FBQUE7QUFBQTtBQUFBLE1BR0EsR0FBSSxjQUFjLFNBQVksQ0FBQyxJQUFJLEVBQUUsVUFBVTtBQUFBLE1BQy9DLE9BQU8sUUFBUSxJQUFJLFdBQVMsRUFBRSxNQUFNLEtBQUssT0FBTyxNQUFNLFVBQVUsS0FBSyxLQUFLLEVBQUUsRUFBRTtBQUFBLElBQ2hGO0FBQUEsRUFDRixDQUFDO0FBQ0g7QUEyQkEsSUFBTSxlQUFlO0FBQUEsRUFDbkIsTUFBTTtBQUFBLElBQ0osT0FBTyxrQkFBa0IsS0FBSyxDQUFDO0FBQUEsSUFDL0IsU0FBUyxFQUFFLE9BQU8sZ0JBQU0sWUFBWSxrQkFBa0IsS0FBSyxDQUFDLEVBQUU7QUFBQSxJQUM5RCxXQUFXLEVBQUUsT0FBTyxnQkFBTSxZQUFZLGtCQUFrQixLQUFLLENBQUMsRUFBRTtBQUFBLEVBQ2xFO0FBQUEsRUFDQSxJQUFJO0FBQUEsSUFDRixPQUFPLGtCQUFrQixHQUFHLENBQUM7QUFBQSxJQUM3QixTQUFTLEVBQUUsT0FBTyxlQUFlLFlBQVksa0JBQWtCLEdBQUcsQ0FBQyxFQUFFO0FBQUEsSUFDckUsV0FBVyxFQUFFLE9BQU8sYUFBYSxZQUFZLGtCQUFrQixHQUFHLENBQUMsRUFBRTtBQUFBLEVBQ3ZFO0FBQ0Y7QUFRQSxTQUFTLGFBQWEsUUFBZ0Q7QUFDcEUsUUFBTSxFQUFFLE9BQU8sU0FBQUMsVUFBUyxXQUFBQyxXQUFVLElBQUksYUFBYSxNQUFNO0FBQ3pELFNBQU87QUFBQSxJQUNMLEdBQUcsUUFBUSxRQUFRLEtBQUs7QUFBQSxJQUN4QixHQUFHLENBQUNELFVBQVNDLFVBQVMsRUFBRSxJQUFJLENBQUMsRUFBRSxPQUFPLFdBQVcsT0FBTztBQUFBLE1BQ3RELE1BQU07QUFBQSxNQUNOLE1BQU0sWUFBWSxRQUFRLFVBQVU7QUFBQSxJQUN0QyxFQUFFO0FBQUEsRUFDSjtBQUNGO0FBU0EsU0FBUyxVQUFVLFFBQTRDO0FBQzdELFFBQU0sRUFBRSxTQUFBRCxVQUFTLFdBQUFDLFdBQVUsSUFBSSxhQUFhLE1BQU07QUFDbEQsUUFBTSxjQUFjLFdBQVcsU0FBUyxLQUFLO0FBQzdDLFNBQU87QUFBQSxJQUNMLEVBQUUsTUFBTUQsU0FBUSxPQUFPLE1BQU0sWUFBWSxRQUFRQSxTQUFRLFVBQVUsR0FBRyxhQUFhLElBQUksV0FBVyxZQUFZO0FBQUEsSUFDOUcsRUFBRSxNQUFNQyxXQUFVLE9BQU8sTUFBTSxZQUFZLFFBQVFBLFdBQVUsVUFBVSxHQUFHLGFBQWEsSUFBSSxXQUFXLGNBQWM7QUFBQSxFQUN0SDtBQUNGO0FBRUEsU0FBUyxtQkFBbUIsUUFBNkI7QUFDdkQsUUFBTSxVQUFVLGdCQUFnQjtBQUNoQyxTQUFPLFFBQVEsSUFBSSxPQUFPO0FBQzFCLFNBQU8sUUFBUSxHQUFHLFVBQVUsQ0FBQyxZQUFZO0FBQ3ZDLFFBQUksQ0FBQyxRQUFRLFNBQVMsT0FBTyxFQUFHO0FBQ2hDLGdCQUFZO0FBQUEsRUFDZCxDQUFDO0FBQ0g7QUFPQSxTQUFTLGlCQUFpQixRQUE2QjtBQUNyRCxTQUFPLFlBQVksSUFBSSxzQkFBc0IsTUFBTSxNQUFNLFFBQVEsRUFBRSxNQUFNLEdBQUcsYUFBYSxDQUFDLENBQUMsQ0FBQztBQUM5RjtBQUVBLFNBQVMsdUJBQXVCLE1BQXNCO0FBQ3BELFNBQU8sS0FBSyxXQUFXLE1BQU0sY0FBYyxFQUFFLFdBQVcsTUFBTSxjQUFjO0FBQzlFO0FBRUEsSUFBTSxjQUFnRjtBQUFBLEVBQ3BGLFFBQVE7QUFBQSxJQUNOLFVBQVU7QUFBQSxJQUNWLFNBQVM7QUFBQSxNQUNQLFNBQVM7QUFBQSxRQUNQLE1BQU07QUFBQSxVQUNKLGNBQWM7QUFBQSxZQUNaLFFBQVE7QUFBQSxjQUNOLFlBQVk7QUFBQSxjQUNaLGlCQUFpQjtBQUFBLFlBQ25CO0FBQUEsWUFDQSxPQUFPO0FBQUEsY0FDTCxnQkFBZ0I7QUFBQSxjQUNoQixrQkFBa0I7QUFBQSxjQUNsQixpQkFBaUI7QUFBQSxjQUNqQixlQUFlO0FBQUEsY0FDZixRQUFRO0FBQUEsZ0JBQ04sWUFBWTtBQUFBLGdCQUNaLG9CQUFvQjtBQUFBLGdCQUNwQixjQUFjO0FBQUEsZ0JBQ2Qsd0JBQXdCO0FBQUEsZ0JBQ3hCLDBCQUEwQjtBQUFBLGdCQUMxQixXQUFXO0FBQUEsZ0JBQ1gsbUJBQW1CO0FBQUEsY0FDckI7QUFBQSxZQUNGO0FBQUEsVUFDRjtBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLGFBQWE7QUFBQSxJQUNYLEVBQUUsTUFBTSxVQUFVLE1BQU0sa0RBQWtEO0FBQUEsRUFDNUU7QUFBQSxFQUNBLFVBQVU7QUFBQSxJQUNSLFNBQVMsQ0FBQyxFQUFFLFlBQVksTUFBZ0I7QUFDdEMsWUFBTSxPQUFnQjtBQUN0QixZQUFNLGFBQXNCLE9BQU8sU0FBUyxZQUFZLFNBQVMsT0FBTyxRQUFRLElBQUksTUFBTSxZQUFZLElBQUk7QUFDMUcsVUFBSSxPQUFPLGVBQWUsU0FBVSxPQUFNLElBQUksTUFBTSw2REFBNkQ7QUFDakgsYUFBTywrREFBK0QsVUFBVTtBQUFBLElBQ2xGO0FBQUEsSUFDQSxNQUFNO0FBQUEsRUFDUjtBQUNGO0FBR0EsSUFBTSxPQUFPLFFBQVEsSUFBSSxhQUFhO0FBR3RDLElBQU0sZUFBZTtBQUFBLEVBQ25CLE9BQU87QUFBQSxFQUNQLGFBQWE7QUFDZjtBQU1BLElBQU0sV0FBV0MsY0FBYUMsU0FBUUMsbUNBQXFCLHdCQUF3QixHQUFHLE1BQU0sRUFDekYsS0FBSyxFQUNMLFFBQVEsU0FBUyw0QkFBNEI7QUFZaEQsSUFBTSxZQUFZO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUF3Q2xCLElBQU0sa0JBQWtCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQW9CeEIsU0FBUyxVQUFVLFlBQTRCO0FBQzdDLFNBQU8sNEJBQTRCLFFBQVEseUJBQXlCLFVBQVU7QUFDaEY7QUFFQSxJQUFPLGlCQUFRLFlBQVk7QUFBQSxFQUN6QixPQUFPLGFBQWE7QUFBQSxFQUNwQixhQUFhLGFBQWE7QUFBQSxFQUMxQjtBQUFBLEVBQ0EsZUFBZSxDQUFDLEVBQUUsV0FBVyxNQUFNLHNCQUFzQixXQUFXLEdBQUc7QUFBQTtBQUFBLEVBRXZFLFNBQVMsWUFBd0I7QUFDL0IseUJBQXFCLFdBQVcsTUFBTTtBQUN0QyxJQUFBQyxlQUFjRixTQUFRLFdBQVcsUUFBUSxVQUFVLEdBQUcsUUFBUSxFQUFFLE1BQU0sR0FBRyxhQUFhLENBQUMsQ0FBQztBQUFBLEVBQzFGO0FBQUEsRUFDQSxNQUFNO0FBQUE7QUFBQSxJQUVKLENBQUMsUUFBUSxFQUFFLEtBQUssUUFBUSxNQUFNLGlCQUFpQixNQUFNLEdBQUcsSUFBSSxjQUFjLENBQUM7QUFBQSxJQUMzRSxDQUFDLFNBQVMsQ0FBQyxHQUFHLFNBQVM7QUFBQSxJQUN2QixDQUFDLFVBQVUsQ0FBQyxHQUFHLGVBQWU7QUFBQSxFQUNoQztBQUFBLEVBQ0EsV0FBVztBQUFBLEVBQ1gsUUFBUTtBQUFBLEVBQ1IsVUFBVTtBQUFBLEVBQ1YsUUFBUTtBQUFBLEVBQ1IsU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBLE1BQ0osT0FBTztBQUFBLE1BQ1AsTUFBTTtBQUFBLE1BQ04sYUFBYTtBQUFBLFFBQ1gsV0FBVyxVQUFVLDBCQUFNO0FBQUEsUUFDM0IsS0FBSztBQUFBLFVBQ0gsRUFBRSxNQUFNLGdCQUFNLE1BQU0sWUFBWSxRQUFRLGFBQWEsS0FBSyxLQUFLLEdBQUcsYUFBYSxXQUFXO0FBQUEsVUFDMUYsR0FBRyxVQUFVLE1BQU07QUFBQSxRQUNyQjtBQUFBLFFBQ0EsU0FBUztBQUFBLFVBQ1AsV0FBVyxhQUFhLE1BQU07QUFBQSxVQUM5QixhQUFhLFFBQVEsUUFBUSxZQUFZO0FBQUEsVUFDekMsZUFBZSxRQUFRLFFBQVEsY0FBYztBQUFBLFFBQy9DO0FBQUEsUUFDQSxTQUFTLEVBQUUsT0FBTywyQkFBTztBQUFBLFFBQ3pCLFdBQVcsRUFBRSxNQUFNLHNCQUFPLE1BQU0scUJBQU07QUFBQSxRQUN0QyxxQkFBcUI7QUFBQSxRQUNyQixzQkFBc0I7QUFBQSxRQUN0QixxQkFBcUI7QUFBQSxRQUNyQixrQkFBa0I7QUFBQSxRQUNsQixrQkFBa0I7QUFBQSxRQUNsQixlQUFlO0FBQUEsUUFDZixvQkFBb0I7QUFBQSxNQUN0QjtBQUFBLElBQ0Y7QUFBQSxJQUNBLElBQUk7QUFBQSxNQUNGLE9BQU87QUFBQSxNQUNQLE1BQU07QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLGFBQWE7QUFBQSxRQUNYLFdBQVcsVUFBVSxTQUFTO0FBQUEsUUFDOUIsS0FBSztBQUFBLFVBQ0gsRUFBRSxNQUFNLFNBQVMsTUFBTSxZQUFZLE1BQU0sYUFBYSxHQUFHLEtBQUssR0FBRyxhQUFhLGNBQWM7QUFBQSxVQUM1RixHQUFHLFVBQVUsSUFBSTtBQUFBLFFBQ25CO0FBQUEsUUFDQSxTQUFTO0FBQUEsVUFDUCxjQUFjLGFBQWEsSUFBSTtBQUFBLFVBQy9CLGdCQUFnQixRQUFRLE1BQU0sWUFBWTtBQUFBLFVBQzFDLGtCQUFrQixRQUFRLE1BQU0sY0FBYztBQUFBLFFBQ2hEO0FBQUEsUUFDQSxVQUFVO0FBQUEsVUFDUixTQUFTLENBQUMsRUFBRSxZQUFZLE1BQWdCO0FBQ3RDLGtCQUFNLE9BQWdCO0FBQ3RCLGtCQUFNLGFBQXNCLE9BQU8sU0FBUyxZQUFZLFNBQVMsT0FBTyxRQUFRLElBQUksTUFBTSxZQUFZLElBQUk7QUFDMUcsZ0JBQUksT0FBTyxlQUFlLFNBQVUsT0FBTSxJQUFJLE1BQU0sNkRBQTZEO0FBQ2pILG1CQUFPLCtEQUErRCxVQUFVO0FBQUEsVUFDbEY7QUFBQSxVQUNBLE1BQU07QUFBQSxRQUNSO0FBQUEsUUFDQSxTQUFTLEVBQUUsT0FBTyxlQUFlO0FBQUEsUUFDakMsV0FBVyxFQUFFLE1BQU0sWUFBWSxNQUFNLE9BQU87QUFBQSxNQUM5QztBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQUEsRUFDQSxNQUFNO0FBQUE7QUFBQTtBQUFBLElBR0osV0FBV0EsU0FBUUMsbUNBQXFCLFdBQVc7QUFBQSxJQUNuRCxTQUFTO0FBQUEsTUFDUDtBQUFBLFFBQ0UsTUFBTTtBQUFBLFFBQ04sZ0JBQWdCLFFBQVE7QUFDdEIsNkJBQW1CLE1BQU07QUFDekIsMkJBQWlCLE1BQU07QUFBQSxRQUN6QjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBQ0EsVUFBVTtBQUFBLElBQ1IsT0FBTyxJQUFJO0FBQ1QsNkJBQXVCLEVBQUU7QUFDekIsWUFBTSxhQUFhLEdBQUcsU0FBUyxNQUFNO0FBQ3JDLFlBQU0sYUFBYSxHQUFHLFNBQVMsTUFBTTtBQUNyQyxZQUFNLGNBQWMsR0FBRyxTQUFTLE1BQU07QUFDdEMsVUFBSSxlQUFlLE9BQVcsT0FBTSxJQUFJLE1BQU0saUVBQWlFO0FBQy9HLFVBQUksZUFBZSxPQUFXLE9BQU0sSUFBSSxNQUFNLHdFQUF3RTtBQUN0SCxVQUFJLGdCQUFnQixPQUFXLE9BQU0sSUFBSSxNQUFNLGtFQUFrRTtBQUNqSCxTQUFHLFNBQVMsTUFBTSxPQUFPLElBQUksU0FBUyx1QkFBdUIsV0FBVyxHQUFHLElBQUksQ0FBQztBQUNoRixTQUFHLFNBQVMsTUFBTSxjQUFjLElBQUksU0FBUyx1QkFBdUIsV0FBVyxHQUFHLElBQUksQ0FBQztBQUN2RixZQUFNLGlCQUFpQixvQkFBSSxJQUFvQjtBQUMvQyxTQUFHLFNBQVMsTUFBTSxRQUFRLElBQUksU0FBUztBQUNyQyxjQUFNLENBQUMsUUFBUSxLQUFLLElBQUk7QUFDeEIsY0FBTSxRQUFRLE9BQU8sS0FBSztBQUMxQixZQUFJLFVBQVUsT0FBVyxPQUFNLElBQUksTUFBTSxrREFBa0Q7QUFFM0YsWUFBSSxDQUFDLFdBQVcsS0FBSyxFQUFFLFNBQVMsTUFBTSxLQUFLLEtBQUssRUFBRSxNQUFNLE9BQU8sQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLEVBQUcsUUFBTyxZQUFZLEdBQUcsSUFBSTtBQUN2RyxZQUFJLFFBQVEsSUFBSSxPQUFPLEtBQUssTUFBTSxPQUFXLFFBQU8sWUFBWSxHQUFHLElBQUk7QUFFdkUsWUFBSSxRQUFRLElBQUksYUFBYSxhQUFjLFFBQU8sWUFBWSxHQUFHLElBQUk7QUFDckUsY0FBTSxNQUFNLEtBQUssVUFBVSxDQUFDLE1BQU0sU0FBUyxNQUFNLE1BQU0sTUFBTSxRQUFRLE1BQU0sS0FBSyxDQUFDO0FBQ2pGLGNBQU0sU0FBUyxlQUFlLElBQUksR0FBRztBQUNyQyxZQUFJLFdBQVcsT0FBVyxRQUFPO0FBQ2pDLGNBQU0sT0FBTyxZQUFZLEdBQUcsSUFBSTtBQUNoQyx1QkFBZSxJQUFJLEtBQUssSUFBSTtBQUM1QixlQUFPO0FBQUEsTUFDVDtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQUEsRUFDQSxTQUFTLENBQUM7QUFBQSxFQUNWLGFBQWE7QUFDZixDQUFDOyIsCiAgIm5hbWVzIjogWyJyZWFkRmlsZVN5bmMiLCAid3JpdGVGaWxlU3luYyIsICJyZXNvbHZlIiwgImZyb21NYXJrZG93biIsICJnZm1Gcm9tTWFya2Rvd24iLCAiZ2ZtIiwgImxvY2FsaXplZCIsICJmcm9tTWFya2Rvd24iLCAiZ2ZtIiwgImdmbUZyb21NYXJrZG93biIsICJiYXNlIiwgIl9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lIiwgImRldmVsb3AiLCAicmVmZXJlbmNlIiwgInJlYWRGaWxlU3luYyIsICJyZXNvbHZlIiwgIl9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lIiwgIndyaXRlRmlsZVN5bmMiXQp9Cg==
