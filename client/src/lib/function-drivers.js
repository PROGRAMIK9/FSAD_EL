/**
 * LeetCode-style ("function") coding questions: from a signature, generate per language the
 * starter stub the student completes and the hidden driver that reads the arguments, calls the
 * student's function and prints the result. The driver contains MARKER where the student's code
 * is inserted before compiling (server: composeSource in services/code-runner.js).
 *
 * Input:  one argument per line, LeetCode notation: 9, 2.5, true, "abc", [2,7,11,15], ["a","b"], [[1,2],[3]]
 * Output: the same notation without spaces; doubles with 5 decimals; bools as true/false.
 * A `void` function prints its first argument after the call (in-place problems).
 *
 * Pure module without dependencies: also imported by the runner tests (runner/test).
 */

export const MARKER = '@@USER_CODE@@';
export const PARAM_TYPES = ['int', 'long', 'double', 'bool', 'string', 'int[]', 'long[]', 'double[]', 'string[]', 'int[][]'];
export const RETURN_TYPES = [...PARAM_TYPES, 'void'];
export const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

const RESERVED = new Set(
  'abstract and as assert auto bool boolean break byte case catch char class const continue def default del delete do double elif else enum except extends false final finally float for from global goto if implements import in instanceof int interface is lambda long main native new none nonlocal not null or package pass private protected public raise register return self short signed sizeof static string struct super switch synchronized template this throw throws transient true try typedef union unsigned using var vector void volatile while with yield solution'.split(' '),
);

/** Problems with a signature, or [] when it is usable. */
export function checkSignature(sig) {
  const errors = [];
  if (!sig || !IDENT.test(sig.name || '')) errors.push('Function name must be a valid identifier');
  else if (RESERVED.has(sig.name.toLowerCase())) errors.push(`"${sig.name}" is a reserved word`);
  if (!RETURN_TYPES.includes(sig?.returns)) errors.push('Choose a return type');
  const params = sig?.params || [];
  if (params.length > 8) errors.push('At most 8 parameters');
  const seen = new Set();
  params.forEach((p, i) => {
    if (!IDENT.test(p.name || '') || RESERVED.has(String(p.name).toLowerCase()) || p.name.startsWith('_'))
      errors.push(`Parameter ${i + 1}: use a plain name like nums or target`);
    else if (seen.has(p.name)) errors.push(`Parameter ${i + 1}: "${p.name}" is used twice`);
    seen.add(p.name);
    if (!PARAM_TYPES.includes(p.type)) errors.push(`Parameter ${i + 1}: choose a type`);
  });
  if (sig?.returns === 'void' && !params.length) errors.push('A void function needs a parameter to print');
  return errors;
}

/** "twoSum(nums: int[], target: int) → int[]" */
export const formatSignature = (sig) => (sig?.name ? `${sig.name}(${(sig.params || []).map((p) => `${p.name}: ${p.type}`).join(', ')}) → ${sig.returns}` : '');

/** Generates `{ starter: {c,cpp,java,python}, drivers: {c,cpp,java,python} }`. */
export function generateFunction(sig) {
  const errors = checkSignature(sig);
  if (errors.length) throw new Error(errors[0]);
  return {
    starter: { c: cStarter(sig), cpp: cppStarter(sig), java: javaStarter(sig), python: pyStarter(sig) },
    drivers: { c: cDriver(sig), cpp: cppDriver(sig), java: javaDriver(sig), python: pyDriver(sig) },
  };
}

const isArr = (t) => t.endsWith('[]');
const elem = (t) => t.slice(0, -2);

/* ------------------------------------------------------------------ Python */

const PY_T = { int: 'int', long: 'int', double: 'float', bool: 'bool', string: 'str' };
const pyType = (t) => (isArr(t) ? `List[${pyType(elem(t))}]` : PY_T[t]);
const PY_DEFAULT = { int: '0', long: '0', double: '0.0', bool: 'False', string: '""', void: 'None' };

function pyStarter(sig) {
  const params = ['self', ...sig.params.map((p) => `${p.name}: ${pyType(p.type)}`)].join(', ');
  const ret = sig.returns === 'void' ? 'None' : pyType(sig.returns);
  const body = sig.returns === 'void' ? 'pass' : `return ${isArr(sig.returns) ? '[]' : PY_DEFAULT[sig.returns]}`;
  return `from typing import List\n\n\nclass Solution:\n    def ${sig.name}(${params}) -> ${ret}:\n        ${body}\n`;
}

function pyConv(t, expr) {
  if (isArr(t)) return `[${pyConv(elem(t), '_x')} for _x in ${expr}]`;
  return { int: `int(${expr})`, long: `int(${expr})`, double: `float(${expr})`, bool: `bool(${expr})`, string: `str(${expr})` }[t];
}

function pyDriver(sig) {
  const args = sig.params.map((p, i) => `    ${p.name} = ${pyConv(p.type, `json.loads(_rv_lines[${i}])`)}`).join('\n');
  const call = `Solution().${sig.name}(${sig.params.map((p) => p.name).join(', ')})`;
  const out =
    sig.returns === 'void'
      ? `    ${call}\n    print(_rv_fmt(${sig.params[0].name}, ${JSON.stringify(sig.params[0].type)}))`
      : `    print(_rv_fmt(${call}, ${JSON.stringify(sig.returns)}))`;
  return `import sys
import json
from typing import List

${MARKER}


def _rv_fmt(v, t):
    if t.endswith('[]'):
        return '[' + ','.join(_rv_fmt(x, t[:-2]) for x in v) + ']'
    if t == 'double':
        return f'{float(v):.5f}'
    if t == 'bool':
        return 'true' if v else 'false'
    if t == 'string':
        return json.dumps(v, ensure_ascii=False)
    return str(int(v))


def _rv_main():
    _rv_lines = [l for l in sys.stdin.read().splitlines()]
    while _rv_lines and not _rv_lines[-1].strip():
        _rv_lines.pop()
    if len(_rv_lines) < ${sig.params.length}:
        sys.exit(f'Expected ${sig.params.length} input line(s), got {len(_rv_lines)}')
${args || '    pass'}
${out}


_rv_main()
`;
}

/* --------------------------------------------------------------------- C++ */

const CPP_T = { int: 'int', long: 'long long', double: 'double', bool: 'bool', string: 'string' };
const cppType = (t) => (isArr(t) ? `vector<${cppType(elem(t))}>` : CPP_T[t]);
const cppParam = (p) => (isArr(p.type) || p.type === 'string' ? `${cppType(p.type)}& ${p.name}` : `${cppType(p.type)} ${p.name}`);

function cppStarter(sig) {
  const body = sig.returns === 'void' ? '' : `\n        return {};`;
  return `class Solution {
public:
    ${sig.returns === 'void' ? 'void' : cppType(sig.returns)} ${sig.name}(${sig.params.map(cppParam).join(', ')}) {
        ${body.trim()}
    }
};
`;
}

const cppConv = (t) => (isArr(t) ? `__rv_vec<${cppType(elem(t))}>` : { int: '__rv_int', long: '__rv_ll', double: '__rv_dbl', bool: '__rv_bool', string: '__rv_str' }[t]);

function cppDriver(sig) {
  const args = sig.params.map((p, i) => `    ${cppType(p.type)} ${p.name} = ${cppConv(p.type)}(__rv_parse_line(__L[${i}]));`).join('\n');
  const call = `__s.${sig.name}(${sig.params.map((p) => p.name).join(', ')})`;
  const out = sig.returns === 'void' ? `    ${call};\n    __rv_print(${sig.params[0].name});` : `    __rv_print(${call});`;
  return `#include <bits/stdc++.h>
using namespace std;

${MARKER}

struct __rv_v { int k = 0; string s; vector<__rv_v> a; };
static const char* __rv_p;
static void __rv_ws() { while (*__rv_p && isspace((unsigned char)*__rv_p)) __rv_p++; }
static __rv_v __rv_parse() {
    __rv_v v; __rv_ws();
    if (*__rv_p == '[') {
        __rv_p++; v.k = 2; __rv_ws();
        if (*__rv_p == ']') { __rv_p++; return v; }
        for (;;) {
            v.a.push_back(__rv_parse()); __rv_ws();
            if (*__rv_p == ',') { __rv_p++; continue; }
            if (*__rv_p == ']') __rv_p++;
            break;
        }
        return v;
    }
    if (*__rv_p == '"') {
        __rv_p++; v.k = 1;
        while (*__rv_p && *__rv_p != '"') {
            char c = *__rv_p++;
            if (c == '\\\\' && *__rv_p) { c = *__rv_p++; if (c == 'n') c = '\\n'; else if (c == 't') c = '\\t'; else if (c == 'r') c = '\\r'; }
            v.s += c;
        }
        if (*__rv_p == '"') __rv_p++;
        return v;
    }
    const char* st = __rv_p;
    while (*__rv_p && *__rv_p != ',' && *__rv_p != ']' && !isspace((unsigned char)*__rv_p)) __rv_p++;
    v.s.assign(st, __rv_p);
    return v;
}
static __rv_v __rv_parse_line(const string& line) { __rv_p = line.c_str(); return __rv_parse(); }
static int __rv_int(const __rv_v& v) { return stoi(v.s); }
static long long __rv_ll(const __rv_v& v) { return stoll(v.s); }
static double __rv_dbl(const __rv_v& v) { return stod(v.s); }
static bool __rv_bool(const __rv_v& v) { return v.s == "true"; }
static string __rv_str(const __rv_v& v) { return v.s; }
template <class T> T __rv_one(const __rv_v& v);
template <> int __rv_one<int>(const __rv_v& v) { return __rv_int(v); }
template <> long long __rv_one<long long>(const __rv_v& v) { return __rv_ll(v); }
template <> double __rv_one<double>(const __rv_v& v) { return __rv_dbl(v); }
template <> string __rv_one<string>(const __rv_v& v) { return __rv_str(v); }
template <class T> vector<T> __rv_vec(const __rv_v& v);
template <> vector<int> __rv_vec<int>(const __rv_v& v) { vector<int> r; for (auto& x : v.a) r.push_back(__rv_int(x)); return r; }
template <> vector<long long> __rv_vec<long long>(const __rv_v& v) { vector<long long> r; for (auto& x : v.a) r.push_back(__rv_ll(x)); return r; }
template <> vector<double> __rv_vec<double>(const __rv_v& v) { vector<double> r; for (auto& x : v.a) r.push_back(__rv_dbl(x)); return r; }
template <> vector<string> __rv_vec<string>(const __rv_v& v) { vector<string> r; for (auto& x : v.a) r.push_back(__rv_str(x)); return r; }
template <> vector<vector<int>> __rv_vec<vector<int>>(const __rv_v& v) { vector<vector<int>> r; for (auto& x : v.a) r.push_back(__rv_vec<int>(x)); return r; }
static void __rv_out(int x) { printf("%d", x); }
static void __rv_out(long long x) { printf("%lld", x); }
static void __rv_out(double x) { printf("%.5f", x); }
static void __rv_out(bool x) { printf(x ? "true" : "false"); }
static void __rv_out(const string& x) {
    putchar('"');
    for (char c : x) { if (c == '"' || c == '\\\\') { putchar('\\\\'); putchar(c); } else if (c == '\\n') printf("\\\\n"); else if (c == '\\t') printf("\\\\t"); else putchar(c); }
    putchar('"');
}
template <class T> static void __rv_out(const vector<T>& x) {
    putchar('[');
    for (size_t i = 0; i < x.size(); i++) { if (i) putchar(','); __rv_out(x[i]); }
    putchar(']');
}
template <class T> static void __rv_print(const T& x) { __rv_out(x); putchar('\\n'); }

int main() {
    ios::sync_with_stdio(true);
    vector<string> __L; string __line;
    while (getline(cin, __line)) { if (!__line.empty() && __line.back() == '\\r') __line.pop_back(); __L.push_back(__line); }
    while (!__L.empty() && __L.back().find_first_not_of(" \\t") == string::npos) __L.pop_back();
    if ((int)__L.size() < ${sig.params.length}) { fprintf(stderr, "Expected ${sig.params.length} input line(s), got %d\\n", (int)__L.size()); return 1; }
    Solution __s;
${args}
${out}
    return 0;
}
`;
}

/* -------------------------------------------------------------------- Java */

const JAVA_T = { int: 'int', long: 'long', double: 'double', bool: 'boolean', string: 'String' };
const javaType = (t) => (isArr(t) ? `${javaType(elem(t))}[]` : JAVA_T[t]);
const JAVA_DEFAULT = { int: '0', long: '0L', double: '0.0', bool: 'false', string: '""' };
const JAVA_CONV = { int: 'toInt', long: 'toLong', double: 'toDouble', bool: 'toBool', string: 'toStr', 'int[]': 'toIntArr', 'long[]': 'toLongArr', 'double[]': 'toDoubleArr', 'string[]': 'toStrArr', 'int[][]': 'toIntMat' };

function javaStarter(sig) {
  const ret = sig.returns === 'void' ? '' : `\n        return ${isArr(sig.returns) ? `new ${javaType(sig.returns).replace(/\[\]/, '[0]')}` : JAVA_DEFAULT[sig.returns]};`;
  return `class Solution {
    public ${sig.returns === 'void' ? 'void' : javaType(sig.returns)} ${sig.name}(${sig.params.map((p) => `${javaType(p.type)} ${p.name}`).join(', ')}) {
        ${ret.trim()}
    }
}
`;
}

function javaDriver(sig) {
  const args = sig.params.map((p, i) => `        ${javaType(p.type)} ${p.name} = __RvIn.${JAVA_CONV[p.type]}(__RvIn.parse(__L.get(${i})));`).join('\n');
  const call = `new Solution().${sig.name}(${sig.params.map((p) => p.name).join(', ')})`;
  const out = sig.returns === 'void' ? `        ${call};\n        System.out.println(__RvOut.f(${sig.params[0].name}));` : `        System.out.println(__RvOut.f(${call}));`;
  return `import java.util.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

${MARKER}

class __RvIn {
    private static String s; private static int p;
    static Object parse(String line) { s = line; p = 0; return value(); }
    private static void ws() { while (p < s.length() && Character.isWhitespace(s.charAt(p))) p++; }
    private static Object value() {
        ws();
        if (p < s.length() && s.charAt(p) == '[') {
            p++; List<Object> a = new ArrayList<>(); ws();
            if (p < s.length() && s.charAt(p) == ']') { p++; return a; }
            while (true) {
                a.add(value()); ws();
                if (p < s.length() && s.charAt(p) == ',') { p++; continue; }
                if (p < s.length() && s.charAt(p) == ']') p++;
                break;
            }
            return a;
        }
        if (p < s.length() && s.charAt(p) == '"') {
            p++; StringBuilder b = new StringBuilder();
            while (p < s.length() && s.charAt(p) != '"') {
                char c = s.charAt(p++);
                if (c == '\\\\' && p < s.length()) { c = s.charAt(p++); if (c == 'n') c = '\\n'; else if (c == 't') c = '\\t'; else if (c == 'r') c = '\\r'; }
                b.append(c);
            }
            p++;
            return new StringBuilder(b);
        }
        int st = p;
        while (p < s.length() && s.charAt(p) != ',' && s.charAt(p) != ']' && !Character.isWhitespace(s.charAt(p))) p++;
        return s.substring(st, p);
    }
    static int toInt(Object v) { return Integer.parseInt(v.toString()); }
    static long toLong(Object v) { return Long.parseLong(v.toString()); }
    static double toDouble(Object v) { return Double.parseDouble(v.toString()); }
    static boolean toBool(Object v) { return v.toString().equals("true"); }
    static String toStr(Object v) { return v.toString(); }
    @SuppressWarnings("unchecked") static List<Object> list(Object v) { return (List<Object>) v; }
    static int[] toIntArr(Object v) { List<Object> l = list(v); int[] r = new int[l.size()]; for (int i = 0; i < r.length; i++) r[i] = toInt(l.get(i)); return r; }
    static long[] toLongArr(Object v) { List<Object> l = list(v); long[] r = new long[l.size()]; for (int i = 0; i < r.length; i++) r[i] = toLong(l.get(i)); return r; }
    static double[] toDoubleArr(Object v) { List<Object> l = list(v); double[] r = new double[l.size()]; for (int i = 0; i < r.length; i++) r[i] = toDouble(l.get(i)); return r; }
    static String[] toStrArr(Object v) { List<Object> l = list(v); String[] r = new String[l.size()]; for (int i = 0; i < r.length; i++) r[i] = toStr(l.get(i)); return r; }
    static int[][] toIntMat(Object v) { List<Object> l = list(v); int[][] r = new int[l.size()][]; for (int i = 0; i < r.length; i++) r[i] = toIntArr(l.get(i)); return r; }
}

class __RvOut {
    static String f(int x) { return Integer.toString(x); }
    static String f(long x) { return Long.toString(x); }
    static String f(double x) { return String.format(Locale.ROOT, "%.5f", x); }
    static String f(boolean x) { return x ? "true" : "false"; }
    static String f(String x) {
        StringBuilder b = new StringBuilder("\\"");
        for (char c : x.toCharArray()) { if (c == '"' || c == '\\\\') b.append('\\\\').append(c); else if (c == '\\n') b.append("\\\\n"); else if (c == '\\t') b.append("\\\\t"); else b.append(c); }
        return b.append('"').toString();
    }
    static String f(int[] x) { StringJoiner j = new StringJoiner(",", "[", "]"); for (int e : x) j.add(f(e)); return j.toString(); }
    static String f(long[] x) { StringJoiner j = new StringJoiner(",", "[", "]"); for (long e : x) j.add(f(e)); return j.toString(); }
    static String f(double[] x) { StringJoiner j = new StringJoiner(",", "[", "]"); for (double e : x) j.add(f(e)); return j.toString(); }
    static String f(String[] x) { StringJoiner j = new StringJoiner(",", "[", "]"); for (String e : x) j.add(f(e)); return j.toString(); }
    static String f(int[][] x) { StringJoiner j = new StringJoiner(",", "[", "]"); for (int[] e : x) j.add(f(e)); return j.toString(); }
}

public class Main {
    public static void main(String[] __args) throws IOException {
        String __in = new String(System.in.readAllBytes(), StandardCharsets.UTF_8);
        List<String> __L = new ArrayList<>(Arrays.asList(__in.split("\\r?\\n", -1)));
        while (!__L.isEmpty() && __L.get(__L.size() - 1).trim().isEmpty()) __L.remove(__L.size() - 1);
        if (__L.size() < ${sig.params.length}) { System.err.println("Expected ${sig.params.length} input line(s), got " + __L.size()); System.exit(1); }
${args}
${out}
    }
}
`;
}

/* ----------------------------------------------------------------------- C */

const C_SCALAR = { int: 'int', long: 'long long', double: 'double', bool: 'bool', string: 'char*' };
const C_ARR = { 'int[]': 'int*', 'long[]': 'long long*', 'double[]': 'double*', 'string[]': 'char**', 'int[][]': 'int**' };

function cParams(p) {
  if (!isArr(p.type)) return [`${C_SCALAR[p.type]} ${p.name}`];
  if (p.type === 'int[][]') return [`int** ${p.name}`, `int ${p.name}Size`, `int* ${p.name}ColSize`];
  return [`${C_ARR[p.type]} ${p.name}`, `int ${p.name}Size`];
}

function cSignature(sig) {
  const params = sig.params.flatMap(cParams);
  const r = sig.returns;
  if (r === 'void') return `void ${sig.name}(${params.join(', ')})`;
  if (!isArr(r)) return `${C_SCALAR[r]} ${sig.name}(${params.join(', ')})`;
  if (r === 'int[][]') return `int** ${sig.name}(${[...params, 'int* returnSize', 'int** returnColumnSizes'].join(', ')})`;
  return `${C_ARR[r]} ${sig.name}(${[...params, 'int* returnSize'].join(', ')})`;
}

function cStarter(sig) {
  const r = sig.returns;
  let body;
  if (r === 'void') body = '';
  else if (isArr(r)) body = r === 'int[][]' ? '*returnSize = 0;\n    *returnColumnSizes = NULL;\n    return NULL;' : '*returnSize = 0;\n    return NULL;';
  else body = `return ${{ int: '0', long: '0', double: '0.0', bool: 'false', string: '""' }[r]};`;
  const note = isArr(r) ? '/* Return a malloc()-ed array and set *returnSize. */\n' : '';
  return `${note}${cSignature(sig)} {
    ${body}
}
`;
}

function cDecl(p, i) {
  const v = `__a${i}`;
  const head = `    __rv_v ${v} = __rv_parse_line(__L[${i}]);\n`;
  switch (p.type) {
    case 'int':
      return `${head}    int ${p.name} = atoi(${v}.s);`;
    case 'long':
      return `${head}    long long ${p.name} = atoll(${v}.s);`;
    case 'double':
      return `${head}    double ${p.name} = atof(${v}.s);`;
    case 'bool':
      return `${head}    bool ${p.name} = strcmp(${v}.s, "true") == 0;`;
    case 'string':
      return `${head}    char* ${p.name} = ${v}.s;`;
    case 'int[]':
    case 'long[]':
    case 'double[]': {
      const t = { 'int[]': 'int', 'long[]': 'long long', 'double[]': 'double' }[p.type];
      const f = { 'int[]': 'atoi', 'long[]': 'atoll', 'double[]': 'atof' }[p.type];
      return `${head}    int ${p.name}Size = ${v}.n;\n    ${t}* ${p.name} = malloc(sizeof(${t}) * (${v}.n + 1));\n    for (int __i = 0; __i < ${v}.n; __i++) ${p.name}[__i] = ${f}(${v}.a[__i].s);`;
    }
    case 'string[]':
      return `${head}    int ${p.name}Size = ${v}.n;\n    char** ${p.name} = malloc(sizeof(char*) * (${v}.n + 1));\n    for (int __i = 0; __i < ${v}.n; __i++) ${p.name}[__i] = ${v}.a[__i].s;`;
    case 'int[][]':
      return `${head}    int ${p.name}Size = ${v}.n;\n    int** ${p.name} = malloc(sizeof(int*) * (${v}.n + 1));\n    int* ${p.name}ColSize = malloc(sizeof(int) * (${v}.n + 1));\n    for (int __i = 0; __i < ${v}.n; __i++) {\n        ${p.name}ColSize[__i] = ${v}.a[__i].n;\n        ${p.name}[__i] = malloc(sizeof(int) * (${v}.a[__i].n + 1));\n        for (int __j = 0; __j < ${v}.a[__i].n; __j++) ${p.name}[__i][__j] = atoi(${v}.a[__i].a[__j].s);\n    }`;
    default:
      throw new Error(`Unsupported type ${p.type}`);
  }
}

/** C statement that prints `expr` of type `t` (array sizes from sizeExpr / colExpr). */
function cPrint(t, expr, sizeExpr, colExpr) {
  switch (t) {
    case 'int':
      return `printf("%d", ${expr});`;
    case 'long':
      return `printf("%lld", (long long)(${expr}));`;
    case 'double':
      return `printf("%.5f", ${expr});`;
    case 'bool':
      return `printf((${expr}) ? "true" : "false");`;
    case 'string':
      return `__rv_pstr(${expr});`;
    case 'int[]':
      return `__rv_pints(${expr}, ${sizeExpr});`;
    case 'long[]':
      return `__rv_plls(${expr}, ${sizeExpr});`;
    case 'double[]':
      return `__rv_pdbls(${expr}, ${sizeExpr});`;
    case 'string[]':
      return `__rv_pstrs(${expr}, ${sizeExpr});`;
    case 'int[][]':
      return `__rv_pmat(${expr}, ${sizeExpr}, ${colExpr});`;
    default:
      throw new Error(`Unsupported type ${t}`);
  }
}

function cDriver(sig) {
  const decls = sig.params.map(cDecl).join('\n');
  const callArgs = sig.params.flatMap((p) => (p.type === 'int[][]' ? [p.name, `${p.name}Size`, `${p.name}ColSize`] : isArr(p.type) ? [p.name, `${p.name}Size`] : [p.name]));
  const r = sig.returns;
  let call;
  if (r === 'void') {
    const p = sig.params[0];
    call = `    ${sig.name}(${callArgs.join(', ')});\n    ${cPrint(p.type, p.name, `${p.name}Size`, `${p.name}ColSize`)}`;
  } else if (r === 'int[][]') {
    call = `    int __rs = 0; int* __rcs = NULL;\n    int** __r = ${sig.name}(${[...callArgs, '&__rs', '&__rcs'].join(', ')});\n    ${cPrint(r, '__r', '__rs', '__rcs')}`;
  } else if (isArr(r)) {
    call = `    int __rs = 0;\n    ${C_ARR[r]} __r = ${sig.name}(${[...callArgs, '&__rs'].join(', ')});\n    ${cPrint(r, '__r', '__rs')}`;
  } else {
    call = `    ${C_SCALAR[r]} __r = ${sig.name}(${callArgs.join(', ')});\n    ${cPrint(r, '__r')}`;
  }
  return `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <ctype.h>
#include <math.h>
#include <limits.h>

${MARKER}

typedef struct __rv_v { int k; char* s; struct __rv_v* a; int n; } __rv_v;
static const char* __rv_p;
static void __rv_ws(void) { while (*__rv_p && isspace((unsigned char)*__rv_p)) __rv_p++; }
static __rv_v __rv_parse(void) {
    __rv_v v = { 0, "", NULL, 0 };
    __rv_ws();
    if (*__rv_p == '[') {
        int cap = 4; __rv_p++; v.k = 2; v.a = malloc(sizeof(__rv_v) * cap);
        __rv_ws();
        if (*__rv_p == ']') { __rv_p++; return v; }
        for (;;) {
            if (v.n == cap) { cap *= 2; v.a = realloc(v.a, sizeof(__rv_v) * cap); }
            v.a[v.n++] = __rv_parse();
            __rv_ws();
            if (*__rv_p == ',') { __rv_p++; continue; }
            if (*__rv_p == ']') __rv_p++;
            break;
        }
        return v;
    }
    if (*__rv_p == '"') {
        size_t cap = 16, n = 0; char* s = malloc(cap);
        __rv_p++; v.k = 1;
        while (*__rv_p && *__rv_p != '"') {
            char c = *__rv_p++;
            if (c == '\\\\' && *__rv_p) { c = *__rv_p++; if (c == 'n') c = '\\n'; else if (c == 't') c = '\\t'; else if (c == 'r') c = '\\r'; }
            if (n + 2 > cap) { cap *= 2; s = realloc(s, cap); }
            s[n++] = c;
        }
        if (*__rv_p == '"') __rv_p++;
        s[n] = 0; v.s = s;
        return v;
    }
    {
        const char* st = __rv_p; size_t n; char* s;
        while (*__rv_p && *__rv_p != ',' && *__rv_p != ']' && !isspace((unsigned char)*__rv_p)) __rv_p++;
        n = (size_t)(__rv_p - st); s = malloc(n + 1); memcpy(s, st, n); s[n] = 0; v.s = s;
    }
    return v;
}
static __rv_v __rv_parse_line(char* line) { __rv_p = line; return __rv_parse(); }
static char** __rv_lines(int* count) {
    size_t cap = 1 << 16, n = 0, r; char* buf = malloc(cap); char** lines; int c = 0, lc = 16; char* p;
    while ((r = fread(buf + n, 1, cap - n - 1, stdin)) > 0) { n += r; if (n + 1 >= cap) { cap *= 2; buf = realloc(buf, cap); } }
    buf[n] = 0;
    lines = malloc(sizeof(char*) * lc);
    p = buf;
    while (1) {
        char* e = strchr(p, '\\n');
        if (c == lc) { lc *= 2; lines = realloc(lines, sizeof(char*) * lc); }
        lines[c++] = p;
        if (!e) break;
        *e = 0;
        if (e > p && e[-1] == '\\r') e[-1] = 0;
        p = e + 1;
    }
    while (c > 0) { char* l = lines[c - 1]; while (*l && isspace((unsigned char)*l)) l++; if (*l) break; c--; }
    *count = c;
    return lines;
}
static void __rv_pstr(const char* s) {
    putchar('"');
    for (; s && *s; s++) { if (*s == '"' || *s == '\\\\') { putchar('\\\\'); putchar(*s); } else if (*s == '\\n') printf("\\\\n"); else if (*s == '\\t') printf("\\\\t"); else putchar(*s); }
    putchar('"');
}
static void __rv_pints(const int* a, int n) { putchar('['); for (int i = 0; i < n; i++) { if (i) putchar(','); printf("%d", a[i]); } putchar(']'); }
static void __rv_plls(const long long* a, int n) { putchar('['); for (int i = 0; i < n; i++) { if (i) putchar(','); printf("%lld", a[i]); } putchar(']'); }
static void __rv_pdbls(const double* a, int n) { putchar('['); for (int i = 0; i < n; i++) { if (i) putchar(','); printf("%.5f", a[i]); } putchar(']'); }
static void __rv_pstrs(char** a, int n) { putchar('['); for (int i = 0; i < n; i++) { if (i) putchar(','); __rv_pstr(a[i]); } putchar(']'); }
static void __rv_pmat(int** a, int n, const int* cols) { putchar('['); for (int i = 0; i < n; i++) { if (i) putchar(','); __rv_pints(a[i], cols ? cols[i] : 0); } putchar(']'); }

int main(void) {
    int __n = 0;
    char** __L = __rv_lines(&__n);
    if (__n < ${sig.params.length}) { fprintf(stderr, "Expected ${sig.params.length} input line(s), got %d\\n", __n); return 1; }
${decls}
${call}
    putchar('\\n');
    return 0;
}
`;
}
