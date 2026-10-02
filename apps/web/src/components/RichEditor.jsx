import { useEffect, useRef } from 'react';

const ACTIONS = [
  ['bold', 'Bold', () => document.execCommand('bold')],
  ['italic', 'Italic', () => document.execCommand('italic')],
  ['underline', 'Underline', () => document.execCommand('underline')],
  ['h2', 'H2', () => document.execCommand('formatBlock', false, 'h2')],
  ['p', 'P', () => document.execCommand('formatBlock', false, 'p')],
  ['ul', '• List', () => document.execCommand('insertUnorderedList')],
  ['ol', '1. List', () => document.execCommand('insertOrderedList')],
  [
    'link',
    'Link',
    () => {
      const url = window.prompt('Link URL');
      if (url) document.execCommand('createLink', false, url);
    }
  ]
];

export default function RichEditor({ value = '', onChange, placeholder = 'Write content…', minHeight = 180 }) {
  const ref = useRef(null);
  const last = useRef('');

  useEffect(() => {
    if (!ref.current) return;
    const next = value || '';
    // Always sync when parent value changes (e.g. settings loaded from API)
    if (next !== last.current && next !== ref.current.innerHTML) {
      ref.current.innerHTML = next;
      last.current = next;
    }
  }, [value]);

  function emit() {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    last.current = html;
    onChange?.(html);
  }

  return (
    <div className="rich-editor">
      <div className="rich-editor__toolbar">
        {ACTIONS.map(([key, label, run]) => (
          <button
            key={key}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              run();
              emit();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        className="rich-editor__surface"
        style={{ minHeight }}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
      />
    </div>
  );
}
