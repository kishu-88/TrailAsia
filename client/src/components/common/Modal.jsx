import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import Button from './Button.jsx';

/**
 * Dialog for forms and confirmations.
 *
 * Closes on Escape and on a backdrop click, moves focus inside on open, and
 * stops the page behind it scrolling. Rendered through a portal so it is not
 * trapped by a parent's overflow or stacking context.
 */
export default function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = 'medium',
}) {
  const panelRef = useRef(null);

  // Read through a ref rather than depending on `onClose` directly: callers
  // commonly pass an inline arrow function, which gets a new identity on
  // every render of the parent — including the re-render every keystroke
  // causes in a controlled form. If the effect below depended on `onClose`,
  // typing a single character would re-run it and re-focus the modal's
  // first focusable element (the header's close button), yanking focus out
  // of whatever field the person was typing in.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current?.();
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the first control in the body (not the header) so keyboard users
    // land on the form itself rather than the close button. This only runs
    // once per open, since `open` is the sole dependency.
    const focusable = panelRef.current?.querySelector(
      '.modal__body input, .modal__body select, .modal__body textarea, .modal__body button, .modal__body [href]'
    );
    focusable?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        // Only a click that starts on the backdrop closes it — otherwise
        // selecting text inside and releasing outside would dismiss the form.
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className={`modal modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panelRef}
      >
        <header className="modal__header">
          <div>
            <h2 className="modal__title">{title}</h2>
            {description && <p className="muted">{description}</p>}
          </div>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="modal__body">{children}</div>

        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}

/** Yes/no dialog for destructive or irreversible actions. */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'danger',
  loading = false,
  onConfirm,
  onClose,
  children,
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      size="small"
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message && <p>{message}</p>}
      {children}
    </Modal>
  );
}
