# Adding coding questions

Coding questions are written in **Question bank → New question → Coding**. There are two formats:

| Format | Like | What the student writes | Test input | Expected output |
|---|---|---|---|---|
| **Input / output** | HackerRank, Codeforces | A whole program that reads stdin and prints to stdout | Exactly what is fed to stdin | Exactly what the program should print |
| **Function** | LeetCode | Only a function (in `class Solution` for C++, Java and Python) | One argument per line, in LeetCode notation | The return value, in LeetCode notation |

Each question allows C, C++, Java and/or Python 3. Every question needs at least one **sample** test, which students can see and Run. **Hidden** tests run only on *Submit code* and in final grading; students see whether each one passed, but not its data. Marks are shared by test weight.

## HackerRank-style question (input / output)

1. Choose **Input / output** and write the statement, including the input and output format and the constraints.
2. Add tests by hand, or use **Import tests**:
   - **A HackerRank test-case zip:**
     ```
     input/input00.txt   output/output00.txt
     input/input01.txt   output/output01.txt
     ```
   - **Several files paired by name:** `1.in` / `1.out` (also `.ans`, `.a`, `.ok`), `sample.in` / `sample.out`, `in1.txt` / `out1.txt`, or `input/7.txt` / `output/7.txt`.
   - **JSON**, as a file or pasted:
     ```json
     [
       { "input": "1 2\n", "output": "3\n" },
       { "input": "5 5\n", "output": "10\n", "hidden": true, "weight": 2 }
     ]
     ```
   Choose how many of the first tests become samples; the rest are hidden.
3. Pick the **output matching** mode:

   | Mode | Compares |
   |---|---|
   | Ignore trailing spaces (default) | Lines, ignoring trailing whitespace and trailing blank lines |
   | Compare words only | Whitespace-separated tokens |
   | Exact | Byte for byte |

4. Save, then use **Check a reference solution** to confirm every test passes.

**Limits:** 50 tests per question, 1 MB per input or output, 8 MB in total. Students see at most the first 16 KB of a large sample, but Run uses the whole test.

## LeetCode-style question (function)

1. Choose **Function** and fill in the signature: the function name, its parameters with types, and the return type.

   | Types | |
   |---|---|
   | Scalars | `int`, `long`, `double`, `bool`, `string` |
   | Arrays | `int[]`, `long[]`, `double[]`, `string[]`, `int[][]` |
   | Return only | `void`: the function changes its first argument in place, and that argument is printed after the call |

2. Click **Generate starter & drivers**. This writes, for each language:
   - **Starter code:** the stub students begin from. You can edit it.
   - **Driver:** a hidden full program that reads the arguments, calls the student's function and prints the result. The student's code replaces `@@USER_CODE@@`. You can edit the driver, but keep the marker.
3. Add tests, one **argument per line**, in LeetCode notation:

   ```text
   input                 expected output
   [2,7,11,15]           [0,1]
   9
   ```

   | Value | Notation |
   |---|---|
   | Numbers | `9`, `-3`, `2.5` |
   | Booleans | `true`, `false` |
   | Strings | `"abc"` (escapes `\" \\ \n \t`) |
   | Arrays | `[1,2,3]`, `["a","b"]`, `[[1,2],[3]]` |

   Output uses the same notation without spaces. Doubles always print 5 decimals, for example `2.50000`. Expected outputs can be pasted directly from LeetCode examples, except doubles, which need 5 decimals.

4. Save and check a reference solution in each language.

What students write for `twoSum(nums: int[], target: int) → int[]` in each language:

| Language | Signature |
|---|---|
| C | `int* twoSum(int* nums, int numsSize, int target, int* returnSize)`, returning a `malloc`'d array and setting `*returnSize` |
| C++ | `class Solution { public: vector<int> twoSum(vector<int>& nums, int target) { … } };` |
| Java | `class Solution { public int[] twoSum(int[] nums, int target) { … } }` (imports go above the class) |
| Python | `class Solution:` containing `def twoSum(self, nums: List[int], target: int) -> List[int]:` |

In C, an `int[][]` parameter arrives as `int** x, int xSize, int* xColSize`. Returning one needs `int* returnSize, int** returnColumnSizes`, as on LeetCode.

Compiler messages count lines of the whole program, driver included.

## Moving questions between subjects or installations

- **Export:** in the question bank, use **Export** on a question card, or **Export N** for everything in the current filter. You get a JSON file with every field, including hidden tests and drivers, so treat it like an answer key.
- **Import:** **Import JSON** asks for a target subject and shows a preview, then imports all of the questions or none. Errors are listed per question.

The file format:

```json
{
  "format": "rvce-hub/questions@1",
  "questions": [
    {
      "type": "code",
      "text": "Two Sum\nReturn the indices of the two numbers that add up to target.",
      "marks": 10,
      "difficulty": "easy",
      "topic": "Arrays",
      "code": {
        "mode": "function",
        "signature": { "name": "twoSum", "params": [{ "name": "nums", "type": "int[]" }, { "name": "target", "type": "int" }], "returns": "int[]" },
        "languages": ["c", "cpp", "java", "python"],
        "starter": { "python": "…" },
        "drivers": { "python": "import sys\n…\n@@USER_CODE@@\n…" },
        "timeLimitMs": 2000,
        "memoryLimitMb": 256,
        "comparison": "trim",
        "practice": true,
        "testCases": [
          { "input": "[2,7,11,15]\n9", "expectedOutput": "[0,1]", "weight": 1, "hidden": false },
          { "input": "[3,2,4]\n6", "expectedOutput": "[1,2]", "weight": 1, "hidden": true }
        ]
      }
    }
  ]
}
```

Other question types use the same file:

| Type | Fields |
|---|---|
| MCQ | `"type": "single"`, `options: [{ "key": "A", "text": "…" }, …]`, `correctAnswer: "B"` |
| Fill-in | `"type": "fill_blank"`, `correctAnswer: "Queue"` |

A file with a bare list of questions (`[ … ]`) is also accepted. One import takes at most 100 questions.

The API endpoints are `GET /api/questions/export?ids=…` and `POST /api/questions/bulk`; see [API.md](API.md).

## Copyright

Write your own statements, or use problems you have permission to reuse. LeetCode and HackerRank problem text and hidden tests are not free to copy.
