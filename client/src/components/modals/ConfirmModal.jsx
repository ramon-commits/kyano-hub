import Modal from './Modal.jsx';

export default function ConfirmModal({ open, onClose, onConfirm, title = 'Weet je het zeker?', message, confirmLabel = 'Bevestigen', cancelLabel = 'Annuleren', variant = 'primary' }) {
  const isDanger = variant === 'danger';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => { onConfirm?.(); onClose?.(); }}
            className={
              isDanger
                ? 'rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700'
                : 'rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700'
            }
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {message ? <p className="px-5 py-4 text-sm text-gray-600 leading-relaxed">{message}</p> : null}
    </Modal>
  );
}
