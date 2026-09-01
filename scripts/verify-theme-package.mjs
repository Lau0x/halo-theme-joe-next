import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { load as parseYaml, loadAll as parseYamlDocuments } from 'js-yaml';
import { parseAst } from 'rolldown/parseAst';

const expectedIdentity = {
  'metadata.name': 'theme-Joe3',
  'spec.settingName': 'theme-Joe-setting',
  'spec.configMapName': 'theme-Joe-configMap',
};
const expectedThemeLogo = '/themes/theme-Joe3/assets/img/Joe3.png';
const themeLogoPackagePath = 'templates/assets/img/Joe3.png';
const expectedRootYamlPaths = ['annotation-setting.yaml', 'settings.yaml', 'theme.yaml'];

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

const fontAwesomeLegacyFontPaths = [
  'templates/assets/lib/font-awesome/fonts/FontAwesome.otf',
  'templates/assets/lib/font-awesome/fonts/fontawesome-webfont.eot',
  'templates/assets/lib/font-awesome/fonts/fontawesome-webfont.svg',
  'templates/assets/lib/font-awesome/fonts/fontawesome-webfont.ttf',
  'templates/assets/lib/font-awesome/fonts/fontawesome-webfont.woff',
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
const zipOption = option('--zip');

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

  if (document.spec?.logo !== expectedThemeLogo) {
    throw new Error(`${label}: spec.logo must use the packaged asset ${expectedThemeLogo}`);
  }

  if (!document.spec?.version) {
    throw new Error(`${label}: spec.version is required`);
  }
};

const sourcePath = resolve('theme.yaml');
const sourceTheme = parseYaml(readFileSync(sourcePath, 'utf8'));
validateTheme(sourceTheme, 'theme.yaml');

if (!existsSync(resolve(themeLogoPackagePath))) {
  throw new Error(`source theme: missing packaged logo ${themeLogoPackagePath}`);
}
const sourceThemeLogo = readFileSync(resolve(themeLogoPackagePath));

const version = String(sourceTheme.spec.version);
if (!/^\d+(?:\.\d+){2,3}(?:-rc\.\d{2})?$/.test(version)) {
  throw new Error(`theme.yaml: unsupported version format ${version}`);
}

const changelog = readFileSync(resolve('CHANGELOG.md'), 'utf8');
if (!changelog.includes(`## [${version}]`)) {
  throw new Error(`CHANGELOG.md has no ${version} release section`);
}

const packageJsonPath = 'package.json';
const sourcePackageJson = JSON.parse(readFileSync(resolve(packageJsonPath), 'utf8'));
if (
  sourcePackageJson.scripts?.build !== 'pnpm build-only && node scripts/package-theme.mjs' ||
  sourcePackageJson.devDependencies?.fflate !== '0.8.2'
) {
  throw new Error(
    `${packageJsonPath}: build must use the direct pinned fflate package workflow without system ZIP tools`
  );
}

const fontAwesomeRuntimeCssPath = 'templates/assets/lib/font-awesome/css/font-awesome.min.css';
const fontAwesomeRuntimeCssBuffer = readFileSync(resolve(fontAwesomeRuntimeCssPath));
const fontAwesomeRuntimeCss = fontAwesomeRuntimeCssBuffer.toString('utf8');
const fontAwesomeFaceMatches = [...fontAwesomeRuntimeCss.matchAll(/@font-face\{[^}]*\}/g)];
const expectedFontAwesomeFace =
  "@font-face{font-family:'FontAwesome';src:url('../fonts/fontawesome-webfont.woff2?v=4.4.0') format('woff2');font-weight:normal;font-style:normal}";
if (
  fontAwesomeFaceMatches.length !== 1 ||
  fontAwesomeFaceMatches[0][0] !== expectedFontAwesomeFace ||
  /font-display\s*:/i.test(fontAwesomeFaceMatches[0]?.[0] ?? '')
) {
  throw new Error(
    `${fontAwesomeRuntimeCssPath}: Font Awesome must use one WOFF2-only face and preserve the existing implicit font-display strategy`
  );
}
const fontAwesomeIconPayload = fontAwesomeRuntimeCss.slice(
  fontAwesomeFaceMatches[0].index + fontAwesomeFaceMatches[0][0].length
);
const fontAwesomeIconCodepoints = [
  ...fontAwesomeIconPayload.matchAll(/content:["']\\([0-9a-f]{4,6})["']/gi),
].map((match) => match[1].toLowerCase());
const expectedFontAwesomeIconPayloadSha256 =
  '6fd520df1cd512c2c49dd2b7de1fbf91a85f9aaa05a74971242465f200241533';
const fontAwesomeIconPayloadSha256 = createHash('sha256')
  .update(fontAwesomeIconPayload)
  .digest('hex');
if (
  fontAwesomeIconCodepoints.length !== 585 ||
  new Set(fontAwesomeIconCodepoints).size !== 585 ||
  fontAwesomeIconPayloadSha256 !== expectedFontAwesomeIconPayloadSha256
) {
  throw new Error(
    `${fontAwesomeRuntimeCssPath}: complete Font Awesome 4.4 icon mappings must be preserved`
  );
}
const fontAwesomeWoff2Path = 'templates/assets/lib/font-awesome/fonts/fontawesome-webfont.woff2';
const fontAwesomeWoff2 = readFileSync(resolve(fontAwesomeWoff2Path));
const expectedFontAwesomeWoff2Sha256 =
  '3c4a1bb7ce3234407184f0d80cc4dec075e4ad616b44dcc5778e1cfb1bc24019';
const fontAwesomeWoff2Sha256 = createHash('sha256').update(fontAwesomeWoff2).digest('hex');
if (
  fontAwesomeWoff2.length !== 64464 ||
  fontAwesomeWoff2.subarray(0, 4).toString('ascii') !== 'wOF2' ||
  fontAwesomeWoff2Sha256 !== expectedFontAwesomeWoff2Sha256
) {
  throw new Error(
    `${fontAwesomeWoff2Path}: complete Font Awesome 4.4 WOFF2 asset must be preserved`
  );
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
  .map((path) => ({
    path,
    source: readFileSync(resolve(templateRoot, path), 'utf8'),
  }));
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
const commonMinScriptPath = 'templates/assets/js/min/common.min.js';
const sourceCommonMinScript = existsSync(resolve(commonMinScriptPath))
  ? readFileSync(resolve(commonMinScriptPath))
  : null;
if (zipOption && sourceCommonMinScript == null) {
  throw new Error(
    `${commonMinScriptPath}: browser bundle must be built before package verification`
  );
}
const utilsMinScriptPath = 'templates/assets/js/min/utils.min.js';
const sourceUtilsMinScript = existsSync(resolve(utilsMinScriptPath))
  ? readFileSync(resolve(utilsMinScriptPath))
  : null;
if (zipOption && sourceUtilsMinScript == null) {
  throw new Error(
    `${utilsMinScriptPath}: browser bundle must be built before package verification`
  );
}
const beautyMinScriptPath = 'templates/assets/js/min/beauty.min.js';
const sourceBeautyMinScript = existsSync(resolve(beautyMinScriptPath))
  ? readFileSync(resolve(beautyMinScriptPath))
  : null;
if (zipOption && sourceBeautyMinScript == null) {
  throw new Error(
    `${beautyMinScriptPath}: browser bundle must be built before package verification`
  );
}
const archivesScriptPath = 'templates/assets/js/archives.js';
const archivesScript = readFileSync(resolve(archivesScriptPath), 'utf8');
const photosScriptPath = 'templates/assets/js/photos.js';
const photosScript = readFileSync(resolve(photosScriptPath), 'utf8');
const photosMinScriptPath = 'templates/assets/js/min/photos.min.js';
const sourcePhotosMinScript = existsSync(resolve(photosMinScriptPath))
  ? readFileSync(resolve(photosMinScriptPath))
  : null;
if (zipOption && sourcePhotosMinScript == null) {
  throw new Error(
    `${photosMinScriptPath}: browser bundle must be built before package verification`
  );
}
const customScriptPath = 'templates/assets/js/custom.js';
const customScript = readFileSync(resolve(customScriptPath), 'utf8');
const customMinScriptPath = 'templates/assets/js/min/custom.min.js';
const sourceCustomMinScript = existsSync(resolve(customMinScriptPath))
  ? readFileSync(resolve(customMinScriptPath))
  : null;
if (zipOption && sourceCustomMinScript == null) {
  throw new Error(
    `${customMinScriptPath}: browser bundle must be built before package verification`
  );
}
const leavingScriptPath = 'templates/assets/js/leaving.js';
const leavingScript = readFileSync(resolve(leavingScriptPath), 'utf8');
const leavingMinScriptPath = 'templates/assets/js/min/leaving.min.js';
const sourceLeavingMinScript = existsSync(resolve(leavingMinScriptPath))
  ? readFileSync(resolve(leavingMinScriptPath))
  : null;
if (zipOption && sourceLeavingMinScript == null) {
  throw new Error(
    `${leavingMinScriptPath}: browser bundle must be built before package verification`
  );
}
const walkEffectAst = (node, visitor) => {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkEffectAst(item, visitor);
    return;
  }
  if (typeof node.type === 'string') visitor(node);
  for (const value of Object.values(node)) walkEffectAst(value, visitor);
};
const readEffectPropertyName = (node) => {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  return null;
};
const readEffectStaticString = (node) => {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (
    node?.type === 'TemplateLiteral' &&
    node.expressions?.length === 0 &&
    node.quasis?.length === 1
  ) {
    return node.quasis[0].value?.cooked ?? node.quasis[0].value?.raw ?? null;
  }
  return null;
};
const isEffectMember = (node, object, property) =>
  node?.type === 'MemberExpression' &&
  !node.computed &&
  node.object?.type === 'Identifier' &&
  node.object.name === object &&
  node.property?.type === 'Identifier' &&
  node.property.name === property;
const flattenEffectOr = (node) =>
  node?.type === 'LogicalExpression' && node.operator === '||'
    ? [...flattenEffectOr(node.left), ...flattenEffectOr(node.right)]
    : [node];
const validateLeavingConsumer = (script, label) => {
  const ast = parseAst(script, { sourceType: 'script' }, label);
  const selectors = [];
  const draggabillyCalls = [];
  const itemEachCalls = [];
  walkEffectAst(ast, (node) => {
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === '$'
    ) {
      const selector = readEffectStaticString(node.arguments?.[0]);
      if (selector != null) selectors.push(selector);
    }
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'MemberExpression' &&
      readEffectPropertyName(node.callee.property) === 'draggabilly'
    ) {
      draggabillyCalls.push(node);
    }
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'MemberExpression' &&
      readEffectPropertyName(node.callee.property) === 'each' &&
      node.callee.object?.type === 'CallExpression' &&
      node.callee.object.callee?.type === 'Identifier' &&
      node.callee.object.callee.name === '$' &&
      readEffectStaticString(node.callee.object.arguments?.[0]) === '.joe_leaving-list .item'
    ) {
      itemEachCalls.push(node);
    }
  });
  const draggabillyReceiver = draggabillyCalls[0]?.callee?.object;
  const itemEachCallback =
    itemEachCalls.length === 1 && itemEachCalls[0].arguments?.length === 1
      ? itemEachCalls[0].arguments[0]
      : null;
  const itemParameter = itemEachCallback?.params?.[1];
  const containmentProperty = draggabillyCalls[0]?.arguments?.[0]?.properties?.filter(
    (property) => readEffectPropertyName(property.key) === 'containment'
  );
  const containmentValue = containmentProperty?.[0]?.value;
  const containmentIsTrue =
    (containmentValue?.type === 'Literal' && containmentValue.value === true) ||
    (containmentValue?.type === 'UnaryExpression' &&
      containmentValue.operator === '!' &&
      containmentValue.argument?.type === 'Literal' &&
      containmentValue.argument.value === 0);
  if (
    selectors.filter((selector) => selector === '.joe_leaving-list').length !== 1 ||
    selectors.filter((selector) => selector === '.joe_leaving-list .item').length !== 1 ||
    draggabillyCalls.length !== 1 ||
    draggabillyReceiver?.type !== 'CallExpression' ||
    draggabillyReceiver.callee?.type !== 'Identifier' ||
    draggabillyReceiver.callee.name !== '$' ||
    draggabillyReceiver.arguments?.length !== 1 ||
    draggabillyReceiver.arguments[0]?.type !== 'Identifier' ||
    itemEachCalls.length !== 1 ||
    itemEachCallback?.type !== 'ArrowFunctionExpression' ||
    itemParameter?.type !== 'Identifier' ||
    draggabillyReceiver.arguments[0].name !== itemParameter.name ||
    !(itemEachCallback.start < draggabillyCalls[0].start) ||
    !(draggabillyCalls[0].end < itemEachCallback.end) ||
    draggabillyCalls[0].arguments?.length !== 1 ||
    draggabillyCalls[0].arguments[0]?.type !== 'ObjectExpression' ||
    containmentProperty?.length !== 1 ||
    !containmentIsTrue
  ) {
    throw new Error(
      `${label}: leaving runtime must select the leaving list/items and initialize Draggabilly exactly once per item`
    );
  }
};
validateLeavingConsumer(leavingScript, leavingScriptPath);
if (sourceLeavingMinScript != null) {
  validateLeavingConsumer(sourceLeavingMinScript.toString('utf8'), leavingMinScriptPath);
}
const activeMarkedConsumers = ['templates/assets/js', 'templates/assets/js/min'].flatMap(
  (directory) =>
    (existsSync(resolve(directory)) ? readdirSync(resolve(directory), { withFileTypes: true }) : [])
      .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
      .flatMap((entry) => {
        const path = `${directory}/${entry.name}`;
        const ast = parseAst(readFileSync(resolve(path), 'utf8'), { sourceType: 'script' }, path);
        const consumers = [];
        walkEffectAst(ast, (node) => {
          if (
            node.type === 'CallExpression' &&
            ((node.callee?.type === 'Identifier' && node.callee.name === 'marked') ||
              (node.callee?.type === 'MemberExpression' &&
                node.callee.object?.type === 'Identifier' &&
                node.callee.object.name === 'marked'))
          ) {
            consumers.push(`${path}:${node.start}`);
          }
        });
        return consumers;
      })
);
if (activeMarkedConsumers.length !== 0) {
  throw new Error(
    `source theme: marked has no active first-party consumer, found ${activeMarkedConsumers.join(', ')}`
  );
}
const isEffectCacheTrue = (node) =>
  node?.type === 'Literal' && node.value === true
    ? true
    : node?.type === 'UnaryExpression' &&
      node.operator === '!' &&
      node.argument?.type === 'Literal' &&
      node.argument.value === 0;
const validateOptionalEffectLoaders = (script, label) => {
  const ast = parseAst(script, { sourceType: 'script' }, label);
  const policies = [
    {
      method: 'loadMouseEffect',
      resource: 'cursor',
      setting: 'cursor_effect',
    },
    {
      method: 'loadBackdropEffect',
      resource: 'backdrop',
      setting: 'backdrop',
    },
  ];
  for (const { method, resource, setting } of policies) {
    const methodProperties = [];
    walkEffectAst(ast, (node) => {
      if (
        node.type === 'Property' &&
        readEffectPropertyName(node.key) === method &&
        node.value?.type === 'FunctionExpression'
      ) {
        methodProperties.push(node);
      }
    });
    const methodProperty = methodProperties.length === 1 ? methodProperties[0] : null;
    const ajaxCalls = [];
    walkEffectAst(methodProperty?.value?.body, (node) => {
      if (node.type === 'CallExpression' && isEffectMember(node.callee, '$', 'ajax')) {
        ajaxCalls.push(node);
      }
    });
    const ajaxCall = ajaxCalls.length === 1 ? ajaxCalls[0] : null;
    const options = ajaxCall?.arguments?.length === 1 ? ajaxCall.arguments[0] : null;
    const optionProperties =
      options?.type === 'ObjectExpression' &&
      options.properties.every(({ type }) => type === 'Property')
        ? new Map(
            options.properties.map((property) => [readEffectPropertyName(property.key), property])
          )
        : new Map();
    const url = optionProperties.get('url')?.value;
    const expectedUrlQuasis = ['', `/assets/effect/${resource}/`, '.js?v=', ''];
    const actualUrlQuasis =
      url?.type === 'TemplateLiteral'
        ? url.quasis.map(({ value }) => value?.cooked ?? value?.raw ?? null)
        : [];
    const urlIsExact =
      url?.type === 'TemplateLiteral' &&
      actualUrlQuasis.join('\n') === expectedUrlQuasis.join('\n') &&
      url.expressions?.length === 3 &&
      isEffectMember(url.expressions[0], 'ThemeConfig', 'BASE_RES_URL') &&
      isEffectMember(url.expressions[1], 'ThemeConfig', setting) &&
      isEffectMember(url.expressions[2], 'ThemeConfig', 'version');
    const guardNodes = [
      (node) => isEffectMember(node, 'Joe', 'isMobile'),
      (node) => isEffectMember(node, 'ThemeConfig', 'enable_clean_mode'),
      (node) =>
        node?.type === 'BinaryExpression' &&
        node.operator === '===' &&
        isEffectMember(node.left, 'ThemeConfig', setting) &&
        readEffectStaticString(node.right) === 'off',
    ];
    const guardsMatch = (nodes) =>
      nodes.length === guardNodes.length && nodes.every((node, index) => guardNodes[index](node));
    const body = methodProperty?.value?.body;
    const sourceGuardShape =
      body?.type === 'BlockStatement' &&
      body.body?.length === 2 &&
      body.body[0]?.type === 'IfStatement' &&
      guardsMatch(flattenEffectOr(body.body[0].test)) &&
      body.body[0].consequent?.type === 'ReturnStatement' &&
      body.body[0].alternate == null &&
      body.body[1]?.type === 'ExpressionStatement' &&
      body.body[1].expression === ajaxCall;
    const minifiedGuardNodes =
      body?.type === 'BlockStatement' &&
      body.body?.length === 1 &&
      body.body[0]?.type === 'ExpressionStatement'
        ? flattenEffectOr(body.body[0].expression)
        : [];
    const minifiedGuardShape =
      minifiedGuardNodes.length === 4 &&
      guardsMatch(minifiedGuardNodes.slice(0, 3)) &&
      minifiedGuardNodes[3] === ajaxCall;
    if (
      methodProperties.length !== 1 ||
      ajaxCalls.length !== 1 ||
      options?.type !== 'ObjectExpression' ||
      options.properties.length !== 3 ||
      optionProperties.size !== 3 ||
      !urlIsExact ||
      readEffectStaticString(optionProperties.get('dataType')?.value) !== 'script' ||
      !isEffectCacheTrue(optionProperties.get('cache')?.value) ||
      (!sourceGuardShape && !minifiedGuardShape)
    ) {
      throw new Error(
        `${label}: ${method} must guard and execute one cached jQuery script AJAX call with the exact versioned ${resource} URL`
      );
    }
  }
};
validateOptionalEffectLoaders(commonScript, commonScriptPath);
if (sourceCommonMinScript != null) {
  validateOptionalEffectLoaders(sourceCommonMinScript.toString('utf8'), commonMinScriptPath);
}
const isLoadingBarEnabled = (node) => isEffectMember(node, 'ThemeConfig', 'enable_loading_bar');
const isNprogressCall = (node, method) =>
  node?.type === 'CallExpression' && isEffectMember(node.callee, 'NProgress', method);
const validateLoadingBarController = (script, label) => {
  const ast = parseAst(script, { sourceType: 'script' }, label);
  const loadingBarProperties = [];
  walkEffectAst(ast, (node) => {
    if (
      node.type === 'Property' &&
      readEffectPropertyName(node.key) === 'loadingBar' &&
      node.value?.type === 'ObjectExpression'
    ) {
      loadingBarProperties.push(node);
    }
  });
  const loadingBarProperty = loadingBarProperties.length === 1 ? loadingBarProperties[0] : null;
  const loadingBarMethods = loadingBarProperty?.value?.properties ?? [];
  const showProperty = loadingBarMethods[0];
  const hideProperty = loadingBarMethods[1];
  const methodsAreExact =
    loadingBarMethods.length === 2 &&
    readEffectPropertyName(showProperty?.key) === 'show' &&
    readEffectPropertyName(hideProperty?.key) === 'hide' &&
    [showProperty, hideProperty].every(
      (property) =>
        property?.value?.type === 'FunctionExpression' &&
        property.value.params?.length === 0 &&
        property.value.async === false &&
        property.value.generator === false
    );
  const showCalls = [];
  const hideCalls = [];
  walkEffectAst(showProperty?.value?.body, (node) => {
    if (isNprogressCall(node, 'configure') || isNprogressCall(node, 'start')) showCalls.push(node);
  });
  walkEffectAst(hideProperty?.value?.body, (node) => {
    if (isNprogressCall(node, 'done')) hideCalls.push(node);
  });
  const configureCall = showCalls.find((node) => isNprogressCall(node, 'configure'));
  const startCall = showCalls.find((node) => isNprogressCall(node, 'start'));
  const doneCall = hideCalls.find((node) => isNprogressCall(node, 'done'));
  const configureIsExact =
    configureCall?.arguments?.length === 1 &&
    configureCall.arguments[0]?.type === 'ObjectExpression';
  const startIsExact = startCall?.arguments?.length === 0;
  const doneIsExact = doneCall?.arguments?.length === 1 && isEffectCacheTrue(doneCall.arguments[0]);
  const showBody = showProperty?.value?.body;
  const hideBody = hideProperty?.value?.body;
  const sourceShowGuard = showBody?.body?.[0];
  const sourceHideGuard = hideBody?.body?.[0];
  const sourceGuardIsExact = (statement) =>
    statement?.type === 'IfStatement' &&
    statement.test?.type === 'UnaryExpression' &&
    statement.test.operator === '!' &&
    isLoadingBarEnabled(statement.test.argument) &&
    statement.consequent?.type === 'ReturnStatement' &&
    statement.consequent.argument == null &&
    statement.alternate == null;
  const sourceShape =
    showBody?.type === 'BlockStatement' &&
    showBody.body?.length === 3 &&
    sourceGuardIsExact(sourceShowGuard) &&
    showBody.body[1]?.type === 'ExpressionStatement' &&
    showBody.body[1].expression === configureCall &&
    showBody.body[2]?.type === 'ExpressionStatement' &&
    showBody.body[2].expression === startCall &&
    hideBody?.type === 'BlockStatement' &&
    hideBody.body?.length === 2 &&
    sourceGuardIsExact(sourceHideGuard) &&
    hideBody.body[1]?.type === 'ExpressionStatement' &&
    hideBody.body[1].expression === doneCall;
  const minifiedShowExpression = showBody?.body?.[0]?.expression;
  const minifiedShowSequence = minifiedShowExpression?.right;
  const minifiedHideExpression = hideBody?.body?.[0]?.expression;
  const minifiedShape =
    showBody?.type === 'BlockStatement' &&
    showBody.body?.length === 1 &&
    showBody.body[0]?.type === 'ExpressionStatement' &&
    minifiedShowExpression?.type === 'LogicalExpression' &&
    minifiedShowExpression.operator === '&&' &&
    isLoadingBarEnabled(minifiedShowExpression.left) &&
    minifiedShowSequence?.type === 'SequenceExpression' &&
    minifiedShowSequence.expressions?.length === 2 &&
    minifiedShowSequence.expressions[0] === configureCall &&
    minifiedShowSequence.expressions[1] === startCall &&
    hideBody?.type === 'BlockStatement' &&
    hideBody.body?.length === 1 &&
    hideBody.body[0]?.type === 'ExpressionStatement' &&
    minifiedHideExpression?.type === 'LogicalExpression' &&
    minifiedHideExpression.operator === '&&' &&
    isLoadingBarEnabled(minifiedHideExpression.left) &&
    minifiedHideExpression.right === doneCall;
  const contextObjectDeclarators = [];
  walkEffectAst(ast, (node) => {
    if (
      node.type === 'VariableDeclarator' &&
      node.id?.type === 'Identifier' &&
      node.init?.type === 'ObjectExpression' &&
      node.init.properties?.includes(loadingBarProperty)
    ) {
      contextObjectDeclarators.push(node);
    }
  });
  const contextDeclarator =
    contextObjectDeclarators.length === 1 ? contextObjectDeclarators[0] : null;
  const contextName = contextDeclarator?.id?.name;
  const runtimeCalls = { show: [], hide: [] };
  walkEffectAst(ast, (node) => {
    if (node.type !== 'CallExpression' || node.callee?.type !== 'MemberExpression') return;
    const method = readEffectPropertyName(node.callee.property);
    const loadingBarMember = node.callee.object;
    if (
      (method === 'show' || method === 'hide') &&
      loadingBarMember?.type === 'MemberExpression' &&
      !loadingBarMember.computed &&
      readEffectPropertyName(loadingBarMember.property) === 'loadingBar' &&
      loadingBarMember.object?.type === 'Identifier' &&
      loadingBarMember.object.name === contextName
    ) {
      runtimeCalls[method].push(node);
    }
  });
  const runtimeCallsAreExact =
    contextObjectDeclarators.length === 1 &&
    runtimeCalls.show.length === 1 &&
    runtimeCalls.hide.length === 1 &&
    runtimeCalls.show[0].arguments?.length === 0 &&
    runtimeCalls.hide[0].arguments?.length === 0;
  if (
    loadingBarProperties.length !== 1 ||
    !methodsAreExact ||
    showCalls.length !== 2 ||
    hideCalls.length !== 1 ||
    !configureIsExact ||
    !startIsExact ||
    !doneIsExact ||
    (!sourceShape && !minifiedShape) ||
    !runtimeCallsAreExact
  ) {
    throw new Error(
      `${label}: loadingBar must define guarded show/configure/start and hide/done controllers with one real runtime call each`
    );
  }
};
validateLoadingBarController(commonScript, commonScriptPath);
if (sourceCommonMinScript != null) {
  validateLoadingBarController(sourceCommonMinScript.toString('utf8'), commonMinScriptPath);
}
const indexScriptPath = 'templates/assets/js/index.js';
const indexScript = readFileSync(resolve(indexScriptPath), 'utf8');
const postScriptPath = 'templates/assets/js/post.js';
const postScript = readFileSync(resolve(postScriptPath), 'utf8');
const postMinScriptPath = 'templates/assets/js/min/post.min.js';
const sourcePostMinScript = existsSync(resolve(postMinScriptPath))
  ? readFileSync(resolve(postMinScriptPath))
  : null;
if (zipOption && sourcePostMinScript == null) {
  throw new Error(`${postMinScriptPath}: browser bundle must be built before package verification`);
}
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

const tail = readFileSync(resolve('templates/modules/macro/tail.html'), 'utf8');
const links = readFileSync(resolve('templates/modules/link.html'), 'utf8');
const themeSettingVariable = readFileSync(
  resolve('templates/modules/themeSettingVariable.html'),
  'utf8'
);
if (/\bBASE_URL\b/.test(themeSettingVariable) || themeSettingVariable.includes('bbchin.com')) {
  throw new Error(
    'templates/modules/themeSettingVariable.html: retired bbchin BASE_URL must not be exposed at runtime'
  );
}
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
const paginationNavigationCount =
  paginationTemplate.match(/<nav\b[^>]*aria-label="分页导航"[^>]*>/g)?.length ?? 0;
const paginationListCount =
  paginationTemplate.match(/<ul\b[^>]*class="joe_pagination"[^>]*>/g)?.length ?? 0;
const paginationCurrentCount = paginationTemplate.match(/th:aria-current=/g)?.length ?? 0;
const paginationDisabledCount = paginationTemplate.match(/th:aria-disabled=/g)?.length ?? 0;
const paginationTabindexCount = paginationTemplate.match(/th:tabindex=/g)?.length ?? 0;
const paginationConditionalHrefCount =
  paginationTemplate.match(
    /th:href="\$\{(?:1 eq pageIndex|pageIndex eq totalPages)\} \? null : @\{\$\{(?:posts|archives|moments|data)\.(?:prevUrl|nextUrl)\}\}"/g
  )?.length ?? 0;
if (
  paginationEllipsisCount === 0 ||
  paginationEllipsisSpans !== paginationEllipsisCount ||
  /<a\b[^>]*href="#"[^>]*>\s*\.\.\.\s*<\/a>/.test(paginationTemplate) ||
  paginationNavigationCount !== 7 ||
  (paginationTemplate.match(/<\/nav>/g)?.length ?? 0) !== 7 ||
  paginationListCount !== 14 ||
  /<ul\b[^>]*role="navigation"/.test(paginationTemplate) ||
  paginationCurrentCount !== 42 ||
  paginationDisabledCount !== 28 ||
  paginationTabindexCount !== 28 ||
  paginationConditionalHrefCount !== 28 ||
  !commonScript.includes('.find("li.active > a").attr("aria-current", "page")') ||
  !commonScript.includes('.find("li.disabled > a")') ||
  !commonScript.includes('.removeAttr("href")') ||
  !commonScript.includes('{ "aria-disabled": "true", tabindex: "-1" }')
) {
  throw new Error(
    `${paginationTemplatePath}: pagination must expose labelled navigation, current-page state, disabled non-links and non-interactive ellipses`
  );
}

const indexTemplatePath = 'templates/index.html';
const indexTemplate = readFileSync(resolve(indexTemplatePath), 'utf8');
const loadMoreButton = indexTemplate.match(
  /<button\b(?=[^>]*class="joe_load")(?=[^>]*type="button")(?=[^>]*aria-busy="false")(?=[^>]*aria-describedby="joe-load-status")[^>]*>/
)?.[0];
if (
  !loadMoreButton ||
  /<div\b[^>]*class="joe_load"/.test(indexTemplate) ||
  !/<p\b(?=[^>]*id="joe-load-status")(?=[^>]*class="sr-only")(?=[^>]*role="status")(?=[^>]*aria-live="polite")[^>]*>/.test(
    indexTemplate
  ) ||
  !indexScript.includes('.prop("disabled", true)') ||
  !indexScript.includes('"aria-busy": "true"') ||
  !indexScript.includes('"aria-busy": "false"') ||
  !indexScript.includes('$loadStatus.text("正在加载更多文章")') ||
  !indexScript.includes('已新增 ${postListNewElements.length} 篇文章') ||
  !indexScript.includes('已加载全部文章') ||
  !indexScript.includes('$loadStatus.text("文章加载失败，请重试")') ||
  !indexScript.includes('const requestedNextUrls = new Set()') ||
  !indexScript.includes('requestedNextUrls.has(domNext)') ||
  !indexScript.includes('requestedNextUrls.add(domNext)') ||
  !indexScript.includes('!requestedNextUrls.has(nextPage)') ||
  !indexScript.includes('requestedNextUrls.delete(domNext)') ||
  !indexScript.includes('当前分页没有公开文章，正在继续查找') ||
  !indexScript.includes('setTimeout(() => $domLoad.trigger("click"), 0)') ||
  !tail.includes('!domClick.disabled')
) {
  throw new Error(
    `${indexTemplatePath}: AJAX load-more must be a native busy/disabled button with persistent polite success, end and retry status`
  );
}

const runPaginationHoleHarness = async (pages, start) => {
  const requested = new Set();
  let next = start;
  while (next && next !== '/' && !requested.has(next)) {
    requested.add(next);
    const page = await Promise.resolve(pages[next]);
    if (page.items > 0) return { requested: [...requested], found: true };
    next = page.next;
  }
  return { requested: [...requested], found: false };
};
const holeThenItems = await runPaginationHoleHarness(
  { A: { items: 0, next: 'B' }, B: { items: 2, next: null } },
  'A'
);
const consecutiveHoles = await runPaginationHoleHarness(
  { A: { items: 0, next: 'B' }, B: { items: 0, next: null } },
  'A'
);
const selfLoopHole = await runPaginationHoleHarness({ A: { items: 0, next: 'A' } }, 'A');
if (
  !holeThenItems.found ||
  holeThenItems.requested.join(',') !== 'A,B' ||
  consecutiveHoles.found ||
  consecutiveHoles.requested.join(',') !== 'A,B' ||
  selfLoopHole.found ||
  selfLoopHole.requested.join(',') !== 'A'
) {
  throw new Error(
    `${indexScriptPath}: empty-page traversal must reach later items, exhaust consecutive holes and stop self-loops after one request`
  );
}

const favoriteTemplatePath = 'templates/modules/macro/favorite.html';
const favoriteTemplate = readFileSync(resolve(favoriteTemplatePath), 'utf8');
const favoriteBottomButton = favoriteTemplate.match(
  /<button\b[^>]*class="joe_detail__agree"[^>]*>[\s\S]*?<\/button>/
)?.[0];
const postOperateTemplatePaths = [
  'templates/modules/post_operate.html',
  'templates/modules/post_operate_aside.html',
];
if (
  !/<button\b(?=[^>]*class="joe_detail__agree")(?=[^>]*type="button")(?=[^>]*aria-pressed="false")[^>]*>/.test(
    favoriteTemplate
  ) ||
  !/<button\b(?=[^>]*class="post-operate-like")(?=[^>]*type="button")(?=[^>]*aria-pressed="false")[^>]*>/.test(
    favoriteTemplate
  ) ||
  !favoriteBottomButton ||
  !/<span class="agree">/.test(favoriteBottomButton) ||
  !/<span class="icon">/.test(favoriteBottomButton) ||
  /<div\b/.test(favoriteBottomButton)
) {
  throw new Error(
    `${favoriteTemplatePath}: article like controls must be native buttons with synchronized pressed state and names`
  );
}
const verifyOneWayUpvote = (script, path) => {
  const method = script.match(/initLike\(\)\s*\{([\s\S]*?)\n\s*\},\n/)?.[1];
  const handlerGuard = method?.indexOf('if (_loading || flag) return;') ?? -1;
  const request = method?.indexOf('/apis/api.halo.run/v1alpha1/trackers/upvote') ?? -1;
  const successState = method?.indexOf('flag = true;', request) ?? -1;
  if (
    !method ||
    handlerGuard < 0 ||
    request < 0 ||
    handlerGuard > request ||
    successState < request ||
    !method.includes('if (flag) {') ||
    !method.includes('.prop("disabled", pressed)') ||
    !method.includes('.attr("aria-pressed", String(pressed))') ||
    !method.includes('已点赞，当前 ${likeCount} 次点赞') ||
    !method.includes('likeCount++') ||
    !method.includes('if (!agreeArr.includes(cid)) agreeArr.push(cid);') ||
    !/\.catch\(\(\) => \{[\s\S]*?_loading = false;[\s\S]*?\.prop\("disabled", false\)[\s\S]*?\.attr\("aria-busy", "false"\)/.test(
      method
    ) ||
    (method.match(/\/apis\/api\.halo\.run\/v1alpha1\/trackers\/upvote/g)?.length ?? 0) !== 1 ||
    /取消点赞|likes--|likeCount--|agreeArr\.splice\(/.test(method)
  ) {
    throw new Error(
      `${path}: upvote must be one-way, disable an already-upvoted control and guard a second request`
    );
  }
};
verifyOneWayUpvote(postScript, postScriptPath);
const postLikeMethod = postScript.match(/initLike\(\)\s*\{([\s\S]*?)\n\s*\},\n/)?.[1];
const postSuccess = postLikeMethod?.match(/\.then\(\(_res\) => \{([\s\S]*?)\n\s*\}\)/)?.[1];
if (
  !postSuccess ||
  !postSuccess.includes('localStorage.getItem(encryption("agree"))') ||
  postSuccess.indexOf('localStorage.getItem(encryption("agree"))') >
    postSuccess.indexOf('localStorage.setItem(name, val)')
) {
  throw new Error(
    `${postScriptPath}: each successful concurrent upvote must re-read and merge persisted post ids before writing`
  );
}
for (const path of postOperateTemplatePaths) {
  const template = readFileSync(resolve(path), 'utf8');
  for (const control of ['icon-share-link', 'share_to_weixin']) {
    if (
      !new RegExp(`<button\\b(?=[^>]*class="${control}")(?=[^>]*type="button")[^>]*>`).test(
        template
      ) ||
      new RegExp(`<a\\b[^>]*class="${control}"`).test(template)
    ) {
      throw new Error(
        `${path}: ${control} must be a native button while outbound shares remain links`
      );
    }
  }
}
if (
  !postOperateTemplatePaths.every((path) => {
    const template = readFileSync(resolve(path), 'utf8');
    const weixinButton = template.match(
      /<button\b[^>]*class="share_to_weixin"[^>]*>[\s\S]*?<\/button>/
    )?.[0];
    return (
      weixinButton != null &&
      /<button\b(?=[^>]*class="share_to_weixin")(?=[^>]*aria-expanded="false")[^>]*>/.test(
        weixinButton
      ) &&
      !/<div\b/.test(weixinButton)
    );
  }) ||
  !postScript.includes('$weixinButtons.off("click.joeWeixinShare")') ||
  !postScript.includes('.attr("aria-expanded", "true")') ||
  !postScript.includes('.attr("aria-expanded", "false")')
) {
  throw new Error(
    `${postScriptPath}: WeChat share buttons must toggle valid phrasing-content QR controls and synchronize expanded state`
  );
}

const journalsScriptPath = 'templates/assets/js/journals.js';
const journalsScript = readFileSync(resolve(journalsScriptPath), 'utf8');
const journalsMinScriptPath = 'templates/assets/js/min/journals.min.js';
const sourceJournalsMinScript = existsSync(resolve(journalsMinScriptPath))
  ? readFileSync(resolve(journalsMinScriptPath))
  : null;
if (zipOption && sourceJournalsMinScript == null) {
  throw new Error(
    `${journalsMinScriptPath}: browser bundle must be built before package verification`
  );
}
verifyOneWayUpvote(journalsScript, journalsScriptPath);
const journalLikeMethod = journalsScript.match(/initLike\(\)\s*\{([\s\S]*?)\n\s*\},\n/)?.[1];
const journalSuccess = journalLikeMethod?.match(/\.then\(\(_res\) => \{([\s\S]*?)\n\s*\}\)/)?.[1];
if (
  !journalSuccess ||
  !journalSuccess.includes('localStorage.getItem(encryption("agree-journal"))') ||
  journalSuccess.indexOf('localStorage.getItem(encryption("agree-journal"))') >
    journalSuccess.indexOf('localStorage.setItem(name, val)')
) {
  throw new Error(
    `${journalsScriptPath}: each successful concurrent upvote must re-read and merge persisted journal ids before writing`
  );
}
const createDeferred = () => {
  let resolvePromise;
  const promise = new Promise((resolveDeferred) => {
    resolvePromise = resolveDeferred;
  });
  return { promise, resolve: resolvePromise };
};
let concurrentJournalStorage = '[]';
const completeConcurrentJournalUpvote = (cid, deferred) =>
  deferred.promise.then(() => {
    const current = JSON.parse(concurrentJournalStorage);
    if (!current.includes(cid)) current.push(cid);
    concurrentJournalStorage = JSON.stringify(current);
  });
const journalDeferredA = createDeferred();
const journalDeferredB = createDeferred();
const journalCompletionA = completeConcurrentJournalUpvote('A', journalDeferredA);
const journalCompletionB = completeConcurrentJournalUpvote('B', journalDeferredB);
journalDeferredB.resolve();
await journalCompletionB;
journalDeferredA.resolve();
await journalCompletionA;
if (!['A', 'B'].every((cid) => JSON.parse(concurrentJournalStorage).includes(cid))) {
  throw new Error(`${journalsScriptPath}: concurrent upvote merge harness lost a journal id`);
}
let concurrentPostStorage = '[]';
const completeConcurrentPostUpvote = (cid, deferred) =>
  deferred.promise.then(() => {
    const current = JSON.parse(concurrentPostStorage);
    if (!current.includes(cid)) current.push(cid);
    concurrentPostStorage = JSON.stringify(current);
  });
const postDeferredA = createDeferred();
const postDeferredB = createDeferred();
const postCompletionA = completeConcurrentPostUpvote('A', postDeferredA);
const postCompletionB = completeConcurrentPostUpvote('B', postDeferredB);
postDeferredB.resolve();
await postCompletionB;
postDeferredA.resolve();
await postCompletionA;
if (!['A', 'B'].every((cid) => JSON.parse(concurrentPostStorage).includes(cid))) {
  throw new Error(`${postScriptPath}: concurrent upvote merge harness lost a post id`);
}
for (const path of ['templates/moment.html', 'templates/moments.html']) {
  const template = readFileSync(resolve(path), 'utf8');
  if (
    !/<button\b(?=[^>]*class="joe_journal_operate_item journal_content_expander")(?=[^>]*aria-expanded="false")[^>]*>/.test(
      template
    ) ||
    !/<button\b(?=[^>]*class="joe_journal_operate_item like")(?=[^>]*aria-pressed="false")[^>]*>/.test(
      template
    ) ||
    (template.match(/<button\b[^>]*class="joe_journal_operate_item comment"[^>]*>/g)?.length ??
      0) !== 2 ||
    (template.match(
      /<button\b[^>]*class="joe_journal_operate_item journal_comment_expander"[^>]*>/g
    )?.length ?? 0) !== 2 ||
    !template.includes('th:id="\'journal-comment-\'+${moment.metadata.name}"')
  ) {
    throw new Error(
      `${path}: moment like, comment and content expanders must be native stateful buttons bound to the comment panel`
    );
  }
}
const phase2GlobalStylesPath = 'templates/assets/css/global.less';
const phase2GlobalStyles = readFileSync(resolve(phase2GlobalStylesPath), 'utf8');
const phase2PostStylesPath = 'templates/assets/css/post.less';
const phase2PostStyles = readFileSync(resolve(phase2PostStylesPath), 'utf8');
if (
  (phase2GlobalStyles.match(/&:focus-within/g)?.length ?? 0) !== 1 ||
  !/&:hover,\s*&:focus-within\s*\{[\s\S]*?width:\s*auto;[\s\S]*?overflow:\s*initial;[\s\S]*?\.share-icon-list\s*\{[\s\S]*?pointer-events:\s*initial;[\s\S]*?opacity:\s*1;[\s\S]*?transform:\s*scale\(1\);/.test(
    phase2GlobalStyles
  ) ||
  (phase2PostStyles.match(/&:focus-within/g)?.length ?? 0) !== 1 ||
  !/&:hover,\s*&:focus-within\s*\{[\s\S]*?overflow:\s*initial;[\s\S]*?\.share-icon-list\s*\{[\s\S]*?pointer-events:\s*initial;[\s\S]*?opacity:\s*1;[\s\S]*?transform:\s*translate3d\(15px,\s*0,\s*0\);/.test(
    phase2PostStyles
  ) ||
  phase2PostStyles.includes('\n    span {\n      display: none;') ||
  !/>\s*\.post-operate-like\s*>\s*\.nums,\s*>\s*\.post-operate-comment\s*>\s*span\s*\{/.test(
    phase2PostStyles
  ) ||
  !/\.share_to_weixin\.active\s+\.qrcode_wrapper\s*\{\s*display:\s*block;/.test(phase2PostStyles) ||
  !/\.joe_load\s*\{[\s\S]*?appearance:\s*none;[\s\S]*?display:\s*block;/.test(phase2GlobalStyles)
) {
  throw new Error(
    `${phase2GlobalStylesPath} and ${phase2PostStylesPath}: share menus must expose the complete hover state on keyboard focus`
  );
}
if (
  !paginationTemplate.includes('th:href="${author.status.permalink}"') ||
  (paginationTemplate.match(/<a href="\/" th:aria-current=/g)?.length ?? 0) !== 1
) {
  throw new Error(
    `${paginationTemplatePath}: author pagination must link page one to the author permalink`
  );
}
if (
  !journalsScript.includes('$likeButton.on("click"') ||
  !journalsScript.includes('.attr("aria-pressed", String(pressed))') ||
  !journalsScript.includes('".journal_comment_expander,.joe_journal_operate_item.comment"') ||
  !journalsScript.includes('.attr("aria-expanded", String(isOpen))') ||
  !journalsScript.includes('$(".journal_content_expander").on("click"')
) {
  throw new Error(
    `${journalsScriptPath}: moment controls must synchronize pressed, expanded, busy and accessible-name state`
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
const preserveMarkupOffsets = (value) => ' '.repeat(value.length);
const isSelfClosingTag = (tag) => /\/\s*>$/.test(tag);
const readMarkupTagAt = (source, start) => {
  let quote = null;
  let end = start + 1;
  for (; end < source.length; end += 1) {
    const character = source[end];
    if (quote == null && (character === '"' || character === "'")) quote = character;
    else if (character === quote) quote = null;
    else if (quote == null && character === '>') break;
  }
  if (end === source.length) return null;
  const tag = source.slice(start, end + 1);
  const identity = /^<\s*(\/?)\s*([A-Za-z][\w:-]*)\b/.exec(tag);
  if (identity == null) return null;
  return {
    closing: identity[1] === '/',
    end: end + 1,
    name: identity[2].toLowerCase(),
    start,
    tag,
  };
};
const analyzeMarkupActivity = (source) => {
  const commentRanges = [];
  const rawTextBodies = [];
  const rawTextElementNames = new Set(['script', 'style', 'textarea', 'title']);
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start === -1) break;
    if (source.startsWith('<!--', start)) {
      const commentEnd = source.indexOf('-->', start + 4);
      const end = commentEnd === -1 ? source.length : commentEnd + 3;
      commentRanges.push([start, end]);
      cursor = end;
      continue;
    }
    const token = readMarkupTagAt(source, start);
    if (token == null) {
      cursor = start + 1;
      continue;
    }
    cursor = token.end;
    if (
      !rawTextElementNames.has(token.name) ||
      token.closing ||
      (token.name !== 'script' && isSelfClosingTag(token.tag))
    ) {
      continue;
    }
    const closingPattern = new RegExp(`<\\/${token.name}\\s*>`, 'gi');
    closingPattern.lastIndex = token.end;
    const closing = closingPattern.exec(source);
    if (closing == null) continue;
    rawTextBodies.push({
      bodyEnd: closing.index,
      bodyStart: token.end,
      name: token.name,
      openingTag: token.tag,
    });
    cursor = closing.index + closing[0].length;
  }
  return { commentRanges, rawTextBodies };
};
const maskRanges = (source, ranges) => {
  let masked = '';
  let cursor = 0;
  for (const [start, end] of ranges) {
    masked += source.slice(cursor, start);
    masked += preserveMarkupOffsets(source.slice(start, end));
    cursor = end;
  }
  return masked + source.slice(cursor);
};
const maskInactiveHtmlComments = (source) => {
  let activeSource = '';
  let cursor = 0;
  while (cursor < source.length) {
    const commentStart = source.indexOf('<!--', cursor);
    if (commentStart === -1) return activeSource + source.slice(cursor);
    activeSource += source.slice(cursor, commentStart);
    if (source.startsWith('<!--/*/', commentStart)) {
      const contentStart = commentStart + '<!--/*/'.length;
      const commentEnd = source.indexOf('/*/-->', contentStart);
      if (commentEnd !== -1) {
        activeSource += preserveMarkupOffsets(source.slice(commentStart, contentStart));
        activeSource += maskInactiveHtmlComments(source.slice(contentStart, commentEnd));
        activeSource += preserveMarkupOffsets(
          source.slice(commentEnd, commentEnd + '/*/-->'.length)
        );
        cursor = commentEnd + '/*/-->'.length;
        continue;
      }
    }
    const commentEnd = source.indexOf('-->', commentStart + '<!--'.length);
    const end = commentEnd === -1 ? source.length : commentEnd + '-->'.length;
    activeSource += preserveMarkupOffsets(source.slice(commentStart, end));
    cursor = end;
  }
  return activeSource;
};
const maskInactiveMarkup = (source) => {
  const { commentRanges, rawTextBodies } = analyzeMarkupActivity(source);
  return maskRanges(
    source,
    [...commentRanges, ...rawTextBodies.map(({ bodyStart, bodyEnd }) => [bodyStart, bodyEnd])].sort(
      ([left], [right]) => left - right
    )
  );
};
const readTagAttributes = (tag, label = 'markup') => {
  const attributes = new Map();
  const tagName = tag.match(/^<[^\s>]+/)?.[0];
  if (tagName == null) return attributes;
  const attributeSource = tag.slice(tagName.length, tag.lastIndexOf('>'));
  for (const match of attributeSource.matchAll(
    /(?:^|\s)([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
  )) {
    const name = match[1].toLowerCase();
    if (attributes.has(name)) {
      throw new Error(`${label}: duplicate attribute ${name} in ${tag}`);
    }
    attributes.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
};
const readTagAttribute = (tag, name) => readTagAttributes(tag).get(name);
const error404TemplatePath = 'templates/error/404.html';
const expectedError404TemplateSha256 =
  'd34614e29924ac5a0dde9769f59509ed5f2ce7bf5d2511ab050bd3149d13bae6';
const error404TemplateBuffer = readFileSync(resolve(error404TemplatePath));
const error404TemplateSha256 = createHash('sha256').update(error404TemplateBuffer).digest('hex');
if (error404TemplateSha256 !== expectedError404TemplateSha256) {
  throw new Error(
    `${error404TemplatePath}: expected SHA-256 ${expectedError404TemplateSha256}, got ${error404TemplateSha256}`
  );
}
const error404Template = error404TemplateBuffer.toString('utf8');
const error404ViewportTag = error404Template.match(
  /<meta\b[^>]*\bname=["']viewport["'][^>]*>/i
)?.[0];
if (!error404ViewportTag?.includes('width=device-width')) {
  throw new Error(`${error404TemplatePath}: viewport must include width=device-width`);
}
const readExternalScriptSource = (tag) => {
  const attributes = readTagAttributes(tag);
  const sourceAttributes = ['th:src', 'src'].filter((name) => attributes.has(name));
  return sourceAttributes.length === 1 ? attributes.get(sourceAttributes[0]) : null;
};
const extractInlineScriptBodies = (source) => {
  const { commentRanges, rawTextBodies } = analyzeMarkupActivity(source);
  const commentsMasked = maskRanges(source, commentRanges);
  return rawTextBodies
    .filter(({ name }) => name === 'script')
    .filter(({ openingTag }) => {
      const attributes = readTagAttributes(openingTag);
      return !attributes.has('th:src') && !attributes.has('src');
    })
    .map(({ bodyStart, bodyEnd }) => commentsMasked.slice(bodyStart, bodyEnd))
    .filter((body) => body.trim() !== '');
};
const parseMarkupElements = (source, label) => {
  const voidElements = new Set([
    'area',
    'base',
    'basefont',
    'bgsound',
    'br',
    'col',
    'command',
    'embed',
    'frame',
    'hr',
    'img',
    'input',
    'keygen',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
  ]);
  const elements = [];
  const stack = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start === -1) break;
    const token = readMarkupTagAt(source, start);
    if (token == null) {
      cursor = start + 1;
      continue;
    }
    cursor = token.end;
    if (token.closing) {
      const element = stack.pop();
      if (element?.name !== token.name) {
        throw new Error(`${label}: unmatched closing element </${token.name}>`);
      }
      elements.push({ ...element, contentEnd: token.start, end: token.end });
      continue;
    }
    const element = {
      name: token.name,
      openingTag: token.tag,
      start: token.start,
      contentStart: token.end,
      ancestorStarts: stack.map((ancestor) => ancestor.start),
      parentStart: stack.at(-1)?.start ?? null,
    };
    const isSelfClosingNonScript = token.name !== 'script' && isSelfClosingTag(token.tag);
    if (voidElements.has(token.name) || isSelfClosingNonScript) {
      elements.push({ ...element, contentEnd: token.end, end: token.end });
    } else {
      stack.push(element);
    }
  }
  if (stack.length > 0) {
    throw new Error(`${label}: unmatched opening element <${stack.at(-1).name}>`);
  }
  return elements;
};
const resourceAttributeNames = new Set([
  'th:src',
  'src',
  'th:data-src',
  'data-src',
  'th:href',
  'href',
  'th:data-href',
  'data-href',
]);
const createHtmlResourceLoader = ({ path, source }) => {
  const markup = maskInactiveMarkup(source);
  const label = `templates/${path}`;
  const elements = parseMarkupElements(markup, label);
  for (const element of elements) {
    const attributes = readTagAttributes(element.openingTag, label);
    const sourceAttributes =
      element.name === 'script'
        ? ['th:src', 'src']
        : element.name === 'link'
          ? ['th:href', 'href']
          : [];
    const configuredSources = sourceAttributes.filter((name) => attributes.has(name));
    if (configuredSources.length > 1) {
      throw new Error(
        `${label}: <${element.name}> must define only one of ${sourceAttributes.join(' or ')} in ${element.openingTag}`
      );
    }
  }
  const inlineScriptBodies = extractInlineScriptBodies(source);
  const externalScriptTags = elements
    .filter(
      (element) => element.name === 'script' && readExternalScriptSource(element.openingTag) != null
    )
    .map(({ openingTag }) => openingTag);
  const resourceAttributes = elements.flatMap((element) =>
    [...readTagAttributes(element.openingTag)]
      .filter(([name]) => resourceAttributeNames.has(name))
      .map(([name, value]) => ({ elementName: element.name, name, value }))
  );
  return {
    path: `templates/${path}`,
    externalScriptTags,
    resourceAttributes,
    resourceValues: [...resourceAttributes.map(({ value }) => value), ...inlineScriptBodies],
  };
};
const removedPhotosResources = [
  'assets/lib/justifiedGallery/justifiedGallery.min.css',
  'assets/lib/justifiedGallery/justifiedGallery.min.js',
  'assets/lib/masonry/masonry.pkgd.min.js',
  'assets/lib/masonry/imagesloaded.pkgd.min.js',
];
const firstPartyResourceLoaders = [
  ...htmlTemplates.map(createHtmlResourceLoader),
  ...readdirSync(templateRoot, { recursive: true })
    .filter((path) => path.endsWith('.js') && !path.startsWith('assets/lib/'))
    .map((path) => {
      const source = readFileSync(resolve(templateRoot, path), 'utf8');
      return {
        path: `templates/${path}`,
        externalScriptTags: [],
        resourceAttributes: [],
        resourceValues: [source],
      };
    }),
];
const layoutResourceLoader = firstPartyResourceLoaders.find(
  ({ path }) => path === 'templates/modules/layout.html'
);
const jqueryScript = layoutResourceLoader?.externalScriptTags.find((script) =>
  readExternalScriptSource(script)?.includes('jquery@3.7.1')
);
if (jqueryScript == null) {
  throw new Error('templates/modules/layout.html: synchronous jQuery script tag not found');
}
const globalJqueryScripts = firstPartyResourceLoaders.flatMap(({ path, externalScriptTags }) =>
  externalScriptTags
    .filter((script) => readExternalScriptSource(script)?.includes('jquery@3.7.1'))
    .map((script) => ({ path, script }))
);
if (
  globalJqueryScripts.length !== 1 ||
  globalJqueryScripts[0].path !== 'templates/modules/layout.html' ||
  globalJqueryScripts[0].script !== jqueryScript
) {
  throw new Error(
    `templates: expected one jQuery 3.7.1 script in modules/layout.html, found ${globalJqueryScripts.length}`
  );
}
const jqueryAttributes = readTagAttributes(jqueryScript);
if (
  isSelfClosingTag(jqueryScript) ||
  jqueryAttributes.has('defer') ||
  jqueryAttributes.has('async')
) {
  throw new Error(
    'templates/modules/layout.html: jQuery must use a closing tag and load synchronously before content plugin scripts'
  );
}
const settingsPath = 'settings.yaml';
const sourceSettingsBuffer = readFileSync(resolve(settingsPath));
const sourceSettings = parseYaml(sourceSettingsBuffer.toString('utf8'));
const sourceLinkSettings = sourceSettings.spec?.forms
  ?.find(({ group }) => group === 'basic')
  ?.formSchema?.filter(({ name }) => ['enable_source_link', 'source_link'].includes(name));
const enableSourceLinkSetting = sourceLinkSettings?.find(
  ({ name }) => name === 'enable_source_link'
);
const sourceLinkSetting = sourceLinkSettings?.find(({ name }) => name === 'source_link');
if (
  sourceLinkSettings?.length !== 2 ||
  enableSourceLinkSetting?.value !== false ||
  sourceLinkSetting?.value !== ''
) {
  throw new Error(
    `${settingsPath}: external asset hosting must remain opt-in with enable_source_link=false and an empty source_link default`
  );
}

const expectedSourceLinkResolver = `\${(#strings.trim(theme.config.basic.source_link) != '' and #bools.isTrue(theme.config.basic.enable_source_link) and !#strings.contains(#strings.toLowerCase(#strings.trim(theme.config.basic.source_link)), 'jiewenhuang/halo-theme-joe3.0') and !#strings.contains(#strings.toLowerCase(#strings.trim(theme.config.basic.source_link)), 'jiewenhuang.github.io')) ? #strings.trim(theme.config.basic.source_link) : '/themes/theme-Joe3'}`;
const expectedThemeConfigSourceLinkResolver = expectedSourceLinkResolver.replace(
  '#bools.isTrue(theme.config.basic.enable_source_link)',
  'enableSourceLink'
);
const normalizeSourceLinkResolver = (value) => value.replace(/\s+/g, ' ').trim();
const normalizedSourceLinkResolver = normalizeSourceLinkResolver(expectedSourceLinkResolver);
const sourceLinkResolverPolicies = [
  ['modules/layout.html', 1],
  ['modules/link.html', 1],
  ['modules/macro/tail.html', 1],
  ['modules/themeSettingVariable.html', 1],
  ['modules/key_css.html', 1],
  ['page_leaving.html', 2],
];
const activeHtmlTemplates = htmlTemplates.map(({ path, source }) => ({
  path,
  source: maskInactiveHtmlComments(source),
}));
const actualSourceLinkResolverPaths = activeHtmlTemplates
  .filter(({ source }) => source.includes('theme.config.basic.source_link'))
  .map(({ path }) => path)
  .sort();
const expectedSourceLinkResolverPaths = sourceLinkResolverPolicies.map(([path]) => path).sort();
if (actualSourceLinkResolverPaths.join('\n') !== expectedSourceLinkResolverPaths.join('\n')) {
  throw new Error(
    `${settingsPath}: source_link consumers must stay limited to ${expectedSourceLinkResolverPaths.join(', ')}, got ${actualSourceLinkResolverPaths.join(', ')}`
  );
}
for (const [path, expectedCount] of sourceLinkResolverPolicies) {
  const source = activeHtmlTemplates.find((template) => template.path === path)?.source ?? '';
  const expectedResolver =
    path === 'modules/themeSettingVariable.html'
      ? normalizeSourceLinkResolver(expectedThemeConfigSourceLinkResolver)
      : normalizedSourceLinkResolver;
  const count = [...source.matchAll(/\$\{[^}]*\}/g)].filter(
    ([expression]) => normalizeSourceLinkResolver(expression) === expectedResolver
  ).length;
  if (count !== expectedCount) {
    throw new Error(
      `templates/${path}: expected ${expectedCount} source_link resolver(s) with local fallback and upstream denylist, found ${count}`
    );
  }
}

const forbiddenUpstreamRuntimeReferences = [
  /(?:https?:)?\/\/(?:[^\s"'`()<>]*\/)?(?:jiewenhuang\/halo-theme-joe3\.0|qinhua\/halo-theme-joe2\.0|haoouba\/joe)(?:\.git)?(?=$|[@/?#\s"'`()<>])/i,
  /(?:https?:)?\/\/jiewenhuang\.github\.io(?=$|[/:?#\s"'`()<>])/i,
];
const maskCommentText = (value) => value.replace(/[^\r\n]/g, ' ');
const stripSlashComments = (source, allowLineComments) => {
  let output = '';
  let cursor = 0;
  let quote = null;
  let escaped = false;
  while (cursor < source.length) {
    const character = source[cursor];
    const nextCharacter = source[cursor + 1];
    if (quote != null) {
      output += character;
      cursor += 1;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      output += character;
      cursor += 1;
      continue;
    }
    if (character === '/' && nextCharacter === '*' && !source.startsWith('/*[[', cursor)) {
      const commentEnd = source.indexOf('*/', cursor + 2);
      const end = commentEnd === -1 ? source.length : commentEnd + 2;
      output += maskCommentText(source.slice(cursor, end));
      cursor = end;
      continue;
    }
    if (allowLineComments && character === '/' && nextCharacter === '/') {
      const lineEnd = source.indexOf('\n', cursor + 2);
      const end = lineEnd === -1 ? source.length : lineEnd;
      output += maskCommentText(source.slice(cursor, end));
      cursor = end;
      continue;
    }
    output += character;
    cursor += 1;
  }
  return output;
};
const prepareRuntimeReferenceSource = (source, path) => {
  const normalized = source.replace(/\\\//g, '/');
  if (path.endsWith('.html')) {
    let activeSource = maskInactiveHtmlComments(normalized);
    const { rawTextBodies } = analyzeMarkupActivity(activeSource);
    for (const { bodyStart, bodyEnd, name } of rawTextBodies) {
      if (name !== 'script' && name !== 'style') continue;
      const body = activeSource.slice(bodyStart, bodyEnd);
      const activeBody = stripSlashComments(body, name === 'script');
      activeSource = activeSource.slice(0, bodyStart) + activeBody + activeSource.slice(bodyEnd);
    }
    return activeSource;
  }
  if (/\.(?:js|mjs)$/.test(path)) return normalized;
  if (/\.(?:css|less)$/.test(path)) return stripSlashComments(normalized, false);
  return normalized;
};
const hasForbiddenUpstreamRuntimeReference = (source, path) =>
  forbiddenUpstreamRuntimeReferences.some((pattern) =>
    pattern.test(prepareRuntimeReferenceSource(source, path))
  );
const runtimeTextSourcePaths = [
  'theme.yaml',
  settingsPath,
  'annotation-setting.yaml',
  ...readdirSync(templateRoot, { recursive: true })
    .filter(
      (path) => !path.startsWith('assets/lib/') && /\.(?:html|css|less|js|mjs|yaml|yml)$/.test(path)
    )
    .map((path) => `templates/${path}`),
];
for (const path of runtimeTextSourcePaths) {
  const source = readFileSync(resolve(path), 'utf8');
  if (hasForbiddenUpstreamRuntimeReference(source, path)) {
    throw new Error(`${path}: runtime dependency must not reference a retired upstream repository`);
  }
}
const annotationSettingsPath = 'annotation-setting.yaml';
const sourceAnnotationSettingsBuffer = readFileSync(resolve(annotationSettingsPath));
const sourceAnnotationSettings = [];
parseYamlDocuments(sourceAnnotationSettingsBuffer.toString('utf8'), (document) => {
  if (document != null) sourceAnnotationSettings.push(document);
});
const postAnnotationSettings = sourceAnnotationSettings.filter(
  (document) =>
    document?.kind === 'AnnotationSetting' &&
    document.spec?.targetRef?.group === 'content.halo.run' &&
    document.spec?.targetRef?.kind === 'Post'
);
const postAnnotationSetting =
  postAnnotationSettings.length === 1 ? postAnnotationSettings[0] : null;
for (const name of ['enable_toc', 'enable_share']) {
  const matches =
    postAnnotationSetting?.spec?.formSchema?.filter((setting) => setting?.name === name) ?? [];
  const setting = matches.length === 1 ? matches[0] : null;
  if (
    postAnnotationSettings.length !== 1 ||
    matches.length !== 1 ||
    setting?.$formkit !== 'switch' ||
    setting.value !== 'true' ||
    setting.onValue !== 'true' ||
    setting.offValue !== 'false'
  ) {
    throw new Error(
      `${annotationSettingsPath}: Post ${name} must be one switch with true default/onValue and false offValue`
    );
  }
}

const getThemeSetting = (group, name) =>
  sourceSettings.spec?.forms
    ?.find((form) => form?.group === group)
    ?.formSchema?.find((setting) => setting?.name === name);
const enableCopySetting = getThemeSetting('post', 'enable_copy');
const enableAdsenseSetting = getThemeSetting('ads', 'enable_adsense');
const adsenseClientSetting = getThemeSetting('ads', 'adsense_client_id');
const baiduEntrySetting = getThemeSetting('other', 'check_baidu_collect');
const legacyBaiduTokenSetting = getThemeSetting('other', 'baidu_token');
const enableSheetAsideSetting = getThemeSetting('aside', 'enable_sheet_aside');
if (
  enableCopySetting?.value !== true ||
  enableAdsenseSetting?.if !== '$get(enable_ads).value == true' ||
  adsenseClientSetting?.if !==
    '$get(enable_ads).value == true && $get(enable_adsense).value == true' ||
  !['百度', '查询', '提交', '入口'].every((term) => baiduEntrySetting?.label?.includes(term)) ||
  !['不会自动', '检测', '推送'].every((term) => baiduEntrySetting?.help?.includes(term)) ||
  !['兼容', '不使用'].every((term) => legacyBaiduTokenSetting?.label?.includes(term)) ||
  !['不会读取', '输出', '使用'].every((term) => legacyBaiduTokenSetting?.help?.includes(term)) ||
  enableSheetAsideSetting?.value !== true ||
  !enableSheetAsideSetting?.help?.includes('默认开启') ||
  enableSheetAsideSetting?.help?.includes('默认关闭')
) {
  throw new Error(
    `${settingsPath}: copy, ad master switch and Baidu entry settings must keep their honest defaults and compatibility contract`
  );
}

const contentAnnotationSettings = new Map(
  sourceAnnotationSettings
    .filter(
      (document) =>
        document?.kind === 'AnnotationSetting' &&
        document.spec?.targetRef?.group === 'content.halo.run' &&
        ['Post', 'SinglePage'].includes(document.spec?.targetRef?.kind)
    )
    .map((document) => [document.spec.targetRef.kind, document])
);
const readLimitHelpRequirements = new Map([
  [
    'Post',
    ['仅普通文章', 'Halo 默认评论', '客户端视觉折叠/展开', '不适合私密或付费内容', 'Waline 不支持'],
  ],
  [
    'SinglePage',
    [
      '仅普通自定义页',
      'Halo 默认评论',
      '客户端视觉折叠/展开',
      '不适合私密或付费内容',
      '留言板模板不启用',
      'Waline 不支持',
    ],
  ],
]);
for (const kind of ['Post', 'SinglePage']) {
  const formSchema = contentAnnotationSettings.get(kind)?.spec?.formSchema ?? [];
  const baiduSetting = formSchema.find(({ name }) => name === 'enable_collect_check');
  const readLimitSetting = formSchema.find(({ name }) => name === 'enable_read_limit');
  if (
    !['百度', '查询', '提交'].every((term) => baiduSetting?.label?.includes(term)) ||
    !['评论', '展开'].every((term) => readLimitSetting?.label?.includes(term)) ||
    !readLimitHelpRequirements
      .get(kind)
      .every((requirement) => readLimitSetting?.help?.includes(requirement))
  ) {
    throw new Error(
      `${annotationSettingsPath}: ${kind} Baidu and comment-expand annotations must describe their actual client-side behavior`
    );
  }
}

const normalizeContractAttribute = (value) => value?.replace(/\s+/g, '') ?? '';
const contractTemplatePaths = [
  'templates/index.html',
  'templates/author.html',
  'templates/archives.html',
  'templates/categories.html',
  'templates/category.html',
  'templates/friends.html',
  'templates/links.html',
  'templates/moment.html',
  'templates/moments.html',
  'templates/page.html',
  'templates/page_leaving.html',
  'templates/page_links.html',
  'templates/photos.html',
  'templates/post.html',
  'templates/tag.html',
  'templates/tags.html',
  'templates/modules/layout.html',
  'templates/modules/common/actions.html',
  'templates/modules/macro/navbar.html',
  'templates/modules/common/aside.html',
  'templates/modules/common/aside_post.html',
  'templates/modules/common/footer.html',
  'templates/modules/themeSettingVariable.html',
  'templates/modules/widgets/asideWidget.html',
];
const createContractDocument = (path, source = readFileSync(resolve(path), 'utf8')) => {
  const activeMarkup = maskInactiveMarkup(source);
  const elements = parseMarkupElements(activeMarkup, path);
  return {
    activeMarkup,
    byStart: new Map(elements.map((element) => [element.start, element])),
    elements,
    path,
    source,
  };
};
const contractDocuments = new Map(
  contractTemplatePaths.map((path) => [path, createContractDocument(path)])
);
const contractAttributes = (document, element) =>
  readTagAttributes(element.openingTag, document.path);
const contractParent = (document, element) => document.byStart.get(element.parentStart);
const hasContractClass = (document, element, className) =>
  (contractAttributes(document, element).get('class') ?? '').split(/\s+/).includes(className);
const requireUniqueContractElement = (document, predicate, description) => {
  const matches = document.elements.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`${document.path}: expected one ${description}, found ${matches.length}`);
  }
  return matches[0];
};
const requireContractAttribute = (document, element, name, expected, description) => {
  if (element == null) {
    throw new Error(`${document.path}: ${description}`);
  }
  const actual = contractAttributes(document, element).get(name);
  if (normalizeContractAttribute(actual) !== normalizeContractAttribute(expected)) {
    throw new Error(`${document.path}: ${description}`);
  }
};
const requireContractAttributeAbsent = (document, element, name, description) => {
  if (element == null || contractAttributes(document, element).has(name)) {
    throw new Error(`${document.path}: ${description}`);
  }
};

const layoutPagePaths = htmlTemplates
  .filter(({ path, source }) => !path.includes('/') && source.includes('modules/layout :: html'))
  .map(({ path }) => `templates/${path}`);
for (const path of layoutPagePaths) {
  const document = contractDocuments.get(path) ?? createContractDocument(path);
  const landmarks = document.elements.filter((element) => {
    const attributes = contractAttributes(document, element);
    return element.name === 'main' || attributes.get('role') === 'main';
  });
  if (landmarks.length !== 1) {
    throw new Error(`${path}: every shared-layout page must render exactly one main landmark`);
  }
  const main = landmarks[0];
  if (
    main.name !== 'main' ||
    !hasContractClass(document, main, 'joe_main_container') ||
    contractAttributes(document, main).get('id') !== 'joe-main-content' ||
    contractAttributes(document, main).get('tabindex') !== '-1'
  ) {
    throw new Error(
      `${path}: the existing joe_main_container must be <main id="joe-main-content" tabindex="-1">`
    );
  }
}

const navbarDocument = contractDocuments.get('templates/modules/macro/navbar.html');
const skipLink = requireUniqueContractElement(
  navbarDocument,
  (element) => element.name === 'a' && hasContractClass(navbarDocument, element, 'joe_skip-link'),
  'skip link'
);
requireContractAttribute(
  navbarDocument,
  skipLink,
  'href',
  '#joe-main-content',
  'the skip link must target the shared main landmark'
);
const mobileMenuTriggers = navbarDocument.elements.filter((element) =>
  hasContractClass(navbarDocument, element, 'joe_header__above-slideicon')
);
const mobileMenu = requireUniqueContractElement(
  navbarDocument,
  (element) => contractAttributes(navbarDocument, element).get('id') === 'joe-mobile-navigation',
  'mobile menu container'
);
const mobileToc = requireUniqueContractElement(
  navbarDocument,
  (element) => contractAttributes(navbarDocument, element).get('id') === 'joe-mobile-toc',
  'mobile TOC container'
);
const actionsDocument = contractDocuments.get('templates/modules/common/actions.html');
const mobileTocTrigger = requireUniqueContractElement(
  actionsDocument,
  (element) => element.name === 'button' && hasContractClass(actionsDocument, element, 'toc'),
  'mobile TOC trigger'
);
if (
  mobileMenuTriggers.length !== 1 ||
  mobileMenuTriggers[0].name !== 'button' ||
  contractAttributes(navbarDocument, mobileMenuTriggers[0]).get('type') !== 'button' ||
  contractAttributes(navbarDocument, mobileMenuTriggers[0]).get('aria-controls') !==
    'joe-mobile-navigation' ||
  contractAttributes(navbarDocument, mobileMenuTriggers[0]).get('aria-expanded') !== 'false' ||
  !contractAttributes(navbarDocument, mobileMenuTriggers[0]).get('aria-label') ||
  mobileMenu.name !== 'nav' ||
  contractAttributes(navbarDocument, mobileMenu).get('aria-label') !== '移动端主导航' ||
  mobileToc.name !== 'div' ||
  contractAttributes(actionsDocument, mobileTocTrigger).get('aria-controls') !== 'joe-mobile-toc' ||
  contractAttributes(actionsDocument, mobileTocTrigger).get('aria-expanded') !== 'false'
) {
  throw new Error(
    'templates/modules/macro/navbar.html: mobile navigation must use one labelled native button controlling one stable menu id'
  );
}

const drawerMobileMethod = commonScript.match(
  /drawerMobile\(\)\s*\{([\s\S]*?)\n\t\},\n\t\/\* 小屏幕搜索框/
)?.[1];
const activeDrawerRuntime = stripSlashComments(drawerMobileMethod ?? '', true);
const skipLinkMethod = commonScript.match(
  /initSkipLink\(\)\s*\{([\s\S]*?)\n\t\},\n\t\/\* 小屏幕搜索框/
)?.[1];
const activeSkipLinkRuntime = stripSlashComments(skipLinkMethod ?? '', true);
const maskCloseMethod = commonScript.match(
  /maskClose\(\)\s*\{([\s\S]*?)\n\t\},\n\t\/\* 移动端侧边栏菜单手风琴/
)?.[1];
const activeMaskCloseRuntime = stripSlashComments(maskCloseMethod ?? '', true);
const postTocMethod = postScript.match(
  /initToc\(reload\)\s*\{([\s\S]*?)\n\t\},\n\t\/\*\*初始化左侧工具条/
)?.[1];
const activePostTocRuntime = stripSlashComments(postTocMethod ?? '', true);
const landmarkOverrideStyles = readFileSync(
  resolve('templates/assets/css/joe-next-overrides.less'),
  'utf8'
);
const mobileTriggerStyles = landmarkOverrideStyles.match(
  /#Joe\s+\.joe_header__above-slideicon\s*\{([\s\S]*?)\n\}/
)?.[1];
const commonRuntimeAst = parseAst(commonScript, { sourceType: 'script' }, commonScriptPath);
const overlayStateFactories = [];
walkEffectAst(commonRuntimeAst, (node) => {
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'createJoeOverlayScrollState') {
    overlayStateFactories.push(node);
  }
});
if (overlayStateFactories.length !== 1) {
  throw new Error(`${commonScriptPath}: expected one overlay scroll-state factory`);
}
const overlayStateFactorySource = commonScript.slice(
  overlayStateFactories[0].start,
  overlayStateFactories[0].end
);
const overlayStateFactory = Function(`"use strict"; return (${overlayStateFactorySource});`)();
let overlayOpen = false;
const throwingStorage = {
  getItem() {
    throw new DOMException('denied', 'SecurityError');
  },
  setItem() {
    throw new DOMException('denied', 'SecurityError');
  },
  removeItem() {
    throw new DOMException('denied', 'SecurityError');
  },
};
const failSoftState = overlayStateFactory(throwingStorage, () => overlayOpen);
failSoftState.remember(120);
overlayOpen = true;
failSoftState.remember(999);
const failSoftRestore = failSoftState.restore();
const staleStorageValues = new Map([['joeOverlayScroll', 'garbage']]);
const staleStorage = {
  getItem(key) {
    return staleStorageValues.get(key) ?? null;
  },
  setItem(key, value) {
    staleStorageValues.set(key, value);
  },
  removeItem(key) {
    staleStorageValues.delete(key);
  },
};
overlayOpen = false;
const staleState = overlayStateFactory(staleStorage, () => overlayOpen);
const ignoredStaleRestore = staleState.restore();
staleState.remember(Number.NaN);
const garbageRestore = staleState.restore();
staleState.remember(-1);
const negativeRestore = staleState.restore();
staleState.remember(Number.POSITIVE_INFINITY);
const infiniteRestore = staleState.restore();
staleState.remember(42);
overlayOpen = true;
staleState.remember(84);
const switchedRestore = staleState.restore();
const postRuntimeAst = parseAst(postScript, { sourceType: 'script' }, postScriptPath);
const tocFocusFunctions = [];
walkEffectAst(postRuntimeAst, (node) => {
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'focusJoeTocHeading') {
    tocFocusFunctions.push(node);
  }
});
if (tocFocusFunctions.length !== 1) {
  throw new Error(`${postScriptPath}: expected one mobile TOC heading-focus function`);
}
const tocFocusSource = postScript.slice(tocFocusFunctions[0].start, tocFocusFunctions[0].end);
const headingAttributes = new Map();
let headingFocusOptions = null;
let headingBlurHandler = null;
let fallbackFocusCount = 0;
const headingHarness = {
  hasAttribute(name) {
    return headingAttributes.has(name);
  },
  getAttribute(name) {
    return headingAttributes.get(name) ?? null;
  },
  setAttribute(name, value) {
    headingAttributes.set(name, value);
  },
  removeAttribute(name) {
    headingAttributes.delete(name);
  },
  addEventListener(type, callback, options) {
    if (type === 'blur' && options?.once === true) headingBlurHandler = callback;
  },
  focus(options) {
    headingFocusOptions = options;
  },
};
const tocFocusHarness = Function(
  'document',
  `"use strict"; return (${tocFocusSource});`
)({
  getElementById(id) {
    return id === 'section 1' ? headingHarness : null;
  },
});
const fallbackHarness = {
  focus() {
    fallbackFocusCount += 1;
  },
};
tocFocusHarness({ currentTarget: { closest: () => ({ hash: '#section%201' }) } }, fallbackHarness);
headingAttributes.set('tabindex', '-1');
headingBlurHandler?.();
const absentTabindexRestored = !headingAttributes.has('tabindex');
headingAttributes.set('tabindex', '0');
headingBlurHandler = null;
tocFocusHarness({ currentTarget: { closest: () => ({ hash: '#section%201' }) } }, fallbackHarness);
headingAttributes.set('tabindex', '-1');
headingBlurHandler?.();
const explicitTabindexRestored = headingAttributes.get('tabindex') === '0';
tocFocusHarness({ target: { closest: () => ({ hash: '#missing' }) } }, fallbackHarness);
tocFocusHarness({ target: { closest: () => ({ hash: '#%E0%A4' }) } }, fallbackHarness);
const maskDrawerCaptureIndex = activeMaskCloseRuntime.indexOf('const drawerWasOpen');
const maskTocCaptureIndex = activeMaskCloseRuntime.indexOf('const tocWasOpen');
const maskDrawerCloseIndex = activeMaskCloseRuntime.indexOf(
  '$(".joe_header__slideout").removeClass("active")'
);
const maskTocCloseIndex = activeMaskCloseRuntime.indexOf(
  '$(".joe_header__toc").removeClass("active")'
);
const maskTocFocusIndex = activeMaskCloseRuntime.indexOf(
  'if (tocWasOpen) $(".joe_action .toc").trigger("focus")'
);
const maskDrawerFocusIndex = activeMaskCloseRuntime.indexOf(
  'else if (drawerWasOpen) $(".joe_header__above-slideicon").trigger("focus")'
);
const tocHiddenCloseIndex = activePostTocRuntime.indexOf('$mobile_toc.removeClass("active")');
const tocStateClearIndex = activePostTocRuntime.indexOf('window.JoeOverlayScroll.clear()');
const tocHeadingFocusIndex = activePostTocRuntime.indexOf(
  'focusJoeTocHeading(e, $btn_mobile_toc[0])'
);
const drawerFocusSource = commonScript.match(/function scheduleJoeDrawerFocus\([\s\S]*?\n\}/)?.[0];
const drawerFocusControllerSource = commonScript
  .match(
    /function createJoeDrawerFocusController\([\s\S]*?\n\}\n\nconst joeDrawerFocusController/
  )?.[0]
  .replace(/\n\nconst joeDrawerFocusController$/, '');
const verifyDrawerFocusBehavior = (source) => {
  const scheduler = Function(
    'window',
    `"use strict"; ${source}; return scheduleJoeDrawerFocus;`
  )({ getComputedStyle: (node) => ({ visibility: node.visibility ?? 'visible' }) });
  const createItem = ({ rect = true, closest = null, ancestorVisibility = 'visible' } = {}) => {
    const item = {
      focusCount: 0,
      getClientRects: () => (rect ? [1] : []),
      closest: (selector) => (selector === closest ? {} : null),
      parentElement: null,
      focus() {
        this.focusCount += 1;
      },
    };
    if (ancestorVisibility !== 'visible') {
      item.parentElement = { visibility: ancestorVisibility, parentElement: null };
    }
    return item;
  };
  const flush = (frames) => {
    while (frames.length) frames.shift()();
  };
  const verifyRejectedCandidate = (options) => {
    const frames = [];
    const rejected = createItem(options);
    const visible = createItem();
    scheduler(
      (callback) => frames.push(callback),
      () => true,
      () => [rejected, visible],
      1,
      () => 1
    );
    flush(frames);
    return rejected.focusCount === 0 && visible.focusCount === 1;
  };
  const frames = [];
  let generation = 1;
  const stale = createItem();
  const current = createItem();
  scheduler(
    (callback) => frames.push(callback),
    () => true,
    () => [stale],
    generation,
    () => generation
  );
  generation += 1;
  generation += 1;
  scheduler(
    (callback) => frames.push(callback),
    () => true,
    () => [current],
    generation,
    () => generation
  );
  flush(frames);
  return (
    stale.focusCount === 0 &&
    current.focusCount === 1 &&
    verifyRejectedCandidate({ ancestorVisibility: 'hidden' }) &&
    verifyRejectedCandidate({ closest: '[hidden]' }) &&
    verifyRejectedCandidate({ closest: '[inert]' }) &&
    verifyRejectedCandidate({ closest: '[aria-hidden="true"]' }) &&
    verifyRejectedCandidate({ rect: false })
  );
};
const createDrawerFocusControllerHarness = (controllerSource = drawerFocusControllerSource) => {
  const frames = [];
  const createController = Function(
    'window',
    `"use strict"; ${drawerFocusSource}; ${controllerSource}; return createJoeDrawerFocusController;`
  )({ getComputedStyle: () => ({ visibility: 'visible' }) });
  const makeItem = () => ({
    focusCount: 0,
    getClientRects: () => [1],
    closest: () => null,
    parentElement: null,
    focus() {
      this.focusCount += 1;
    },
  });
  return {
    createController: () => createController((callback) => frames.push(callback)),
    flush: () => {
      while (frames.length) frames.shift()();
    },
    makeItem,
  };
};
const verifyBeginInitCancelsQueuedFocus = (controllerSource) => {
  const harness = createDrawerFocusControllerHarness(controllerSource);
  const controller = harness.createController();
  const contextA = controller.beginInit();
  const stale = harness.makeItem();
  contextA.schedule(
    () => true,
    () => [stale]
  );
  controller.beginInit();
  harness.flush();
  return stale.focusCount === 0;
};
const verifyInvalidateCancelsQueuedFocus = (controllerSource) => {
  const harness = createDrawerFocusControllerHarness(controllerSource);
  const context = harness.createController().beginInit();
  const stale = harness.makeItem();
  context.schedule(
    () => true,
    () => [stale]
  );
  context.invalidate();
  harness.flush();
  return stale.focusCount === 0;
};
const verifyLatestScheduleWins = (controllerSource) => {
  const harness = createDrawerFocusControllerHarness(controllerSource);
  const context = harness.createController().beginInit();
  const stale = harness.makeItem();
  const current = harness.makeItem();
  context.schedule(
    () => true,
    () => [stale]
  );
  context.schedule(
    () => true,
    () => [current]
  );
  harness.flush();
  return stale.focusCount === 0 && current.focusCount === 1;
};
const verifyDrawerFocusAcrossInitContexts = (useLocalControllers = false) => {
  const harness = createDrawerFocusControllerHarness();
  const sharedController = harness.createController();
  const contextA = sharedController.beginInit();
  const stale = harness.makeItem();
  contextA.schedule(
    () => true,
    () => [stale]
  );
  const controllerB = useLocalControllers ? harness.createController() : sharedController;
  const contextB = controllerB.beginInit();
  contextB.invalidate();
  const current = harness.makeItem();
  contextB.schedule(
    () => true,
    () => [current]
  );
  harness.flush();
  return stale.focusCount === 0 && current.focusCount === 1;
};
const mutateDrawerController = (target, replacement) => {
  if (!drawerFocusControllerSource || drawerFocusControllerSource.split(target).length !== 2) {
    return null;
  }
  return drawerFocusControllerSource.replace(target, replacement);
};
const beginInitGenerationMutation = mutateDrawerController(
  'beginInit() {\n\t\t\tgeneration += 1;',
  'beginInit() {\n\t\t\tgeneration += 0;'
);
const invalidateGenerationMutation = mutateDrawerController(
  'invalidate() {\n\t\t\t\t\tgeneration += 1;',
  'invalidate() {\n\t\t\t\t\tgeneration += 0;'
);
const scheduleGenerationMutation = mutateDrawerController(
  'const focusGeneration = ++generation;',
  'const focusGeneration = generation;'
);
const drawerLocalGenerationMutation = activeDrawerRuntime.replace(
  'const drawerFocusContext = joeDrawerFocusController.beginInit();',
  'const drawerFocusContext = createJoeDrawerFocusController(window.requestAnimationFrame).beginInit();'
);
const drawerFocusMutations = [
  ['if (focusGeneration !== getGeneration() || !isOpen()) return;', 'if (!isOpen()) return;'],
  ['if (!item.getClientRects().length) return false;', 'if (false) return false;'],
  [`if (item.closest('[aria-hidden="true"]')) return false;`, 'if (false) return false;'],
  ['if (item.closest("[inert]")) return false;', 'if (false) return false;'],
  ['if (item.closest("[hidden]")) return false;', 'if (false) return false;'],
  [
    'if (window.getComputedStyle(node).visibility === "hidden") return false;',
    'if (false) return false;',
  ],
].map(([guard, replacement]) => drawerFocusSource?.replace(guard, replacement));
if (!drawerFocusSource || !drawerFocusControllerSource) {
  throw new Error(`${commonScriptPath}: drawer focus implementation could not be verified`);
}
const beginInitCancellationPassed = verifyBeginInitCancelsQueuedFocus(drawerFocusControllerSource);
if (
  !beginInitCancellationPassed ||
  !beginInitGenerationMutation ||
  verifyBeginInitCancelsQueuedFocus(beginInitGenerationMutation)
) {
  throw new Error(`${commonScriptPath}: beginInit stale cancellation must invalidate queued focus`);
}
const invalidateCancellationPassed = verifyInvalidateCancelsQueuedFocus(
  drawerFocusControllerSource
);
if (
  !invalidateCancellationPassed ||
  !invalidateGenerationMutation ||
  verifyInvalidateCancelsQueuedFocus(invalidateGenerationMutation)
) {
  throw new Error(
    `${commonScriptPath}: invalidate stale cancellation must invalidate queued focus`
  );
}
const scheduleSupersessionPassed = verifyLatestScheduleWins(drawerFocusControllerSource);
if (
  !scheduleSupersessionPassed ||
  !scheduleGenerationMutation ||
  verifyLatestScheduleWins(scheduleGenerationMutation)
) {
  throw new Error(`${commonScriptPath}: schedule supersession must focus only the latest request`);
}
if (
  !verifyDrawerFocusAcrossInitContexts() ||
  drawerLocalGenerationMutation === activeDrawerRuntime ||
  verifyDrawerFocusAcrossInitContexts(true)
) {
  throw new Error(
    `${commonScriptPath}: drawer focus generation must be shared across initializations`
  );
}
if (
  !verifyDrawerFocusBehavior(drawerFocusSource) ||
  drawerFocusMutations.some(
    (mutation) => !mutation || mutation === drawerFocusSource || verifyDrawerFocusBehavior(mutation)
  )
) {
  throw new Error(
    `${commonScriptPath}: drawer focus must reject stale generations and hidden candidates`
  );
}
const verifySkipLinkBehavior = (source) => {
  const handlers = [];
  let pushes = 0;
  let focuses = 0;
  let scrolls = 0;
  const selection = {
    off(event) {
      if (event === 'click.joeSkipLink') handlers.length = 0;
      return this;
    },
    on(event, handler) {
      if (event === 'click.joeSkipLink') handlers.push(handler);
      return this;
    },
  };
  const target = {
    focus: () => {
      focuses += 1;
    },
    scrollIntoView: () => {
      scrolls += 1;
    },
  };
  const init = Function(
    '$',
    'document',
    'history',
    `"use strict"; return function () {${source}};`
  )(() => selection, { getElementById: () => target }, { pushState: () => (pushes += 1) });
  init();
  init();
  handlers.forEach((handler) =>
    handler.call({ hash: '#joe-main-content' }, { preventDefault() {} })
  );
  return handlers.length === 1 && pushes === 1 && focuses === 1 && scrolls === 1;
};
const skipLinkMutation = activeSkipLinkRuntime.replace('.off("click.joeSkipLink")', '');
if (!verifySkipLinkBehavior(activeSkipLinkRuntime) || verifySkipLinkBehavior(skipLinkMutation)) {
  throw new Error(`${commonScriptPath}: skip-link initialization must be idempotent`);
}
if (
  !activeDrawerRuntime.includes('.attr("aria-expanded", String(expanded))') ||
  !activeDrawerRuntime.includes('e.key !== "Escape"') ||
  !activeDrawerRuntime.includes('closeDrawer(true)') ||
  !activeDrawerRuntime.includes('$trigger.trigger("focus")') ||
  !activeDrawerRuntime.includes(".find('a[href], button:not([disabled])") ||
  !activeDrawerRuntime.includes('joeDrawerFocusController.beginInit()') ||
  !activeDrawerRuntime.includes('drawerFocusContext.invalidate()') ||
  !activeDrawerRuntime.includes('drawerFocusContext.schedule(') ||
  activeDrawerRuntime.includes('let drawerFocusGeneration') ||
  !activeDrawerRuntime.includes('$mobileToc.removeClass("active")') ||
  !activeDrawerRuntime.includes('window.JoeOverlayScroll.remember(') ||
  !activeDrawerRuntime.includes('window.JoeOverlayScroll.restore()') ||
  !activeDrawerRuntime.includes('$trigger.off("click.joeMobileDrawer").on(') ||
  !activeDrawerRuntime.includes('$(document).off("keydown.joeMobileDrawer").on(') ||
  !activeMaskCloseRuntime.includes('.attr("aria-expanded", "false")') ||
  !activeMaskCloseRuntime.includes('.off("click.joeOverlay touchmove.joeOverlay")') ||
  !activeMaskCloseRuntime.includes('.on("click.joeOverlay"') ||
  !activeMaskCloseRuntime.includes('.on("touchmove.joeOverlay"') ||
  !activeMaskCloseRuntime.includes('$(".joe_header__toc").removeClass("active")') ||
  !activeMaskCloseRuntime.includes('const drawerWasOpen') ||
  !activeMaskCloseRuntime.includes('const tocWasOpen') ||
  !activeMaskCloseRuntime.includes('if (tocWasOpen)') ||
  !activeMaskCloseRuntime.includes('else if (drawerWasOpen)') ||
  !activeMaskCloseRuntime.includes('window.JoeOverlayScroll.restore()') ||
  !activePostTocRuntime.includes('$drawer.removeClass("active")') ||
  !activePostTocRuntime.includes('.attr("aria-expanded", "false")') ||
  !activePostTocRuntime.includes('$btn_mobile_toc.off("click.joeMobileToc").on(') ||
  !activePostTocRuntime.includes('if ($mobile_toc.hasClass("active"))') ||
  !activePostTocRuntime.includes('closeMobileToc(true);\n\t\t\t\t\treturn;') ||
  !activePostTocRuntime.includes('$(document).off("keydown.joeMobileToc").on(') ||
  !activePostTocRuntime.includes('e.key !== "Escape"') ||
  !activePostTocRuntime.includes('closeMobileToc(true)') ||
  !activePostTocRuntime.includes('$btn_mobile_toc.trigger("focus")') ||
  !activePostTocRuntime.includes('window.JoeOverlayScroll.remember(') ||
  !activePostTocRuntime.includes('window.JoeOverlayScroll.restore()') ||
  !activePostTocRuntime.includes('window.JoeOverlayScroll.clear()') ||
  !activePostTocRuntime.includes('.attr("aria-expanded", "true")') ||
  !activePostTocRuntime.includes('.attr("aria-expanded", "false")') ||
  !activePostTocRuntime.includes('$mobile_toc.find(\'a[href]\').filter(":visible")') ||
  !tocFocusSource.includes('document.getElementById(decodeURIComponent(hash.slice(1)))') ||
  tocFocusSource.includes('document.querySelector') ||
  headingFocusOptions?.preventScroll !== true ||
  !absentTabindexRestored ||
  !explicitTabindexRestored ||
  fallbackFocusCount !== 2 ||
  !mobileTriggerStyles?.includes('width: 44px;') ||
  !mobileTriggerStyles.includes('height: 44px;') ||
  !mobileTriggerStyles.includes('appearance: none;') ||
  !/@media\s*\(max-width:\s*768px\)[\s\S]*?#Joe\s+\.joe_header__above-slideicon\s*\{[\s\S]*?display:\s*inline-flex;/.test(
    landmarkOverrideStyles
  ) ||
  failSoftRestore !== 120 ||
  ignoredStaleRestore !== null ||
  garbageRestore !== null ||
  negativeRestore !== null ||
  infiniteRestore !== null ||
  switchedRestore !== 42 ||
  staleStorageValues.has('joeOverlayScroll') ||
  maskDrawerCaptureIndex < 0 ||
  maskTocCaptureIndex < 0 ||
  maskDrawerCloseIndex <= maskDrawerCaptureIndex ||
  maskTocCloseIndex <= maskTocCaptureIndex ||
  maskTocFocusIndex <= maskTocCloseIndex ||
  maskDrawerFocusIndex <= maskDrawerCloseIndex ||
  tocHiddenCloseIndex < 0 ||
  tocStateClearIndex <= tocHiddenCloseIndex ||
  tocHeadingFocusIndex <= tocStateClearIndex
) {
  throw new Error(
    `${commonScriptPath}: drawer and mobile TOC must be idempotent, mutually exclusive 44px controls with synchronized state, Escape close and focus restoration`
  );
}
if (
  !activeSkipLinkRuntime.includes('.off("click.joeSkipLink")') ||
  !activeSkipLinkRuntime.includes('.on("click.joeSkipLink"') ||
  !activeSkipLinkRuntime.includes('document.getElementById("joe-main-content")') ||
  !activeSkipLinkRuntime.includes('e.preventDefault()') ||
  !activeSkipLinkRuntime.includes('history.pushState(null, "", this.hash)') ||
  !activeSkipLinkRuntime.includes('target.focus({ preventScroll: true })') ||
  !activeSkipLinkRuntime.includes('target.scrollIntoView()')
) {
  throw new Error(
    `${commonScriptPath}: skip-link click must update the fragment and programmatically focus the shared main landmark`
  );
}
const readLimitPolicies = new Map([
  ['templates/post.html', { entity: 'post' }],
  ['templates/page.html', { entity: 'singlePage' }],
]);
const createReadLimitGuard = (entity) =>
  `#annotations.getOrDefault(${entity}, 'enable_read_limit', 'false') == 'true' and (theme.config.basic.comment_option == 'default' or #strings.trim(theme.config.basic.waline.waline_serverURL) == '') and #bools.isTrue(theme.config.post.enable_comment) and #annotations.getOrDefault(${entity}, 'enable_comment', 'true') == 'true' and not #bools.isTrue(theme.config.other.enable_clean_mode) and (#authentication.name == 'anonymousUser' or contributor.name != #authentication.name)`;
const validateReadLimitDocument = (document, entity) => {
  const article = requireUniqueContractElement(
    document,
    (element) =>
      element.name === 'article' &&
      (contractAttributes(document, element).get('th:class') ?? '').includes('joe_detail__article'),
    'article content element'
  );
  const cta = requireUniqueContractElement(
    document,
    (element) => element.name === 'joe-read-limited',
    'joe-read-limited CTA'
  );
  const ctaVariables = contractParent(document, cta);
  const ctaGuard = contractParent(document, ctaVariables);
  const guard = createReadLimitGuard(entity);
  const classAppend = contractAttributes(document, article).get('th:classappend') ?? '';
  if (
    classAppend.includes('enable_read_limit') ||
    /['"]limited['"]/.test(classAppend) ||
    ctaVariables?.name !== 'th:block' ||
    ctaGuard?.name !== 'th:block' ||
    !contractAttributes(document, ctaVariables).has('th:with')
  ) {
    throw new Error(
      `${document.path}: read limiting must be progressive enhancement with a guarded CTA marker and no server-rendered limited class`
    );
  }
  requireContractAttributeAbsent(
    document,
    ctaVariables,
    'th:if',
    'joe-read-limited variable scope must not share a tag with its conditional processor'
  );
  requireContractAttributeAbsent(
    document,
    ctaGuard,
    'th:with',
    'joe-read-limited guard must not share a tag with its variable processor'
  );
  requireContractAttribute(
    document,
    ctaGuard,
    'th:if',
    `\${${guard}}`,
    'joe-read-limited parent must use the same complete available-comment guard'
  );
  requireContractAttribute(
    document,
    cta,
    'comment-plugin',
    'CommentWidgetPlugin',
    'comment-expand must use the Halo CommentWidget state provider'
  );
  if (
    document.elements.some((element) =>
      [...contractAttributes(document, element).values()].some((value) =>
        value.includes('WalinePlugin')
      )
    )
  ) {
    throw new Error(`${document.path}: Waline with a configured server must fail open`);
  }
  return { article, cta, ctaGuard, ctaVariables, guard };
};
for (const [path, { entity }] of readLimitPolicies) {
  validateReadLimitDocument(contractDocuments.get(path), entity);
}
for (const document of contractDocuments.values()) {
  if (document.elements.filter((element) => element.name === 'joe-read-limited').length > 1) {
    throw new Error(
      `${document.path}: each rendered page may contain at most one joe-read-limited`
    );
  }
}
const pageLeavingDocument = contractDocuments.get('templates/page_leaving.html');
const pageLeavingArticle = requireUniqueContractElement(
  pageLeavingDocument,
  (element) =>
    element.name === 'article' &&
    (contractAttributes(pageLeavingDocument, element).get('th:class') ?? '').includes(
      'joe_detail__article'
    ),
  'leaving article content element'
);
if (
  pageLeavingDocument.elements.some((element) => element.name === 'joe-read-limited') ||
  (
    contractAttributes(pageLeavingDocument, pageLeavingArticle).get('th:classappend') ?? ''
  ).includes('enable_read_limit')
) {
  throw new Error(
    'templates/page_leaving.html: the leaving template has no unlock component and must never enable read limiting'
  );
}
const asideMasterGuard = '#bools.isTrue(theme.config.aside.enable_aside)';
const commonAsideDocument = contractDocuments.get('templates/modules/common/aside.html');
const commonAside = requireUniqueContractElement(
  commonAsideDocument,
  (element) =>
    element.name === 'aside' && hasContractClass(commonAsideDocument, element, 'joe_aside'),
  'shared non-article aside root'
);
requireContractAttribute(
  commonAsideDocument,
  commonAside,
  'th:if',
  `\${${asideMasterGuard}}`,
  'the shared non-article sidebar root must enforce enable_aside'
);
const asideCallerPolicies = new Map([
  ['templates/index.html', `\${${asideMasterGuard}}`],
  ['templates/archives.html', '${#bools.isTrue(theme.config.aside.enable_archives_aside)}'],
  ['templates/categories.html', '${#bools.isTrue(theme.config.aside.enable_categories_aside)}'],
  ['templates/friends.html', '${#bools.isTrue(theme.config.aside.enable_friends_aside)}'],
  ['templates/links.html', '${#bools.isTrue(theme.config.aside.enable_links_aside)}'],
  ['templates/moment.html', '${#bools.isTrue(theme.config.aside.enable_journals_aside)}'],
  ['templates/moments.html', '${#bools.isTrue(theme.config.aside.enable_journals_aside)}'],
  [
    'templates/page.html',
    "${#bools.isTrue(theme.config.aside.enable_sheet_aside)} and ${#annotations.getOrDefault(singlePage, 'enable_aside', 'true') == 'true'}",
  ],
  [
    'templates/page_leaving.html',
    "${#bools.isTrue(theme.config.aside.enable_sheet_aside)} and ${#annotations.getOrDefault(singlePage, 'enable_aside', 'true') == 'true'}",
  ],
  ['templates/page_links.html', '${#bools.isTrue(theme.config.aside.enable_links_aside)}'],
  ['templates/photos.html', '${#bools.isTrue(theme.config.aside.enable_photos_aside)}'],
  ['templates/tags.html', '${#bools.isTrue(theme.config.aside.enable_tags_aside)}'],
]);
for (const [path, expectedGuard] of asideCallerPolicies) {
  const document = contractDocuments.get(path);
  const replacement = requireUniqueContractElement(
    document,
    (element) =>
      contractAttributes(document, element).get('th:replace') ===
      '~{modules/common/aside :: aside}',
    'common aside replacement'
  );
  const guard = contractParent(document, replacement);
  if (guard?.name !== 'th:block') {
    throw new Error(`${path}: common aside replacement must have a page-level guard`);
  }
  requireContractAttribute(
    document,
    guard,
    'th:if',
    expectedGuard,
    'page-level aside switch must serialize through #bools.isTrue'
  );
}
const asidePostDocument = contractDocuments.get('templates/modules/common/aside_post.html');
const asidePostRoot = requireUniqueContractElement(
  asidePostDocument,
  (element) =>
    element.name === 'aside' && hasContractClass(asidePostDocument, element, 'joe_aside'),
  'article aside root'
);
if (
  contractAttributes(asidePostDocument, asidePostRoot).has('th:if') ||
  asidePostDocument.elements.some((element) =>
    [...contractAttributes(asidePostDocument, element).values()].some((value) =>
      value.includes(asideMasterGuard)
    )
  )
) {
  throw new Error(
    'templates/modules/common/aside_post.html: article sidebar must remain independent of the non-article enable_aside master switch'
  );
}
const postDocument = contractDocuments.get('templates/post.html');
const postAsideReplacement = requireUniqueContractElement(
  postDocument,
  (element) =>
    contractAttributes(postDocument, element).get('th:replace') ===
    '~{modules/common/aside_post :: aside_post}',
  'article aside replacement'
);
requireContractAttribute(
  postDocument,
  contractParent(postDocument, postAsideReplacement),
  'th:if',
  "${#bools.isTrue(theme.config.aside.enable_post_aside)} and ${#annotations.getOrDefault(post, 'enable_aside', 'true') == 'true'}",
  'article sidebar must check only the article-level and per-post switches'
);

const adMasterGuard = '#bools.isTrue(theme.config.ads.enable_ads)';
const repeatedAdPolicies = [
  {
    document: postDocument,
    each: 'ads_data : ${theme.config.ads.ads_top}',
    guard:
      "${#bools.isTrue(theme.config.ads.enable_ads)} and ${theme.config.ads.enable_ads_top != 'none'} and ${not #lists.isEmpty(theme.config.ads.ads_top)}",
  },
  {
    document: postDocument,
    each: 'ads_data : ${theme.config.ads.ads_bottom}',
    guard:
      "${#bools.isTrue(theme.config.ads.enable_ads)} and ${theme.config.ads.enable_ads_bottom != 'none'} and ${not #lists.isEmpty(theme.config.ads.ads_bottom)}",
  },
  {
    document: asidePostDocument,
    each: 'ads_data : ${theme.config.ads.ads_aside}',
    guard:
      "${#bools.isTrue(theme.config.ads.enable_ads)} and ${theme.config.ads.enable_ads_aside != 'none'} and ${not #lists.isEmpty(theme.config.ads.ads_aside)}",
  },
];
for (const { document, each, guard } of repeatedAdPolicies) {
  const adBlock = requireUniqueContractElement(
    document,
    (element) => contractAttributes(document, element).get('th:each') === each,
    `${each} ad producer`
  );
  const adGuard = contractParent(document, adBlock);
  if (adGuard?.name !== 'th:block') {
    throw new Error(`${document.path}: ${each} must be nested under its ad guard`);
  }
  requireContractAttribute(
    document,
    adGuard,
    'th:if',
    guard,
    'ad producer parent must bind the master switch and its local settings'
  );
  requireContractAttributeAbsent(
    document,
    adBlock,
    'th:if',
    'ad iterator must not share a tag with its conditional processor'
  );
  requireContractAttributeAbsent(
    document,
    adGuard,
    'th:each',
    'ad guard must not share a tag with its iterator processor'
  );
}
const asideWidgetDocument = contractDocuments.get('templates/modules/widgets/asideWidget.html');
const asideAdFragment = requireUniqueContractElement(
  asideWidgetDocument,
  (element) =>
    contractAttributes(asideWidgetDocument, element).get('th:fragment') ===
    'enable_ads_aside(ads_data)',
  'configurable aside ad fragment'
);
const asideAdGuard = asideWidgetDocument.elements.filter(
  (element) => element.parentStart === asideAdFragment.start
);
if (asideAdGuard.length !== 1) {
  throw new Error(
    'templates/modules/widgets/asideWidget.html: aside ad fragment must have one direct master guard'
  );
}
requireContractAttribute(
  asideWidgetDocument,
  asideAdGuard[0],
  'th:if',
  `\${${adMasterGuard}}`,
  'configurable aside ads must bind enable_ads to the direct fragment child'
);
const layoutDocument = contractDocuments.get('templates/modules/layout.html');
const adsenseScript = requireUniqueContractElement(
  layoutDocument,
  (element) =>
    element.name === 'script' &&
    (contractAttributes(layoutDocument, element).get('th:src') ?? '').includes(
      'pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'
    ),
  'AdSense script'
);
requireContractAttribute(
  layoutDocument,
  contractParent(layoutDocument, adsenseScript),
  'th:if',
  '${#bools.isTrue(theme.config.ads.enable_ads)} and ${#bools.isTrue(theme.config.ads.enable_adsense)} and ${!#strings.isEmpty(theme.config.ads.adsense_client_id)}',
  'AdSense script parent must bind the master switch, local switch and client id'
);

const copyPolicies = new Map([
  ['templates/post.html', 'post'],
  ['templates/page.html', 'singlePage'],
  ['templates/page_leaving.html', 'singlePage'],
]);
for (const [path, entity] of copyPolicies) {
  const document = contractDocuments.get(path);
  const article = requireUniqueContractElement(
    document,
    (element) =>
      element.name === 'article' &&
      (contractAttributes(document, element).get('th:class') ?? '').includes('joe_detail__article'),
    'copy-controlled article element'
  );
  const classAppend = contractAttributes(document, article).get('th:classappend') ?? '';
  const expectedCopyBinding = `\${(#annotations.getOrDefault(${entity}, 'enable_copy', 'true') == 'false' or not #bools.isTrue(theme.config.post.enable_copy)) ? 'uncopy' : ''}`;
  if (
    normalizeContractAttribute(classAppend).split(normalizeContractAttribute(expectedCopyBinding))
      .length -
      1 !==
    1
  ) {
    throw new Error(
      `${path}: uncopy must bind the explicit annotation and normalized global switch to the article start tag`
    );
  }
}

const commentPolicies = new Map([
  ['templates/post.html', 'post'],
  ['templates/page.html', 'singlePage'],
  ['templates/page_leaving.html', 'singlePage'],
]);
for (const [path, entity] of commentPolicies) {
  const document = contractDocuments.get(path);
  const commentReplacement = requireUniqueContractElement(
    document,
    (element) =>
      (contractAttributes(document, element).get('th:replace') ?? '').includes(
        'modules/macro/comment :: comment'
      ),
    'comment component replacement'
  );
  const annotationGuard = contractParent(document, commentReplacement);
  requireContractAttribute(
    document,
    annotationGuard,
    'th:if',
    `\${#annotations.getOrDefault(${entity}, 'enable_comment', 'true') == 'true'}`,
    'comment component must bind the explicit content annotation'
  );
  const openComment = commentReplacement.ancestorStarts
    .map((start) => document.byStart.get(start))
    .find(
      (element) => element.name === 'div' && hasContractClass(document, element, 'joe_comment')
    );
  const openGuard = openComment == null ? null : contractParent(document, openComment);
  requireContractAttribute(
    document,
    openGuard,
    'th:if',
    '${not #bools.isTrue(theme.config.other.enable_clean_mode)} and ${#bools.isTrue(theme.config.post.enable_comment)}',
    'comment container must bind normalized clean-mode and global comment switches'
  );
  const closedComment = requireUniqueContractElement(
    document,
    (element) => {
      if (element.name !== 'div' || !hasContractClass(document, element, 'joe_comment'))
        return false;
      const parent = contractParent(document, element);
      return (
        normalizeContractAttribute(contractAttributes(document, parent).get('th:if')) ===
        normalizeContractAttribute(
          '${#bools.isTrue(theme.config.other.enable_clean_mode)} or ${not #bools.isTrue(theme.config.post.enable_comment)}'
        )
      );
    },
    'globally closed comment container'
  );
  if (closedComment == null) {
    throw new Error(`${path}: missing globally closed comment state`);
  }
}

const footerDocument = contractDocuments.get('templates/modules/common/footer.html');
const footerElement = requireUniqueContractElement(
  footerDocument,
  (element) => element.name === 'footer' && hasContractClass(footerDocument, element, 'joe_footer'),
  'shared footer root'
);
const validateFooterDocument = (document) => {
  const footer = requireUniqueContractElement(
    document,
    (element) => element.name === 'footer' && hasContractClass(document, element, 'joe_footer'),
    'shared footer root'
  );
  requireContractAttribute(
    document,
    footer,
    'th:if',
    '${#bools.isTrue(theme.config.footer.enable_footer)}',
    'shared footer root must bind the normalized global footer switch'
  );
};
validateFooterDocument(footerDocument);

const baiduPolicies = new Map([
  [
    'templates/post.html',
    "${#annotations.getOrDefault(post, 'enable_collect_check', 'true') == 'true'} and ${#bools.isTrue(theme.config.other.check_baidu_collect)}",
  ],
  [
    'templates/page.html',
    "${#annotations.getOrDefault(singlePage, 'enable_collect_check', 'true') == 'true'} and ${#bools.isTrue(theme.config.other.check_baidu_collect)}",
  ],
  [
    'templates/page_leaving.html',
    "${#annotations.getOrDefault(singlePage, 'enable_collect_check', 'true') == 'true'} and ${#bools.isTrue(theme.config.other.check_baidu_collect)}",
  ],
  ['templates/moment.html', '${#bools.isTrue(theme.config.other.check_baidu_collect)}'],
  ['templates/moments.html', '${#bools.isTrue(theme.config.other.check_baidu_collect)}'],
]);
for (const [path, expectedGuard] of baiduPolicies) {
  const document = contractDocuments.get(path);
  const entry = requireUniqueContractElement(
    document,
    (element) =>
      element.name === 'span' &&
      contractAttributes(document, element).get('id') === 'joe_baidu_record',
    'Baidu query/submit entry'
  );
  requireContractAttribute(
    document,
    contractParent(document, entry),
    'th:if',
    expectedGuard,
    'Baidu entry guard must bind the normalized global switch and content annotation where applicable'
  );
  const entryText = document.activeMarkup.slice(entry.contentStart, entry.contentEnd);
  if (
    !['百度', '查询', '提交'].every((term) => entryText.includes(term)) ||
    /正在检测|自动检测|自动推送/.test(entryText)
  ) {
    throw new Error(`${path}: Baidu entry must promise only manual query and submission`);
  }
}

const booleanThemeAssignments = new Map([
  ['enable_loading_bar', 'theme.config.theme.enable_loading_bar'],
  ['enable_footer', 'theme.config.footer.enable_footer'],
  ['check_baidu_collect', 'theme.config.other.check_baidu_collect'],
  ['enable_back2top', 'theme.config.theme.enable_back2top'],
  ['enable_back2top_smooth', 'theme.config.theme.enable_back2top_smooth'],
  ['enable_weather', 'theme.config.blogger.enable_weather'],
  ['enable_fixed_header', 'theme.config.navbar.enable_fixed_header'],
  ['enable_clean_mode', 'theme.config.other.enable_clean_mode'],
  ['enable_offscreen_tip', 'theme.config.theme.enable_offscreen_tip'],
  ['enable_birthday', 'theme.config.footer.enable_birthday'],
  ['enable_console_theme', 'theme.config.other.enable_console_theme'],
  ['enable_big_banner', 'theme.config.beauty.enable_big_banner'],
  ['enable_banner', 'theme.config.carousel.enable_banner'],
  ['enable_banner_loop', 'theme.config.carousel.enable_banner_loop'],
  ['enable_banner_handle', 'theme.config.carousel.enable_banner_handle'],
  ['enable_banner_autoplay', 'theme.config.carousel.enable_banner_autoplay'],
  ['enable_banner_switch_button', 'theme.config.carousel.enable_banner_switch_button'],
  ['enable_banner_pagination', 'theme.config.carousel.enable_banner_pagination'],
  ['enable_index_list_ajax', 'theme.config.home.enable_index_list_ajax'],
  ['enable_index_list_effect', 'theme.config.home.enable_index_list_effect'],
  ['show_loaded_time', 'theme.config.custom.show_loaded_time'],
  ['enable_debug', 'theme.config.other.enable_debug'],
  ['enable_copy', 'theme.config.post.enable_copy'],
  ['enable_share', 'theme.config.post.enable_share'],
  ['enable_share_link', 'theme.config.post.enable_share_link'],
  ['enable_share_weixin', 'theme.config.post.enable_share_weixin'],
  ['enable_like', 'theme.config.post.enable_like'],
  ['enable_toc', 'theme.config.post.enable_toc'],
  ['enable_progress_bar', 'theme.config.post.enable_progress_bar'],
  ['enable_code_expander', 'theme.config.code_block.enable_code_expander'],
  ['enable_fold_long_code', 'theme.config.code_block.enable_fold_long_code'],
  ['enable_comment', 'theme.config.post.enable_comment'],
  ['enable_code_title', 'theme.config.code_block.enable_code_title'],
  ['enable_code_hr', 'theme.config.code_block.enable_code_hr'],
  ['enable_code_macdot', 'theme.config.code_block.enable_code_macdot'],
  ['enable_code_line_number', 'theme.config.code_block.enable_code_line_number'],
  ['enable_code_newline', 'theme.config.code_block.enable_code_newline'],
  ['show_tools_when_hover', 'theme.config.code_block.show_tools_when_hover'],
  ['enable_code_copy', 'theme.config.code_block.enable_code_copy'],
  ['enable_copy_right_text', 'theme.config.post.enable_copy_right_text'],
  ['enable_journal_effect', 'theme.config.journals.enable_journal_effect'],
  ['enable_friend_effect', 'theme.config.friends.enable_friend_effect'],
  ['enable_like_journal', 'theme.config.journals.enable_like_journal'],
  ['enable_comment_journal', 'theme.config.journals.enable_comment_journal'],
]);
const themeConfigAssignmentExpressions = new Map();
for (const match of themeSettingVariable.matchAll(
  /^\s*([A-Za-z_$][\w$]*):\s*\/\*\[\[\$\{(.+)\}\]\]\*\//gm
)) {
  const [, property, expression] = match;
  if (themeConfigAssignmentExpressions.has(property)) {
    throw new Error(
      'templates/modules/themeSettingVariable.html: ThemeConfig properties must be unique'
    );
  }
  themeConfigAssignmentExpressions.set(property, expression);
}
const serializedBooleanAssignments = new Map(
  [...themeConfigAssignmentExpressions].filter(([, expression]) =>
    /^#bools\.isTrue\([^)]+\)$/.test(expression.trim())
  )
);
const validateNoBooleanThemeAliases = (assignments, label) => {
  for (const [property, expression] of assignments) {
    const configReferences = [
      ...expression.matchAll(/theme\.config\.([A-Za-z0-9_]+)\.([A-Za-z0-9_.]+)/g),
    ];
    const booleanReferences = [];
    for (const [, group, name] of configReferences) {
      const setting = getThemeSetting(group, name);
      const schemaStoresBoolean =
        setting?.$formkit === 'switch' ||
        (setting?.$formkit === 'radio' &&
          setting.options?.length > 0 &&
          setting.options.every((option) => typeof option.value === 'boolean'));
      if (schemaStoresBoolean) booleanReferences.push(`theme.config.${group}.${name}`);
    }
    const expectedBooleanPath = booleanThemeAssignments.get(property);
    if (
      expectedBooleanPath == null
        ? booleanReferences.length > 0
        : booleanReferences.length !== 1 ||
          booleanReferences[0] !== expectedBooleanPath ||
          expression.trim() !== `#bools.isTrue(${expectedBooleanPath})`
    ) {
      throw new Error(`${label}: ${property} must not alias Boolean schema field`);
    }
  }
};
validateNoBooleanThemeAliases(
  themeConfigAssignmentExpressions,
  'templates/modules/themeSettingVariable.html'
);
for (const [property, configPath] of booleanThemeAssignments) {
  const [, group, name] = /^theme\.config\.([^.]+)\.(.+)$/.exec(configPath) ?? [];
  const setting = getThemeSetting(group, name);
  const schemaStoresBoolean =
    setting?.$formkit === 'switch' ||
    (setting?.$formkit === 'radio' &&
      setting.options?.length > 0 &&
      setting.options.every((option) => typeof option.value === 'boolean'));
  if (
    !schemaStoresBoolean ||
    themeConfigAssignmentExpressions.get(property)?.trim() !== `#bools.isTrue(${configPath})`
  ) {
    throw new Error(
      `templates/modules/themeSettingVariable.html: ${property} must serialize Boolean schema field ${configPath} through #bools.isTrue`
    );
  }
}
if (
  serializedBooleanAssignments.size !== booleanThemeAssignments.size ||
  [...serializedBooleanAssignments].some(
    ([property, expression]) =>
      expression.trim() !== `#bools.isTrue(${booleanThemeAssignments.get(property)})`
  ) ||
  ['baidu_token', 'post_index_page_size', 'access_key'].some((property) =>
    themeConfigAssignmentExpressions.has(property)
  )
) {
  throw new Error(
    'templates/modules/themeSettingVariable.html: only real Boolean schema fields may use top-level #bools.isTrue serialization, and retired properties must not be exposed'
  );
}

const activeCommonScript = stripSlashComments(commonScript, true);
const activePostScript = stripSlashComments(postScript, true);
const activeCustomScript = stripSlashComments(customScript, true);
const isThisMethodCall = (node, method) =>
  node?.type === 'CallExpression' &&
  node.callee?.type === 'MemberExpression' &&
  node.callee.object?.type === 'ThisExpression' &&
  readEffectPropertyName(node.callee.property) === method;
const astContains = (node, predicate) => {
  let matched = false;
  walkEffectAst(node, (candidate) => {
    if (predicate(candidate)) matched = true;
  });
  return matched;
};
const astContainsReachable = (node, predicate) => {
  const visit = (candidate) => {
    if (candidate == null || typeof candidate !== 'object') return false;
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        if (visit(item)) return true;
        if (['ReturnStatement', 'ThrowStatement'].includes(item?.type)) break;
      }
      return false;
    }
    if (predicate(candidate)) return true;
    if (
      ['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration'].includes(
        candidate.type
      )
    ) {
      return false;
    }
    if (candidate.type === 'BlockStatement') return visit(candidate.body);
    if (candidate.type === 'IfStatement') {
      if (candidate.test?.type === 'Literal' && candidate.test.value === false) {
        return visit(candidate.alternate);
      }
      if (candidate.test?.type === 'Literal' && candidate.test.value === true) {
        return visit(candidate.consequent);
      }
      return visit(candidate.consequent) || visit(candidate.alternate);
    }
    if (
      candidate.type === 'LogicalExpression' &&
      ((candidate.operator === '&&' && candidate.left?.value === false) ||
        (candidate.operator === '||' && candidate.left?.value === true))
    ) {
      return visit(candidate.left);
    }
    for (const value of Object.values(candidate)) {
      if (visit(value)) return true;
    }
    return false;
  };
  return visit(node);
};
const isThisMember = (node, property) =>
  node?.type === 'MemberExpression' &&
  node.object?.type === 'ThisExpression' &&
  readEffectPropertyName(node.property) === property;
const isThisArticleClassCall = (node, method, className) =>
  node?.type === 'CallExpression' &&
  readEffectPropertyName(node.callee?.property) === method &&
  readEffectStaticString(node.arguments?.[0]) === className &&
  astContains(node.callee?.object, (candidate) => isThisMember(candidate, '$article'));
const validateReadLimitRuntime = (script, label) => {
  const ast = parseAst(script, { sourceType: 'script' }, label);
  const definitions = [];
  walkEffectAst(ast, (node) => {
    if (
      node.type === 'CallExpression' &&
      isEffectMember(node.callee, 'customElements', 'define') &&
      readEffectStaticString(node.arguments?.[0]) === 'joe-read-limited' &&
      node.arguments?.[1]?.type === 'ClassExpression'
    ) {
      definitions.push(node.arguments[1]);
    }
  });
  const definition = definitions.length === 1 ? definitions[0] : null;
  const methods = new Map(
    (definition?.body?.body ?? [])
      .filter((node) => node.type === 'MethodDefinition')
      .map((node) => [readEffectPropertyName(node.key), node.value?.body])
  );
  const initializeBody = methods.get('initialize');
  const claimBody = methods.get('claimOwnership');
  const waitBody = methods.get('waitForCommentHost');
  const hostRootBody = methods.get('getCommentHostRoot');
  const mountIdBody = methods.get('getCommentMountId');
  const mountReadyBody = methods.get('isCommentMountReady');
  const activatedWidgetBody = methods.get('isActivatedCommentWidgetReady');
  const activationBody = methods.get('waitForMountActivation');
  const readinessBody = methods.get('isCommentHostReady');
  const requestBody = methods.get('isCommentSubmissionRequest');
  const observerBody = methods.get('startCommentHostObserver');
  const checkBody = methods.get('commentWidgetPluginCheckComment');
  const intervalBody = methods.get('runIntervalTask');
  const cleanupBody = methods.get('cleanupRuntime');
  const disconnectedBody = methods.get('disconnectedCallback');
  const failOpenBody = methods.get('failOpen');
  const removeLimitedBody = methods.get('removeReadLimited');
  const lookupBody = methods.get('findFirstMyComment');
  const renderBody = methods.get('render');
  const selectors = [];
  walkEffectAst(waitBody, (node) => {
    if (
      node.type === 'CallExpression' &&
      isEffectMember(node.callee, 'document', 'querySelector')
    ) {
      const selector = readEffectStaticString(node.arguments?.[0]);
      if (selector != null) selectors.push(selector);
    }
  });
  const readinessReturn = readinessBody?.body?.find((node) => node.type === 'ReturnStatement');
  const readinessExpression = readinessReturn?.argument;
  const readinessChecksOpenShadow =
    astContains(
      hostRootBody,
      (node) =>
        node.type === 'MemberExpression' && readEffectPropertyName(node.property) === 'shadowRoot'
    ) &&
    astContains(
      hostRootBody,
      (node) =>
        node.type === 'CallExpression' &&
        readEffectPropertyName(node.callee?.property) === 'querySelector' &&
        readEffectStaticString(node.arguments?.[0]) === '#halo-comment'
    ) &&
    astContainsReachable(readinessExpression, (node) =>
      isThisMethodCall(node, 'getCommentHostRoot')
    );
  const commentWidgetRootSelectors = [];
  walkEffectAst(hostRootBody, (node) => {
    if (
      node.type === 'CallExpression' &&
      readEffectPropertyName(node.callee?.property) === 'querySelector'
    ) {
      const selector = readEffectStaticString(node.arguments?.[0]);
      if (selector?.includes('.comment-widget')) commentWidgetRootSelectors.push(node.arguments[0]);
    }
  });
  const readinessChecksDefinition = astContains(readinessExpression, (node) =>
    isEffectMember(node.callee, 'customElements', 'get')
  );
  const readinessChecksConnection = astContains(
    readinessExpression,
    (node) =>
      node.type === 'MemberExpression' && readEffectPropertyName(node.property) === 'isConnected'
  );
  const mountReadinessIsBound =
    astContains(mountIdBody, (node) => isThisMember(node, 'options')) &&
    astContains(mountIdBody, (node) => readEffectPropertyName(node.property) === 'commentKind') &&
    astContains(mountIdBody, (node) => readEffectPropertyName(node.property) === 'commentName') &&
    astContains(mountReadyBody, (node) => isThisMethodCall(node, 'getCommentMountId')) &&
    astContains(
      mountReadyBody,
      (node) =>
        node.type === 'CallExpression' &&
        readEffectPropertyName(node.callee?.property) === 'contains' &&
        astContains(node.callee?.object, (candidate) => isThisMember(candidate, '$comment'))
    ) &&
    astContains(
      mountReadyBody,
      (node) =>
        isEffectMember(node.callee, 'customElements', 'get') &&
        readEffectStaticString(node.arguments?.[0]) === 'comment-widget'
    ) &&
    astContains(readinessBody, (node) => isThisMethodCall(node, 'isCommentMountReady')) &&
    astContains(
      waitBody,
      (node) =>
        node.type === 'CallExpression' &&
        isEffectMember(node.callee, 'document', 'getElementById') &&
        astContains(node.arguments?.[0], (candidate) =>
          isThisMethodCall(candidate, 'getCommentMountId')
        )
    );
  const activationTimeoutBranches = [];
  walkEffectAst(activationBody, (node) => {
    if (
      node.type === 'IfStatement' &&
      astContains(
        node.test,
        (candidate) => candidate.type === 'Identifier' && candidate.name === 'deadline'
      ) &&
      astContainsReachable(node.consequent, (candidate) => isThisMethodCall(candidate, 'failOpen'))
    )
      activationTimeoutBranches.push(node);
  });
  const activationSuccessBranches = [];
  walkEffectAst(activationBody, (node) => {
    if (
      node.type === 'IfStatement' &&
      astContains(node.test, (candidate) =>
        isThisMethodCall(candidate, 'isActivatedCommentWidgetReady')
      ) &&
      astContainsReachable(node.consequent, (candidate) => candidate.type === 'ReturnStatement')
    )
      activationSuccessBranches.push(node);
  });
  const mountActivationIsBounded =
    astContains(activationBody, (node) => node.type === 'Literal' && node.value === 3000) &&
    astContains(
      activationBody,
      (node) =>
        node.type === 'CallExpression' &&
        node.callee?.name === 'setTimeout' &&
        node.arguments?.[1]?.value === 50
    ) &&
    astContains(
      activationBody,
      (node) =>
        node.type === 'CallExpression' &&
        readEffectPropertyName(node.callee?.property) === 'querySelector' &&
        readEffectStaticString(node.arguments?.[0]) === 'comment-widget'
    ) &&
    astContains(activatedWidgetBody, (node) => isThisMethodCall(node, 'getCommentHostRoot')) &&
    astContains(renderBody, (node) => isThisMethodCall(node, 'waitForMountActivation')) &&
    astContains(
      activationBody,
      (node) =>
        node.type === 'IfStatement' &&
        astContains(node.test, (candidate) => isThisMember(candidate, 'activationTimer')) &&
        astContainsReachable(node.consequent, (candidate) => candidate.type === 'ReturnStatement')
    ) &&
    astContains(
      cleanupBody,
      (node) =>
        node.type === 'CallExpression' &&
        node.callee?.name === 'clearTimeout' &&
        astContains(node.arguments?.[0], (candidate) => isThisMember(candidate, 'activationTimer'))
    ) &&
    activationTimeoutBranches.length === 1 &&
    activationSuccessBranches.length === 1;
  const waitIsBounded =
    astContains(waitBody, (node) => node.type === 'Literal' && node.value === 2500) &&
    astContains(
      waitBody,
      (node) =>
        node.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        node.callee.name === 'setTimeout' &&
        node.arguments?.[1]?.type === 'Literal' &&
        node.arguments[1].value === 50
    ) &&
    astContains(
      waitBody,
      (node) =>
        node.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        node.callee.name === 'resolve' &&
        node.arguments?.[0]?.type === 'Literal' &&
        node.arguments[0].value == null
    );
  const initializeGuards = (initializeBody?.body ?? []).filter(
    (node) =>
      node.type === 'IfStatement' &&
      astContains(node.test, (candidate) => isThisMethodCall(candidate, 'isCommentHostReady')) &&
      astContainsReachable(node.consequent, (candidate) =>
        isThisMethodCall(candidate, 'failOpen')
      ) &&
      astContainsReachable(node.consequent, (candidate) => candidate.type === 'ReturnStatement')
  );
  const ownershipGuard = (initializeBody?.body ?? []).find(
    (node) =>
      node.type === 'IfStatement' &&
      node.test?.type === 'UnaryExpression' &&
      isThisMethodCall(node.test.argument, 'claimOwnership') &&
      astContainsReachable(node.consequent, (candidate) =>
        isThisMethodCall(candidate, 'failOpen')
      ) &&
      astContainsReachable(node.consequent, (candidate) => candidate.type === 'ReturnStatement')
  );
  const ownershipClaimIsExclusive =
    astContainsReachable(claimBody, (node) =>
      isEffectMember(node, 'window', '__joeReadLimitedOwner')
    ) &&
    astContainsReachable(
      claimBody,
      (node) =>
        node.type === 'AssignmentExpression' &&
        isEffectMember(node.left, 'window', '__joeReadLimitedOwner') &&
        node.right?.type === 'ThisExpression'
    ) &&
    astContainsReachable(
      claimBody,
      (node) =>
        node.type === 'AssignmentExpression' &&
        isThisMember(node.left, 'ownsRuntime') &&
        node.right?.value === true
    );
  const renderGate = (initializeBody?.body ?? []).find(
    (node) =>
      node.type === 'IfStatement' &&
      node.test?.type === 'UnaryExpression' &&
      node.test.operator === '!' &&
      isThisMethodCall(node.test.argument, 'render') &&
      astContainsReachable(node.consequent, (candidate) => candidate.type === 'ReturnStatement')
  );
  const addLimitedCalls = [];
  walkEffectAst(initializeBody, (node) => {
    if (isThisArticleClassCall(node, 'add', 'limited')) addLimitedCalls.push(node);
  });
  const addLimited = addLimitedCalls.length === 1 ? addLimitedCalls[0] : null;
  const observerStart = [];
  walkEffectAst(initializeBody, (node) => {
    if (isThisMethodCall(node, 'startCommentHostObserver')) observerStart.push(node);
  });
  const usernameBranch = (initializeBody?.body ?? []).find(
    (node) =>
      node.type === 'IfStatement' &&
      astContains(
        node.test,
        (candidate) => candidate.type === 'Literal' && candidate.value === 'anonymousUser'
      ) &&
      astContains(node.consequent, (candidate) =>
        isThisMethodCall(candidate, 'commentWidgetPluginCheckComment')
      )
  );
  const renderFailureBranch = (renderBody?.body ?? []).find(
    (node) =>
      node.type === 'IfStatement' &&
      astContains(node.test, (candidate) => isThisMember(candidate, '$commentHost')) &&
      astContainsReachable(node.consequent, (candidate) =>
        isThisMethodCall(candidate, 'failOpen')
      ) &&
      astContainsReachable(
        node.consequent,
        (candidate) =>
          candidate.type === 'ReturnStatement' &&
          candidate.argument?.type === 'Literal' &&
          candidate.argument.value === false
      )
  );
  const renderReturnsTrue = astContainsReachable(
    renderBody,
    (node) =>
      node.type === 'ReturnStatement' &&
      node.argument?.type === 'Literal' &&
      node.argument.value === true
  );
  const failOpenRemovesClass = astContains(
    failOpenBody,
    (node) =>
      node.type === 'CallExpression' &&
      readEffectPropertyName(node.callee?.property) === 'remove' &&
      readEffectStaticString(node.arguments?.[0]) === 'limited' &&
      astContains(
        node.callee?.object,
        (candidate) =>
          candidate.type === 'MemberExpression' &&
          candidate.object?.type === 'ThisExpression' &&
          readEffectPropertyName(candidate.property) === '$article'
      )
  );
  const failOpenRemovesCta = astContains(failOpenBody, (node) => isThisMethodCall(node, 'remove'));
  const cleanupCalls = (body, method) =>
    astContainsReachable(body, (node) => isThisMethodCall(node, method));
  const cleanupClearsResources =
    astContainsReachable(
      cleanupBody,
      (node) => node.type === 'CallExpression' && node.callee?.name === 'clearTimeout'
    ) &&
    astContainsReachable(
      cleanupBody,
      (node) => node.type === 'CallExpression' && node.callee?.name === 'clearInterval'
    ) &&
    astContainsReachable(
      cleanupBody,
      (node) => readEffectPropertyName(node.callee?.property) === 'disconnect'
    ) &&
    astContainsReachable(
      cleanupBody,
      (node) => node.type === 'AssignmentExpression' && isEffectMember(node.left, 'window', 'fetch')
    );
  const cleanupOwnerGuard = cleanupBody?.body?.[0];
  const cleanupOnlyForOwner =
    cleanupOwnerGuard?.type === 'IfStatement' &&
    astContains(cleanupOwnerGuard.test, (node) => isThisMember(node, 'ownsRuntime')) &&
    astContainsReachable(cleanupOwnerGuard.consequent, (node) => node.type === 'ReturnStatement');
  const ownerReleaseGuard = (cleanupBody?.body ?? []).find(
    (node) =>
      node.type === 'IfStatement' &&
      astContains(node.test, (candidate) =>
        isEffectMember(candidate, 'window', '__joeReadLimitedOwner')
      ) &&
      astContains(node.test, (candidate) => candidate.type === 'ThisExpression') &&
      astContainsReachable(
        node.consequent,
        (candidate) => candidate.type === 'UnaryExpression' && candidate.operator === 'delete'
      )
  );
  const failOpenOwnerGuard = (failOpenBody?.body ?? []).find(
    (node) =>
      node.type === 'IfStatement' &&
      astContains(
        node.test,
        (candidate) => candidate.type === 'Identifier' && candidate.name === 'ownsRuntime'
      ) &&
      astContainsReachable(node.consequent, (candidate) =>
        isThisArticleClassCall(candidate, 'remove', 'limited')
      )
  );
  const disconnectedCleansOwner =
    astContains(disconnectedBody, (node) => isThisMethodCall(node, 'cleanupRuntime')) &&
    astContains(
      disconnectedBody,
      (node) =>
        node.type === 'CallExpression' &&
        readEffectPropertyName(node.callee?.property) === 'remove' &&
        readEffectStaticString(node.arguments?.[0]) === 'limited'
    ) &&
    astContains(disconnectedBody, (node) => isThisMember(node, 'ownsRuntime'));
  const failOpenRemovalIsGuarded =
    astContains(failOpenBody, (node) => isThisMember(node, 'isRemoving')) &&
    astContainsReachable(failOpenBody, (node) => node.type === 'TryStatement') &&
    astContainsReachable(
      failOpenBody,
      (node) => node.type === 'AssignmentExpression' && isThisMember(node.left, 'isRemoving')
    );
  const requestSupportsString = astContains(
    requestBody,
    (node) => node.type === 'Literal' && node.value === 'string'
  );
  const requestSupportsUrl = astContains(
    requestBody,
    (node) =>
      node.type === 'BinaryExpression' &&
      node.operator === 'instanceof' &&
      node.right?.name === 'URL'
  );
  const requestSupportsRequest = astContains(
    requestBody,
    (node) =>
      node.type === 'BinaryExpression' &&
      node.operator === 'instanceof' &&
      node.right?.name === 'Request'
  );
  const nullResultBranches = [];
  walkEffectAst(intervalBody, (node) => {
    if (
      node.type === 'IfStatement' &&
      astContains(
        node.test,
        (candidate) => candidate.type === 'Identifier' && candidate.name === 'isFinduserComment'
      ) &&
      astContains(node.test, (candidate) => candidate.type === 'Literal' && candidate.value == null)
    ) {
      nullResultBranches.push(node);
    }
  });
  const nullResultBranch = nullResultBranches.length === 1 ? nullResultBranches[0] : null;
  const lookupCatchReturnsNull = astContains(
    lookupBody,
    (node) =>
      node.type === 'CallExpression' &&
      readEffectPropertyName(node.callee?.property) === 'catch' &&
      astContains(
        node.arguments,
        (candidate) =>
          candidate.type === 'CallExpression' &&
          candidate.callee?.type === 'Identifier' &&
          candidate.callee.name === 'onCallback' &&
          candidate.arguments?.[0]?.type === 'Literal' &&
          candidate.arguments[0].value == null
      )
  );
  const unavailableLookupReturnsNull = astContains(
    lookupBody,
    (node) =>
      node.type === 'IfStatement' &&
      astContains(
        node.test,
        (candidate) =>
          candidate.type === 'MemberExpression' &&
          readEffectPropertyName(candidate.property) === 'ajax'
      ) &&
      astContains(
        node.consequent,
        (candidate) =>
          candidate.type === 'CallExpression' &&
          candidate.callee?.type === 'Identifier' &&
          candidate.callee.name === 'onCallback' &&
          candidate.arguments?.[0]?.type === 'Literal' &&
          candidate.arguments[0].value == null
      )
  );
  const invalidResponseReturnsNull = astContains(
    lookupBody,
    (node) =>
      node.type === 'IfStatement' &&
      astContains(node.test, (candidate) => isEffectMember(candidate.callee, 'Array', 'isArray')) &&
      astContains(
        node.consequent,
        (candidate) =>
          candidate.type === 'CallExpression' &&
          candidate.callee?.type === 'Identifier' &&
          candidate.callee.name === 'onCallback' &&
          candidate.arguments?.[0]?.type === 'Literal' &&
          candidate.arguments[0].value == null
      )
  );
  const renderGuardFailsOpen = astContains(
    renderBody,
    (node) =>
      node.type === 'IfStatement' &&
      astContains(
        node.test,
        (candidate) =>
          candidate.type === 'MemberExpression' &&
          candidate.object?.type === 'ThisExpression' &&
          ['$commentHost', '$header'].includes(readEffectPropertyName(candidate.property))
      ) &&
      astContains(node.consequent, (candidate) => isThisMethodCall(candidate, 'failOpen'))
  );
  const runCheckCall = [];
  const fetchWrapperAssignments = [];
  const fetchInstallAssignments = [];
  walkEffectAst(checkBody, (node) => {
    if (isThisMethodCall(node, 'runIntervalTask')) runCheckCall.push(node);
    if (node.type === 'AssignmentExpression' && isThisMember(node.left, 'fetchWrapper')) {
      fetchWrapperAssignments.push(node);
    }
    if (
      node.type === 'AssignmentExpression' &&
      isEffectMember(node.left, 'window', 'fetch') &&
      isThisMember(node.right, 'fetchWrapper')
    )
      fetchInstallAssignments.push(node);
  });
  const fetchRestoreGuards = [];
  walkEffectAst(cleanupBody, (node) => {
    if (
      node.type === 'IfStatement' &&
      astContains(
        node.test,
        (candidate) =>
          candidate.type === 'BinaryExpression' &&
          candidate.operator === '===' &&
          astContains(candidate.left, (part) => isEffectMember(part, 'window', 'fetch')) &&
          astContains(candidate.right, (part) => isThisMember(part, 'fetchWrapper'))
      ) &&
      astContainsReachable(
        node.consequent,
        (candidate) =>
          candidate.type === 'AssignmentExpression' &&
          isEffectMember(candidate.left, 'window', 'fetch') &&
          isThisMember(candidate.right, 'originalFetch')
      )
    )
      fetchRestoreGuards.push(node);
  });
  const initialRunCheck = (checkBody?.body ?? []).find(
    (node) =>
      node.type === 'ExpressionStatement' && isThisMethodCall(node.expression, 'runIntervalTask')
  )?.expression;
  const postCheckGuard = (checkBody?.body ?? []).find(
    (node) => node.type === 'IfStatement' && node.consequent?.type === 'ReturnStatement'
  );
  const postCheckConditions = flattenEffectOr(postCheckGuard?.test);
  const postCheckContainsCall = postCheckConditions[1]?.argument?.expression;
  const postCheckIsComplete =
    postCheckConditions.length === 3 &&
    postCheckConditions.every((condition) => condition?.type === 'UnaryExpression') &&
    readEffectPropertyName(postCheckConditions[0]?.argument?.property) === 'isConnected' &&
    postCheckContainsCall?.type === 'CallExpression' &&
    readEffectPropertyName(postCheckContainsCall.callee?.property) === 'contains' &&
    readEffectStaticString(postCheckContainsCall.arguments?.[0]) === 'limited' &&
    readEffectPropertyName(postCheckConditions[2]?.argument?.callee?.property) ===
      'isCommentHostReady';
  const fetchWrapper = fetchWrapperAssignments[0]?.right;
  const wrapperBody = fetchWrapper?.type === 'ArrowFunctionExpression' ? fetchWrapper.body : null;
  const requestClassificationTry = (wrapperBody?.body ?? []).find(
    (node) =>
      node.type === 'TryStatement' &&
      astContainsReachable(node.block, (candidate) =>
        isThisMethodCall(candidate, 'isCommentSubmissionRequest')
      ) &&
      astContainsReachable(node.handler?.body, (candidate) =>
        isThisMethodCall(candidate, 'failOpen')
      ) &&
      astContainsReachable(node.handler?.body, (candidate) => candidate.type === 'ThrowStatement')
  );
  const syncCatch = (wrapperBody?.body ?? [])
    .filter((node) => node.type === 'TryStatement')
    .map((node) => node.handler)
    .find(
      (handler) =>
        astContainsReachable(handler?.body, (node) => isThisMethodCall(node, 'failOpen')) &&
        astContainsReachable(handler?.body, (node) => node.type === 'ThrowStatement')
    );
  const wrapperIfStatements = [];
  walkEffectAst(wrapperBody, (node) => {
    if (node.type === 'IfStatement') wrapperIfStatements.push(node);
  });
  const unrelatedFetchReturn = wrapperIfStatements.find(
    (node) =>
      node.type === 'IfStatement' &&
      node.test?.type === 'UnaryExpression' &&
      node.test.operator === '!' &&
      node.test.argument?.type === 'Identifier' &&
      node.test.argument.name === 'isCommentSubmission' &&
      astContainsReachable(
        node.consequent,
        (candidate) => candidate.type === 'ReturnStatement' && candidate.argument?.name === 'pro'
      )
  );
  const nonPromiseGuard = wrapperIfStatements.find(
    (node) =>
      node.type === 'IfStatement' &&
      astContains(
        node.test,
        (candidate) =>
          candidate.type === 'MemberExpression' &&
          readEffectPropertyName(candidate.property) === 'then'
      ) &&
      astContainsReachable(node.consequent, (candidate) =>
        isThisMethodCall(candidate, 'failOpen')
      ) &&
      astContainsReachable(
        node.consequent,
        (candidate) => candidate.type === 'ReturnStatement' && candidate.argument?.name === 'pro'
      )
  );
  const promiseThen = [];
  walkEffectAst(wrapperBody, (node) => {
    if (
      node.type === 'CallExpression' &&
      node.callee?.object?.type === 'Identifier' &&
      node.callee.object.name === 'pro' &&
      readEffectPropertyName(node.callee.property) === 'then'
    )
      promiseThen.push(node);
  });
  const fulfilledCallback = promiseThen[0]?.arguments?.[0];
  const rejectedCallback = promiseThen[0]?.arguments?.[1];
  const fulfilledIfStatements = [];
  walkEffectAst(fulfilledCallback?.body, (node) => {
    if (node.type === 'IfStatement') fulfilledIfStatements.push(node);
  });
  const invalidResponseBranch = fulfilledIfStatements.find(
    (node) =>
      node.type === 'IfStatement' &&
      astContains(
        node.test,
        (candidate) =>
          candidate.type === 'MemberExpression' &&
          readEffectPropertyName(candidate.property) === 'ok'
      ) &&
      astContainsReachable(node.consequent, (candidate) => isThisMethodCall(candidate, 'failOpen'))
  );
  const wrapperTryStatements = (wrapperBody?.body ?? []).filter(
    (node) => node.type === 'TryStatement'
  );
  const promiseAccessInsideTry = wrapperTryStatements.some(
    (node) =>
      nonPromiseGuard != null &&
      promiseThen[0] != null &&
      node.block.start <= nonPromiseGuard.start &&
      promiseThen[0].end <= node.block.end
  );
  const responseOkInsideTry = astContains(
    fulfilledCallback?.body,
    (node) =>
      node.type === 'TryStatement' &&
      astContainsReachable(
        node.block,
        (candidate) =>
          candidate.type === 'MemberExpression' &&
          readEffectPropertyName(candidate.property) === 'ok'
      ) &&
      astContainsReachable(node.handler?.body, (candidate) =>
        isThisMethodCall(candidate, 'failOpen')
      ) &&
      astContainsReachable(node.handler?.body, (candidate) => candidate.type === 'ThrowStatement')
  );
  const nullResultFailsOpen = astContainsReachable(nullResultBranch?.consequent, (candidate) =>
    isThisMethodCall(candidate, 'failOpen')
  );
  const rejectedPromiseFailsOpen =
    astContainsReachable(rejectedCallback?.body, (node) => isThisMethodCall(node, 'failOpen')) &&
    astContainsReachable(rejectedCallback?.body, (node) => node.type === 'ThrowStatement');
  const successfulCommentExpands = astContainsReachable(fulfilledCallback?.body, (node) =>
    isThisMethodCall(node, 'removeReadLimited')
  );
  const observerCreations = [];
  walkEffectAst(observerBody, (node) => {
    if (
      node.type === 'NewExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 'MutationObserver'
    )
      observerCreations.push(node);
  });
  const observerCallback = observerCreations[0]?.arguments?.[0];
  const observerFailsOpen = astContainsReachable(observerCallback?.body, (node) =>
    isThisMethodCall(node, 'failOpen')
  );
  const observerStarts = astContainsReachable(
    observerBody,
    (node) => readEffectPropertyName(node.callee?.property) === 'observe'
  );
  const usesShadowInternalId = astContains(
    definition,
    (node) =>
      node.type === 'CallExpression' &&
      readEffectPropertyName(node.callee?.property) === 'getElementById' &&
      astContains(
        node.callee?.object,
        (candidate) => readEffectPropertyName(candidate.property) === 'shadowRoot'
      )
  );
  const failures = [
    [definitions.length === 1, 'definition'],
    [methods.size >= 14, 'methods'],
    [
      selectors.filter((selector) => selector === '.joe_comment halo-comment').length === 1,
      'halo-host',
    ],
    [
      selectors.filter((selector) => selector === '.joe_comment comment-widget').length === 1,
      'compat-host',
    ],
    [readinessChecksOpenShadow, 'open-shadow'],
    [commentWidgetRootSelectors.length === 1, 'real-comment-widget-root'],
    [readinessChecksDefinition, 'defined-host'],
    [readinessChecksConnection, 'connected-host'],
    [mountReadinessIsBound, 'bound-mount'],
    [mountActivationIsBounded, 'mount-activation'],
    [waitIsBounded, 'bounded-readiness'],
    [ownershipGuard != null && ownershipClaimIsExclusive, 'runtime-ownership'],
    [disconnectedCleansOwner, 'disconnect-cleanup'],
    [failOpenRemovalIsGuarded, 'guarded-removal'],
    [initializeGuards.length >= 2, 'readiness-guards'],
    [renderGate != null, 'render-gate'],
    [renderFailureBranch != null && renderReturnsTrue, 'render-result'],
    [addLimitedCalls.length === 1, 'progressive-class'],
    [
      renderGate != null &&
        initializeGuards.length >= 2 &&
        addLimited != null &&
        renderGate.end < initializeGuards.at(-1).start &&
        initializeGuards.at(-1).end < addLimited.start,
      'guard-order',
    ],
    [
      observerStart.length === 1 &&
        addLimited != null &&
        usernameBranch != null &&
        addLimited.end < observerStart[0].start &&
        observerStart[0].end < usernameBranch.start,
      'observer-order',
    ],
    [observerCreations.length === 1 && observerFailsOpen && observerStarts, 'host-observer'],
    [initialRunCheck != null && postCheckGuard != null && postCheckIsComplete, 'post-check'],
    [
      initialRunCheck != null &&
        postCheckGuard != null &&
        fetchWrapperAssignments.length === 1 &&
        initialRunCheck.end < postCheckGuard.start &&
        postCheckGuard.end < fetchWrapperAssignments[0].start,
      'post-check-order',
    ],
    [syncCatch != null, 'fetch-sync-throw'],
    [requestClassificationTry != null, 'request-classification-throw'],
    [unrelatedFetchReturn != null, 'unrelated-fetch'],
    [nonPromiseGuard != null, 'non-promise'],
    [fetchInstallAssignments.length === 1, 'fetch-install'],
    [fetchRestoreGuards.length === 1, 'fetch-restore'],
    [promiseAccessInsideTry, 'promise-access'],
    [responseOkInsideTry, 'response-ok-access'],
    [promiseThen.length === 1 && promiseThen[0].arguments?.length === 2, 'promise-shape'],
    [invalidResponseBranch != null, 'invalid-response-fetch'],
    [rejectedPromiseFailsOpen, 'promise-reject'],
    [failOpenRemovesClass, 'fail-open-class'],
    [failOpenRemovesCta, 'fail-open-cta'],
    [cleanupCalls(failOpenBody, 'cleanupRuntime'), 'fail-open-cleanup'],
    [cleanupCalls(removeLimitedBody, 'cleanupRuntime'), 'expand-cleanup'],
    [cleanupClearsResources, 'resource-cleanup'],
    [
      cleanupOnlyForOwner && ownerReleaseGuard != null && failOpenOwnerGuard != null,
      'owner-cleanup',
    ],
    [requestSupportsString && requestSupportsUrl && requestSupportsRequest, 'request-inputs'],
    [nullResultFailsOpen, 'null-result'],
    [lookupCatchReturnsNull, 'lookup-catch'],
    [unavailableLookupReturnsNull, 'lookup-unavailable'],
    [invalidResponseReturnsNull, 'invalid-response'],
    [renderGuardFailsOpen, 'render-guard'],
    [successfulCommentExpands, 'comment-success'],
    [!usesShadowInternalId, 'shadow-internal-id'],
  ].filter(([passed]) => !passed);
  if (failures.length > 0) {
    throw new Error(
      `${label}: comment-expand runtime must progressively enhance from the real Halo host and fail open on unavailable or exceptional checks (${failures.map(([, name]) => name).join(', ')})`
    );
  }
  return {
    definition,
    disconnectedBody,
    fetchWrapperAssignment: fetchWrapperAssignments[0],
    fetchInstallAssignment: fetchInstallAssignments[0],
    fetchRestoreGuard: fetchRestoreGuards[0],
    requestClassificationTry,
    hostRootBody,
    commentWidgetRootSelector: commentWidgetRootSelectors[0],
    mountIdBody,
    mountReadyBody,
    activationTimeoutBranch: activationTimeoutBranches[0],
    initializeBody,
    observerCallback,
    nullResultBranch,
    postCheckGuard,
    ownershipGuard,
    rejectedCallback,
    renderGate,
    readinessReturn,
  };
};
const readLimitRuntimeContract = validateReadLimitRuntime(customScript, customScriptPath);
if (
  !['百度收录', '查询', '提交'].every((term) => activeCommonScript.includes(term)) ||
  !activePostScript.includes('CC BY-NC-SA 4.0 版权协议') ||
  activePostScript.includes('CC 4.0 BY-SA 版权协议') ||
  !['目录', '评论', '展开'].every((term) => activePostScript.includes(term)) ||
  !['客户端视觉折叠', '客户端视觉效果', '不适合私密或付费内容'].every((term) =>
    activeCustomScript.includes(term)
  ) ||
  activeCustomScript.includes('不适合私密或付费内容，Waline') ||
  /登陆|评论后可见/.test(`${activePostScript}\n${activeCustomScript}`)
) {
  throw new Error(
    'runtime contract: Baidu, copyright and comment-expand behavior must remain honest and fail open when the real comment component is absent'
  );
}

const expectContractMutationRejected = (label, expectedFailure, validateMutation) => {
  let rejected = false;
  try {
    validateMutation();
  } catch (error) {
    rejected = error instanceof Error && error.message.includes(expectedFailure);
  }
  if (!rejected) {
    throw new Error(`contract mutation survived: ${label}`);
  }
};
const replaceAstRange = (source, node, replacement) => {
  return source.slice(0, node.start) + replacement + source.slice(node.end);
};
const booleanAliasMutationAssignments = new Map(themeConfigAssignmentExpressions);
booleanAliasMutationAssignments.set(
  'post_index_page_size',
  'theme.config.home.enable_index_list_ajax'
);
expectContractMutationRejected(
  'non-Boolean ThemeConfig property aliases a Boolean schema field',
  'post_index_page_size must not alias Boolean schema field',
  () =>
    validateNoBooleanThemeAliases(
      booleanAliasMutationAssignments,
      'templates/modules/themeSettingVariable.html mutation'
    )
);
const customRuntimeMutationAst = parseAst(
  customScript,
  { sourceType: 'script' },
  `${customScriptPath} fail-open mutation`
);
const nullResultFailOpenCalls = [];
walkEffectAst(customRuntimeMutationAst, (node) => {
  if (
    node.type === 'IfStatement' &&
    astContains(
      node.test,
      (candidate) => candidate.type === 'Identifier' && candidate.name === 'isFinduserComment'
    ) &&
    astContains(node.test, (candidate) => candidate.type === 'Literal' && candidate.value == null)
  ) {
    walkEffectAst(node.consequent, (candidate) => {
      if (isThisMethodCall(candidate, 'failOpen')) nullResultFailOpenCalls.push(candidate);
    });
  }
});
if (nullResultFailOpenCalls.length !== 1) {
  throw new Error(`${customScriptPath}: expected one null-result fail-open mutation target`);
}
const nullResultFailOpenCall = nullResultFailOpenCalls[0];
const customRuntimeMutationSource = `${replaceAstRange(
  customScript,
  nullResultFailOpenCall,
  'this.remove()'
)}\nconst joeReadLimitedDeadText = "this.failOpen();";\n`;
expectContractMutationRejected(
  'comment-expand null-result fail-open replaced while original text survives in a dead string',
  'comment-expand runtime must progressively enhance',
  () => validateReadLimitRuntime(customRuntimeMutationSource, `${customScriptPath} mutation`)
);
const renderGateMutationSource = `${replaceAstRange(
  customScript,
  readLimitRuntimeContract.renderGate,
  'this.render();'
)}\nconst joeReadLimitedRenderGateDeadText = "if (!this.render()) return;";\n`;
expectContractMutationRejected(
  'comment-expand continues to add limited after render reports failure',
  'comment-expand runtime must progressively enhance',
  () => validateReadLimitRuntime(renderGateMutationSource, `${customScriptPath} render mutation`)
);
const ownershipMutationSource = `${replaceAstRange(
  customScript,
  readLimitRuntimeContract.ownershipGuard,
  'this.claimOwnership();'
)}\nconst joeReadLimitedOwnershipDeadText = "if (!this.claimOwnership()) { this.failOpen(); return; }";\n`;
expectContractMutationRejected(
  'comment-expand second instance continues without exclusive ownership',
  'comment-expand runtime must progressively enhance',
  () => validateReadLimitRuntime(ownershipMutationSource, `${customScriptPath} ownership mutation`)
);
const disconnectedCleanupCalls = [];
walkEffectAst(readLimitRuntimeContract.disconnectedBody, (node) => {
  if (isThisMethodCall(node, 'cleanupRuntime')) disconnectedCleanupCalls.push(node);
});
if (disconnectedCleanupCalls.length !== 1) {
  throw new Error(`${customScriptPath}: expected one disconnect cleanup mutation target`);
}
const disconnectedMutationSource = `${replaceAstRange(
  customScript,
  disconnectedCleanupCalls[0],
  'this.remove()'
)}\nconst joeReadLimitedDisconnectDeadText = "this.cleanupRuntime();";\n`;
expectContractMutationRejected(
  'comment-expand disconnect leaves owner runtime installed',
  'comment-expand runtime must progressively enhance',
  () =>
    validateReadLimitRuntime(disconnectedMutationSource, `${customScriptPath} disconnect mutation`)
);
const postCheckMutationSource = `${replaceAstRange(
  customScript,
  readLimitRuntimeContract.postCheckGuard,
  'this.failOpen();'
)}\nconst joeReadLimitedPostCheckDeadText = "if (removed) return;";\n`;
expectContractMutationRejected(
  'comment-expand installs the fetch wrapper after a synchronous fail-open',
  'comment-expand runtime must progressively enhance',
  () => validateReadLimitRuntime(postCheckMutationSource, `${customScriptPath} post-check mutation`)
);
const classificationFailOpenCalls = [];
walkEffectAst(readLimitRuntimeContract.requestClassificationTry?.handler?.body, (node) => {
  if (isThisMethodCall(node, 'failOpen')) classificationFailOpenCalls.push(node);
});
if (classificationFailOpenCalls.length !== 1) {
  throw new Error(
    `${customScriptPath}: expected one request-classification fail-open mutation target`
  );
}
const classificationMutationSource = `${replaceAstRange(
  customScript,
  classificationFailOpenCalls[0],
  'false && this.failOpen()'
)}\nconst joeReadLimitedClassificationDeadText = "this.failOpen();";\n`;
expectContractMutationRejected(
  'comment-expand request-classification fail-open survives only behind false-and dead control',
  'comment-expand runtime must progressively enhance',
  () =>
    validateReadLimitRuntime(
      classificationMutationSource,
      `${customScriptPath} classification mutation`
    )
);
const rejectedFailOpenCalls = [];
walkEffectAst(readLimitRuntimeContract.rejectedCallback?.body, (node) => {
  if (isThisMethodCall(node, 'failOpen')) rejectedFailOpenCalls.push(node);
});
if (rejectedFailOpenCalls.length !== 1) {
  throw new Error(`${customScriptPath}: expected one Promise-rejection fail-open mutation target`);
}
const rejectedPromiseMutationSource = `${replaceAstRange(
  customScript,
  rejectedFailOpenCalls[0],
  '(() => { return; this.failOpen(); })()'
)}\nconst joeReadLimitedPromiseRejectDeadText = "this.failOpen();";\n`;
expectContractMutationRejected(
  'comment-expand Promise rejection keeps fail-open only after an unreachable return',
  'comment-expand runtime must progressively enhance',
  () =>
    validateReadLimitRuntime(
      rejectedPromiseMutationSource,
      `${customScriptPath} Promise rejection mutation`
    )
);
const readinessShadowMembers = [];
walkEffectAst(readLimitRuntimeContract.hostRootBody, (node) => {
  if (node.type === 'Literal' && node.value === '#halo-comment') {
    readinessShadowMembers.push(node);
  }
});
if (readinessShadowMembers.length !== 1) {
  throw new Error(`${customScriptPath}: expected one open-shadow readiness mutation target`);
}
const virtualHostMutationSource = `${replaceAstRange(
  customScript,
  readinessShadowMembers[0],
  "'#missing-halo-comment'"
)}\nconst joeReadLimitedVirtualHostDeadText = "host.shadowRoot";\n`;
expectContractMutationRejected(
  'comment-expand accepts a defined but unready virtual host without an open shadow root',
  'comment-expand runtime must progressively enhance',
  () => validateReadLimitRuntime(virtualHostMutationSource, `${customScriptPath} host mutation`)
);
const realCommentWidgetRootMutationSource = `${replaceAstRange(
  customScript,
  readLimitRuntimeContract.commentWidgetRootSelector,
  "'#comment-widget, [data-comment-widget-root]'"
)}\nconst joeReadLimitedRealWidgetRootDeadText = ".comment-widget";\n`;
expectContractMutationRejected(
  'comment-expand activation ignores PluginCommentWidget 3.2.2 real shadow root',
  'comment-expand runtime must progressively enhance',
  () =>
    validateReadLimitRuntime(
      realCommentWidgetRootMutationSource,
      `${customScriptPath} real widget root mutation`
    )
);
const mountCommentNameReferences = [];
walkEffectAst(readLimitRuntimeContract.mountIdBody, (node) => {
  if (node.type === 'MemberExpression' && readEffectPropertyName(node.property) === 'commentName') {
    mountCommentNameReferences.push(node);
  }
});
if (mountCommentNameReferences.length !== 1) {
  throw new Error(`${customScriptPath}: expected one mount comment-name mutation target`);
}
const mountOptionsMutationSource = `${replaceAstRange(
  customScript,
  mountCommentNameReferences[0],
  'this.options.username'
)}\nconst joeReadLimitedMountOptionsDeadText = "this.options.commentName";\n`;
expectContractMutationRejected(
  'comment-expand accepts an empty mount not bound to the current comment name',
  'comment-expand runtime must progressively enhance',
  () => validateReadLimitRuntime(mountOptionsMutationSource, `${customScriptPath} mount mutation`)
);
const mountDefinitionLiterals = [];
walkEffectAst(readLimitRuntimeContract.mountReadyBody, (node) => {
  if (node.type === 'Literal' && node.value === 'comment-widget')
    mountDefinitionLiterals.push(node);
});
if (mountDefinitionLiterals.length !== 1) {
  throw new Error(`${customScriptPath}: expected one mount definition mutation target`);
}
const mountDefinitionMutationSource = `${replaceAstRange(
  customScript,
  mountDefinitionLiterals[0],
  "'halo-comment'"
)}\nconst joeReadLimitedMountDefinitionDeadText = "customElements.get('comment-widget')";\n`;
expectContractMutationRejected(
  'comment-expand accepts an empty mount before comment-widget is defined',
  'comment-expand runtime must progressively enhance',
  () =>
    validateReadLimitRuntime(
      mountDefinitionMutationSource,
      `${customScriptPath} mount definition mutation`
    )
);
const activationTimeoutFailOpenCalls = [];
walkEffectAst(readLimitRuntimeContract.activationTimeoutBranch?.consequent, (node) => {
  if (isThisMethodCall(node, 'failOpen')) activationTimeoutFailOpenCalls.push(node);
});
if (activationTimeoutFailOpenCalls.length !== 1) {
  throw new Error(`${customScriptPath}: expected one mount activation timeout mutation target`);
}
const activationTimeoutMutationSource = `${replaceAstRange(
  customScript,
  activationTimeoutFailOpenCalls[0],
  'this.remove()'
)}\nconst joeReadLimitedActivationTimeoutDeadText = "this.failOpen();";\n`;
expectContractMutationRejected(
  'comment-expand leaves content limited after empty mount activation times out',
  'comment-expand runtime must progressively enhance',
  () =>
    validateReadLimitRuntime(
      activationTimeoutMutationSource,
      `${customScriptPath} activation timeout mutation`
    )
);
const readinessRootCalls = [];
walkEffectAst(readLimitRuntimeContract.readinessReturn?.argument, (node) => {
  if (isThisMethodCall(node, 'getCommentHostRoot')) readinessRootCalls.push(node);
});
if (readinessRootCalls.length !== 1) {
  throw new Error(`${customScriptPath}: expected one readiness root-call mutation target`);
}
const deadReadinessMutationSource = `${replaceAstRange(
  customScript,
  readinessRootCalls[0],
  '(() => { return null; this.getCommentHostRoot(host); })()'
)}\nconst joeReadLimitedReadinessDeadText = "this.getCommentHostRoot(host)";\n`;
expectContractMutationRejected(
  'comment-expand readiness check survives only after an unreachable return',
  'comment-expand runtime must progressively enhance',
  () =>
    validateReadLimitRuntime(deadReadinessMutationSource, `${customScriptPath} readiness mutation`)
);
const observerFailOpenCalls = [];
walkEffectAst(readLimitRuntimeContract.observerCallback?.body, (node) => {
  if (isThisMethodCall(node, 'failOpen')) observerFailOpenCalls.push(node);
});
if (observerFailOpenCalls.length !== 1) {
  throw new Error(`${customScriptPath}: expected one host-removal fail-open mutation target`);
}
const hostRemovalMutationSource = `${replaceAstRange(
  customScript,
  observerFailOpenCalls[0],
  '(() => { if (false) this.failOpen(); })()'
)}\nconst joeReadLimitedHostRemovalDeadText = "this.failOpen();";\n`;
expectContractMutationRejected(
  'comment-expand host-removal fail-open survives only in an unreachable false branch',
  'comment-expand runtime must progressively enhance',
  () => validateReadLimitRuntime(hostRemovalMutationSource, `${customScriptPath} removal mutation`)
);
const fetchInstallMutationSource = `${replaceAstRange(
  customScript,
  readLimitRuntimeContract.fetchInstallAssignment,
  'window.fetch = this.originalFetch'
)}\nconst joeReadLimitedFetchInstallDeadText = "window.fetch = this.fetchWrapper";\n`;
expectContractMutationRejected(
  'comment-expand does not install its recorded fetch wrapper',
  'comment-expand runtime must progressively enhance',
  () => validateReadLimitRuntime(fetchInstallMutationSource, `${customScriptPath} install mutation`)
);
const fetchRestoreMutationSource = `${replaceAstRange(
  customScript,
  readLimitRuntimeContract.fetchRestoreGuard.test,
  'this.fetchWrapper && this.originalFetch'
)}\nconst joeReadLimitedFetchRestoreDeadText = "window.fetch === this.fetchWrapper";\n`;
expectContractMutationRejected(
  'comment-expand restores fetch without wrapper identity ownership',
  'comment-expand runtime must progressively enhance',
  () => validateReadLimitRuntime(fetchRestoreMutationSource, `${customScriptPath} restore mutation`)
);
const removeThIfFromOpeningTag = (openingTag) => {
  const mutated = openingTag.replace(/\s+th:if\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/, '');
  if (mutated === openingTag) throw new Error('contract mutation target has no th:if');
  return mutated;
};
const footerMutationSource =
  footerDocument.source.replace(
    footerElement.openingTag,
    removeThIfFromOpeningTag(footerElement.openingTag)
  ) + `\n<!-- ${footerElement.openingTag}</footer> -->\n`;
expectContractMutationRejected(
  'footer guard moved into an inactive HTML comment',
  'shared footer root must bind the normalized global footer switch',
  () =>
    validateFooterDocument(
      createContractDocument('templates/modules/common/footer.html', footerMutationSource)
    )
);
const postReadLimitContract = validateReadLimitDocument(postDocument, 'post');
const postReadLimitMutationSource =
  postDocument.source.replace(
    postReadLimitContract.ctaGuard.openingTag,
    removeThIfFromOpeningTag(postReadLimitContract.ctaGuard.openingTag)
  ) +
  `\n<!-- <th:block th:if="\${${postReadLimitContract.guard}}"><joe-read-limited comment-plugin="CommentWidgetPlugin"></joe-read-limited></th:block> -->\n`;
expectContractMutationRejected(
  'comment-expand CTA guard moved into an inactive HTML comment',
  'joe-read-limited parent must use the same complete available-comment guard',
  () =>
    validateReadLimitDocument(
      createContractDocument('templates/post.html', postReadLimitMutationSource),
      'post'
    )
);
const thumbnailConfigPath = 'theme.config.home.lazyload_thumbnail';
const thumbnailDefaultUrl = '/themes/theme-Joe3/assets/img/lazyload.gif';
const bannerConfigPath = 'theme.config.carousel.banner_lazyload_img';
const bannerDefaultUrl = '/themes/theme-Joe3/assets/img/lazyload_h.gif';
const placeholderPolicies = [
  {
    group: 'home',
    setting: 'lazyload_thumbnail',
    configPath: thumbnailConfigPath,
    defaultUrl: thumbnailDefaultUrl,
    producers: [
      { path: 'templates/categories.html', allowedWrappers: [['direct', 1]] },
      { path: 'templates/tags.html', allowedWrappers: [['direct', 1]] },
      {
        path: 'templates/modules/ads/ads_aside.html',
        allowedWrappers: [['direct', 1]],
      },
      {
        path: 'templates/modules/macro/post_item.html',
        allowedWrappers: [['prioritize', 1]],
      },
      {
        path: 'templates/modules/macro/relate_cards.html',
        allowedWrappers: [['direct', 2]],
      },
    ],
  },
  {
    group: 'carousel',
    setting: 'banner_lazyload_img',
    configPath: bannerConfigPath,
    defaultUrl: bannerDefaultUrl,
    producers: [
      {
        path: 'templates/modules/macro/banner_item.html',
        allowedWrappers: [['direct', 1]],
      },
      {
        path: 'templates/modules/macro/banner_item_data.html',
        allowedWrappers: [
          ['eager', 2],
          ['prioritize', 1],
        ],
      },
    ],
  },
];
const countOccurrences = (source, value) => source.split(value).length - 1;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const policy of placeholderPolicies) {
  const settingGroup = sourceSettings.spec?.forms?.find(({ group }) => group === policy.group);
  const setting = settingGroup?.formSchema?.find(({ name }) => name === policy.setting);
  if (setting?.value !== policy.defaultUrl) {
    throw new Error(
      `${settingsPath}: ${policy.group}.${policy.setting} must keep the built-in default ${policy.defaultUrl}`
    );
  }

  const actualProducerPaths = firstPartyResourceLoaders
    .filter(({ resourceAttributes }) =>
      resourceAttributes.some(
        ({ elementName, name, value }) =>
          elementName === 'img' && name === 'th:src' && value.includes(policy.configPath)
      )
    )
    .map(({ path }) => path)
    .sort();
  const expectedProducerPaths = policy.producers.map(({ path }) => path).sort();
  if (actualProducerPaths.join('\n') !== expectedProducerPaths.join('\n')) {
    throw new Error(
      `${policy.configPath}: producer set changed; expected ${expectedProducerPaths.join(', ')}, got ${actualProducerPaths.join(', ')}`
    );
  }

  const actualConfigResourcePaths = firstPartyResourceLoaders
    .filter(({ resourceValues }) =>
      resourceValues.some((value) => value.includes(policy.configPath))
    )
    .map(({ path }) => path)
    .sort();
  if (actualConfigResourcePaths.join('\n') !== expectedProducerPaths.join('\n')) {
    throw new Error(
      `${policy.configPath}: dynamic resource reference set changed; expected ${expectedProducerPaths.join(', ')}, got ${actualConfigResourcePaths.join(', ')}`
    );
  }

  const actualDefaultResourcePaths = firstPartyResourceLoaders
    .filter(({ resourceValues }) =>
      resourceValues.some((value) => value.includes(policy.defaultUrl))
    )
    .map(({ path }) => path)
    .sort();
  if (actualDefaultResourcePaths.join('\n') !== expectedProducerPaths.join('\n')) {
    throw new Error(
      `${policy.defaultUrl}: built-in placeholder references must exist only in ${expectedProducerPaths.join(', ')}, got ${actualDefaultResourcePaths.join(', ')}`
    );
  }

  const configPattern = escapeRegExp(policy.configPath);
  const defaultUrlPattern = escapeRegExp(policy.defaultUrl);
  const guardedDefaultPattern = `${configPattern}\\s*==\\s*['"]${defaultUrlPattern}['"]\\s*\\?\\s*${configPattern}\\s*\\+\\s*['"]\\?v=['"]\\s*\\+\\s*theme\\.spec\\.version\\s*:\\s*${configPattern}`;
  const fullWrapperPatterns = new Map([
    ['direct', new RegExp(`^\\s*\\$\\{\\s*${guardedDefaultPattern}\\s*\\}\\s*$`)],
    [
      'eager',
      new RegExp(
        `^\\s*\\$\\{\\s*eager\\s*\\?\\s*cover\\s*:\\s*\\(\\s*${guardedDefaultPattern}\\s*\\)\\s*\\}\\s*$`
      ),
    ],
    [
      'prioritize',
      new RegExp(
        `^\\s*\\$\\{\\s*prioritize\\s*\\?\\s*cover\\s*:\\s*\\(\\s*${guardedDefaultPattern}\\s*\\)\\s*\\}\\s*$`
      ),
    ],
  ]);

  for (const producer of policy.producers) {
    const loader = firstPartyResourceLoaders.find(({ path }) => path === producer.path);
    if (loader == null) {
      throw new Error(`${policy.configPath}: missing producer ${producer.path}`);
    }
    const guardedAttributes = loader.resourceAttributes
      .filter(
        ({ elementName, name, value }) =>
          elementName === 'img' && name === 'th:src' && value.includes(policy.configPath)
      )
      .map(({ value }) => value);
    const expectedCount = producer.allowedWrappers.reduce(
      (count, [, wrapperCount]) => count + wrapperCount,
      0
    );
    if (guardedAttributes.length !== expectedCount) {
      throw new Error(
        `${producer.path}: expected ${expectedCount} guarded ${policy.setting} src attributes, found ${guardedAttributes.length}`
      );
    }
    for (const [wrapper, expectedWrapperCount] of producer.allowedWrappers) {
      const wrapperPattern = fullWrapperPatterns.get(wrapper);
      const actualWrapperCount = guardedAttributes.filter((attribute) =>
        wrapperPattern?.test(attribute)
      ).length;
      if (actualWrapperCount !== expectedWrapperCount) {
        throw new Error(
          `${producer.path}: expected ${expectedWrapperCount} complete ${wrapper} ${policy.setting} expressions, found ${actualWrapperCount}`
        );
      }
    }
    for (const attribute of guardedAttributes) {
      if (
        countOccurrences(attribute, policy.configPath) !== 3 ||
        countOccurrences(attribute, policy.defaultUrl) !== 1 ||
        countOccurrences(attribute, '?v=') !== 1 ||
        countOccurrences(attribute, 'theme.spec.version') !== 1
      ) {
        throw new Error(
          `${producer.path}: ${policy.setting} th:src must cache-bust only ${policy.defaultUrl} and return custom URLs unchanged`
        );
      }
    }
    const actualConfigReferences = loader.resourceValues.reduce(
      (count, value) => count + countOccurrences(value, policy.configPath),
      0
    );
    if (actualConfigReferences !== expectedCount * 3) {
      throw new Error(
        `${producer.path}: every ${policy.configPath} reference must preserve custom URLs and cache-bust only ${policy.defaultUrl}`
      );
    }
    const actualDefaultResourceReferences = loader.resourceValues.reduce(
      (count, value) => count + countOccurrences(value, policy.defaultUrl),
      0
    );
    if (actualDefaultResourceReferences !== expectedCount) {
      throw new Error(
        `${producer.path}: expected ${expectedCount} guarded ${policy.defaultUrl} references, found ${actualDefaultResourceReferences}`
      );
    }
  }
}
const musicResourcePaths = [
  'assets/lib/APlayer/APlayer.min.css',
  'assets/lib/APlayer/APlayer.min.js',
  'assets/lib/meting/meting.min.js',
];
const tailTemplateMarkup = maskInactiveMarkup(tail);
const markupElements = parseMarkupElements(tailTemplateMarkup, 'templates/modules/macro/tail.html');
const musicConditionPattern =
  /^\s*\$\{\s*htmlType\s*==\s*(["'])post\1\s+or\s+\(\s*not\s+#lists\.isEmpty\(\s*theme\.config\.aside\.enable_outpost_aside\s*\)\s+and\s+not\s+#lists\.isEmpty\(\s*theme\.config\.aside\.enable_outpost_aside\.\?\[\s*template_aside\s*==\s*(["'])enable_music_player\2\s+and\s+aside_music_player\s*!=\s*null\s+and\s+aside_music_player\.music_id\s*!=\s*null\s+and\s+#strings\.trim\(\s*aside_music_player\.music_id\s*\)\s*!=\s*(["'])\3\s*\]\s*\)\s*\)\s*\}\s*$/;
const musicResourceSpecifications = [
  { path: musicResourcePaths[0], sourceAttributes: ['th:href', 'href'] },
  { path: musicResourcePaths[1], sourceAttributes: ['th:src', 'src'] },
  { path: musicResourcePaths[2], sourceAttributes: ['th:src', 'src'] },
];
const sourceAttributeLoadsResource = (name, value, path) => {
  if (!name.startsWith('th:')) return value === path || value === `/${path}`;
  return new RegExp(
    `^\\s*\\$\\{\\s*source_link\\s*\\+\\s*(["'])/${escapeRegExp(path)}\\1\\s*\\}\\s*$`
  ).test(value);
};
const tagLoadsResource = (tag, { path, sourceAttributes }) => {
  const attributes = readTagAttributes(tag);
  const configuredSources = sourceAttributes.filter((name) => attributes.has(name));
  return (
    configuredSources.length === 1 &&
    sourceAttributeLoadsResource(configuredSources[0], attributes.get(configuredSources[0]), path)
  );
};
const sourceAttributeLoadsVersionedResource = (name, value, path) => {
  if (!name.startsWith('th:')) return false;
  return new RegExp(
    `^\\s*\\$\\{\\s*source_link\\s*\\+\\s*(["'])/${escapeRegExp(path)}\\?v=\\1\\s*\\+\\s*theme\\.spec\\.version\\s*\\}\\s*$`
  ).test(value);
};
const tagLoadsVersionedResource = (tag, path) => {
  const attributes = readTagAttributes(tag);
  const configuredSources = ['th:src', 'src'].filter((name) => attributes.has(name));
  return (
    configuredSources.length === 1 &&
    sourceAttributeLoadsVersionedResource(
      configuredSources[0],
      attributes.get(configuredSources[0]),
      path
    )
  );
};
const tagLoadsVersionedStylesheet = (tag, path) => {
  const attributes = readTagAttributes(tag);
  const configuredSources = ['th:href', 'href'].filter((name) => attributes.has(name));
  return (
    configuredSources.length === 1 &&
    sourceAttributeLoadsVersionedResource(
      configuredSources[0],
      attributes.get(configuredSources[0]),
      path
    )
  );
};
const directChildrenOf = (element) =>
  markupElements
    .filter((candidate) => candidate.parentStart === element.start)
    .sort((left, right) => left.start - right.start);
const hasOnlyElementChildren = (element, children) => {
  let cursor = element.contentStart;
  for (const child of children) {
    if (tailTemplateMarkup.slice(cursor, child.start).trim() !== '') return false;
    cursor = child.end;
  }
  return tailTemplateMarkup.slice(cursor, element.contentEnd).trim() === '';
};
const hasOnlyAllowedThymeleafAttributes = (tag, allowedNames) => {
  const allowed = new Set(allowedNames);
  return [...readTagAttributes(tag).keys()]
    .filter((name) => name.startsWith('th:') || name.startsWith('data-th-'))
    .every((name) => allowed.has(name));
};
const dangerousThymeleafAttributes = new Set([
  'th:if',
  'th:unless',
  'th:each',
  'th:remove',
  'th:replace',
  'th:insert',
  'th:switch',
  'th:case',
]);
const hasDangerousThymeleafAttribute = (tag) =>
  [...readTagAttributes(tag).keys()].some((name) => {
    const canonicalName = name.startsWith('data-th-')
      ? `th:${name.slice('data-th-'.length)}`
      : name;
    return dangerousThymeleafAttributes.has(canonicalName);
  });
const hasSafeExecutableScriptAttributes = (tag) => {
  const attributes = readTagAttributes(tag);
  return (
    !isSelfClosingTag(tag) &&
    hasOnlyAllowedThymeleafAttributes(tag, ['th:src']) &&
    attributes.has('defer') &&
    !attributes.has('async') &&
    !attributes.has('nomodule') &&
    !attributes.has('type')
  );
};
const musicResourceBlocks = markupElements.flatMap((block) => {
  if (block.name !== 'th:block') return [];
  const resourceElements = directChildrenOf(block);
  if (
    resourceElements.length !== 3 ||
    !hasOnlyElementChildren(block, resourceElements) ||
    resourceElements[0].name !== 'link' ||
    resourceElements[1].name !== 'script' ||
    resourceElements[2].name !== 'script' ||
    !resourceElements.every((element, index) =>
      tagLoadsResource(element.openingTag, musicResourceSpecifications[index])
    )
  ) {
    return [];
  }
  return [{ block, resourceElements }];
});
const musicResourceBlock = musicResourceBlocks.length === 1 ? musicResourceBlocks[0].block : null;
const musicResourceElements =
  musicResourceBlocks.length === 1 ? musicResourceBlocks[0].resourceElements : [];
const musicResourceTags = musicResourceElements.map(({ openingTag }) => openingTag);
const tailFragmentElements = markupElements.filter(
  (element) => readTagAttribute(element.openingTag, 'th:fragment') === 'tail'
);
const tailFragmentElement = tailFragmentElements.length === 1 ? tailFragmentElements[0] : null;
const musicMarkupAncestors = musicResourceBlock
  ? musicResourceBlock.ancestorStarts
      .map((start) => markupElements.find((element) => element.start === start))
      .filter(Boolean)
  : [];
const allResourceElements = markupElements.filter(
  ({ name }) => name === 'link' || name === 'script'
);
const externalScripts = allResourceElements
  .filter(
    (element) => element.name === 'script' && readExternalScriptSource(element.openingTag) != null
  )
  .map(({ openingTag }) => openingTag);
const musicResourceTagCounts = musicResourceSpecifications.map(
  (specification) =>
    allResourceElements.filter((element) => tagLoadsResource(element.openingTag, specification))
      .length
);
const musicScriptTags = musicResourceTags.slice(1);
const musicScriptsAreDeferred =
  musicScriptTags.length === 2 &&
  musicScriptTags.every((tag) => hasSafeExecutableScriptAttributes(tag));
const customScriptElements = markupElements.filter(
  (element) =>
    element.name === 'script' &&
    tagLoadsVersionedResource(element.openingTag, 'assets/js/min/custom.min.js')
);
const musicResourceIndexes = [
  ...musicResourceElements.map(({ start }) => start),
  customScriptElements.length === 1 ? customScriptElements[0].start : -1,
];
const customScriptElement = customScriptElements.length === 1 ? customScriptElements[0] : null;
const customAPlayerElements = ['joe-mp3', 'joe-music', 'joe-mlist'];
const visitAstNodes = (node, visitor) => {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) visitAstNodes(item, visitor);
    return;
  }
  if (typeof node.type === 'string') visitor(node);
  for (const value of Object.values(node)) visitAstNodes(value, visitor);
};
const readStaticString = (node) => {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (
    node?.type === 'TemplateLiteral' &&
    node.expressions?.length === 0 &&
    node.quasis?.length === 1
  ) {
    return node.quasis[0].value?.cooked ?? node.quasis[0].value?.raw ?? null;
  }
  return null;
};
const validateCustomAPlayerConsumers = (script, label) => {
  const ast = parseAst(script, { sourceType: 'script' }, label);
  const definitions = [];
  visitAstNodes(ast, (node) => {
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'MemberExpression' &&
      !node.callee.computed &&
      node.callee.object?.type === 'Identifier' &&
      node.callee.object.name === 'customElements' &&
      node.callee.property?.type === 'Identifier' &&
      node.callee.property.name === 'define'
    ) {
      definitions.push({
        implementation: node.arguments?.[1] ?? null,
        name: readStaticString(node.arguments?.[0]),
      });
    }
  });
  for (const element of customAPlayerElements) {
    const matchingDefinitions = definitions.filter(({ name }) => name === element);
    let aPlayerConstructions = 0;
    if (matchingDefinitions.length === 1) {
      visitAstNodes(matchingDefinitions[0].implementation, (node) => {
        if (
          node.type === 'NewExpression' &&
          node.callee?.type === 'Identifier' &&
          node.callee.name === 'APlayer'
        ) {
          aPlayerConstructions += 1;
        }
      });
    }
    if (matchingDefinitions.length !== 1 || aPlayerConstructions !== 1) {
      throw new Error(`${label}: ${element} must construct APlayer exactly once`);
    }
  }
};
validateCustomAPlayerConsumers(customScript, customScriptPath);
if (sourceCustomMinScript != null) {
  validateCustomAPlayerConsumers(sourceCustomMinScript.toString('utf8'), customMinScriptPath);
}
if (
  musicResourceBlock == null ||
  !musicConditionPattern.test(
    readTagAttribute(musicResourceBlock?.openingTag ?? '', 'th:if') ?? ''
  ) ||
  !hasOnlyAllowedThymeleafAttributes(musicResourceBlock?.openingTag ?? '', ['th:if']) ||
  musicResourceBlock?.parentStart !== tailFragmentElement?.start ||
  !hasOnlyAllowedThymeleafAttributes(tailFragmentElement?.openingTag ?? '', [
    'th:fragment',
    'th:with',
  ]) ||
  musicMarkupAncestors.some((element) => hasDangerousThymeleafAttribute(element.openingTag)) ||
  musicResourceTagCounts.some((count) => count !== 1) ||
  musicResourceTags.length !== 3 ||
  !hasOnlyAllowedThymeleafAttributes(musicResourceTags[0] ?? '', ['th:href']) ||
  readTagAttribute(musicResourceTags[0] ?? '', 'rel')
    ?.trim()
    .toLowerCase() !== 'stylesheet' ||
  !musicScriptsAreDeferred ||
  customScriptElements.length !== 1 ||
  customScriptElement?.parentStart !== tailFragmentElement?.start ||
  !hasSafeExecutableScriptAttributes(customScriptElement?.openingTag ?? '') ||
  customScriptElement?.ancestorStarts
    .map((start) => markupElements.find((element) => element.start === start))
    .filter(Boolean)
    .some((element) => hasDangerousThymeleafAttribute(element.openingTag)) ||
  musicResourceIndexes.some((index) => index < 0) ||
  musicResourceIndexes.some((index, position) =>
    position === 0 ? false : index <= musicResourceIndexes[position - 1]
  )
) {
  throw new Error(
    'templates/modules/macro/tail.html: unwrapped music block must load one APlayer stylesheet and one deferred, non-async APlayer/meting script pair before custom.min.js on every post or a configured sidebar music item'
  );
}
const guardedPackageSources = new Map(
  [
    settingsPath,
    annotationSettingsPath,
    commonScriptPath,
    postScriptPath,
    leavingScriptPath,
    'templates/assets/js/utils.js',
    'templates/assets/js/beauty.js',
    'templates/modules/layout.html',
    'templates/modules/key_css.html',
    'templates/modules/themeSettingVariable.html',
    'templates/modules/link.html',
    'templates/modules/macro/tail.html',
    'templates/page_leaving.html',
    'templates/modules/postMetaVariable.html',
    'templates/modules/post_operate.html',
    'templates/modules/post_operate_aside.html',
    indexScriptPath,
    journalsScriptPath,
    indexTemplatePath,
    favoriteTemplatePath,
    paginationTemplatePath,
    'templates/moment.html',
    'templates/moments.html',
    'templates/assets/css/global.less',
    'templates/assets/css/post.less',
    'templates/assets/css/journals.less',
    'templates/friends.html',
    'templates/links.html',
    'templates/page.html',
    'templates/page_links.html',
    'templates/photos.html',
    'templates/post.html',
    'templates/modules/ads/ads_post.html',
    'templates/modules/common/blogger.html',
    'templates/modules/common/footer.html',
    'templates/modules/donate.html',
    'templates/modules/macro/banner.html',
    'templates/modules/macro/hot_category.html',
    'templates/modules/macro/navbar.html',
    'templates/modules/widgets/asideWidget.html',
    ...new Set(placeholderPolicies.flatMap(({ producers }) => producers.map(({ path }) => path))),
  ].map((path) => [path, readFileSync(resolve(path))])
);
guardedPackageSources.set(error404TemplatePath, error404TemplateBuffer);
guardedPackageSources.set(themeLogoPackagePath, sourceThemeLogo);
if (sourceCustomMinScript != null) {
  guardedPackageSources.set(customMinScriptPath, sourceCustomMinScript);
}
if (sourceCommonMinScript != null) {
  guardedPackageSources.set(commonMinScriptPath, sourceCommonMinScript);
}
if (sourceJournalsMinScript != null) {
  guardedPackageSources.set(journalsMinScriptPath, sourceJournalsMinScript);
}
if (sourcePhotosMinScript != null) {
  guardedPackageSources.set(photosMinScriptPath, sourcePhotosMinScript);
}
if (sourcePostMinScript != null) {
  guardedPackageSources.set(postMinScriptPath, sourcePostMinScript);
}
if (sourceUtilsMinScript != null) {
  guardedPackageSources.set(utilsMinScriptPath, sourceUtilsMinScript);
}
if (sourceBeautyMinScript != null) {
  guardedPackageSources.set(beautyMinScriptPath, sourceBeautyMinScript);
}
if (sourceLeavingMinScript != null) {
  guardedPackageSources.set(leavingMinScriptPath, sourceLeavingMinScript);
}
guardedPackageSources.set(fontAwesomeRuntimeCssPath, fontAwesomeRuntimeCssBuffer);
guardedPackageSources.set(fontAwesomeWoff2Path, fontAwesomeWoff2);
const firstPartyRawSourcePattern = /\.(?:html|css|less|js|mjs)$/;
const removedPhotosVendorPaths = new Set(
  removedPhotosResources.map((resource) => `templates/${resource}`)
);
const firstPartyRawSourcePaths = [
  ...readdirSync(resolve('.'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && firstPartyRawSourcePattern.test(entry.name))
    .map(({ name }) => name),
  ...readdirSync(templateRoot, { recursive: true })
    .filter(
      (path) =>
        firstPartyRawSourcePattern.test(path) && !removedPhotosVendorPaths.has(`templates/${path}`)
    )
    .map((path) => `templates/${path}`),
  ...readdirSync(resolve('scripts'), { recursive: true })
    .filter((path) => firstPartyRawSourcePattern.test(path) && path !== 'verify-theme-package.mjs')
    .map((path) => `scripts/${path}`),
];
for (const resource of removedPhotosResources) {
  const resourceSources = firstPartyRawSourcePaths.filter((path) =>
    readFileSync(resolve(path), 'utf8').includes(resource)
  );
  if (resourceSources.length > 0) {
    throw new Error(
      `source theme: removed photos resource ${resource} referenced by ${resourceSources.join(', ')}`
    );
  }
}
const isotopeLibraryPath = 'templates/assets/lib/masonry/isotope.pkgd.min.js';
if (!existsSync(resolve(isotopeLibraryPath))) {
  throw new Error(`source theme: missing ${isotopeLibraryPath}`);
}
const sourceIsotopeLibrary = readFileSync(resolve(isotopeLibraryPath));
const sourceIsotopeLibraryText = sourceIsotopeLibrary.toString('utf8');
const expectedIsotopeLibrarySha256 =
  '081ae9baaacc857c1c2cb51de6dbd0e1eb811c2761ef01a50df373f2f6eefe22';
const isotopeLibrarySha256 = createHash('sha256').update(sourceIsotopeLibrary).digest('hex');
if (sourceIsotopeLibrary.length < 35000 || isotopeLibrarySha256 !== expectedIsotopeLibrarySha256) {
  throw new Error(
    `${isotopeLibraryPath}: packaged isotope asset must be at least 35000 bytes with SHA-256 ${expectedIsotopeLibrarySha256}, got ${sourceIsotopeLibrary.length} bytes and ${isotopeLibrarySha256}`
  );
}
const requiredIsotopeMarkers = [
  'Isotope PACKAGED',
  'masonry-layout/masonry',
  'isotope-layout/js/layout-modes/masonry',
];
for (const marker of requiredIsotopeMarkers) {
  if (!sourceIsotopeLibraryText.includes(marker)) {
    throw new Error(`${isotopeLibraryPath}: missing packaged dependency marker ${marker}`);
  }
}
const photosGuardPattern = /^\s*\$\{\s*htmlType\s*==\s*(["'])photos\1\s*\}\s*$/;
const photosConditionalBlocks = markupElements.filter(
  (element) =>
    element.name === 'th:block' &&
    photosGuardPattern.test(readTagAttribute(element.openingTag, 'th:if') ?? '') &&
    hasOnlyAllowedThymeleafAttributes(element.openingTag, ['th:if'])
);
const isotopeSpecification = {
  path: isotopeLibraryPath.slice('templates/'.length),
  sourceAttributes: ['th:src', 'src'],
};
const photosIsotopeBlocks = photosConditionalBlocks.flatMap((block) => {
  const children = directChildrenOf(block);
  return children.length === 1 &&
    hasOnlyElementChildren(block, children) &&
    children[0].name === 'script' &&
    tagLoadsResource(children[0].openingTag, isotopeSpecification)
    ? [{ block, script: children[0] }]
    : [];
});
const isotopeScripts = allResourceElements.filter(
  (element) =>
    element.name === 'script' && tagLoadsResource(element.openingTag, isotopeSpecification)
);
const photosPageScripts = allResourceElements.filter(
  (element) =>
    element.name === 'script' &&
    tagLoadsVersionedResource(element.openingTag, 'assets/js/min/photos.min.js')
);
const photosPageParent =
  photosPageScripts.length === 1
    ? markupElements.find((element) => element.start === photosPageScripts[0].parentStart)
    : null;
const isotopeScriptIndex = isotopeScripts.length === 1 ? isotopeScripts[0].start : -1;
const photosPageScriptIndex = photosPageScripts.length === 1 ? photosPageScripts[0].start : -1;
if (
  photosIsotopeBlocks.length !== 1 ||
  photosIsotopeBlocks[0].block.parentStart !== tailFragmentElement?.start ||
  !hasSafeExecutableScriptAttributes(photosIsotopeBlocks[0].script.openingTag) ||
  isotopeScripts.length !== 1 ||
  photosPageScripts.length !== 1 ||
  !hasSafeExecutableScriptAttributes(photosPageScripts[0].openingTag) ||
  photosPageParent?.parentStart !== tailFragmentElement?.start ||
  !photosConditionalBlocks.includes(photosPageParent) ||
  isotopeScriptIndex < 0 ||
  photosPageScriptIndex < 0 ||
  isotopeScriptIndex >= photosPageScriptIndex
) {
  throw new Error(
    'templates/modules/macro/tail.html: photos must load one deferred packaged isotope library inside a photos guard before photos.min.js'
  );
}
const linkTemplateMarkup = maskInactiveMarkup(links);
const linkMarkupElements = parseMarkupElements(linkTemplateMarkup, 'templates/modules/link.html');
const linkFragmentElements = linkMarkupElements.filter(
  (element) => readTagAttribute(element.openingTag, 'th:fragment') === 'links'
);
const linkFragmentElement = linkFragmentElements.length === 1 ? linkFragmentElements[0] : null;
const nprogressSpecification = {
  path: 'assets/lib/nprogress/nprogress.min.js',
  sourceAttributes: ['th:src', 'src'],
};
const nprogressScripts = firstPartyResourceLoaders.flatMap(({ path, externalScriptTags }) =>
  externalScriptTags
    .filter((tag) => tagLoadsResource(tag, nprogressSpecification))
    .map((tag) => ({ path, tag }))
);
const nprogressLinkElements = linkMarkupElements.filter(
  (element) =>
    element.name === 'script' && tagLoadsResource(element.openingTag, nprogressSpecification)
);
const nprogressElement = nprogressLinkElements.length === 1 ? nprogressLinkElements[0] : null;
const nprogressGuard = nprogressElement
  ? linkMarkupElements.find((element) => element.start === nprogressElement.parentStart)
  : null;
const layout = readFileSync(resolve('templates/modules/layout.html'), 'utf8');
const layoutLinkIndex = layout.indexOf('~{modules/link :: links}');
const layoutHeadCloseIndex = layout.indexOf('</head>');
const layoutContentIndex = layout.indexOf('th:replace="${content}"');
if (
  nprogressScripts.length !== 1 ||
  nprogressScripts[0].path !== 'templates/modules/link.html' ||
  nprogressLinkElements.length !== 1 ||
  !hasSafeExecutableScriptAttributes(nprogressElement?.openingTag ?? '') ||
  nprogressGuard?.name !== 'th:block' ||
  readTagAttribute(nprogressGuard.openingTag, 'th:if') !==
    '${theme.config.theme.enable_loading_bar}' ||
  nprogressGuard.parentStart !== linkFragmentElement?.start ||
  layoutLinkIndex < 0 ||
  layoutHeadCloseIndex < 0 ||
  layoutContentIndex < 0 ||
  !(layoutLinkIndex < layoutHeadCloseIndex && layoutHeadCloseIndex < layoutContentIndex)
) {
  throw new Error(
    'templates/modules/link.html: NProgress must load exactly once with defer in the enabled head fragment before tail common.min.js'
  );
}

const utilsScriptElements = markupElements.filter(
  (element) =>
    element.name === 'script' &&
    tagLoadsVersionedResource(element.openingTag, 'assets/js/min/utils.min.js')
);
const commonScriptElements = markupElements.filter(
  (element) =>
    element.name === 'script' &&
    tagLoadsVersionedResource(element.openingTag, 'assets/js/min/common.min.js')
);
const globalUtilsScripts = firstPartyResourceLoaders.flatMap(({ path, externalScriptTags }) =>
  externalScriptTags
    .filter((tag) => readExternalScriptSource(tag)?.includes('assets/js/min/utils.min.js'))
    .map((tag) => ({ path, tag }))
);
const globalCommonScripts = firstPartyResourceLoaders.flatMap(({ path, externalScriptTags }) =>
  externalScriptTags
    .filter((tag) => readExternalScriptSource(tag)?.includes('assets/js/min/common.min.js'))
    .map((tag) => ({ path, tag }))
);
if (
  utilsScriptElements.length !== 1 ||
  commonScriptElements.length !== 1 ||
  globalUtilsScripts.length !== 1 ||
  globalUtilsScripts[0].path !== 'templates/modules/macro/tail.html' ||
  globalUtilsScripts[0].tag !== utilsScriptElements[0].openingTag ||
  globalCommonScripts.length !== 1 ||
  globalCommonScripts[0].path !== 'templates/modules/macro/tail.html' ||
  globalCommonScripts[0].tag !== commonScriptElements[0].openingTag ||
  !hasSafeExecutableScriptAttributes(utilsScriptElements[0].openingTag) ||
  !hasSafeExecutableScriptAttributes(commonScriptElements[0].openingTag) ||
  utilsScriptElements[0].parentStart !== tailFragmentElement?.start ||
  commonScriptElements[0].parentStart !== tailFragmentElement?.start ||
  utilsScriptElements[0].start >= commonScriptElements[0].start
) {
  throw new Error(
    'templates/modules/macro/tail.html: versioned utils.min.js must load exactly once before versioned common.min.js'
  );
}

const qrcodeSpecification = {
  path: 'assets/lib/jquery-qrcode/jquery.qrcode.min.js',
  sourceAttributes: ['th:src', 'src'],
};
const qrcodeScriptElements = allResourceElements.filter(
  (element) =>
    element.name === 'script' && tagLoadsResource(element.openingTag, qrcodeSpecification)
);
const globalQrcodeScripts = firstPartyResourceLoaders.flatMap(({ path, externalScriptTags }) =>
  externalScriptTags
    .filter((tag) => tagLoadsResource(tag, qrcodeSpecification))
    .map((tag) => ({ path, tag }))
);
const qrcodeElement = qrcodeScriptElements.length === 1 ? qrcodeScriptElements[0] : null;
const qrcodeGuard = qrcodeElement
  ? markupElements.find((element) => element.start === qrcodeElement.parentStart)
  : null;
const expectedQrcodeCondition =
  "${htmlType == 'post' and #bools.isTrue(theme.config.post.enable_share) and #bools.isTrue(theme.config.post.enable_share_weixin) and #bools.isTrue(#annotations.getOrDefault(post, 'enable_share', 'true'))}";
const activeTemplateElements = new Map(
  htmlTemplates.map(({ path, source }) => [
    path,
    parseMarkupElements(maskInactiveMarkup(source), `templates/${path}`),
  ])
);
const pageLeavingTemplatePath = 'templates/page_leaving.html';
const pageLeavingTemplate = readFileSync(resolve(pageLeavingTemplatePath), 'utf8');
const pageLeavingElements = activeTemplateElements.get('page_leaving.html') ?? [];
const expectedDefaultLeavingCondition =
  "${theme.config.basic.comment_option == 'default'} or ${#strings.trim(theme.config.basic.waline.waline_serverURL) ==''}";
const expectedWalineLeavingCondition =
  "${theme.config.basic.comment_option == 'waline'} and ${#strings.trim(theme.config.basic.waline.waline_serverURL) !=''}";
const normalizeMarkupExpression = (value) => value?.replace(/\s+/g, '') ?? '';
const expectedSourceLinkBinding = readTagAttribute(
  tailFragmentElement?.openingTag ?? '',
  'th:with'
);
const readClassTokens = (element) =>
  (readTagAttribute(element?.openingTag ?? '', 'class') ?? '').split(/\s+/).filter(Boolean);
const leavingListElements = pageLeavingElements.filter(
  (element) => element.name === 'ul' && readClassTokens(element).includes('joe_leaving-list')
);
const defaultLeavingLists = leavingListElements.filter((element) => {
  const parent = pageLeavingElements.find((candidate) => candidate.start === element.parentStart);
  return readTagAttribute(parent?.openingTag ?? '', 'th:if') === expectedDefaultLeavingCondition;
});
const walineLeavingLists = leavingListElements.filter((element) => {
  const parent = pageLeavingElements.find((candidate) => candidate.start === element.parentStart);
  return (
    readTagAttribute(parent?.openingTag ?? '', 'th:if') === expectedWalineLeavingCondition &&
    readTagAttribute(element.openingTag, 'id') === 'waline-leaving'
  );
});
const findPageLeavingScriptById = (id) =>
  pageLeavingElements.filter(
    (element) => element.name === 'script' && readTagAttribute(element.openingTag, 'id') === id
  );
const defaultDraggabillyElements = findPageLeavingScriptById('joe-leaving-default-draggabilly');
const defaultRuntimeElements = findPageLeavingScriptById('joe-leaving-default-runtime');
const defaultDraggabillyElement =
  defaultDraggabillyElements.length === 1 ? defaultDraggabillyElements[0] : null;
const defaultRuntimeElement =
  defaultRuntimeElements.length === 1 ? defaultRuntimeElements[0] : null;
const defaultResourceGuard = defaultDraggabillyElement
  ? pageLeavingElements.find((element) => element.start === defaultDraggabillyElement.parentStart)
  : null;
const defaultResourceSourceBlock = defaultResourceGuard
  ? pageLeavingElements.find((element) => element.start === defaultResourceGuard.parentStart)
  : null;
const defaultResourceChildren = defaultResourceGuard
  ? pageLeavingElements
      .filter((element) => element.parentStart === defaultResourceGuard.start)
      .sort((left, right) => left.start - right.start)
  : [];
const draggabillyPath = 'assets/lib/draggabilly/draggabilly.min.js';
const leavingRuntimePath = 'assets/js/min/leaving.min.js';
const draggabillySpecification = {
  path: draggabillyPath,
  sourceAttributes: ['th:src', 'src'],
};
const globalDraggabillyScripts = firstPartyResourceLoaders.flatMap(({ path, externalScriptTags }) =>
  externalScriptTags
    .filter((tag) => readExternalScriptSource(tag)?.includes(draggabillyPath))
    .map((tag) => ({ path, tag }))
);
const globalLeavingRuntimeScripts = firstPartyResourceLoaders.flatMap(
  ({ path, externalScriptTags }) =>
    externalScriptTags
      .filter((tag) => readExternalScriptSource(tag)?.includes(leavingRuntimePath))
      .map((tag) => ({ path, tag }))
);
const globalMarkedScripts = firstPartyResourceLoaders.flatMap(({ path, externalScriptTags }) =>
  externalScriptTags
    .filter((tag) => readExternalScriptSource(tag)?.includes('assets/lib/j-marked/marked.min.js'))
    .map((tag) => ({ path, tag }))
);
if (
  leavingListElements.length !== 2 ||
  defaultLeavingLists.length !== 1 ||
  walineLeavingLists.length !== 1 ||
  defaultDraggabillyElements.length !== 1 ||
  defaultRuntimeElements.length !== 1 ||
  defaultResourceGuard?.name !== 'th:block' ||
  readTagAttribute(defaultResourceGuard.openingTag, 'th:if') !== expectedDefaultLeavingCondition ||
  !hasOnlyAllowedThymeleafAttributes(defaultResourceGuard?.openingTag ?? '', ['th:if']) ||
  defaultRuntimeElement?.parentStart !== defaultResourceGuard?.start ||
  defaultResourceChildren.length !== 2 ||
  defaultResourceChildren[0]?.start !== defaultDraggabillyElement?.start ||
  defaultResourceChildren[1]?.start !== defaultRuntimeElement?.start ||
  defaultResourceSourceBlock?.name !== 'th:block' ||
  !hasOnlyAllowedThymeleafAttributes(defaultResourceSourceBlock?.openingTag ?? '', ['th:with']) ||
  normalizeMarkupExpression(
    readTagAttribute(defaultResourceSourceBlock?.openingTag ?? '', 'th:with')
  ) !== normalizeMarkupExpression(expectedSourceLinkBinding) ||
  !tagLoadsResource(defaultDraggabillyElement?.openingTag ?? '', draggabillySpecification) ||
  !tagLoadsVersionedResource(defaultRuntimeElement?.openingTag ?? '', leavingRuntimePath) ||
  !hasSafeExecutableScriptAttributes(defaultDraggabillyElement?.openingTag ?? '') ||
  !hasSafeExecutableScriptAttributes(defaultRuntimeElement?.openingTag ?? '') ||
  globalDraggabillyScripts.length !== 1 ||
  globalDraggabillyScripts[0].path !== pageLeavingTemplatePath ||
  globalLeavingRuntimeScripts.length !== 1 ||
  globalLeavingRuntimeScripts[0].path !== pageLeavingTemplatePath ||
  globalMarkedScripts.length !== 0
) {
  throw new Error(
    `${pageLeavingTemplatePath}: only the default leaving branch may statically load one deferred Draggabilly script followed by one versioned leaving runtime; marked must have zero active loaders`
  );
}
const walineRuntimeScripts = pageLeavingElements.filter(
  (element) =>
    element.name === 'script' &&
    readExternalScriptSource(element.openingTag) == null &&
    pageLeavingTemplate
      .slice(element.contentStart, element.contentEnd)
      .includes('loadLeavingResource')
);
const walineRuntimeScript = walineRuntimeScripts.length === 1 ? walineRuntimeScripts[0] : null;
const walineRuntimeGuard = walineRuntimeScript
  ? pageLeavingElements.find((element) => element.start === walineRuntimeScript.parentStart)
  : null;
const walineRuntimeBody = walineRuntimeScript
  ? pageLeavingTemplate.slice(walineRuntimeScript.contentStart, walineRuntimeScript.contentEnd)
  : '';
const walineRuntimeAst = walineRuntimeBody
  ? parseAst(walineRuntimeBody, { sourceType: 'script' }, pageLeavingTemplatePath)
  : null;
const walineDeclarators = [];
const walineAwaits = [];
const walineFetchCalls = [];
const walineThenCalls = [];
const walineCatchCalls = [];
const walineInnerHTMLAssignments = [];
const walineScriptElementCreations = [];
const walineLoaderAssignments = [];
const walineLoaderEvents = [];
const walineLoaderAppends = [];
const walineResponseGuards = [];
const walinePromises = [];
walkEffectAst(walineRuntimeAst, (node) => {
  if (node.type === 'VariableDeclarator') walineDeclarators.push(node);
  if (
    node.type === 'NewExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === 'Promise'
  ) {
    walinePromises.push(node);
  }
  if (node.type === 'AwaitExpression') walineAwaits.push(node);
  if (
    node.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === 'fetch'
  ) {
    walineFetchCalls.push(node);
  }
  if (node.type === 'CallExpression' && readEffectPropertyName(node.callee?.property) === 'then') {
    walineThenCalls.push(node);
  }
  if (node.type === 'CallExpression' && readEffectPropertyName(node.callee?.property) === 'catch') {
    walineCatchCalls.push(node);
  }
  if (
    node.type === 'AssignmentExpression' &&
    readEffectPropertyName(node.left?.property) === 'innerHTML'
  ) {
    walineInnerHTMLAssignments.push(node);
  }
  if (
    node.type === 'CallExpression' &&
    isEffectMember(node.callee, 'document', 'createElement') &&
    readEffectStaticString(node.arguments?.[0]) === 'script'
  ) {
    walineScriptElementCreations.push(node);
  }
  if (
    node.type === 'AssignmentExpression' &&
    node.left?.type === 'MemberExpression' &&
    node.left.object?.type === 'Identifier' &&
    node.left.object.name === 'script'
  ) {
    walineLoaderAssignments.push(node);
  }
  if (
    node.type === 'CallExpression' &&
    node.callee?.type === 'MemberExpression' &&
    node.callee.object?.type === 'Identifier' &&
    node.callee.object.name === 'script' &&
    readEffectPropertyName(node.callee.property) === 'addEventListener'
  ) {
    walineLoaderEvents.push(node);
  }
  if (
    node.type === 'CallExpression' &&
    node.callee?.type === 'MemberExpression' &&
    readEffectPropertyName(node.callee.property) === 'appendChild' &&
    node.arguments?.[0]?.type === 'Identifier' &&
    node.arguments[0].name === 'script'
  ) {
    walineLoaderAppends.push(node);
  }
  if (
    node.type === 'IfStatement' &&
    node.test?.type === 'UnaryExpression' &&
    node.test.operator === '!' &&
    isEffectMember(node.test.argument, 'response', 'ok') &&
    node.consequent?.type === 'ThrowStatement'
  ) {
    walineResponseGuards.push(node);
  }
});
const readWalineDeclarator = (name) =>
  walineDeclarators.filter(
    (declaration) => declaration.id?.type === 'Identifier' && declaration.id.name === name
  );
const draggabillyUrlDeclarators = readWalineDeclarator('draggabillyURL');
const leavingUrlDeclarators = readWalineDeclarator('leavingURL');
const loaderDeclarators = readWalineDeclarator('loadLeavingResource');
const readWalineBinding = (declarators) =>
  declarators.length === 1
    ? walineRuntimeBody.slice(declarators[0].id.end, declarators[0].init.start).replace(/\s+/g, '')
    : '';
const walineThenCallback =
  walineThenCalls.length === 1 && walineThenCalls[0].arguments?.length === 1
    ? walineThenCalls[0].arguments[0]
    : null;
const walineCatchCallback =
  walineCatchCalls.length === 1 && walineCatchCalls[0].arguments?.length === 1
    ? walineCatchCalls[0].arguments[0]
    : null;
const walineTargetAssignments = walineInnerHTMLAssignments.filter((assignment) => {
  const lookup = assignment.left?.object;
  return (
    lookup?.type === 'CallExpression' &&
    isEffectMember(lookup.callee, 'document', 'getElementById') &&
    readEffectStaticString(lookup.arguments?.[0]) === 'waline-leaving'
  );
});
const walineInnerHTMLAssignment =
  walineTargetAssignments.length === 1 ? walineTargetAssignments[0] : null;
const walineLoaderAwaits = walineAwaits.filter(
  (awaitNode) =>
    awaitNode.argument?.type === 'CallExpression' &&
    awaitNode.argument.callee?.type === 'Identifier' &&
    awaitNode.argument.callee.name === 'loadLeavingResource'
);
const walineAwaitArguments = walineLoaderAwaits.map((awaitNode) => awaitNode.argument.arguments);
const loaderAssignmentProperties = new Map(
  walineLoaderAssignments.map((assignment) => [
    readEffectPropertyName(assignment.left.property),
    assignment.right,
  ])
);
const loaderEventNames = walineLoaderEvents.map((call) =>
  readEffectStaticString(call.arguments?.[0])
);
const walineTargetLookup = walineInnerHTMLAssignment?.left?.object;
const walinePromiseExecutor =
  walinePromises.length === 1 && walinePromises[0].arguments?.length === 1
    ? walinePromises[0].arguments[0]
    : null;
const walineAppendTarget = walineLoaderAppends[0]?.callee?.object;
if (
  walineRuntimeScripts.length !== 1 ||
  readTagAttribute(walineRuntimeScript?.openingTag ?? '', 'th:inline') !== 'javascript' ||
  normalizeMarkupExpression(readTagAttribute(walineRuntimeScript?.openingTag ?? '', 'th:with')) !==
    normalizeMarkupExpression(expectedSourceLinkBinding) ||
  walineRuntimeGuard?.name !== 'th:block' ||
  readTagAttribute(walineRuntimeGuard?.openingTag ?? '', 'th:if') !==
    expectedWalineLeavingCondition ||
  draggabillyUrlDeclarators.length !== 1 ||
  readEffectStaticString(draggabillyUrlDeclarators[0].init) !== '' ||
  readWalineBinding(draggabillyUrlDeclarators) !==
    "=/*[[${source_link+'/assets/lib/draggabilly/draggabilly.min.js'}]]*/" ||
  leavingUrlDeclarators.length !== 1 ||
  readEffectStaticString(leavingUrlDeclarators[0].init) !== '' ||
  readWalineBinding(leavingUrlDeclarators) !==
    "=/*[[${source_link+'/assets/js/min/leaving.min.js?v='+theme.spec.version}]]*/" ||
  loaderDeclarators.length !== 1 ||
  loaderDeclarators[0].init?.type !== 'ArrowFunctionExpression' ||
  loaderDeclarators[0].init.params?.length !== 2 ||
  loaderDeclarators[0].init.params[0]?.name !== 'id' ||
  loaderDeclarators[0].init.params[1]?.name !== 'src' ||
  walinePromises.length !== 1 ||
  loaderDeclarators[0].init.body !== walinePromises[0] ||
  walinePromiseExecutor?.type !== 'ArrowFunctionExpression' ||
  walinePromiseExecutor.params?.length !== 2 ||
  walinePromiseExecutor.params[0]?.name !== 'resolve' ||
  walinePromiseExecutor.params[1]?.name !== 'reject' ||
  walineScriptElementCreations.length !== 1 ||
  loaderAssignmentProperties.size !== 3 ||
  loaderAssignmentProperties.get('id')?.type !== 'Identifier' ||
  loaderAssignmentProperties.get('id').name !== 'id' ||
  loaderAssignmentProperties.get('src')?.type !== 'Identifier' ||
  loaderAssignmentProperties.get('src').name !== 'src' ||
  loaderAssignmentProperties.get('async')?.type !== 'Literal' ||
  loaderAssignmentProperties.get('async').value !== false ||
  loaderEventNames.length !== 2 ||
  loaderEventNames[0] !== 'load' ||
  loaderEventNames[1] !== 'error' ||
  walineLoaderEvents[0]?.arguments?.[1]?.name !== 'resolve' ||
  walineLoaderEvents[1]?.arguments?.[1]?.name !== 'reject' ||
  walineLoaderEvents.some(
    (call) =>
      call.arguments?.[2]?.type !== 'ObjectExpression' ||
      call.arguments[2].properties?.length !== 1 ||
      readEffectPropertyName(call.arguments[2].properties[0]?.key) !== 'once' ||
      call.arguments[2].properties[0]?.value?.value !== true
  ) ||
  walineLoaderAppends.length !== 1 ||
  walineAppendTarget?.type !== 'MemberExpression' ||
  !isEffectMember(walineAppendTarget, 'document', 'body') ||
  walineFetchCalls.length !== 1 ||
  walineResponseGuards.length !== 1 ||
  walineThenCalls.length !== 1 ||
  walineThenCalls[0].callee?.object !== walineFetchCalls[0] ||
  walineThenCallback?.type !== 'ArrowFunctionExpression' ||
  walineThenCallback.async !== true ||
  walineCatchCalls.length !== 1 ||
  walineCatchCalls[0].callee?.object !== walineThenCalls[0] ||
  walineCatchCallback?.type !== 'ArrowFunctionExpression' ||
  walineCatchCallback.body?.type !== 'BlockStatement' ||
  walineCatchCallback.body.body?.length !== 0 ||
  walineTargetAssignments.length !== 1 ||
  !(defaultLeavingLists[0].end < defaultDraggabillyElement.start) ||
  !(walineLeavingLists[0].end < walineRuntimeScript.start) ||
  walineTargetLookup?.type !== 'CallExpression' ||
  !isEffectMember(walineTargetLookup.callee, 'document', 'getElementById') ||
  readEffectStaticString(walineTargetLookup.arguments?.[0]) !== 'waline-leaving' ||
  walineLoaderAwaits.length !== 2 ||
  walineAwaitArguments[0]?.length !== 2 ||
  readEffectStaticString(walineAwaitArguments[0][0]) !== 'joe-leaving-waline-draggabilly' ||
  walineAwaitArguments[0][1]?.type !== 'Identifier' ||
  walineAwaitArguments[0][1].name !== 'draggabillyURL' ||
  walineAwaitArguments[1]?.length !== 2 ||
  readEffectStaticString(walineAwaitArguments[1][0]) !== 'joe-leaving-waline-runtime' ||
  walineAwaitArguments[1][1]?.type !== 'Identifier' ||
  walineAwaitArguments[1][1].name !== 'leavingURL' ||
  !(walineInnerHTMLAssignment.end < walineLoaderAwaits[0].start) ||
  !(walineLoaderAwaits[0].end < walineLoaderAwaits[1].start) ||
  walineLoaderAwaits.some(
    (node) => !(walineThenCallback.start < node.start && node.end < walineThenCallback.end)
  )
) {
  throw new Error(
    `${pageLeavingTemplatePath}: Waline must insert its leaving DOM before sequentially loading Draggabilly and the versioned leaving runtime exactly once, with a non-breaking fetch/script error path`
  );
}
const postMetaTemplatePath = 'templates/modules/postMetaVariable.html';
const postMetaTemplate = readFileSync(resolve(postMetaTemplatePath), 'utf8');
const postMetaElements = activeTemplateElements.get('modules/postMetaVariable.html') ?? [];
const postMetaScripts = postMetaElements.filter(
  (element) =>
    element.name === 'script' && readTagAttribute(element.openingTag, 'id') === 'post-meta-variable'
);
const postMetaScript = postMetaScripts.length === 1 ? postMetaScripts[0] : null;
const postMetaFragment = postMetaScript
  ? postMetaElements.find((element) => element.start === postMetaScript.parentStart)
  : null;
const postMetaScriptBody = postMetaScript
  ? postMetaTemplate.slice(postMetaScript.contentStart, postMetaScript.contentEnd)
  : '';
const postMetaAst = postMetaScriptBody
  ? parseAst(postMetaScriptBody, { sourceType: 'script' }, postMetaTemplatePath)
  : null;
const pageAttrsDeclarators =
  postMetaAst?.body.flatMap((statement) =>
    statement.type === 'VariableDeclaration' && statement.kind === 'const'
      ? statement.declarations.filter(
          (declaration) =>
            declaration.id?.type === 'Identifier' && declaration.id.name === 'PageAttrs'
        )
      : []
  ) ?? [];
const pageAttrsObject =
  pageAttrsDeclarators.length === 1 && pageAttrsDeclarators[0].init?.type === 'ObjectExpression'
    ? pageAttrsDeclarators[0].init
    : null;
const tocMetaProperties =
  pageAttrsObject?.properties.filter(
    (property) =>
      property.type === 'Property' && readEffectPropertyName(property.key) === 'metas_enable_toc'
  ) ?? [];
const tocMetaProperty = tocMetaProperties.length === 1 ? tocMetaProperties[0] : null;
const tocMetaBinding = tocMetaProperty
  ? postMetaScriptBody.slice(tocMetaProperty.key.end, tocMetaProperty.value.start)
  : '';
if (
  postMetaScripts.length !== 1 ||
  readTagAttribute(postMetaScript?.openingTag ?? '', 'th:inline') !== 'javascript' ||
  readExternalScriptSource(postMetaScript?.openingTag ?? '') != null ||
  postMetaFragment?.name !== 'th:block' ||
  readTagAttribute(postMetaFragment.openingTag, 'th:fragment') !== 'postSetting' ||
  pageAttrsDeclarators.length !== 1 ||
  tocMetaProperties.length !== 1 ||
  tocMetaProperty?.value?.type !== 'Literal' ||
  tocMetaProperty.value.value !== true ||
  !/^\s*:\s*\/\*\[\[\$\{#annotations\.getOrDefault\(post,\s*'enable_toc',\s*'true'\)\}\]\]\*\/\s*$/.test(
    tocMetaBinding
  )
) {
  throw new Error(
    `${postMetaTemplatePath}: active PageAttrs.metas_enable_toc must read Post enable_toc with the true fallback`
  );
}
const expectedQrcodeConsumers = [
  {
    path: 'modules/post_operate.html',
    shareCondition:
      "${theme.config.post.enable_share} and ${#annotations.getOrDefault(post, 'enable_share', 'true')}",
  },
  {
    path: 'modules/post_operate_aside.html',
    shareCondition:
      "${theme.config.post.enable_share} and ${#annotations.getOrDefault(post, 'enable_share', 'true')}",
  },
];
const qrcodeDomConsumers = [...activeTemplateElements].flatMap(([path, elements]) =>
  elements
    .filter((element) =>
      (readTagAttribute(element.openingTag, 'class') ?? '').split(/\s+/).includes('qrcode_wx')
    )
    .map((element) => ({ element, elements, path }))
);
const qrcodeDomConsumersAreExact =
  qrcodeDomConsumers.length === expectedQrcodeConsumers.length &&
  expectedQrcodeConsumers.every(({ path, shareCondition }) => {
    const matches = qrcodeDomConsumers.filter((consumer) => consumer.path === path);
    if (matches.length !== 1 || matches[0].element.name !== 'span') return false;
    const ancestorConditions = matches[0].element.ancestorStarts
      .map((start) => matches[0].elements.find((element) => element.start === start))
      .filter(Boolean)
      .map((element) => readTagAttribute(element.openingTag, 'th:if'))
      .filter(Boolean);
    return (
      ancestorConditions.includes(shareCondition) &&
      ancestorConditions.includes('${theme.config.post.enable_share_weixin}')
    );
  });
const validateTocRuntime = (script, label) => {
  const ast = parseAst(script, { sourceType: 'script' }, label);
  const initTocProperties = [];
  walkEffectAst(ast, (node) => {
    if (
      node.type === 'Property' &&
      readEffectPropertyName(node.key) === 'initToc' &&
      node.value?.type === 'FunctionExpression'
    ) {
      initTocProperties.push(node);
    }
  });
  const initTocProperty = initTocProperties.length === 1 ? initTocProperties[0] : null;
  const firstStatement = initTocProperty?.value?.body?.body?.[0];
  const guardNodes =
    firstStatement?.type === 'IfStatement' ? flattenEffectOr(firstStatement.test) : [];
  const pageAttrsGuard = guardNodes[0];
  const themeGuard = guardNodes[1];
  const domGuard = guardNodes[2];
  const pageAttrsTocMembers = [];
  const pageAttrsCommentMembers = [];
  walkEffectAst(initTocProperty?.value?.body, (node) => {
    if (isEffectMember(node, 'PageAttrs', 'metas_enable_toc')) pageAttrsTocMembers.push(node);
    if (isEffectMember(node, 'PageAttrs', 'metas_enable_comment')) {
      pageAttrsCommentMembers.push(node);
    }
  });
  const selectorLength = domGuard?.argument;
  const selectorCall = selectorLength?.object;
  const guardIsExact =
    guardNodes.length === 3 &&
    pageAttrsGuard?.type === 'BinaryExpression' &&
    pageAttrsGuard.operator === '===' &&
    pageAttrsGuard.left === pageAttrsTocMembers[0] &&
    readEffectStaticString(pageAttrsGuard.right) === 'false' &&
    themeGuard?.type === 'UnaryExpression' &&
    themeGuard.operator === '!' &&
    isEffectMember(themeGuard.argument, 'ThemeConfig', 'enable_toc') &&
    domGuard?.type === 'UnaryExpression' &&
    domGuard.operator === '!' &&
    selectorLength?.type === 'MemberExpression' &&
    !selectorLength.computed &&
    readEffectPropertyName(selectorLength.property) === 'length' &&
    selectorCall?.type === 'CallExpression' &&
    selectorCall.callee?.type === 'Identifier' &&
    selectorCall.callee.name === '$' &&
    selectorCall.arguments?.length === 1 &&
    readEffectStaticString(selectorCall.arguments[0]) === '.toc-container';
  if (
    initTocProperties.length !== 1 ||
    pageAttrsTocMembers.length !== 1 ||
    pageAttrsCommentMembers.length !== 0 ||
    !guardIsExact ||
    firstStatement.consequent?.type !== 'ReturnStatement' ||
    firstStatement.consequent.argument != null ||
    firstStatement.alternate != null
  ) {
    throw new Error(
      `${label}: initToc must start with the exact PageAttrs.metas_enable_toc, global setting and TOC DOM guard`
    );
  }
};
validateTocRuntime(postScript, postScriptPath);
if (sourcePostMinScript != null) {
  validateTocRuntime(sourcePostMinScript.toString('utf8'), postMinScriptPath);
}
const validateQrcodeRuntime = (script, label) => {
  const ast = parseAst(script, { sourceType: 'script' }, label);
  const initShareProperties = [];
  walkEffectAst(ast, (node) => {
    if (
      node.type === 'Property' &&
      readEffectPropertyName(node.key) === 'initShare' &&
      node.value?.type === 'FunctionExpression'
    ) {
      initShareProperties.push(node);
    }
  });
  const initShareProperty = initShareProperties.length === 1 ? initShareProperties[0] : null;
  const selectorCalls = [];
  const qrcodeCalls = [];
  const selectorLengthMembers = [];
  const weixinGuards = [];
  const isQrcodeSelectorCall = (node) =>
    node?.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === '$' &&
    node.arguments?.length === 1 &&
    readEffectStaticString(node.arguments[0]) === '.qrcode_wx';
  walkEffectAst(initShareProperty?.value?.body, (node) => {
    if (isQrcodeSelectorCall(node)) selectorCalls.push(node);
    if (
      node.type === 'MemberExpression' &&
      !node.computed &&
      readEffectPropertyName(node.property) === 'length' &&
      isQrcodeSelectorCall(node.object)
    ) {
      selectorLengthMembers.push(node);
    }
    if (isEffectMember(node, 'ThemeConfig', 'enable_share_weixin')) weixinGuards.push(node);
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'MemberExpression' &&
      !node.callee.computed &&
      readEffectPropertyName(node.callee.property) === 'qrcode'
    ) {
      qrcodeCalls.push(node);
    }
  });
  const qrcodeCall = qrcodeCalls.length === 1 ? qrcodeCalls[0] : null;
  const qrcodeReceiver = qrcodeCall?.callee?.object;
  const qrcodeSourceControls = [];
  const qrcodeMinifiedControls = [];
  walkEffectAst(initShareProperty?.value?.body, (node) => {
    if (
      node.type === 'IfStatement' &&
      node.consequent?.type === 'BlockStatement' &&
      node.consequent.body?.length === 1 &&
      node.consequent.body[0]?.type === 'ExpressionStatement' &&
      node.consequent.body[0].expression === qrcodeCall
    ) {
      qrcodeSourceControls.push(node);
    }
    if (node.type === 'LogicalExpression' && node.operator === '&&' && node.right === qrcodeCall) {
      qrcodeMinifiedControls.push(node);
    }
  });
  const sourceControl = qrcodeSourceControls.length === 1 ? qrcodeSourceControls[0] : null;
  const sourceControlIsExact =
    sourceControl?.test?.type === 'LogicalExpression' &&
    sourceControl.test.operator === '&&' &&
    sourceControl.test.left === weixinGuards[0] &&
    sourceControl.test.right === selectorLengthMembers[0] &&
    sourceControl.alternate == null;
  const minifiedControl = qrcodeMinifiedControls.length === 1 ? qrcodeMinifiedControls[0] : null;
  const minifiedControlIsExact =
    minifiedControl?.left?.type === 'LogicalExpression' &&
    minifiedControl.left.operator === '&&' &&
    minifiedControl.left.left === weixinGuards[0] &&
    minifiedControl.left.right === selectorLengthMembers[0];
  if (
    initShareProperties.length !== 1 ||
    selectorCalls.length !== 2 ||
    selectorLengthMembers.length !== 1 ||
    weixinGuards.length !== 1 ||
    qrcodeCalls.length !== 1 ||
    !isQrcodeSelectorCall(qrcodeReceiver) ||
    qrcodeCall.arguments?.length !== 1 ||
    qrcodeCall.arguments[0]?.type !== 'ObjectExpression' ||
    (!sourceControlIsExact && !minifiedControlIsExact)
  ) {
    throw new Error(
      `${label}: initShare must guard and invoke one .qrcode() call on the exact .qrcode_wx selector`
    );
  }
};
validateQrcodeRuntime(postScript, postScriptPath);
if (sourcePostMinScript != null) {
  validateQrcodeRuntime(sourcePostMinScript.toString('utf8'), postMinScriptPath);
}
if (
  globalQrcodeScripts.length !== 1 ||
  globalQrcodeScripts[0].path !== 'templates/modules/macro/tail.html' ||
  qrcodeScriptElements.length !== 1 ||
  globalQrcodeScripts[0].tag !== qrcodeElement?.openingTag ||
  !hasSafeExecutableScriptAttributes(qrcodeElement?.openingTag ?? '') ||
  qrcodeGuard?.name !== 'th:block' ||
  readTagAttribute(qrcodeGuard.openingTag, 'th:if') !== expectedQrcodeCondition ||
  !hasOnlyAllowedThymeleafAttributes(qrcodeGuard.openingTag, ['th:if']) ||
  qrcodeGuard.parentStart !== tailFragmentElement?.start ||
  !qrcodeDomConsumersAreExact
) {
  throw new Error(
    'templates: QR library must load once only for two guarded .qrcode_wx consumers on posts with global, WeChat and per-post share enabled'
  );
}

const expectedBeautyCondition =
  "${#bools.isTrue(theme.config.beauty.enable_big_banner) and (htmlType == 'index' or htmlType == 'tags' or htmlType == 'categories' or htmlType == 'category' or htmlType == 'archives' or htmlType == 'tag' or htmlType == 'links' or (htmlType == 'author' and #bools.isTrue(theme.config.tags.larger_tabs_image)))}";
const expectedBigBannerProducerPaths = [
  'archives.html',
  'author.html',
  'categories.html',
  'category.html',
  'index.html',
  'links.html',
  'page_links.html',
  'tag.html',
  'tags.html',
];
const bigBannerFragmentElements =
  activeTemplateElements
    .get('modules/macro/big_banner.html')
    ?.filter(
      (element) => readTagAttribute(element.openingTag, 'th:fragment') === 'big_banner(title)'
    ) ?? [];
const activeBigBannerIdentityElements = [...activeTemplateElements].flatMap(([path, elements]) =>
  elements
    .filter((element) => readTagAttribute(element.openingTag, 'id') === 'EvanBigBanner')
    .map((element) => ({ element, path }))
);
const activeBigBannerProducers = [...activeTemplateElements].flatMap(([path, elements]) =>
  elements
    .filter((element) =>
      /^\s*~\{modules\/macro\/big_banner\s*::\s*big_banner\(/.test(
        readTagAttribute(element.openingTag, 'th:replace') ?? ''
      )
    )
    .map((element) => ({ element, elements, path }))
);
const actualBigBannerProducerPaths = activeBigBannerProducers.map(({ path }) => path).sort();
const defaultBigBannerProducerCondition = '${theme.config.beauty.enable_big_banner}';
const authorBigBannerProducerCondition =
  '${theme.config.beauty.enable_big_banner} and ${theme.config.tags.larger_tabs_image == true}';
const bigBannerProducerConditionsAreExact = activeBigBannerProducers.every(
  ({ element, elements, path }) => {
    const conditions = [element.start, ...element.ancestorStarts]
      .map((start) => elements.find((candidate) => candidate.start === start))
      .filter(Boolean)
      .map((candidate) => readTagAttribute(candidate.openingTag, 'th:if'))
      .filter(Boolean);
    return conditions.includes(
      path === 'author.html' ? authorBigBannerProducerCondition : defaultBigBannerProducerCondition
    );
  }
);
if (
  bigBannerFragmentElements.length !== 1 ||
  activeBigBannerIdentityElements.length !== 1 ||
  activeBigBannerIdentityElements[0].path !== 'modules/macro/big_banner.html' ||
  !activeBigBannerIdentityElements[0].element.ancestorStarts.includes(
    bigBannerFragmentElements[0].start
  ) ||
  actualBigBannerProducerPaths.join('\n') !== expectedBigBannerProducerPaths.join('\n') ||
  !bigBannerProducerConditionsAreExact
) {
  throw new Error(
    `templates: one active EvanBigBanner element must remain in its fragment; the producer set must stay ${expectedBigBannerProducerPaths.join(', ')}, each producer must keep its enable_big_banner guard, and author.html must also require larger_tabs_image; got ${actualBigBannerProducerPaths.join(', ')}`
  );
}
const expectedBeautyStyleCondition =
  "${htmlType == 'links' or (#bools.isTrue(theme.config.beauty.enable_big_banner) and (htmlType == 'index' or htmlType == 'tags' or htmlType == 'categories' or htmlType == 'category' or htmlType == 'archives' or htmlType == 'tag' or (htmlType == 'author' and #bools.isTrue(theme.config.tags.larger_tabs_image))))}";
const beautyStylesheetPath = 'assets/css/min/beauty.min.css';
const beautyStylesheetElements = linkMarkupElements.filter(
  (element) =>
    element.name === 'link' && tagLoadsVersionedStylesheet(element.openingTag, beautyStylesheetPath)
);
const beautyStylesheetElement =
  beautyStylesheetElements.length === 1 ? beautyStylesheetElements[0] : null;
const beautyStylesheetGuard = beautyStylesheetElement
  ? linkMarkupElements.find((element) => element.start === beautyStylesheetElement.parentStart)
  : null;
const globalBeautyStylesheets = firstPartyResourceLoaders.flatMap(({ path, resourceAttributes }) =>
  resourceAttributes
    .filter(({ value }) => value.includes(beautyStylesheetPath))
    .map((resource) => ({ path, resource }))
);
if (
  globalBeautyStylesheets.length !== 1 ||
  globalBeautyStylesheets[0].path !== 'templates/modules/link.html' ||
  beautyStylesheetElements.length !== 1 ||
  readTagAttribute(beautyStylesheetElement?.openingTag ?? '', 'rel') !== 'preload stylesheet' ||
  readTagAttribute(beautyStylesheetElement?.openingTag ?? '', 'as') !== 'style' ||
  !hasOnlyAllowedThymeleafAttributes(beautyStylesheetElement?.openingTag ?? '', ['th:href']) ||
  beautyStylesheetGuard?.name !== 'th:block' ||
  readTagAttribute(beautyStylesheetGuard.openingTag, 'th:if') !== expectedBeautyStyleCondition ||
  !hasOnlyAllowedThymeleafAttributes(beautyStylesheetGuard.openingTag, ['th:if']) ||
  beautyStylesheetGuard.parentStart !== linkFragmentElement?.start
) {
  throw new Error(
    'templates/modules/link.html: versioned Beauty CSS must load only for its banner pages while remaining available to links cards'
  );
}
const beautyScriptElements = markupElements.filter(
  (element) =>
    element.name === 'script' &&
    tagLoadsVersionedResource(element.openingTag, 'assets/js/min/beauty.min.js')
);
const globalBeautyScripts = firstPartyResourceLoaders.flatMap(({ path, externalScriptTags }) =>
  externalScriptTags
    .filter((tag) => readExternalScriptSource(tag)?.includes('assets/js/min/beauty.min.js'))
    .map((tag) => ({ path, tag }))
);
const beautyScriptElement = beautyScriptElements.length === 1 ? beautyScriptElements[0] : null;
const beautyScriptGuard = beautyScriptElement
  ? markupElements.find((element) => element.start === beautyScriptElement.parentStart)
  : null;
const beautyInitElements = markupElements.filter(
  (element) =>
    element.name === 'script' &&
    readExternalScriptSource(element.openingTag) == null &&
    readTagAttribute(element.openingTag, 'th:if') === expectedBeautyCondition &&
    readTagAttribute(element.openingTag, 'th:inline') === 'javascript'
);
const beautyInitElement = beautyInitElements.length === 1 ? beautyInitElements[0] : null;
const beautyInitBody = beautyInitElement
  ? tail.slice(beautyInitElement.contentStart, beautyInitElement.contentEnd)
  : '';
const beautyInitAst = beautyInitBody
  ? parseAst(beautyInitBody, { sourceType: 'script' }, 'Beauty inline initialization')
  : null;
const beautyReadyStatement =
  beautyInitAst?.body?.length === 1 && beautyInitAst.body[0]?.type === 'ExpressionStatement'
    ? beautyInitAst.body[0]
    : null;
const beautyReadyCall = beautyReadyStatement?.expression;
const beautyReadyCallback = beautyReadyCall?.arguments?.[1];
const beautyCallbackStatements =
  beautyReadyCallback?.type === 'ArrowFunctionExpression' &&
  beautyReadyCallback.body?.type === 'BlockStatement'
    ? beautyReadyCallback.body.body
    : [];
const beautyGuardStatement = beautyCallbackStatements[0];
const beautyConstructionStatement = beautyCallbackStatements[1];
const beautyGuardParts =
  beautyGuardStatement?.type === 'IfStatement' ? flattenEffectOr(beautyGuardStatement.test) : [];
const beautyDomLookup = beautyGuardParts[0]?.argument;
const beautyConstructorTypeCheck = beautyGuardParts[1];
const beautyConstruction = beautyConstructionStatement?.expression;
const beautyDomGuardIsExact =
  beautyGuardParts.length === 2 &&
  beautyGuardParts[0]?.type === 'UnaryExpression' &&
  beautyGuardParts[0].operator === '!' &&
  beautyDomLookup?.type === 'CallExpression' &&
  isEffectMember(beautyDomLookup.callee, 'document', 'getElementById') &&
  beautyDomLookup.arguments?.length === 1 &&
  readEffectStaticString(beautyDomLookup.arguments[0]) === 'EvanBigBanner' &&
  beautyConstructorTypeCheck?.type === 'BinaryExpression' &&
  beautyConstructorTypeCheck.operator === '!==' &&
  beautyConstructorTypeCheck.left?.type === 'UnaryExpression' &&
  beautyConstructorTypeCheck.left.operator === 'typeof' &&
  beautyConstructorTypeCheck.left.argument?.type === 'Identifier' &&
  beautyConstructorTypeCheck.left.argument.name === 'EvanBigBanner' &&
  readEffectStaticString(beautyConstructorTypeCheck.right) === 'function' &&
  beautyGuardStatement.consequent?.type === 'ReturnStatement' &&
  beautyGuardStatement.alternate == null;
const beautyConstructionIsExact =
  beautyConstruction?.type === 'NewExpression' &&
  beautyConstruction.callee?.type === 'Identifier' &&
  beautyConstruction.callee.name === 'EvanBigBanner' &&
  beautyConstruction.arguments?.length === 1 &&
  beautyConstruction.arguments[0]?.type === 'ObjectExpression';
if (
  beautyScriptElements.length !== 1 ||
  globalBeautyScripts.length !== 1 ||
  globalBeautyScripts[0].path !== 'templates/modules/macro/tail.html' ||
  globalBeautyScripts[0].tag !== beautyScriptElement?.openingTag ||
  !hasSafeExecutableScriptAttributes(beautyScriptElement?.openingTag ?? '') ||
  beautyScriptGuard?.name !== 'th:block' ||
  readTagAttribute(beautyScriptGuard.openingTag, 'th:if') !== expectedBeautyCondition ||
  !hasOnlyAllowedThymeleafAttributes(beautyScriptGuard.openingTag, ['th:if']) ||
  beautyScriptGuard.parentStart !== tailFragmentElement?.start ||
  beautyInitElements.length !== 1 ||
  !hasOnlyAllowedThymeleafAttributes(beautyInitElement?.openingTag ?? '', ['th:if', 'th:inline']) ||
  beautyInitElement?.parentStart !== tailFragmentElement?.start ||
  !isEffectMember(beautyReadyCall?.callee, 'document', 'addEventListener') ||
  beautyReadyCall.arguments?.length !== 2 ||
  readEffectStaticString(beautyReadyCall.arguments[0]) !== 'DOMContentLoaded' ||
  beautyCallbackStatements.length !== 2 ||
  !beautyDomGuardIsExact ||
  !beautyConstructionIsExact ||
  beautyGuardStatement.start >= beautyConstruction.start ||
  beautyScriptElement.start >= beautyInitElement.start
) {
  throw new Error(
    'templates/modules/macro/tail.html: Beauty must load versioned and initialize after a DOM guard only on pages that render EvanBigBanner'
  );
}
if (externalScripts.some((script) => readExternalScriptSource(script)?.includes('jquery@3.7.1'))) {
  throw new Error('templates/modules/macro/tail.html: jQuery must not be loaded twice');
}
const invalidExternalScripts = externalScripts.filter(
  (script) => isSelfClosingTag(script) || !readTagAttributes(script).has('defer')
);
if (invalidExternalScripts.length > 0) {
  throw new Error(
    `templates/modules/macro/tail.html: all external theme scripts must use closing tags and defer: ${invalidExternalScripts.join(', ')}`
  );
}
const expectedWowCondition =
  "${(htmlType == 'journals' and #bools.isTrue(theme.config.journals.enable_journal_effect)) or (htmlType == 'friends' and #bools.isTrue(theme.config.friends.enable_friend_effect)) or (htmlType == 'index' and #bools.isTrue(theme.config.home.enable_index_list_effect))}";
const wowScriptCount = externalScripts.filter((script) =>
  readExternalScriptSource(script)?.includes('wow.min.js')
).length;
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
  readExternalScriptSource(script)?.includes('assets/effect/bg/strips.js')
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
  !postItem.includes('prioritize = ${iteration.first and') ||
  !postItem.includes("htmlType == 'index'") ||
  !postItem.includes("htmlType == 'category' or htmlType == 'tag'") ||
  !postItem.includes("htmlType == 'author'") ||
  !postItem.includes('theme.config.beauty.enable_big_banner') ||
  !postItem.includes('theme.config.carousel.enable_banner') ||
  !postItem.includes('#lists.isEmpty(theme.config.carousel.banner_data_group)') ||
  !postItem.includes('theme.config.tags.larger_tabs_image') ||
  !postItem.includes("th:class=\"${prioritize ? '' : 'lazyload'}\"") ||
  !postItem.includes('th:data-src="${prioritize ? null : cover}"') ||
  !postItem.includes("th:srcset=\"${prioritize ? thumbnail.gen(cover, 's')") ||
  !postItem.includes("th:data-srcset=\"${prioritize ? null : thumbnail.gen(cover, 's')") ||
  !postItem.includes(expectedPostItemSizes) ||
  !postItem.includes('th:src="${prioritize ? cover : (theme.config.home.lazyload_thumbnail') ||
  !postItem.includes(
    "th:attr=\"loading=${prioritize ? 'eager' : 'lazy'},fetchpriority=${prioritize ? 'high' : null},decoding=${prioritize ? null : 'async'}\""
  ) ||
  (postItem.match(/fetchpriority/g)?.length ?? 0) !== 1
) {
  throw new Error(
    'templates/modules/macro/post_item.html: only the first eligible list cover may load eagerly at high priority; later covers must preserve the lazy responsive pipeline'
  );
}

const bannerTemplate = readFileSync(resolve('templates/modules/macro/banner.html'), 'utf8');
const bannerItemData = readFileSync(
  resolve('templates/modules/macro/banner_item_data.html'),
  'utf8'
);
if (
  (bannerTemplate.match(
    /eager\s*=\s*\$\{bannerIteration\.first and not #bools\.isTrue\(theme\.config\.beauty\.enable_big_banner\)\}/g
  )?.length ?? 0) !== 3 ||
  (bannerItemData.match(/fetchpriority=\$\{(?:eager|prioritize) \? 'high' : null\}/g)?.length ??
    0) !== 3 ||
  (bannerItemData.match(/decoding=\$\{(?:eager|prioritize) \? null : 'async'\}/g)?.length ?? 0) !==
    3 ||
  !bannerItemData.includes('prioritize = ${eager and postIteration.first}')
) {
  throw new Error(
    'templates/modules/macro/banner_item_data.html: without a big hero, exactly one configured first slide may be eager/high while every carousel image decodes asynchronously'
  );
}

const promoteJoeLcpImageSource = commonScript.match(
  /function promoteJoeLcpImage\(root = document\) \{[\s\S]*?\n\}/
)?.[0];
const promoteJoeLcpImage = promoteJoeLcpImageSource
  ? Function(`return (${promoteJoeLcpImageSource})`)()
  : null;
const createPriorityHarnessImage = () => {
  const attributes = new Map([
    ['src', 'placeholder.gif'],
    ['data-src', 'actual.webp'],
    ['data-srcset', 'actual-400.webp 400w, actual-800.webp 800w'],
    ['loading', 'lazy'],
  ]);
  const classes = new Set(['lazyload', 'lazyloading']);
  const operations = [];
  return {
    attributes,
    classes,
    operations,
    classList: {
      remove: (...names) => {
        operations.push(`remove-class:${names.join(',')}`);
        names.forEach((name) => classes.delete(name));
      },
    },
    getAttribute: (name) => attributes.get(name) ?? null,
    removeAttribute: (name) => {
      operations.push(`remove:${name}`);
      attributes.delete(name);
    },
    setAttribute: (name, value) => {
      operations.push(`set:${name}`);
      attributes.set(name, String(value));
    },
  };
};
const createPriorityHarnessRoot = ({ hero = false, high = null, banner = null, list = null }) => ({
  querySelector(selector) {
    if (selector === '#EvanBigBanner') return hero ? {} : null;
    if (selector === 'img[fetchpriority="high"]') return high;
    if (selector === '.joe_index__banner .swiper-slide img') return banner;
    if (selector === '.joe_list__item .thumbnail img') return list;
    return null;
  },
});
const heroCandidate = createPriorityHarnessImage();
const invalidFirstBannerCandidate = createPriorityHarnessImage();
const secondPostCandidate = createPriorityHarnessImage();
const existingHigh = createPriorityHarnessImage();
existingHigh.setAttribute('fetchpriority', 'high');
const existingHighSibling = createPriorityHarnessImage();
const promotedBanner = promoteJoeLcpImage?.(
  createPriorityHarnessRoot({ banner: invalidFirstBannerCandidate })
);
const promotedList = promoteJoeLcpImage?.(createPriorityHarnessRoot({ list: secondPostCandidate }));
const promotionOperations = invalidFirstBannerCandidate.operations;
const removeLazyIndex = promotionOperations.indexOf('remove-class:lazyload,lazyloading');
const setLoadingIndex = promotionOperations.indexOf('set:loading');
const setPriorityIndex = promotionOperations.indexOf('set:fetchpriority');
const setSourceIndex = promotionOperations.indexOf('set:src');
const setSourceSetIndex = promotionOperations.indexOf('set:srcset');
const removeDataSourceIndex = promotionOperations.indexOf('remove:data-src');
const removeDataSourceSetIndex = promotionOperations.indexOf('remove:data-srcset');
if (
  !promoteJoeLcpImage ||
  !commonScript.includes(
    '}\n\npromoteJoeLcpImage(document);\n\nfunction createJoeOverlayScrollState'
  ) ||
  commonScript.includes('\tpromoteLcpImage() {') ||
  promoteJoeLcpImage(createPriorityHarnessRoot({ hero: true, banner: heroCandidate })) !== null ||
  heroCandidate.getAttribute('fetchpriority') != null ||
  promotedBanner !== invalidFirstBannerCandidate ||
  invalidFirstBannerCandidate.getAttribute('src') !== 'actual.webp' ||
  invalidFirstBannerCandidate.getAttribute('srcset') !==
    'actual-400.webp 400w, actual-800.webp 800w' ||
  invalidFirstBannerCandidate.getAttribute('loading') !== 'eager' ||
  invalidFirstBannerCandidate.getAttribute('fetchpriority') !== 'high' ||
  invalidFirstBannerCandidate.getAttribute('data-src') != null ||
  invalidFirstBannerCandidate.getAttribute('data-srcset') != null ||
  invalidFirstBannerCandidate.classes.has('lazyload') ||
  invalidFirstBannerCandidate.classes.has('lazyloading') ||
  removeLazyIndex < 0 ||
  setLoadingIndex <= removeLazyIndex ||
  setPriorityIndex <= removeLazyIndex ||
  setSourceIndex <= setLoadingIndex ||
  setSourceIndex <= setPriorityIndex ||
  setSourceSetIndex <= setLoadingIndex ||
  setSourceSetIndex <= setPriorityIndex ||
  setSourceSetIndex >= setSourceIndex ||
  removeDataSourceIndex <= setSourceIndex ||
  removeDataSourceSetIndex <= setSourceSetIndex ||
  promotedList !== secondPostCandidate ||
  promoteJoeLcpImage(
    createPriorityHarnessRoot({ high: existingHigh, banner: existingHighSibling })
  ) !== null ||
  existingHighSibling.getAttribute('fetchpriority') != null
) {
  throw new Error(
    `${commonScriptPath}: defer-time LCP fallback must run immediately, skip big heroes and existing high-priority images, and set priority before migrating the first actual image source`
  );
}
if (
  sourceCommonMinScript != null &&
  (!sourceCommonMinScript.includes('#EvanBigBanner') ||
    !sourceCommonMinScript.includes('fetchpriority') ||
    !sourceCommonMinScript.includes('data-srcset'))
) {
  throw new Error(`${commonMinScriptPath}: built runtime must contain the verified LCP fallback`);
}

const lazyAsyncImageExpectations = new Map([
  ['templates/categories.html', 1],
  ['templates/friends.html', 1],
  ['templates/links.html', 1],
  ['templates/moment.html', 2],
  ['templates/moments.html', 2],
  ['templates/page.html', 1],
  ['templates/page_leaving.html', 3],
  ['templates/page_links.html', 1],
  ['templates/post.html', 1],
  ['templates/tags.html', 1],
  ['templates/modules/ads/ads_aside.html', 1],
  ['templates/modules/ads/ads_post.html', 1],
  ['templates/modules/common/blogger.html', 6],
  ['templates/modules/common/footer.html', 8],
  ['templates/modules/donate.html', 3],
  ['templates/modules/macro/hot_category.html', 2],
  ['templates/modules/macro/navbar.html', 5],
  ['templates/modules/macro/relate_cards.html', 2],
  ['templates/modules/widgets/asideWidget.html', 3],
]);
for (const [path, expectedCount] of lazyAsyncImageExpectations) {
  const source = maskInactiveMarkup(readFileSync(resolve(path), 'utf8'));
  const imageTags = [...source.matchAll(/<img\b[\s\S]*?>/g)].map((match) => match[0]);
  const lazyAsyncCount = imageTags.filter((tag) => {
    const attributes = readTagAttributes(tag);
    return attributes.get('loading') === 'lazy' && attributes.get('decoding') === 'async';
  }).length;
  if (lazyAsyncCount !== expectedCount) {
    throw new Error(
      `${path}: expected ${expectedCount} non-critical images with loading=lazy and decoding=async, found ${lazyAsyncCount}`
    );
  }
}

const photoImage = photosTemplate.match(/<img\b[^>]*class="lazy-load"[^>]*>/)?.[0];
if (
  !photoImage ||
  !/th:data-src="\$\{photo\.spec\.url\}"/.test(photoImage) ||
  !/th:src="@\{\/assets\/img\/photo_loading\.gif\}"/.test(photoImage) ||
  /\bloading\s*=/.test(photoImage) ||
  /\bdecoding\s*=/.test(photoImage)
) {
  throw new Error(
    'templates/photos.html: gallery images must keep the existing observer pipeline without native loading or decoding attributes'
  );
}

const photosAst = parseAst(photosScript, { sourceType: 'script' });
let photoPageLoaderNode = null;
visitAstNodes(photosAst, (node) => {
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'createPhotoPageLoader') {
    photoPageLoaderNode = node;
  }
});
const createPhotoPageLoader = photoPageLoaderNode
  ? Function(`return (${photosScript.slice(photoPageLoaderNode.start, photoPageLoaderNode.end)})`)()
  : null;
const createPhotoDeferred = () => {
  let resolvePromise;
  const promise = new Promise((resolvePromiseValue) => {
    resolvePromise = resolvePromiseValue;
  });
  return { promise, resolve: resolvePromise };
};
const firstPhotoPage = createPhotoDeferred();
const emptyPhotoPage = createPhotoDeferred();
const requestedPhotoPages = [];
let finishPhotoLoadingCount = 0;
const photoPageLoader = createPhotoPageLoader?.({
  initialPage: 1,
  totalPage: 3,
  fetchPage(page) {
    requestedPhotoPages.push(page);
    return page === 1 ? firstPhotoPage.promise : emptyPhotoPage.promise;
  },
  appendItems() {},
  finish() {
    finishPhotoLoadingCount++;
  },
  onError(error) {
    throw error;
  },
});
const firstPhotoLoad = photoPageLoader?.();
const duplicatePhotoLoad = photoPageLoader?.();
if (!createPhotoPageLoader || requestedPhotoPages.length !== 1) {
  throw new Error(`${photosScriptPath}: concurrent observer callbacks must start only one request`);
}
firstPhotoPage.resolve([{}]);
await Promise.all([firstPhotoLoad, duplicatePhotoLoad]);
const secondPhotoLoad = photoPageLoader();
if (requestedPhotoPages.join(',') !== '1,2') {
  throw new Error(
    `${photosScriptPath}: the next page must remain loadable after the lock releases`
  );
}
emptyPhotoPage.resolve([]);
await secondPhotoLoad;
await photoPageLoader();

let finalPageRequests = 0;
let finalPageFinishCount = 0;
const finalPageLoader = createPhotoPageLoader({
  initialPage: 1,
  totalPage: 1,
  fetchPage() {
    finalPageRequests++;
    return Promise.resolve([{}]);
  },
  appendItems() {},
  finish() {
    finalPageFinishCount++;
  },
  onError(error) {
    throw error;
  },
});
await finalPageLoader();
await finalPageLoader();
let exhaustedPageRequests = 0;
let exhaustedPageFinishCount = 0;
const exhaustedPageLoader = createPhotoPageLoader({
  initialPage: 2,
  totalPage: 1,
  fetchPage() {
    exhaustedPageRequests++;
    return Promise.resolve([{}]);
  },
  appendItems() {},
  finish() {
    exhaustedPageFinishCount++;
  },
  onError(error) {
    throw error;
  },
});
await exhaustedPageLoader();
await exhaustedPageLoader();
if (
  requestedPhotoPages.join(',') !== '1,2' ||
  finishPhotoLoadingCount !== 1 ||
  finalPageRequests !== 1 ||
  finalPageFinishCount !== 1 ||
  exhaustedPageRequests !== 0 ||
  exhaustedPageFinishCount !== 1 ||
  !photosScript.includes('observerForLoading.disconnect()') ||
  !photosScript.includes('loadingIndicator.remove()') ||
  !photosScript.includes('if (!response.ok)')
) {
  throw new Error(
    `${photosScriptPath}: empty and final pages must disconnect pagination, remove its indicator, and prevent later requests`
  );
}

const shouldExpandJournalBlockSource = journalsScript.match(
  /function shouldExpandJournalBlock\(block, threshold\) \{[\s\S]*?\n\}/
)?.[0];
const shouldExpandJournalBlock = shouldExpandJournalBlockSource
  ? Function(`return (${shouldExpandJournalBlockSource})`)()
  : null;
const journalFoldHarnessBlock = {
  scrollHeight: 120,
  getBoundingClientRect: () => ({ height: 120 }),
};
const expanderHarness = { visible: false };
const updateExpanderHarness = () => {
  expanderHarness.visible = shouldExpandJournalBlock?.(journalFoldHarnessBlock, 300) === true;
};
updateExpanderHarness();
const visibleAtWindowLoad = expanderHarness.visible;
journalFoldHarnessBlock.scrollHeight = 420;
updateExpanderHarness();
if (
  !shouldExpandJournalBlock ||
  visibleAtWindowLoad ||
  !expanderHarness.visible ||
  !journalsScript.includes('.on("load.joeJournalFold error.joeJournalFold", update)') ||
  !journalsScript.includes('block.__joeJournalFoldObserver = new ResizeObserver(update)') ||
  !journalsScript.includes('block.__joeJournalFoldObserver.observe(block)') ||
  !journalsScript.includes('$expander.toggle(shouldExpandJournalBlock(block, threshold))') ||
  !journalsScript.includes(
    'window.addEventListener("load", function () {\n\t\tjournalContext.foldBlock();'
  )
) {
  throw new Error(
    `${journalsScriptPath}: fold expander must remeasure idempotently after lazy image load/error and ResizeObserver growth`
  );
}
if (
  sourceJournalsMinScript != null &&
  (!sourceJournalsMinScript.includes('ResizeObserver') ||
    !sourceJournalsMinScript.includes('joeJournalFold'))
) {
  throw new Error(
    `${journalsMinScriptPath}: built runtime must preserve lazy-image fold remeasurement`
  );
}

for (const path of ['templates/page_leaving.html', 'templates/modules/widgets/asideWidget.html']) {
  const source = readFileSync(resolve(path), 'utf8');
  if (
    !source.includes(
      'loading="lazy" decoding="async" onload="Joe.loadedPlaceholderReplaceImg(this, \'AvatarImg\')"'
    )
  ) {
    throw new Error(
      `${path}: dynamically rendered avatar must load lazily and decode asynchronously`
    );
  }
}

const navbar = readFileSync(resolve('templates/modules/macro/navbar.html'), 'utf8');
const navbarLogo = navbar.match(/<img\b[^>]*th:src="\$\{site\.logo\}"[^>]*>/)?.[0];
const loadingTemplate = readFileSync(resolve('templates/modules/macro/loading.html'), 'utf8');
const error404 = readFileSync(resolve('templates/error/404.html'), 'utf8');
if (
  !navbarLogo ||
  /\bloading\s*=/.test(navbarLogo) ||
  /\bloading\s*=/.test(loadingTemplate) ||
  /\bloading\s*=/.test(error404)
) {
  throw new Error(
    'critical logo, loading indicator and 404 illustration must not be delayed with native lazy loading'
  );
}

for (const [script, label, expectedCount] of [
  [commonScript, commonScriptPath, 1],
  [customScript, customScriptPath, 2],
  ...(sourceCommonMinScript == null
    ? []
    : [[sourceCommonMinScript.toString('utf8'), commonMinScriptPath, 1]]),
  ...(sourceCustomMinScript == null
    ? []
    : [[sourceCustomMinScript.toString('utf8'), customMinScriptPath, 2]]),
]) {
  const lazyIframeCount = script.match(/<iframe loading="lazy"/g)?.length ?? 0;
  if (lazyIframeCount !== expectedCount) {
    throw new Error(
      `${label}: expected ${expectedCount} deferred PDF or video iframes with native loading=lazy, found ${lazyIframeCount}`
    );
  }
}

const bigBanner = readFileSync(resolve('templates/modules/macro/big_banner.html'), 'utf8');
const bigBannerVideo = bigBanner.match(/<video\b[\s\S]*?>/)?.[0];
if (
  !bigBannerVideo ||
  !/\bpreload="auto"/.test(bigBannerVideo) ||
  !/\bautoplay=""/.test(bigBannerVideo) ||
  !/\bmuted=""/.test(bigBannerVideo)
) {
  throw new Error(
    'templates/modules/macro/big_banner.html: autoplay hero video must preserve preload=auto and muted playback semantics'
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
  execFileSync(process.execPath, ['--check', resolve(sourceJsDir, file)], {
    stdio: 'pipe',
  });
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
  const packagedRootYamlPaths = packagedFiles
    .filter((path) => !path.includes('/') && /\.ya?ml$/i.test(path))
    .sort();
  if (packagedRootYamlPaths.join('\n') !== expectedRootYamlPaths.join('\n')) {
    throw new Error(
      `${zipPath}: root YAML files must be exactly ${expectedRootYamlPaths.join(', ')}, got ${packagedRootYamlPaths.join(', ')}`
    );
  }
  const packagedRuntimeTextPaths = packagedFiles.filter(
    (path) =>
      ['theme.yaml', settingsPath, annotationSettingsPath].includes(path) ||
      (path.startsWith('templates/') &&
        !path.startsWith('templates/assets/lib/') &&
        /\.(?:html|css|less|js|mjs|yaml|yml)$/.test(path))
  );
  for (const path of packagedRuntimeTextPaths) {
    const packagedSource = execFileSync('unzip', ['-p', zipPath, path], {
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024,
    });
    if (hasForbiddenUpstreamRuntimeReference(packagedSource, path)) {
      throw new Error(
        `${zipPath}: packaged runtime dependency must not reference a retired upstream repository: ${path}`
      );
    }
  }
  for (const path of [...excludedPackagePaths, ...fontAwesomeLegacyFontPaths]) {
    if (packagedFiles.some((file) => file === path || file.startsWith(`${path}/`))) {
      throw new Error(`${zipPath}: excluded package path found: ${path}`);
    }
  }
  for (const [path, source] of guardedPackageSources) {
    if (!packagedFiles.includes(path)) {
      throw new Error(`${zipPath}: missing ${path}`);
    }
    const packagedSource = execFileSync('unzip', ['-p', zipPath, path]);
    if (!packagedSource.equals(source)) {
      throw new Error(`${zipPath}: packaged ${path} does not match the source file`);
    }
  }
  if (!packagedFiles.includes(isotopeLibraryPath)) {
    throw new Error(`${zipPath}: missing ${isotopeLibraryPath}`);
  }
  const packagedIsotopeLibrary = execFileSync('unzip', ['-p', zipPath, isotopeLibraryPath]);
  if (!packagedIsotopeLibrary.equals(sourceIsotopeLibrary)) {
    throw new Error(`${zipPath}: packaged ${isotopeLibraryPath} does not match the source asset`);
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
