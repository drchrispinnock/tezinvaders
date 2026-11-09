// Octez Connect's packages use Node's global `Buffer` without importing it, so give the
// browser one. This module must be the first import in main.ts so it runs before them.
import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = Buffer;
