#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/ws/lib/constants.js"(exports2, module2) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module2.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: /* @__PURE__ */ Symbol("kIsForOnEventAttribute"),
      kListener: /* @__PURE__ */ Symbol("kListener"),
      kStatusCode: /* @__PURE__ */ Symbol("status-code"),
      kWebSocket: /* @__PURE__ */ Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/ws/lib/buffer-util.js"(exports2, module2) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module2.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = require("bufferutil");
        module2.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module2.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/ws/lib/limiter.js"(exports2, module2) {
    "use strict";
    var kDone = /* @__PURE__ */ Symbol("kDone");
    var kRun = /* @__PURE__ */ Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module2.exports = Limiter;
  }
});

// node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/ws/lib/permessage-deflate.js"(exports2, module2) {
    "use strict";
    var zlib = require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = /* @__PURE__ */ Symbol("permessage-deflate");
    var kTotalLength = /* @__PURE__ */ Symbol("total-length");
    var kCallback = /* @__PURE__ */ Symbol("callback");
    var kBuffers = /* @__PURE__ */ Symbol("buffers");
    var kError = /* @__PURE__ */ Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       * @param {Boolean} [isServer=false] Create the instance in either server or
       *     client mode
       * @param {Number} [maxPayload=0] The maximum allowed message length
       */
      constructor(options, isServer, maxPayload) {
        this._maxPayload = maxPayload | 0;
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._isServer = !!isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module2.exports = PerMessageDeflate;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "node_modules/ws/lib/validation.js"(exports2, module2) {
    "use strict";
    var { isUtf8 } = require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module2.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module2.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = require("utf-8-validate");
        module2.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/ws/lib/receiver.js"(exports2, module2) {
    "use strict";
    var { Writable } = require("stream");
    var PerMessageDeflate = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module2.exports = Receiver2;
  }
});

// node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/ws/lib/sender.js"(exports2, module2) {
    "use strict";
    var { Duplex } = require("stream");
    var { randomFillSync } = require("crypto");
    var PerMessageDeflate = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = /* @__PURE__ */ Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else {
            buf.set(data, 2);
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module2.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/ws/lib/event-target.js"(exports2, module2) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = /* @__PURE__ */ Symbol("kCode");
    var kData = /* @__PURE__ */ Symbol("kData");
    var kError = /* @__PURE__ */ Symbol("kError");
    var kMessage = /* @__PURE__ */ Symbol("kMessage");
    var kReason = /* @__PURE__ */ Symbol("kReason");
    var kTarget = /* @__PURE__ */ Symbol("kTarget");
    var kType = /* @__PURE__ */ Symbol("kType");
    var kWasClean = /* @__PURE__ */ Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module2.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/ws/lib/extension.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension) => {
        let configurations = extensions[extension];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module2.exports = { format, parse };
  }
});

// node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/ws/lib/websocket.js"(exports2, module2) {
    "use strict";
    var EventEmitter3 = require("events");
    var https = require("https");
    var http2 = require("http");
    var net = require("net");
    var tls = require("tls");
    var { randomBytes: randomBytes2, createHash } = require("crypto");
    var { Duplex, Readable: Readable2 } = require("stream");
    var { URL: URL2 } = require("url");
    var PerMessageDeflate = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = /* @__PURE__ */ Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter3 {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate.extensionName]) {
          this._extensions[PerMessageDeflate.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module2.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch (e) {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes2(16).toString("base64");
      const request = isSecure ? https.request : http2.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate(
          opts.perMessageDeflate !== true ? opts.perMessageDeflate : {},
          false,
          opts.maxPayload
        );
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/ws/lib/stream.js"(exports2, module2) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open3() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open3() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module2.exports = createWebSocketStream2;
  }
});

// node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/ws/lib/subprotocol.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module2.exports = { parse };
  }
});

// node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/ws/lib/websocket-server.js"(exports2, module2) {
    "use strict";
    var EventEmitter3 = require("events");
    var http2 = require("http");
    var { Duplex } = require("stream");
    var { createHash } = require("crypto");
    var extension = require_extension();
    var PerMessageDeflate = require_permessage_deflate();
    var subprotocol = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter3 {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http2.createServer((req, res) => {
            const body = http2.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate(
            this.options.perMessageDeflate,
            true,
            this.options.maxPayload
          );
          try {
            const offers = extension.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate.extensionName]);
              extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate.extensionName]) {
          const params = extensions[PerMessageDeflate.extensionName].params;
          const value = extension.format({
            [PerMessageDeflate.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module2.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http2.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http2.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// node_modules/readdirp/esm/index.js
function readdirp(root, options = {}) {
  let type = options.entryType || options.type;
  if (type === "both")
    type = EntryTypes.FILE_DIR_TYPE;
  if (type)
    options.type = type;
  if (!root) {
    throw new Error("readdirp: root argument is required. Usage: readdirp(root, options)");
  } else if (typeof root !== "string") {
    throw new TypeError("readdirp: root argument must be a string. Usage: readdirp(root, options)");
  } else if (type && !ALL_TYPES.includes(type)) {
    throw new Error(`readdirp: Invalid type passed. Use one of ${ALL_TYPES.join(", ")}`);
  }
  options.root = root;
  return new ReaddirpStream(options);
}
var import_promises, import_node_stream, import_node_path, EntryTypes, defaultOptions, RECURSIVE_ERROR_CODE, NORMAL_FLOW_ERRORS, ALL_TYPES, DIR_TYPES, FILE_TYPES, isNormalFlowError, wantBigintFsStats, emptyFn, normalizeFilter, ReaddirpStream;
var init_esm = __esm({
  "node_modules/readdirp/esm/index.js"() {
    import_promises = require("node:fs/promises");
    import_node_stream = require("node:stream");
    import_node_path = require("node:path");
    EntryTypes = {
      FILE_TYPE: "files",
      DIR_TYPE: "directories",
      FILE_DIR_TYPE: "files_directories",
      EVERYTHING_TYPE: "all"
    };
    defaultOptions = {
      root: ".",
      fileFilter: (_entryInfo) => true,
      directoryFilter: (_entryInfo) => true,
      type: EntryTypes.FILE_TYPE,
      lstat: false,
      depth: 2147483648,
      alwaysStat: false,
      highWaterMark: 4096
    };
    Object.freeze(defaultOptions);
    RECURSIVE_ERROR_CODE = "READDIRP_RECURSIVE_ERROR";
    NORMAL_FLOW_ERRORS = /* @__PURE__ */ new Set(["ENOENT", "EPERM", "EACCES", "ELOOP", RECURSIVE_ERROR_CODE]);
    ALL_TYPES = [
      EntryTypes.DIR_TYPE,
      EntryTypes.EVERYTHING_TYPE,
      EntryTypes.FILE_DIR_TYPE,
      EntryTypes.FILE_TYPE
    ];
    DIR_TYPES = /* @__PURE__ */ new Set([
      EntryTypes.DIR_TYPE,
      EntryTypes.EVERYTHING_TYPE,
      EntryTypes.FILE_DIR_TYPE
    ]);
    FILE_TYPES = /* @__PURE__ */ new Set([
      EntryTypes.EVERYTHING_TYPE,
      EntryTypes.FILE_DIR_TYPE,
      EntryTypes.FILE_TYPE
    ]);
    isNormalFlowError = (error) => NORMAL_FLOW_ERRORS.has(error.code);
    wantBigintFsStats = process.platform === "win32";
    emptyFn = (_entryInfo) => true;
    normalizeFilter = (filter) => {
      if (filter === void 0)
        return emptyFn;
      if (typeof filter === "function")
        return filter;
      if (typeof filter === "string") {
        const fl = filter.trim();
        return (entry) => entry.basename === fl;
      }
      if (Array.isArray(filter)) {
        const trItems = filter.map((item) => item.trim());
        return (entry) => trItems.some((f) => entry.basename === f);
      }
      return emptyFn;
    };
    ReaddirpStream = class extends import_node_stream.Readable {
      constructor(options = {}) {
        super({
          objectMode: true,
          autoDestroy: true,
          highWaterMark: options.highWaterMark
        });
        const opts = { ...defaultOptions, ...options };
        const { root, type } = opts;
        this._fileFilter = normalizeFilter(opts.fileFilter);
        this._directoryFilter = normalizeFilter(opts.directoryFilter);
        const statMethod = opts.lstat ? import_promises.lstat : import_promises.stat;
        if (wantBigintFsStats) {
          this._stat = (path7) => statMethod(path7, { bigint: true });
        } else {
          this._stat = statMethod;
        }
        this._maxDepth = opts.depth ?? defaultOptions.depth;
        this._wantsDir = type ? DIR_TYPES.has(type) : false;
        this._wantsFile = type ? FILE_TYPES.has(type) : false;
        this._wantsEverything = type === EntryTypes.EVERYTHING_TYPE;
        this._root = (0, import_node_path.resolve)(root);
        this._isDirent = !opts.alwaysStat;
        this._statsProp = this._isDirent ? "dirent" : "stats";
        this._rdOptions = { encoding: "utf8", withFileTypes: this._isDirent };
        this.parents = [this._exploreDir(root, 1)];
        this.reading = false;
        this.parent = void 0;
      }
      async _read(batch) {
        if (this.reading)
          return;
        this.reading = true;
        try {
          while (!this.destroyed && batch > 0) {
            const par = this.parent;
            const fil = par && par.files;
            if (fil && fil.length > 0) {
              const { path: path7, depth } = par;
              const slice = fil.splice(0, batch).map((dirent) => this._formatEntry(dirent, path7));
              const awaited = await Promise.all(slice);
              for (const entry of awaited) {
                if (!entry)
                  continue;
                if (this.destroyed)
                  return;
                const entryType = await this._getEntryType(entry);
                if (entryType === "directory" && this._directoryFilter(entry)) {
                  if (depth <= this._maxDepth) {
                    this.parents.push(this._exploreDir(entry.fullPath, depth + 1));
                  }
                  if (this._wantsDir) {
                    this.push(entry);
                    batch--;
                  }
                } else if ((entryType === "file" || this._includeAsFile(entry)) && this._fileFilter(entry)) {
                  if (this._wantsFile) {
                    this.push(entry);
                    batch--;
                  }
                }
              }
            } else {
              const parent = this.parents.pop();
              if (!parent) {
                this.push(null);
                break;
              }
              this.parent = await parent;
              if (this.destroyed)
                return;
            }
          }
        } catch (error) {
          this.destroy(error);
        } finally {
          this.reading = false;
        }
      }
      async _exploreDir(path7, depth) {
        let files;
        try {
          files = await (0, import_promises.readdir)(path7, this._rdOptions);
        } catch (error) {
          this._onError(error);
        }
        return { files, depth, path: path7 };
      }
      async _formatEntry(dirent, path7) {
        let entry;
        const basename5 = this._isDirent ? dirent.name : dirent;
        try {
          const fullPath = (0, import_node_path.resolve)((0, import_node_path.join)(path7, basename5));
          entry = { path: (0, import_node_path.relative)(this._root, fullPath), fullPath, basename: basename5 };
          entry[this._statsProp] = this._isDirent ? dirent : await this._stat(fullPath);
        } catch (err) {
          this._onError(err);
          return;
        }
        return entry;
      }
      _onError(err) {
        if (isNormalFlowError(err) && !this.destroyed) {
          this.emit("warn", err);
        } else {
          this.destroy(err);
        }
      }
      async _getEntryType(entry) {
        if (!entry && this._statsProp in entry) {
          return "";
        }
        const stats = entry[this._statsProp];
        if (stats.isFile())
          return "file";
        if (stats.isDirectory())
          return "directory";
        if (stats && stats.isSymbolicLink()) {
          const full = entry.fullPath;
          try {
            const entryRealPath = await (0, import_promises.realpath)(full);
            const entryRealPathStats = await (0, import_promises.lstat)(entryRealPath);
            if (entryRealPathStats.isFile()) {
              return "file";
            }
            if (entryRealPathStats.isDirectory()) {
              const len = entryRealPath.length;
              if (full.startsWith(entryRealPath) && full.substr(len, 1) === import_node_path.sep) {
                const recursiveError = new Error(`Circular symlink detected: "${full}" points to "${entryRealPath}"`);
                recursiveError.code = RECURSIVE_ERROR_CODE;
                return this._onError(recursiveError);
              }
              return "directory";
            }
          } catch (error) {
            this._onError(error);
            return "";
          }
        }
      }
      _includeAsFile(entry) {
        const stats = entry && entry[this._statsProp];
        return stats && this._wantsEverything && !stats.isDirectory();
      }
    };
  }
});

// node_modules/chokidar/esm/handler.js
function createFsWatchInstance(path7, options, listener, errHandler, emitRaw) {
  const handleEvent = (rawEvent, evPath) => {
    listener(path7);
    emitRaw(rawEvent, evPath, { watchedPath: path7 });
    if (evPath && path7 !== evPath) {
      fsWatchBroadcast(sysPath.resolve(path7, evPath), KEY_LISTENERS, sysPath.join(path7, evPath));
    }
  };
  try {
    return (0, import_fs.watch)(path7, {
      persistent: options.persistent
    }, handleEvent);
  } catch (error) {
    errHandler(error);
    return void 0;
  }
}
var import_fs, import_promises2, sysPath, import_os, STR_DATA, STR_END, STR_CLOSE, EMPTY_FN, pl, isWindows, isMacos, isLinux, isFreeBSD, isIBMi, EVENTS, EV, THROTTLE_MODE_WATCH, statMethods, KEY_LISTENERS, KEY_ERR, KEY_RAW, HANDLER_KEYS, binaryExtensions, isBinaryPath, foreach, addAndConvert, clearItem, delFromSet, isEmptySet, FsWatchInstances, fsWatchBroadcast, setFsWatchListener, FsWatchFileInstances, setFsWatchFileListener, NodeFsHandler;
var init_handler = __esm({
  "node_modules/chokidar/esm/handler.js"() {
    import_fs = require("fs");
    import_promises2 = require("fs/promises");
    sysPath = __toESM(require("path"), 1);
    import_os = require("os");
    STR_DATA = "data";
    STR_END = "end";
    STR_CLOSE = "close";
    EMPTY_FN = () => {
    };
    pl = process.platform;
    isWindows = pl === "win32";
    isMacos = pl === "darwin";
    isLinux = pl === "linux";
    isFreeBSD = pl === "freebsd";
    isIBMi = (0, import_os.type)() === "OS400";
    EVENTS = {
      ALL: "all",
      READY: "ready",
      ADD: "add",
      CHANGE: "change",
      ADD_DIR: "addDir",
      UNLINK: "unlink",
      UNLINK_DIR: "unlinkDir",
      RAW: "raw",
      ERROR: "error"
    };
    EV = EVENTS;
    THROTTLE_MODE_WATCH = "watch";
    statMethods = { lstat: import_promises2.lstat, stat: import_promises2.stat };
    KEY_LISTENERS = "listeners";
    KEY_ERR = "errHandlers";
    KEY_RAW = "rawEmitters";
    HANDLER_KEYS = [KEY_LISTENERS, KEY_ERR, KEY_RAW];
    binaryExtensions = /* @__PURE__ */ new Set([
      "3dm",
      "3ds",
      "3g2",
      "3gp",
      "7z",
      "a",
      "aac",
      "adp",
      "afdesign",
      "afphoto",
      "afpub",
      "ai",
      "aif",
      "aiff",
      "alz",
      "ape",
      "apk",
      "appimage",
      "ar",
      "arj",
      "asf",
      "au",
      "avi",
      "bak",
      "baml",
      "bh",
      "bin",
      "bk",
      "bmp",
      "btif",
      "bz2",
      "bzip2",
      "cab",
      "caf",
      "cgm",
      "class",
      "cmx",
      "cpio",
      "cr2",
      "cur",
      "dat",
      "dcm",
      "deb",
      "dex",
      "djvu",
      "dll",
      "dmg",
      "dng",
      "doc",
      "docm",
      "docx",
      "dot",
      "dotm",
      "dra",
      "DS_Store",
      "dsk",
      "dts",
      "dtshd",
      "dvb",
      "dwg",
      "dxf",
      "ecelp4800",
      "ecelp7470",
      "ecelp9600",
      "egg",
      "eol",
      "eot",
      "epub",
      "exe",
      "f4v",
      "fbs",
      "fh",
      "fla",
      "flac",
      "flatpak",
      "fli",
      "flv",
      "fpx",
      "fst",
      "fvt",
      "g3",
      "gh",
      "gif",
      "graffle",
      "gz",
      "gzip",
      "h261",
      "h263",
      "h264",
      "icns",
      "ico",
      "ief",
      "img",
      "ipa",
      "iso",
      "jar",
      "jpeg",
      "jpg",
      "jpgv",
      "jpm",
      "jxr",
      "key",
      "ktx",
      "lha",
      "lib",
      "lvp",
      "lz",
      "lzh",
      "lzma",
      "lzo",
      "m3u",
      "m4a",
      "m4v",
      "mar",
      "mdi",
      "mht",
      "mid",
      "midi",
      "mj2",
      "mka",
      "mkv",
      "mmr",
      "mng",
      "mobi",
      "mov",
      "movie",
      "mp3",
      "mp4",
      "mp4a",
      "mpeg",
      "mpg",
      "mpga",
      "mxu",
      "nef",
      "npx",
      "numbers",
      "nupkg",
      "o",
      "odp",
      "ods",
      "odt",
      "oga",
      "ogg",
      "ogv",
      "otf",
      "ott",
      "pages",
      "pbm",
      "pcx",
      "pdb",
      "pdf",
      "pea",
      "pgm",
      "pic",
      "png",
      "pnm",
      "pot",
      "potm",
      "potx",
      "ppa",
      "ppam",
      "ppm",
      "pps",
      "ppsm",
      "ppsx",
      "ppt",
      "pptm",
      "pptx",
      "psd",
      "pya",
      "pyc",
      "pyo",
      "pyv",
      "qt",
      "rar",
      "ras",
      "raw",
      "resources",
      "rgb",
      "rip",
      "rlc",
      "rmf",
      "rmvb",
      "rpm",
      "rtf",
      "rz",
      "s3m",
      "s7z",
      "scpt",
      "sgi",
      "shar",
      "snap",
      "sil",
      "sketch",
      "slk",
      "smv",
      "snk",
      "so",
      "stl",
      "suo",
      "sub",
      "swf",
      "tar",
      "tbz",
      "tbz2",
      "tga",
      "tgz",
      "thmx",
      "tif",
      "tiff",
      "tlz",
      "ttc",
      "ttf",
      "txz",
      "udf",
      "uvh",
      "uvi",
      "uvm",
      "uvp",
      "uvs",
      "uvu",
      "viv",
      "vob",
      "war",
      "wav",
      "wax",
      "wbmp",
      "wdp",
      "weba",
      "webm",
      "webp",
      "whl",
      "wim",
      "wm",
      "wma",
      "wmv",
      "wmx",
      "woff",
      "woff2",
      "wrm",
      "wvx",
      "xbm",
      "xif",
      "xla",
      "xlam",
      "xls",
      "xlsb",
      "xlsm",
      "xlsx",
      "xlt",
      "xltm",
      "xltx",
      "xm",
      "xmind",
      "xpi",
      "xpm",
      "xwd",
      "xz",
      "z",
      "zip",
      "zipx"
    ]);
    isBinaryPath = (filePath) => binaryExtensions.has(sysPath.extname(filePath).slice(1).toLowerCase());
    foreach = (val, fn) => {
      if (val instanceof Set) {
        val.forEach(fn);
      } else {
        fn(val);
      }
    };
    addAndConvert = (main2, prop, item) => {
      let container = main2[prop];
      if (!(container instanceof Set)) {
        main2[prop] = container = /* @__PURE__ */ new Set([container]);
      }
      container.add(item);
    };
    clearItem = (cont) => (key) => {
      const set = cont[key];
      if (set instanceof Set) {
        set.clear();
      } else {
        delete cont[key];
      }
    };
    delFromSet = (main2, prop, item) => {
      const container = main2[prop];
      if (container instanceof Set) {
        container.delete(item);
      } else if (container === item) {
        delete main2[prop];
      }
    };
    isEmptySet = (val) => val instanceof Set ? val.size === 0 : !val;
    FsWatchInstances = /* @__PURE__ */ new Map();
    fsWatchBroadcast = (fullPath, listenerType, val1, val2, val3) => {
      const cont = FsWatchInstances.get(fullPath);
      if (!cont)
        return;
      foreach(cont[listenerType], (listener) => {
        listener(val1, val2, val3);
      });
    };
    setFsWatchListener = (path7, fullPath, options, handlers) => {
      const { listener, errHandler, rawEmitter } = handlers;
      let cont = FsWatchInstances.get(fullPath);
      let watcher;
      if (!options.persistent) {
        watcher = createFsWatchInstance(path7, options, listener, errHandler, rawEmitter);
        if (!watcher)
          return;
        return watcher.close.bind(watcher);
      }
      if (cont) {
        addAndConvert(cont, KEY_LISTENERS, listener);
        addAndConvert(cont, KEY_ERR, errHandler);
        addAndConvert(cont, KEY_RAW, rawEmitter);
      } else {
        watcher = createFsWatchInstance(
          path7,
          options,
          fsWatchBroadcast.bind(null, fullPath, KEY_LISTENERS),
          errHandler,
          // no need to use broadcast here
          fsWatchBroadcast.bind(null, fullPath, KEY_RAW)
        );
        if (!watcher)
          return;
        watcher.on(EV.ERROR, async (error) => {
          const broadcastErr = fsWatchBroadcast.bind(null, fullPath, KEY_ERR);
          if (cont)
            cont.watcherUnusable = true;
          if (isWindows && error.code === "EPERM") {
            try {
              const fd = await (0, import_promises2.open)(path7, "r");
              await fd.close();
              broadcastErr(error);
            } catch (err) {
            }
          } else {
            broadcastErr(error);
          }
        });
        cont = {
          listeners: listener,
          errHandlers: errHandler,
          rawEmitters: rawEmitter,
          watcher
        };
        FsWatchInstances.set(fullPath, cont);
      }
      return () => {
        delFromSet(cont, KEY_LISTENERS, listener);
        delFromSet(cont, KEY_ERR, errHandler);
        delFromSet(cont, KEY_RAW, rawEmitter);
        if (isEmptySet(cont.listeners)) {
          cont.watcher.close();
          FsWatchInstances.delete(fullPath);
          HANDLER_KEYS.forEach(clearItem(cont));
          cont.watcher = void 0;
          Object.freeze(cont);
        }
      };
    };
    FsWatchFileInstances = /* @__PURE__ */ new Map();
    setFsWatchFileListener = (path7, fullPath, options, handlers) => {
      const { listener, rawEmitter } = handlers;
      let cont = FsWatchFileInstances.get(fullPath);
      const copts = cont && cont.options;
      if (copts && (copts.persistent < options.persistent || copts.interval > options.interval)) {
        (0, import_fs.unwatchFile)(fullPath);
        cont = void 0;
      }
      if (cont) {
        addAndConvert(cont, KEY_LISTENERS, listener);
        addAndConvert(cont, KEY_RAW, rawEmitter);
      } else {
        cont = {
          listeners: listener,
          rawEmitters: rawEmitter,
          options,
          watcher: (0, import_fs.watchFile)(fullPath, options, (curr, prev) => {
            foreach(cont.rawEmitters, (rawEmitter2) => {
              rawEmitter2(EV.CHANGE, fullPath, { curr, prev });
            });
            const currmtime = curr.mtimeMs;
            if (curr.size !== prev.size || currmtime > prev.mtimeMs || currmtime === 0) {
              foreach(cont.listeners, (listener2) => listener2(path7, curr));
            }
          })
        };
        FsWatchFileInstances.set(fullPath, cont);
      }
      return () => {
        delFromSet(cont, KEY_LISTENERS, listener);
        delFromSet(cont, KEY_RAW, rawEmitter);
        if (isEmptySet(cont.listeners)) {
          FsWatchFileInstances.delete(fullPath);
          (0, import_fs.unwatchFile)(fullPath);
          cont.options = cont.watcher = void 0;
          Object.freeze(cont);
        }
      };
    };
    NodeFsHandler = class {
      constructor(fsW) {
        this.fsw = fsW;
        this._boundHandleError = (error) => fsW._handleError(error);
      }
      /**
       * Watch file for changes with fs_watchFile or fs_watch.
       * @param path to file or dir
       * @param listener on fs change
       * @returns closer for the watcher instance
       */
      _watchWithNodeFs(path7, listener) {
        const opts = this.fsw.options;
        const directory = sysPath.dirname(path7);
        const basename5 = sysPath.basename(path7);
        const parent = this.fsw._getWatchedDir(directory);
        parent.add(basename5);
        const absolutePath = sysPath.resolve(path7);
        const options = {
          persistent: opts.persistent
        };
        if (!listener)
          listener = EMPTY_FN;
        let closer;
        if (opts.usePolling) {
          const enableBin = opts.interval !== opts.binaryInterval;
          options.interval = enableBin && isBinaryPath(basename5) ? opts.binaryInterval : opts.interval;
          closer = setFsWatchFileListener(path7, absolutePath, options, {
            listener,
            rawEmitter: this.fsw._emitRaw
          });
        } else {
          closer = setFsWatchListener(path7, absolutePath, options, {
            listener,
            errHandler: this._boundHandleError,
            rawEmitter: this.fsw._emitRaw
          });
        }
        return closer;
      }
      /**
       * Watch a file and emit add event if warranted.
       * @returns closer for the watcher instance
       */
      _handleFile(file, stats, initialAdd) {
        if (this.fsw.closed) {
          return;
        }
        const dirname4 = sysPath.dirname(file);
        const basename5 = sysPath.basename(file);
        const parent = this.fsw._getWatchedDir(dirname4);
        let prevStats = stats;
        if (parent.has(basename5))
          return;
        const listener = async (path7, newStats) => {
          if (!this.fsw._throttle(THROTTLE_MODE_WATCH, file, 5))
            return;
          if (!newStats || newStats.mtimeMs === 0) {
            try {
              const newStats2 = await (0, import_promises2.stat)(file);
              if (this.fsw.closed)
                return;
              const at = newStats2.atimeMs;
              const mt = newStats2.mtimeMs;
              if (!at || at <= mt || mt !== prevStats.mtimeMs) {
                this.fsw._emit(EV.CHANGE, file, newStats2);
              }
              if ((isMacos || isLinux || isFreeBSD) && prevStats.ino !== newStats2.ino) {
                this.fsw._closeFile(path7);
                prevStats = newStats2;
                const closer2 = this._watchWithNodeFs(file, listener);
                if (closer2)
                  this.fsw._addPathCloser(path7, closer2);
              } else {
                prevStats = newStats2;
              }
            } catch (error) {
              this.fsw._remove(dirname4, basename5);
            }
          } else if (parent.has(basename5)) {
            const at = newStats.atimeMs;
            const mt = newStats.mtimeMs;
            if (!at || at <= mt || mt !== prevStats.mtimeMs) {
              this.fsw._emit(EV.CHANGE, file, newStats);
            }
            prevStats = newStats;
          }
        };
        const closer = this._watchWithNodeFs(file, listener);
        if (!(initialAdd && this.fsw.options.ignoreInitial) && this.fsw._isntIgnored(file)) {
          if (!this.fsw._throttle(EV.ADD, file, 0))
            return;
          this.fsw._emit(EV.ADD, file, stats);
        }
        return closer;
      }
      /**
       * Handle symlinks encountered while reading a dir.
       * @param entry returned by readdirp
       * @param directory path of dir being read
       * @param path of this item
       * @param item basename of this item
       * @returns true if no more processing is needed for this entry.
       */
      async _handleSymlink(entry, directory, path7, item) {
        if (this.fsw.closed) {
          return;
        }
        const full = entry.fullPath;
        const dir = this.fsw._getWatchedDir(directory);
        if (!this.fsw.options.followSymlinks) {
          this.fsw._incrReadyCount();
          let linkPath;
          try {
            linkPath = await (0, import_promises2.realpath)(path7);
          } catch (e) {
            this.fsw._emitReady();
            return true;
          }
          if (this.fsw.closed)
            return;
          if (dir.has(item)) {
            if (this.fsw._symlinkPaths.get(full) !== linkPath) {
              this.fsw._symlinkPaths.set(full, linkPath);
              this.fsw._emit(EV.CHANGE, path7, entry.stats);
            }
          } else {
            dir.add(item);
            this.fsw._symlinkPaths.set(full, linkPath);
            this.fsw._emit(EV.ADD, path7, entry.stats);
          }
          this.fsw._emitReady();
          return true;
        }
        if (this.fsw._symlinkPaths.has(full)) {
          return true;
        }
        this.fsw._symlinkPaths.set(full, true);
      }
      _handleRead(directory, initialAdd, wh, target, dir, depth, throttler) {
        directory = sysPath.join(directory, "");
        throttler = this.fsw._throttle("readdir", directory, 1e3);
        if (!throttler)
          return;
        const previous = this.fsw._getWatchedDir(wh.path);
        const current = /* @__PURE__ */ new Set();
        let stream = this.fsw._readdirp(directory, {
          fileFilter: (entry) => wh.filterPath(entry),
          directoryFilter: (entry) => wh.filterDir(entry)
        });
        if (!stream)
          return;
        stream.on(STR_DATA, async (entry) => {
          if (this.fsw.closed) {
            stream = void 0;
            return;
          }
          const item = entry.path;
          let path7 = sysPath.join(directory, item);
          current.add(item);
          if (entry.stats.isSymbolicLink() && await this._handleSymlink(entry, directory, path7, item)) {
            return;
          }
          if (this.fsw.closed) {
            stream = void 0;
            return;
          }
          if (item === target || !target && !previous.has(item)) {
            this.fsw._incrReadyCount();
            path7 = sysPath.join(dir, sysPath.relative(dir, path7));
            this._addToNodeFs(path7, initialAdd, wh, depth + 1);
          }
        }).on(EV.ERROR, this._boundHandleError);
        return new Promise((resolve5, reject) => {
          if (!stream)
            return reject();
          stream.once(STR_END, () => {
            if (this.fsw.closed) {
              stream = void 0;
              return;
            }
            const wasThrottled = throttler ? throttler.clear() : false;
            resolve5(void 0);
            previous.getChildren().filter((item) => {
              return item !== directory && !current.has(item);
            }).forEach((item) => {
              this.fsw._remove(directory, item);
            });
            stream = void 0;
            if (wasThrottled)
              this._handleRead(directory, false, wh, target, dir, depth, throttler);
          });
        });
      }
      /**
       * Read directory to add / remove files from `@watched` list and re-read it on change.
       * @param dir fs path
       * @param stats
       * @param initialAdd
       * @param depth relative to user-supplied path
       * @param target child path targeted for watch
       * @param wh Common watch helpers for this path
       * @param realpath
       * @returns closer for the watcher instance.
       */
      async _handleDir(dir, stats, initialAdd, depth, target, wh, realpath2) {
        const parentDir = this.fsw._getWatchedDir(sysPath.dirname(dir));
        const tracked = parentDir.has(sysPath.basename(dir));
        if (!(initialAdd && this.fsw.options.ignoreInitial) && !target && !tracked) {
          this.fsw._emit(EV.ADD_DIR, dir, stats);
        }
        parentDir.add(sysPath.basename(dir));
        this.fsw._getWatchedDir(dir);
        let throttler;
        let closer;
        const oDepth = this.fsw.options.depth;
        if ((oDepth == null || depth <= oDepth) && !this.fsw._symlinkPaths.has(realpath2)) {
          if (!target) {
            await this._handleRead(dir, initialAdd, wh, target, dir, depth, throttler);
            if (this.fsw.closed)
              return;
          }
          closer = this._watchWithNodeFs(dir, (dirPath, stats2) => {
            if (stats2 && stats2.mtimeMs === 0)
              return;
            this._handleRead(dirPath, false, wh, target, dir, depth, throttler);
          });
        }
        return closer;
      }
      /**
       * Handle added file, directory, or glob pattern.
       * Delegates call to _handleFile / _handleDir after checks.
       * @param path to file or ir
       * @param initialAdd was the file added at watch instantiation?
       * @param priorWh depth relative to user-supplied path
       * @param depth Child path actually targeted for watch
       * @param target Child path actually targeted for watch
       */
      async _addToNodeFs(path7, initialAdd, priorWh, depth, target) {
        const ready = this.fsw._emitReady;
        if (this.fsw._isIgnored(path7) || this.fsw.closed) {
          ready();
          return false;
        }
        const wh = this.fsw._getWatchHelpers(path7);
        if (priorWh) {
          wh.filterPath = (entry) => priorWh.filterPath(entry);
          wh.filterDir = (entry) => priorWh.filterDir(entry);
        }
        try {
          const stats = await statMethods[wh.statMethod](wh.watchPath);
          if (this.fsw.closed)
            return;
          if (this.fsw._isIgnored(wh.watchPath, stats)) {
            ready();
            return false;
          }
          const follow = this.fsw.options.followSymlinks;
          let closer;
          if (stats.isDirectory()) {
            const absPath = sysPath.resolve(path7);
            const targetPath = follow ? await (0, import_promises2.realpath)(path7) : path7;
            if (this.fsw.closed)
              return;
            closer = await this._handleDir(wh.watchPath, stats, initialAdd, depth, target, wh, targetPath);
            if (this.fsw.closed)
              return;
            if (absPath !== targetPath && targetPath !== void 0) {
              this.fsw._symlinkPaths.set(absPath, targetPath);
            }
          } else if (stats.isSymbolicLink()) {
            const targetPath = follow ? await (0, import_promises2.realpath)(path7) : path7;
            if (this.fsw.closed)
              return;
            const parent = sysPath.dirname(wh.watchPath);
            this.fsw._getWatchedDir(parent).add(wh.watchPath);
            this.fsw._emit(EV.ADD, wh.watchPath, stats);
            closer = await this._handleDir(parent, stats, initialAdd, depth, path7, wh, targetPath);
            if (this.fsw.closed)
              return;
            if (targetPath !== void 0) {
              this.fsw._symlinkPaths.set(sysPath.resolve(path7), targetPath);
            }
          } else {
            closer = this._handleFile(wh.watchPath, stats, initialAdd);
          }
          ready();
          if (closer)
            this.fsw._addPathCloser(path7, closer);
          return false;
        } catch (error) {
          if (this.fsw._handleError(error)) {
            ready();
            return path7;
          }
        }
      }
    };
  }
});

// node_modules/chokidar/esm/index.js
var esm_exports = {};
__export(esm_exports, {
  FSWatcher: () => FSWatcher,
  WatchHelper: () => WatchHelper,
  default: () => esm_default,
  watch: () => watch
});
function arrify(item) {
  return Array.isArray(item) ? item : [item];
}
function createPattern(matcher) {
  if (typeof matcher === "function")
    return matcher;
  if (typeof matcher === "string")
    return (string) => matcher === string;
  if (matcher instanceof RegExp)
    return (string) => matcher.test(string);
  if (typeof matcher === "object" && matcher !== null) {
    return (string) => {
      if (matcher.path === string)
        return true;
      if (matcher.recursive) {
        const relative3 = sysPath2.relative(matcher.path, string);
        if (!relative3) {
          return false;
        }
        return !relative3.startsWith("..") && !sysPath2.isAbsolute(relative3);
      }
      return false;
    };
  }
  return () => false;
}
function normalizePath(path7) {
  if (typeof path7 !== "string")
    throw new Error("string expected");
  path7 = sysPath2.normalize(path7);
  path7 = path7.replace(/\\/g, "/");
  let prepend = false;
  if (path7.startsWith("//"))
    prepend = true;
  const DOUBLE_SLASH_RE2 = /\/\//;
  while (path7.match(DOUBLE_SLASH_RE2))
    path7 = path7.replace(DOUBLE_SLASH_RE2, "/");
  if (prepend)
    path7 = "/" + path7;
  return path7;
}
function matchPatterns(patterns, testString, stats) {
  const path7 = normalizePath(testString);
  for (let index = 0; index < patterns.length; index++) {
    const pattern = patterns[index];
    if (pattern(path7, stats)) {
      return true;
    }
  }
  return false;
}
function anymatch(matchers, testString) {
  if (matchers == null) {
    throw new TypeError("anymatch: specify first argument");
  }
  const matchersArray = arrify(matchers);
  const patterns = matchersArray.map((matcher) => createPattern(matcher));
  if (testString == null) {
    return (testString2, stats) => {
      return matchPatterns(patterns, testString2, stats);
    };
  }
  return matchPatterns(patterns, testString);
}
function watch(paths, options = {}) {
  const watcher = new FSWatcher(options);
  watcher.add(paths);
  return watcher;
}
var import_fs2, import_promises3, import_events, sysPath2, SLASH, SLASH_SLASH, ONE_DOT, TWO_DOTS, STRING_TYPE, BACK_SLASH_RE, DOUBLE_SLASH_RE, DOT_RE, REPLACER_RE, isMatcherObject, unifyPaths, toUnix, normalizePathToUnix, normalizeIgnored, getAbsolutePath, EMPTY_SET, DirEntry, STAT_METHOD_F, STAT_METHOD_L, WatchHelper, FSWatcher, esm_default;
var init_esm2 = __esm({
  "node_modules/chokidar/esm/index.js"() {
    import_fs2 = require("fs");
    import_promises3 = require("fs/promises");
    import_events = require("events");
    sysPath2 = __toESM(require("path"), 1);
    init_esm();
    init_handler();
    SLASH = "/";
    SLASH_SLASH = "//";
    ONE_DOT = ".";
    TWO_DOTS = "..";
    STRING_TYPE = "string";
    BACK_SLASH_RE = /\\/g;
    DOUBLE_SLASH_RE = /\/\//;
    DOT_RE = /\..*\.(sw[px])$|~$|\.subl.*\.tmp/;
    REPLACER_RE = /^\.[/\\]/;
    isMatcherObject = (matcher) => typeof matcher === "object" && matcher !== null && !(matcher instanceof RegExp);
    unifyPaths = (paths_) => {
      const paths = arrify(paths_).flat();
      if (!paths.every((p) => typeof p === STRING_TYPE)) {
        throw new TypeError(`Non-string provided as watch path: ${paths}`);
      }
      return paths.map(normalizePathToUnix);
    };
    toUnix = (string) => {
      let str = string.replace(BACK_SLASH_RE, SLASH);
      let prepend = false;
      if (str.startsWith(SLASH_SLASH)) {
        prepend = true;
      }
      while (str.match(DOUBLE_SLASH_RE)) {
        str = str.replace(DOUBLE_SLASH_RE, SLASH);
      }
      if (prepend) {
        str = SLASH + str;
      }
      return str;
    };
    normalizePathToUnix = (path7) => toUnix(sysPath2.normalize(toUnix(path7)));
    normalizeIgnored = (cwd = "") => (path7) => {
      if (typeof path7 === "string") {
        return normalizePathToUnix(sysPath2.isAbsolute(path7) ? path7 : sysPath2.join(cwd, path7));
      } else {
        return path7;
      }
    };
    getAbsolutePath = (path7, cwd) => {
      if (sysPath2.isAbsolute(path7)) {
        return path7;
      }
      return sysPath2.join(cwd, path7);
    };
    EMPTY_SET = Object.freeze(/* @__PURE__ */ new Set());
    DirEntry = class {
      constructor(dir, removeWatcher) {
        this.path = dir;
        this._removeWatcher = removeWatcher;
        this.items = /* @__PURE__ */ new Set();
      }
      add(item) {
        const { items } = this;
        if (!items)
          return;
        if (item !== ONE_DOT && item !== TWO_DOTS)
          items.add(item);
      }
      async remove(item) {
        const { items } = this;
        if (!items)
          return;
        items.delete(item);
        if (items.size > 0)
          return;
        const dir = this.path;
        try {
          await (0, import_promises3.readdir)(dir);
        } catch (err) {
          if (this._removeWatcher) {
            this._removeWatcher(sysPath2.dirname(dir), sysPath2.basename(dir));
          }
        }
      }
      has(item) {
        const { items } = this;
        if (!items)
          return;
        return items.has(item);
      }
      getChildren() {
        const { items } = this;
        if (!items)
          return [];
        return [...items.values()];
      }
      dispose() {
        this.items.clear();
        this.path = "";
        this._removeWatcher = EMPTY_FN;
        this.items = EMPTY_SET;
        Object.freeze(this);
      }
    };
    STAT_METHOD_F = "stat";
    STAT_METHOD_L = "lstat";
    WatchHelper = class {
      constructor(path7, follow, fsw) {
        this.fsw = fsw;
        const watchPath = path7;
        this.path = path7 = path7.replace(REPLACER_RE, "");
        this.watchPath = watchPath;
        this.fullWatchPath = sysPath2.resolve(watchPath);
        this.dirParts = [];
        this.dirParts.forEach((parts) => {
          if (parts.length > 1)
            parts.pop();
        });
        this.followSymlinks = follow;
        this.statMethod = follow ? STAT_METHOD_F : STAT_METHOD_L;
      }
      entryPath(entry) {
        return sysPath2.join(this.watchPath, sysPath2.relative(this.watchPath, entry.fullPath));
      }
      filterPath(entry) {
        const { stats } = entry;
        if (stats && stats.isSymbolicLink())
          return this.filterDir(entry);
        const resolvedPath = this.entryPath(entry);
        return this.fsw._isntIgnored(resolvedPath, stats) && this.fsw._hasReadPermissions(stats);
      }
      filterDir(entry) {
        return this.fsw._isntIgnored(this.entryPath(entry), entry.stats);
      }
    };
    FSWatcher = class extends import_events.EventEmitter {
      // Not indenting methods for history sake; for now.
      constructor(_opts = {}) {
        super();
        this.closed = false;
        this._closers = /* @__PURE__ */ new Map();
        this._ignoredPaths = /* @__PURE__ */ new Set();
        this._throttled = /* @__PURE__ */ new Map();
        this._streams = /* @__PURE__ */ new Set();
        this._symlinkPaths = /* @__PURE__ */ new Map();
        this._watched = /* @__PURE__ */ new Map();
        this._pendingWrites = /* @__PURE__ */ new Map();
        this._pendingUnlinks = /* @__PURE__ */ new Map();
        this._readyCount = 0;
        this._readyEmitted = false;
        const awf = _opts.awaitWriteFinish;
        const DEF_AWF = { stabilityThreshold: 2e3, pollInterval: 100 };
        const opts = {
          // Defaults
          persistent: true,
          ignoreInitial: false,
          ignorePermissionErrors: false,
          interval: 100,
          binaryInterval: 300,
          followSymlinks: true,
          usePolling: false,
          // useAsync: false,
          atomic: true,
          // NOTE: overwritten later (depends on usePolling)
          ..._opts,
          // Change format
          ignored: _opts.ignored ? arrify(_opts.ignored) : arrify([]),
          awaitWriteFinish: awf === true ? DEF_AWF : typeof awf === "object" ? { ...DEF_AWF, ...awf } : false
        };
        if (isIBMi)
          opts.usePolling = true;
        if (opts.atomic === void 0)
          opts.atomic = !opts.usePolling;
        const envPoll = process.env.CHOKIDAR_USEPOLLING;
        if (envPoll !== void 0) {
          const envLower = envPoll.toLowerCase();
          if (envLower === "false" || envLower === "0")
            opts.usePolling = false;
          else if (envLower === "true" || envLower === "1")
            opts.usePolling = true;
          else
            opts.usePolling = !!envLower;
        }
        const envInterval = process.env.CHOKIDAR_INTERVAL;
        if (envInterval)
          opts.interval = Number.parseInt(envInterval, 10);
        let readyCalls = 0;
        this._emitReady = () => {
          readyCalls++;
          if (readyCalls >= this._readyCount) {
            this._emitReady = EMPTY_FN;
            this._readyEmitted = true;
            process.nextTick(() => this.emit(EVENTS.READY));
          }
        };
        this._emitRaw = (...args) => this.emit(EVENTS.RAW, ...args);
        this._boundRemove = this._remove.bind(this);
        this.options = opts;
        this._nodeFsHandler = new NodeFsHandler(this);
        Object.freeze(opts);
      }
      _addIgnoredPath(matcher) {
        if (isMatcherObject(matcher)) {
          for (const ignored of this._ignoredPaths) {
            if (isMatcherObject(ignored) && ignored.path === matcher.path && ignored.recursive === matcher.recursive) {
              return;
            }
          }
        }
        this._ignoredPaths.add(matcher);
      }
      _removeIgnoredPath(matcher) {
        this._ignoredPaths.delete(matcher);
        if (typeof matcher === "string") {
          for (const ignored of this._ignoredPaths) {
            if (isMatcherObject(ignored) && ignored.path === matcher) {
              this._ignoredPaths.delete(ignored);
            }
          }
        }
      }
      // Public methods
      /**
       * Adds paths to be watched on an existing FSWatcher instance.
       * @param paths_ file or file list. Other arguments are unused
       */
      add(paths_, _origAdd, _internal) {
        const { cwd } = this.options;
        this.closed = false;
        this._closePromise = void 0;
        let paths = unifyPaths(paths_);
        if (cwd) {
          paths = paths.map((path7) => {
            const absPath = getAbsolutePath(path7, cwd);
            return absPath;
          });
        }
        paths.forEach((path7) => {
          this._removeIgnoredPath(path7);
        });
        this._userIgnored = void 0;
        if (!this._readyCount)
          this._readyCount = 0;
        this._readyCount += paths.length;
        Promise.all(paths.map(async (path7) => {
          const res = await this._nodeFsHandler._addToNodeFs(path7, !_internal, void 0, 0, _origAdd);
          if (res)
            this._emitReady();
          return res;
        })).then((results) => {
          if (this.closed)
            return;
          results.forEach((item) => {
            if (item)
              this.add(sysPath2.dirname(item), sysPath2.basename(_origAdd || item));
          });
        });
        return this;
      }
      /**
       * Close watchers or start ignoring events from specified paths.
       */
      unwatch(paths_) {
        if (this.closed)
          return this;
        const paths = unifyPaths(paths_);
        const { cwd } = this.options;
        paths.forEach((path7) => {
          if (!sysPath2.isAbsolute(path7) && !this._closers.has(path7)) {
            if (cwd)
              path7 = sysPath2.join(cwd, path7);
            path7 = sysPath2.resolve(path7);
          }
          this._closePath(path7);
          this._addIgnoredPath(path7);
          if (this._watched.has(path7)) {
            this._addIgnoredPath({
              path: path7,
              recursive: true
            });
          }
          this._userIgnored = void 0;
        });
        return this;
      }
      /**
       * Close watchers and remove all listeners from watched paths.
       */
      close() {
        if (this._closePromise) {
          return this._closePromise;
        }
        this.closed = true;
        this.removeAllListeners();
        const closers = [];
        this._closers.forEach((closerList) => closerList.forEach((closer) => {
          const promise = closer();
          if (promise instanceof Promise)
            closers.push(promise);
        }));
        this._streams.forEach((stream) => stream.destroy());
        this._userIgnored = void 0;
        this._readyCount = 0;
        this._readyEmitted = false;
        this._watched.forEach((dirent) => dirent.dispose());
        this._closers.clear();
        this._watched.clear();
        this._streams.clear();
        this._symlinkPaths.clear();
        this._throttled.clear();
        this._closePromise = closers.length ? Promise.all(closers).then(() => void 0) : Promise.resolve();
        return this._closePromise;
      }
      /**
       * Expose list of watched paths
       * @returns for chaining
       */
      getWatched() {
        const watchList = {};
        this._watched.forEach((entry, dir) => {
          const key = this.options.cwd ? sysPath2.relative(this.options.cwd, dir) : dir;
          const index = key || ONE_DOT;
          watchList[index] = entry.getChildren().sort();
        });
        return watchList;
      }
      emitWithAll(event, args) {
        this.emit(event, ...args);
        if (event !== EVENTS.ERROR)
          this.emit(EVENTS.ALL, event, ...args);
      }
      // Common helpers
      // --------------
      /**
       * Normalize and emit events.
       * Calling _emit DOES NOT MEAN emit() would be called!
       * @param event Type of event
       * @param path File or directory path
       * @param stats arguments to be passed with event
       * @returns the error if defined, otherwise the value of the FSWatcher instance's `closed` flag
       */
      async _emit(event, path7, stats) {
        if (this.closed)
          return;
        const opts = this.options;
        if (isWindows)
          path7 = sysPath2.normalize(path7);
        if (opts.cwd)
          path7 = sysPath2.relative(opts.cwd, path7);
        const args = [path7];
        if (stats != null)
          args.push(stats);
        const awf = opts.awaitWriteFinish;
        let pw;
        if (awf && (pw = this._pendingWrites.get(path7))) {
          pw.lastChange = /* @__PURE__ */ new Date();
          return this;
        }
        if (opts.atomic) {
          if (event === EVENTS.UNLINK) {
            this._pendingUnlinks.set(path7, [event, ...args]);
            setTimeout(() => {
              this._pendingUnlinks.forEach((entry, path8) => {
                this.emit(...entry);
                this.emit(EVENTS.ALL, ...entry);
                this._pendingUnlinks.delete(path8);
              });
            }, typeof opts.atomic === "number" ? opts.atomic : 100);
            return this;
          }
          if (event === EVENTS.ADD && this._pendingUnlinks.has(path7)) {
            event = EVENTS.CHANGE;
            this._pendingUnlinks.delete(path7);
          }
        }
        if (awf && (event === EVENTS.ADD || event === EVENTS.CHANGE) && this._readyEmitted) {
          const awfEmit = (err, stats2) => {
            if (err) {
              event = EVENTS.ERROR;
              args[0] = err;
              this.emitWithAll(event, args);
            } else if (stats2) {
              if (args.length > 1) {
                args[1] = stats2;
              } else {
                args.push(stats2);
              }
              this.emitWithAll(event, args);
            }
          };
          this._awaitWriteFinish(path7, awf.stabilityThreshold, event, awfEmit);
          return this;
        }
        if (event === EVENTS.CHANGE) {
          const isThrottled = !this._throttle(EVENTS.CHANGE, path7, 50);
          if (isThrottled)
            return this;
        }
        if (opts.alwaysStat && stats === void 0 && (event === EVENTS.ADD || event === EVENTS.ADD_DIR || event === EVENTS.CHANGE)) {
          const fullPath = opts.cwd ? sysPath2.join(opts.cwd, path7) : path7;
          let stats2;
          try {
            stats2 = await (0, import_promises3.stat)(fullPath);
          } catch (err) {
          }
          if (!stats2 || this.closed)
            return;
          args.push(stats2);
        }
        this.emitWithAll(event, args);
        return this;
      }
      /**
       * Common handler for errors
       * @returns The error if defined, otherwise the value of the FSWatcher instance's `closed` flag
       */
      _handleError(error) {
        const code = error && error.code;
        if (error && code !== "ENOENT" && code !== "ENOTDIR" && (!this.options.ignorePermissionErrors || code !== "EPERM" && code !== "EACCES")) {
          this.emit(EVENTS.ERROR, error);
        }
        return error || this.closed;
      }
      /**
       * Helper utility for throttling
       * @param actionType type being throttled
       * @param path being acted upon
       * @param timeout duration of time to suppress duplicate actions
       * @returns tracking object or false if action should be suppressed
       */
      _throttle(actionType, path7, timeout) {
        if (!this._throttled.has(actionType)) {
          this._throttled.set(actionType, /* @__PURE__ */ new Map());
        }
        const action = this._throttled.get(actionType);
        if (!action)
          throw new Error("invalid throttle");
        const actionPath = action.get(path7);
        if (actionPath) {
          actionPath.count++;
          return false;
        }
        let timeoutObject;
        const clear = () => {
          const item = action.get(path7);
          const count = item ? item.count : 0;
          action.delete(path7);
          clearTimeout(timeoutObject);
          if (item)
            clearTimeout(item.timeoutObject);
          return count;
        };
        timeoutObject = setTimeout(clear, timeout);
        const thr = { timeoutObject, clear, count: 0 };
        action.set(path7, thr);
        return thr;
      }
      _incrReadyCount() {
        return this._readyCount++;
      }
      /**
       * Awaits write operation to finish.
       * Polls a newly created file for size variations. When files size does not change for 'threshold' milliseconds calls callback.
       * @param path being acted upon
       * @param threshold Time in milliseconds a file size must be fixed before acknowledging write OP is finished
       * @param event
       * @param awfEmit Callback to be called when ready for event to be emitted.
       */
      _awaitWriteFinish(path7, threshold, event, awfEmit) {
        const awf = this.options.awaitWriteFinish;
        if (typeof awf !== "object")
          return;
        const pollInterval = awf.pollInterval;
        let timeoutHandler;
        let fullPath = path7;
        if (this.options.cwd && !sysPath2.isAbsolute(path7)) {
          fullPath = sysPath2.join(this.options.cwd, path7);
        }
        const now = /* @__PURE__ */ new Date();
        const writes = this._pendingWrites;
        function awaitWriteFinishFn(prevStat) {
          (0, import_fs2.stat)(fullPath, (err, curStat) => {
            if (err || !writes.has(path7)) {
              if (err && err.code !== "ENOENT")
                awfEmit(err);
              return;
            }
            const now2 = Number(/* @__PURE__ */ new Date());
            if (prevStat && curStat.size !== prevStat.size) {
              writes.get(path7).lastChange = now2;
            }
            const pw = writes.get(path7);
            const df = now2 - pw.lastChange;
            if (df >= threshold) {
              writes.delete(path7);
              awfEmit(void 0, curStat);
            } else {
              timeoutHandler = setTimeout(awaitWriteFinishFn, pollInterval, curStat);
            }
          });
        }
        if (!writes.has(path7)) {
          writes.set(path7, {
            lastChange: now,
            cancelWait: () => {
              writes.delete(path7);
              clearTimeout(timeoutHandler);
              return event;
            }
          });
          timeoutHandler = setTimeout(awaitWriteFinishFn, pollInterval);
        }
      }
      /**
       * Determines whether user has asked to ignore this path.
       */
      _isIgnored(path7, stats) {
        if (this.options.atomic && DOT_RE.test(path7))
          return true;
        if (!this._userIgnored) {
          const { cwd } = this.options;
          const ign = this.options.ignored;
          const ignored = (ign || []).map(normalizeIgnored(cwd));
          const ignoredPaths = [...this._ignoredPaths];
          const list = [...ignoredPaths.map(normalizeIgnored(cwd)), ...ignored];
          this._userIgnored = anymatch(list, void 0);
        }
        return this._userIgnored(path7, stats);
      }
      _isntIgnored(path7, stat5) {
        return !this._isIgnored(path7, stat5);
      }
      /**
       * Provides a set of common helpers and properties relating to symlink handling.
       * @param path file or directory pattern being watched
       */
      _getWatchHelpers(path7) {
        return new WatchHelper(path7, this.options.followSymlinks, this);
      }
      // Directory helpers
      // -----------------
      /**
       * Provides directory tracking objects
       * @param directory path of the directory
       */
      _getWatchedDir(directory) {
        const dir = sysPath2.resolve(directory);
        if (!this._watched.has(dir))
          this._watched.set(dir, new DirEntry(dir, this._boundRemove));
        return this._watched.get(dir);
      }
      // File helpers
      // ------------
      /**
       * Check for read permissions: https://stackoverflow.com/a/11781404/1358405
       */
      _hasReadPermissions(stats) {
        if (this.options.ignorePermissionErrors)
          return true;
        return Boolean(Number(stats.mode) & 256);
      }
      /**
       * Handles emitting unlink events for
       * files and directories, and via recursion, for
       * files and directories within directories that are unlinked
       * @param directory within which the following item is located
       * @param item      base path of item/directory
       */
      _remove(directory, item, isDirectory) {
        const path7 = sysPath2.join(directory, item);
        const fullPath = sysPath2.resolve(path7);
        isDirectory = isDirectory != null ? isDirectory : this._watched.has(path7) || this._watched.has(fullPath);
        if (!this._throttle("remove", path7, 100))
          return;
        if (!isDirectory && this._watched.size === 1) {
          this.add(directory, item, true);
        }
        const wp = this._getWatchedDir(path7);
        const nestedDirectoryChildren = wp.getChildren();
        nestedDirectoryChildren.forEach((nested) => this._remove(path7, nested));
        const parent = this._getWatchedDir(directory);
        const wasTracked = parent.has(item);
        parent.remove(item);
        if (this._symlinkPaths.has(fullPath)) {
          this._symlinkPaths.delete(fullPath);
        }
        let relPath = path7;
        if (this.options.cwd)
          relPath = sysPath2.relative(this.options.cwd, path7);
        if (this.options.awaitWriteFinish && this._pendingWrites.has(relPath)) {
          const event = this._pendingWrites.get(relPath).cancelWait();
          if (event === EVENTS.ADD)
            return;
        }
        this._watched.delete(path7);
        this._watched.delete(fullPath);
        const eventName = isDirectory ? EVENTS.UNLINK_DIR : EVENTS.UNLINK;
        if (wasTracked && !this._isIgnored(path7))
          this._emit(eventName, path7);
        this._closePath(path7);
      }
      /**
       * Closes all watchers for a path
       */
      _closePath(path7) {
        this._closeFile(path7);
        const dir = sysPath2.dirname(path7);
        this._getWatchedDir(dir).remove(sysPath2.basename(path7));
      }
      /**
       * Closes only file-specific watchers
       */
      _closeFile(path7) {
        const closers = this._closers.get(path7);
        if (!closers)
          return;
        closers.forEach((closer) => closer());
        this._closers.delete(path7);
      }
      _addPathCloser(path7, closer) {
        if (!closer)
          return;
        let list = this._closers.get(path7);
        if (!list) {
          list = [];
          this._closers.set(path7, list);
        }
        list.push(closer);
      }
      _readdirp(root, opts) {
        if (this.closed)
          return;
        const options = { type: EVENTS.ALL, alwaysStat: true, lstat: true, ...opts, depth: 0 };
        let stream = readdirp(root, options);
        this._streams.add(stream);
        stream.once(STR_CLOSE, () => {
          stream = void 0;
        });
        stream.once(STR_END, () => {
          if (stream) {
            this._streams.delete(stream);
            stream = void 0;
          }
        });
        return stream;
      }
    };
    esm_default = { watch, FSWatcher };
  }
});

// standalone/server.ts
var http = __toESM(require("http"));
var fs4 = __toESM(require("fs"));
var path6 = __toESM(require("path"));
var crypto = __toESM(require("crypto"));

// node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);

// src/platform/StandaloneAdapter.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var os = __toESM(require("os"));
var import_events2 = require("events");
var CLAUDINE_HOME = path.join(os.homedir(), ".claudine");
var StandaloneAdapter = class {
  _config = {};
  _globalState = {};
  _globalStatePath;
  _configPath;
  constructor() {
    this._configPath = path.join(CLAUDINE_HOME, "config.json");
    this._globalStatePath = path.join(CLAUDINE_HOME, "global-state.json");
    this.loadConfig();
    this.loadGlobalState();
  }
  loadConfig() {
    try {
      if (fs.existsSync(this._configPath)) {
        this._config = JSON.parse(fs.readFileSync(this._configPath, "utf-8"));
      }
    } catch {
      this._config = {};
    }
  }
  loadGlobalState() {
    try {
      if (fs.existsSync(this._globalStatePath)) {
        this._globalState = JSON.parse(fs.readFileSync(this._globalStatePath, "utf-8"));
      }
    } catch {
      this._globalState = {};
    }
  }
  // ── Event emitters ───────────────────────────────────────────────
  createEventEmitter() {
    const ee = new import_events2.EventEmitter();
    const EVENT_NAME = "data";
    return {
      get event() {
        return (listener) => {
          ee.on(EVENT_NAME, listener);
          return { dispose: () => {
            ee.removeListener(EVENT_NAME, listener);
          } };
        };
      },
      fire: (data) => {
        ee.emit(EVENT_NAME, data);
      },
      dispose: () => {
        ee.removeAllListeners();
      }
    };
  }
  // ── File watching ────────────────────────────────────────────────
  _chokidar;
  watchFiles(basePath, globPattern, callbacks) {
    if (!this._chokidar) {
      throw new Error("Call initAsync() before watchFiles() in standalone mode");
    }
    const ext = globPattern.match(/\*\.(\w+)$/)?.[1];
    const matchesGlob = ext ? (filePath) => filePath.endsWith(`.${ext}`) : () => true;
    const watcher = this._chokidar.watch(basePath, {
      persistent: true,
      ignoreInitial: true,
      depth: 3,
      awaitWriteFinish: { stabilityThreshold: 200 }
    });
    if (callbacks.onCreate) {
      const cb = callbacks.onCreate;
      watcher.on("add", (p) => {
        if (matchesGlob(p)) cb(p);
      });
    }
    if (callbacks.onChange) {
      const cb = callbacks.onChange;
      watcher.on("change", (p) => {
        if (matchesGlob(p)) cb(p);
      });
    }
    if (callbacks.onDelete) {
      const cb = callbacks.onDelete;
      watcher.on("unlink", (p) => {
        if (matchesGlob(p)) cb(p);
      });
    }
    return { dispose: () => {
      watcher.close();
    } };
  }
  /** Load async dependencies (chokidar). Call once before using watchFiles(). */
  async initAsync() {
    this._chokidar = await Promise.resolve().then(() => (init_esm2(), esm_exports));
  }
  // ── Configuration ────────────────────────────────────────────────
  getConfig(key, defaultValue) {
    const value = this._config[key];
    return value !== void 0 ? value : defaultValue;
  }
  async setConfig(key, value) {
    this._config[key] = value;
    await this.ensureDirectory(CLAUDINE_HOME);
    await fs.promises.writeFile(
      this._configPath,
      JSON.stringify(this._config, null, 2)
    );
  }
  // ── File system ──────────────────────────────────────────────────
  async ensureDirectory(dirPath) {
    await fs.promises.mkdir(dirPath, { recursive: true });
  }
  async writeFile(filePath, data) {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, data);
  }
  async readFile(filePath) {
    return fs.promises.readFile(filePath);
  }
  async stat(filePath) {
    try {
      const s = await fs.promises.stat(filePath);
      return { size: s.size };
    } catch {
      return void 0;
    }
  }
  // ── Global state ─────────────────────────────────────────────────
  getGlobalState(key, defaultValue) {
    const value = this._globalState[key];
    return value !== void 0 ? value : defaultValue;
  }
  async setGlobalState(key, value) {
    this._globalState[key] = value;
    await this.ensureDirectory(CLAUDINE_HOME);
    await fs.promises.writeFile(
      this._globalStatePath,
      JSON.stringify(this._globalState, null, 2)
    );
  }
  // ── Secret storage ───────────────────────────────────────────────
  async getSecret(key) {
    const secretsPath = path.join(CLAUDINE_HOME, ".secrets.json");
    try {
      if (fs.existsSync(secretsPath)) {
        const secrets = JSON.parse(fs.readFileSync(secretsPath, "utf-8"));
        return secrets[key];
      }
    } catch {
    }
    return void 0;
  }
  async setSecret(key, value) {
    const secretsPath = path.join(CLAUDINE_HOME, ".secrets.json");
    let secrets = {};
    try {
      if (fs.existsSync(secretsPath)) {
        secrets = JSON.parse(fs.readFileSync(secretsPath, "utf-8"));
      }
    } catch {
    }
    secrets[key] = value;
    await this.ensureDirectory(CLAUDINE_HOME);
    await fs.promises.writeFile(secretsPath, JSON.stringify(secrets, null, 2));
  }
  // ── Storage paths ────────────────────────────────────────────────
  getGlobalStoragePath() {
    return path.join(CLAUDINE_HOME, "storage");
  }
  /** Standalone mode: return null to scan all projects. */
  getWorkspaceFolders() {
    return null;
  }
  // ── Extension context ────────────────────────────────────────────
  isDevelopmentMode() {
    return process.env.NODE_ENV === "development";
  }
  getExtensionPath() {
    return path.resolve(__dirname, "..");
  }
};

// src/constants.ts
var ARCHIVE_CHECK_INTERVAL_MS = 5 * 60 * 1e3;
var RECENTLY_ACTIVE_WINDOW_MS = 2 * 60 * 1e3;
var CLI_TIMEOUT_MS = 6e4;
var CLI_CHECK_TIMEOUT_MS = 5e3;
var MAX_IMAGE_FILE_SIZE_BYTES = 512 * 1024;
var MAX_TITLE_LENGTH = 80;
var MAX_DESCRIPTION_LENGTH = 200;
var MAX_LAST_MESSAGE_LENGTH = 120;
var MAX_MARKUP_STRIP_LENGTH = 1e4;
var MAX_IMAGE_PROMPT_LENGTH = 1e3;
var MAX_PARSE_CACHE_ENTRIES = 200;
var SAVE_STATE_DEBOUNCE_MS = 200;
var NOTIFY_COALESCE_MS = 50;
var SUMMARIZATION_BATCH_SIZE = 10;
var SUMMARIZATION_TITLE_MAX_LENGTH = 100;
var SUMMARIZATION_DESC_MAX_LENGTH = 200;
var SUMMARIZATION_MESSAGE_MAX_LENGTH = 200;
var MAX_COMMAND_RESULTS_HISTORY = 50;
var CATEGORY_CLASSIFICATION_MESSAGE_LIMIT = 5;
var NONCE_BYTES = 16;
var RATE_LIMIT_PATTERN = /You['\u2019]ve hit your limit.*?resets\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*\(([^)]+)\)/i;

// src/services/StateManager.ts
var StateManager = class _StateManager {
  constructor(_storageService, platform) {
    this._storageService = _storageService;
    this._onConversationsChanged = platform.createEventEmitter();
    this.onConversationsChanged = this._onConversationsChanged.event;
    this._onNeedsInput = platform.createEventEmitter();
    this.onNeedsInput = this._onNeedsInput.event;
    this._onRateLimitDetected = platform.createEventEmitter();
    this.onRateLimitDetected = this._onRateLimitDetected.event;
    this.ready = new Promise((resolve5) => {
      this._readyResolve = resolve5;
    });
    this.loadState();
  }
  _conversations = /* @__PURE__ */ new Map();
  _onConversationsChanged;
  _onNeedsInput;
  _onRateLimitDetected;
  onConversationsChanged;
  /** Fires when a conversation transitions into 'needs-input' status. */
  onNeedsInput;
  /** Fires when a conversation becomes rate-limited (transition from not-limited to limited). */
  onRateLimitDetected;
  /** Resolves when saved state has been loaded from disk. Await before scanning. */
  ready;
  _readyResolve;
  _saveTimer;
  _notifyTimer;
  _sortedCache = null;
  async loadState() {
    try {
      const savedState = await this._storageService.loadBoardState();
      if (savedState?.conversations) {
        for (const conv of savedState.conversations) {
          this._conversations.set(conv.id, {
            ...conv,
            createdAt: new Date(conv.createdAt),
            updatedAt: new Date(conv.updatedAt)
          });
        }
      }
    } finally {
      this._readyResolve();
    }
  }
  scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      const conversations = this.getConversations();
      this._storageService.saveBoardState({
        conversations,
        lastUpdated: /* @__PURE__ */ new Date()
      });
    }, SAVE_STATE_DEBOUNCE_MS);
  }
  /** Flush any pending debounced save immediately (e.g. on dispose). */
  flushSave() {
    if (this._saveTimer !== void 0) {
      clearTimeout(this._saveTimer);
      this._saveTimer = void 0;
      const conversations = this.getConversations();
      this._storageService.saveBoardState({
        conversations,
        lastUpdated: /* @__PURE__ */ new Date()
      });
    }
  }
  getConversations() {
    if (!this._sortedCache) {
      this._sortedCache = Array.from(this._conversations.values()).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }
    return this._sortedCache;
  }
  getConversation(id) {
    return this._conversations.get(id);
  }
  setConversations(conversations) {
    const scannedIds = new Set(conversations.map((c) => c.id));
    for (const id of this._conversations.keys()) {
      if (!scannedIds.has(id)) {
        this._conversations.delete(id);
      }
    }
    for (const conv of conversations) {
      const existing = this._conversations.get(conv.id);
      const prevStatus = existing?.status;
      const wasRateLimited = existing?.isRateLimited ?? false;
      this.mergeWithExisting(conv);
      this._conversations.set(conv.id, conv);
      if (conv.status === "needs-input" && prevStatus && prevStatus !== "needs-input") {
        this._onNeedsInput.fire(conv);
      }
      if (conv.isRateLimited && !wasRateLimited) {
        this._onRateLimitDetected.fire(conv);
      }
    }
    this.archiveStaleConversations();
    this.invalidateSort();
    this.notifyChange();
    this.scheduleSave();
  }
  updateConversation(conversation) {
    const existing = this._conversations.get(conversation.id);
    const wasRateLimited = existing?.isRateLimited ?? false;
    this.mergeWithExisting(conversation);
    this._conversations.set(conversation.id, conversation);
    if (conversation.isRateLimited && !wasRateLimited) {
      this._onRateLimitDetected.fire(conversation);
    }
    this.invalidateSort();
    this.notifyChange();
    this.scheduleSave();
  }
  /**
   * Merge an incoming (parsed) conversation with the existing one.
   *
   * Handles two key scenarios:
   * 1. Manual status overrides (done/cancelled/archived) are preserved until
   *    new activity is detected (updatedAt advances).
   * 2. Agent active→inactive transitions: when an agent was working (isActive)
   *    and becomes idle, the status is updated based on the conversation state
   *    and the status it had before the agent started working.
   *
   * IMPORTANT: `isActive` is based on a 2-minute time window, so it can flip
   * from true→false on a mere re-parse without any new content. We must only
   * trigger the transition when the JSONL file actually has new messages
   * (updatedAt advanced), not when the time window simply expires.
   */
  mergeWithExisting(conv) {
    const existing = this._conversations.get(conv.id);
    if (!existing) return;
    if (existing.icon && !conv.icon) {
      conv.icon = existing.icon;
    }
    const hasNewContent = conv.updatedAt.getTime() > existing.updatedAt.getTime();
    if (existing.status === "done" || existing.status === "cancelled" || existing.status === "archived") {
      if (!hasNewContent) {
        conv.status = existing.status;
        conv.previousStatus = existing.previousStatus;
        conv.updatedAt = existing.updatedAt;
        return;
      }
    }
    const wasActive = existing.agents.some((a) => a.isActive);
    const isNowActive = conv.agents.some((a) => a.isActive);
    if (hasNewContent && conv.status === "in-progress" && existing.status !== "in-progress") {
      conv.previousStatus = existing.status;
    } else {
      conv.previousStatus = existing.previousStatus;
    }
    if (wasActive && !isNowActive && hasNewContent) {
      const prev = conv.previousStatus;
      if (conv.hasError) {
        conv.status = "needs-input";
      } else if (conv.hasQuestion) {
        conv.status = "needs-input";
      } else if (prev === "done") {
        conv.status = "done";
      } else if (prev === "cancelled") {
        conv.status = "cancelled";
      } else if (prev === "in-review") {
        conv.status = "in-review";
      } else if (prev === "needs-input") {
        conv.status = "in-review";
      } else {
        conv.status = "in-review";
      }
      conv.previousStatus = void 0;
    }
    if (!hasNewContent && !isNowActive) {
      conv.status = existing.status;
    }
  }
  removeConversation(id) {
    this._conversations.delete(id);
    this.invalidateSort();
    this.notifyChange();
    this.scheduleSave();
  }
  moveConversation(id, newStatus) {
    const conversation = this._conversations.get(id);
    if (conversation) {
      conversation.previousStatus = void 0;
      conversation.status = newStatus;
      conversation.updatedAt = /* @__PURE__ */ new Date();
      this._conversations.set(id, conversation);
      this.invalidateSort();
      this.notifyChange();
      this.scheduleSave();
    }
  }
  setConversationIcon(id, icon) {
    const conversation = this._conversations.get(id);
    if (conversation) {
      conversation.icon = icon;
      this._conversations.set(id, conversation);
      this.invalidateSort();
      this.notifyChange();
      this.scheduleSave();
    }
  }
  async clearAllIcons() {
    for (const conv of this._conversations.values()) {
      conv.icon = void 0;
    }
    this.invalidateSort();
    this.notifyChange();
    this.scheduleSave();
  }
  getConversationsByStatus(status) {
    return this.getConversations().filter((c) => c.status === status);
  }
  /** Get all conversations currently paused due to a rate limit. */
  getRateLimitedConversations() {
    return this.getConversations().filter((c) => c.isRateLimited);
  }
  async saveDrafts(drafts) {
    await this._storageService.saveDrafts(drafts);
  }
  async loadDrafts() {
    return this._storageService.loadDrafts();
  }
  static ARCHIVE_THRESHOLD_MS = 4 * 60 * 60 * 1e3;
  // 4 hours
  archiveAllDone() {
    let changed = false;
    for (const conv of this._conversations.values()) {
      if (conv.status === "done" || conv.status === "cancelled") {
        conv.status = "archived";
        conv.updatedAt = /* @__PURE__ */ new Date();
        changed = true;
      }
    }
    if (changed) {
      this.invalidateSort();
      this.notifyChange();
      this.scheduleSave();
    }
  }
  archiveStaleConversations() {
    const now = Date.now();
    let changed = false;
    for (const conv of this._conversations.values()) {
      if ((conv.status === "done" || conv.status === "cancelled") && now - conv.updatedAt.getTime() >= _StateManager.ARCHIVE_THRESHOLD_MS) {
        conv.status = "archived";
        changed = true;
      }
    }
    if (changed) {
      this.invalidateSort();
      this.notifyChange();
      this.scheduleSave();
    }
  }
  invalidateSort() {
    this._sortedCache = null;
  }
  notifyChange() {
    clearTimeout(this._notifyTimer);
    this._notifyTimer = setTimeout(() => {
      this._onConversationsChanged.fire(this.getConversations());
    }, NOTIFY_COALESCE_MS);
  }
};

// src/services/StorageService.ts
var path2 = __toESM(require("path"));
var StorageService = class {
  constructor(_platform) {
    this._platform = _platform;
    this._globalStoragePath = _platform.getGlobalStoragePath();
    this.ensureStorageExists();
  }
  _globalStoragePath;
  async ensureStorageExists() {
    try {
      await this._platform.ensureDirectory(this._globalStoragePath);
    } catch {
    }
  }
  // Global storage methods (for extension-wide data)
  async saveGlobalSetting(key, value) {
    await this._platform.setGlobalState(key, value);
  }
  getGlobalSetting(key, defaultValue) {
    return this._platform.getGlobalState(key, defaultValue);
  }
  async saveIcon(conversationId, iconData) {
    const iconsDir = path2.join(this._globalStoragePath, "icons");
    const iconPath = path2.join(iconsDir, `${conversationId}.png`);
    try {
      await this._platform.ensureDirectory(iconsDir);
    } catch {
    }
    const buffer = Buffer.from(iconData.replace(/^data:image\/\w+;base64,/, ""), "base64");
    await this._platform.writeFile(iconPath, buffer);
  }
  async getIconPath(conversationId) {
    const iconPath = path2.join(this._globalStoragePath, "icons", `${conversationId}.png`);
    const stats = await this._platform.stat(iconPath);
    if (stats) {
      return iconPath;
    }
    return void 0;
  }
  // Workspace storage methods (for project-specific data)
  async saveBoardState(state) {
    const workspaceFolders = this._platform.getWorkspaceFolders();
    if (!workspaceFolders || workspaceFolders.length === 0) {
      await this.saveGlobalSetting("boardState", state);
      return;
    }
    const workspaceRoot = workspaceFolders[0];
    const claudinePath = path2.join(workspaceRoot, ".claudine");
    const statePath = path2.join(claudinePath, "state.json");
    try {
      await this._platform.ensureDirectory(claudinePath);
    } catch {
    }
    const stateJson = JSON.stringify(state, null, 2);
    await this._platform.writeFile(statePath, stateJson);
  }
  async loadBoardState() {
    const workspaceFolders = this._platform.getWorkspaceFolders();
    if (workspaceFolders && workspaceFolders.length > 0) {
      const statePath = path2.join(workspaceFolders[0], ".claudine", "state.json");
      try {
        const content = await this._platform.readFile(statePath);
        return JSON.parse(content.toString());
      } catch {
      }
    }
    return this.getGlobalSetting("boardState", null);
  }
  async saveWorkspaceIcon(conversationId, iconData) {
    const workspaceFolders = this._platform.getWorkspaceFolders();
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return void 0;
    }
    const claudinePath = path2.join(workspaceFolders[0], ".claudine");
    const iconsPath = path2.join(claudinePath, "icons");
    const iconPath = path2.join(iconsPath, `${conversationId}.png`);
    try {
      await this._platform.ensureDirectory(iconsPath);
    } catch {
    }
    const buffer = Buffer.from(iconData.replace(/^data:image\/\w+;base64,/, ""), "base64");
    await this._platform.writeFile(iconPath, buffer);
    return iconPath;
  }
  async saveDrafts(drafts) {
    const workspaceFolders = this._platform.getWorkspaceFolders();
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }
    const claudinePath = path2.join(workspaceFolders[0], ".claudine");
    const draftsPath = path2.join(claudinePath, "drafts.json");
    try {
      await this._platform.ensureDirectory(claudinePath);
    } catch {
    }
    await this._platform.writeFile(draftsPath, JSON.stringify(drafts, null, 2));
  }
  async loadDrafts() {
    const workspaceFolders = this._platform.getWorkspaceFolders();
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }
    const draftsPath = path2.join(workspaceFolders[0], ".claudine", "drafts.json");
    try {
      const content = await this._platform.readFile(draftsPath);
      return JSON.parse(content.toString());
    } catch {
      return [];
    }
  }
  getWorkspaceIconPath(conversationId) {
    const workspaceFolders = this._platform.getWorkspaceFolders();
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return void 0;
    }
    return path2.join(
      workspaceFolders[0],
      ".claudine",
      "icons",
      `${conversationId}.png`
    );
  }
};

// src/services/ImageGenerator.ts
var ImageGenerator = class {
  constructor(_storageService, _platform) {
    this._storageService = _storageService;
    this._platform = _platform;
  }
  async generateIcon(conversationId, title, description) {
    const apiType = this._platform.getConfig("imageGenerationApi", "none");
    if (apiType === "none") {
      return void 0;
    }
    const apiKey = await this._platform.getSecret("imageGenerationApiKey") ?? "";
    if (!apiKey) {
      console.warn("Claudine: Image generation API key not configured");
      return void 0;
    }
    try {
      const imagePrompt = this.createImagePrompt(title, description);
      let iconData;
      switch (apiType) {
        case "openai":
          iconData = await this.generateWithOpenAI(imagePrompt, apiKey);
          break;
        case "stability":
          iconData = await this.generateWithStability(imagePrompt, apiKey);
          break;
        default:
          return void 0;
      }
      if (iconData) {
        await this._storageService.saveIcon(conversationId, iconData);
        return iconData;
      }
      return void 0;
    } catch (error) {
      console.error("Claudine: Error generating icon", error);
      return void 0;
    }
  }
  createImagePrompt(title, description) {
    const context = `${title}. ${description}`.slice(0, MAX_IMAGE_PROMPT_LENGTH);
    return `Imagine you have to do a poster thumbnail for a task in a task list that is described like: ${context}.

- show only one illustration and don't split-screen it into four, two. Only one.
- Suitable for a software development task icon. 
- Use completely different styles: photorealistic, comics from different decades or hugely different color palettes.
- Understandable, expressive, distinguishable and unique. Different ideas.
- 128x128 pixels.`;
  }
  async generateWithOpenAI(prompt, apiKey) {
    try {
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt,
          n: 1,
          size: "1024x1024",
          quality: "low",
          output_format: "webp",
          output_compression: 80
        })
      });
      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }
      const data = await response.json();
      if (data.data && data.data[0]?.b64_json) {
        return `data:image/webp;base64,${data.data[0].b64_json}`;
      }
      return void 0;
    } catch (error) {
      console.error("Claudine: OpenAI image generation failed", error);
      return void 0;
    }
  }
  async generateWithStability(prompt, apiKey) {
    try {
      const response = await fetch(
        "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "Accept": "application/json"
          },
          body: JSON.stringify({
            text_prompts: [
              {
                text: prompt,
                weight: 1
              }
            ],
            cfg_scale: 7,
            height: 1024,
            width: 1024,
            samples: 1,
            steps: 30
          })
        }
      );
      if (!response.ok) {
        throw new Error(`Stability API error: ${response.status}`);
      }
      const data = await response.json();
      if (data.artifacts && data.artifacts[0]?.base64) {
        return `data:image/png;base64,${data.artifacts[0].base64}`;
      }
      return void 0;
    } catch (error) {
      console.error("Claudine: Stability image generation failed", error);
      return void 0;
    }
  }
  // Generate a deterministic placeholder icon based on the conversation ID
  generatePlaceholderIcon(conversationId, category) {
    const colors = {
      "bug": "#ef4444",
      "user-story": "#3b82f6",
      "feature": "#10b981",
      "improvement": "#f59e0b",
      "task": "#6b7280"
    };
    const color = colors[category] || "#6b7280";
    const hash = this.hashString(conversationId);
    const pattern = this.generatePattern(hash);
    return `data:image/svg+xml,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
        <rect width="64" height="64" fill="${color}" opacity="0.1"/>
        ${pattern}
      </svg>
    `.trim())}`;
  }
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
  generatePattern(hash) {
    const shapes = [];
    const color = `hsl(${hash % 360}, 60%, 50%)`;
    const numShapes = 3 + hash % 3;
    for (let i = 0; i < numShapes; i++) {
      const shapeType = (hash + i) % 3;
      const x = 10 + hash * (i + 1) % 44;
      const y = 10 + hash * (i + 2) % 44;
      const size = 8 + hash * (i + 3) % 12;
      switch (shapeType) {
        case 0:
          shapes.push(`<circle cx="${x}" cy="${y}" r="${size / 2}" fill="${color}" opacity="0.7"/>`);
          break;
        case 1:
          shapes.push(`<rect x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" fill="${color}" opacity="0.7"/>`);
          break;
        case 2:
          shapes.push(`<polygon points="${x},${y - size / 2} ${x + size / 2},${y + size / 2} ${x - size / 2},${y + size / 2}" fill="${color}" opacity="0.7"/>`);
          break;
      }
    }
    return shapes.join("\n");
  }
};

// src/providers/ClaudeCodeWatcher.ts
var path4 = __toESM(require("path"));
var os3 = __toESM(require("os"));
var fs2 = __toESM(require("fs"));

// src/providers/ConversationParser.ts
var path3 = __toESM(require("path"));
var fsp = __toESM(require("fs/promises"));

// src/services/CategoryClassifier.ts
var CategoryClassifier = class {
  _rules = [
    {
      category: "bug",
      keywords: [
        "fix",
        "bug",
        "error",
        "broken",
        "issue",
        "problem",
        "crash",
        "not working",
        "fails",
        "failing",
        "wrong",
        "incorrect",
        "debug"
      ],
      patterns: [
        /fix\s+(the\s+)?bug/i,
        /error\s+(in|with|when)/i,
        /not\s+working/i,
        /broken\s+\w+/i,
        /crash(es|ing)?/i
      ],
      weight: 10
    },
    {
      category: "user-story",
      keywords: [
        "as a user",
        "i want",
        "so that",
        "user can",
        "users should",
        "user story",
        "user experience",
        "ux",
        "customer"
      ],
      patterns: [
        /as\s+a\s+(user|developer|admin)/i,
        /i\s+want\s+to/i,
        /so\s+that\s+i\s+can/i,
        /user\s+(can|should|will)/i
      ],
      weight: 10
    },
    {
      category: "feature",
      keywords: [
        "add",
        "create",
        "implement",
        "build",
        "new",
        "feature",
        "functionality",
        "capability",
        "support for"
      ],
      patterns: [
        /add\s+(a\s+)?(new\s+)?feature/i,
        /implement\s+\w+/i,
        /create\s+(a\s+)?(new\s+)?/i,
        /build\s+(a\s+)?/i,
        /new\s+functionality/i
      ],
      weight: 8
    },
    {
      category: "improvement",
      keywords: [
        "improve",
        "optimize",
        "refactor",
        "enhance",
        "better",
        "performance",
        "clean up",
        "simplify",
        "update",
        "upgrade"
      ],
      patterns: [
        /improve\s+(the\s+)?/i,
        /optimize\s+/i,
        /refactor\s+/i,
        /make\s+\w+\s+better/i,
        /clean\s*up/i,
        /performance/i
      ],
      weight: 7
    },
    {
      category: "task",
      keywords: [
        "setup",
        "configure",
        "install",
        "update",
        "change",
        "move",
        "rename",
        "delete",
        "remove",
        "documentation",
        "docs",
        "readme",
        "test",
        "tests",
        "chore"
      ],
      patterns: [
        /set\s*up/i,
        /configure\s+/i,
        /update\s+(the\s+)?/i,
        /write\s+(the\s+)?(docs|documentation)/i,
        /add\s+tests/i
      ],
      weight: 5
    }
  ];
  classify(title, description, messages) {
    const text = this.extractText(title, description, messages);
    const scores = this.calculateScores(text);
    let maxScore = 0;
    let bestCategory = "task";
    for (const [category, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        bestCategory = category;
      }
    }
    return bestCategory;
  }
  extractText(title, description, messages) {
    const parts = [title, description];
    for (const message of messages.slice(0, CATEGORY_CLASSIFICATION_MESSAGE_LIMIT)) {
      if (message.textContent) {
        parts.push(message.textContent);
      }
    }
    return parts.join(" ").toLowerCase();
  }
  calculateScores(text) {
    const scores = {
      "bug": 0,
      "user-story": 0,
      "feature": 0,
      "improvement": 0,
      "task": 0
    };
    for (const rule of this._rules) {
      let ruleScore = 0;
      for (const keyword of rule.keywords) {
        if (text.includes(keyword.toLowerCase())) {
          ruleScore += 1;
        }
      }
      for (const pattern of rule.patterns) {
        if (pattern.test(text)) {
          ruleScore += 2;
        }
      }
      scores[rule.category] += ruleScore * rule.weight;
    }
    return scores;
  }
  getCategoryColor(category) {
    const colors = {
      "bug": "#ef4444",
      // Red
      "user-story": "#3b82f6",
      // Blue
      "feature": "#10b981",
      // Green
      "improvement": "#f59e0b",
      // Yellow/Amber
      "task": "#6b7280"
      // Gray
    };
    return colors[category];
  }
  getCategoryIcon(category) {
    const icons = {
      "bug": "\u{1F41B}",
      "user-story": "\u{1F464}",
      "feature": "\u2728",
      "improvement": "\u{1F4C8}",
      "task": "\u{1F4CB}"
    };
    return icons[category];
  }
};

// src/providers/ConversationParser.ts
var MAX_SIDECHAIN_STEPS = 3;
var ConversationParser = class _ConversationParser {
  _classifier;
  _cache = /* @__PURE__ */ new Map();
  constructor() {
    this._classifier = new CategoryClassifier();
  }
  /** Number of files currently held in the incremental parse cache. */
  get cacheSize() {
    return this._cache.size;
  }
  /** Clear the parse cache for a specific file (e.g. on deletion). */
  clearCache(filePath) {
    this._cache.delete(filePath);
  }
  /** Promote a key to most-recently-used and evict the oldest if over limit. */
  touchCache(key, value) {
    this._cache.delete(key);
    this._cache.set(key, value);
    if (this._cache.size > MAX_PARSE_CACHE_ENTRIES) {
      const oldest = this._cache.keys().next().value;
      if (oldest !== void 0) {
        this._cache.delete(oldest);
      }
    }
  }
  async parseFile(filePath) {
    try {
      if (!filePath.endsWith(".jsonl")) return null;
      const cached = this._cache.get(filePath);
      let fileSize;
      try {
        fileSize = (await fsp.stat(filePath)).size;
      } catch {
        return null;
      }
      if (fileSize === 0) return null;
      if (cached && cached.byteOffset > fileSize) {
        this._cache.delete(filePath);
        return this.parseFile(filePath);
      }
      if (cached && cached.byteOffset === fileSize) {
        this.touchCache(filePath, cached);
        if (cached.messages.length === 0) return null;
        return await this.buildConversation(filePath, cached.messages, cached.firstTimestamp, cached.lastTimestamp, cached.gitBranch, cached.sidechainSteps);
      }
      if (cached && cached.byteOffset < fileSize) {
        const result = await this.parseIncremental(filePath, cached, fileSize);
        this.touchCache(filePath, cached);
        return result;
      }
      return await this.parseFullFile(filePath, fileSize);
    } catch (error) {
      console.error(`Claudine: Error parsing file ${filePath}:`, error);
      return null;
    }
  }
  async parseFullFile(filePath, fileSize) {
    const content = await fsp.readFile(filePath, "utf-8");
    if (!content.trim()) return null;
    const cache = {
      byteOffset: fileSize,
      messages: [],
      sidechainSteps: [],
      firstTimestamp: void 0,
      lastTimestamp: void 0,
      gitBranch: void 0
    };
    this.parseLines(content, cache);
    this.touchCache(filePath, cache);
    if (cache.messages.length === 0) return null;
    return await this.buildConversation(filePath, cache.messages, cache.firstTimestamp, cache.lastTimestamp, cache.gitBranch, cache.sidechainSteps);
  }
  async parseIncremental(filePath, cached, fileSize) {
    const handle = await fsp.open(filePath, "r");
    try {
      const newSize = fileSize - cached.byteOffset;
      const buffer = Buffer.alloc(newSize);
      await handle.read(buffer, 0, newSize, cached.byteOffset);
      const newContent = buffer.toString("utf-8");
      this.parseLines(newContent, cached);
      cached.byteOffset = fileSize;
    } finally {
      await handle.close();
    }
    if (cached.messages.length === 0) return null;
    return await this.buildConversation(filePath, cached.messages, cached.firstTimestamp, cached.lastTimestamp, cached.gitBranch, cached.sidechainSteps);
  }
  /** Parse raw JSONL lines and accumulate results into the cache. */
  parseLines(content, cache) {
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed);
        if (entry.timestamp) {
          if (!cache.firstTimestamp) cache.firstTimestamp = entry.timestamp;
          cache.lastTimestamp = entry.timestamp;
        }
        if (entry.gitBranch && entry.gitBranch !== "HEAD") {
          cache.gitBranch = entry.gitBranch;
        }
        if (entry.type !== "user" && entry.type !== "assistant" || !entry.message) {
          continue;
        }
        if (entry.isSidechain) {
          this.collectSidechainStep(entry, cache);
          continue;
        }
        const parsed = this.parseMessage(entry);
        if (parsed) {
          cache.messages.push(parsed);
        }
      } catch {
      }
    }
  }
  /** Extract a sidechain activity step from a sidechain JSONL entry. */
  collectSidechainStep(entry, cache) {
    if (!entry.message) return;
    const content = entry.message.content || [];
    const role = entry.message.role;
    const toolUse = content.find((b) => b.type === "tool_use" && b.name);
    const toolResult = content.find((b) => b.type === "tool_result");
    const toolName = toolUse?.name;
    let step;
    if (role === "assistant" && toolUse) {
      step = { status: "running", toolName };
    } else if (role === "user" && toolResult) {
      const isError = toolResult.is_error === true;
      const resultText = typeof toolResult.content === "string" ? toolResult.content : "";
      const hasErrorPattern = isError || /error|exit code [1-9]/i.test(resultText);
      step = { status: hasErrorPattern ? "failed" : "completed", toolName };
    } else if (role === "assistant" && content.some((b) => b.type === "text" && b.text)) {
      step = { status: "completed" };
    } else {
      return;
    }
    cache.sidechainSteps.push(step);
    if (cache.sidechainSteps.length > MAX_SIDECHAIN_STEPS) {
      cache.sidechainSteps.splice(0, cache.sidechainSteps.length - MAX_SIDECHAIN_STEPS);
    }
  }
  parseMessage(entry) {
    if (!entry.message) return null;
    const role = entry.message.role;
    if (role !== "user" && role !== "assistant") return null;
    const contentBlocks = entry.message.content || [];
    const textParts = [];
    const toolUses = [];
    let hasError = false;
    let isInterrupted = false;
    let hasQuestion = false;
    let isRateLimited = false;
    let rateLimitResetDisplay;
    let rateLimitResetTime;
    const messageDate = entry.timestamp ? new Date(entry.timestamp) : void 0;
    for (const block of contentBlocks) {
      if (block.type === "text" && block.text) {
        textParts.push(block.text);
        const rlMatch = block.text.match(RATE_LIMIT_PATTERN);
        if (rlMatch) {
          isRateLimited = true;
          const timeStr = rlMatch[1];
          const tz = rlMatch[2];
          rateLimitResetDisplay = `${timeStr} (${tz})`;
          rateLimitResetTime = _ConversationParser.parseResetTime(timeStr, tz, messageDate);
        }
      } else if (block.type === "tool_use" && block.name) {
        toolUses.push({
          name: block.name,
          input: this.trimToolInput(block.name, block.input || {})
        });
        if (block.name === "AskUserQuestion" || block.name === "ExitPlanMode") {
          hasQuestion = true;
        }
      } else if (block.type === "tool_result") {
        const resultText = typeof block.content === "string" ? block.content : Array.isArray(block.content) ? block.content.filter((b) => b.type === "text").map((b) => b.text || "").join("\n") : "";
        if (/tool interrupted/i.test(resultText)) {
          isInterrupted = true;
        }
        if (/API Error:\s*\d{3}/i.test(resultText)) {
          hasError = true;
        }
        const rlMatch = resultText.match(RATE_LIMIT_PATTERN);
        if (rlMatch) {
          isRateLimited = true;
          const timeStr = rlMatch[1];
          const tz = rlMatch[2];
          rateLimitResetDisplay = `${timeStr} (${tz})`;
          rateLimitResetTime = _ConversationParser.parseResetTime(timeStr, tz, messageDate);
        }
      }
    }
    if (entry.toolUseResult?.interrupted) {
      isInterrupted = true;
    }
    const textContent = textParts.join("\n");
    return {
      role,
      textContent,
      toolUses,
      timestamp: entry.timestamp,
      gitBranch: entry.gitBranch,
      hasError,
      isInterrupted,
      hasQuestion,
      isRateLimited,
      rateLimitResetDisplay,
      rateLimitResetTime
    };
  }
  /** Keep only the fields we actually use from tool inputs, discarding large payloads. */
  trimToolInput(toolName, input) {
    if (toolName === "Task") {
      const trimmed = {};
      if (input.subagent_type) trimmed.subagent_type = input.subagent_type;
      if (input.description) trimmed.description = input.description;
      return trimmed;
    }
    if (toolName === "Read") {
      const trimmed = {};
      if (input.file_path) trimmed.file_path = input.file_path;
      return trimmed;
    }
    if (toolName === "AskUserQuestion") {
      const trimmed = {};
      if (input.question) trimmed.question = input.question;
      return trimmed;
    }
    return {};
  }
  async buildConversation(filePath, messages, firstTimestamp, lastTimestamp, gitBranch, sidechainSteps = []) {
    const id = this.extractSessionId(filePath);
    const title = this.extractTitle(messages);
    const description = this.extractDescription(messages);
    const lastMessage = this.extractLastMessage(messages);
    if (title === "Untitled Conversation" && !description && !lastMessage) {
      return null;
    }
    const status = this.detectStatus(messages);
    const category = this._classifier.classify(title, description, messages);
    const agents = this.detectAgents(messages);
    const hasError = this.hasRecentError(messages);
    const isInterrupted = this.hasRecentInterruption(messages);
    const hasQuestion = this.hasRecentQuestion(messages);
    const isRateLimited = this.hasRecentRateLimit(messages);
    const rateLimitInfo = isRateLimited ? this.extractRateLimitInfo(messages) : {};
    const createdAt = firstTimestamp ? new Date(firstTimestamp) : /* @__PURE__ */ new Date();
    const updatedAt = lastTimestamp ? new Date(lastTimestamp) : /* @__PURE__ */ new Date();
    return {
      id,
      title,
      description,
      category,
      status,
      lastMessage,
      agents,
      gitBranch: gitBranch || this.detectGitBranchFromMessages(messages),
      hasError,
      errorMessage: hasError ? this.extractErrorMessage(messages) : void 0,
      isInterrupted,
      hasQuestion,
      isRateLimited,
      rateLimitResetDisplay: rateLimitInfo.display,
      rateLimitResetTime: rateLimitInfo.time,
      sidechainSteps: sidechainSteps.length > 0 ? sidechainSteps : void 0,
      referencedImage: this.extractReferencedImage(messages),
      createdAt,
      updatedAt,
      filePath,
      workspacePath: await this.extractWorkspacePath(filePath)
    };
  }
  extractSessionId(filePath) {
    return path3.basename(filePath, ".jsonl");
  }
  extractTitle(messages) {
    const firstUser = messages.find((m) => m.role === "user" && m.textContent.trim());
    if (!firstUser) return "Untitled Conversation";
    const content = this.stripMarkupTags(firstUser.textContent.trim());
    if (!content) return "Untitled Conversation";
    const firstLine = content.split("\n")[0];
    return firstLine.length > MAX_TITLE_LENGTH ? firstLine.slice(0, MAX_TITLE_LENGTH - 3) + "..." : firstLine;
  }
  /** Strip XML-like tags and their content (ide_opened_file, system-reminder, etc.) */
  stripMarkupTags(text) {
    const capped = text.length > MAX_MARKUP_STRIP_LENGTH ? text.slice(0, MAX_MARKUP_STRIP_LENGTH) : text;
    return capped.replace(/<[^>]+>[^<]*<\/[^>]+>/g, "").trim();
  }
  extractDescription(messages) {
    const firstAssistant = messages.find((m) => m.role === "assistant" && m.textContent.trim());
    if (!firstAssistant) return "";
    const content = firstAssistant.textContent.trim();
    const firstPara = content.split("\n\n")[0];
    return firstPara.length > MAX_DESCRIPTION_LENGTH ? firstPara.slice(0, MAX_DESCRIPTION_LENGTH - 3) + "..." : firstPara;
  }
  extractLastMessage(messages) {
    const reversed = [...messages].reverse();
    const lastAssistant = reversed.find((m) => m.role === "assistant" && m.textContent.trim());
    if (!lastAssistant) return "";
    const content = lastAssistant.textContent.trim();
    const lines = content.split("\n").filter((l) => l.trim());
    const lastLine = lines[lines.length - 1] || "";
    return lastLine.length > MAX_LAST_MESSAGE_LENGTH ? lastLine.slice(0, MAX_LAST_MESSAGE_LENGTH - 3) + "..." : lastLine;
  }
  detectStatus(messages) {
    if (messages.length === 0) return "todo";
    const hasAssistant = messages.some((m) => m.role === "assistant");
    if (!hasAssistant) return "todo";
    const lastMessage = messages[messages.length - 1];
    const recentMessages = messages.slice(-3);
    if (recentMessages.some((m) => m.hasError)) {
      return "needs-input";
    }
    if (recentMessages.some((m) => m.isRateLimited)) {
      return "needs-input";
    }
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant) {
      const content = lastAssistant.textContent.toLowerCase();
      if (lastAssistant.toolUses.some(
        (t) => t.name === "AskUserQuestion" || t.name === "ExitPlanMode"
      )) {
        return "needs-input";
      }
      if (/\b(would you like|do you want|shall i|should i\b(?!\w)|please (confirm|approve|review)|which (option|approach) (would|do|should))\b/i.test(content)) {
        if (lastAssistant === lastMessage) {
          return "needs-input";
        }
      }
      if (/\b(all (done|set|changes)|completed?|finished|i've (made|completed|finished|implemented)|successfully|here's a summary)\b/i.test(content)) {
        return "in-review";
      }
    }
    if (lastMessage.role === "user") {
      return "in-progress";
    }
    if (lastMessage.role === "assistant" && lastMessage.toolUses.length > 0) {
      return "in-progress";
    }
    return "in-review";
  }
  detectAgents(messages) {
    const agents = [];
    const seenTypes = /* @__PURE__ */ new Set();
    agents.push({
      id: "claude-main",
      name: "Claude",
      avatar: "",
      isActive: this.isRecentlyActive(messages)
    });
    for (const message of messages) {
      for (const tool of message.toolUses) {
        if (tool.name === "Task") {
          const subType = tool.input?.subagent_type;
          const desc = tool.input?.description;
          if (subType && !seenTypes.has(subType)) {
            seenTypes.add(subType);
            agents.push({
              id: `agent-${subType}`,
              name: desc || subType,
              avatar: "",
              isActive: false
            });
          }
        }
      }
    }
    return agents;
  }
  /** Only flag errors from the latest message exchange (last user msg onward) */
  hasRecentError(messages) {
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return false;
    return messages.slice(lastUserIdx).some((m) => m.hasError);
  }
  /** Check if the latest exchange has a tool interruption or stalled session. */
  hasRecentInterruption(messages) {
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx !== -1 && messages.slice(lastUserIdx).some((m) => m.isInterrupted)) {
      return true;
    }
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === "user" && /interrupted by user|request interrupted|\[interrupted\]/i.test(lastMsg.textContent)) {
      return true;
    }
    if (lastMsg.role === "assistant" && lastMsg.toolUses.length > 0 && !lastMsg.hasQuestion) {
      return !this.isRecentlyActive(messages);
    }
    return false;
  }
  /** Check if the last assistant message asks an explicit question or awaits permission. */
  hasRecentQuestion(messages) {
    if (this.hasRecentInterruption(messages)) return false;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return false;
    if (lastAssistant.hasQuestion) return true;
    return false;
  }
  /** Check if any recent message carries a rate limit notice that hasn't expired yet. */
  hasRecentRateLimit(messages) {
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return false;
    const now = Date.now();
    return messages.slice(lastUserIdx).some((m) => {
      if (!m.isRateLimited) return false;
      if (m.rateLimitResetTime) {
        return new Date(m.rateLimitResetTime).getTime() > now;
      }
      if (m.timestamp) {
        return now - new Date(m.timestamp).getTime() < 6 * 60 * 60 * 1e3;
      }
      return true;
    });
  }
  /** Extract rate limit reset info from the most recent rate-limited message. */
  extractRateLimitInfo(messages) {
    for (const msg of [...messages].reverse()) {
      if (msg.isRateLimited) {
        return { display: msg.rateLimitResetDisplay, time: msg.rateLimitResetTime };
      }
    }
    return {};
  }
  /**
   * Parse a human-readable reset time (e.g. "10am", "2:30pm") in a given timezone
   * into the next occurrence after `referenceDate` as an ISO 8601 string.
   *
   * When `referenceDate` is provided (e.g. the message timestamp), the result is
   * anchored to that moment — so a stale rate-limit message from yesterday produces
   * a past date that callers can compare against `now` to detect expiry.
   */
  static parseResetTime(timeStr, timezone, referenceDate) {
    try {
      const match = timeStr.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
      if (!match) return void 0;
      let hours = parseInt(match[1], 10);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      const meridiem = match[3].toLowerCase();
      if (meridiem === "pm" && hours < 12) hours += 12;
      if (meridiem === "am" && hours === 12) hours = 0;
      const ref = referenceDate || /* @__PURE__ */ new Date();
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
      const parts = formatter.formatToParts(ref);
      const get = (type) => parts.find((p) => p.type === type)?.value || "0";
      const currentYear = parseInt(get("year"), 10);
      const currentMonth = parseInt(get("month"), 10);
      const currentDay = parseInt(get("day"), 10);
      const currentHour = parseInt(get("hour"), 10);
      const currentMinute = parseInt(get("minute"), 10);
      let resetDay = currentDay;
      if (hours < currentHour || hours === currentHour && minutes <= currentMinute) {
        resetDay += 1;
      }
      const tzDate = /* @__PURE__ */ new Date(
        `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(resetDay).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`
      );
      const utcFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
      const localParts = utcFormatter.formatToParts(tzDate);
      const localHour = parseInt(localParts.find((p) => p.type === "hour")?.value || "0", 10);
      const localMinute = parseInt(localParts.find((p) => p.type === "minute")?.value || "0", 10);
      const wantedMinutes = hours * 60 + minutes;
      const gotMinutes = localHour * 60 + localMinute;
      const offsetMs = (gotMinutes - wantedMinutes) * 60 * 1e3;
      const corrected = new Date(tzDate.getTime() - offsetMs);
      if (corrected.getTime() <= ref.getTime()) {
        corrected.setTime(corrected.getTime() + 24 * 60 * 60 * 1e3);
      }
      return corrected.toISOString();
    } catch {
      return void 0;
    }
  }
  isRecentlyActive(messages) {
    const last = messages[messages.length - 1];
    if (!last?.timestamp) return false;
    return Date.now() - new Date(last.timestamp).getTime() < RECENTLY_ACTIVE_WINDOW_MS;
  }
  extractErrorMessage(messages) {
    for (const msg of [...messages.slice(-5)].reverse()) {
      if (msg.hasError) {
        const apiMatch = msg.textContent.match(/API Error:\s*\d{3}\s*(.{0,100})/i);
        if (apiMatch) return `API Error: ${apiMatch[0].slice(0, 100)}`;
        return "Tool interrupted";
      }
    }
    return "An error occurred";
  }
  detectGitBranchFromMessages(messages) {
    for (const msg of [...messages].reverse()) {
      if (msg.gitBranch && msg.gitBranch !== "HEAD") return msg.gitBranch;
    }
    for (const msg of messages) {
      const match = msg.textContent.match(/(?:branch|checkout\s+-b)\s+([a-zA-Z0-9\-_/]+)/i);
      if (match) return match[1];
    }
    return void 0;
  }
  static IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg)$/i;
  /**
   * Find the first image file referenced in the conversation.
   * Checks Read tool calls and user text for @-referenced image paths.
   */
  extractReferencedImage(messages) {
    for (const msg of messages) {
      for (const tool of msg.toolUses) {
        if (tool.name === "Read") {
          const fp = tool.input?.file_path;
          if (fp && _ConversationParser.IMAGE_EXTENSIONS.test(fp)) {
            return fp;
          }
        }
      }
    }
    for (const msg of messages) {
      if (msg.role !== "user") continue;
      const match = msg.textContent.match(/(?:^|\s|@)((?:\/|\.\.?\/)[^\s]+\.(png|jpe?g|gif|webp|svg))\b/i);
      if (match) return match[1];
    }
    return void 0;
  }
  /**
   * Extract the workspace path from a conversation file path.
   * The encoded directory name (e.g. `-Users-matthias-Development-ai-stick`) is lossy
   * — dashes in the original path are indistinguishable from separator dashes.
   * Instead of guessing, check the actual filesystem for matching paths.
   */
  async extractWorkspacePath(filePath) {
    const parts = filePath.split(path3.sep);
    const projectsIndex = parts.indexOf("projects");
    if (projectsIndex === -1 || !parts[projectsIndex + 1]) return void 0;
    const encoded = parts[projectsIndex + 1];
    const segments = encoded.split("-").filter(Boolean);
    let current = path3.sep;
    let i = 0;
    while (i < segments.length) {
      let found = false;
      for (let len = segments.length - i; len >= 1; len--) {
        const candidate = segments.slice(i, i + len).join("-");
        const testPath = path3.join(current, candidate);
        if (await this.pathExists(testPath)) {
          current = testPath;
          i += len;
          found = true;
          break;
        }
      }
      if (!found) {
        current = path3.join(current, segments[i]);
        i++;
      }
    }
    return await this.pathExists(current) ? current : void 0;
  }
  async pathExists(p) {
    try {
      await fsp.access(p);
      return true;
    } catch {
      return false;
    }
  }
};

// src/services/SummaryService.ts
var os2 = __toESM(require("os"));
var import_child_process = require("child_process");
var CHILD_ENV = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  LANG: process.env.LANG,
  TERM: process.env.TERM
};
var SummaryService = class {
  _cache = {};
  _pending = /* @__PURE__ */ new Set();
  _claudeAvailable;
  _claudePath;
  _platform;
  init(platform) {
    this._platform = platform;
    this._cache = platform.getGlobalState("summaryCache", {});
  }
  /** Apply cached summary to a conversation. Returns true if cache hit. */
  applyCached(conversation) {
    const cached = this._cache[conversation.id];
    if (!cached) return false;
    conversation.originalTitle = conversation.title;
    conversation.originalDescription = conversation.description;
    conversation.title = cached.title;
    conversation.description = cached.description;
    conversation.lastMessage = cached.lastMessage;
    return true;
  }
  /** Check whether a conversation already has a cached summary. */
  hasCached(id) {
    return id in this._cache;
  }
  /** Remove cache entries for conversations that no longer exist. */
  pruneCache(activeIds) {
    let pruned = false;
    for (const id of Object.keys(this._cache)) {
      if (!activeIds.has(id)) {
        delete this._cache[id];
        pruned = true;
      }
    }
    if (pruned) {
      this.saveCache();
    }
  }
  /**
   * Summarize uncached conversations via the Claude Code CLI.
   * Fire-and-forget: calls onUpdate for each completed summary.
   */
  summarizeUncached(conversations, onUpdate) {
    const enabled = this._platform?.getConfig("enableSummarization", false) ?? false;
    if (!enabled) return;
    this.pruneCache(new Set(conversations.map((c) => c.id)));
    const uncached = conversations.filter((c) => !this._cache[c.id] && !this._pending.has(c.id));
    if (uncached.length === 0) return;
    for (const c of uncached) this._pending.add(c.id);
    this.processBatches(uncached, onUpdate).catch((error) => {
      console.error("Claudine: Summarization failed", error);
    });
  }
  async processBatches(conversations, onUpdate) {
    if (this._claudeAvailable === void 0) {
      this._claudeAvailable = await this.checkClaudeAvailable();
    }
    if (!this._claudeAvailable) {
      for (const c of conversations) this._pending.delete(c.id);
      return;
    }
    for (let i = 0; i < conversations.length; i += SUMMARIZATION_BATCH_SIZE) {
      const batch = conversations.slice(i, i + SUMMARIZATION_BATCH_SIZE);
      try {
        const summaries = await this.callClaude(batch);
        for (let j = 0; j < batch.length && j < summaries.length; j++) {
          const conv = batch[j];
          const raw = summaries[j];
          if (raw) {
            const summary = {
              title: raw.title || conv.title,
              description: raw.description || conv.description,
              lastMessage: raw.lastMessage || conv.lastMessage
            };
            this._cache[conv.id] = summary;
            this._pending.delete(conv.id);
            onUpdate(conv.id, summary);
          }
        }
        this.saveCache();
      } catch (error) {
        console.error("Claudine: Summarization batch failed", error);
        for (const c of batch) this._pending.delete(c.id);
      }
    }
  }
  callClaude(conversations) {
    return new Promise((resolve5, reject) => {
      const entries = conversations.map(
        (c, i) => `${i + 1}.
  title: ${c.title.slice(0, SUMMARIZATION_TITLE_MAX_LENGTH)}
  desc: ${c.description.slice(0, SUMMARIZATION_DESC_MAX_LENGTH)}
  latest: ${c.lastMessage.slice(0, SUMMARIZATION_MESSAGE_MAX_LENGTH)}`
      ).join("\n\n");
      const prompt = `Summarize these coding conversations for compact Kanban board cards.
Rules per entry:
- title: max 8 words, imperative style (e.g. "Fix login page auth bug")
- description: 1 sentence, max 15 words
- lastMessage: keep as-is or shorten to 1 line

${entries}

Return ONLY a JSON array in the same order: [{"title":"...","description":"...","lastMessage":"..."}]`;
      let stdout = "";
      let stderr = "";
      const claudePath = this._claudePath;
      const child = (0, import_child_process.spawn)(claudePath, ["-p"], {
        cwd: os2.tmpdir(),
        timeout: CLI_TIMEOUT_MS,
        env: CHILD_ENV
      });
      child.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      child.on("error", (err) => reject(err));
      child.on("close", (code) => {
        if (code !== 0) {
          return reject(new Error(`claude exited with code ${code}`));
        }
        try {
          const match = stdout.match(/\[[\s\S]*\]/);
          if (!match) return reject(new Error("No JSON array in Claude response"));
          const results = JSON.parse(match[0]);
          if (!Array.isArray(results)) return reject(new Error("Claude response is not an array"));
          resolve5(results.map((r) => ({
            title: typeof r.title === "string" ? r.title : void 0,
            description: typeof r.description === "string" ? r.description : void 0,
            lastMessage: typeof r.lastMessage === "string" ? r.lastMessage : void 0
          })));
        } catch (e) {
          reject(e);
        }
      });
      child.stdin.write(prompt);
      child.stdin.end();
    });
  }
  checkClaudeAvailable() {
    return new Promise((resolve5) => {
      (0, import_child_process.execFile)("which", ["claude"], { timeout: CLI_CHECK_TIMEOUT_MS, env: CHILD_ENV }, (err, stdout) => {
        if (err || !stdout.trim()) {
          console.log("Claudine: Claude CLI not found in PATH, skipping summarization");
          return resolve5(false);
        }
        this._claudePath = stdout.trim();
        const child = (0, import_child_process.spawn)(this._claudePath, ["--version"], { timeout: CLI_CHECK_TIMEOUT_MS, env: CHILD_ENV });
        child.on("error", () => {
          console.log("Claudine: Claude CLI not available, skipping summarization");
          resolve5(false);
        });
        child.on("close", (code) => {
          if (code !== 0) {
            console.log("Claudine: Claude CLI not available, skipping summarization");
          }
          resolve5(code === 0);
        });
      });
    });
  }
  saveCache() {
    this._platform?.setGlobalState("summaryCache", this._cache);
  }
};

// src/providers/ClaudeCodeWatcher.ts
var EXCLUDED_PATH_PATTERNS = [
  /\/var\/folders\//,
  // macOS temp (also /private/var/folders/)
  /\/tmp\//,
  // Unix /tmp
  /\\Temp\\/i,
  // Windows %TEMP%
  /\/\.Trash\//,
  // macOS Trash
  /\\Recycle\.Bin\\/i
  // Windows Recycle Bin
];
var ClaudeCodeWatcher = class _ClaudeCodeWatcher {
  constructor(_stateManager, _platform, imageGenerator) {
    this._stateManager = _stateManager;
    this._platform = _platform;
    this._parser = new ConversationParser();
    this._summaryService = new SummaryService();
    this._imageGenerator = imageGenerator;
    this._summaryService.init(_platform);
    this._claudePath = this.getClaudePath();
    if (_platform.isDevelopmentMode()) {
      this._excludedWorkspacePath = _platform.getExtensionPath();
      if (this._excludedWorkspacePath) {
        console.log(`Claudine: Development mode \u2014 excluding extension workspace: ${this._excludedWorkspacePath}`);
      }
    }
  }
  _watcherDisposable;
  _parser;
  _summaryService;
  _imageGenerator;
  _claudePath;
  _excludedWorkspacePath;
  _iconPending = /* @__PURE__ */ new Set();
  /** Clear the pending-icon set so regeneration can pick up all conversations. */
  clearPendingIcons() {
    this._iconPending.clear();
  }
  /** Resolved path to the Claude Code data directory. */
  get claudePath() {
    return this._claudePath;
  }
  /** Whether the file system watcher is active. */
  get isWatching() {
    return this._watcherDisposable !== void 0;
  }
  /** Number of files held in the incremental parse cache. */
  get parseCacheSize() {
    return this._parser.cacheSize;
  }
  getClaudePath() {
    const configPath = this._platform.getConfig("claudeCodePath", "~/.claude");
    return configPath.replace("~", os3.homedir());
  }
  startWatching() {
    this.setupFileWatcher();
    this.refresh();
  }
  /** Set up the file system watcher without triggering an initial scan. */
  setupFileWatcher() {
    const projectsPath = path4.join(this._claudePath, "projects");
    try {
      this._watcherDisposable = this._platform.watchFiles(projectsPath, "**/*.jsonl", {
        onCreate: (filePath) => this.onFileChanged(filePath),
        onChange: (filePath) => this.onFileChanged(filePath),
        onDelete: (filePath) => this.onFileDeleted(filePath)
      });
      console.log(`Claudine: Watching ${projectsPath} for changes`);
    } catch (error) {
      console.error("Claudine: Error setting up file watcher", error);
    }
  }
  stopWatching() {
    if (this._watcherDisposable) {
      this._watcherDisposable.dispose();
      this._watcherDisposable = void 0;
    }
  }
  async refresh() {
    try {
      const conversations = await this.scanForConversations();
      console.log(`Claudine: Found ${conversations.length} conversations`);
      this._stateManager.setConversations(conversations);
      this._summaryService.summarizeUncached(conversations, (id, summary) => {
        const existing = this._stateManager.getConversation(id);
        if (existing) {
          this._stateManager.updateConversation({
            ...existing,
            originalTitle: existing.originalTitle || existing.title,
            originalDescription: existing.originalDescription || existing.description,
            title: summary.title,
            description: summary.description,
            lastMessage: summary.lastMessage
          });
        }
      });
      this.generateIcons(conversations);
    } catch (error) {
      console.error("Claudine: Error refreshing conversations", error);
    }
  }
  async onFileChanged(filePath) {
    if (this.isSubagentFile(filePath)) return;
    if (this._excludedWorkspacePath && this.isFromExcludedWorkspace(filePath)) return;
    if (!this.isFromCurrentWorkspace(filePath)) return;
    try {
      const conversation = await this._parser.parseFile(filePath);
      if (conversation) {
        this._summaryService.applyCached(conversation);
        this._stateManager.updateConversation(conversation);
        if (!this._summaryService.hasCached(conversation.id)) {
          this._summaryService.summarizeUncached([conversation], (id, summary) => {
            const existing = this._stateManager.getConversation(id);
            if (existing) {
              this._stateManager.updateConversation({
                ...existing,
                originalTitle: existing.originalTitle || existing.title,
                originalDescription: existing.originalDescription || existing.description,
                title: summary.title,
                description: summary.description,
                lastMessage: summary.lastMessage
              });
            }
          });
        }
      }
    } catch (error) {
      console.error(`Claudine: Error parsing file ${filePath}`, error);
    }
  }
  onFileDeleted(filePath) {
    this._parser.clearCache(filePath);
    const conversationId = path4.basename(filePath, ".jsonl");
    if (conversationId) {
      this._stateManager.removeConversation(conversationId);
    }
  }
  isSubagentFile(filePath) {
    return filePath.includes(`${path4.sep}subagents${path4.sep}`);
  }
  isFromExcludedWorkspace(filePath) {
    if (!this._excludedWorkspacePath) return false;
    const encodedExcluded = this.encodeWorkspacePath(this._excludedWorkspacePath);
    return filePath.includes(`${path4.sep}${encodedExcluded}${path4.sep}`);
  }
  /** BUG2: Check whether a JSONL file belongs to one of the current workspace's
   *  project directories. When no workspace is open, allow all files (fallback). */
  isFromCurrentWorkspace(filePath) {
    const workspaceFolders = this._platform.getWorkspaceFolders();
    if (!workspaceFolders || workspaceFolders.length === 0) return true;
    for (const folder of workspaceFolders) {
      if (this._excludedWorkspacePath && folder === this._excludedWorkspacePath) continue;
      const encodedPath = this.encodeWorkspacePath(folder);
      if (filePath.includes(`${path4.sep}${encodedPath}${path4.sep}`)) return true;
    }
    return false;
  }
  async scanForConversations() {
    const conversations = [];
    const projectsPath = path4.join(this._claudePath, "projects");
    const projectDirs = this.getProjectDirsToScan(projectsPath);
    console.log(`Claudine: Scanning ${projectDirs.length} project directories`);
    for (const projectDir of projectDirs) {
      try {
        const entries = fs2.readdirSync(projectDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
          const filePath = path4.join(projectDir, entry.name);
          try {
            const conversation = await this._parser.parseFile(filePath);
            if (conversation) {
              conversations.push(conversation);
            }
          } catch (error) {
            console.error(`Claudine: Error parsing ${filePath}`, error);
          }
        }
      } catch (error) {
        console.error(`Claudine: Error reading directory ${projectDir}`, error);
      }
    }
    for (const conv of conversations) {
      this._summaryService.applyCached(conv);
    }
    await this.mergeSavedState(conversations);
    return conversations;
  }
  getProjectDirsToScan(projectsPath) {
    const dirs = [];
    try {
      if (!fs2.existsSync(projectsPath)) {
        console.warn(`Claudine: Projects path does not exist: ${projectsPath}`);
        return dirs;
      }
      const workspaceFolders = this._platform.getWorkspaceFolders();
      if (workspaceFolders && workspaceFolders.length > 0) {
        for (const folder of workspaceFolders) {
          if (this._excludedWorkspacePath && folder === this._excludedWorkspacePath) {
            console.log(`Claudine: Skipping extension dev workspace: ${folder}`);
            continue;
          }
          const encodedPath = this.encodeWorkspacePath(folder);
          const projectDir = path4.join(projectsPath, encodedPath);
          console.log(`Claudine: Workspace "${folder}" \u2192 encoded "${encodedPath}"`);
          if (fs2.existsSync(projectDir)) {
            dirs.push(projectDir);
            console.log(`Claudine: Matched project dir: ${projectDir}`);
          } else {
            console.warn(`Claudine: No project dir found for workspace: ${projectDir}`);
          }
        }
      } else {
        console.log("Claudine: No workspace folders, scanning all projects");
        const entries = fs2.readdirSync(projectsPath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const exclusion = _ClaudeCodeWatcher.isExcludedProjectDir(entry.name);
          if (exclusion.excluded) {
            console.log(`Claudine: Auto-excluding project dir "${entry.name}" \u2014 ${exclusion.reason}`);
            continue;
          }
          dirs.push(path4.join(projectsPath, entry.name));
        }
      }
    } catch (error) {
      console.error("Claudine: Error listing project directories", error);
    }
    return dirs;
  }
  /**
   * Encode a workspace path the same way Claude Code does.
   * /Users/matthias/Development/foo → -Users-matthias-Development-foo
   */
  encodeWorkspacePath(workspacePath) {
    return workspacePath.replace(/\//g, "-");
  }
  // ── Project discovery & progressive scanning (standalone) ─────────
  /**
   * Decode an encoded project directory name back to a path approximation.
   * e.g. "-Users-matthias-Development-foo" → "/Users/matthias/Development/foo"
   */
  static decodeProjectDirName(encodedName) {
    return "/" + encodedName.replace(/^-/, "").replace(/-/g, "/");
  }
  /**
   * Check whether an encoded project directory name corresponds to an OS
   * temp/system directory that should be auto-excluded from scanning.
   */
  static isExcludedProjectDir(encodedDirName) {
    const decoded = _ClaudeCodeWatcher.decodeProjectDirName(encodedDirName);
    for (const pattern of EXCLUDED_PATH_PATTERNS) {
      if (pattern.test(decoded)) {
        return { excluded: true, reason: `Temp/system path (${pattern.source})` };
      }
    }
    return { excluded: false };
  }
  /**
   * Quickly enumerate all project directories and count their .jsonl files
   * without parsing any of them. Returns a manifest suitable for the UI.
   */
  discoverProjects() {
    const projectsPath = path4.join(this._claudePath, "projects");
    if (!fs2.existsSync(projectsPath)) return [];
    const entries = fs2.readdirSync(projectsPath, { withFileTypes: true });
    const manifest = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const exclusion = _ClaudeCodeWatcher.isExcludedProjectDir(entry.name);
      const projectDir = path4.join(projectsPath, entry.name);
      let fileCount = 0;
      try {
        const files = fs2.readdirSync(projectDir, { withFileTypes: true });
        fileCount = files.filter((f) => f.isFile() && f.name.endsWith(".jsonl")).length;
      } catch {
      }
      if (fileCount === 0) continue;
      const decoded = _ClaudeCodeWatcher.decodeProjectDirName(entry.name);
      const segments = decoded.split("/").filter(Boolean);
      const name = segments[segments.length - 1] || entry.name;
      manifest.push({
        encodedPath: entry.name,
        decodedPath: decoded,
        name,
        fileCount,
        enabled: !exclusion.excluded,
        autoExcluded: exclusion.excluded,
        excludeReason: exclusion.reason
      });
    }
    return manifest;
  }
  /**
   * Scan enabled projects one at a time, emitting results after each project.
   * Yields to the event loop periodically to keep the server responsive.
   */
  async scanProjectsProgressively(enabledProjects, onProgress, onProjectScanned) {
    const projectsPath = path4.join(this._claudePath, "projects");
    const allConversations = [];
    const totalProjects = enabledProjects.length;
    const totalFiles = enabledProjects.reduce((sum, p) => sum + p.fileCount, 0);
    let scannedProjects = 0;
    let scannedFiles = 0;
    for (const project of enabledProjects) {
      const projectDir = path4.join(projectsPath, project.encodedPath);
      const projectConvs = [];
      onProgress({ scannedProjects, totalProjects, scannedFiles, totalFiles, currentProject: project.name });
      try {
        const entries = fs2.readdirSync(projectDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
          const filePath = path4.join(projectDir, entry.name);
          try {
            const conversation = await this._parser.parseFile(filePath);
            if (conversation) {
              projectConvs.push(conversation);
            }
          } catch (error) {
            console.error(`Claudine: Error parsing ${filePath}`, error);
          }
          scannedFiles++;
          if (scannedFiles % 50 === 0) {
            await new Promise((resolve5) => setImmediate(resolve5));
          }
        }
      } catch (error) {
        console.error(`Claudine: Error reading directory ${projectDir}`, error);
      }
      for (const conv of projectConvs) {
        this._summaryService.applyCached(conv);
      }
      allConversations.push(...projectConvs);
      scannedProjects++;
      onProjectScanned(project.decodedPath || project.name, projectConvs);
    }
    await this.mergeSavedState(allConversations);
    onProgress({ scannedProjects: totalProjects, totalProjects, scannedFiles: totalFiles, totalFiles, currentProject: "" });
    return allConversations;
  }
  /**
   * Search JSONL conversation files for a query string.
   * Returns conversation IDs that contain the query (case-insensitive).
   */
  searchConversations(query) {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const matchingIds = [];
    const projectsPath = path4.join(this._claudePath, "projects");
    const projectDirs = this.getProjectDirsToScan(projectsPath);
    for (const projectDir of projectDirs) {
      try {
        const entries = fs2.readdirSync(projectDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
          const filePath = path4.join(projectDir, entry.name);
          try {
            const content = fs2.readFileSync(filePath, "utf-8");
            if (content.toLowerCase().includes(q)) {
              matchingIds.push(path4.basename(entry.name, ".jsonl"));
            }
          } catch {
          }
        }
      } catch {
      }
    }
    return matchingIds;
  }
  /**
   * Generate icons for conversations that don't have one yet.
   * Checks for referenced images first, then falls back to AI generation.
   */
  async generateIcons(conversations) {
    const needsIcon = conversations.filter((c) => !c.icon && !this._iconPending.has(c.id));
    if (needsIcon.length === 0) return;
    for (const conv of needsIcon) {
      this._iconPending.add(conv.id);
      try {
        let icon;
        if (conv.referencedImage) {
          icon = this.readImageAsDataUri(conv.referencedImage);
        }
        if (!icon && this._imageGenerator) {
          icon = await this._imageGenerator.generateIcon(conv.id, conv.title, conv.description);
        }
        if (!icon && this._imageGenerator) {
          icon = this._imageGenerator.generatePlaceholderIcon(conv.id, conv.category);
        }
        if (icon) {
          this._stateManager.setConversationIcon(conv.id, icon);
        }
      } catch (error) {
        console.error(`Claudine: Error generating icon for ${conv.id}`, error);
      } finally {
        this._iconPending.delete(conv.id);
      }
    }
  }
  /**
   * Read an image file and return it as a data URI.
   * Returns undefined if the file doesn't exist or is too large (>512KB).
   */
  readImageAsDataUri(filePath) {
    try {
      if (!fs2.existsSync(filePath)) return void 0;
      const stats = fs2.statSync(filePath);
      if (stats.size > MAX_IMAGE_FILE_SIZE_BYTES) return void 0;
      const buffer = fs2.readFileSync(filePath);
      const ext = path4.extname(filePath).toLowerCase().replace(".", "");
      const mimeMap = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml"
      };
      const mime = mimeMap[ext] || "image/png";
      return `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
      return void 0;
    }
  }
  async mergeSavedState(conversations) {
    const workspaceFolders = this._platform.getWorkspaceFolders();
    if (!workspaceFolders) return;
    for (const folder of workspaceFolders) {
      const statePath = path4.join(folder, ".claudine", "state.json");
      try {
        if (!fs2.existsSync(statePath)) continue;
        const stateData = fs2.readFileSync(statePath, "utf-8");
        const state = JSON.parse(stateData);
        if (state.conversations) {
          for (const saved of state.conversations) {
            const existing = conversations.find((c) => c.id === saved.id);
            if (existing) {
              if (saved.status === "done" || saved.status === "cancelled" || saved.status === "archived") {
                existing.status = saved.status;
              }
              if (saved.previousStatus) {
                existing.previousStatus = saved.previousStatus;
              }
              if (saved.icon) {
                existing.icon = saved.icon;
              }
            }
          }
        }
      } catch {
      }
    }
  }
};

// src/services/CommandProcessor.ts
var fs3 = __toESM(require("fs"));
var path5 = __toESM(require("path"));
var VALID_STATUSES = [
  "todo",
  "needs-input",
  "in-progress",
  "in-review",
  "done",
  "cancelled",
  "archived"
];
var VALID_CATEGORIES = [
  "user-story",
  "bug",
  "feature",
  "improvement",
  "task"
];
var MAX_COMMAND_AGE_MS = 5 * 60 * 1e3;
var CommandProcessor = class {
  constructor(_stateManager, _platform) {
    this._stateManager = _stateManager;
    this._platform = _platform;
  }
  _processedIds = /* @__PURE__ */ new Set();
  _watcherDisposable;
  _commandsPath;
  _resultsPath;
  startWatching() {
    const workspaceFolders = this._platform.getWorkspaceFolders();
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }
    const claudinePath = path5.join(workspaceFolders[0], ".claudine");
    this._commandsPath = path5.join(claudinePath, "commands.jsonl");
    this._resultsPath = path5.join(claudinePath, "command-results.json");
    this._watcherDisposable = this._platform.watchFiles(claudinePath, "commands.jsonl", {
      onCreate: () => this.processCommandFile(),
      onChange: () => this.processCommandFile()
    });
    this.processCommandFile();
  }
  stopWatching() {
    this._watcherDisposable?.dispose();
    this._watcherDisposable = void 0;
  }
  async processCommandFile() {
    if (!this._commandsPath) {
      return;
    }
    if (!fs3.existsSync(this._commandsPath)) {
      return;
    }
    let content;
    try {
      content = fs3.readFileSync(this._commandsPath, "utf-8");
    } catch {
      return;
    }
    if (!content.trim()) {
      return;
    }
    const lines = content.split("\n").filter((l) => l.trim());
    const results = [];
    const now = Date.now();
    for (const line of lines) {
      let command;
      try {
        command = JSON.parse(line);
      } catch {
        console.warn("Claudine: Skipping invalid JSON line in commands.jsonl");
        continue;
      }
      if (!command.id || !command.command || !command.task) {
        console.warn("Claudine: Skipping command with missing required fields");
        continue;
      }
      if (this._processedIds.has(command.id)) {
        continue;
      }
      const age = now - new Date(command.timestamp).getTime();
      if (age > MAX_COMMAND_AGE_MS) {
        this._processedIds.add(command.id);
        continue;
      }
      const result = this.executeCommand(command);
      results.push(result);
      this._processedIds.add(command.id);
    }
    try {
      fs3.writeFileSync(this._commandsPath, "");
    } catch {
      console.error("Claudine: Failed to truncate commands.jsonl");
    }
    if (results.length > 0) {
      this.writeResults(results);
      console.log(`Claudine: Processed ${results.length} agent command(s)`);
    }
  }
  executeCommand(command) {
    const base = { commandId: command.id, timestamp: (/* @__PURE__ */ new Date()).toISOString() };
    try {
      switch (command.command) {
        case "move":
          return this.executeMove(command, base);
        case "update":
          return this.executeUpdate(command, base);
        case "set-category":
          return this.executeSetCategory(command, base);
        default:
          return { ...base, success: false, error: `Unknown command: ${command.command}` };
      }
    } catch (error) {
      return { ...base, success: false, error: String(error) };
    }
  }
  executeMove(command, base) {
    if (!command.status) {
      return { ...base, success: false, error: 'Missing "status" field for move command' };
    }
    if (!VALID_STATUSES.includes(command.status)) {
      return { ...base, success: false, error: `Invalid status: ${command.status}. Valid: ${VALID_STATUSES.join(", ")}` };
    }
    const conversation = this.resolveTask(command.task);
    if (!conversation) {
      return { ...base, success: false, error: `Task not found: ${command.task}` };
    }
    this._stateManager.moveConversation(conversation.id, command.status);
    return { ...base, success: true };
  }
  executeUpdate(command, base) {
    const conversation = this.resolveTask(command.task);
    if (!conversation) {
      return { ...base, success: false, error: `Task not found: ${command.task}` };
    }
    if (command.title !== void 0) {
      conversation.title = command.title;
    }
    if (command.description !== void 0) {
      conversation.description = command.description;
    }
    conversation.updatedAt = /* @__PURE__ */ new Date();
    this._stateManager.updateConversation(conversation);
    return { ...base, success: true };
  }
  executeSetCategory(command, base) {
    if (!command.category) {
      return { ...base, success: false, error: 'Missing "category" field for set-category command' };
    }
    if (!VALID_CATEGORIES.includes(command.category)) {
      return { ...base, success: false, error: `Invalid category: ${command.category}. Valid: ${VALID_CATEGORIES.join(", ")}` };
    }
    const conversation = this.resolveTask(command.task);
    if (!conversation) {
      return { ...base, success: false, error: `Task not found: ${command.task}` };
    }
    conversation.category = command.category;
    conversation.updatedAt = /* @__PURE__ */ new Date();
    this._stateManager.updateConversation(conversation);
    return { ...base, success: true };
  }
  /** Resolve a task identifier to a Conversation. Supports exact ID or title matching. */
  resolveTask(taskIdentifier) {
    const byId = this._stateManager.getConversation(taskIdentifier);
    if (byId) {
      return byId;
    }
    const conversations = this._stateManager.getConversations();
    const lower = taskIdentifier.toLowerCase();
    const exactTitle = conversations.find((c) => c.title.toLowerCase() === lower);
    if (exactTitle) {
      return exactTitle;
    }
    const substring = conversations.find((c) => c.title.toLowerCase().includes(lower));
    if (substring) {
      return substring;
    }
    return void 0;
  }
  writeResults(results) {
    if (!this._resultsPath) {
      return;
    }
    try {
      let existing = [];
      if (fs3.existsSync(this._resultsPath)) {
        try {
          existing = JSON.parse(fs3.readFileSync(this._resultsPath, "utf-8")).results || [];
        } catch {
        }
      }
      const all = [...existing, ...results].slice(-MAX_COMMAND_RESULTS_HISTORY);
      fs3.writeFileSync(this._resultsPath, JSON.stringify({ results: all }, null, 2));
    } catch (error) {
      console.error("Claudine: Error writing command results", error);
    }
  }
};

// standalone/StandaloneMessageHandler.ts
var import_child_process2 = require("child_process");
var DEFAULT_LOCALE = {
  "column.todo": "To Do",
  "column.needsInput": "Needs Input",
  "column.inProgress": "In Progress",
  "column.inReview": "In Review",
  "column.done": "Done",
  "column.cancelled": "Cancelled",
  "column.archived": "Archived",
  "board.emptyTitle": "Welcome to Claudine",
  "board.emptyStep1": "Start a Claude Code session in any project",
  "board.emptyStep2": "Claudine will pick up conversations in real time",
  "board.emptyStep3": "Drag cards between columns to track progress",
  "board.quickIdea": "Quick idea...",
  "board.addIdea": "Add idea",
  "card.dragToMove": "Drag to move",
  "card.errorOccurred": "Error occurred",
  "card.toolInterrupted": "Tool interrupted",
  "card.waitingForInput": "Waiting for input",
  "card.currentlyViewing": "Currently viewing this conversation",
  "card.latest": "Latest:",
  "card.openInSourceControl": "Open in source control",
  "card.respond": "Respond",
  "card.expandCard": "Expand card",
  "card.collapseCard": "Collapse card",
  "card.taskIcon": "Task icon",
  "card.deleteIdea": "Delete idea",
  "card.startConversation": "Start conversation",
  "card.describeIdea": "Describe your idea...",
  "search.placeholder": "Search conversations...",
  "search.fade": "Fade",
  "search.hide": "Hide",
  "toolbar.search": "Search conversations",
  "toolbar.compactView": "Toggle compact / full view",
  "toolbar.expandCollapse": "Expand / Collapse all",
  "toolbar.refresh": "Refresh conversations",
  "toolbar.closeTabs": "Close empty & duplicate Claude tabs",
  "toolbar.settings": "Settings",
  "toolbar.about": "About Claudine",
  "settings.title": "Settings",
  "settings.imageGeneration": "Image Generation",
  "settings.none": "None",
  "settings.openai": "OpenAI (DALL-E 3)",
  "settings.stability": "Stability AI",
  "settings.apiKey": "API Key",
  "settings.saved": "Saved",
  "settings.regenerate": "Regenerate Thumbnails",
  "filter.title": "Filter by category",
  "filter.clear": "Clear filter",
  "prompt.placeholder": "Send a message...",
  "prompt.send": "Send message",
  "close": "Close"
};
var StandaloneMessageHandler = class {
  constructor(_stateManager, _claudeCodeWatcher, _platform, _send) {
    this._stateManager = _stateManager;
    this._claudeCodeWatcher = _claudeCodeWatcher;
    this._platform = _platform;
    this._send = _send;
  }
  /** Fingerprints of last-sent conversations, keyed by ID. */
  _lastSentFingerprints = /* @__PURE__ */ new Map();
  /** Whether the initial progressive scan has completed. */
  _initialScanDone = false;
  /** Cached project manifest from the most recent discovery. */
  _manifest = [];
  handleMessage(message) {
    switch (message.type) {
      case "ready":
        this.onReady();
        break;
      case "moveConversation":
        this._stateManager.moveConversation(message.conversationId, message.newStatus);
        break;
      case "refreshConversations":
        this.progressiveRefresh();
        break;
      case "search": {
        const ids = this._claudeCodeWatcher.searchConversations(message.query);
        this._send({ type: "searchResults", query: message.query, ids });
        break;
      }
      case "toggleSummarization": {
        const current = this._platform.getConfig("enableSummarization", false);
        this._platform.setConfig("enableSummarization", !current).then(() => {
          this.sendSettings();
          if (!current) {
            this.progressiveRefresh();
          }
        });
        break;
      }
      case "updateSetting": {
        const ALLOWED_SETTING_KEYS = [
          "imageGenerationApi",
          "enableSummarization",
          "autoRestartAfterRateLimit",
          "showTaskIcon",
          "showTaskDescription",
          "showTaskLatest",
          "showTaskGitBranch"
        ];
        if (message.key === "imageGenerationApiKey") {
          this._platform.setSecret("imageGenerationApiKey", String(message.value ?? "")).then(() => {
            this.sendSettings();
          });
        } else if (ALLOWED_SETTING_KEYS.includes(message.key)) {
          this._platform.setConfig(message.key, message.value).then(() => {
            this.sendSettings();
          });
        }
        break;
      }
      case "regenerateIcons":
        this._stateManager.clearAllIcons().then(() => {
          this._claudeCodeWatcher.clearPendingIcons();
          this.progressiveRefresh();
        });
        break;
      case "setProjectEnabled":
        this.handleSetProjectEnabled(message.projectPath, message.enabled);
        break;
      case "setAllProjectsEnabled":
        this.handleSetAllProjectsEnabled(message.enabled);
        break;
      case "quickIdea":
        console.log(`Claudine: Quick idea received: ${message.prompt}`);
        break;
      case "saveDrafts":
        this._stateManager.saveDrafts(message.drafts);
        break;
      case "testApiConnection":
        this.testApiConnection();
        break;
      case "toggleAutoRestart":
        break;
      case "openConversationAs":
        this.openConversationAs(message.conversationId, message.target);
        break;
      // These are VSCode-specific — no-ops in standalone
      case "sendPrompt":
      case "openConversation":
      case "openGitBranch":
      case "closeEmptyClaudeTabs":
      case "setupAgentIntegration":
        console.log(`Claudine: Action "${message.type}" is not available in standalone mode`);
        break;
    }
  }
  async onReady() {
    this.sendSettings();
    this._send({ type: "updateLocale", strings: DEFAULT_LOCALE });
    this.loadDrafts();
    if (this._initialScanDone) {
      const conversations = this._stateManager.getConversations();
      this._send({ type: "updateConversations", conversations });
      return;
    }
    await this.progressiveRefresh();
  }
  /** Run project discovery followed by progressive per-project scanning. */
  async progressiveRefresh() {
    this._send({ type: "indexingProgress", phase: "discovery", totalProjects: 0, scannedProjects: 0, totalFiles: 0, scannedFiles: 0 });
    const manifest = this._claudeCodeWatcher.discoverProjects();
    this._manifest = manifest;
    const savedMap = this._platform.getGlobalState("projectEnabledMap", {});
    for (const entry of manifest) {
      if (entry.encodedPath in savedMap) {
        entry.enabled = savedMap[entry.encodedPath];
      }
    }
    this._send({ type: "projectDiscovered", projects: manifest });
    const enabled = manifest.filter((p) => p.enabled);
    const totalFiles = enabled.reduce((s, p) => s + p.fileCount, 0);
    console.log(`Claudine: Discovered ${manifest.length} projects (${enabled.length} enabled, ${totalFiles} files)`);
    const allConversations = await this._claudeCodeWatcher.scanProjectsProgressively(
      enabled,
      (progress) => {
        this._send({ type: "indexingProgress", phase: "scanning", ...progress });
      },
      (projectPath, conversations) => {
        this._send({ type: "projectConversationsLoaded", projectPath, conversations });
      }
    );
    this._stateManager.setConversations(allConversations);
    this._initialScanDone = true;
    this._send({
      type: "indexingProgress",
      phase: "complete",
      totalProjects: enabled.length,
      scannedProjects: enabled.length,
      totalFiles,
      scannedFiles: totalFiles
    });
    console.log(`Claudine: Progressive scan complete \u2014 ${allConversations.length} conversations loaded`);
  }
  async handleSetProjectEnabled(encodedPath, enabled) {
    const entry = this._manifest.find((p) => p.encodedPath === encodedPath);
    if (entry) entry.enabled = enabled;
    const savedMap = this._platform.getGlobalState("projectEnabledMap", {});
    savedMap[encodedPath] = enabled;
    await this._platform.setGlobalState("projectEnabledMap", savedMap);
    this._send({ type: "projectDiscovered", projects: this._manifest });
    if (!enabled && entry?.decodedPath) {
      const all = this._stateManager.getConversations();
      const remaining = all.filter((c) => c.workspacePath !== entry.decodedPath);
      this._stateManager.setConversations(remaining);
    }
    if (enabled && entry) {
      const convs = await this._claudeCodeWatcher.scanProjectsProgressively(
        [entry],
        (progress) => {
          this._send({ type: "indexingProgress", phase: "scanning", ...progress });
        },
        (projectPath, conversations) => {
          this._send({ type: "projectConversationsLoaded", projectPath, conversations });
        }
      );
      const all = this._stateManager.getConversations();
      this._stateManager.setConversations([...all, ...convs]);
      this._send({ type: "indexingProgress", phase: "complete", totalProjects: 1, scannedProjects: 1, totalFiles: entry.fileCount, scannedFiles: entry.fileCount });
    }
  }
  async handleSetAllProjectsEnabled(enabled) {
    const savedMap = {};
    for (const entry of this._manifest) {
      if (enabled && entry.autoExcluded) continue;
      entry.enabled = enabled;
      savedMap[entry.encodedPath] = enabled;
    }
    await this._platform.setGlobalState("projectEnabledMap", savedMap);
    this._send({ type: "projectDiscovered", projects: this._manifest });
    await this.progressiveRefresh();
  }
  async sendSettings() {
    const apiKey = await this._platform.getSecret("imageGenerationApiKey") ?? "";
    const settings = {
      imageGenerationApi: this._platform.getConfig("imageGenerationApi", "none"),
      claudeCodePath: this._platform.getConfig("claudeCodePath", "~/.claude"),
      enableSummarization: this._platform.getConfig("enableSummarization", false),
      hasApiKey: !!apiKey,
      toolbarLocation: "sidebar",
      autoRestartAfterRateLimit: this._platform.getConfig("autoRestartAfterRateLimit", false),
      showTaskIcon: this._platform.getConfig("showTaskIcon", true),
      showTaskDescription: this._platform.getConfig("showTaskDescription", true),
      showTaskLatest: this._platform.getConfig("showTaskLatest", true),
      showTaskGitBranch: this._platform.getConfig("showTaskGitBranch", true)
    };
    this._send({ type: "updateSettings", settings });
  }
  async loadDrafts() {
    const drafts = await this._stateManager.loadDrafts();
    this._send({ type: "draftsLoaded", drafts });
  }
  openConversationAs(conversationId, target) {
    const conversation = this._stateManager.getConversation(conversationId);
    if (!conversation) {
      console.warn(`Claudine: Conversation ${conversationId} not found`);
      this._send({ type: "error", message: "Conversation not found" });
      return;
    }
    const cwd = conversation.workspacePath || process.env.HOME || "/";
    const sessionId = conversation.id;
    if (target === "terminal") {
      const platform = process.platform;
      if (platform === "darwin") {
        const script = `tell application "Terminal" to do script "cd '${cwd}' && claude --resume '${sessionId}'"`;
        (0, import_child_process2.execFile)("osascript", ["-e", script], (err) => {
          if (err) {
            console.error("Claudine: Failed to open terminal", err);
            this._send({ type: "error", message: `Failed to open terminal: ${err.message}` });
          }
        });
      } else if (platform === "linux") {
        const shellCmd = `cd '${cwd}' && claude --resume '${sessionId}'; exec bash`;
        const terminals = [
          { cmd: "gnome-terminal", args: ["--", "bash", "-c", shellCmd] },
          { cmd: "konsole", args: ["-e", "bash", "-c", shellCmd] },
          { cmd: "xterm", args: ["-e", "bash", "-c", shellCmd] }
        ];
        this.tryExecFiles(terminals);
      } else if (platform === "win32") {
        (0, import_child_process2.execFile)("cmd", ["/c", "start", "cmd", "/k", `cd /d "${cwd}" && claude --resume "${sessionId}"`], (err) => {
          if (err) {
            console.error("Claudine: Failed to open terminal", err);
            this._send({ type: "error", message: `Failed to open terminal: ${err.message}` });
          }
        });
      }
    } else {
      (0, import_child_process2.execFile)("code", [cwd], (err) => {
        if (err) {
          console.error("Claudine: Failed to open VSCode", err);
          this._send({ type: "error", message: `Failed to open VSCode: ${err.message}` });
        }
      });
    }
  }
  /** Try a list of terminal emulators in order, stopping at the first success. */
  tryExecFiles(commands, index = 0) {
    if (index >= commands.length) {
      this._send({ type: "error", message: "No supported terminal emulator found" });
      return;
    }
    const { cmd, args } = commands[index];
    (0, import_child_process2.execFile)(cmd, args, (err) => {
      if (err) this.tryExecFiles(commands, index + 1);
    });
  }
  async testApiConnection() {
    const api = this._platform.getConfig("imageGenerationApi", "none");
    const apiKey = await this._platform.getSecret("imageGenerationApiKey") ?? "";
    if (!apiKey) {
      this._send({ type: "apiTestResult", success: false, error: "No API key configured" });
      return;
    }
    try {
      if (api === "openai") {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { "Authorization": `Bearer ${apiKey}` }
        });
        this._send({ type: "apiTestResult", success: res.ok, error: res.ok ? void 0 : `HTTP ${res.status}` });
      } else if (api === "stability") {
        const res = await fetch("https://api.stability.ai/v1/user/account", {
          headers: { "Authorization": `Bearer ${apiKey}` }
        });
        this._send({ type: "apiTestResult", success: res.ok, error: res.ok ? void 0 : `HTTP ${res.status}` });
      } else {
        this._send({ type: "apiTestResult", success: false, error: "No API selected" });
      }
    } catch (err) {
      this._send({ type: "apiTestResult", success: false, error: String(err) });
    }
  }
};

// standalone/server.ts
var MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};
var ClaudineServer = class {
  _httpServer;
  _wss;
  _platform;
  _stateManager;
  _storageService;
  _imageGenerator;
  _claudeCodeWatcher;
  _commandProcessor;
  _messageHandler;
  _archiveTimer;
  _authToken;
  _clients = /* @__PURE__ */ new Set();
  constructor() {
    this._platform = new StandaloneAdapter();
    this._authToken = crypto.randomBytes(NONCE_BYTES).toString("hex");
  }
  async start(options) {
    await this._platform.initAsync();
    this._storageService = new StorageService(this._platform);
    this._stateManager = new StateManager(this._storageService, this._platform);
    this._imageGenerator = new ImageGenerator(this._storageService, this._platform);
    this._claudeCodeWatcher = new ClaudeCodeWatcher(this._stateManager, this._platform, this._imageGenerator);
    await this._stateManager.ready;
    this._commandProcessor = new CommandProcessor(this._stateManager, this._platform);
    this._messageHandler = new StandaloneMessageHandler(
      this._stateManager,
      this._claudeCodeWatcher,
      this._platform,
      (msg) => this.broadcast(msg)
    );
    this._stateManager.onConversationsChanged((conversations) => {
      this.broadcast({ type: "updateConversations", conversations });
    });
    this._archiveTimer = setInterval(() => {
      this._stateManager.archiveStaleConversations();
    }, ARCHIVE_CHECK_INTERVAL_MS);
    const webviewDist = this.resolveWebviewDist();
    this._httpServer = http.createServer((req, res) => {
      this.handleHttpRequest(req, res, webviewDist);
    });
    this._wss = new import_websocket_server.default({ server: this._httpServer });
    this._wss.on("connection", (ws) => this.handleWsConnection(ws));
    this._claudeCodeWatcher.setupFileWatcher();
    this._commandProcessor.startWatching();
    return new Promise((resolve5) => {
      this._httpServer.listen(options.port, options.host, () => {
        console.log(`Claudine server running at http://${options.host}:${options.port}`);
        resolve5();
      });
    });
  }
  async stop() {
    if (this._archiveTimer) {
      clearInterval(this._archiveTimer);
      this._archiveTimer = void 0;
    }
    this._claudeCodeWatcher?.stopWatching();
    this._commandProcessor?.stopWatching();
    this._stateManager?.flushSave();
    for (const ws of this._clients) {
      ws.close();
    }
    this._clients.clear();
    this._wss?.close();
    return new Promise((resolve5) => {
      if (this._httpServer) {
        this._httpServer.close(() => resolve5());
      } else {
        resolve5();
      }
    });
  }
  resolveWebviewDist() {
    const candidates = [
      path6.resolve(__dirname, "..", "webview", "dist"),
      path6.resolve(__dirname, "..", "..", "webview", "dist"),
      path6.resolve(process.cwd(), "webview", "dist")
    ];
    for (const candidate of candidates) {
      if (fs4.existsSync(path6.join(candidate, "assets", "index.js"))) {
        return candidate;
      }
    }
    console.warn("Claudine: Could not locate webview/dist \u2014 falling back to cwd");
    return path6.resolve(process.cwd(), "webview", "dist");
  }
  handleHttpRequest(req, res, webviewDist) {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const pathname = url.pathname;
    if (pathname.startsWith("/themes/")) {
      const themePath = path6.join(__dirname, pathname);
      return this.serveStaticFile(themePath, res);
    }
    if (pathname.startsWith("/assets/")) {
      const filePath = path6.join(webviewDist, pathname);
      return this.serveStaticFile(filePath, res);
    }
    if (pathname === "/" || pathname === "/index.html") {
      return this.serveIndexHtml(res);
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
  serveStaticFile(filePath, res) {
    const resolved = path6.resolve(filePath);
    if (!resolved.startsWith(path6.resolve(__dirname)) && !resolved.includes("webview")) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
      return;
    }
    if (!fs4.existsSync(resolved)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }
    const ext = path6.extname(resolved);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const data = fs4.readFileSync(resolved);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600"
    });
    res.end(data);
  }
  serveIndexHtml(res) {
    const html = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claudine</title>
  <link rel="stylesheet" href="/themes/dark.css">
  <link rel="stylesheet" href="/themes/light.css">
  <link rel="stylesheet" href="/assets/index.css">
  <style>
    body {
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
  </style>
  <script>
    // Apply saved theme (or detect system preference) before first paint to avoid flash
    (function() {
      var saved = localStorage.getItem('claudine-theme-pref');
      var theme = 'dark';
      if (saved === 'light') theme = 'light';
      else if (saved === 'dark') theme = 'dark';
      else if (saved === 'auto' || !saved) {
        theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      }
      document.documentElement.setAttribute('data-theme', theme);
    })();
  </script>
</head>
<body>
  <div id="app"></div>
  <script>
    window.__CLAUDINE_TOKEN__ = '${this._authToken}';
    window.__CLAUDINE_STANDALONE__ = true;
    window.__CLAUDINE_WS_URL__ = 'ws://' + location.host;
  </script>
  <script src="/assets/index.js"></script>
</body>
</html>`;
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Cache-Control": "no-cache"
    });
    res.end(html);
  }
  handleWsConnection(ws) {
    let authenticated = false;
    this._clients.add(ws);
    ws.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message._token !== this._authToken) {
          if (!authenticated) {
            ws.close(4001, "Invalid auth token");
          }
          return;
        }
        authenticated = true;
        this._messageHandler.handleMessage(message);
      } catch (err) {
        console.error("Claudine: Error processing WebSocket message", err);
      }
    });
    ws.on("close", () => {
      this._clients.delete(ws);
    });
    ws.on("error", (err) => {
      console.error("Claudine: WebSocket error", err);
      this._clients.delete(ws);
    });
  }
  broadcast(message) {
    const data = JSON.stringify(message);
    for (const ws of this._clients) {
      if (ws.readyState === import_websocket.default.OPEN) {
        ws.send(data);
      }
    }
  }
};

// standalone/cli.ts
var DEFAULT_PORT = 5147;
var DEFAULT_HOST = "127.0.0.1";
function parseArgs(argv) {
  let port = DEFAULT_PORT;
  let host = DEFAULT_HOST;
  let open3 = true;
  let help = false;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--no-open") {
      open3 = false;
    } else if (arg === "--port" || arg === "-p") {
      const next = argv[++i];
      const parsed = parseInt(next, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
        console.error(`Invalid port: ${next}`);
        process.exit(1);
      }
      port = parsed;
    } else if (arg === "--host") {
      host = argv[++i] || DEFAULT_HOST;
    } else if (arg === "standalone") {
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return { port, host, open: open3, help };
}
function printHelp() {
  console.log(`
Claudine \u2014 Kanban board for Claude Code conversations

Usage: claudine [options]

Options:
  -p, --port <number>   Port to listen on (default: ${DEFAULT_PORT})
  --host <address>      Host to bind to (default: ${DEFAULT_HOST})
  --no-open             Don't auto-open browser
  -h, --help            Show this help

Examples:
  claudine                    Start server and open browser
  claudine --port 8080        Use custom port
  claudine --no-open          Start without opening browser
`);
}
async function openBrowser(url) {
  const { execFile: execFile3 } = await import("child_process");
  const platform = process.platform;
  if (platform === "darwin") {
    execFile3("open", [url]);
  } else if (platform === "win32") {
    execFile3("cmd", ["/c", "start", url]);
  } else {
    execFile3("xdg-open", [url]);
  }
}
async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  const server = new ClaudineServer();
  const shutdown = async () => {
    console.log("\nClaudine: Shutting down...");
    await server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await server.start({ port: args.port, host: args.host });
  const url = `http://${args.host}:${args.port}`;
  if (args.open) {
    await openBrowser(url);
  }
  console.log(`
Open ${url} in your browser`);
  console.log("Press Ctrl+C to stop\n");
}
main().catch((err) => {
  console.error("Claudine: Fatal error", err);
  process.exit(1);
});
/*! Bundled license information:

chokidar/esm/index.js:
  (*! chokidar - MIT License (c) 2012 Paul Miller (paulmillr.com) *)
*/
//# sourceMappingURL=claudine.js.map
