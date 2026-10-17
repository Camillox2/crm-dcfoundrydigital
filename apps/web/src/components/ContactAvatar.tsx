import { useState } from 'react';

export function ContactAvatar({
  name,
  photoUrl,
  index = 0,
}: {
  name: string;
  photoUrl?: string | null;
  index?: number;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const safe = photoUrl && /^https:\/\//i.test(photoUrl) && failedUrl !== photoUrl;
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <span className={`initials initials-${index % 4} contact-avatar`} aria-hidden="true">
      {safe ? (
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(photoUrl)}
        />
      ) : (
        initials
      )}
    </span>
  );
}
