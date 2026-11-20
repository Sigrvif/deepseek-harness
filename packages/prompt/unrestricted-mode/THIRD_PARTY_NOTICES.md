# Third-party notices

This package's `src/text.ts` is a verbatim port of the execution-mode texts of

- **dsh-unrestricted** v0.2.10 — https://github.com/yexi-by/dsh-unrestricted (MIT License, Copyright (c) 2026 yexi-by), file `src/rules.js`, which states in its own third-party notices that the prompt rule structure was adapted from

- **codex-keysmith** — https://github.com/Jia-Ethan/codex-keysmith (MIT License), file `examples/gpt-unrestricted.md`.

Both projects are released under the MIT License. The full MIT license text is reproduced below as required by the license.

```
MIT License

Copyright (c) <year> <copyright holders>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The fusion logic in `src/fuse.ts` is an adapted port of dsh-unrestricted's `fuseSections` (same source repository, same license). The harness integration (`src/index.ts`), package scaffolding, and documentation are DSLRH's own.
