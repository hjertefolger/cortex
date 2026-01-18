import { createRequire } from 'module'; import { fileURLToPath } from 'url'; import { dirname } from 'path'; const require = createRequire(import.meta.url); const __filename = fileURLToPath(import.meta.url); const __dirname = dirname(__filename);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined")
    return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
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

// node_modules/sql.js/dist/sql-wasm.js
var require_sql_wasm = __commonJS({
  "node_modules/sql.js/dist/sql-wasm.js"(exports, module) {
    var initSqlJsPromise = void 0;
    var initSqlJs2 = function(moduleConfig) {
      if (initSqlJsPromise) {
        return initSqlJsPromise;
      }
      initSqlJsPromise = new Promise(function(resolveModule, reject) {
        var Module = typeof moduleConfig !== "undefined" ? moduleConfig : {};
        var originalOnAbortFunction = Module["onAbort"];
        Module["onAbort"] = function(errorThatCausedAbort) {
          reject(new Error(errorThatCausedAbort));
          if (originalOnAbortFunction) {
            originalOnAbortFunction(errorThatCausedAbort);
          }
        };
        Module["postRun"] = Module["postRun"] || [];
        Module["postRun"].push(function() {
          resolveModule(Module);
        });
        module = void 0;
        var f;
        f ||= typeof Module != "undefined" ? Module : {};
        var aa = "object" == typeof window, ba = "undefined" != typeof WorkerGlobalScope, ca = "object" == typeof process && "object" == typeof process.versions && "string" == typeof process.versions.node && "renderer" != process.type;
        "use strict";
        f.onRuntimeInitialized = function() {
          function a(g, l) {
            switch (typeof l) {
              case "boolean":
                dc(g, l ? 1 : 0);
                break;
              case "number":
                ec(g, l);
                break;
              case "string":
                fc(g, l, -1, -1);
                break;
              case "object":
                if (null === l)
                  lb(g);
                else if (null != l.length) {
                  var n = da(l, ea);
                  gc(g, n, l.length, -1);
                  fa(n);
                } else
                  va(g, "Wrong API use : tried to return a value of an unknown type (" + l + ").", -1);
                break;
              default:
                lb(g);
            }
          }
          function b(g, l) {
            for (var n = [], r = 0; r < g; r += 1) {
              var t = m(l + 4 * r, "i32"), y = hc(t);
              if (1 === y || 2 === y)
                t = ic(t);
              else if (3 === y)
                t = jc(t);
              else if (4 === y) {
                y = t;
                t = kc(y);
                y = lc(y);
                for (var L = new Uint8Array(t), J = 0; J < t; J += 1)
                  L[J] = p[y + J];
                t = L;
              } else
                t = null;
              n.push(t);
            }
            return n;
          }
          function c(g, l) {
            this.Qa = g;
            this.db = l;
            this.Oa = 1;
            this.lb = [];
          }
          function d(g, l) {
            this.db = l;
            l = ha(g) + 1;
            this.eb = ia(l);
            if (null === this.eb)
              throw Error("Unable to allocate memory for the SQL string");
            u(g, x, this.eb, l);
            this.kb = this.eb;
            this.Za = this.pb = null;
          }
          function e(g) {
            this.filename = "dbfile_" + (4294967295 * Math.random() >>> 0);
            if (null != g) {
              var l = this.filename, n = "/", r = l;
              n && (n = "string" == typeof n ? n : ja(n), r = l ? ka(n + "/" + l) : n);
              l = la(true, true);
              r = ma(r, l);
              if (g) {
                if ("string" == typeof g) {
                  n = Array(g.length);
                  for (var t = 0, y = g.length; t < y; ++t)
                    n[t] = g.charCodeAt(t);
                  g = n;
                }
                na(r, l | 146);
                n = oa(r, 577);
                pa(n, g, 0, g.length, 0);
                qa(n);
                na(r, l);
              }
            }
            this.handleError(q(this.filename, h));
            this.db = m(h, "i32");
            ob(this.db);
            this.fb = {};
            this.Sa = {};
          }
          var h = z(4), k = f.cwrap, q = k("sqlite3_open", "number", ["string", "number"]), w = k("sqlite3_close_v2", "number", ["number"]), v = k("sqlite3_exec", "number", ["number", "string", "number", "number", "number"]), C = k("sqlite3_changes", "number", ["number"]), G = k("sqlite3_prepare_v2", "number", ["number", "string", "number", "number", "number"]), pb = k("sqlite3_sql", "string", ["number"]), nc = k("sqlite3_normalized_sql", "string", ["number"]), qb = k("sqlite3_prepare_v2", "number", ["number", "number", "number", "number", "number"]), oc = k("sqlite3_bind_text", "number", ["number", "number", "number", "number", "number"]), rb = k("sqlite3_bind_blob", "number", ["number", "number", "number", "number", "number"]), pc = k("sqlite3_bind_double", "number", ["number", "number", "number"]), qc = k(
            "sqlite3_bind_int",
            "number",
            ["number", "number", "number"]
          ), rc = k("sqlite3_bind_parameter_index", "number", ["number", "string"]), sc = k("sqlite3_step", "number", ["number"]), tc = k("sqlite3_errmsg", "string", ["number"]), uc = k("sqlite3_column_count", "number", ["number"]), vc = k("sqlite3_data_count", "number", ["number"]), wc = k("sqlite3_column_double", "number", ["number", "number"]), sb = k("sqlite3_column_text", "string", ["number", "number"]), xc = k("sqlite3_column_blob", "number", ["number", "number"]), yc = k("sqlite3_column_bytes", "number", [
            "number",
            "number"
          ]), zc = k("sqlite3_column_type", "number", ["number", "number"]), Ac = k("sqlite3_column_name", "string", ["number", "number"]), Bc = k("sqlite3_reset", "number", ["number"]), Cc = k("sqlite3_clear_bindings", "number", ["number"]), Dc = k("sqlite3_finalize", "number", ["number"]), tb = k("sqlite3_create_function_v2", "number", "number string number number number number number number number".split(" ")), hc = k("sqlite3_value_type", "number", ["number"]), kc = k("sqlite3_value_bytes", "number", ["number"]), jc = k(
            "sqlite3_value_text",
            "string",
            ["number"]
          ), lc = k("sqlite3_value_blob", "number", ["number"]), ic = k("sqlite3_value_double", "number", ["number"]), ec = k("sqlite3_result_double", "", ["number", "number"]), lb = k("sqlite3_result_null", "", ["number"]), fc = k("sqlite3_result_text", "", ["number", "string", "number", "number"]), gc = k("sqlite3_result_blob", "", ["number", "number", "number", "number"]), dc = k("sqlite3_result_int", "", ["number", "number"]), va = k("sqlite3_result_error", "", ["number", "string", "number"]), ub = k(
            "sqlite3_aggregate_context",
            "number",
            ["number", "number"]
          ), ob = k("RegisterExtensionFunctions", "number", ["number"]), vb = k("sqlite3_update_hook", "number", ["number", "number", "number"]);
          c.prototype.bind = function(g) {
            if (!this.Qa)
              throw "Statement closed";
            this.reset();
            return Array.isArray(g) ? this.Cb(g) : null != g && "object" === typeof g ? this.Db(g) : true;
          };
          c.prototype.step = function() {
            if (!this.Qa)
              throw "Statement closed";
            this.Oa = 1;
            var g = sc(this.Qa);
            switch (g) {
              case 100:
                return true;
              case 101:
                return false;
              default:
                throw this.db.handleError(g);
            }
          };
          c.prototype.wb = function(g) {
            null == g && (g = this.Oa, this.Oa += 1);
            return wc(this.Qa, g);
          };
          c.prototype.Gb = function(g) {
            null == g && (g = this.Oa, this.Oa += 1);
            g = sb(this.Qa, g);
            if ("function" !== typeof BigInt)
              throw Error("BigInt is not supported");
            return BigInt(g);
          };
          c.prototype.Hb = function(g) {
            null == g && (g = this.Oa, this.Oa += 1);
            return sb(this.Qa, g);
          };
          c.prototype.getBlob = function(g) {
            null == g && (g = this.Oa, this.Oa += 1);
            var l = yc(this.Qa, g);
            g = xc(this.Qa, g);
            for (var n = new Uint8Array(l), r = 0; r < l; r += 1)
              n[r] = p[g + r];
            return n;
          };
          c.prototype.get = function(g, l) {
            l = l || {};
            null != g && this.bind(g) && this.step();
            g = [];
            for (var n = vc(this.Qa), r = 0; r < n; r += 1)
              switch (zc(this.Qa, r)) {
                case 1:
                  var t = l.useBigInt ? this.Gb(r) : this.wb(r);
                  g.push(t);
                  break;
                case 2:
                  g.push(this.wb(r));
                  break;
                case 3:
                  g.push(this.Hb(r));
                  break;
                case 4:
                  g.push(this.getBlob(r));
                  break;
                default:
                  g.push(null);
              }
            return g;
          };
          c.prototype.getColumnNames = function() {
            for (var g = [], l = uc(this.Qa), n = 0; n < l; n += 1)
              g.push(Ac(this.Qa, n));
            return g;
          };
          c.prototype.getAsObject = function(g, l) {
            g = this.get(g, l);
            l = this.getColumnNames();
            for (var n = {}, r = 0; r < l.length; r += 1)
              n[l[r]] = g[r];
            return n;
          };
          c.prototype.getSQL = function() {
            return pb(this.Qa);
          };
          c.prototype.getNormalizedSQL = function() {
            return nc(this.Qa);
          };
          c.prototype.run = function(g) {
            null != g && this.bind(g);
            this.step();
            return this.reset();
          };
          c.prototype.sb = function(g, l) {
            null == l && (l = this.Oa, this.Oa += 1);
            g = ra(g);
            var n = da(g, ea);
            this.lb.push(n);
            this.db.handleError(oc(this.Qa, l, n, g.length - 1, 0));
          };
          c.prototype.Bb = function(g, l) {
            null == l && (l = this.Oa, this.Oa += 1);
            var n = da(g, ea);
            this.lb.push(n);
            this.db.handleError(rb(
              this.Qa,
              l,
              n,
              g.length,
              0
            ));
          };
          c.prototype.rb = function(g, l) {
            null == l && (l = this.Oa, this.Oa += 1);
            this.db.handleError((g === (g | 0) ? qc : pc)(this.Qa, l, g));
          };
          c.prototype.Eb = function(g) {
            null == g && (g = this.Oa, this.Oa += 1);
            rb(this.Qa, g, 0, 0, 0);
          };
          c.prototype.tb = function(g, l) {
            null == l && (l = this.Oa, this.Oa += 1);
            switch (typeof g) {
              case "string":
                this.sb(g, l);
                return;
              case "number":
                this.rb(g, l);
                return;
              case "bigint":
                this.sb(g.toString(), l);
                return;
              case "boolean":
                this.rb(g + 0, l);
                return;
              case "object":
                if (null === g) {
                  this.Eb(l);
                  return;
                }
                if (null != g.length) {
                  this.Bb(
                    g,
                    l
                  );
                  return;
                }
            }
            throw "Wrong API use : tried to bind a value of an unknown type (" + g + ").";
          };
          c.prototype.Db = function(g) {
            var l = this;
            Object.keys(g).forEach(function(n) {
              var r = rc(l.Qa, n);
              0 !== r && l.tb(g[n], r);
            });
            return true;
          };
          c.prototype.Cb = function(g) {
            for (var l = 0; l < g.length; l += 1)
              this.tb(g[l], l + 1);
            return true;
          };
          c.prototype.reset = function() {
            this.freemem();
            return 0 === Cc(this.Qa) && 0 === Bc(this.Qa);
          };
          c.prototype.freemem = function() {
            for (var g; void 0 !== (g = this.lb.pop()); )
              fa(g);
          };
          c.prototype.free = function() {
            this.freemem();
            var g = 0 === Dc(this.Qa);
            delete this.db.fb[this.Qa];
            this.Qa = 0;
            return g;
          };
          d.prototype.next = function() {
            if (null === this.eb)
              return { done: true };
            null !== this.Za && (this.Za.free(), this.Za = null);
            if (!this.db.db)
              throw this.mb(), Error("Database closed");
            var g = sa(), l = z(4);
            ta(h);
            ta(l);
            try {
              this.db.handleError(qb(this.db.db, this.kb, -1, h, l));
              this.kb = m(l, "i32");
              var n = m(h, "i32");
              if (0 === n)
                return this.mb(), { done: true };
              this.Za = new c(n, this.db);
              this.db.fb[n] = this.Za;
              return { value: this.Za, done: false };
            } catch (r) {
              throw this.pb = ua(this.kb), this.mb(), r;
            } finally {
              wa(g);
            }
          };
          d.prototype.mb = function() {
            fa(this.eb);
            this.eb = null;
          };
          d.prototype.getRemainingSQL = function() {
            return null !== this.pb ? this.pb : ua(this.kb);
          };
          "function" === typeof Symbol && "symbol" === typeof Symbol.iterator && (d.prototype[Symbol.iterator] = function() {
            return this;
          });
          e.prototype.run = function(g, l) {
            if (!this.db)
              throw "Database closed";
            if (l) {
              g = this.prepare(g, l);
              try {
                g.step();
              } finally {
                g.free();
              }
            } else
              this.handleError(v(this.db, g, 0, 0, h));
            return this;
          };
          e.prototype.exec = function(g, l, n) {
            if (!this.db)
              throw "Database closed";
            var r = sa(), t = null;
            try {
              var y = xa(g), L = z(4);
              for (g = []; 0 !== m(y, "i8"); ) {
                ta(h);
                ta(L);
                this.handleError(qb(this.db, y, -1, h, L));
                var J = m(h, "i32");
                y = m(L, "i32");
                if (0 !== J) {
                  var I = null;
                  t = new c(J, this);
                  for (null != l && t.bind(l); t.step(); )
                    null === I && (I = { columns: t.getColumnNames(), values: [] }, g.push(I)), I.values.push(t.get(null, n));
                  t.free();
                }
              }
              return g;
            } catch (M) {
              throw t && t.free(), M;
            } finally {
              wa(r);
            }
          };
          e.prototype.each = function(g, l, n, r, t) {
            "function" === typeof l && (r = n, n = l, l = void 0);
            g = this.prepare(g, l);
            try {
              for (; g.step(); )
                n(g.getAsObject(
                  null,
                  t
                ));
            } finally {
              g.free();
            }
            if ("function" === typeof r)
              return r();
          };
          e.prototype.prepare = function(g, l) {
            ta(h);
            this.handleError(G(this.db, g, -1, h, 0));
            g = m(h, "i32");
            if (0 === g)
              throw "Nothing to prepare";
            var n = new c(g, this);
            null != l && n.bind(l);
            return this.fb[g] = n;
          };
          e.prototype.iterateStatements = function(g) {
            return new d(g, this);
          };
          e.prototype["export"] = function() {
            Object.values(this.fb).forEach(function(l) {
              l.free();
            });
            Object.values(this.Sa).forEach(A);
            this.Sa = {};
            this.handleError(w(this.db));
            var g = ya(this.filename);
            this.handleError(q(
              this.filename,
              h
            ));
            this.db = m(h, "i32");
            ob(this.db);
            return g;
          };
          e.prototype.close = function() {
            null !== this.db && (Object.values(this.fb).forEach(function(g) {
              g.free();
            }), Object.values(this.Sa).forEach(A), this.Sa = {}, this.Ya && (A(this.Ya), this.Ya = void 0), this.handleError(w(this.db)), za("/" + this.filename), this.db = null);
          };
          e.prototype.handleError = function(g) {
            if (0 === g)
              return null;
            g = tc(this.db);
            throw Error(g);
          };
          e.prototype.getRowsModified = function() {
            return C(this.db);
          };
          e.prototype.create_function = function(g, l) {
            Object.prototype.hasOwnProperty.call(
              this.Sa,
              g
            ) && (A(this.Sa[g]), delete this.Sa[g]);
            var n = Aa(function(r, t, y) {
              t = b(t, y);
              try {
                var L = l.apply(null, t);
              } catch (J) {
                va(r, J, -1);
                return;
              }
              a(r, L);
            }, "viii");
            this.Sa[g] = n;
            this.handleError(tb(this.db, g, l.length, 1, 0, n, 0, 0, 0));
            return this;
          };
          e.prototype.create_aggregate = function(g, l) {
            var n = l.init || function() {
              return null;
            }, r = l.finalize || function(I) {
              return I;
            }, t = l.step;
            if (!t)
              throw "An aggregate function must have a step function in " + g;
            var y = {};
            Object.hasOwnProperty.call(this.Sa, g) && (A(this.Sa[g]), delete this.Sa[g]);
            l = g + "__finalize";
            Object.hasOwnProperty.call(this.Sa, l) && (A(this.Sa[l]), delete this.Sa[l]);
            var L = Aa(function(I, M, Ra) {
              var X = ub(I, 1);
              Object.hasOwnProperty.call(y, X) || (y[X] = n());
              M = b(M, Ra);
              M = [y[X]].concat(M);
              try {
                y[X] = t.apply(null, M);
              } catch (Fc) {
                delete y[X], va(I, Fc, -1);
              }
            }, "viii"), J = Aa(function(I) {
              var M = ub(I, 1);
              try {
                var Ra = r(y[M]);
              } catch (X) {
                delete y[M];
                va(I, X, -1);
                return;
              }
              a(I, Ra);
              delete y[M];
            }, "vi");
            this.Sa[g] = L;
            this.Sa[l] = J;
            this.handleError(tb(this.db, g, t.length - 1, 1, 0, 0, L, J, 0));
            return this;
          };
          e.prototype.updateHook = function(g) {
            this.Ya && (vb(this.db, 0, 0), A(this.Ya), this.Ya = void 0);
            g && (this.Ya = Aa(function(l, n, r, t, y) {
              switch (n) {
                case 18:
                  l = "insert";
                  break;
                case 23:
                  l = "update";
                  break;
                case 9:
                  l = "delete";
                  break;
                default:
                  throw "unknown operationCode in updateHook callback: " + n;
              }
              r = r ? B(x, r) : "";
              t = t ? B(x, t) : "";
              if (y > Number.MAX_SAFE_INTEGER)
                throw "rowId too big to fit inside a Number";
              g(l, r, t, Number(y));
            }, "viiiij"), vb(this.db, this.Ya, 0));
          };
          f.Database = e;
        };
        var Ba = { ...f }, Ca = "./this.program", Da = (a, b) => {
          throw b;
        }, D = "", Ea, Fa;
        if (ca) {
          var fs5 = __require("fs");
          __require("path");
          D = __dirname + "/";
          Fa = (a) => {
            a = Ga(a) ? new URL(a) : a;
            return fs5.readFileSync(a);
          };
          Ea = async (a) => {
            a = Ga(a) ? new URL(a) : a;
            return fs5.readFileSync(a, void 0);
          };
          !f.thisProgram && 1 < process.argv.length && (Ca = process.argv[1].replace(/\\/g, "/"));
          process.argv.slice(2);
          "undefined" != typeof module && (module.exports = f);
          Da = (a, b) => {
            process.exitCode = a;
            throw b;
          };
        } else if (aa || ba)
          ba ? D = self.location.href : "undefined" != typeof document && document.currentScript && (D = document.currentScript.src), D = D.startsWith("blob:") ? "" : D.slice(0, D.replace(/[?#].*/, "").lastIndexOf("/") + 1), ba && (Fa = (a) => {
            var b = new XMLHttpRequest();
            b.open("GET", a, false);
            b.responseType = "arraybuffer";
            b.send(null);
            return new Uint8Array(b.response);
          }), Ea = async (a) => {
            if (Ga(a))
              return new Promise((c, d) => {
                var e = new XMLHttpRequest();
                e.open("GET", a, true);
                e.responseType = "arraybuffer";
                e.onload = () => {
                  200 == e.status || 0 == e.status && e.response ? c(e.response) : d(e.status);
                };
                e.onerror = d;
                e.send(null);
              });
            var b = await fetch(a, { credentials: "same-origin" });
            if (b.ok)
              return b.arrayBuffer();
            throw Error(b.status + " : " + b.url);
          };
        var Ha = f.print || console.log.bind(console), Ia = f.printErr || console.error.bind(console);
        Object.assign(f, Ba);
        Ba = null;
        f.thisProgram && (Ca = f.thisProgram);
        var Ja = f.wasmBinary, Ka, La = false, Ma, p, x, Na, E, F, Oa, H, Pa, Ga = (a) => a.startsWith("file://");
        function Qa() {
          var a = Ka.buffer;
          f.HEAP8 = p = new Int8Array(a);
          f.HEAP16 = Na = new Int16Array(a);
          f.HEAPU8 = x = new Uint8Array(a);
          f.HEAPU16 = new Uint16Array(a);
          f.HEAP32 = E = new Int32Array(a);
          f.HEAPU32 = F = new Uint32Array(a);
          f.HEAPF32 = Oa = new Float32Array(a);
          f.HEAPF64 = Pa = new Float64Array(a);
          f.HEAP64 = H = new BigInt64Array(a);
          f.HEAPU64 = new BigUint64Array(a);
        }
        var K = 0, Sa = null;
        function Ta(a) {
          f.onAbort?.(a);
          a = "Aborted(" + a + ")";
          Ia(a);
          La = true;
          throw new WebAssembly.RuntimeError(a + ". Build with -sASSERTIONS for more info.");
        }
        var Ua;
        async function Va(a) {
          if (!Ja)
            try {
              var b = await Ea(a);
              return new Uint8Array(b);
            } catch {
            }
          if (a == Ua && Ja)
            a = new Uint8Array(Ja);
          else if (Fa)
            a = Fa(a);
          else
            throw "both async and sync fetching of the wasm failed";
          return a;
        }
        async function Wa(a, b) {
          try {
            var c = await Va(a);
            return await WebAssembly.instantiate(c, b);
          } catch (d) {
            Ia(`failed to asynchronously prepare wasm: ${d}`), Ta(d);
          }
        }
        async function Xa(a) {
          var b = Ua;
          if (!Ja && "function" == typeof WebAssembly.instantiateStreaming && !Ga(b) && !ca)
            try {
              var c = fetch(b, { credentials: "same-origin" });
              return await WebAssembly.instantiateStreaming(c, a);
            } catch (d) {
              Ia(`wasm streaming compile failed: ${d}`), Ia("falling back to ArrayBuffer instantiation");
            }
          return Wa(b, a);
        }
        class Ya {
          name = "ExitStatus";
          constructor(a) {
            this.message = `Program terminated with exit(${a})`;
            this.status = a;
          }
        }
        var Za = (a) => {
          for (; 0 < a.length; )
            a.shift()(f);
        }, $a = [], ab = [], bb = () => {
          var a = f.preRun.shift();
          ab.unshift(a);
        };
        function m(a, b = "i8") {
          b.endsWith("*") && (b = "*");
          switch (b) {
            case "i1":
              return p[a];
            case "i8":
              return p[a];
            case "i16":
              return Na[a >> 1];
            case "i32":
              return E[a >> 2];
            case "i64":
              return H[a >> 3];
            case "float":
              return Oa[a >> 2];
            case "double":
              return Pa[a >> 3];
            case "*":
              return F[a >> 2];
            default:
              Ta(`invalid type for getValue: ${b}`);
          }
        }
        var cb = f.noExitRuntime || true;
        function ta(a) {
          var b = "i32";
          b.endsWith("*") && (b = "*");
          switch (b) {
            case "i1":
              p[a] = 0;
              break;
            case "i8":
              p[a] = 0;
              break;
            case "i16":
              Na[a >> 1] = 0;
              break;
            case "i32":
              E[a >> 2] = 0;
              break;
            case "i64":
              H[a >> 3] = BigInt(0);
              break;
            case "float":
              Oa[a >> 2] = 0;
              break;
            case "double":
              Pa[a >> 3] = 0;
              break;
            case "*":
              F[a >> 2] = 0;
              break;
            default:
              Ta(`invalid type for setValue: ${b}`);
          }
        }
        var db = "undefined" != typeof TextDecoder ? new TextDecoder() : void 0, B = (a, b = 0, c = NaN) => {
          var d = b + c;
          for (c = b; a[c] && !(c >= d); )
            ++c;
          if (16 < c - b && a.buffer && db)
            return db.decode(a.subarray(b, c));
          for (d = ""; b < c; ) {
            var e = a[b++];
            if (e & 128) {
              var h = a[b++] & 63;
              if (192 == (e & 224))
                d += String.fromCharCode((e & 31) << 6 | h);
              else {
                var k = a[b++] & 63;
                e = 224 == (e & 240) ? (e & 15) << 12 | h << 6 | k : (e & 7) << 18 | h << 12 | k << 6 | a[b++] & 63;
                65536 > e ? d += String.fromCharCode(e) : (e -= 65536, d += String.fromCharCode(55296 | e >> 10, 56320 | e & 1023));
              }
            } else
              d += String.fromCharCode(e);
          }
          return d;
        }, ua = (a, b) => a ? B(x, a, b) : "", eb = (a, b) => {
          for (var c = 0, d = a.length - 1; 0 <= d; d--) {
            var e = a[d];
            "." === e ? a.splice(d, 1) : ".." === e ? (a.splice(d, 1), c++) : c && (a.splice(d, 1), c--);
          }
          if (b)
            for (; c; c--)
              a.unshift("..");
          return a;
        }, ka = (a) => {
          var b = "/" === a.charAt(0), c = "/" === a.slice(-1);
          (a = eb(a.split("/").filter((d) => !!d), !b).join("/")) || b || (a = ".");
          a && c && (a += "/");
          return (b ? "/" : "") + a;
        }, fb = (a) => {
          var b = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/.exec(a).slice(1);
          a = b[0];
          b = b[1];
          if (!a && !b)
            return ".";
          b &&= b.slice(0, -1);
          return a + b;
        }, gb = (a) => a && a.match(/([^\/]+|\/)\/*$/)[1], hb = () => {
          if (ca) {
            var a = __require("crypto");
            return (b) => a.randomFillSync(b);
          }
          return (b) => crypto.getRandomValues(b);
        }, ib = (a) => {
          (ib = hb())(a);
        }, jb = (...a) => {
          for (var b = "", c = false, d = a.length - 1; -1 <= d && !c; d--) {
            c = 0 <= d ? a[d] : "/";
            if ("string" != typeof c)
              throw new TypeError("Arguments to path.resolve must be strings");
            if (!c)
              return "";
            b = c + "/" + b;
            c = "/" === c.charAt(0);
          }
          b = eb(b.split("/").filter((e) => !!e), !c).join("/");
          return (c ? "/" : "") + b || ".";
        }, kb = [], ha = (a) => {
          for (var b = 0, c = 0; c < a.length; ++c) {
            var d = a.charCodeAt(c);
            127 >= d ? b++ : 2047 >= d ? b += 2 : 55296 <= d && 57343 >= d ? (b += 4, ++c) : b += 3;
          }
          return b;
        }, u = (a, b, c, d) => {
          if (!(0 < d))
            return 0;
          var e = c;
          d = c + d - 1;
          for (var h = 0; h < a.length; ++h) {
            var k = a.charCodeAt(h);
            if (55296 <= k && 57343 >= k) {
              var q = a.charCodeAt(++h);
              k = 65536 + ((k & 1023) << 10) | q & 1023;
            }
            if (127 >= k) {
              if (c >= d)
                break;
              b[c++] = k;
            } else {
              if (2047 >= k) {
                if (c + 1 >= d)
                  break;
                b[c++] = 192 | k >> 6;
              } else {
                if (65535 >= k) {
                  if (c + 2 >= d)
                    break;
                  b[c++] = 224 | k >> 12;
                } else {
                  if (c + 3 >= d)
                    break;
                  b[c++] = 240 | k >> 18;
                  b[c++] = 128 | k >> 12 & 63;
                }
                b[c++] = 128 | k >> 6 & 63;
              }
              b[c++] = 128 | k & 63;
            }
          }
          b[c] = 0;
          return c - e;
        }, ra = (a, b) => {
          var c = Array(ha(a) + 1);
          a = u(a, c, 0, c.length);
          b && (c.length = a);
          return c;
        }, mb = [];
        function nb(a, b) {
          mb[a] = { input: [], output: [], cb: b };
          wb(a, xb);
        }
        var xb = { open(a) {
          var b = mb[a.node.rdev];
          if (!b)
            throw new N(43);
          a.tty = b;
          a.seekable = false;
        }, close(a) {
          a.tty.cb.fsync(a.tty);
        }, fsync(a) {
          a.tty.cb.fsync(a.tty);
        }, read(a, b, c, d) {
          if (!a.tty || !a.tty.cb.xb)
            throw new N(60);
          for (var e = 0, h = 0; h < d; h++) {
            try {
              var k = a.tty.cb.xb(a.tty);
            } catch (q) {
              throw new N(29);
            }
            if (void 0 === k && 0 === e)
              throw new N(6);
            if (null === k || void 0 === k)
              break;
            e++;
            b[c + h] = k;
          }
          e && (a.node.atime = Date.now());
          return e;
        }, write(a, b, c, d) {
          if (!a.tty || !a.tty.cb.qb)
            throw new N(60);
          try {
            for (var e = 0; e < d; e++)
              a.tty.cb.qb(a.tty, b[c + e]);
          } catch (h) {
            throw new N(29);
          }
          d && (a.node.mtime = a.node.ctime = Date.now());
          return e;
        } }, yb = { xb() {
          a: {
            if (!kb.length) {
              var a = null;
              if (ca) {
                var b = Buffer.alloc(256), c = 0, d = process.stdin.fd;
                try {
                  c = fs5.readSync(d, b, 0, 256);
                } catch (e) {
                  if (e.toString().includes("EOF"))
                    c = 0;
                  else
                    throw e;
                }
                0 < c && (a = b.slice(0, c).toString("utf-8"));
              } else
                "undefined" != typeof window && "function" == typeof window.prompt && (a = window.prompt("Input: "), null !== a && (a += "\n"));
              if (!a) {
                a = null;
                break a;
              }
              kb = ra(a, true);
            }
            a = kb.shift();
          }
          return a;
        }, qb(a, b) {
          null === b || 10 === b ? (Ha(B(a.output)), a.output = []) : 0 != b && a.output.push(b);
        }, fsync(a) {
          0 < a.output?.length && (Ha(B(a.output)), a.output = []);
        }, Tb() {
          return { Ob: 25856, Qb: 5, Nb: 191, Pb: 35387, Mb: [3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
        }, Ub() {
          return 0;
        }, Vb() {
          return [24, 80];
        } }, zb = { qb(a, b) {
          null === b || 10 === b ? (Ia(B(a.output)), a.output = []) : 0 != b && a.output.push(b);
        }, fsync(a) {
          0 < a.output?.length && (Ia(B(a.output)), a.output = []);
        } }, O = { Wa: null, Xa() {
          return O.createNode(null, "/", 16895, 0);
        }, createNode(a, b, c, d) {
          if (24576 === (c & 61440) || 4096 === (c & 61440))
            throw new N(63);
          O.Wa || (O.Wa = { dir: { node: { Ta: O.La.Ta, Ua: O.La.Ua, lookup: O.La.lookup, hb: O.La.hb, rename: O.La.rename, unlink: O.La.unlink, rmdir: O.La.rmdir, readdir: O.La.readdir, symlink: O.La.symlink }, stream: { Va: O.Ma.Va } }, file: { node: { Ta: O.La.Ta, Ua: O.La.Ua }, stream: { Va: O.Ma.Va, read: O.Ma.read, write: O.Ma.write, ib: O.Ma.ib, jb: O.Ma.jb } }, link: { node: { Ta: O.La.Ta, Ua: O.La.Ua, readlink: O.La.readlink }, stream: {} }, ub: { node: { Ta: O.La.Ta, Ua: O.La.Ua }, stream: Ab } });
          c = Bb(a, b, c, d);
          P(c.mode) ? (c.La = O.Wa.dir.node, c.Ma = O.Wa.dir.stream, c.Na = {}) : 32768 === (c.mode & 61440) ? (c.La = O.Wa.file.node, c.Ma = O.Wa.file.stream, c.Ra = 0, c.Na = null) : 40960 === (c.mode & 61440) ? (c.La = O.Wa.link.node, c.Ma = O.Wa.link.stream) : 8192 === (c.mode & 61440) && (c.La = O.Wa.ub.node, c.Ma = O.Wa.ub.stream);
          c.atime = c.mtime = c.ctime = Date.now();
          a && (a.Na[b] = c, a.atime = a.mtime = a.ctime = c.atime);
          return c;
        }, Sb(a) {
          return a.Na ? a.Na.subarray ? a.Na.subarray(0, a.Ra) : new Uint8Array(a.Na) : new Uint8Array(0);
        }, La: { Ta(a) {
          var b = {};
          b.dev = 8192 === (a.mode & 61440) ? a.id : 1;
          b.ino = a.id;
          b.mode = a.mode;
          b.nlink = 1;
          b.uid = 0;
          b.gid = 0;
          b.rdev = a.rdev;
          P(a.mode) ? b.size = 4096 : 32768 === (a.mode & 61440) ? b.size = a.Ra : 40960 === (a.mode & 61440) ? b.size = a.link.length : b.size = 0;
          b.atime = new Date(a.atime);
          b.mtime = new Date(a.mtime);
          b.ctime = new Date(a.ctime);
          b.blksize = 4096;
          b.blocks = Math.ceil(b.size / b.blksize);
          return b;
        }, Ua(a, b) {
          for (var c of ["mode", "atime", "mtime", "ctime"])
            null != b[c] && (a[c] = b[c]);
          void 0 !== b.size && (b = b.size, a.Ra != b && (0 == b ? (a.Na = null, a.Ra = 0) : (c = a.Na, a.Na = new Uint8Array(b), c && a.Na.set(c.subarray(0, Math.min(b, a.Ra))), a.Ra = b)));
        }, lookup() {
          throw O.vb;
        }, hb(a, b, c, d) {
          return O.createNode(a, b, c, d);
        }, rename(a, b, c) {
          try {
            var d = Q(b, c);
          } catch (h) {
          }
          if (d) {
            if (P(a.mode))
              for (var e in d.Na)
                throw new N(55);
            Cb(d);
          }
          delete a.parent.Na[a.name];
          b.Na[c] = a;
          a.name = c;
          b.ctime = b.mtime = a.parent.ctime = a.parent.mtime = Date.now();
        }, unlink(a, b) {
          delete a.Na[b];
          a.ctime = a.mtime = Date.now();
        }, rmdir(a, b) {
          var c = Q(a, b), d;
          for (d in c.Na)
            throw new N(55);
          delete a.Na[b];
          a.ctime = a.mtime = Date.now();
        }, readdir(a) {
          return [".", "..", ...Object.keys(a.Na)];
        }, symlink(a, b, c) {
          a = O.createNode(a, b, 41471, 0);
          a.link = c;
          return a;
        }, readlink(a) {
          if (40960 !== (a.mode & 61440))
            throw new N(28);
          return a.link;
        } }, Ma: { read(a, b, c, d, e) {
          var h = a.node.Na;
          if (e >= a.node.Ra)
            return 0;
          a = Math.min(a.node.Ra - e, d);
          if (8 < a && h.subarray)
            b.set(h.subarray(e, e + a), c);
          else
            for (d = 0; d < a; d++)
              b[c + d] = h[e + d];
          return a;
        }, write(a, b, c, d, e, h) {
          b.buffer === p.buffer && (h = false);
          if (!d)
            return 0;
          a = a.node;
          a.mtime = a.ctime = Date.now();
          if (b.subarray && (!a.Na || a.Na.subarray)) {
            if (h)
              return a.Na = b.subarray(c, c + d), a.Ra = d;
            if (0 === a.Ra && 0 === e)
              return a.Na = b.slice(c, c + d), a.Ra = d;
            if (e + d <= a.Ra)
              return a.Na.set(b.subarray(
                c,
                c + d
              ), e), d;
          }
          h = e + d;
          var k = a.Na ? a.Na.length : 0;
          k >= h || (h = Math.max(h, k * (1048576 > k ? 2 : 1.125) >>> 0), 0 != k && (h = Math.max(h, 256)), k = a.Na, a.Na = new Uint8Array(h), 0 < a.Ra && a.Na.set(k.subarray(0, a.Ra), 0));
          if (a.Na.subarray && b.subarray)
            a.Na.set(b.subarray(c, c + d), e);
          else
            for (h = 0; h < d; h++)
              a.Na[e + h] = b[c + h];
          a.Ra = Math.max(a.Ra, e + d);
          return d;
        }, Va(a, b, c) {
          1 === c ? b += a.position : 2 === c && 32768 === (a.node.mode & 61440) && (b += a.node.Ra);
          if (0 > b)
            throw new N(28);
          return b;
        }, ib(a, b, c, d, e) {
          if (32768 !== (a.node.mode & 61440))
            throw new N(43);
          a = a.node.Na;
          if (e & 2 || !a || a.buffer !== p.buffer) {
            e = true;
            d = 65536 * Math.ceil(b / 65536);
            var h = Db(65536, d);
            h && x.fill(0, h, h + d);
            d = h;
            if (!d)
              throw new N(48);
            if (a) {
              if (0 < c || c + b < a.length)
                a.subarray ? a = a.subarray(c, c + b) : a = Array.prototype.slice.call(a, c, c + b);
              p.set(a, d);
            }
          } else
            e = false, d = a.byteOffset;
          return { Kb: d, Ab: e };
        }, jb(a, b, c, d) {
          O.Ma.write(a, b, 0, d, c, false);
          return 0;
        } } }, la = (a, b) => {
          var c = 0;
          a && (c |= 365);
          b && (c |= 146);
          return c;
        }, Eb = null, Fb = {}, Gb = [], Hb = 1, R = null, Ib = false, Jb = true, Kb = {}, N = class {
          name = "ErrnoError";
          constructor(a) {
            this.Pa = a;
          }
        }, Lb = class {
          gb = {};
          node = null;
          get flags() {
            return this.gb.flags;
          }
          set flags(a) {
            this.gb.flags = a;
          }
          get position() {
            return this.gb.position;
          }
          set position(a) {
            this.gb.position = a;
          }
        }, Mb = class {
          La = {};
          Ma = {};
          ab = null;
          constructor(a, b, c, d) {
            a ||= this;
            this.parent = a;
            this.Xa = a.Xa;
            this.id = Hb++;
            this.name = b;
            this.mode = c;
            this.rdev = d;
            this.atime = this.mtime = this.ctime = Date.now();
          }
          get read() {
            return 365 === (this.mode & 365);
          }
          set read(a) {
            a ? this.mode |= 365 : this.mode &= -366;
          }
          get write() {
            return 146 === (this.mode & 146);
          }
          set write(a) {
            a ? this.mode |= 146 : this.mode &= -147;
          }
        };
        function S(a, b = {}) {
          if (!a)
            throw new N(44);
          b.nb ?? (b.nb = true);
          "/" === a.charAt(0) || (a = "//" + a);
          var c = 0;
          a:
            for (; 40 > c; c++) {
              a = a.split("/").filter((q) => !!q);
              for (var d = Eb, e = "/", h = 0; h < a.length; h++) {
                var k = h === a.length - 1;
                if (k && b.parent)
                  break;
                if ("." !== a[h])
                  if (".." === a[h])
                    e = fb(e), d = d.parent;
                  else {
                    e = ka(e + "/" + a[h]);
                    try {
                      d = Q(d, a[h]);
                    } catch (q) {
                      if (44 === q?.Pa && k && b.Jb)
                        return { path: e };
                      throw q;
                    }
                    !d.ab || k && !b.nb || (d = d.ab.root);
                    if (40960 === (d.mode & 61440) && (!k || b.$a)) {
                      if (!d.La.readlink)
                        throw new N(52);
                      d = d.La.readlink(d);
                      "/" === d.charAt(0) || (d = fb(e) + "/" + d);
                      a = d + "/" + a.slice(h + 1).join("/");
                      continue a;
                    }
                  }
              }
              return { path: e, node: d };
            }
          throw new N(32);
        }
        function ja(a) {
          for (var b; ; ) {
            if (a === a.parent)
              return a = a.Xa.zb, b ? "/" !== a[a.length - 1] ? `${a}/${b}` : a + b : a;
            b = b ? `${a.name}/${b}` : a.name;
            a = a.parent;
          }
        }
        function Nb(a, b) {
          for (var c = 0, d = 0; d < b.length; d++)
            c = (c << 5) - c + b.charCodeAt(d) | 0;
          return (a + c >>> 0) % R.length;
        }
        function Cb(a) {
          var b = Nb(a.parent.id, a.name);
          if (R[b] === a)
            R[b] = a.bb;
          else
            for (b = R[b]; b; ) {
              if (b.bb === a) {
                b.bb = a.bb;
                break;
              }
              b = b.bb;
            }
        }
        function Q(a, b) {
          var c = P(a.mode) ? (c = Ob(a, "x")) ? c : a.La.lookup ? 0 : 2 : 54;
          if (c)
            throw new N(c);
          for (c = R[Nb(a.id, b)]; c; c = c.bb) {
            var d = c.name;
            if (c.parent.id === a.id && d === b)
              return c;
          }
          return a.La.lookup(a, b);
        }
        function Bb(a, b, c, d) {
          a = new Mb(a, b, c, d);
          b = Nb(a.parent.id, a.name);
          a.bb = R[b];
          return R[b] = a;
        }
        function P(a) {
          return 16384 === (a & 61440);
        }
        function Pb(a) {
          var b = ["r", "w", "rw"][a & 3];
          a & 512 && (b += "w");
          return b;
        }
        function Ob(a, b) {
          if (Jb)
            return 0;
          if (!b.includes("r") || a.mode & 292) {
            if (b.includes("w") && !(a.mode & 146) || b.includes("x") && !(a.mode & 73))
              return 2;
          } else
            return 2;
          return 0;
        }
        function Qb(a, b) {
          if (!P(a.mode))
            return 54;
          try {
            return Q(a, b), 20;
          } catch (c) {
          }
          return Ob(a, "wx");
        }
        function Rb(a, b, c) {
          try {
            var d = Q(a, b);
          } catch (e) {
            return e.Pa;
          }
          if (a = Ob(a, "wx"))
            return a;
          if (c) {
            if (!P(d.mode))
              return 54;
            if (d === d.parent || "/" === ja(d))
              return 10;
          } else if (P(d.mode))
            return 31;
          return 0;
        }
        function Sb(a) {
          if (!a)
            throw new N(63);
          return a;
        }
        function T(a) {
          a = Gb[a];
          if (!a)
            throw new N(8);
          return a;
        }
        function Tb(a, b = -1) {
          a = Object.assign(new Lb(), a);
          if (-1 == b)
            a: {
              for (b = 0; 4096 >= b; b++)
                if (!Gb[b])
                  break a;
              throw new N(33);
            }
          a.fd = b;
          return Gb[b] = a;
        }
        function Ub(a, b = -1) {
          a = Tb(a, b);
          a.Ma?.Rb?.(a);
          return a;
        }
        function Vb(a, b, c) {
          var d = a?.Ma.Ua;
          a = d ? a : b;
          d ??= b.La.Ua;
          Sb(d);
          d(a, c);
        }
        var Ab = { open(a) {
          a.Ma = Fb[a.node.rdev].Ma;
          a.Ma.open?.(a);
        }, Va() {
          throw new N(70);
        } };
        function wb(a, b) {
          Fb[a] = { Ma: b };
        }
        function Wb(a, b) {
          var c = "/" === b;
          if (c && Eb)
            throw new N(10);
          if (!c && b) {
            var d = S(b, { nb: false });
            b = d.path;
            d = d.node;
            if (d.ab)
              throw new N(10);
            if (!P(d.mode))
              throw new N(54);
          }
          b = { type: a, Wb: {}, zb: b, Ib: [] };
          a = a.Xa(b);
          a.Xa = b;
          b.root = a;
          c ? Eb = a : d && (d.ab = b, d.Xa && d.Xa.Ib.push(b));
        }
        function Xb(a, b, c) {
          var d = S(a, { parent: true }).node;
          a = gb(a);
          if (!a)
            throw new N(28);
          if ("." === a || ".." === a)
            throw new N(20);
          var e = Qb(d, a);
          if (e)
            throw new N(e);
          if (!d.La.hb)
            throw new N(63);
          return d.La.hb(d, a, b, c);
        }
        function ma(a, b = 438) {
          return Xb(a, b & 4095 | 32768, 0);
        }
        function U(a, b = 511) {
          return Xb(a, b & 1023 | 16384, 0);
        }
        function Yb(a, b, c) {
          "undefined" == typeof c && (c = b, b = 438);
          Xb(a, b | 8192, c);
        }
        function Zb(a, b) {
          if (!jb(a))
            throw new N(44);
          var c = S(b, { parent: true }).node;
          if (!c)
            throw new N(44);
          b = gb(b);
          var d = Qb(c, b);
          if (d)
            throw new N(d);
          if (!c.La.symlink)
            throw new N(63);
          c.La.symlink(c, b, a);
        }
        function $b(a) {
          var b = S(a, { parent: true }).node;
          a = gb(a);
          var c = Q(b, a), d = Rb(b, a, true);
          if (d)
            throw new N(d);
          if (!b.La.rmdir)
            throw new N(63);
          if (c.ab)
            throw new N(10);
          b.La.rmdir(b, a);
          Cb(c);
        }
        function za(a) {
          var b = S(a, { parent: true }).node;
          if (!b)
            throw new N(44);
          a = gb(a);
          var c = Q(b, a), d = Rb(b, a, false);
          if (d)
            throw new N(d);
          if (!b.La.unlink)
            throw new N(63);
          if (c.ab)
            throw new N(10);
          b.La.unlink(b, a);
          Cb(c);
        }
        function ac(a, b) {
          a = S(a, { $a: !b }).node;
          return Sb(a.La.Ta)(a);
        }
        function bc(a, b, c, d) {
          Vb(a, b, { mode: c & 4095 | b.mode & -4096, ctime: Date.now(), Fb: d });
        }
        function na(a, b) {
          a = "string" == typeof a ? S(a, { $a: true }).node : a;
          bc(null, a, b);
        }
        function cc(a, b, c) {
          if (P(b.mode))
            throw new N(31);
          if (32768 !== (b.mode & 61440))
            throw new N(28);
          var d = Ob(b, "w");
          if (d)
            throw new N(d);
          Vb(a, b, { size: c, timestamp: Date.now() });
        }
        function oa(a, b, c = 438) {
          if ("" === a)
            throw new N(44);
          if ("string" == typeof b) {
            var d = { r: 0, "r+": 2, w: 577, "w+": 578, a: 1089, "a+": 1090 }[b];
            if ("undefined" == typeof d)
              throw Error(`Unknown file open mode: ${b}`);
            b = d;
          }
          c = b & 64 ? c & 4095 | 32768 : 0;
          if ("object" == typeof a)
            d = a;
          else {
            var e = a.endsWith("/");
            a = S(a, { $a: !(b & 131072), Jb: true });
            d = a.node;
            a = a.path;
          }
          var h = false;
          if (b & 64)
            if (d) {
              if (b & 128)
                throw new N(20);
            } else {
              if (e)
                throw new N(31);
              d = Xb(a, c | 511, 0);
              h = true;
            }
          if (!d)
            throw new N(44);
          8192 === (d.mode & 61440) && (b &= -513);
          if (b & 65536 && !P(d.mode))
            throw new N(54);
          if (!h && (e = d ? 40960 === (d.mode & 61440) ? 32 : P(d.mode) && ("r" !== Pb(b) || b & 576) ? 31 : Ob(d, Pb(b)) : 44))
            throw new N(e);
          b & 512 && !h && (e = d, e = "string" == typeof e ? S(e, { $a: true }).node : e, cc(null, e, 0));
          b &= -131713;
          e = Tb({ node: d, path: ja(d), flags: b, seekable: true, position: 0, Ma: d.Ma, Lb: [], error: false });
          e.Ma.open && e.Ma.open(e);
          h && na(d, c & 511);
          !f.logReadFiles || b & 1 || a in Kb || (Kb[a] = 1);
          return e;
        }
        function qa(a) {
          if (null === a.fd)
            throw new N(8);
          a.ob && (a.ob = null);
          try {
            a.Ma.close && a.Ma.close(a);
          } catch (b) {
            throw b;
          } finally {
            Gb[a.fd] = null;
          }
          a.fd = null;
        }
        function mc(a, b, c) {
          if (null === a.fd)
            throw new N(8);
          if (!a.seekable || !a.Ma.Va)
            throw new N(70);
          if (0 != c && 1 != c && 2 != c)
            throw new N(28);
          a.position = a.Ma.Va(a, b, c);
          a.Lb = [];
        }
        function Ec(a, b, c, d, e) {
          if (0 > d || 0 > e)
            throw new N(28);
          if (null === a.fd)
            throw new N(8);
          if (1 === (a.flags & 2097155))
            throw new N(8);
          if (P(a.node.mode))
            throw new N(31);
          if (!a.Ma.read)
            throw new N(28);
          var h = "undefined" != typeof e;
          if (!h)
            e = a.position;
          else if (!a.seekable)
            throw new N(70);
          b = a.Ma.read(a, b, c, d, e);
          h || (a.position += b);
          return b;
        }
        function pa(a, b, c, d, e) {
          if (0 > d || 0 > e)
            throw new N(28);
          if (null === a.fd)
            throw new N(8);
          if (0 === (a.flags & 2097155))
            throw new N(8);
          if (P(a.node.mode))
            throw new N(31);
          if (!a.Ma.write)
            throw new N(28);
          a.seekable && a.flags & 1024 && mc(a, 0, 2);
          var h = "undefined" != typeof e;
          if (!h)
            e = a.position;
          else if (!a.seekable)
            throw new N(70);
          b = a.Ma.write(a, b, c, d, e, void 0);
          h || (a.position += b);
          return b;
        }
        function ya(a) {
          var b = "binary";
          if ("utf8" !== b && "binary" !== b)
            throw Error(`Invalid encoding type "${b}"`);
          var c;
          var d = oa(a, d || 0);
          a = ac(a).size;
          var e = new Uint8Array(a);
          Ec(d, e, 0, a, 0);
          "utf8" === b ? c = B(e) : "binary" === b && (c = e);
          qa(d);
          return c;
        }
        function V(a, b, c) {
          a = ka("/dev/" + a);
          var d = la(!!b, !!c);
          V.yb ?? (V.yb = 64);
          var e = V.yb++ << 8 | 0;
          wb(e, { open(h) {
            h.seekable = false;
          }, close() {
            c?.buffer?.length && c(10);
          }, read(h, k, q, w) {
            for (var v = 0, C = 0; C < w; C++) {
              try {
                var G = b();
              } catch (pb) {
                throw new N(29);
              }
              if (void 0 === G && 0 === v)
                throw new N(6);
              if (null === G || void 0 === G)
                break;
              v++;
              k[q + C] = G;
            }
            v && (h.node.atime = Date.now());
            return v;
          }, write(h, k, q, w) {
            for (var v = 0; v < w; v++)
              try {
                c(k[q + v]);
              } catch (C) {
                throw new N(29);
              }
            w && (h.node.mtime = h.node.ctime = Date.now());
            return v;
          } });
          Yb(a, d, e);
        }
        var W = {};
        function Gc(a, b, c) {
          if ("/" === b.charAt(0))
            return b;
          a = -100 === a ? "/" : T(a).path;
          if (0 == b.length) {
            if (!c)
              throw new N(44);
            return a;
          }
          return a + "/" + b;
        }
        function Hc(a, b) {
          E[a >> 2] = b.dev;
          E[a + 4 >> 2] = b.mode;
          F[a + 8 >> 2] = b.nlink;
          E[a + 12 >> 2] = b.uid;
          E[a + 16 >> 2] = b.gid;
          E[a + 20 >> 2] = b.rdev;
          H[a + 24 >> 3] = BigInt(b.size);
          E[a + 32 >> 2] = 4096;
          E[a + 36 >> 2] = b.blocks;
          var c = b.atime.getTime(), d = b.mtime.getTime(), e = b.ctime.getTime();
          H[a + 40 >> 3] = BigInt(Math.floor(c / 1e3));
          F[a + 48 >> 2] = c % 1e3 * 1e6;
          H[a + 56 >> 3] = BigInt(Math.floor(d / 1e3));
          F[a + 64 >> 2] = d % 1e3 * 1e6;
          H[a + 72 >> 3] = BigInt(Math.floor(e / 1e3));
          F[a + 80 >> 2] = e % 1e3 * 1e6;
          H[a + 88 >> 3] = BigInt(b.ino);
          return 0;
        }
        var Ic = void 0, Jc = () => {
          var a = E[+Ic >> 2];
          Ic += 4;
          return a;
        }, Kc = 0, Lc = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335], Mc = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334], Nc = {}, Oc = (a) => {
          Ma = a;
          cb || 0 < Kc || (f.onExit?.(a), La = true);
          Da(a, new Ya(a));
        }, Pc = (a) => {
          if (!La)
            try {
              if (a(), !(cb || 0 < Kc))
                try {
                  Ma = a = Ma, Oc(a);
                } catch (b) {
                  b instanceof Ya || "unwind" == b || Da(1, b);
                }
            } catch (b) {
              b instanceof Ya || "unwind" == b || Da(1, b);
            }
        }, Qc = {}, Sc = () => {
          if (!Rc) {
            var a = { USER: "web_user", LOGNAME: "web_user", PATH: "/", PWD: "/", HOME: "/home/web_user", LANG: ("object" == typeof navigator && navigator.languages && navigator.languages[0] || "C").replace("-", "_") + ".UTF-8", _: Ca || "./this.program" }, b;
            for (b in Qc)
              void 0 === Qc[b] ? delete a[b] : a[b] = Qc[b];
            var c = [];
            for (b in a)
              c.push(`${b}=${a[b]}`);
            Rc = c;
          }
          return Rc;
        }, Rc, xa = (a) => {
          var b = ha(a) + 1, c = z(b);
          u(a, x, c, b);
          return c;
        }, Tc = (a, b, c, d) => {
          var e = { string: (v) => {
            var C = 0;
            null !== v && void 0 !== v && 0 !== v && (C = xa(v));
            return C;
          }, array: (v) => {
            var C = z(v.length);
            p.set(v, C);
            return C;
          } };
          a = f["_" + a];
          var h = [], k = 0;
          if (d)
            for (var q = 0; q < d.length; q++) {
              var w = e[c[q]];
              w ? (0 === k && (k = sa()), h[q] = w(d[q])) : h[q] = d[q];
            }
          c = a(...h);
          return c = function(v) {
            0 !== k && wa(k);
            return "string" === b ? v ? B(x, v) : "" : "boolean" === b ? !!v : v;
          }(c);
        }, ea = 0, da = (a, b) => {
          b = 1 == b ? z(a.length) : ia(a.length);
          a.subarray || a.slice || (a = new Uint8Array(a));
          x.set(a, b);
          return b;
        }, Uc, Vc = [], Y, A = (a) => {
          Uc.delete(Y.get(a));
          Y.set(a, null);
          Vc.push(a);
        }, Aa = (a, b) => {
          if (!Uc) {
            Uc = /* @__PURE__ */ new WeakMap();
            var c = Y.length;
            if (Uc)
              for (var d = 0; d < 0 + c; d++) {
                var e = Y.get(d);
                e && Uc.set(e, d);
              }
          }
          if (c = Uc.get(a) || 0)
            return c;
          if (Vc.length)
            c = Vc.pop();
          else {
            try {
              Y.grow(1);
            } catch (w) {
              if (!(w instanceof RangeError))
                throw w;
              throw "Unable to grow wasm table. Set ALLOW_TABLE_GROWTH.";
            }
            c = Y.length - 1;
          }
          try {
            Y.set(c, a);
          } catch (w) {
            if (!(w instanceof TypeError))
              throw w;
            if ("function" == typeof WebAssembly.Function) {
              var h = WebAssembly.Function;
              d = { i: "i32", j: "i64", f: "f32", d: "f64", e: "externref", p: "i32" };
              e = { parameters: [], results: "v" == b[0] ? [] : [d[b[0]]] };
              for (var k = 1; k < b.length; ++k)
                e.parameters.push(d[b[k]]);
              b = new h(e, a);
            } else {
              d = [1];
              e = b.slice(0, 1);
              b = b.slice(1);
              k = { i: 127, p: 127, j: 126, f: 125, d: 124, e: 111 };
              d.push(96);
              var q = b.length;
              128 > q ? d.push(q) : d.push(q % 128 | 128, q >> 7);
              for (h of b)
                d.push(k[h]);
              "v" == e ? d.push(0) : d.push(1, k[e]);
              b = [0, 97, 115, 109, 1, 0, 0, 0, 1];
              h = d.length;
              128 > h ? b.push(h) : b.push(h % 128 | 128, h >> 7);
              b.push(...d);
              b.push(2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0);
              b = new WebAssembly.Module(new Uint8Array(b));
              b = new WebAssembly.Instance(b, { e: { f: a } }).exports.f;
            }
            Y.set(c, b);
          }
          Uc.set(a, c);
          return c;
        };
        R = Array(4096);
        Wb(O, "/");
        U("/tmp");
        U("/home");
        U("/home/web_user");
        (function() {
          U("/dev");
          wb(259, { read: () => 0, write: (d, e, h, k) => k, Va: () => 0 });
          Yb("/dev/null", 259);
          nb(1280, yb);
          nb(1536, zb);
          Yb("/dev/tty", 1280);
          Yb("/dev/tty1", 1536);
          var a = new Uint8Array(1024), b = 0, c = () => {
            0 === b && (ib(a), b = a.byteLength);
            return a[--b];
          };
          V("random", c);
          V("urandom", c);
          U("/dev/shm");
          U("/dev/shm/tmp");
        })();
        (function() {
          U("/proc");
          var a = U("/proc/self");
          U("/proc/self/fd");
          Wb({ Xa() {
            var b = Bb(a, "fd", 16895, 73);
            b.Ma = { Va: O.Ma.Va };
            b.La = { lookup(c, d) {
              c = +d;
              var e = T(c);
              c = { parent: null, Xa: { zb: "fake" }, La: { readlink: () => e.path }, id: c + 1 };
              return c.parent = c;
            }, readdir() {
              return Array.from(Gb.entries()).filter(([, c]) => c).map(([c]) => c.toString());
            } };
            return b;
          } }, "/proc/self/fd");
        })();
        O.vb = new N(44);
        O.vb.stack = "<generic error, no stack>";
        var Xc = { a: (a, b, c, d) => Ta(`Assertion failed: ${a ? B(x, a) : ""}, at: ` + [b ? b ? B(x, b) : "" : "unknown filename", c, d ? d ? B(x, d) : "" : "unknown function"]), i: function(a, b) {
          try {
            return a = a ? B(x, a) : "", na(a, b), 0;
          } catch (c) {
            if ("undefined" == typeof W || "ErrnoError" !== c.name)
              throw c;
            return -c.Pa;
          }
        }, L: function(a, b, c) {
          try {
            b = b ? B(x, b) : "";
            b = Gc(a, b);
            if (c & -8)
              return -28;
            var d = S(b, { $a: true }).node;
            if (!d)
              return -44;
            a = "";
            c & 4 && (a += "r");
            c & 2 && (a += "w");
            c & 1 && (a += "x");
            return a && Ob(d, a) ? -2 : 0;
          } catch (e) {
            if ("undefined" == typeof W || "ErrnoError" !== e.name)
              throw e;
            return -e.Pa;
          }
        }, j: function(a, b) {
          try {
            var c = T(a);
            bc(c, c.node, b, false);
            return 0;
          } catch (d) {
            if ("undefined" == typeof W || "ErrnoError" !== d.name)
              throw d;
            return -d.Pa;
          }
        }, h: function(a) {
          try {
            var b = T(a);
            Vb(b, b.node, { timestamp: Date.now(), Fb: false });
            return 0;
          } catch (c) {
            if ("undefined" == typeof W || "ErrnoError" !== c.name)
              throw c;
            return -c.Pa;
          }
        }, b: function(a, b, c) {
          Ic = c;
          try {
            var d = T(a);
            switch (b) {
              case 0:
                var e = Jc();
                if (0 > e)
                  break;
                for (; Gb[e]; )
                  e++;
                return Ub(d, e).fd;
              case 1:
              case 2:
                return 0;
              case 3:
                return d.flags;
              case 4:
                return e = Jc(), d.flags |= e, 0;
              case 12:
                return e = Jc(), Na[e + 0 >> 1] = 2, 0;
              case 13:
              case 14:
                return 0;
            }
            return -28;
          } catch (h) {
            if ("undefined" == typeof W || "ErrnoError" !== h.name)
              throw h;
            return -h.Pa;
          }
        }, g: function(a, b) {
          try {
            var c = T(a), d = c.node, e = c.Ma.Ta;
            a = e ? c : d;
            e ??= d.La.Ta;
            Sb(e);
            var h = e(a);
            return Hc(b, h);
          } catch (k) {
            if ("undefined" == typeof W || "ErrnoError" !== k.name)
              throw k;
            return -k.Pa;
          }
        }, H: function(a, b) {
          b = -9007199254740992 > b || 9007199254740992 < b ? NaN : Number(b);
          try {
            if (isNaN(b))
              return 61;
            var c = T(a);
            if (0 > b || 0 === (c.flags & 2097155))
              throw new N(28);
            cc(c, c.node, b);
            return 0;
          } catch (d) {
            if ("undefined" == typeof W || "ErrnoError" !== d.name)
              throw d;
            return -d.Pa;
          }
        }, G: function(a, b) {
          try {
            if (0 === b)
              return -28;
            var c = ha("/") + 1;
            if (b < c)
              return -68;
            u("/", x, a, b);
            return c;
          } catch (d) {
            if ("undefined" == typeof W || "ErrnoError" !== d.name)
              throw d;
            return -d.Pa;
          }
        }, K: function(a, b) {
          try {
            return a = a ? B(x, a) : "", Hc(b, ac(a, true));
          } catch (c) {
            if ("undefined" == typeof W || "ErrnoError" !== c.name)
              throw c;
            return -c.Pa;
          }
        }, C: function(a, b, c) {
          try {
            return b = b ? B(x, b) : "", b = Gc(a, b), U(b, c), 0;
          } catch (d) {
            if ("undefined" == typeof W || "ErrnoError" !== d.name)
              throw d;
            return -d.Pa;
          }
        }, J: function(a, b, c, d) {
          try {
            b = b ? B(x, b) : "";
            var e = d & 256;
            b = Gc(a, b, d & 4096);
            return Hc(c, e ? ac(b, true) : ac(b));
          } catch (h) {
            if ("undefined" == typeof W || "ErrnoError" !== h.name)
              throw h;
            return -h.Pa;
          }
        }, x: function(a, b, c, d) {
          Ic = d;
          try {
            b = b ? B(x, b) : "";
            b = Gc(a, b);
            var e = d ? Jc() : 0;
            return oa(b, c, e).fd;
          } catch (h) {
            if ("undefined" == typeof W || "ErrnoError" !== h.name)
              throw h;
            return -h.Pa;
          }
        }, v: function(a, b, c, d) {
          try {
            b = b ? B(x, b) : "";
            b = Gc(a, b);
            if (0 >= d)
              return -28;
            var e = S(b).node;
            if (!e)
              throw new N(44);
            if (!e.La.readlink)
              throw new N(28);
            var h = e.La.readlink(e);
            var k = Math.min(d, ha(h)), q = p[c + k];
            u(h, x, c, d + 1);
            p[c + k] = q;
            return k;
          } catch (w) {
            if ("undefined" == typeof W || "ErrnoError" !== w.name)
              throw w;
            return -w.Pa;
          }
        }, u: function(a) {
          try {
            return a = a ? B(x, a) : "", $b(a), 0;
          } catch (b) {
            if ("undefined" == typeof W || "ErrnoError" !== b.name)
              throw b;
            return -b.Pa;
          }
        }, f: function(a, b) {
          try {
            return a = a ? B(x, a) : "", Hc(b, ac(a));
          } catch (c) {
            if ("undefined" == typeof W || "ErrnoError" !== c.name)
              throw c;
            return -c.Pa;
          }
        }, r: function(a, b, c) {
          try {
            return b = b ? B(x, b) : "", b = Gc(a, b), 0 === c ? za(b) : 512 === c ? $b(b) : Ta("Invalid flags passed to unlinkat"), 0;
          } catch (d) {
            if ("undefined" == typeof W || "ErrnoError" !== d.name)
              throw d;
            return -d.Pa;
          }
        }, q: function(a, b, c) {
          try {
            b = b ? B(x, b) : "";
            b = Gc(a, b, true);
            var d = Date.now(), e, h;
            if (c) {
              var k = F[c >> 2] + 4294967296 * E[c + 4 >> 2], q = E[c + 8 >> 2];
              1073741823 == q ? e = d : 1073741822 == q ? e = null : e = 1e3 * k + q / 1e6;
              c += 16;
              k = F[c >> 2] + 4294967296 * E[c + 4 >> 2];
              q = E[c + 8 >> 2];
              1073741823 == q ? h = d : 1073741822 == q ? h = null : h = 1e3 * k + q / 1e6;
            } else
              h = e = d;
            if (null !== (h ?? e)) {
              a = e;
              var w = S(b, { $a: true }).node;
              Sb(w.La.Ua)(w, { atime: a, mtime: h });
            }
            return 0;
          } catch (v) {
            if ("undefined" == typeof W || "ErrnoError" !== v.name)
              throw v;
            return -v.Pa;
          }
        }, m: () => Ta(""), l: () => {
          cb = false;
          Kc = 0;
        }, A: function(a, b) {
          a = -9007199254740992 > a || 9007199254740992 < a ? NaN : Number(a);
          a = new Date(1e3 * a);
          E[b >> 2] = a.getSeconds();
          E[b + 4 >> 2] = a.getMinutes();
          E[b + 8 >> 2] = a.getHours();
          E[b + 12 >> 2] = a.getDate();
          E[b + 16 >> 2] = a.getMonth();
          E[b + 20 >> 2] = a.getFullYear() - 1900;
          E[b + 24 >> 2] = a.getDay();
          var c = a.getFullYear();
          E[b + 28 >> 2] = (0 !== c % 4 || 0 === c % 100 && 0 !== c % 400 ? Mc : Lc)[a.getMonth()] + a.getDate() - 1 | 0;
          E[b + 36 >> 2] = -(60 * a.getTimezoneOffset());
          c = new Date(
            a.getFullYear(),
            6,
            1
          ).getTimezoneOffset();
          var d = new Date(a.getFullYear(), 0, 1).getTimezoneOffset();
          E[b + 32 >> 2] = (c != d && a.getTimezoneOffset() == Math.min(d, c)) | 0;
        }, y: function(a, b, c, d, e, h, k) {
          e = -9007199254740992 > e || 9007199254740992 < e ? NaN : Number(e);
          try {
            if (isNaN(e))
              return 61;
            var q = T(d);
            if (0 !== (b & 2) && 0 === (c & 2) && 2 !== (q.flags & 2097155))
              throw new N(2);
            if (1 === (q.flags & 2097155))
              throw new N(2);
            if (!q.Ma.ib)
              throw new N(43);
            if (!a)
              throw new N(28);
            var w = q.Ma.ib(q, a, e, b, c);
            var v = w.Kb;
            E[h >> 2] = w.Ab;
            F[k >> 2] = v;
            return 0;
          } catch (C) {
            if ("undefined" == typeof W || "ErrnoError" !== C.name)
              throw C;
            return -C.Pa;
          }
        }, z: function(a, b, c, d, e, h) {
          h = -9007199254740992 > h || 9007199254740992 < h ? NaN : Number(h);
          try {
            var k = T(e);
            if (c & 2) {
              c = h;
              if (32768 !== (k.node.mode & 61440))
                throw new N(43);
              if (!(d & 2)) {
                var q = x.slice(a, a + b);
                k.Ma.jb && k.Ma.jb(k, q, c, b, d);
              }
            }
          } catch (w) {
            if ("undefined" == typeof W || "ErrnoError" !== w.name)
              throw w;
            return -w.Pa;
          }
        }, n: (a, b) => {
          Nc[a] && (clearTimeout(Nc[a].id), delete Nc[a]);
          if (!b)
            return 0;
          var c = setTimeout(() => {
            delete Nc[a];
            Pc(() => Wc(a, performance.now()));
          }, b);
          Nc[a] = {
            id: c,
            Xb: b
          };
          return 0;
        }, B: (a, b, c, d) => {
          var e = (/* @__PURE__ */ new Date()).getFullYear(), h = new Date(e, 0, 1).getTimezoneOffset();
          e = new Date(e, 6, 1).getTimezoneOffset();
          F[a >> 2] = 60 * Math.max(h, e);
          E[b >> 2] = Number(h != e);
          b = (k) => {
            var q = Math.abs(k);
            return `UTC${0 <= k ? "-" : "+"}${String(Math.floor(q / 60)).padStart(2, "0")}${String(q % 60).padStart(2, "0")}`;
          };
          a = b(h);
          b = b(e);
          e < h ? (u(a, x, c, 17), u(b, x, d, 17)) : (u(a, x, d, 17), u(b, x, c, 17));
        }, d: () => Date.now(), s: () => 2147483648, c: () => performance.now(), o: (a) => {
          var b = x.length;
          a >>>= 0;
          if (2147483648 < a)
            return false;
          for (var c = 1; 4 >= c; c *= 2) {
            var d = b * (1 + 0.2 / c);
            d = Math.min(d, a + 100663296);
            a: {
              d = (Math.min(2147483648, 65536 * Math.ceil(Math.max(a, d) / 65536)) - Ka.buffer.byteLength + 65535) / 65536 | 0;
              try {
                Ka.grow(d);
                Qa();
                var e = 1;
                break a;
              } catch (h) {
              }
              e = void 0;
            }
            if (e)
              return true;
          }
          return false;
        }, E: (a, b) => {
          var c = 0;
          Sc().forEach((d, e) => {
            var h = b + c;
            e = F[a + 4 * e >> 2] = h;
            for (h = 0; h < d.length; ++h)
              p[e++] = d.charCodeAt(h);
            p[e] = 0;
            c += d.length + 1;
          });
          return 0;
        }, F: (a, b) => {
          var c = Sc();
          F[a >> 2] = c.length;
          var d = 0;
          c.forEach((e) => d += e.length + 1);
          F[b >> 2] = d;
          return 0;
        }, e: function(a) {
          try {
            var b = T(a);
            qa(b);
            return 0;
          } catch (c) {
            if ("undefined" == typeof W || "ErrnoError" !== c.name)
              throw c;
            return c.Pa;
          }
        }, p: function(a, b) {
          try {
            var c = T(a);
            p[b] = c.tty ? 2 : P(c.mode) ? 3 : 40960 === (c.mode & 61440) ? 7 : 4;
            Na[b + 2 >> 1] = 0;
            H[b + 8 >> 3] = BigInt(0);
            H[b + 16 >> 3] = BigInt(0);
            return 0;
          } catch (d) {
            if ("undefined" == typeof W || "ErrnoError" !== d.name)
              throw d;
            return d.Pa;
          }
        }, w: function(a, b, c, d) {
          try {
            a: {
              var e = T(a);
              a = b;
              for (var h, k = b = 0; k < c; k++) {
                var q = F[a >> 2], w = F[a + 4 >> 2];
                a += 8;
                var v = Ec(e, p, q, w, h);
                if (0 > v) {
                  var C = -1;
                  break a;
                }
                b += v;
                if (v < w)
                  break;
                "undefined" != typeof h && (h += v);
              }
              C = b;
            }
            F[d >> 2] = C;
            return 0;
          } catch (G) {
            if ("undefined" == typeof W || "ErrnoError" !== G.name)
              throw G;
            return G.Pa;
          }
        }, D: function(a, b, c, d) {
          b = -9007199254740992 > b || 9007199254740992 < b ? NaN : Number(b);
          try {
            if (isNaN(b))
              return 61;
            var e = T(a);
            mc(e, b, c);
            H[d >> 3] = BigInt(e.position);
            e.ob && 0 === b && 0 === c && (e.ob = null);
            return 0;
          } catch (h) {
            if ("undefined" == typeof W || "ErrnoError" !== h.name)
              throw h;
            return h.Pa;
          }
        }, I: function(a) {
          try {
            var b = T(a);
            return b.Ma?.fsync ? b.Ma.fsync(b) : 0;
          } catch (c) {
            if ("undefined" == typeof W || "ErrnoError" !== c.name)
              throw c;
            return c.Pa;
          }
        }, t: function(a, b, c, d) {
          try {
            a: {
              var e = T(a);
              a = b;
              for (var h, k = b = 0; k < c; k++) {
                var q = F[a >> 2], w = F[a + 4 >> 2];
                a += 8;
                var v = pa(e, p, q, w, h);
                if (0 > v) {
                  var C = -1;
                  break a;
                }
                b += v;
                if (v < w)
                  break;
                "undefined" != typeof h && (h += v);
              }
              C = b;
            }
            F[d >> 2] = C;
            return 0;
          } catch (G) {
            if ("undefined" == typeof W || "ErrnoError" !== G.name)
              throw G;
            return G.Pa;
          }
        }, k: Oc }, Z;
        (async function() {
          function a(c) {
            Z = c.exports;
            Ka = Z.M;
            Qa();
            Y = Z.O;
            K--;
            f.monitorRunDependencies?.(K);
            0 == K && Sa && (c = Sa, Sa = null, c());
            return Z;
          }
          K++;
          f.monitorRunDependencies?.(K);
          var b = { a: Xc };
          if (f.instantiateWasm)
            return new Promise((c) => {
              f.instantiateWasm(b, (d, e) => {
                a(d, e);
                c(d.exports);
              });
            });
          Ua ??= f.locateFile ? f.locateFile("sql-wasm.wasm", D) : D + "sql-wasm.wasm";
          return a((await Xa(b)).instance);
        })();
        f._sqlite3_free = (a) => (f._sqlite3_free = Z.P)(a);
        f._sqlite3_value_text = (a) => (f._sqlite3_value_text = Z.Q)(a);
        f._sqlite3_prepare_v2 = (a, b, c, d, e) => (f._sqlite3_prepare_v2 = Z.R)(a, b, c, d, e);
        f._sqlite3_step = (a) => (f._sqlite3_step = Z.S)(a);
        f._sqlite3_reset = (a) => (f._sqlite3_reset = Z.T)(a);
        f._sqlite3_exec = (a, b, c, d, e) => (f._sqlite3_exec = Z.U)(a, b, c, d, e);
        f._sqlite3_finalize = (a) => (f._sqlite3_finalize = Z.V)(a);
        f._sqlite3_column_name = (a, b) => (f._sqlite3_column_name = Z.W)(a, b);
        f._sqlite3_column_text = (a, b) => (f._sqlite3_column_text = Z.X)(a, b);
        f._sqlite3_column_type = (a, b) => (f._sqlite3_column_type = Z.Y)(a, b);
        f._sqlite3_errmsg = (a) => (f._sqlite3_errmsg = Z.Z)(a);
        f._sqlite3_clear_bindings = (a) => (f._sqlite3_clear_bindings = Z._)(a);
        f._sqlite3_value_blob = (a) => (f._sqlite3_value_blob = Z.$)(a);
        f._sqlite3_value_bytes = (a) => (f._sqlite3_value_bytes = Z.aa)(a);
        f._sqlite3_value_double = (a) => (f._sqlite3_value_double = Z.ba)(a);
        f._sqlite3_value_int = (a) => (f._sqlite3_value_int = Z.ca)(a);
        f._sqlite3_value_type = (a) => (f._sqlite3_value_type = Z.da)(a);
        f._sqlite3_result_blob = (a, b, c, d) => (f._sqlite3_result_blob = Z.ea)(a, b, c, d);
        f._sqlite3_result_double = (a, b) => (f._sqlite3_result_double = Z.fa)(a, b);
        f._sqlite3_result_error = (a, b, c) => (f._sqlite3_result_error = Z.ga)(a, b, c);
        f._sqlite3_result_int = (a, b) => (f._sqlite3_result_int = Z.ha)(a, b);
        f._sqlite3_result_int64 = (a, b) => (f._sqlite3_result_int64 = Z.ia)(a, b);
        f._sqlite3_result_null = (a) => (f._sqlite3_result_null = Z.ja)(a);
        f._sqlite3_result_text = (a, b, c, d) => (f._sqlite3_result_text = Z.ka)(a, b, c, d);
        f._sqlite3_aggregate_context = (a, b) => (f._sqlite3_aggregate_context = Z.la)(a, b);
        f._sqlite3_column_count = (a) => (f._sqlite3_column_count = Z.ma)(a);
        f._sqlite3_data_count = (a) => (f._sqlite3_data_count = Z.na)(a);
        f._sqlite3_column_blob = (a, b) => (f._sqlite3_column_blob = Z.oa)(a, b);
        f._sqlite3_column_bytes = (a, b) => (f._sqlite3_column_bytes = Z.pa)(a, b);
        f._sqlite3_column_double = (a, b) => (f._sqlite3_column_double = Z.qa)(a, b);
        f._sqlite3_bind_blob = (a, b, c, d, e) => (f._sqlite3_bind_blob = Z.ra)(a, b, c, d, e);
        f._sqlite3_bind_double = (a, b, c) => (f._sqlite3_bind_double = Z.sa)(a, b, c);
        f._sqlite3_bind_int = (a, b, c) => (f._sqlite3_bind_int = Z.ta)(a, b, c);
        f._sqlite3_bind_text = (a, b, c, d, e) => (f._sqlite3_bind_text = Z.ua)(a, b, c, d, e);
        f._sqlite3_bind_parameter_index = (a, b) => (f._sqlite3_bind_parameter_index = Z.va)(a, b);
        f._sqlite3_sql = (a) => (f._sqlite3_sql = Z.wa)(a);
        f._sqlite3_normalized_sql = (a) => (f._sqlite3_normalized_sql = Z.xa)(a);
        f._sqlite3_changes = (a) => (f._sqlite3_changes = Z.ya)(a);
        f._sqlite3_close_v2 = (a) => (f._sqlite3_close_v2 = Z.za)(a);
        f._sqlite3_create_function_v2 = (a, b, c, d, e, h, k, q, w) => (f._sqlite3_create_function_v2 = Z.Aa)(a, b, c, d, e, h, k, q, w);
        f._sqlite3_update_hook = (a, b, c) => (f._sqlite3_update_hook = Z.Ba)(a, b, c);
        f._sqlite3_open = (a, b) => (f._sqlite3_open = Z.Ca)(a, b);
        var ia = f._malloc = (a) => (ia = f._malloc = Z.Da)(a), fa = f._free = (a) => (fa = f._free = Z.Ea)(a);
        f._RegisterExtensionFunctions = (a) => (f._RegisterExtensionFunctions = Z.Fa)(a);
        var Db = (a, b) => (Db = Z.Ga)(a, b), Wc = (a, b) => (Wc = Z.Ha)(a, b), wa = (a) => (wa = Z.Ia)(a), z = (a) => (z = Z.Ja)(a), sa = () => (sa = Z.Ka)();
        f.stackSave = () => sa();
        f.stackRestore = (a) => wa(a);
        f.stackAlloc = (a) => z(a);
        f.cwrap = (a, b, c, d) => {
          var e = !c || c.every((h) => "number" === h || "boolean" === h);
          return "string" !== b && e && !d ? f["_" + a] : (...h) => Tc(a, b, c, h);
        };
        f.addFunction = Aa;
        f.removeFunction = A;
        f.UTF8ToString = ua;
        f.ALLOC_NORMAL = ea;
        f.allocate = da;
        f.allocateUTF8OnStack = xa;
        function Yc() {
          function a() {
            f.calledRun = true;
            if (!La) {
              if (!f.noFSInit && !Ib) {
                var b, c;
                Ib = true;
                d ??= f.stdin;
                b ??= f.stdout;
                c ??= f.stderr;
                d ? V("stdin", d) : Zb("/dev/tty", "/dev/stdin");
                b ? V("stdout", null, b) : Zb("/dev/tty", "/dev/stdout");
                c ? V("stderr", null, c) : Zb("/dev/tty1", "/dev/stderr");
                oa("/dev/stdin", 0);
                oa("/dev/stdout", 1);
                oa("/dev/stderr", 1);
              }
              Z.N();
              Jb = false;
              f.onRuntimeInitialized?.();
              if (f.postRun)
                for ("function" == typeof f.postRun && (f.postRun = [f.postRun]); f.postRun.length; ) {
                  var d = f.postRun.shift();
                  $a.unshift(d);
                }
              Za($a);
            }
          }
          if (0 < K)
            Sa = Yc;
          else {
            if (f.preRun)
              for ("function" == typeof f.preRun && (f.preRun = [f.preRun]); f.preRun.length; )
                bb();
            Za(ab);
            0 < K ? Sa = Yc : f.setStatus ? (f.setStatus("Running..."), setTimeout(() => {
              setTimeout(() => f.setStatus(""), 1);
              a();
            }, 1)) : a();
          }
        }
        if (f.preInit)
          for ("function" == typeof f.preInit && (f.preInit = [f.preInit]); 0 < f.preInit.length; )
            f.preInit.pop()();
        Yc();
        return Module;
      });
      return initSqlJsPromise;
    };
    if (typeof exports === "object" && typeof module === "object") {
      module.exports = initSqlJs2;
      module.exports.default = initSqlJs2;
    } else if (typeof define === "function" && define["amd"]) {
      define([], function() {
        return initSqlJs2;
      });
    } else if (typeof exports === "object") {
      exports["Module"] = initSqlJs2;
    }
  }
});

// src/config.ts
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
function getDataDir() {
  const home = os.homedir();
  return path.join(home, ".cortex");
}
function getConfigPath() {
  return path.join(getDataDir(), "config.json");
}
function getDatabasePath() {
  return path.join(getDataDir(), "memory.db");
}
function ensureDataDir() {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];
    if (sourceValue !== void 0 && typeof sourceValue === "object" && sourceValue !== null && !Array.isArray(sourceValue) && typeof targetValue === "object" && targetValue !== null) {
      result[key] = deepMerge(targetValue, sourceValue);
    } else if (sourceValue !== void 0) {
      result[key] = sourceValue;
    }
  }
  return result;
}
function loadConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }
  try {
    const content = fs.readFileSync(configPath, "utf8");
    const loaded = JSON.parse(content);
    return deepMerge(DEFAULT_CONFIG, loaded);
  } catch {
    return DEFAULT_CONFIG;
  }
}
function getAnalyticsPath() {
  return path.join(getDataDir(), "analytics.json");
}
function getSessionsPath() {
  return path.join(getDataDir(), "sessions.json");
}
function loadSessions() {
  const sessionsPath = getSessionsPath();
  if (!fs.existsSync(sessionsPath)) {
    return {};
  }
  try {
    const content = fs.readFileSync(sessionsPath, "utf8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}
function getCurrentSession(projectId) {
  if (!projectId) {
    return null;
  }
  const sessions = loadSessions();
  return sessions[projectId] || null;
}
var DEFAULT_STATUSLINE_CONFIG, DEFAULT_ARCHIVE_CONFIG, DEFAULT_MONITOR_CONFIG, DEFAULT_AUTOMATION_CONFIG, DEFAULT_SETUP_CONFIG, DEFAULT_CONFIG;
var init_config = __esm({
  "src/config.ts"() {
    "use strict";
    DEFAULT_STATUSLINE_CONFIG = {
      enabled: true,
      showFragments: true,
      showLastArchive: true,
      showContext: true,
      contextWarningThreshold: 70
    };
    DEFAULT_ARCHIVE_CONFIG = {
      autoOnCompact: true,
      projectScope: true,
      minContentLength: 50
    };
    DEFAULT_MONITOR_CONFIG = {
      tokenThreshold: 70
    };
    DEFAULT_AUTOMATION_CONFIG = {
      autoSaveThreshold: 70,
      autoClearThreshold: 80,
      autoClearEnabled: false,
      restorationTokenBudget: 1e3,
      restorationMessageCount: 5
    };
    DEFAULT_SETUP_CONFIG = {
      completed: false,
      completedAt: null
    };
    DEFAULT_CONFIG = {
      statusline: DEFAULT_STATUSLINE_CONFIG,
      archive: DEFAULT_ARCHIVE_CONFIG,
      monitor: DEFAULT_MONITOR_CONFIG,
      automation: DEFAULT_AUTOMATION_CONFIG,
      setup: DEFAULT_SETUP_CONFIG
    };
  }
});

// src/database.ts
import * as fs2 from "fs";
import * as crypto2 from "crypto";
async function initDb() {
  if (dbInstance) {
    return dbInstance;
  }
  if (!SQL) {
    SQL = await (0, import_sql.default)();
  }
  ensureDataDir();
  const dbPath = getDatabasePath();
  if (fs2.existsSync(dbPath)) {
    const buffer = fs2.readFileSync(dbPath);
    dbInstance = new SQL.Database(buffer);
    try {
      dbInstance.exec(`SELECT 1 FROM memories_fts LIMIT 1`);
      fts5Available = true;
    } catch {
      fts5Available = false;
    }
  } else {
    dbInstance = new SQL.Database();
    createSchema(dbInstance);
  }
  return dbInstance;
}
function checkFts5(db) {
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS _fts5_test USING fts5(test)`);
    db.exec(`DROP TABLE _fts5_test`);
    return true;
  } catch {
    return false;
  }
}
function createSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL UNIQUE,
      embedding BLOB NOT NULL,
      project_id TEXT,
      source_session TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_memories_content_hash ON memories(content_hash)`);
  fts5Available = checkFts5(db);
  if (fts5Available) {
    try {
      db.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
          content,
          content='memories',
          content_rowid='id'
        )
      `);
      db.run(`
        CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
          INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
        END
      `);
      db.run(`
        CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
          INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.id, old.content);
        END
      `);
      db.run(`
        CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
          INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.id, old.content);
          INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
        END
      `);
    } catch {
      fts5Available = false;
    }
  }
}
function saveDb(db) {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs2.writeFileSync(getDatabasePath(), buffer);
}
function hashContent(content) {
  return crypto2.createHash("sha256").update(content.trim()).digest("hex").substring(0, 16);
}
function embeddingToBuffer(embedding) {
  return Buffer.from(embedding.buffer);
}
function bufferToEmbedding(buffer) {
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
}
function insertMemory(db, memory) {
  const hash = hashContent(memory.content);
  const existing = db.exec(
    `SELECT id FROM memories WHERE content_hash = ?`,
    [hash]
  );
  if (existing.length > 0 && existing[0].values.length > 0) {
    return { id: existing[0].values[0][0], isDuplicate: true };
  }
  db.run(
    `INSERT INTO memories (content, content_hash, embedding, project_id, source_session, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      memory.content,
      hash,
      embeddingToBuffer(memory.embedding),
      memory.projectId,
      memory.sourceSession,
      memory.timestamp.toISOString()
    ]
  );
  const result = db.exec(`SELECT last_insert_rowid()`);
  const id = result[0].values[0][0];
  return { id, isDuplicate: false };
}
function getMemory(db, id) {
  const result = db.exec(
    `SELECT id, content, content_hash, embedding, project_id, source_session, timestamp
     FROM memories WHERE id = ?`,
    [id]
  );
  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }
  const row = result[0].values[0];
  return {
    id: row[0],
    content: row[1],
    contentHash: row[2],
    embedding: bufferToEmbedding(row[3]),
    projectId: row[4],
    sourceSession: row[5],
    timestamp: new Date(row[6])
  };
}
function contentExists(db, content) {
  const hash = hashContent(content);
  const result = db.exec(
    `SELECT 1 FROM memories WHERE content_hash = ? LIMIT 1`,
    [hash]
  );
  return result.length > 0 && result[0].values.length > 0;
}
function deleteMemory(db, id) {
  db.run(`DELETE FROM memories WHERE id = ?`, [id]);
  return db.getRowsModified() > 0;
}
function storeManualMemory(db, content, embedding, projectId, context) {
  const fullContent = context ? `${content}

[Context: ${context}]` : content;
  const sessionId = `manual-${Date.now()}`;
  return insertMemory(db, {
    content: fullContent,
    embedding,
    projectId,
    sourceSession: sessionId,
    timestamp: /* @__PURE__ */ new Date()
  });
}
function searchByVector(db, queryEmbedding, projectId, limit = 10) {
  let query = `SELECT id, content, embedding, project_id, timestamp FROM memories`;
  const params = [];
  if (projectId !== void 0) {
    if (projectId === null) {
      query += ` WHERE project_id IS NULL`;
    } else {
      query += ` WHERE project_id = ?`;
      params.push(projectId);
    }
  }
  const result = db.exec(query, params);
  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }
  const scored = result[0].values.map((row) => {
    const embedding = bufferToEmbedding(row[2]);
    const similarity = cosineSimilarity(queryEmbedding, embedding);
    return {
      id: row[0],
      content: row[1],
      score: similarity,
      timestamp: new Date(row[4]),
      projectId: row[3]
    };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
function searchByKeyword(db, query, projectId, limit = 10) {
  const cleanQuery = query.replace(/['"]/g, "").trim();
  if (!cleanQuery) {
    return [];
  }
  if (fts5Available) {
    try {
      return searchByFts5(db, cleanQuery, projectId, limit);
    } catch {
    }
  }
  return searchByLike(db, cleanQuery, projectId, limit);
}
function searchByFts5(db, query, projectId, limit = 10) {
  let sql = `
    SELECT m.id, m.content, m.project_id, m.timestamp,
           bm25(memories_fts) as rank
    FROM memories_fts f
    JOIN memories m ON f.rowid = m.id
    WHERE memories_fts MATCH ?
  `;
  const params = [query];
  if (projectId !== void 0) {
    if (projectId === null) {
      sql += ` AND m.project_id IS NULL`;
    } else {
      sql += ` AND m.project_id = ?`;
      params.push(projectId);
    }
  }
  sql += ` ORDER BY rank LIMIT ?`;
  params.push(limit.toString());
  const result = db.exec(sql, params);
  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }
  return result[0].values.map((row) => ({
    id: row[0],
    content: row[1],
    projectId: row[2],
    timestamp: new Date(row[3]),
    score: Math.abs(row[4])
    // BM25 returns negative scores
  }));
}
function searchByLike(db, query, projectId, limit = 10) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const conditions = words.map(() => `LOWER(content) LIKE ?`);
  const params = words.map((w) => `%${w}%`);
  let sql = `
    SELECT id, content, project_id, timestamp,
           LENGTH(content) as len
    FROM memories
    WHERE ${conditions.join(" AND ")}
  `;
  if (projectId !== void 0) {
    if (projectId === null) {
      sql += ` AND project_id IS NULL`;
    } else {
      sql += ` AND project_id = ?`;
      params.push(projectId);
    }
  }
  sql += ` ORDER BY timestamp DESC LIMIT ?`;
  params.push(limit.toString());
  const result = db.exec(sql, params);
  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }
  return result[0].values.map((row, index) => ({
    id: row[0],
    content: row[1],
    projectId: row[2],
    timestamp: new Date(row[3]),
    // Simple score based on position (earlier = higher score)
    score: 1 - index * 0.1
  }));
}
function getStats(db) {
  const fragmentResult = db.exec(`SELECT COUNT(*) FROM memories`);
  const fragmentCount = fragmentResult[0]?.values[0]?.[0] ?? 0;
  const projectResult = db.exec(`SELECT COUNT(DISTINCT project_id) FROM memories WHERE project_id IS NOT NULL`);
  const projectCount = projectResult[0]?.values[0]?.[0] ?? 0;
  const sessionResult = db.exec(`SELECT COUNT(DISTINCT source_session) FROM memories`);
  const sessionCount = sessionResult[0]?.values[0]?.[0] ?? 0;
  const oldestResult = db.exec(`SELECT MIN(timestamp) FROM memories`);
  const oldestStr = oldestResult[0]?.values[0]?.[0];
  const oldestTimestamp = oldestStr ? new Date(oldestStr) : null;
  const newestResult = db.exec(`SELECT MAX(timestamp) FROM memories`);
  const newestStr = newestResult[0]?.values[0]?.[0];
  const newestTimestamp = newestStr ? new Date(newestStr) : null;
  const dbPath = getDatabasePath();
  let dbSizeBytes = 0;
  if (fs2.existsSync(dbPath)) {
    dbSizeBytes = fs2.statSync(dbPath).size;
  }
  return {
    fragmentCount,
    projectCount,
    sessionCount,
    dbSizeBytes,
    oldestTimestamp,
    newestTimestamp
  };
}
function getProjectStats(db, projectId) {
  const fragmentResult = db.exec(
    `SELECT COUNT(*) FROM memories WHERE project_id = ?`,
    [projectId]
  );
  const fragmentCount = fragmentResult[0]?.values[0]?.[0] ?? 0;
  const sessionResult = db.exec(
    `SELECT COUNT(DISTINCT source_session) FROM memories WHERE project_id = ?`,
    [projectId]
  );
  const sessionCount = sessionResult[0]?.values[0]?.[0] ?? 0;
  const lastResult = db.exec(
    `SELECT MAX(timestamp) FROM memories WHERE project_id = ?`,
    [projectId]
  );
  const lastStr = lastResult[0]?.values[0]?.[0];
  const lastArchive = lastStr ? new Date(lastStr) : null;
  return {
    fragmentCount,
    sessionCount,
    lastArchive
  };
}
function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }
  return dotProduct / denominator;
}
var import_sql, dbInstance, SQL, fts5Available;
var init_database = __esm({
  "src/database.ts"() {
    "use strict";
    import_sql = __toESM(require_sql_wasm(), 1);
    init_config();
    dbInstance = null;
    SQL = null;
    fts5Available = false;
  }
});

// src/embeddings.ts
async function loadTransformers() {
  if (pipelineFunc)
    return pipelineFunc;
  const transformers = await import("@xenova/transformers");
  pipelineFunc = transformers.pipeline;
  return pipelineFunc;
}
async function initEmbedder() {
  if (embedder) {
    return embedder;
  }
  if (initPromise) {
    return initPromise;
  }
  initPromise = (async () => {
    try {
      const pipeline = await loadTransformers();
      embedder = await pipeline("feature-extraction", MODEL_NAME, {
        quantized: true
      });
      return embedder;
    } catch (error) {
      initPromise = null;
      throw error;
    }
  })();
  return initPromise;
}
async function embedQuery(text) {
  const pipe = await initEmbedder();
  const prefixedText = QUERY_PREFIX + text;
  const output = await pipe(prefixedText, {
    pooling: "mean",
    normalize: true
  });
  return new Float32Array(output.data);
}
async function embedBatch(texts, options = {}) {
  const { batchSize = 32, onProgress, isQuery = false } = options;
  const prefix = isQuery ? QUERY_PREFIX : PASSAGE_PREFIX;
  const pipe = await initEmbedder();
  const results = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const prefixedBatch = batch.map((t) => prefix + t);
    for (const text of prefixedBatch) {
      const output = await pipe(text, {
        pooling: "mean",
        normalize: true
      });
      results.push(new Float32Array(output.data));
    }
    if (onProgress) {
      onProgress(Math.min(i + batchSize, texts.length), texts.length);
    }
  }
  return results;
}
var MODEL_NAME, PASSAGE_PREFIX, QUERY_PREFIX, embedder, initPromise, pipelineFunc;
var init_embeddings = __esm({
  "src/embeddings.ts"() {
    "use strict";
    MODEL_NAME = "Xenova/bge-small-en-v1.5";
    PASSAGE_PREFIX = "passage: ";
    QUERY_PREFIX = "query: ";
    embedder = null;
    initPromise = null;
    pipelineFunc = null;
  }
});

// src/mcp-server.ts
init_database();
init_config();
import * as readline2 from "readline";

// src/search.ts
init_database();
init_embeddings();
var VECTOR_WEIGHT = 0.6;
var KEYWORD_WEIGHT = 0.4;
var RECENCY_HALF_LIFE_DAYS = 7;
var RRF_K = 60;
async function hybridSearch(db, query, options = {}) {
  const {
    projectScope = true,
    projectId,
    limit = 5,
    includeAllProjects = false
  } = options;
  const projectFilter = includeAllProjects ? void 0 : projectScope ? projectId : void 0;
  const queryEmbedding = await embedQuery(query);
  const [vectorResults, keywordResults] = await Promise.all([
    searchByVector(db, queryEmbedding, projectFilter, limit * 2),
    searchByKeyword(db, query, projectFilter, limit * 2)
  ]);
  const combined = combineWithRRF(vectorResults, keywordResults);
  const withRecency = applyRecencyDecay(combined);
  const sorted = withRecency.sort((a, b) => b.score - a.score).slice(0, limit);
  return sorted;
}
function combineWithRRF(vectorResults, keywordResults) {
  const scores = /* @__PURE__ */ new Map();
  vectorResults.forEach((result, rank) => {
    const rrfScore = VECTOR_WEIGHT / (RRF_K + rank + 1);
    if (!scores.has(result.id)) {
      scores.set(result.id, {
        rrfScore: 0,
        content: result.content,
        timestamp: result.timestamp,
        projectId: result.projectId,
        sources: /* @__PURE__ */ new Set()
      });
    }
    const entry = scores.get(result.id);
    entry.rrfScore += rrfScore;
    entry.sources.add("vector");
  });
  keywordResults.forEach((result, rank) => {
    const rrfScore = KEYWORD_WEIGHT / (RRF_K + rank + 1);
    if (!scores.has(result.id)) {
      scores.set(result.id, {
        rrfScore: 0,
        content: result.content,
        timestamp: result.timestamp,
        projectId: result.projectId,
        sources: /* @__PURE__ */ new Set()
      });
    }
    const entry = scores.get(result.id);
    entry.rrfScore += rrfScore;
    entry.sources.add("keyword");
  });
  return Array.from(scores.entries()).map(([id, data]) => {
    let source;
    if (data.sources.has("vector") && data.sources.has("keyword")) {
      source = "hybrid";
    } else if (data.sources.has("vector")) {
      source = "vector";
    } else {
      source = "keyword";
    }
    return {
      id,
      score: data.rrfScore,
      content: data.content,
      source,
      timestamp: data.timestamp,
      projectId: data.projectId
    };
  });
}
function applyRecencyDecay(results) {
  const now = Date.now();
  const halfLifeMs = RECENCY_HALF_LIFE_DAYS * 24 * 60 * 60 * 1e3;
  return results.map((result) => {
    const ageMs = now - result.timestamp.getTime();
    const decayFactor = Math.pow(0.5, ageMs / halfLifeMs);
    const decayedScore = result.score * (0.7 + 0.3 * decayFactor);
    return {
      ...result,
      score: decayedScore
    };
  });
}

// src/archive.ts
init_database();
init_embeddings();
init_config();
import * as fs3 from "fs";
import * as readline from "readline";
var MIN_CONTENT_LENGTH = 50;
var EXCLUDED_PATTERNS = [
  /^(ok|okay|done|yes|no|sure|thanks|thank you|got it|understood|alright)\.?$/i,
  /^(hello|hi|hey|bye|goodbye)\.?$/i,
  /^y(es)?$/i,
  /^n(o)?$/i,
  /^\d+$/,
  // Just numbers
  /^[.!?]+$/
  // Just punctuation
];
var VALUABLE_PATTERNS = [
  /function\s+\w+/i,
  /class\s+\w+/i,
  /interface\s+\w+/i,
  /import\s+/,
  /export\s+/,
  /const\s+\w+\s*=/,
  /let\s+\w+\s*=/,
  /def\s+\w+/,
  /error|bug|fix|issue|problem/i,
  /implemented?|created?|added?|updated?|modified?|removed?/i,
  /because|since|therefore|however|although/i
];
async function parseTranscript(transcriptPath) {
  if (!fs3.existsSync(transcriptPath)) {
    return [];
  }
  const messages = [];
  const fileStream = fs3.createReadStream(transcriptPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  for await (const line of rl) {
    if (!line.trim())
      continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.role && parsed.content) {
        const content = extractTextContent(parsed.content);
        if (content) {
          messages.push({
            role: parsed.role,
            content,
            timestamp: parsed.timestamp
          });
        }
      } else if ((parsed.type === "message" || parsed.type === "user" || parsed.type === "assistant") && parsed.message) {
        const content = extractTextContent(parsed.message.content);
        if (content) {
          messages.push({
            role: parsed.message.role,
            content,
            timestamp: parsed.timestamp
          });
        }
      }
    } catch {
      continue;
    }
  }
  return messages;
}
function extractTextContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const textParts = [];
    for (const item of content) {
      if (typeof item === "string") {
        textParts.push(item);
      } else if (typeof item === "object" && item !== null) {
        if ("text" in item && typeof item.text === "string") {
          textParts.push(item.text);
        }
      }
    }
    return textParts.join("\n");
  }
  return "";
}
function shouldExclude(content) {
  const trimmed = content.trim();
  if (trimmed.length < MIN_CONTENT_LENGTH) {
    return true;
  }
  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }
  return false;
}
function isValuable(content) {
  for (const pattern of VALUABLE_PATTERNS) {
    if (pattern.test(content)) {
      return true;
    }
  }
  const words = content.split(/\s+/).length;
  return words >= 10;
}
function extractChunks(content) {
  const chunks = [];
  const paragraphs = content.split(/\n\n+/);
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed.length < MIN_CONTENT_LENGTH) {
      continue;
    }
    if (trimmed.length > 1e3) {
      const sentences = trimmed.split(/(?<=[.!?])\s+/);
      let currentChunk = "";
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > 800) {
          if (currentChunk.length >= MIN_CONTENT_LENGTH) {
            chunks.push(currentChunk.trim());
          }
          currentChunk = sentence;
        } else {
          currentChunk += (currentChunk ? " " : "") + sentence;
        }
      }
      if (currentChunk.length >= MIN_CONTENT_LENGTH) {
        chunks.push(currentChunk.trim());
      }
    } else {
      chunks.push(trimmed);
    }
  }
  return chunks;
}
async function archiveSession(db, transcriptPath, projectId, options = {}) {
  const config = loadConfig();
  const minLength = config.archive.minContentLength || MIN_CONTENT_LENGTH;
  const result = {
    archived: 0,
    skipped: 0,
    duplicates: 0
  };
  const messages = await parseTranscript(transcriptPath);
  if (messages.length === 0) {
    return result;
  }
  const contentToArchive = [];
  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }
    const chunks = extractChunks(message.content);
    for (const chunk of chunks) {
      if (chunk.length < minLength) {
        result.skipped++;
        continue;
      }
      if (shouldExclude(chunk)) {
        result.skipped++;
        continue;
      }
      if (!isValuable(chunk)) {
        result.skipped++;
        continue;
      }
      if (contentExists(db, chunk)) {
        result.duplicates++;
        continue;
      }
      contentToArchive.push({
        content: chunk,
        timestamp: message.timestamp ? new Date(message.timestamp) : /* @__PURE__ */ new Date()
      });
    }
  }
  if (contentToArchive.length === 0) {
    return result;
  }
  const texts = contentToArchive.map((c) => c.content);
  const embeddings = await embedBatch(texts, {
    onProgress: options.onProgress
  });
  const sessionId = getSessionId(transcriptPath);
  for (let i = 0; i < contentToArchive.length; i++) {
    const { content, timestamp } = contentToArchive[i];
    const embedding = embeddings[i];
    const { isDuplicate } = insertMemory(db, {
      content,
      embedding,
      projectId,
      sourceSession: sessionId,
      timestamp
    });
    if (isDuplicate) {
      result.duplicates++;
    } else {
      result.archived++;
    }
  }
  saveDb(db);
  return result;
}
function getSessionId(transcriptPath) {
  const basename = transcriptPath.split("/").pop() || transcriptPath;
  return basename.replace(/\.[^.]+$/, "");
}

// src/mcp-server.ts
init_embeddings();

// src/analytics.ts
init_config();
import * as fs4 from "fs";
var ANALYTICS_VERSION = 1;
function getAnalytics() {
  const analyticsPath = getAnalyticsPath();
  if (!fs4.existsSync(analyticsPath)) {
    return createEmptyAnalytics();
  }
  try {
    const content = fs4.readFileSync(analyticsPath, "utf8");
    const data = JSON.parse(content);
    if (data.version !== ANALYTICS_VERSION) {
      return migrateAnalytics(data);
    }
    return data;
  } catch {
    return createEmptyAnalytics();
  }
}
function createEmptyAnalytics() {
  return {
    version: ANALYTICS_VERSION,
    sessions: [],
    currentSession: null
  };
}
function migrateAnalytics(oldData) {
  return createEmptyAnalytics();
}
function getAnalyticsSummary() {
  const analytics = getAnalytics();
  const sessions = analytics.sessions;
  const oneWeekAgo = /* @__PURE__ */ new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const thisWeekSessions = sessions.filter((s) => new Date(s.startTime) >= oneWeekAgo);
  const allSavePoints = sessions.flatMap((s) => s.savePoints);
  const avgContextAtSave = allSavePoints.length > 0 ? allSavePoints.reduce((sum, sp) => sum + sp.contextPercent, 0) / allSavePoints.length : 0;
  const sessionsProlonged = sessions.filter((s) => s.savePoints.length > 0 && s.clearCount > 0).length;
  return {
    totalSessions: sessions.length,
    totalFragments: sessions.reduce((sum, s) => sum + s.fragmentsCreated, 0),
    averageContextAtSave: avgContextAtSave,
    sessionsProlonged,
    thisWeek: {
      sessions: thisWeekSessions.length,
      fragmentsCreated: thisWeekSessions.reduce((sum, s) => sum + s.fragmentsCreated, 0),
      recallsUsed: thisWeekSessions.reduce((sum, s) => sum + s.recallCount, 0)
    }
  };
}

// src/mcp-server.ts
var TOOLS = [
  {
    name: "cortex_recall",
    description: "Search Cortex memory for relevant past context. Use when referencing past work or needing historical context.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to find relevant memories"
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default: 5)"
        },
        includeAllProjects: {
          type: "boolean",
          description: "Search across all projects instead of just the current one"
        },
        projectId: {
          type: "string",
          description: "Specific project ID to search within"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "cortex_remember",
    description: "Save a specific insight, decision, or fact to memory. Use for important information worth preserving during the conversation.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The content to remember (decision, insight, fact, etc.)"
        },
        context: {
          type: "string",
          description: "Optional context about why this is important"
        },
        projectId: {
          type: "string",
          description: "Project ID to associate with this memory"
        }
      },
      required: ["content"]
    }
  },
  {
    name: "cortex_save",
    description: "Archive the current session to Cortex memory. Use before clearing context or when context is high. Transcript path is auto-detected from current session.",
    inputSchema: {
      type: "object",
      properties: {
        transcriptPath: {
          type: "string",
          description: "Path to the transcript file (optional - auto-detected from current session)"
        },
        projectId: {
          type: "string",
          description: "Project ID to associate with the memories"
        },
        global: {
          type: "boolean",
          description: "Save as global memories (not project-specific)"
        }
      }
    }
  },
  {
    name: "cortex_archive",
    description: "Archive the current session to Cortex memory (alias for cortex_save). Transcript path is auto-detected from current session.",
    inputSchema: {
      type: "object",
      properties: {
        transcriptPath: {
          type: "string",
          description: "Path to the transcript file (optional - auto-detected from current session)"
        },
        projectId: {
          type: "string",
          description: "Project ID to associate with the memories"
        },
        global: {
          type: "boolean",
          description: "Save as global memories (not project-specific)"
        }
      }
    }
  },
  {
    name: "cortex_stats",
    description: "Get Cortex memory statistics including fragment count, project count, and database size.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Get stats for a specific project"
        }
      }
    }
  },
  {
    name: "cortex_restore",
    description: "Get restoration context from recent session. Use after context clear to restore continuity.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Project ID to get restoration context for"
        },
        messageCount: {
          type: "number",
          description: "Number of recent memories to include (default: 5)"
        }
      }
    }
  },
  {
    name: "cortex_delete",
    description: "Delete a specific memory fragment by ID. Requires confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        memoryId: {
          type: "number",
          description: "The ID of the memory to delete"
        },
        confirm: {
          type: "boolean",
          description: "Set to true to confirm deletion"
        }
      },
      required: ["memoryId"]
    }
  },
  {
    name: "cortex_forget_project",
    description: "Delete all memories for a specific project. Requires confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "The project ID to delete all memories for"
        },
        confirm: {
          type: "boolean",
          description: "Set to true to confirm deletion"
        }
      },
      required: ["projectId"]
    }
  },
  {
    name: "cortex_analytics",
    description: "Get session analytics and insights about Cortex usage patterns.",
    inputSchema: {
      type: "object",
      properties: {
        detailed: {
          type: "boolean",
          description: "Include detailed session-by-session metrics"
        }
      }
    }
  }
];
async function handleRecall(db, params) {
  const { query, limit = 5, includeAllProjects = false, projectId } = params;
  const results = await hybridSearch(db, query, {
    projectScope: !includeAllProjects,
    projectId,
    includeAllProjects,
    limit
  });
  return {
    results: results.map((r) => ({
      id: r.id,
      content: r.content,
      score: Math.round(r.score * 100) / 100,
      source: r.source,
      timestamp: r.timestamp.toISOString(),
      projectId: r.projectId
    })),
    count: results.length,
    query
  };
}
async function handleRemember(db, params) {
  const { content, context, projectId } = params;
  if (!content || content.trim().length === 0) {
    return {
      success: false,
      error: "Content is required"
    };
  }
  const textToEmbed = context ? `${content} ${context}` : content;
  const embedding = await embedQuery(textToEmbed);
  const result = storeManualMemory(db, content, embedding, projectId || null, context);
  if (result.isDuplicate) {
    return {
      success: true,
      isDuplicate: true,
      id: result.id,
      message: "This content already exists in memory"
    };
  }
  saveDb(db);
  return {
    success: true,
    id: result.id,
    message: `Remembered: "${content.length > 50 ? content.substring(0, 50) + "..." : content}"`,
    projectId: projectId || null
  };
}
async function handleSave(db, params) {
  let { transcriptPath, projectId } = params;
  const { global = false } = params;
  if (!transcriptPath) {
    if (!projectId) {
      return {
        success: false,
        error: "Either transcriptPath or projectId must be provided to archive session."
      };
    }
    const currentSession = getCurrentSession(projectId);
    if (!currentSession) {
      return {
        success: false,
        error: `No active session found for project: ${projectId}. Session must be started first.`
      };
    }
    transcriptPath = currentSession.transcriptPath;
  }
  const effectiveProjectId = global ? null : projectId || null;
  const result = await archiveSession(db, transcriptPath, effectiveProjectId);
  return {
    success: true,
    archived: result.archived,
    skipped: result.skipped,
    duplicates: result.duplicates,
    projectId: effectiveProjectId,
    transcriptPath
  };
}
async function handleStats(db, params) {
  const stats = getStats(db);
  const result = {
    totalFragments: stats.fragmentCount,
    totalProjects: stats.projectCount,
    totalSessions: stats.sessionCount,
    dbSizeBytes: stats.dbSizeBytes,
    oldestMemory: stats.oldestTimestamp?.toISOString() || null,
    newestMemory: stats.newestTimestamp?.toISOString() || null,
    dataDir: getDataDir()
  };
  if (params.projectId) {
    const projectStats = getProjectStats(db, params.projectId);
    result.project = {
      id: params.projectId,
      fragments: projectStats.fragmentCount,
      sessions: projectStats.sessionCount,
      lastArchive: projectStats.lastArchive?.toISOString() || null
    };
  }
  return result;
}
async function handleRestore(db, params) {
  const { projectId, messageCount = 5 } = params;
  const config = loadConfig();
  const queryEmbedding = await embedQuery("recent work context summary");
  const results = searchByVector(db, queryEmbedding, projectId, messageCount);
  if (results.length === 0) {
    return {
      hasContent: false,
      summary: null,
      fragments: []
    };
  }
  const fragments = results.map((r) => ({
    id: r.id,
    content: r.content.length > 300 ? r.content.substring(0, 300) + "..." : r.content,
    timestamp: r.timestamp.toISOString()
  }));
  const totalChars = fragments.reduce((sum, f) => sum + f.content.length, 0);
  const estimatedTokens = Math.ceil(totalChars / 4);
  return {
    hasContent: true,
    summary: `Found ${fragments.length} recent memories from ${projectId || "global"} context.`,
    fragments,
    estimatedTokens,
    withinBudget: estimatedTokens <= config.automation.restorationTokenBudget
  };
}
async function handleDelete(db, params) {
  const { memoryId, confirm = false } = params;
  const memory = getMemory(db, memoryId);
  if (!memory) {
    return {
      error: "Memory not found",
      memoryId
    };
  }
  if (!confirm) {
    return {
      status: "confirmation_required",
      action: "delete",
      memoryId,
      preview: memory.content.length > 200 ? memory.content.substring(0, 200) + "..." : memory.content,
      projectId: memory.projectId,
      timestamp: memory.timestamp.toISOString(),
      message: "Call cortex_delete with confirm: true to delete this memory."
    };
  }
  const deleted = deleteMemory(db, memoryId);
  if (deleted) {
    saveDb(db);
  }
  return {
    success: deleted,
    memoryId,
    message: deleted ? "Memory deleted successfully." : "Failed to delete memory."
  };
}
async function handleForgetProject(db, params) {
  const { projectId, confirm = false } = params;
  const projectStats = getProjectStats(db, projectId);
  if (projectStats.fragmentCount === 0) {
    return {
      error: "No memories found for this project",
      projectId
    };
  }
  if (!confirm) {
    return {
      status: "confirmation_required",
      action: "forget_project",
      projectId,
      fragmentCount: projectStats.fragmentCount,
      sessionCount: projectStats.sessionCount,
      message: `This will delete ${projectStats.fragmentCount} memories from ${projectId}. Call cortex_forget_project with confirm: true to proceed.`
    };
  }
  const result = db.exec(`DELETE FROM memories WHERE project_id = ?`, [projectId]);
  const deletedCount = db.getRowsModified();
  saveDb(db);
  return {
    success: true,
    projectId,
    deletedCount,
    message: `Deleted ${deletedCount} memories from ${projectId}.`
  };
}
async function handleAnalytics(params) {
  const { detailed = false } = params;
  const analytics = getAnalytics();
  const summary = getAnalyticsSummary();
  const result = {
    summary: {
      totalSessions: summary.totalSessions,
      totalFragments: summary.totalFragments,
      averageContextAtSave: `${Math.round(summary.averageContextAtSave)}%`,
      sessionsProlonged: summary.sessionsProlonged
    },
    thisWeek: summary.thisWeek,
    insights: generateInsights(summary),
    recommendations: generateRecommendations(summary)
  };
  if (detailed && analytics.sessions.length > 0) {
    result.recentSessions = analytics.sessions.slice(-10).map((s) => ({
      sessionId: s.sessionId,
      projectId: s.projectId,
      startTime: s.startTime,
      peakContext: `${s.peakContextPercent}%`,
      fragmentsCreated: s.fragmentsCreated,
      recallCount: s.recallCount
    }));
  }
  return result;
}
function generateInsights(summary) {
  const insights = [];
  const config = loadConfig();
  if (summary.averageContextAtSave > 0) {
    const diff = Math.abs(summary.averageContextAtSave - config.automation.autoSaveThreshold);
    if (diff < 5) {
      insights.push(`Your average save happens at ${Math.round(summary.averageContextAtSave)}% - threshold is ${config.automation.autoSaveThreshold}% (good match)`);
    } else if (summary.averageContextAtSave > config.automation.autoSaveThreshold) {
      insights.push(`You typically save at ${Math.round(summary.averageContextAtSave)}% - consider lowering your threshold from ${config.automation.autoSaveThreshold}%`);
    }
  }
  if (summary.sessionsProlonged > 0) {
    insights.push(`${summary.sessionsProlonged} sessions used smart compaction - avoided hitting 100% context`);
  }
  if (summary.thisWeek.recallsUsed > 5) {
    insights.push(`Active recall usage this week (${summary.thisWeek.recallsUsed} queries) - memories are being utilized`);
  }
  return insights;
}
function generateRecommendations(summary) {
  const recommendations = [];
  const config = loadConfig();
  if (!config.automation.autoClearEnabled && summary.sessionsProlonged > 3) {
    recommendations.push("Consider enabling auto-clear - you manually clear after most saves");
  }
  if (summary.averageContextAtSave > 85) {
    recommendations.push("Your context often gets very high before saving - consider lowering autoSaveThreshold");
  }
  return recommendations;
}
var MCPServer = class {
  db = null;
  async initialize() {
    this.db = await initDb();
  }
  async handleRequest(request) {
    const { id, method, params } = request;
    try {
      switch (method) {
        case "initialize":
          return this.handleInitialize(id);
        case "tools/list":
          return this.handleToolsList(id);
        case "tools/call":
          return await this.handleToolCall(id, params);
        default:
          return {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`
            }
          };
      }
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
  handleInitialize(id) {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: "cortex-memory",
          version: "2.0.0"
        }
      }
    };
  }
  handleToolsList(id) {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: TOOLS
      }
    };
  }
  async handleToolCall(id, params) {
    if (!this.db) {
      this.db = await initDb();
    }
    const { name, arguments: args } = params;
    let result;
    switch (name) {
      case "cortex_recall":
        result = await handleRecall(this.db, args);
        break;
      case "cortex_remember":
        result = await handleRemember(this.db, args);
        break;
      case "cortex_save":
      case "cortex_archive":
        result = await handleSave(this.db, args);
        break;
      case "cortex_stats":
        result = await handleStats(this.db, args);
        break;
      case "cortex_restore":
        result = await handleRestore(this.db, args);
        break;
      case "cortex_delete":
        result = await handleDelete(this.db, args);
        break;
      case "cortex_forget_project":
        result = await handleForgetProject(this.db, args);
        break;
      case "cortex_analytics":
        result = await handleAnalytics(args);
        break;
      default:
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Unknown tool: ${name}`
          }
        };
    }
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      }
    };
  }
};
async function main() {
  const server = new MCPServer();
  await server.initialize();
  const rl = readline2.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });
  rl.on("line", async (line) => {
    if (!line.trim())
      return;
    try {
      const request = JSON.parse(line);
      const response = await server.handleRequest(request);
      console.log(JSON.stringify(response));
    } catch (error) {
      const errorResponse = {
        jsonrpc: "2.0",
        id: 0,
        error: {
          code: -32700,
          message: "Parse error",
          data: error instanceof Error ? error.message : String(error)
        }
      };
      console.log(JSON.stringify(errorResponse));
    }
  });
  rl.on("close", () => {
    process.exit(0);
  });
}
main().catch((error) => {
  console.error("MCP Server error:", error);
  process.exit(1);
});
