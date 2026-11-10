import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV } from '../src/utils/csv.js';
test('parses quoted commas, escaped quotes, and CRLF lines', () => {
  assert.deepEqual(
    parseCSV('name,email\r\n"Student, One",student@example.edu\r\n"He said ""hi""",teacher@example.edu'),
    [
      ['name', 'email'],
      ['Student, One', 'student@example.edu'],
      ['He said "hi"', 'teacher@example.edu'],
    ],
  );
});
test('rejects unterminated quoted fields', () =>
  assert.throws(() => parseCSV('name\n"incomplete'), /unterminated/));
