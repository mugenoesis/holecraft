import { addShape, createEmptyDesign, DEFAULT_PALETTE } from '@holecraft/core';
import type { FastifyInstance } from 'fastify';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from './server.ts';

let dir: string;
let app: FastifyInstance;
const ID = '0123456789abcdef0123456789abcdef';

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'holecraft-migrate-'));
  app = await createServer({ dataDir: dir });
});
afterEach(async () => {
  await app.close();
  await rm(dir, { recursive: true, force: true });
});

/** A design file exactly as the version before palettes saved it: format 1, no palette. */
async function writeOldDesign(): Promise<void> {
  const d = addShape(createEmptyDesign(ID, 'Old design'), 'box', [0, 0], { id: 'a' }).design;
  const old: Record<string, unknown> = { ...d, formatVersion: 1 };
  delete old.palette;
  await mkdir(path.join(dir, 'designs'), { recursive: true });
  await writeFile(path.join(dir, 'designs', `${ID}.json`), JSON.stringify(old));
}

describe('designs saved before palettes existed', () => {
  it('open with the default palette, and keep their shapes', async () => {
    await writeOldDesign();
    const res = await app.inject(`/api/designs/${ID}`);
    expect(res.statusCode).toBe(200);
    const design = res.json();
    expect(design.palette).toEqual([...DEFAULT_PALETTE]);
    expect(design.formatVersion).toBe(2);
    expect(Object.keys(design.nodes)).toEqual(['a']);
  });

  it('still appear in the designs list', async () => {
    await writeOldDesign();
    const list = (await app.inject('/api/designs')).json<{ id: string; name: string }[]>();
    expect(list.map((d) => d.id)).toContain(ID);
  });

  it('are saved in the new format the next time they are saved', async () => {
    await writeOldDesign();
    const design = (await app.inject(`/api/designs/${ID}`)).json();
    const saved = await app.inject({ method: 'PUT', url: `/api/designs/${ID}`, payload: design });
    expect(saved.statusCode).toBe(200);
    const onDisk = JSON.parse(await readFile(path.join(dir, 'designs', `${ID}.json`), 'utf8'));
    expect(onDisk.formatVersion).toBe(2);
    expect(onDisk.palette).toEqual([...DEFAULT_PALETTE]);
  });

  it('a client that still sends no palette is refused clearly, not saved half-formed', async () => {
    await writeOldDesign();
    const design = (await app.inject(`/api/designs/${ID}`)).json();
    delete design.palette;
    const res = await app.inject({ method: 'PUT', url: `/api/designs/${ID}`, payload: design });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/palette/i);
  });
});
