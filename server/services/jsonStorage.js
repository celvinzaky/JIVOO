/**
 * server/services/jsonStorage.js
 *
 * DATA SERVICE LAYER
 * -------------------
 * Every read/write to the JSON "database" goes through this module.
 * This is intentional: if JIVOO ever needs to move off flat JSON files
 * (e.g. to SQLite or a hosted DB) later, only this file needs to change -
 * no route or frontend code should ever touch the filesystem directly.
 *
 * Responsibilities:
 *  - Resolve safe paths for system-level and per-client JSON files
 *  - Atomic-ish writes (write to temp file, then rename) to reduce
 *    corruption risk if the process dies mid-write
 *  - Per-file async mutex so concurrent requests don't interleave writes
 *  - Basic CRUD helpers (findAll, findById, insert, update, softDelete)
 *  - Guard against path traversal via client_id / filename inputs
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const config = require('../config/config');

// ---- Per-file mutex -------------------------------------------------
// Minimal promise-chain mutex keyed by absolute file path. Prevents two
// concurrent writes to the same JSON file from racing/corrupting data.
const fileLocks = new Map();

function withLock(absPath, task) {
  const prev = fileLocks.get(absPath) || Promise.resolve();
  const next = prev.then(task, task); // run task regardless of prior outcome
  // Store a settled-catching version so the map's chain never rejects permanently
  fileLocks.set(
    absPath,
    next.catch(() => {})
  );
  return next;
}

// ---- Path safety ------------------------------------------------------
const SAFE_SEGMENT = /^[a-zA-Z0-9_\-]+$/;

function assertSafeSegment(segment, label) {
  if (!segment || !SAFE_SEGMENT.test(segment)) {
    throw new Error(`Invalid ${label}: "${segment}"`);
  }
}

function systemFilePath(fileName) {
  assertSafeSegment(fileName.replace('.json', ''), 'system file name');
  return path.join(config.dataRoot, 'system', fileName);
}

function clientDirPath(clientId) {
  assertSafeSegment(clientId, 'client_id');
  return path.join(config.dataRoot, 'clients', clientId);
}

function clientFilePath(clientId, entity) {
  assertSafeSegment(entity.replace('.json', ''), 'entity name');
  return path.join(clientDirPath(clientId), `${entity.replace('.json', '')}.json`);
}

// ---- Low-level read/write ---------------------------------------------

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function readJsonFile(absPath, defaultValue) {
  try {
    const raw = await fsp.readFile(absPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      if (defaultValue !== undefined) return defaultValue;
      throw new Error(`File not found: ${absPath}`);
    }
    if (err instanceof SyntaxError) {
      throw new Error(`Corrupt JSON in ${absPath}: ${err.message}`);
    }
    throw err;
  }
}

async function writeJsonFile(absPath, data) {
  return withLock(absPath, async () => {
    await ensureDir(path.dirname(absPath));
    const tmpPath = `${absPath}.${process.pid}.${Date.now()}.tmp`;
    const json = JSON.stringify(data, null, 2);
    await fsp.writeFile(tmpPath, json, 'utf-8');
    await fsp.rename(tmpPath, absPath);
    return data;
  });
}

// ---- System-level collections (super admin scope) ---------------------

async function readSystemCollection(fileName) {
  return readJsonFile(systemFilePath(fileName), []);
}

async function writeSystemCollection(fileName, data) {
  return writeJsonFile(systemFilePath(fileName), data);
}

// ---- Client-scoped collections -----------------------------------------

async function readClientCollection(clientId, entity) {
  const filePath = clientFilePath(clientId, entity);
  const defaultValue = entity === 'company' || entity === 'settings' ? {} : [];
  return readJsonFile(filePath, defaultValue);
}

async function writeClientCollection(clientId, entity, data) {
  return writeJsonFile(clientFilePath(clientId, entity), data);
}

async function clientExists(clientId) {
  try {
    await fsp.access(clientDirPath(clientId));
    return true;
  } catch {
    return false;
  }
}

async function createClientDirectory(clientId) {
  assertSafeSegment(clientId, 'client_id');
  await ensureDir(clientDirPath(clientId));
}

// ---- Generic CRUD helpers over an array-based client collection -------

async function findAll(clientId, entity, predicate) {
  const collection = await readClientCollection(clientId, entity);
  if (!Array.isArray(collection)) {
    throw new Error(`Entity "${entity}" is not a collection (array)`);
  }
  return predicate ? collection.filter(predicate) : collection;
}

async function findById(clientId, entity, id, idField = 'id') {
  const collection = await readClientCollection(clientId, entity);
  return (collection || []).find((item) => item[idField] === id) || null;
}

async function insert(clientId, entity, record) {
  return withLock(clientFilePath(clientId, entity), async () => {
    const collection = (await readClientCollection(clientId, entity)) || [];
    if (!Array.isArray(collection)) {
      throw new Error(`Entity "${entity}" is not a collection (array)`);
    }
    collection.push(record);
    await writeJsonFile(clientFilePath(clientId, entity), collection);
    return record;
  });
}

async function update(clientId, entity, id, patch, idField = 'id') {
  return withLock(clientFilePath(clientId, entity), async () => {
    const collection = (await readClientCollection(clientId, entity)) || [];
    const idx = collection.findIndex((item) => item[idField] === id);
    if (idx === -1) return null;
    collection[idx] = {
      ...collection[idx],
      ...patch,
      updated_at: new Date().toISOString(),
    };
    await writeJsonFile(clientFilePath(clientId, entity), collection);
    return collection[idx];
  });
}

// Soft delete only - JIVOO never hard-deletes business-critical records.
async function softDelete(clientId, entity, id, idField = 'id') {
  return update(clientId, entity, {
    status: 'inactive',
    deleted_at: new Date().toISOString(),
  }, idField);
}

module.exports = {
  // paths (exposed for the client-creation flow in Part 2)
  systemFilePath,
  clientDirPath,
  clientFilePath,
  ensureDir,
  // low level
  readJsonFile,
  writeJsonFile,
  // system scope
  readSystemCollection,
  writeSystemCollection,
  // client scope
  readClientCollection,
  writeClientCollection,
  clientExists,
  createClientDirectory,
  // generic CRUD
  findAll,
  findById,
  insert,
  update,
  softDelete,
};
