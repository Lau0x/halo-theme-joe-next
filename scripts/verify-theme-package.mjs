import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { parseAst } from 'rolldown/parseAst';

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
      { path: 'templates/modules/ads/ads_aside.html', allowedWrappers: [['direct', 1]] },
      { path: 'templates/modules/macro/post_item.html', allowedWrappers: [['direct', 1]] },
      { path: 'templates/modules/macro/relate_cards.html', allowedWrappers: [['direct', 2]] },
    ],
  },
  {
    group: 'carousel',
    setting: 'banner_lazyload_img',
    configPath: bannerConfigPath,
    defaultUrl: bannerDefaultUrl,
    producers: [
      { path: 'templates/modules/macro/banner_item.html', allowedWrappers: [['direct', 1]] },
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
    commonScriptPath,
    postScriptPath,
    'templates/assets/js/utils.js',
    'templates/assets/js/beauty.js',
    'templates/modules/link.html',
    'templates/modules/macro/tail.html',
    ...new Set(placeholderPolicies.flatMap(({ producers }) => producers.map(({ path }) => path))),
  ].map((path) => [path, readFileSync(resolve(path))])
);
if (sourceCustomMinScript != null) {
  guardedPackageSources.set(customMinScriptPath, sourceCustomMinScript);
}
if (sourceCommonMinScript != null) {
  guardedPackageSources.set(commonMinScriptPath, sourceCommonMinScript);
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
const expectedQrcodeConsumers = [
  {
    path: 'modules/post_operate.html',
    shareCondition:
      "${theme.config.post.enable_share} and ${#annotations.get(post, 'enable_share')}",
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
    if (matches.length !== 1 || matches[0].element.name !== 'div') return false;
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
