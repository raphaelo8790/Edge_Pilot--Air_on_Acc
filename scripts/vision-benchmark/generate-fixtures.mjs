import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WIDTH = 256;
const HEIGHT = 256;
const LABELS = [
  'hardhat',
  'safety_vest',
  'gloves',
  'goggles',
  'mask',
  'ladder',
  'safety_cone',
];

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const imageDirectory = path.join(
  repositoryRoot,
  'datasets',
  'vision-benchmark',
  'images'
);
const manifestPath = path.join(
  repositoryRoot,
  'datasets',
  'vision-benchmark',
  'manifest.json'
);

const BACKGROUNDS = [
  [248, 250, 252, 255],
  [238, 242, 255, 255],
  [254, 252, 232, 255],
];

const ACCENTS = [
  [245, 158, 11, 255],
  [249, 115, 22, 255],
  [234, 179, 8, 255],
];

function createCanvas(background) {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);

  for (let index = 0; index < WIDTH * HEIGHT; index += 1) {
    pixels[index * 4] = background[0];
    pixels[index * 4 + 1] = background[1];
    pixels[index * 4 + 2] = background[2];
    pixels[index * 4 + 3] = background[3];
  }

  return pixels;
}

function setPixel(pixels, x, y, color) {
  const roundedX = Math.round(x);
  const roundedY = Math.round(y);

  if (
    roundedX < 0 ||
    roundedY < 0 ||
    roundedX >= WIDTH ||
    roundedY >= HEIGHT
  ) {
    return;
  }

  const offset = (roundedY * WIDTH + roundedX) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function fillRect(pixels, x, y, width, height, color) {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(WIDTH, Math.ceil(x + width));
  const endY = Math.min(HEIGHT, Math.ceil(y + height));

  for (let row = startY; row < endY; row += 1) {
    for (let column = startX; column < endX; column += 1) {
      setPixel(pixels, column, row, color);
    }
  }
}

function fillEllipse(pixels, centerX, centerY, radiusX, radiusY, color) {
  const startX = Math.floor(centerX - radiusX);
  const endX = Math.ceil(centerX + radiusX);
  const startY = Math.floor(centerY - radiusY);
  const endY = Math.ceil(centerY + radiusY);

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const normalizedX = (x - centerX) / radiusX;
      const normalizedY = (y - centerY) / radiusY;

      if (normalizedX ** 2 + normalizedY ** 2 <= 1) {
        setPixel(pixels, x, y, color);
      }
    }
  }
}

function fillPolygon(pixels, points, color) {
  const minimumX = Math.floor(
    Math.min(...points.map((point) => point[0]))
  );
  const maximumX = Math.ceil(
    Math.max(...points.map((point) => point[0]))
  );
  const minimumY = Math.floor(
    Math.min(...points.map((point) => point[1]))
  );
  const maximumY = Math.ceil(
    Math.max(...points.map((point) => point[1]))
  );

  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      let inside = false;

      for (
        let current = 0, previous = points.length - 1;
        current < points.length;
        previous = current, current += 1
      ) {
        const [currentX, currentY] = points[current];
        const [previousX, previousY] = points[previous];
        const intersects =
          currentY > y !== previousY > y &&
          x <
            ((previousX - currentX) * (y - currentY)) /
              (previousY - currentY) +
              currentX;

        if (intersects) {
          inside = !inside;
        }
      }

      if (inside) {
        setPixel(pixels, x, y, color);
      }
    }
  }
}

function drawLine(
  pixels,
  startX,
  startY,
  endX,
  endY,
  thickness,
  color
) {
  const steps = Math.max(
    Math.abs(endX - startX),
    Math.abs(endY - startY)
  );

  for (let step = 0; step <= steps; step += 1) {
    const ratio = steps === 0 ? 0 : step / steps;
    const x = startX + (endX - startX) * ratio;
    const y = startY + (endY - startY) * ratio;
    fillEllipse(
      pixels,
      x,
      y,
      thickness / 2,
      thickness / 2,
      color
    );
  }
}

function drawHardhat(pixels, variant) {
  const offset = (variant - 1) * 6;
  const outline = [71, 85, 105, 255];
  const accent = ACCENTS[variant];
  const domeOutline = [
    [68 + offset, 139],
    [76 + offset, 102],
    [96 + offset, 76],
    [128 + offset, 65],
    [160 + offset, 76],
    [180 + offset, 102],
    [188 + offset, 139],
  ];
  const dome = domeOutline.map(([x, y]) => [x, y + 5]);

  fillPolygon(pixels, domeOutline, outline);
  fillPolygon(pixels, dome, accent);
  fillRect(pixels, 57 + offset, 136, 142, 17, outline);
  fillRect(pixels, 62 + offset, 139, 132, 9, accent);
  fillRect(pixels, 123 + offset, 70, 10, 66, [255, 193, 7, 255]);
}

function drawSafetyVest(pixels, variant) {
  const offset = (variant - 1) * 5;
  const outline = [71, 85, 105, 255];
  const vest = [
    [86 + offset, 62],
    [111 + offset, 51],
    [145 + offset, 51],
    [170 + offset, 62],
    [184 + offset, 191],
    [72 + offset, 191],
  ];

  fillPolygon(pixels, vest, outline);
  fillPolygon(
    pixels,
    vest.map(([x, y]) => [x, y + (y < 80 ? 5 : -5)]),
    [249, 115, 22, 255]
  );
  fillEllipse(
    pixels,
    128 + offset,
    57,
    18,
    22,
    BACKGROUNDS[variant]
  );
  fillEllipse(
    pixels,
    74 + offset,
    91,
    24,
    31,
    BACKGROUNDS[variant]
  );
  fillEllipse(
    pixels,
    182 + offset,
    91,
    24,
    31,
    BACKGROUNDS[variant]
  );
  drawLine(
    pixels,
    103 + offset,
    79,
    93 + offset,
    180,
    9,
    [254, 240, 138, 255]
  );
  drawLine(
    pixels,
    153 + offset,
    79,
    163 + offset,
    180,
    9,
    [254, 240, 138, 255]
  );
  fillRect(
    pixels,
    85 + offset,
    132,
    86,
    11,
    [254, 240, 138, 255]
  );
}

function drawGloves(pixels, variant) {
  const offset = (variant - 1) * 5;
  const glove = [37, 99, 235, 255];
  const outline = [30, 64, 175, 255];

  fillEllipse(pixels, 105 + offset, 146, 42, 47, outline);
  fillRect(pixels, 75 + offset, 113, 61, 66, glove);
  fillEllipse(pixels, 105 + offset, 174, 30, 17, glove);

  for (let finger = 0; finger < 4; finger += 1) {
    const x = 76 + offset + finger * 16;
    const height = 42 + (finger === 1 || finger === 2 ? 10 : 0);
    fillEllipse(pixels, x + 7, 91, 8, 11, outline);
    fillRect(pixels, x, 91, 14, height, glove);
    fillEllipse(pixels, x + 7, 91, 7, 9, glove);
  }

  drawLine(
    pixels,
    77 + offset,
    133,
    55 + offset,
    114,
    18,
    outline
  );
  drawLine(
    pixels,
    78 + offset,
    132,
    58 + offset,
    115,
    13,
    glove
  );
  fillRect(
    pixels,
    71 + offset,
    177,
    68,
    18,
    [29, 78, 216, 255]
  );
}

function drawGoggles(pixels, variant) {
  const offset = (variant - 1) * 4;
  const frame = [30, 41, 59, 255];
  const lens = [56, 189, 248, 255];

  drawLine(
    pixels,
    47 + offset,
    120,
    209 + offset,
    120,
    11,
    frame
  );
  fillEllipse(pixels, 91 + offset, 128, 47, 37, frame);
  fillEllipse(pixels, 165 + offset, 128, 47, 37, frame);
  fillEllipse(pixels, 91 + offset, 128, 37, 27, lens);
  fillEllipse(pixels, 165 + offset, 128, 37, 27, lens);
  fillRect(pixels, 126 + offset, 120, 6, 16, frame);
  fillEllipse(
    pixels,
    78 + offset,
    118,
    8,
    5,
    [224, 242, 254, 255]
  );
  fillEllipse(
    pixels,
    152 + offset,
    118,
    8,
    5,
    [224, 242, 254, 255]
  );
}

function drawMask(pixels, variant) {
  const offset = (variant - 1) * 5;
  const body = [96, 165, 250, 255];
  const outline = [29, 78, 216, 255];

  drawLine(
    pixels,
    71 + offset,
    107,
    43 + offset,
    91,
    5,
    outline
  );
  drawLine(
    pixels,
    71 + offset,
    164,
    43 + offset,
    180,
    5,
    outline
  );
  drawLine(
    pixels,
    185 + offset,
    107,
    213 + offset,
    91,
    5,
    outline
  );
  drawLine(
    pixels,
    185 + offset,
    164,
    213 + offset,
    180,
    5,
    outline
  );
  fillPolygon(
    pixels,
    [
      [67 + offset, 99],
      [128 + offset, 88],
      [189 + offset, 99],
      [180 + offset, 169],
      [128 + offset, 188],
      [76 + offset, 169],
    ],
    outline
  );
  fillPolygon(
    pixels,
    [
      [73 + offset, 105],
      [128 + offset, 95],
      [183 + offset, 105],
      [174 + offset, 164],
      [128 + offset, 181],
      [82 + offset, 164],
    ],
    body
  );
  drawLine(
    pixels,
    91 + offset,
    127,
    165 + offset,
    127,
    3,
    [219, 234, 254, 255]
  );
  drawLine(
    pixels,
    88 + offset,
    145,
    168 + offset,
    145,
    3,
    [219, 234, 254, 255]
  );
}

function drawLadder(pixels, variant) {
  const offset = (variant - 1) * 5;
  const rail = [71, 85, 105, 255];
  const highlight = [148, 163, 184, 255];

  drawLine(
    pixels,
    83 + offset,
    205,
    104 + offset,
    49,
    14,
    rail
  );
  drawLine(
    pixels,
    173 + offset,
    205,
    152 + offset,
    49,
    14,
    rail
  );
  drawLine(
    pixels,
    87 + offset,
    204,
    108 + offset,
    50,
    5,
    highlight
  );
  drawLine(
    pixels,
    169 + offset,
    204,
    148 + offset,
    50,
    5,
    highlight
  );

  for (let rung = 0; rung < 6; rung += 1) {
    const y = 69 + rung * 25;
    const inset = rung * 3;
    drawLine(
      pixels,
      101 + offset - inset,
      y,
      155 + offset + inset,
      y,
      10,
      rail
    );
    drawLine(
      pixels,
      102 + offset - inset,
      y - 1,
      154 + offset + inset,
      y - 1,
      3,
      highlight
    );
  }
}

function drawSafetyCone(pixels, variant) {
  const offset = (variant - 1) * 5;
  const outline = [124, 45, 18, 255];
  const orange = [249, 115, 22, 255];
  const stripe = [255, 247, 237, 255];

  fillRect(pixels, 62 + offset, 186, 132, 22, outline);
  fillRect(pixels, 69 + offset, 190, 118, 12, orange);
  fillPolygon(
    pixels,
    [
      [128 + offset, 43],
      [181 + offset, 190],
      [75 + offset, 190],
    ],
    outline
  );
  fillPolygon(
    pixels,
    [
      [128 + offset, 51],
      [174 + offset, 185],
      [82 + offset, 185],
    ],
    orange
  );
  fillPolygon(
    pixels,
    [
      [105 + offset, 113],
      [151 + offset, 113],
      [160 + offset, 139],
      [96 + offset, 139],
    ],
    stripe
  );
}

const DRAWERS = {
  hardhat: drawHardhat,
  safety_vest: drawSafetyVest,
  gloves: drawGloves,
  goggles: drawGoggles,
  mask: drawMask,
  ladder: drawLadder,
  safety_cone: drawSafetyCone,
};

function crc32(data) {
  let crc = 0xffffffff;

  for (const value of data) {
    crc ^= value;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(data) {
  let a = 1;
  let b = 0;

  for (const value of data) {
    a = (a + value) % 65521;
    b = (b + a) % 65521;
  }

  return ((b << 16) | a) >>> 0;
}

function uint32(value) {
  const output = Buffer.alloc(4);
  output.writeUInt32BE(value >>> 0);
  return output;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const payload = Buffer.from(data);
  const checksum = crc32(Buffer.concat([typeBuffer, payload]));

  return Buffer.concat([
    uint32(payload.length),
    typeBuffer,
    payload,
    uint32(checksum),
  ]);
}

function createStoredDeflate(data) {
  const blocks = [Buffer.from([0x78, 0x01])];

  for (let offset = 0; offset < data.length; offset += 65535) {
    const block = data.subarray(
      offset,
      Math.min(offset + 65535, data.length)
    );
    const isFinal = offset + block.length >= data.length;
    const header = Buffer.alloc(5);

    header[0] = isFinal ? 0x01 : 0x00;
    header.writeUInt16LE(block.length, 1);
    header.writeUInt16LE(0xffff ^ block.length, 3);
    blocks.push(header, Buffer.from(block));
  }

  blocks.push(uint32(adler32(data)));
  return Buffer.concat(blocks);
}

function encodePng(pixels) {
  const raw = Buffer.alloc((WIDTH * 4 + 1) * HEIGHT);

  for (let row = 0; row < HEIGHT; row += 1) {
    const targetOffset = row * (WIDTH * 4 + 1);
    const sourceOffset = row * WIDTH * 4;
    raw[targetOffset] = 0;
    Buffer.from(pixels).copy(
      raw,
      targetOffset + 1,
      sourceOffset,
      sourceOffset + WIDTH * 4
    );
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    createChunk('IHDR', header),
    createChunk('IDAT', createStoredDeflate(raw)),
    createChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createFixtures() {
  mkdirSync(imageDirectory, { recursive: true });
  const generated = [];

  for (const label of LABELS) {
    for (let variant = 0; variant < 3; variant += 1) {
      const pixels = createCanvas(BACKGROUNDS[variant]);
      DRAWERS[label](pixels, variant);
      const fileName = `${label}-${String(variant + 1).padStart(
        2,
        '0'
      )}.png`;
      const absolutePath = path.join(imageDirectory, fileName);
      const image = encodePng(pixels);

      writeFileSync(absolutePath, image);
      generated.push({
        id: fileName.replace('.png', ''),
        imagePath: path
          .relative(repositoryRoot, absolutePath)
          .split(path.sep)
          .join('/'),
        expectedLabel: label,
        sha256: createHash('sha256').update(image).digest('hex'),
      });
    }
  }

  return generated;
}

function verifyManifest(generated) {
  if (!existsSync(manifestPath)) {
    process.stdout.write(`${JSON.stringify(generated, null, 2)}\n`);
    return;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const expected = new Map(
    manifest.samples.map((sample) => [sample.id, sample])
  );

  if (expected.size !== generated.length) {
    throw new Error(
      'The manifest sample count does not match the generated fixtures.'
    );
  }

  for (const generatedSample of generated) {
    const manifestSample = expected.get(generatedSample.id);

    if (
      !manifestSample ||
      manifestSample.imagePath !== generatedSample.imagePath ||
      manifestSample.expectedLabel !== generatedSample.expectedLabel ||
      manifestSample.sha256 !== generatedSample.sha256
    ) {
      throw new Error(
        `Generated fixture verification failed for '${generatedSample.id}'.`
      );
    }
  }

  process.stdout.write(
    `Generated and verified ${generated.length} vision fixtures.\n`
  );
}

verifyManifest(createFixtures());
