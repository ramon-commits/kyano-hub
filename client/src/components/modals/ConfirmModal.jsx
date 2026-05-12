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
            className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => { onConfirm?.(); onClose?.(); }}
            className={
              isDanger
                ? 'rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700'
                : 'rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700'
            }
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {message ? <p className="px-6 py-4 text-sm text-gray-600">{message}</p> : null}
    </Modal>
  );
}
