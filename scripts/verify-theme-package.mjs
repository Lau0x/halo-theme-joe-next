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

const optimizedGifAssets = [
  {
    path: 'templates/assets/img/lazyload.gif',
    width: 165,
    height: 124,
  },
  {
    path: 'templates/assets/img/lazyload_h.gif',
    width: 299,
    height: 171,
  },
];

const validateGifLzw = (data, minimumCodeSize, expectedPixels, label) => {
  if (minimumCodeSize < 2 || minimumCodeSize > 8) {
    throw new Error(`${label}: invalid LZW minimum code size ${minimumCodeSize}`);
  }
  if (data.length === 0) {
    throw new Error(`${label}: GIF image data must not be empty`);
  }

  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  const entryLengths = new Uint32Array(4096);
  const entryFirstValues = new Uint16Array(4096);
  for (let value = 0; value < clearCode; value += 1) {
    entryLengths[value] = 1;
    entryFirstValues[value] = value;
  }

  let codeSize;
  let nextCode;
  let previousLength;
  let previousFirstValue;
  const resetDictionary = () => {
    codeSize = minimumCodeSize + 1;
    nextCode = endCode + 1;
    previousLength = 0;
    previousFirstValue = 0;
  };
  resetDictionary();

  let bitOffset = 0;
  const readCode = () => {
    if (bitOffset + codeSize > data.length * 8) return null;
    let code = 0;
    for (let bit = 0; bit < codeSize; bit += 1) {
      code |= ((data[bitOffset >> 3] >> (bitOffset & 7)) & 1) << bit;
      bitOffset += 1;
    }
    return code;
  };

  let decodedPixels = 0;
  let sawClearCode = false;
  let sawEndCode = false;
  let sawKwKwKCode = false;
  let maximumCodeSize = codeSize;
  while (true) {
    const code = readCode();
    if (code == null) break;
    if (code === clearCode) {
      resetDictionary();
      sawClearCode = true;
      continue;
    }
    if (!sawClearCode) {
      throw new Error(`${label}: LZW stream must begin with a clear code`);
    }
    if (code === endCode) {
      sawEndCode = true;
      break;
    }

    let entryLength;
    let entryFirstValue;
    if (code < clearCode) {
      entryLength = 1;
      entryFirstValue = code;
    } else if (code < nextCode && entryLengths[code] !== 0) {
      entryLength = entryLengths[code];
      entryFirstValue = entryFirstValues[code];
    } else if (code === nextCode && previousLength !== 0) {
      entryLength = previousLength + 1;
      entryFirstValue = previousFirstValue;
      sawKwKwKCode = true;
    } else {
      throw new Error(`${label}: invalid LZW dictionary code ${code}`);
    }

    decodedPixels += entryLength;
    if (decodedPixels > expectedPixels) {
      throw new Error(`${label}: LZW stream decodes beyond the ${expectedPixels}-pixel frame`);
    }

    if (previousLength !== 0 && nextCode < 4096) {
      entryLengths[nextCode] = previousLength + 1;
      entryFirstValues[nextCode] = previousFirstValue;
      nextCode += 1;
      if (nextCode === 1 << codeSize && codeSize < 12) {
        codeSize += 1;
        maximumCodeSize = Math.max(maximumCodeSize, codeSize);
      }
    }
    previousLength = entryLength;
    previousFirstValue = entryFirstValue;
  }

  if (!sawEndCode) {
    throw new Error(`${label}: LZW stream is missing its end code`);
  }
  if (decodedPixels !== expectedPixels) {
    throw new Error(
      `${label}: LZW stream decoded ${decodedPixels} pixels, expected ${expectedPixels}`
    );
  }
  return { decodedPixels, maximumCodeSize, sawKwKwKCode };
};

const parseGif = (buffer, label) => {
  const requireBytes = (offset, length) => {
    if (offset < 0 || offset + length > buffer.length) {
      throw new Error(`${label}: truncated GIF data at byte ${offset}`);
    }
  };
  const readSubBlocks = (offset) => {
    const blocks = [];
    while (true) {
      requireBytes(offset, 1);
      const length = buffer[offset];
      offset += 1;
      if (length === 0) return { blocks, offset };
      requireBytes(offset, length);
      blocks.push(buffer.subarray(offset, offset + length));
      offset += length;
    }
  };

  requireBytes(0, 13);
  const header = buffer.subarray(0, 6).toString('ascii');
  if (header !== 'GIF89a') {
    throw new Error(`${label}: expected GIF89a header, got ${header}`);
  }
  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  const logicalScreenPacked = buffer[10];
  let offset = 13;
  if (logicalScreenPacked & 0x80) {
    offset += 3 * 2 ** ((logicalScreenPacked & 0x07) + 1);
    requireBytes(0, offset);
  }

  const frames = [];
  let pendingFrameControl = { delayCs: 0, disposal: 0 };
  let loopCount = null;
  let sawTrailer = false;

  while (offset < buffer.length) {
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0x3b) {
      sawTrailer = true;
      break;
    }
    if (marker === 0x21) {
      requireBytes(offset, 1);
      const extensionType = buffer[offset];
      offset += 1;
      if (extensionType === 0xf9) {
        requireBytes(offset, 6);
        const blockLength = buffer[offset];
        if (blockLength !== 4 || buffer[offset + 5] !== 0) {
          throw new Error(`${label}: invalid graphic control extension`);
        }
        const packed = buffer[offset + 1];
        pendingFrameControl = {
          delayCs: buffer.readUInt16LE(offset + 2),
          disposal: (packed >> 2) & 0x07,
        };
        offset += 6;
        continue;
      }
      if (extensionType === 0xff) {
        requireBytes(offset, 1);
        const applicationLength = buffer[offset];
        offset += 1;
        requireBytes(offset, applicationLength);
        const application = buffer.subarray(offset, offset + applicationLength).toString('ascii');
        offset += applicationLength;
        const result = readSubBlocks(offset);
        offset = result.offset;
        if (
          (application === 'NETSCAPE2.0' || application === 'ANIMEXTS1.0') &&
          result.blocks[0]?.length >= 3 &&
          result.blocks[0][0] === 1
        ) {
          loopCount = result.blocks[0].readUInt16LE(1);
        }
        continue;
      }
      offset = readSubBlocks(offset).offset;
      continue;
    }
    if (marker === 0x2c) {
      requireBytes(offset, 9);
      const left = buffer.readUInt16LE(offset);
      const top = buffer.readUInt16LE(offset + 2);
      const frameWidth = buffer.readUInt16LE(offset + 4);
      const frameHeight = buffer.readUInt16LE(offset + 6);
      const imagePacked = buffer[offset + 8];
      if (
        frameWidth === 0 ||
        frameHeight === 0 ||
        left + frameWidth > width ||
        top + frameHeight > height
      ) {
        throw new Error(
          `${label}: invalid frame rectangle ${frameWidth}x${frameHeight}+${left}+${top} within ${width}x${height}`
        );
      }
      offset += 9;
      if (imagePacked & 0x80) {
        offset += 3 * 2 ** ((imagePacked & 0x07) + 1);
        requireBytes(0, offset);
      }
      requireBytes(offset, 1);
      const minimumCodeSize = buffer[offset];
      offset += 1;
      const imageData = readSubBlocks(offset);
      offset = imageData.offset;
      const lzw = validateGifLzw(
        Buffer.concat(imageData.blocks),
        minimumCodeSize,
        frameWidth * frameHeight,
        `${label}: frame ${frames.length + 1}`
      );
      frames.push({
        ...pendingFrameControl,
        width: frameWidth,
        height: frameHeight,
        ...lzw,
      });
      pendingFrameControl = { delayCs: 0, disposal: 0 };
      continue;
    }
    throw new Error(`${label}: unexpected GIF block marker 0x${marker.toString(16)}`);
  }

  if (!sawTrailer || offset !== buffer.length) {
    throw new Error(`${label}: GIF trailer is missing or followed by unexpected data`);
  }
  return { width, height, frames, loopCount };
};

const validateOptimizedGifs = (assets, label) => {
  let combinedBytes = 0;
  for (const expected of optimizedGifAssets) {
    const buffer = assets.get(expected.path);
    if (!buffer) {
      throw new Error(`${label}: missing ${expected.path}`);
    }
    if (buffer.length >= 60000) {
      throw new Error(`${label}: ${expected.path} must be smaller than 60KB`);
    }
    combinedBytes += buffer.length;
    const gif = parseGif(buffer, `${label}: ${expected.path}`);
    const totalDelayCs = gif.frames.reduce((sum, frame) => sum + frame.delayCs, 0);
    if (gif.width !== expected.width || gif.height !== expected.height) {
      throw new Error(
        `${label}: ${expected.path} must be ${expected.width}x${expected.height}, got ${gif.width}x${gif.height}`
      );
    }
    if (gif.loopCount !== 0) {
      throw new Error(`${label}: ${expected.path} must contain an infinite animation loop marker`);
    }
    if (gif.frames.length !== 116 || totalDelayCs !== 354) {
      throw new Error(
        `${label}: ${expected.path} must contain 116 frames totaling 354 centiseconds`
      );
    }
    if (
      gif.frames.some(
        (frame, index) => frame.disposal !== 1 || frame.delayCs !== (index === 115 ? 9 : 3)
      )
    ) {
      throw new Error(
        `${label}: ${expected.path} must keep None disposal with 115x30ms and a final 90ms frame`
      );
    }
  }
  if (combinedBytes >= 85000) {
    throw new Error(`${label}: optimized lazy-load GIFs must total less than 85KB`);
  }
};

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
const archivesScriptPath = 'templates/assets/js/archives.js';
const archivesScript = readFileSync(resolve(archivesScriptPath), 'utf8');
const photosScriptPath = 'templates/assets/js/photos.js';
const photosScript = readFileSync(resolve(photosScriptPath), 'utf8');
const customScriptPath = 'templates/assets/js/custom.js';
const customScript = readFileSync(resolve(customScriptPath), 'utf8');
const indexScriptPath = 'templates/assets/js/index.js';
const indexScript = readFileSync(resolve(indexScriptPath), 'utf8');
const postScriptPath = 'templates/assets/js/post.js';
const postScript = readFileSync(resolve(postScriptPath), 'utf8');
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
const links = readFileSync(resolve('templates/modules/link.html'), 'utf8');
const themeSettingVariable = readFileSync(
  resolve('templates/modules/themeSettingVariable.html'),
  'utf8'
);
const actionsTemplatePath = 'templates/modules/common/actions.html';
const actionsTemplate = readFileSync(resolve(actionsTemplatePath), 'utf8');
const actionButtonCounts = { random: 1, mode: 2, back2top: 2, toc: 1 };
for (const [control, expectedCount] of Object.entries(actionButtonCounts)) {
  const buttonTags = [
    ...actionsTemplate.matchAll(
      new RegExp(String.raw`<button\b[^>]*class="joe_action_item ${control}"[^>]*>`, 'g')
    ),
  ].map((match) => match[0]);
  if (
    buttonTags.length !== expectedCount ||
    buttonTags.some(
      (tag) =>
        !/\btype="button"/.test(tag) ||
        !/\baria-label="[^"]+"/.test(tag) ||
        !/\btitle="[^"]+"/.test(tag) ||
        (control === 'mode' &&
          (!/\baria-pressed="false"/.test(tag) || !/\baria-label="深色模式"/.test(tag)))
    ) ||
    new RegExp(String.raw`<div\b[^>]*class="joe_action_item ${control}"`).test(actionsTemplate)
  ) {
    throw new Error(
      `${actionsTemplatePath}: ${control} actions must be named type=button controls${control === 'mode' ? ' with aria-pressed' : ''}`
    );
  }
}

const initModeMethod = commonScript.match(
  /initMode\(\)\s*\{([\s\S]*?)\n\t\},\n\t\/\* 加载条 \*\//
)?.[1];
if (
  !initModeMethod ||
  !initModeMethod.includes('.attr("aria-pressed", String(isDark))') ||
  /\.attr\("aria-label"/.test(initModeMethod) ||
  !/\.attr\("title", isDark \? "切换到浅色模式" : "切换到深色模式"\)/.test(initModeMethod)
) {
  throw new Error(
    `${commonScriptPath}: mode toggle must keep the 深色模式 label stable, synchronize aria-pressed and only update its action title`
  );
}

const cancelSpaceScrollMethod = commonScript.match(
  /cancelSpaceScroll\(\)\s*\{([\s\S]*?)\n\t\},\n\t\/\* 判断地址栏是否有锚点链接/
)?.[1];
if (
  !cancelSpaceScrollMethod ||
  !cancelSpaceScrollMethod.includes('elm.isContentEditable') ||
  !cancelSpaceScrollMethod.includes('"button"') ||
  !cancelSpaceScrollMethod.includes('"select"') ||
  !/if\s*\(key\s*===\s*32\)/.test(cancelSpaceScrollMethod) ||
  !/e\.preventDefault\(\)/.test(cancelSpaceScrollMethod)
) {
  throw new Error(
    `${commonScriptPath}: cancelSpaceScroll must preserve blank-page Space handling without blocking native controls`
  );
}

const sideMenuMobileMethod = commonScript.match(
  /sideMenuMobile\(\)\s*\{([\s\S]*?)\n\t\},\n\t\/\* 头部滚动 \*\//
)?.[1];
const navbarTemplatePath = 'templates/modules/macro/navbar.html';
const navbarTemplate = readFileSync(resolve(navbarTemplatePath), 'utf8');
if (
  !sideMenuMobileMethod ||
  !sideMenuMobileMethod.includes('`joe-slideout-panel-${index}`') ||
  !sideMenuMobileMethod.includes('.attr("aria-controls", bodyId)') ||
  !sideMenuMobileMethod.includes('syncPanelState') ||
  !/const\s+accordionDuration\s*=\s*window\.matchMedia\(\s*"\(prefers-reduced-motion: reduce\)"\s*\)\.matches\s*\?\s*0\s*:\s*"fast";/.test(
    sideMenuMobileMethod
  ) ||
  !sideMenuMobileMethod.includes('.hide(accordionDuration)') ||
  !sideMenuMobileMethod.includes('.toggle(accordionDuration)') ||
  (navbarTemplate.match(/<button\b[^>]*class="panel panel-toggle"[^>]*>/g)?.length ?? 0) !== 4 ||
  !/<button\b[^>]*class="link panel in"[^>]*aria-expanded="true"[^>]*>/.test(navbarTemplate) ||
  /<div\b[^>]*class="link panel"/.test(navbarTemplate) ||
  /<a\b[^>]*class="link panel in"[^>]*href="#"/.test(navbarTemplate)
) {
  throw new Error(
    `${navbarTemplatePath}: mobile accordion must use native buttons with runtime-unique controls, synchronized expanded state and zero reduced-motion duration`
  );
}
const navbarControlButtons = [
  ...navbarTemplate.matchAll(
    /<button\b[^>]*class="(?:link panel in|panel panel-toggle)"[^>]*>[\s\S]*?<\/button>/g
  ),
].map((match) => match[0]);
if (
  navbarControlButtons.length !== 5 ||
  navbarControlButtons.some(
    (button) =>
      !/<i\b[^>]*class="joe-font joe-icon-arrow-right"[^>]*aria-hidden="true"[^>]*>/.test(button)
  )
) {
  throw new Error(`${navbarTemplatePath}: accordion arrow icons must be decorative`);
}

const archivesTemplatePath = 'templates/archives.html';
const archivesTemplate = readFileSync(resolve(archivesTemplatePath), 'utf8');
const archivePanelButtons =
  archivesTemplate.match(
    /<button\s+[^>]*type="button"[^>]*class="panel in"[^>]*aria-expanded="true"[^>]*th:attr="aria-controls=\|archive-panel-\$\{archiveStat\.index\}-\$\{monthStat\.index\}\|"[^>]*>/g
  )?.length ?? 0;
const archivePanelBodies =
  archivesTemplate.match(
    /<ol\s+[^>]*class="panel-body"[^>]*th:id="\|archive-panel-\$\{archiveStat\.index\}-\$\{monthStat\.index\}\|"[^>]*>/g
  )?.length ?? 0;
const archiveExpanderMethod = archivesScript.match(/initExpander\(\)\s*\{([\s\S]*?)\n\t\},/)?.[1];
const archiveCollapseBlock = archiveExpanderMethod?.match(
  /if\s*\(\$this\.hasClass\("in"\)\)\s*\{([\s\S]*?)\n\s*\}\s*else\s*\{/
)?.[1];
const archivePanelButtonBlocks = [
  ...archivesTemplate.matchAll(/<button\b[^>]*class="panel in"[^>]*>[\s\S]*?<\/button>/g),
].map((match) => match[0]);
if (
  archivePanelButtons !== 2 ||
  archivePanelBodies !== 2 ||
  archivePanelButtonBlocks.length !== 2 ||
  archivePanelButtonBlocks.some(
    (button) =>
      !/<i\b[^>]*class="joe-font joe-icon-arrow-down"[^>]*aria-hidden="true"[^>]*>/.test(button)
  ) ||
  !archiveExpanderMethod ||
  !archiveExpanderMethod.includes('"transition-duration"') ||
  !archiveExpanderMethod.includes('prefersReducedMotion ? "0s" : ""') ||
  !archiveCollapseBlock ||
  !archiveCollapseBlock.includes('$panelBody[0].contains(document.activeElement)') ||
  !archiveCollapseBlock.includes('$this[0].focus()') ||
  archiveCollapseBlock.indexOf('$this[0].focus()') >
    archiveCollapseBlock.indexOf('$panelBody.attr("aria-hidden", "true").attr("inert", "")') ||
  !archiveExpanderMethod.includes('$panelBody.attr("aria-hidden", "true").attr("inert", "")') ||
  !archiveExpanderMethod.includes('$panelBody.removeAttr("inert").removeAttr("aria-hidden")') ||
  (archiveExpanderMethod.match(/\.attr\("aria-expanded", "(?:true|false)"\)/g)?.length ?? 0) !== 2
) {
  throw new Error(
    `${archivesTemplatePath}: timeline expanders must be labelled buttons with unique controlled panels, synchronized state and instant reduced-motion transitions`
  );
}

const photosTemplatePath = 'templates/photos.html';
const photosTemplate = readFileSync(resolve(photosTemplatePath), 'utf8');
const photosFilterTemplate = photosTemplate.match(
  /<nav\b[^>]*class="joe_photos__filter"[\s\S]*?<\/nav>/
)?.[0];
const photosStylesPath = 'templates/assets/css/photos.less';
const photosStyles = readFileSync(resolve(photosStylesPath), 'utf8');
const photosFilterStyles = photosStyles.match(
  /&__filter\s*\{([\s\S]*?)\n\s*\}\n\n\s*&__layout-switch/
)?.[1];
if (
  (photosTemplate.match(/<button\b[^>]*aria-pressed="(?:true|false)"[^>]*>/g)?.length ?? 0) !== 2 ||
  !photosFilterTemplate ||
  /<a(?:\s|>)/.test(photosFilterTemplate) ||
  /class="[^"]*\b(?:wow|animated)\b/.test(photosTemplate) ||
  !/\$\('\.joe_photos__filter button'\)\.on\('click'/.test(photosScript) ||
  !photosScript.includes(".attr('aria-pressed', 'true')") ||
  !photosScript.includes(".attr('aria-pressed', 'false')") ||
  !photosFilterStyles ||
  !/button\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/.test(photosFilterStyles) ||
  themeSettingVariable.includes('ThemeConfig.enable_photos_effect = true;')
) {
  throw new Error(
    `${photosTemplatePath}: filters must be stateful buttons with 44px minimum width and height and no dead WOW or hardcoded effect state`
  );
}

const paginationTemplatePath = 'templates/modules/common/pagination.html';
const paginationTemplate = readFileSync(resolve(paginationTemplatePath), 'utf8');
const paginationEllipsisCount = paginationTemplate.match(/>\.\.\.</g)?.length ?? 0;
const paginationEllipsisSpans =
  paginationTemplate.match(/<span aria-hidden="true">\.\.\.<\/span>/g)?.length ?? 0;
if (
  paginationEllipsisCount === 0 ||
  paginationEllipsisSpans !== paginationEllipsisCount ||
  /<a\b[^>]*href="#"[^>]*>\s*\.\.\.\s*<\/a>/.test(paginationTemplate)
) {
  throw new Error(
    `${paginationTemplatePath}: pagination ellipses must be non-interactive aria-hidden spans`
  );
}
const animationSettings = [
  ['enable_index_list_effect', 'theme.config.home.enable_index_list_effect'],
  ['enable_journal_effect', 'theme.config.journals.enable_journal_effect'],
  ['enable_friend_effect', 'theme.config.friends.enable_friend_effect'],
];
for (const [property, configPath] of animationSettings) {
  const serializedAssignment = `${property}: /*[[\${#bools.isTrue(${configPath})}]]*/ false,`;
  const assignmentCount = themeSettingVariable.split(serializedAssignment).length - 1;
  const tailGuard = `#bools.isTrue(${configPath})`;
  const tailGuardCount = tail.split(tailGuard).length - 1;
  if (assignmentCount !== 1 || tailGuardCount !== 1) {
    throw new Error(
      `animation setting ${configPath}: expected one #bools.isTrue serialization in themeSettingVariable.html and one matching tail.html guard`
    );
  }
}
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
const expectedWowCondition =
  "${(htmlType == 'journals' and #bools.isTrue(theme.config.journals.enable_journal_effect)) or (htmlType == 'friends' and #bools.isTrue(theme.config.friends.enable_friend_effect)) or (htmlType == 'index' and #bools.isTrue(theme.config.home.enable_index_list_effect))}";
const wowScriptCount = externalScripts.filter((script) => script.includes('wow.min.js')).length;
const wowBlock = tail.match(
  /<th:block\s+th:if="([^"]+)"\s*>\s*<script[^>]+wow\.min\.js[^>]*><\/script>\s*<\/th:block>/
);
if (wowScriptCount !== 1 || wowBlock?.[1] !== expectedWowCondition) {
  throw new Error(
    'templates/modules/macro/tail.html: WOW.js must load only when the matching journals, friends, or index animation setting is enabled'
  );
}

const expectedAnimateCondition =
  "${htmlType == 'archives' or htmlType == 'categories' or htmlType == 'tags' or htmlType == 'links' or htmlType == 'sheet' or htmlType == 'post' or ((htmlType == 'category' or htmlType == 'tag' or htmlType == 'author') and #bools.isTrue(theme.config.theme.enable_show_in_up)) or (htmlType == 'index' and (#bools.isTrue(theme.config.home.enable_index_list_effect) or #bools.isTrue(theme.config.home.enable_hot_category))) or (htmlType == 'journals' and #bools.isTrue(theme.config.journals.enable_journal_effect)) or (htmlType == 'friends' and #bools.isTrue(theme.config.friends.enable_friend_effect))}";
const animateStylesheetCount = links.match(/assets\/lib\/animate\/animate\.min\.css/g)?.length ?? 0;
const animateBlock = links.match(
  /<th:block\s+th:if="([^"]+)"\s*>\s*<link[^>]+animate\/animate\.min\.css[^>]*\/>\s*<\/th:block>/
);
if (animateStylesheetCount !== 1 || animateBlock?.[1] !== expectedAnimateCondition) {
  throw new Error(
    'templates/modules/link.html: Animate.css must use the exact page and feature dependency guard'
  );
}

const blogger = readFileSync(resolve('templates/modules/common/blogger.html'), 'utf8');
if (blogger.includes('assets/effect/bg/strips.js')) {
  throw new Error('templates/modules/common/blogger.html: strips.js must load after tail jQuery');
}
const stripsScript = externalScripts.find((script) =>
  script.includes('assets/effect/bg/strips.js')
);
if (
  !stripsScript ||
  !stripsScript.includes('th:if="${#bools.isTrue(theme.config.blogger.enable_strips)}"') ||
  !stripsScript.includes("strips.js?v='+theme.spec.version") ||
  !blogger.includes('<th:block th:if="${#bools.isTrue(theme.config.blogger.enable_strips)}">') ||
  !blogger.includes('<canvas id="canvas-strips" width="300" height="340"></canvas>')
) {
  throw new Error('templates/modules/macro/tail.html: strips.js script tag not found');
}
const stripsScriptPath = 'templates/assets/effect/bg/strips.js';
const stripsSource = readFileSync(resolve(stripsScriptPath), 'utf8');
const stripsSetGlobals = stripsSource.match(
  /function SetGlobals\(\)\s*\{([\s\S]*?)\n\s*\}\n\n\s*function InitializeConfetti/
)?.[1];
const stripsReadyHandler = stripsSource.match(
  /\$\(document\)\.ready\(function \(\) \{([\s\S]*?)\n\s*\}\),/
)?.[1];
if (
  !stripsSetGlobals ||
  !stripsReadyHandler ||
  !/canvas1\s*=\s*document\.getElementById\("canvas-strips"\);\s*if \(!canvas1\) return false;\s*ctx\s*=\s*canvas1\.getContext\("2d"\);\s*if \(!ctx\) return false;/.test(
    stripsSetGlobals
  ) ||
  !stripsSetGlobals.includes('return true;') ||
  !stripsReadyHandler.includes('if (!SetGlobals()) return;') ||
  stripsReadyHandler.indexOf('if (!SetGlobals()) return;') >
    stripsReadyHandler.indexOf('InitializeButton()')
) {
  throw new Error(
    `${stripsScriptPath}: strips must skip initialization before getContext when its canvas is absent`
  );
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

const postItem = readFileSync(resolve('templates/modules/macro/post_item.html'), 'utf8');
const expectedPostItemSizes = 'sizes="(max-width: 768px) 120px, (max-width: 1200px) 185px, 210px"';
if (
  !postItem.includes('th:data-srcset=') ||
  /th:srcset\s*=/.test(postItem) ||
  !postItem.includes(expectedPostItemSizes) ||
  !postItem.includes('loading="lazy"') ||
  !postItem.includes('decoding="async"')
) {
  throw new Error(
    'templates/modules/macro/post_item.html: list covers must use data-srcset, exact responsive sizes, loading=lazy, and decoding=async'
  );
}

const categories = readFileSync(resolve('templates/categories.html'), 'utf8');
if (
  !categories.includes("title = ${theme.config.categories.categories_title ?: '全部分类'}") ||
  categories.includes("title = ${theme.config.categories.categories_title ?: '全部标签'}")
) {
  throw new Error('templates/categories.html: title fallback must be 全部分类');
}

const author = readFileSync(resolve('templates/author.html'), 'utf8');
if (
  !author.includes("title = ${author.spec.displayName ?: '作者归档'}") ||
  author.includes('title = ${tag.spec.displayName')
) {
  throw new Error('templates/author.html: title must use author.spec.displayName');
}

const sourceJsDir = resolve('templates/assets/js');
for (const file of readdirSync(sourceJsDir).filter((name) => name.endsWith('.js'))) {
  execFileSync(process.execPath, ['--check', resolve(sourceJsDir, file)], { stdio: 'pipe' });
}

const globalStyles = readFileSync(resolve('templates/assets/css/global.less'), 'utf8');
const postStyles = readFileSync(resolve('templates/assets/css/post.less'), 'utf8');
const overrideStyles = readFileSync(
  resolve('templates/assets/css/joe-next-overrides.less'),
  'utf8'
);
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

const reducedMotionBlock = overrideStyles.match(
  /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after\s*\{([\s\S]*?)\}\s*\}/
);
const reducedMotionRules = reducedMotionBlock?.[1] ?? '';
const focusVisibleRules = overrideStyles.match(/:focus-visible\s*\{([\s\S]*?)\}/)?.[1] ?? '';
const archiveFocusVisibleRules = overrideStyles.match(
  /\.joe_archives-timelist \.panel\s*\{[\s\S]*?&:focus-visible\s*\{([\s\S]*?)\}/
)?.[1];
const paginationFocusVisibleRules = overrideStyles.match(
  /\.joe_pagination a:focus-visible\s*\{([\s\S]*?)\}/
)?.[1];
const panelToggleRules = overrideStyles.match(
  /\.joe_header__slideout-menu \.panel-toggle\s*\{([\s\S]*?)\n\}/
)?.[1];
const touchTargetRules = overrideStyles.match(
  /@media\s*\(max-width:\s*768px\),\s*\(pointer:\s*coarse\)\s*\{([\s\S]*?)\n\}\n\n@media\s*\(prefers-reduced-motion:/
)?.[1];
if (
  !focusVisibleRules.includes('outline: 3px solid #000 !important;') ||
  !focusVisibleRules.includes('outline-offset: 2px;') ||
  !focusVisibleRules.includes('box-shadow: 0 0 0 2px #fff !important;') ||
  !archiveFocusVisibleRules?.includes('outline: 2px solid #000 !important;') ||
  !archiveFocusVisibleRules.includes('outline-offset: -4px;') ||
  !archiveFocusVisibleRules.includes('box-shadow: inset 0 0 0 2px #fff !important;') ||
  !paginationFocusVisibleRules?.includes('outline: 2px solid #000 !important;') ||
  !paginationFocusVisibleRules.includes('outline-offset: -4px;') ||
  !paginationFocusVisibleRules.includes('box-shadow: inset 0 0 0 2px #fff !important;')
) {
  throw new Error(
    'templates/assets/css/joe-next-overrides.less: focus-visible must use fixed black and white rings, with inset archive and pagination variants that are not clipped'
  );
}
if (
  !panelToggleRules ||
  !panelToggleRules.includes('width: 44px;') ||
  !panelToggleRules.includes('min-width: 44px;') ||
  !panelToggleRules.includes('height: 44px;') ||
  !touchTargetRules ||
  !/\.joe_action_item\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/.test(touchTargetRules) ||
  !/\.joe_pagination li > a,[\s\S]*?\.joe_pagination li > span\s*\{[\s\S]*?width:\s*32px;[\s\S]*?min-width:\s*32px;[\s\S]*?height:\s*44px;[\s\S]*?min-height:\s*44px;[\s\S]*?line-height:\s*44px;/.test(
    touchTargetRules
  ) ||
  touchTargetRules.includes('min-width: 44px;')
) {
  throw new Error(
    'templates/assets/css/joe-next-overrides.less: mobile accordion and actions must keep 44px touch targets while pagination stays 32px wide and 44px high to avoid 390px overflow'
  );
}
if (
  !reducedMotionRules.includes('animation-duration: 0.01ms !important;') ||
  !reducedMotionRules.includes('animation-delay: 0s !important;') ||
  !reducedMotionRules.includes('animation-iteration-count: 1 !important;') ||
  !reducedMotionRules.includes('transition-duration: 0.01ms !important;') ||
  !reducedMotionRules.includes('transition-delay: 0s !important;') ||
  !reducedMotionRules.includes('scroll-behavior: auto !important;') ||
  /\b(?:animation|transition)\s*:\s*none\b/.test(reducedMotionRules)
) {
  throw new Error(
    'templates/assets/css/joe-next-overrides.less: reduced-motion must shorten animations and transitions, remove delays and disable smooth scrolling without animation:none or transition:none'
  );
}

const visualPolishBlock = overrideStyles.match(
  /\/\* ---- restrained visual polish: begin ---- \*\/([\s\S]*?)\/\* ---- restrained visual polish: end ---- \*\//
)?.[1];
const visualPolishRules = visualPolishBlock
  ? [...visualPolishBlock.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
      selector: match[1].trim().replace(/\s+/g, ' '),
      body: match[2],
    }))
  : [];
const findVisualRule = (selector) =>
  visualPolishRules.find((rule) => rule.selector === selector)?.body ?? '';
const minorLightRules = findVisualRule(':root');
const minorDarkRules = findVisualRule("html[data-mode='dark']");
if (
  (visualPolishBlock?.match(/--minor\s*:/g)?.length ?? 0) !== 2 ||
  !/--minor:\s*#646c79;/.test(minorLightRules) ||
  !/--minor:\s*#a8b0bb;/.test(minorDarkRules)
) {
  throw new Error(
    'templates/assets/css/joe-next-overrides.less: visual polish must keep fixed light and dark --minor contrast tokens'
  );
}
const relativeLuminance = (hex) => {
  const channels = hex.match(/[a-f\d]{2}/gi).map((channel) => parseInt(channel, 16) / 255);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};
const contrastRatio = (foreground, background) => {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
};
const lightMinorBackgrounds = ['#ffffff', '#f5f5f5', '#f2f6fc', '#e9f2ff'];
if (
  lightMinorBackgrounds.some((background) => contrastRatio('#646c79', background) < 4.5) ||
  contrastRatio('#a8b0bb', '#232323') < 4.5
) {
  throw new Error(
    'templates/assets/css/joe-next-overrides.less: --minor tokens must meet 4.5:1 contrast on the enumerated light and dark theme surfaces'
  );
}

const lightHeaderSelector = '#Joe .joe_header__above';
const lightSurfaceSelector =
  '#Joe .joe_index, #Joe .joe_archive, #Joe .joe_detail, #Joe .joe_comment, #Joe .toc-container';
const darkHeaderSelector = "html[data-mode='dark'] #Joe .joe_header__above";
const darkSurfaceSelector =
  "html[data-mode='dark'] #Joe .joe_index, html[data-mode='dark'] #Joe .joe_archive, html[data-mode='dark'] #Joe .joe_detail, html[data-mode='dark'] #Joe .joe_comment, html[data-mode='dark'] #Joe .toc-container";
const commentTitleSelector = '.joe_comment .joe_comment_box .box_title h2';
const parseVisualDeclarations = ({ selector, body }) => {
  const declarations = new Map();
  for (const rawDeclaration of body.split(';')) {
    const declaration = rawDeclaration.trim();
    if (!declaration) continue;
    const separator = declaration.indexOf(':');
    const property = declaration.slice(0, separator).trim();
    const value = declaration
      .slice(separator + 1)
      .trim()
      .replace(/\s+/g, ' ');
    if (separator < 1 || !value || declarations.has(property)) {
      throw new Error(
        `templates/assets/css/joe-next-overrides.less: ${selector} must contain unique valid declarations`
      );
    }
    declarations.set(property, value);
  }
  return declarations;
};
const parsedVisualRules = visualPolishRules.map((rule) => ({
  selector: rule.selector,
  declarations: parseVisualDeclarations(rule),
}));
const expectedVisualDeclarations = new Map([
  [':root', new Map([['--minor', '#646c79']])],
  ["html[data-mode='dark']", new Map([['--minor', '#a8b0bb']])],
  [
    lightHeaderSelector,
    new Map([['box-shadow', 'inset 0 -1px 0 var(--classC), 0 1px 6px rgba(15, 23, 42, 0.06)']]),
  ],
  [
    lightSurfaceSelector,
    new Map([
      ['border', '1px solid var(--classC)'],
      ['box-shadow', '0 2px 8px rgba(15, 23, 42, 0.06)'],
    ]),
  ],
  [
    darkHeaderSelector,
    new Map([['box-shadow', 'inset 0 -1px 0 var(--classC), 0 1px 6px rgba(0, 0, 0, 0.28)']]),
  ],
  [darkSurfaceSelector, new Map([['box-shadow', '0 2px 8px rgba(0, 0, 0, 0.24)']])],
  [
    commentTitleSelector,
    new Map([
      ['display', 'flex'],
      ['align-items', 'center'],
      ['gap', '10px'],
      ['width', '100%'],
      ['padding', '20px 0 16px'],
      ['background', 'none'],
      ['color', 'var(--minor)'],
      ['filter', 'none'],
      ['text-align', 'left !important'],
    ]),
  ],
  [
    `${commentTitleSelector}::before`,
    new Map([
      ['flex', '0 0 24px'],
      ['width', '24px'],
      ['height', '3px'],
      ['border-radius', '2px'],
      ['background', 'var(--theme)'],
      ['content', "''"],
    ]),
  ],
  [
    `${commentTitleSelector}::after`,
    new Map([
      ['flex', '1'],
      ['height', '1px'],
      ['background', 'var(--classC)'],
      ['content', "''"],
    ]),
  ],
]);
if (
  !visualPolishBlock ||
  parsedVisualRules.length !== expectedVisualDeclarations.size ||
  [...expectedVisualDeclarations].some(([selector, expectedDeclarations]) => {
    const matchingRules = parsedVisualRules.filter((rule) => rule.selector === selector);
    if (matchingRules.length !== 1) return true;
    const actualDeclarations = matchingRules[0].declarations;
    return (
      actualDeclarations.size !== expectedDeclarations.size ||
      [...expectedDeclarations].some(
        ([property, value]) => actualDeclarations.get(property) !== value
      )
    );
  }) ||
  parsedVisualRules.some(({ selector }) => !expectedVisualDeclarations.has(selector))
) {
  throw new Error(
    'templates/assets/css/joe-next-overrides.less: visual polish rules must use only the approved selectors and exact non-duplicated declarations'
  );
}

const commentTitleRules = findVisualRule(commentTitleSelector);
const commentTitleBeforeRules = findVisualRule(`${commentTitleSelector}::before`);
const commentTitleAfterRules = findVisualRule(`${commentTitleSelector}::after`);
const commentTemplates = [
  'templates/modules/macro/comment.html',
  'templates/links.html',
  'templates/page_links.html',
];
if (
  !commentTitleRules.includes('padding: 20px 0 16px;') ||
  !commentTitleRules.includes('background: none;') ||
  !commentTitleRules.includes('color: var(--minor);') ||
  !commentTitleRules.includes('filter: none;') ||
  !commentTitleRules.includes('display: flex;') ||
  /(?:url\(|background-image|110px)/.test(commentTitleRules) ||
  !commentTitleBeforeRules.includes('width: 24px;') ||
  !commentTitleBeforeRules.includes('height: 3px;') ||
  !commentTitleBeforeRules.includes('background: var(--theme);') ||
  !commentTitleBeforeRules.includes("content: '';") ||
  !commentTitleAfterRules.includes('flex: 1;') ||
  !commentTitleAfterRules.includes('height: 1px;') ||
  !commentTitleAfterRules.includes('background: var(--classC);') ||
  !commentTitleAfterRules.includes("content: '';") ||
  commentTemplates.some(
    (path) =>
      !/<div class="box_title">\s*<h2>评论区<\/h2>\s*<\/div>/.test(
        readFileSync(resolve(path), 'utf8')
      )
  )
) {
  throw new Error(
    'templates/assets/css/joe-next-overrides.less: comment title must keep its h2 while replacing bitmap padding with a theme marker and divider'
  );
}

const initSwiperMethod = indexScript.match(
  /initSwiper\(\)\s*\{([\s\S]*?new Swiper\([\s\S]*?\n\s*\}\);\n\s*\})\s*,/
)?.[1];
if (
  !initSwiperMethod ||
  !/const\s+prefersReducedMotion\s*=\s*window\.matchMedia\(\s*['"]\(prefers-reduced-motion:\s*reduce\)['"]\s*\)\.matches\s*;/.test(
    initSwiperMethod
  ) ||
  !/speed\s*:\s*prefersReducedMotion\s*\?\s*0\s*:\s*ThemeConfig\.banner_speed\s*,/.test(
    initSwiperMethod
  ) ||
  !/autoplay\s*:\s*prefersReducedMotion\s*\?\s*false\s*:\s*ThemeConfig\.enable_banner_autoplay\s*\?\s*\{\s*delay\s*:\s*ThemeConfig\.banner_delay\s*,\s*disableOnInteraction\s*:\s*false\s*,?\s*\}\s*:\s*false\s*,/.test(
    initSwiperMethod
  )
) {
  throw new Error(
    `${indexScriptPath}: Swiper must disable speed and autoplay only for prefers-reduced-motion`
  );
}

const tocOptions = postScript.match(/tocbot\.init\(\{([\s\S]*?)\n\s*\}\);/)?.[1];
if (
  !tocOptions ||
  !/scrollSmooth\s*:\s*!window\.matchMedia\(\s*['"]\(prefers-reduced-motion:\s*reduce\)['"]\s*\)\.matches\s*,/.test(
    tocOptions
  )
) {
  throw new Error(
    `${postScriptPath}: tocbot smooth scrolling must be disabled for prefers-reduced-motion`
  );
}

const indexScrollToBlocks = [...indexScript.matchAll(/window\.scrollTo\(\{([\s\S]*?)\}\);/g)].map(
  (match) => match[1]
);
if (
  indexScrollToBlocks.length !== 2 ||
  indexScrollToBlocks.some(
    (block) =>
      /behavior\s*:\s*['"]smooth['"]/.test(block) ||
      !/behavior\s*:\s*window\.matchMedia\(\s*['"]\(prefers-reduced-motion:\s*reduce\)['"]\s*\)\.matches\s*\?\s*['"]auto['"]\s*:\s*['"]smooth['"]/.test(
        block
      )
  )
) {
  throw new Error(
    `${indexScriptPath}: both scrollTo calls must use auto for prefers-reduced-motion and smooth otherwise`
  );
}

const back2TopMethod = commonScript.match(
  /back2Top\(\)\s*\{([\s\S]*?)\n\t\},\n\t\/\* 激活侧边栏人生倒计时 \*\//
)?.[1];
if (
  !back2TopMethod ||
  (back2TopMethod.match(/\$\(["']html,body["']\)\.animate\(/g)?.length ?? 0) !== 1 ||
  !/const\s+scrollDuration\s*=\s*window\.matchMedia\(\s*["']\(prefers-reduced-motion:\s*reduce\)["']\s*\)\.matches\s*\?\s*0\s*:\s*ThemeConfig\.enable_back2top_smooth\s*\?\s*500\s*:\s*0\s*;/.test(
    back2TopMethod
  ) ||
  !/\$\(["']html,body["']\)\.animate\([\s\S]*?,\s*scrollDuration\s*\);/.test(back2TopMethod)
) {
  throw new Error(
    `${commonScriptPath}: back2Top must use zero-duration jQuery scrolling for prefers-reduced-motion`
  );
}

const scrollToHashMethod = commonScript.match(
  /scrollToHash\(hash, duration = 0\)\s*\{([\s\S]*?)\n\t\},\n\t\/\* 加载鼠标特效 \*\//
)?.[1];
if (
  !scrollToHashMethod ||
  (scrollToHashMethod.match(/\$\(["']html,body["']\)\.animate\(/g)?.length ?? 0) !== 1 ||
  !/const\s+effectiveDuration\s*=\s*window\.matchMedia\(\s*["']\(prefers-reduced-motion:\s*reduce\)["']\s*\)\.matches\s*\?\s*0\s*:\s*duration\s*;/.test(
    scrollToHashMethod
  ) ||
  !/if\s*\(effectiveDuration\s*>\s*0\)/.test(scrollToHashMethod) ||
  !/\$\(["']html,body["']\)\.animate\([\s\S]*?,\s*effectiveDuration\s*\);/.test(scrollToHashMethod)
) {
  throw new Error(
    `${commonScriptPath}: scrollToHash must force its effective duration to zero for prefers-reduced-motion`
  );
}

const commentScrollBlock = customScript.match(
  /\/\/ 下滑到评论区([\s\S]*?)\n\s*\}\);\n\s*\}\n\s*\}/
)?.[1];
if (
  !commentScrollBlock ||
  (commentScrollBlock.match(/\$\(["']html,body["']\)\.animate\(/g)?.length ?? 0) !== 1 ||
  !/const\s+scrollDuration\s*=\s*window\.matchMedia\(\s*["']\(prefers-reduced-motion:\s*reduce\)["']\s*\)\.matches\s*\?\s*0\s*:\s*500\s*;/.test(
    commentScrollBlock
  ) ||
  !/\$\(["']html,body["']\)\.animate\([\s\S]*?,\s*scrollDuration\s*\);/.test(commentScrollBlock)
) {
  throw new Error(
    `${customScriptPath}: comment jump must use zero-duration jQuery scrolling for prefers-reduced-motion`
  );
}

for (const path of excludedPackagePaths) {
  if (existsSync(resolve(path))) {
    throw new Error(`${path}: unused development asset must not be packaged`);
  }
}

const sourceGifAssets = new Map(
  optimizedGifAssets.map(({ path }) => {
    if (!existsSync(resolve(path))) {
      throw new Error(`source theme: missing ${path}`);
    }
    return [path, readFileSync(resolve(path))];
  })
);
validateOptimizedGifs(sourceGifAssets, 'source theme');

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
  for (const { path } of optimizedGifAssets) {
    if (!packagedFiles.includes(path)) {
      throw new Error(`${zipPath}: missing ${path}`);
    }
  }

  const packagedGifAssets = new Map(
    optimizedGifAssets.map(({ path }) => [path, execFileSync('unzip', ['-p', zipPath, path])])
  );
  validateOptimizedGifs(packagedGifAssets, zipPath);
  for (const { path } of optimizedGifAssets) {
    if (!packagedGifAssets.get(path).equals(sourceGifAssets.get(path))) {
      throw new Error(`${zipPath}: packaged ${path} does not match the source asset`);
    }
  }
}

console.log(`Theme package verification passed: ${expectedIdentity['metadata.name']} v${version}`);
