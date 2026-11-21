import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { useTheme } from '../../context/ThemeContext.jsx';

const languageSupport = { c: cpp, cpp, java, python };

const baseTheme = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--code-font-size, 14px)' },
  '.cm-scroller': {
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    lineHeight: '1.55',
  },
  '.cm-content': { paddingBottom: '2rem' },
  '&.cm-focused': { outline: 'none' },
});
const lightTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'rgb(var(--c-surface))' },
    '.cm-gutters': { backgroundColor: 'rgb(var(--c-surface-2))', border: 'none' },
  },
  { dark: false },
);

/**
 * CodeMirror 6 editor. Controlled by `value`/`onChange`, with the language, theme and
 * read-only state swapped in place so the cursor and history survive.
 * The wrapper carries data-code-editor so exam proctoring allows copy/paste inside it.
 */
export function CodeEditor({
  value,
  onChange,
  language = 'cpp',
  readOnly = false,
  minHeight = '18rem',
  height,
  ariaLabel = 'Code editor',
  className = '',
}) {
  const host = useRef(null);
  const view = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const { theme } = useTheme();
  const compartments = useRef({
    lang: new Compartment(),
    theme: new Compartment(),
    readOnly: new Compartment(),
  });

  useEffect(() => {
    const c = compartments.current;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value ?? '',
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          indentUnit.of('    '),
          EditorState.tabSize.of(4),
          baseTheme,
          c.lang.of((languageSupport[language] || cpp)()),
          c.theme.of(theme === 'dark' ? oneDark : lightTheme),
          c.readOnly.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          EditorView.contentAttributes.of({
            'aria-label': ariaLabel,
            spellcheck: 'false',
            autocorrect: 'off',
            autocapitalize: 'off',
          }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // The editor is created once; props below are applied through compartments.
  }, []);

  useEffect(() => {
    view.current?.dispatch({
      effects: compartments.current.lang.reconfigure((languageSupport[language] || cpp)()),
    });
  }, [language]);
  useEffect(() => {
    view.current?.dispatch({
      effects: compartments.current.theme.reconfigure(theme === 'dark' ? oneDark : lightTheme),
    });
  }, [theme]);
  useEffect(() => {
    view.current?.dispatch({
      effects: compartments.current.readOnly.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);
  // Replace the document only when it changed from outside (language switch, reset, load).
  useEffect(() => {
    const v = view.current;
    if (v && value !== undefined && value !== v.state.doc.toString())
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  return (
    <div
      ref={host}
      data-code-editor
      className={`flex flex-col overflow-hidden rounded-xl border border-border bg-surface [&>.cm-editor]:flex-1 ${className}`}
      style={{ minHeight, height }}
    />
  );
}

export default CodeEditor;
