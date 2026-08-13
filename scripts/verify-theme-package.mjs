import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { load as parseYaml } from 'js-yaml';

const expectedIdentity = {
  'metadata.name': 'theme-Joe3',
  'spec.settingName': 'theme-Joe-setting',
  'spec.configMapName': 'theme-Joe-configMap',
};

const excludedPackagePaths = [
  'templates/assets/img/dp',
  'templates/assets/lib/font-awesome/less',
  'templates/assets/lib/font-awesome/scss',
  'templates/assets/lib/font-awesome/HELP-US-OUT.txt',
  'templates/assets/lib/font-awesome/css/font-awesome.css',
  'templates/assets/lib/font-awesome/css/font-awesome.css.map',
  'templates/assets/lib/pdfjs/web/demo.pdf',
  'templates/assets/lib/prism/prism.css',
  'templates/assets/lib/prism/prism.js',
  'templates/assets/lib/vue@2.6.10',
];

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : true;
};

const readField = (document, path) =>
  path.split('.').reduce((value, key) => value?.[key], document);

const validateTheme = (document, label) => {
  for (const [path, expected] of Object.entries(expectedIdentity)) {
    const actual = readField(document, path);
    if (actual !== expected) {
      throw new Error(`${label}: ${path} must be ${expected}, got ${actual}`);
    }
  }

  if (document.metadata?.annotations?.['store.halo.run/app-id'] != null) {
    throw new Error(`${label}: store.halo.run/app-id must not be present`);
  }

  if (!document.spec?.version) {
    throw new Error(`${label}: spec.version is required`);
  }
};

const sourcePath = resolve('theme.yaml');
const sourceTheme = parseYaml(readFileSync(sourcePath, 'utf8'));
validateTheme(sourceTheme, 'theme.yaml');

const version = String(sourceTheme.spec.version);
if (!/^\d+(?:\.\d+){2,3}(?:-rc\.\d{2})?$/.test(version)) {
  throw new Error(`theme.yaml: unsupported version format ${version}`);
}

const changelog = readFileSync(resolve('CHANGELOG.md'), 'utf8');
if (!changelog.includes(`## [${version}]`)) {
  throw new Error(`CHANGELOG.md has no ${version} release section`);
}

const configScriptIds = {
  'templates/modules/themeSettingVariable.html': 'theme-setting-variable',
  'templates/modules/postMetaVariable.html': 'post-meta-variable',
  'templates/modules/pageMetaVariable.html': 'page-meta-variable',
  'templates/modules/config.html': 'theme-config-runtime',
};
const templateRoot = resolve('templates');
const htmlTemplates = readdirSync(templateRoot, { recursive: true })
  .filter((path) => path.endsWith('.html'))
  .map((path) => ({ path, source: readFileSync(resolve(templateRoot, path), 'utf8') }));
if (htmlTemplates.some(({ source }) => /id\s*=\s*(["'])theme-config-getter\1/.test(source))) {
  throw new Error('templates: legacy duplicate id theme-config-getter must not be present');
}
const seenConfigScriptIds = new Set();
for (const [path, id] of Object.entries(configScriptIds)) {
  const template = readFileSync(resolve(path), 'utf8');
  if (!template.includes(`id="${id}"`)) {
    throw new Error(`${path}: expected config script id ${id}`);
  }
  if (template.includes('id="theme-config-getter"')) {
    throw new Error(`${path}: legacy duplicate id theme-config-getter must not be present`);
  }
  if (seenConfigScriptIds.has(id)) {
    throw new Error(`${path}: duplicate config script id ${id}`);
  }
  const globalCount = htmlTemplates.reduce(
    (count, { source }) =>
      count + (source.match(new RegExp(String.raw`id\s*=\s*(["'])${id}\1`, 'g'))?.length ?? 0),
    0
  );
  if (globalCount !== 1) {
    throw new Error(`templates: expected exactly one config script id ${id}, found ${globalCount}`);
  }
  seenConfigScriptIds.add(id);
}

const commonScriptPath = 'templates/assets/js/common.js';
const commonScript = readFileSync(resolve(commonScriptPath), 'utf8');
if (commonScript.includes('#theme-config-getter')) {
  throw new Error(
    `${commonScriptPath}: legacy config script id theme-config-getter must not be referenced`
  );
}
const cleanMethod = commonScript.match(
  /clean\(\)\s*\{([\s\S]*?)commonContext\.loadingBar\.hide\(\);[\s\S]*?\n\t\},/
)?.[0];
if (!cleanMethod) {
  throw new Error(`${commonScriptPath}: clean method could not be verified`);
}
for (const id of Object.values(configScriptIds)) {
  const cleanupPattern = new RegExp(String.raw`\$\((["'])[^"']*#${id}[^"']*\1\)\.remove\(\);`);
  if (!cleanupPattern.test(cleanMethod)) {
    throw new Error(`${commonScriptPath}: clean method must remove #${id}`);
  }
}

for (const path of [
  'templates/modules/post_operate.html',
  'templates/modules/post_operate_aside.html',
]) {
  const template = readFileSync(resolve(path), 'utf8');
  if (template.includes('id="share_to_weixin"')) {
    throw new Error(`${path}: share_to_weixin must be a reusable class, not a duplicate id`);
  }
  if (!template.includes('class="share_to_weixin"')) {
    throw new Error(`${path}: share_to_weixin class is required`);
  }
}

const visibilityGuards = {
  'templates/archives.html': 3,
  'templates/moment.html': 1,
  'templates/moments.html': 1,
  'templates/post.html': 2,
  'templates/modules/macro/aside_hot_post.html': 1,
  'templates/modules/macro/banner_item.html': 1,
  'templates/modules/macro/banner_item_data.html': 2,
  'templates/modules/macro/latest.html': 1,
  'templates/modules/macro/post_item.html': 1,
  'templates/modules/macro/relate.html': 2,
  'templates/modules/macro/relate_cards.html': 2,
  'templates/modules/widgets/asideWidget.html': 1,
};

for (const [path, minimumCount] of Object.entries(visibilityGuards)) {
  const template = readFileSync(resolve(path), 'utf8');
  const count =
    template.match(/th:if\s*=\s*"\$\{[^\"]*visible\.name\s*==\s*'PUBLIC'[^\"]*\}"/g)?.length ?? 0;
  if (count < minimumCount) {
    throw new Error(
      `${path}: expected at least ${minimumCount} PUBLIC visibility guards, found ${count}`
    );
  }
}

const layout = readFileSync(resolve('templates/modules/layout.html'), 'utf8');
const layoutExternalScripts = [...layout.matchAll(/<script[^>]+(?:th:src|src)=[^>]+>/g)].map(
  (match) => match[0]
);
const jqueryScript = layoutExternalScripts.find((script) => script.includes('jquery@3.7.1'));
if (!jqueryScript) {
  throw new Error('templates/modules/layout.html: synchronous jQuery script tag not found');
}
const globalJqueryScripts = htmlTemplates.flatMap(({ path, source }) =>
  [...source.matchAll(/<script[^>]+(?:th:src|src)=[^>]+>/g)]
    .map((match) => match[0])
    .filter((script) => script.includes('jquery@3.7.1'))
    .map((script) => ({ path, script }))
);
if (
  globalJqueryScripts.length !== 1 ||
  globalJqueryScripts[0].path !== 'modules/layout.html' ||
  globalJqueryScripts[0].script !== jqueryScript
) {
  throw new Error(
    `templates: expected one jQuery 3.7.1 script in modules/layout.html, found ${globalJqueryScripts.length}`
  );
}
if (/\bdefer\b|\basync\b/.test(jqueryScript)) {
  throw new Error(
    'templates/modules/layout.html: jQuery must load synchronously before content plugin scripts'
  );
}

const tail = readFileSync(resolve('templates/modules/macro/tail.html'), 'utf8');
const externalScripts = [...tail.matchAll(/<script[^>]+(?:th:src|src)=[^>]+>/g)].map(
  (match) => match[0]
);
if (externalScripts.some((script) => script.includes('jquery@3.7.1'))) {
  throw new Error('templates/modules/macro/tail.html: jQuery must not be loaded twice');
}
const nonDeferredScripts = externalScripts.filter((script) => !/\bdefer\b/.test(script));
if (nonDeferredScripts.length > 0) {
  throw new Error(
    `templates/modules/macro/tail.html: all external theme scripts must use defer: ${nonDeferredScripts.join(', ')}`
  );
}

const blogger = readFileSync(resolve('templates/modules/common/blogger.html'), 'utf8');
if (blogger.includes('assets/effect/bg/strips.js')) {
  throw new Error('templates/modules/common/blogger.html: strips.js must load after tail jQuery');
}
const stripsScript = externalScripts.find((script) =>
  script.includes('assets/effect/bg/strips.js')
);
if (!stripsScript) {
  throw new Error('templates/modules/macro/tail.html: strips.js script tag not found');
}

const hotCategory = readFileSync(resolve('templates/modules/macro/hot_category.html'), 'utf8');
for (const source of ['category.spec.cover', 'custom_data.hot_custom_img']) {
  if (
    !hotCategory.includes(`th:data-src="\${${source}}"`) ||
    !hotCategory.includes(`th:data-srcset="\${${source}}"`)
  ) {
    throw new Error(
      `templates/modules/macro/hot_category.html: ${source} must lazy-load both src and srcset`
    );
  }
}

const sourceJsDir = resolve('templates/assets/js');
for (const file of readdirSync(sourceJsDir).filter((name) => name.endsWith('.js'))) {
  execFileSync(process.execPath, ['--check', resolve(sourceJsDir, file)], { stdio: 'pipe' });
}

const globalStyles = readFileSync(resolve('templates/assets/css/global.less'), 'utf8');
const postStyles = readFileSync(resolve('templates/assets/css/post.less'), 'utf8');
for (const [path, styles] of [
  ['templates/assets/css/global.less', globalStyles],
  ['templates/assets/css/post.less', postStyles],
]) {
  if (styles.includes('#share_to_weixin')) {
    throw new Error(`${path}: share_to_weixin selector must use a reusable class`);
  }
}
if (/data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]{50000,}/.test(globalStyles)) {
  throw new Error(
    'templates/assets/css/global.less: oversized inline image must be a static asset'
  );
}

for (const path of excludedPackagePaths) {
  if (existsSync(resolve(path))) {
    throw new Error(`${path}: unused development asset must not be packaged`);
  }
}

const tagOption = option('--tag');
if (tagOption === true) {
  throw new Error('--tag requires a value');
}

if (tagOption) {
  const tag = String(tagOption);
  if (tag !== `v${version}`) {
    throw new Error(`release tag ${tag} does not match theme version v${version}`);
  }

  const tagType = execFileSync('git', ['cat-file', '-t', tag], {
    encoding: 'utf8',
  }).trim();
  if (tagType !== 'tag') {
    throw new Error(`release tag ${tag} must be annotated`);
  }
}

const zipOption = option('--zip');
if (zipOption) {
  const zipPath = resolve(zipOption === true ? `dist/theme-Joe3-${version}.zip` : zipOption);
  if (!existsSync(zipPath)) {
    throw new Error(`theme package not found: ${zipPath}`);
  }

  const packagedYaml = execFileSync('unzip', ['-p', zipPath, 'theme.yaml'], {
    encoding: 'utf8',
  });
  const packagedTheme = parseYaml(packagedYaml);
  validateTheme(packagedTheme, 'packaged theme.yaml');

  if (String(packagedTheme.spec.version) !== version) {
    throw new Error(`packaged version ${packagedTheme.spec.version} does not match ${version}`);
  }

  const packagedFiles = execFileSync('unzip', ['-Z1', zipPath], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  for (const path of excludedPackagePaths) {
    if (packagedFiles.some((file) => file === path || file.startsWith(`${path}/`))) {
      throw new Error(`${zipPath}: excluded package path found: ${path}`);
    }
  }
}

console.log(`Theme package verification passed: ${expectedIdentity['metadata.name']} v${version}`);
