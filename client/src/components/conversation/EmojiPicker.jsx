// Lazy wrapper rond emoji-mart. De volledige emoji-dataset is honderden KB's — die hoort
// niet in de main bundle maar wordt pas geladen wanneer de gebruiker de picker echt opent.
import Picker from '@emoji-mart/react';
import emojiData from '@emoji-mart/data';

export default function EmojiPicker({ onEmojiSelect }) {
  return (
    <Picker
      data={emojiData}
      onEmojiSelect={onEmojiSelect}
      theme="light"
      locale="nl"
      previewPosition="none"
      skinTonePosition="none"
      navPosition="top"
      autoFocus
    />
  );
}
